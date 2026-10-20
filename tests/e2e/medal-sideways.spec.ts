import { test, expect, type Browser, type Page } from './fixtures';

import { numbersFor as mazeNumbers, type Draw as MazeDraw } from '../../src/components/game/CoinMaze/engine';
import { MARBLES, numbersFor as smartNumbers, slotFor } from '../../src/components/game/SmartBall/engine';
import { instantScroll } from './instantScroll';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// A phone held sideways (844 × 390, 667 × 375): the tall machines (Hot Spring Smart Ball, Candy Shop Medal Maze) lay
// out in two columns, the board at the left as tall as the screen allows under the site's toolbar, and the badge, the
// status line, the counters and the controls in a column at the right, all on the screen at once. Narrowed over its
// controls as on a phone held upright, the board came to 85 to 139 px wide, its numbers 3 to 5 px. The floor's API
// answers at once (fixtures.ts); nothing reaches a real server.

/** The site's toolbar over the page, and the room the play area leaves under it. */
const TOOLBAR = 62;

interface Machine {
  name: string;
  path: string;
  board: string;
  /** The controls in the column beside the board, START (or DROP) first. */
  column: string[];
  /** The badge beside the board, and the one on the board it stands in for. */
  side: string;
  onBoard: string;
  /** What it reaches, at the least, for its smallest label on the board (at 667 × 375). */
  smallest: number;
  /** Plays one play through, from the press, calling `seen` at every step. */
  play: (page: Page, seen: () => Promise<void>) => Promise<void>;
}

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

/** Medal Maze: every gate on its first setting, flicked as it opens; the pins as drawn. */
async function mazePlay(page: Page, seen: () => Promise<void>) {
  const machine = page.getByTestId('cm-machine');
  const draw: MazeDraw = { gates: [0, 0, 0, 0], phases: [0, 0, 0, 0], wobbles: [true, true, true, true], blinds: [1, 1, 1, 1], pins: [true, true, true, true] };
  await rigPresses(page, mazeNumbers(draw));
  await page.getByTestId('cm-drop').click();
  for (let stage = 0; stage < 4; stage++) {
    await expect(machine).toHaveAttribute('data-stage', String(stage), { timeout: 10_000 });
    await expect(machine).toHaveAttribute('data-phase', 'wait', { timeout: 10_000 });
    await seen();
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const box = document.querySelector('[data-testid="cm-board"]')!;
          const lever = document.querySelector<HTMLButtonElement>('[data-testid="cm-lever"]')!;
          const timer = window.setTimeout(() => reject(new Error('no open window in 6 s')), 6_000);
          const observer = new MutationObserver(() => {
            if (box.getAttribute('data-slot') !== 'open') return;
            observer.disconnect();
            window.clearTimeout(timer);
            lever.click();
            resolve();
          });
          observer.observe(box, { attributes: true, attributeFilter: ['data-window'] });
        }),
    );
  }
  await expect(machine).toHaveAttribute('data-phase', 'idle', { timeout: 15_000 });
}

const MACHINES: Machine[] = [
  { name: 'smart-ball', path: '/games/smart-ball', board: 'smb-board', column: ['smb-start', 'smb-skip', 'smb-plunger', 'smb-status'], side: 'smb-resumed-side', onBoard: 'smb-resumed', smallest: 7, play: smartPlay },
  { name: 'coin-maze', path: '/games/coin-maze', board: 'cm-board', column: ['cm-drop', 'cm-lever', 'cm-skip', 'cm-status', 'cm-medals-led', 'cm-win-led'], side: 'cm-resumed-side', onBoard: 'cm-resumed', smallest: 7, play: mazePlay },
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
        await board.evaluate((el) => (el.parentElement as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' }));
        const layout = () =>
          page.evaluate(
            ({ board, column, side }) => {
              // A part the page does not have is nowhere: the checks below say so.
              const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? new DOMRect(-1, -1, 0, 0);
              const b = box(board);
              return {
                board: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height },
                column: [...column, side].map((id) => ({ id, left: box(id).left, right: box(id).right, top: box(id).top, bottom: box(id).bottom, width: box(id).width, height: box(id).height })),
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
        const smallest = await board.evaluate((el) =>
          Math.min(...[...el.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * (t.ownerSVGElement!.getBoundingClientRect().width / t.ownerSVGElement!.viewBox.baseVal.width))),
        );
        expect(smallest, `${where}: the board's smallest label`).toBeGreaterThanOrEqual(m.smallest);
        // A play through: nothing in the play area moves, and the page does not scroll.
        const before = JSON.stringify(at);
        const seen = new Set<string>([before]);
        await m.play(page, async () => {
          seen.add(JSON.stringify(await layout()));
        });
        seen.add(JSON.stringify(await layout()));
        expect([...seen], `${where}: the play area through a play`).toEqual([before]);
        // Back to the page after a reload: the badge stands beside the board, where its place was kept, not on it.
        await page.reload();
        await arrived(page);
        await expect(page.getByTestId(m.side)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId(m.side)).toHaveText(language === 'en' ? /Last play|Finished from before/ : /前回のプレイ|前のプレイの続き/);
        await expect(page.getByTestId(m.onBoard)).toBeHidden();
        await board.evaluate((el) => (el.parentElement as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' }));
        const after = await layout();
        expect(JSON.stringify(after.column), `${where}: the column after the badge came`).toBe(JSON.stringify(at.column));
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
      await expect(page.getByTestId(m.side)).toBeHidden();
      const [board, start] = await Promise.all([page.getByTestId(m.board).boundingBox(), page.getByTestId(m.column[0]).boundingBox()]);
      expect(start!.y, `${m.name} ${width} × ${height}: the controls under the board`).toBeGreaterThan(board!.y + board!.height);
      await context.close();
    }
  }
});
