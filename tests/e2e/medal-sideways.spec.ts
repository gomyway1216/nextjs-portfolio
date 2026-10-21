import { test, expect, type Browser, type Page } from './fixtures';

import { numbersFor as mazeNumbers, type Draw as MazeDraw } from '../../src/components/game/CoinMaze/engine';
import { BEST_LEFT, LEND_BALLS, numbersForBall, type BallDraw } from '../../src/components/game/Pachinko/engine';
import { SESSION_KEY, parseSession } from '../../src/components/game/Pachinko/medalTable';
import { MARBLES, numbersFor as smartNumbers, slotFor } from '../../src/components/game/SmartBall/engine';
import { CORKS, numbersFor as galleryNumbers, type Draw as GalleryDraw } from '../../src/components/game/ShootingGallery/engine';
import { instantScroll } from './instantScroll';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// A phone held sideways (844 × 390, 667 × 375): the tall machines (Hot Spring Smart Ball, Candy Shop Medal Maze,
// Goldfish Lantern Pachinko, Cherry Blossom Carousel, Onsen Shooting Gallery) lay out in two columns, the board at the left as tall as the screen allows under the
// site's toolbar, and the badge, the status line, the counters and the controls in a column at the right, all on the
// screen at once. Narrowed over its controls as on a phone held upright, the Smart Ball's board and the Maze's case
// came to 85 to 139 px wide, their numbers 3 to 5 px; the pachinko's board, the cabinet's full width, was taller than
// the screen, its top and its handle never on it together. The floor's API answers at once (fixtures.ts); nothing
// reaches a real server.

/** The site's toolbar over the page, and the room the play area leaves under it. */
const TOOLBAR = 62;

interface Machine {
  name: string;
  path: string;
  board: string;
  /** The controls in the column beside the board, START (or DROP) first. */
  column: string[];
  /** The badge beside the board, and the one on the board it stands in for (the machines that have one). */
  side?: string;
  onBoard?: string;
  /** What it reaches, at the least, for its smallest label on the board (at 667 × 375): the boards drawn in SVG. */
  smallest?: number;
  /** Brings the play area on screen as a press brings it (the first time, before a play; again, after a reload). */
  bring?: (page: Page, first: boolean) => Promise<void>;
  /** Plays one play through, from the press, calling `seen` at every step. */
  play: (page: Page, seen: () => Promise<void>) => Promise<void>;
  /** What the page shows after a reload in the middle of the play, or after it. */
  afterReload: (page: Page, language: 'en' | 'ja') => Promise<void>;
}

/** The play area centred under the toolbar, where START (or DROP) brings it. */
const centred = (board: string) => async (page: Page) => {
  await page.getByTestId(board).evaluate((el) => (el.parentElement as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' }));
  // Measured from where the page comes to rest: Firefox lands a centre on a half pixel at one whole pixel, and moves it to
  // the other a frame later (the shooting gallery's play area, 305 px tall at 667 × 375, went from 349 to 348).
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = window.scrollY;
        let still = 0;
        const tick = () => {
          still = window.scrollY === last ? still + 1 : 0;
          last = window.scrollY;
          if (still >= 3) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
};

/** The badge over a play from before, beside the board, not on it. */
const badgeBeside = (side: string, onBoard: string) => async (page: Page, language: 'en' | 'ja') => {
  await expect(page.getByTestId(side)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(side)).toHaveText(language === 'en' ? /Last play|Finished from before/ : /前回のプレイ|前のプレイの続き/);
  await expect(page.getByTestId(onBoard)).toBeHidden();
};

/** Smart Ball: a play drawn so every marble, shot at the middle strength, goes OUT; ten shots. */
async function smartPlay(page: Page, seen: () => Promise<void>) {
  const machine = page.getByTestId('smb-machine');
  await rigPresses(page, smartNumbers({ drops: Array.from({ length: MARBLES }, () => slotFor(3, null)), blinds: Array.from({ length: MARBLES }, () => 3) }));
  await page.getByTestId('smb-start').click();
  for (let m = 0; m < MARBLES; m++) {
    await expect(machine).toHaveAttribute('data-marble', String(m), { timeout: 10_000 });
    await expect(machine).toHaveAttribute('data-phase', 'aim', { timeout: 10_000 });
    await seen();
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const box = document.querySelector('[data-testid="smb-board"]')!;
          const plunger = document.querySelector<HTMLButtonElement>('[data-testid="smb-plunger"]')!;
          const timer = window.setTimeout(() => reject(new Error('strength 3 never came in 6 s')), 6_000);
          const observer = new MutationObserver(() => {
            if (box.getAttribute('data-window') !== '3') return;
            observer.disconnect();
            window.clearTimeout(timer);
            plunger.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, isPrimary: true, button: 0, bubbles: true }));
            resolve();
          });
          observer.observe(box, { attributes: true, attributeFilter: ['data-window'] });
          plunger.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, isPrimary: true, button: 0, bubbles: true }));
        }),
    );
  }
  await expect(machine).toHaveAttribute('data-phase', 'idle', { timeout: 15_000 });
}

/**
 * Medal Maze: every gate on its first setting, flicked as it opens; the pins as drawn.
 *
 * A gate is flicked in its first open window that starts at least 650 ms after the last flick. With less motion the
 * medal is in the next cup at once, and the next gate opens two windows (600 ms) after the flick: a click there is
 * within the machine's 600 ms in which a click is taken for the press just made (SAME_PRESS_MS in PlayTab.tsx), and
 * was dropped or not by a fraction of a millisecond (599 ms dropped, 601 ms not; Firefox 5 runs in 6, WebKit 1 in 6),
 * and the medal then waited out its time and dropped OUT.
 */
async function mazePlay(page: Page, seen: () => Promise<void>) {
  const machine = page.getByTestId('cm-machine');
  const draw: MazeDraw = { gates: [0, 0, 0, 0], phases: [0, 0, 0, 0], wobbles: [true, true, true, true], blinds: [1, 1, 1, 1], pins: [true, true, true, true] };
  await rigPresses(page, mazeNumbers(draw));
  await page.getByTestId('cm-drop').click();
  await expect(machine).not.toHaveAttribute('data-phase', 'idle', { timeout: 10_000 });
  for (let stage = 0; stage < 4; stage++) {
    // The medal waits at its next gate; or the play is over (a flick that met the gate turning shut sends the medal
    // OUT, as a browser under load may flick a moment late): either way the play area is looked at again.
    const state = async () => `${await machine.getAttribute('data-phase')}:${await machine.getAttribute('data-stage')}`;
    await expect.poll(state, { timeout: 10_000 }).toMatch(new RegExp(`^(wait:${stage}|idle:.*)$`));
    await seen();
    if ((await machine.getAttribute('data-phase')) === 'idle') return;
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const box = document.querySelector('[data-testid="cm-board"]')!;
          const lever = document.querySelector<HTMLButtonElement>('[data-testid="cm-lever"]')!;
          const timer = window.setTimeout(() => reject(new Error('no open window in 6 s')), 6_000);
          const kept = window as unknown as { __lastFlick?: number };
          const observer = new MutationObserver(() => {
            if (box.getAttribute('data-slot') !== 'open') return;
            if (performance.now() - (kept.__lastFlick ?? -Infinity) < 650) return;
            observer.disconnect();
            window.clearTimeout(timer);
            kept.__lastFlick = performance.now();
            lever.click();
            resolve();
          });
          observer.observe(box, { attributes: true, attributeFilter: ['data-window'] });
        }),
    );
  }
  await expect(machine).toHaveAttribute('data-phase', 'idle', { timeout: 15_000 });
}

// ── Goldfish Lantern Pachinko ──

const pachinkoSession = async (page: Page) => parseSession(await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY));
/** A ball into the ヘソ at strength 3 whose hold is a hit in any mode, 4 rounds and ST, a normal reach (pachinko.spec.ts). */
const HIT: BallDraw = { fate: 0, lot: 0, split: 10, show: 0, seed: 1 };

/** LEND (with `balls` drawn first): the press brings the board and its column on screen itself. */
async function lendPachinko(page: Page, balls: BallDraw[] = []) {
  await rigPresses(page, balls.flatMap(numbersForBall));
  const before = (await pachinkoSession(page))?.tray ?? 0;
  await pressUntil(page.getByTestId('pk-lend'), async () => ((await pachinkoSession(page))?.tray ?? 0) >= before + LEND_BALLS);
  await page.waitForTimeout(300);
}

/** Turns the handle to strength `to` by − and + beside it. */
async function turnPachinko(page: Page, to: number) {
  const machine = page.getByTestId('pk-machine');
  for (let i = 0; i < 8; i++) {
    const now = Number(await machine.getAttribute('data-strength'));
    if (now === to) return;
    await page.getByTestId(now < to ? 'pk-harder' : 'pk-softer').click();
  }
  await expect(machine).toHaveAttribute('data-strength', String(to));
}

/** Holds the handle for `ms`, by pointer events on it, as pachinko.spec.ts does. */
const holdPachinko = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<void>((resolve) => {
        const handle = document.querySelector('[data-testid="pk-handle"]')!;
        handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 21, isPrimary: true, button: 0, bubbles: true }));
        window.setTimeout(() => {
          handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 21, isPrimary: true, button: 0, bubbles: true }));
          resolve();
        }, ms);
      }),
    ms,
  );

/** A rigged hit: the reach, Skip to its fanfare calling 右打ち, Skip to the first round, a round played at 6. */
async function pachinkoPlay(page: Page, seen: () => Promise<void>) {
  const machine = page.getByTestId('pk-machine');
  await turnPachinko(page, BEST_LEFT);
  await seen();
  await holdPachinko(page, 300);
  await expect(machine).toHaveAttribute('data-spin', 'nr', { timeout: 5_000 });
  await seen();
  // The reach: the status line says so.
  await expect(machine).toHaveAttribute('data-phase', '1', { timeout: 15_000 });
  await seen();
  await page.getByTestId('pk-skip').click();
  await expect(machine).toHaveAttribute('data-stage', 'fanfare', { timeout: 5_000 });
  await expect(page.getByTestId('pk-right-sign')).toBeVisible();
  await seen();
  await page.getByTestId('pk-skip').click();
  await expect(machine).toHaveAttribute('data-stage', 'open', { timeout: 5_000 });
  await turnPachinko(page, 5);
  await seen();
  await holdPachinko(page, 2_500);
  await expect(machine).toHaveAttribute('data-round', /\d/);
  await seen();
}

// ── Cherry Blossom Carousel ──

/** DROP pressed until a medal is fed (the slot filled from the medals first): the press brings the field and its column on screen itself. */
async function dropCarousel(page: Page) {
  const machine = page.getByTestId('cp-machine');
  const fed = async () => Number(await machine.getAttribute('data-fed'));
  const before = await fed();
  await pressUntil(page.getByTestId('cp-drop'), async () => (await fed()) > before);
  await page.waitForTimeout(300);
}

/** Three more medals dropped, the machine played on while they come down. */
async function carouselPlay(page: Page, seen: () => Promise<void>) {
  const machine = page.getByTestId('cp-machine');
  await seen();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('cp-drop').click();
    await page.waitForTimeout(400);
    await seen();
  }
  await expect(machine).toHaveAttribute('data-resting', 'false');
  await seen();
  await page.waitForTimeout(1_500);
  await seen();
}

// ── Onsen Shooting Gallery ──

/** Shooting gallery: a play drawn so every cork misses, whatever it is fired at; six corks at the sight's top edge. */
async function galleryPlay(page: Page, seen: () => Promise<void>) {
  const machine = page.getByTestId('sht-machine');
  const draw: GalleryDraw = { slots: Array.from({ length: CORKS }, () => 63), picks: Array.from({ length: CORKS }, () => 0), bands: Array.from({ length: CORKS }, () => 1) };
  await rigPresses(page, galleryNumbers(draw));
  await page.getByTestId('sht-start').click();
  for (let c = 0; c < CORKS; c++) {
    await expect(machine).toHaveAttribute('data-cork', String(c), { timeout: 10_000 });
    await expect(machine).toHaveAttribute('data-phase', 'aim', { timeout: 10_000 });
    await seen();
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const stage = document.querySelector('[data-testid="sht-stage"]')!;
          const fire = document.querySelector<HTMLButtonElement>('[data-testid="sht-fire"]')!;
          const timer = window.setTimeout(() => reject(new Error('the top edge never came in 6 s')), 6_000);
          const press = () => {
            window.clearTimeout(timer);
            fire.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 12, isPrimary: true, button: 0, bubbles: true }));
            resolve();
          };
          if (stage.getAttribute('data-band') === '1') return press();
          const observer = new MutationObserver(() => {
            if (stage.getAttribute('data-band') !== '1') return;
            observer.disconnect();
            press();
          });
          observer.observe(stage, { attributes: true, attributeFilter: ['data-band'] });
        }),
    );
  }
  await expect(machine).toHaveAttribute('data-phase', 'idle', { timeout: 15_000 });
}

const MACHINES: Machine[] = [
  {
    name: 'smart-ball',
    path: '/games/smart-ball',
    board: 'smb-board',
    column: ['smb-start', 'smb-skip', 'smb-plunger', 'smb-status'],
    side: 'smb-resumed-side',
    onBoard: 'smb-resumed',
    smallest: 7,
    play: smartPlay,
    afterReload: badgeBeside('smb-resumed-side', 'smb-resumed'),
  },
  {
    name: 'coin-maze',
    path: '/games/coin-maze',
    board: 'cm-board',
    column: ['cm-drop', 'cm-lever', 'cm-skip', 'cm-status', 'cm-medals-led', 'cm-win-led'],
    side: 'cm-resumed-side',
    onBoard: 'cm-resumed',
    smallest: 7,
    play: mazePlay,
    afterReload: badgeBeside('cm-resumed-side', 'cm-resumed'),
  },
  {
    name: 'pachinko',
    path: '/games/pachinko',
    board: 'pk-board',
    // The status line, the handle with − and +, the strength, LEND, COUNT and Skip, and the counters.
    column: ['pk-status', 'pk-handle', 'pk-softer', 'pk-harder', 'pk-strength-select', 'pk-lend', 'pk-count', 'pk-skip', 'pk-medals-led'],
    bring: (page, first) => lendPachinko(page, first ? [HIT] : []),
    play: pachinkoPlay,
    // Left in the middle of the hit, its rounds are played out at 6: ST, and the status line says so.
    afterReload: async (page) => {
      await expect(page.getByTestId('pk-machine')).toHaveAttribute('data-mode', 'st', { timeout: 20_000 });
      await expect(page.getByTestId('pk-machine')).toHaveAttribute('data-stage', '');
    },
  },
  {
    name: 'carousel-pusher',
    path: '/games/carousel-pusher',
    board: 'cp-stage',
    // The counter over the field and the dish's jackpot, the status line, DROP and RETURN, and the counters.
    column: ['cp-drop', 'cp-return', 'cp-panel', 'cp-status', 'cp-medals-led'],
    bring: (page) => dropCarousel(page),
    play: carouselPlay,
    // The slot's medals and the field are where they were.
    afterReload: async (page) => {
      await expect(page.getByTestId('cp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
      await expect(page.getByTestId('cp-machine')).not.toHaveAttribute('data-credit', '0');
    },
  },
  {
    name: 'shooting-gallery',
    path: '/games/shooting-gallery',
    board: 'sht-stage',
    column: ['sht-start', 'sht-skip', 'sht-fire', 'sht-status'],
    side: 'sht-resumed-side',
    onBoard: 'sht-resumed',
    smallest: 7,
    play: galleryPlay,
    afterReload: badgeBeside('sht-resumed-side', 'sht-resumed'),
  },
];

async function sideways(browser: Browser, width: number, height: number, language: 'en' | 'ja', path: string) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await instantScroll(context);
  const page = await context.newPage();
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto(path))?.status()).toBe(200);
  await arrived(page);
  return { context, page };
}

for (const m of MACHINES) {
  for (const [width, height] of [
    [844, 390],
    [667, 375],
  ] as const) {
    test(`${m.name} held sideways at ${width} × ${height}: the board at the left as tall as the screen allows, the controls beside it, all on screen at once, and nothing moves through a play`, async ({ browser }) => {
      test.setTimeout(150_000);
      for (const language of ['en', 'ja'] as const) {
        const where = `${m.name} ${width} × ${height} ${language}`;
        const { context, page } = await sideways(browser, width, height, language, m.path);
        await expect(page.locator('[data-playable="true"]')).toHaveCount(1, { timeout: 20_000 });
        const board = page.getByTestId(m.board);
        // Where the press brings it: the play area centred under the toolbar.
        const bring = m.bring ?? centred(m.board);
        await bring(page, true);
        const layout = () =>
          page.evaluate(
            ({ board, column, side }) => {
              // A part the page does not have is nowhere: the checks below say so.
              const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? new DOMRect(-1, -1, 0, 0);
              const b = box(board);
              return {
                board: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height },
                column: [...column, ...(side ? [side] : [])].map((id) => ({ id, left: box(id).left, right: box(id).right, top: box(id).top, bottom: box(id).bottom, width: box(id).width, height: box(id).height })),
                page: Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((p) => p.scrollWidth)),
                inner: window.innerHeight,
                scroll: window.scrollY,
              };
            },
            { board: m.board, column: m.column, side: m.side },
          );
        const at = await layout();
        expect(at.page, `${where}: sideways scroll`).toBeLessThanOrEqual(width);
        // The board: as tall as the screen allows under the toolbar, and wholly on it.
        expect(at.board.height, `${where}: the board's height`).toBeGreaterThanOrEqual(at.inner - TOOLBAR - 30);
        expect(at.board.top, `${where}: the board under the toolbar`).toBeGreaterThanOrEqual(TOOLBAR - 4);
        expect(at.board.bottom, `${where}: the board on screen`).toBeLessThanOrEqual(at.inner + 1);
        // The column: beside the board, every part of it on screen with it; the controls a thumb's size.
        for (const part of at.column) {
          expect(part.left, `${where}: ${part.id} beside the board`).toBeGreaterThanOrEqual(at.board.right);
          expect(part.top, `${where}: ${part.id} under the toolbar`).toBeGreaterThanOrEqual(TOOLBAR - 4);
          expect(part.bottom, `${where}: ${part.id} on screen`).toBeLessThanOrEqual(at.inner + 1);
          if (!/status|led|side/.test(part.id)) expect(Math.min(part.width, part.height), `${where}: ${part.id}`).toBeGreaterThanOrEqual(44);
        }
        // The board's labels: as big as the screen's height lets them be (the board is 436 to 470 units tall, and a
        // phone held sideways has 300 to 320 px for it; 11 px would need half as much again).
        if (m.smallest !== undefined) {
          const smallest = await board.evaluate((el) =>
            Math.min(...[...el.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * (t.ownerSVGElement!.getBoundingClientRect().width / t.ownerSVGElement!.viewBox.baseVal.width))),
          );
          expect(smallest, `${where}: the board's smallest label`).toBeGreaterThanOrEqual(m.smallest);
        }
        // A board painted on a canvas: as many pixels as it is shown at (at most two to a CSS pixel), not stretched.
        const canvas = await board.evaluate((el) => {
          const c = el.querySelector('canvas');
          return c ? { width: c.width, shown: c.getBoundingClientRect().width, ratio: Math.min(2, window.devicePixelRatio || 1) } : null;
        });
        if (canvas) expect(canvas.width, `${where}: the canvas's pixels`).toBe(Math.max(1, Math.round(canvas.shown * canvas.ratio)));
        // A play through: nothing in the play area moves, and the page does not scroll.
        const before = JSON.stringify(at);
        const seen = new Set<string>([before]);
        await m.play(page, async () => {
          seen.add(JSON.stringify(await layout()));
        });
        seen.add(JSON.stringify(await layout()));
        expect([...seen], `${where}: the play area through a play`).toEqual([before]);
        // Back to the page after a reload (a badge beside the board, where its place was kept; the pachinko in ST): the
        // column is where it was.
        await page.reload();
        await arrived(page);
        await m.afterReload(page, language);
        await bring(page, false);
        const after = await layout();
        // Where the parts stand on the page (a browser may scroll the page to a whole pixel either side).
        const onPage = (l: typeof at) => JSON.stringify(l.column.map((c) => ({ ...c, top: c.top + l.scroll, bottom: c.bottom + l.scroll })));
        expect(onPage(after), `${where}: the column after a reload`).toBe(onPage(at));
        await context.close();
      }
    });
  }
}

test('held upright or on a desk, the tall machines keep the board over its controls, the badge on the board', async ({ browser }) => {
  test.setTimeout(60_000);
  for (const m of MACHINES) {
    for (const [width, height] of [
      [375, 812],
      [1280, 800],
    ] as const) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768 });
      const page = await context.newPage();
      await page.goto(m.path);
      await arrived(page);
      if (m.side) await expect(page.getByTestId(m.side)).toBeHidden();
      const [board, start] = await Promise.all([page.getByTestId(m.board).boundingBox(), page.getByTestId(m.column[0]).boundingBox()]);
      expect(start!.y, `${m.name} ${width} × ${height}: the controls under the board`).toBeGreaterThan(board!.y + board!.height);
      await context.close();
    }
  }
});

test('pachinko held sideways: the handle beside the board holds with the mouse, with Space, and with a finger', async ({ browser, browserName }) => {
  test.setTimeout(90_000);
  /** The balls fired this visit, as the machine counts them as it fires each one. */
  const fired = async (page: Page) => Number((await page.getByTestId('pk-stat-fired').textContent()) ?? '0');
  // The mouse and Space, on a page with no touch (Firefox's touch emulation sends a click no pointer events).
  {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' });
    await instantScroll(context);
    const page = await context.newPage();
    await page.goto('/games/pachinko');
    await arrived(page);
    await expect(page.getByTestId('pk-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    await lendPachinko(page);
    const lent = await fired(page);
    // The mouse held down on the handle where it stands, beside the board.
    const handle = (await page.getByTestId('pk-handle').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId('pk-handle')).toHaveAttribute('data-held', 'true');
    await page.waitForTimeout(1_300);
    await page.mouse.up();
    await expect(page.getByTestId('pk-handle')).toHaveAttribute('data-held', 'false');
    await expect.poll(() => fired(page), { message: 'balls fired by the mouse' }).toBeGreaterThan(lent);
    // Space held down, with nothing focused.
    const before = await fired(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.down(' ');
    await expect(page.getByTestId('pk-handle')).toHaveAttribute('data-held', 'true');
    await page.waitForTimeout(1_300);
    await page.keyboard.up(' ');
    await expect(page.getByTestId('pk-handle')).toHaveAttribute('data-held', 'false');
    await expect.poll(() => fired(page), { message: 'balls fired by Space' }).toBeGreaterThan(before);
    await context.close();
  }
  // A finger held on the handle (a touch the browser hit-tests where it lands: Chromium's own touch events).
  if (browserName === 'chromium') {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await instantScroll(context);
    const page = await context.newPage();
    await page.goto('/games/pachinko');
    await arrived(page);
    await expect(page.getByTestId('pk-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    await lendPachinko(page);
    const lent = await fired(page);
    const handle = (await page.getByTestId('pk-handle').boundingBox())!;
    const at = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
    await expect(page.getByTestId('pk-handle')).toHaveAttribute('data-held', 'true');
    await page.waitForTimeout(1_300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByTestId('pk-handle')).toHaveAttribute('data-held', 'false');
    await expect.poll(() => fired(page), { message: 'balls fired by a finger' }).toBeGreaterThan(lent);
    await context.close();
  }
});

test('pachinko turned from upright to sideways paints its canvas afresh at its new size, its screen and lamps over the same places', async ({ browser }) => {
  test.setTimeout(60_000);
  const look = (page: Page) =>
    page.getByTestId('pk-board').evaluate((board) => {
      const canvas = board.querySelector('canvas')!;
      const c = canvas.getBoundingClientRect();
      const screen = board.querySelector('[data-testid="pk-lcd"]')!.getBoundingClientRect();
      // The picture, summed up: every pixel of it, weighed by its place.
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum = (sum * 31 + data[i]) % 1_000_000_007;
      return {
        pixels: [canvas.width, canvas.height],
        wanted: Math.max(1, Math.round(c.width * Math.min(2, window.devicePixelRatio || 1))),
        // Where the screen over the canvas stands, as a share of the canvas: the same at any size.
        screen: [(screen.left - c.left) / c.width, (screen.top - c.top) / c.height, screen.width / c.width],
        sum,
      };
    });
  const open = async (width: number, height: number) => {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/games/pachinko');
    await arrived(page);
    await expect(page.getByTestId('pk-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    await page.waitForTimeout(500);
    return { context, page };
  };
  // A page opened sideways: the picture to come to.
  const sideways = await open(844, 390);
  const opened = await look(sideways.page);
  expect(opened.pixels[0]).toBe(opened.wanted);
  await sideways.context.close();
  // A page opened upright, then turned.
  const { context, page } = await open(390, 844);
  const upright = await look(page);
  expect(upright.pixels[0]).toBe(upright.wanted);
  await page.setViewportSize({ width: 844, height: 390 });
  // Painted afresh at its new size: the same picture as the page opened sideways, not the upright one stretched.
  await expect.poll(async () => (await look(page)).pixels).toEqual(opened.pixels);
  await expect.poll(async () => (await look(page)).sum, { message: 'the turned canvas painted as one opened sideways' }).toBe(opened.sum);
  const turned = await look(page);
  expect(turned.pixels[0], 'fewer pixels for the smaller board').toBeLessThan(upright.pixels[0]);
  turned.screen.forEach((share, i) => expect(share, 'the screen over the same place on the board').toBeCloseTo(upright.screen[i], 2));
  await context.close();
});
