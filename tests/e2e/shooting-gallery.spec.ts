import { test, expect, type Browser, type Page } from './fixtures';

import { CORKS, FALLEN, PICKS, SET_UP, numbersFor, slotFor, standingOf, type Draw, type Outcome, type Shot } from '../../src/components/game/ShootingGallery/engine';
import { PLAY_KEY, parsePlay } from '../../src/components/game/ShootingGallery/medalTable';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { instantScroll } from './instantScroll';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Onsen Shooting Gallery (shooting-gallery) plays with the medal center's medals. Everything random about a play is
// drawn from eighteen numbers of Math.random in the press of START (engine.ts `drawPlay`), so a test queues the numbers
// that draw the play it needs (rigPresses.ts). A shot is a press of FIRE: the stall says which band of the sway the sight
// is on (`data-band`), and the test presses the moment it is the one it wants. The floor's API answers at once
// (fixtures.ts); nothing reaches a real server.

test.beforeEach(async ({ context }) => {
  // One button after another on a page taller than the window: the page scrolls at once, so no press lands elsewhere.
  await instantScroll(context);
});

const machine = (page: Page) => page.getByTestId('sht-machine');
const STAKE = 6;
const TOP = 1;
const BASE = 4;
const OVER = 0;
/** The player's aims: six corks at six small figures' top edges (the bottom tier's boxes, the daruma, a kokeshi). */
const AIMS: Shot[] = [
  [6, TOP],
  [7, TOP],
  [8, TOP],
  [3, TOP],
  [5, TOP],
  [0, TOP],
];

/** A draw in which cork `c`, fired at `shots[c]`, does `outcomes[c]`, its blind cork drawn at that same shot. */
function drawFor(shots: readonly Shot[], outcomes: readonly Outcome[]): Draw {
  const positions = [...SET_UP];
  const draw: Draw = { slots: [], picks: [], bands: [] };
  for (let c = 0; c < CORKS; c++) {
    const [target, band] = shots[c];
    const up = standingOf(positions);
    draw.slots.push(slotFor(target, positions[target], band, outcomes[c]));
    draw.picks.push(Math.ceil((up.indexOf(target) * PICKS) / up.length));
    draw.bands.push(band);
    if (outcomes[c] === 'fall') positions[target] = FALLEN;
    else if (outcomes[c] === 'slide') positions[target] += 1;
  }
  return draw;
}
/** Every cork knocks its figure off: 2 + 2 + 2 + 3 + 3 + 4 = 16, three or more. */
const SWEEP = drawFor(AIMS, ['fall', 'fall', 'fall', 'fall', 'fall', 'fall']);
const SWEEP_WON = 16;

async function openStall(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/shooting-gallery'))?.status()).toBe(200);
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const record = async (page: Page) => parsePlay(await page.evaluate((key) => window.localStorage.getItem(key), PLAY_KEY));

/** START with the play drawn as `draw`: pressed again only while no play has been written down, so never twice. */
async function start(page: Page, draw: Draw) {
  await rigPresses(page, numbersFor(draw));
  const before = (await record(page))?.id ?? null;
  await pressUntil(page.getByTestId('sht-start'), async () => ((await record(page))?.id ?? null) !== before);
}

/** Waits for cork `c` to be in the gun, the sight swaying. */
const inGun = (page: Page, c: number) =>
  expect(machine(page))
    .toHaveAttribute('data-cork', String(c), { timeout: 10_000 })
    .then(() => expect(machine(page)).toHaveAttribute('data-phase', 'aim', { timeout: 10_000 }));

/**
 * Presses FIRE the moment the stall says the sight is on `band`. `how`: by the pointer on FIRE, or by Space (with
 * nothing focused).
 */
async function fireAt(page: Page, band: number, how: 'pointer' | 'space' = 'pointer'): Promise<void> {
  await page.evaluate(
    ({ band, how }) =>
      new Promise<void>((resolve, reject) => {
        const stage = document.querySelector('[data-testid="sht-stage"]')!;
        const fire = document.querySelector<HTMLButtonElement>('[data-testid="sht-fire"]')!;
        const timer = window.setTimeout(() => reject(new Error(`band ${band} never came in 6 s`)), 6_000);
        const press = () => {
          window.clearTimeout(timer);
          if (how === 'pointer') fire.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, isPrimary: true, button: 0, bubbles: true }));
          else for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { key: ' ', bubbles: true, cancelable: true }));
          resolve();
        };
        if (stage.getAttribute('data-band') === String(band)) return press();
        const observer = new MutationObserver(() => {
          if (stage.getAttribute('data-band') !== String(band)) return;
          observer.disconnect();
          press();
        });
        observer.observe(stage, { attributes: true, attributeFilter: ['data-band'] });
      }),
    { band, how },
  );
}

/** Puts the sight on figure `target` (a tap on its place on the shelf) and fires cork `c` at `band`, once it is in the gun. */
async function shoot(page: Page, c: number, [target, band]: Shot) {
  await inGun(page, c);
  await page.getByTestId(`sht-figure-${target}`).click();
  await expect(machine(page)).toHaveAttribute('data-picked', String(target));
  await fireAt(page, band);
  // Written down before the cork is seen to fly.
  await expect.poll(async () => (await record(page))?.shots.length).toBe(c + 1);
}

/** Waits for the play to have ended, the machine at rest. */
const ended = (page: Page) => expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout: 15_000 });

test('shooting-gallery: a play takes six medals, each cork goes where the sight was, the figures off the shelf pay once, and the medal center and My Page show the same', async ({ page }) => {
  test.setTimeout(90_000);
  // The page is drawn the same by the server and the browser.
  const mismatches: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) mismatches.push(message.text().slice(0, 200));
  });
  await openStall(page);
  await expect(page.getByTestId('sht-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('sht-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');
  await start(page, SWEEP);
  // The medals are out of the medals at once; what the figures pay goes in as the last one comes to rest.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - STAKE);
  for (let c = 0; c < CORKS; c++) {
    await inGun(page, c);
    await expect(page.getByTestId('sht-fire')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('sht-status')).toContainText(`Cork ${c + 1} of 6`);
    // Skip never fires a cork for the player: it waits for the last one.
    await expect(page.getByTestId('sht-skip')).toBeDisabled();
    await shoot(page, c, AIMS[c]);
    // The figure comes off the shelf: its place is out of play, the plaque counts it.
    await expect(page.getByTestId(`sht-figure-${AIMS[c][0]}`)).toHaveAttribute('data-position', '-1', { timeout: 5_000 });
    await expect(page.getByTestId('sht-down')).toHaveText(String(c + 1));
  }
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-result', 'down-6');
  await expect(page.getByTestId('sht-status')).toHaveText(`6 down! +${SWEEP_WON}`);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - STAKE + SWEEP_WON);
  await expect(page.getByTestId('sht-medals-led')).toHaveAttribute('data-shown', String(WELCOME - STAKE + SWEEP_WON), { timeout: 8_000 });
  expect(await record(page)).toMatchObject({ paid: true, shots: AIMS });
  expect(mismatches).toEqual([]);

  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText((WELCOME - STAKE + SWEEP_WON).toLocaleString('en-US'));
  await expect(page.getByTestId('center-play-shooting-gallery')).toHaveAttribute('href', '/games/shooting-gallery');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-shooting-gallery')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-shooting-gallery-rounds')).toHaveText('1');
  await expect(page.getByTestId('mypage-shooting-gallery-won')).toHaveText(String(SWEEP_WON));
});

test('shooting-gallery: the aim is the player’s: over the top misses what the draw would have knocked off, the arrows and Space aim and fire, and Skip waits for the last cork', async ({ page }) => {
  test.setTimeout(90_000);
  await openStall(page);
  // Space and Enter press a focused button as anywhere: the keys are the machine's once nothing is focused.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  if (await page.evaluate(() => window.matchMedia('(hover: none)').matches)) await expect(page.getByTestId('sht-keys')).toBeHidden();
  else await expect(page.getByTestId('sht-keys')).toBeVisible();
  await rigPresses(page, numbersFor(SWEEP));
  await page.keyboard.press('Enter');
  await inGun(page, 0);
  const skip = page.getByTestId('sht-skip');
  await expect(skip).toBeDisabled();
  await expect(skip).toHaveAccessibleDescription('after the last cork');
  await page.keyboard.press('s');
  // Over the top of the box the draw knocks off: the cork flies over it, and the box stays.
  await page.getByTestId('sht-figure-6').click();
  await fireAt(page, OVER);
  await expect.poll(async () => (await record(page))?.shots).toEqual([[6, OVER]]);
  await expect(page.getByTestId('sht-status')).toContainText('Missed.', { timeout: 5_000 });
  await expect(page.getByTestId('sht-figure-6')).toHaveAttribute('data-position', '0');
  // The arrows move the sight from figure to figure (the next one along, from the box on the left), and Space fires.
  await inGun(page, 1);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ArrowRight');
  await expect(machine(page)).toHaveAttribute('data-picked', '7');
  await fireAt(page, TOP, 'space');
  await expect.poll(async () => (await record(page))?.shots).toEqual([
    [6, OVER],
    [7, TOP],
  ]);
  for (let c = 2; c < CORKS; c++) await shoot(page, c, AIMS[c]);
  await expect(skip).toBeEnabled();
  await page.keyboard.press('s');
  await ended(page);
  // The box missed over the top stays up: 16 less its 2.
  await expect(machine(page)).toHaveAttribute('data-result', 'down-5');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - STAKE + SWEEP_WON - 2);
  await expect(skip).toBeDisabled();
});

test('shooting-gallery: standing unplayed it asks the browser for no frames; waiting for FIRE the sight sways, and stops while the Odds tab is open', async ({ page }) => {
  test.setTimeout(60_000);
  // Every frame the page asks for is counted.
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const ask = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      ask((time) => {
        w.__frames += 1;
        callback(time);
      });
  });
  const frames = () => page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  await openStall(page);
  await page.waitForTimeout(1_000);
  const idle = await frames();
  await page.waitForTimeout(2_000);
  expect((await frames()) - idle, 'frames asked for in 2 s standing unplayed').toBeLessThanOrEqual(2);
  // A play wakes the loop, and the sight sways through every band while a cork waits in the gun.
  await start(page, SWEEP);
  await inGun(page, 0);
  const bands = new Set<string>();
  for (let i = 0; i < 30; i++) {
    bands.add((await page.getByTestId('sht-stage').getAttribute('data-band')) ?? '');
    await page.waitForTimeout(80);
  }
  expect([...bands].sort()).toEqual(['0', '1', '2', '3', '4']);
  // The Odds tab in front: the clock stops, no frames are asked for, and the sight stands where it was.
  await page.locator('#sht-tab-odds').click();
  await page.waitForTimeout(300);
  const paused = await frames();
  const band = await page.getByTestId('sht-stage').getAttribute('data-band');
  await page.waitForTimeout(1_500);
  expect((await frames()) - paused, 'frames asked for in 1.5 s behind the Odds tab').toBeLessThanOrEqual(2);
  expect(await page.getByTestId('sht-stage').getAttribute('data-band')).toBe(band);
  // FIRE pressed from behind the tab does nothing.
  await page.getByTestId('sht-fire').dispatchEvent('pointerdown', { pointerId: 4, isPrimary: true, button: 0 });
  expect((await record(page))?.shots).toEqual([]);
  await page.locator('#sht-tab-machine').click();
  await shoot(page, 0, AIMS[0]);
});

test('shooting-gallery: a reload in the middle of a play finds the same play, finishes it with the corks fired and the rest blind, and pays it once', async ({ page }) => {
  test.setTimeout(60_000);
  await openStall(page);
  await start(page, SWEEP);
  await shoot(page, 0, AIMS[0]);
  await inGun(page, 1);
  const id = (await record(page))!.id;
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  // Finished as the page went (or as it came back): the cork fired, then blind at the player's own aims: all six off.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - STAKE + SWEEP_WON);
  expect(await record(page)).toMatchObject({ id, shots: AIMS, paid: true, own: 1 });
  // The page that comes back says so, and shows the shelf as the play left it.
  await expect(page.getByTestId('sht-resumed')).toHaveText('Finished from before');
  await expect(page.getByTestId('sht-message')).toHaveText('The play was finished while you were away: the corks left were fired blind.');
  await expect(machine(page)).toHaveAttribute('data-result', 'down-6');
  await expect(page.getByTestId('sht-down')).toHaveText('6');
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME - STAKE + SWEEP_WON);
  // And the next play goes on as ever: the figures stood up again, and the word cleared.
  await start(page, drawFor(AIMS, ['miss', 'miss', 'miss', 'miss', 'miss', 'miss']));
  await inGun(page, 0);
  expect(await bankBalance(page)).toBe(WELCOME - 2 * STAKE + SWEEP_WON);
  await expect(page.getByTestId('sht-message')).toHaveText('');
  await expect(page.getByTestId('sht-resumed')).toHaveCount(0);
  await expect(page.getByTestId('sht-down')).toHaveText('0');
  await expect(page.getByTestId('sht-figure-6')).toHaveAttribute('data-position', '0');
});

test('shooting-gallery: a play finished while the player was away says so when they come back: the corks left were fired blind', async ({ context, page }) => {
  test.setTimeout(60_000);
  await openStall(page);
  // Every blind cork over the top: only the player's own box comes off.
  const drawn = drawFor(AIMS, ['fall', 'fall', 'fall', 'fall', 'fall', 'fall']);
  await start(page, { ...drawn, bands: drawn.bands.map((band, c) => (c === 0 ? band : OVER)) });
  await shoot(page, 0, AIMS[0]);
  await inGun(page, 1);
  await expect(page.getByTestId('sht-message')).toHaveText('');
  // The medals are played in another tab: this page gives them up, and finishes its play first.
  const other = await context.newPage();
  await other.goto('/games/shooting-gallery');
  await arrived(other);
  await expect(other.getByTestId('sht-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect.poll(async () => (await record(other))?.paid).toBe(true);
  expect((await record(other))?.shots.slice(1).map(([, band]) => band)).toEqual([OVER, OVER, OVER, OVER, OVER]);
  await other.close();
  await page.bringToFront();
  await page.getByTestId('sht-play-here').click();
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(machine(page)).toHaveAttribute('data-result', 'down-1');
  await expect(page.getByTestId('sht-message')).toHaveText('The play was finished while you were away: the corks left were fired blind.');
  expect(await bankBalance(page)).toBe(WELCOME - STAKE + 2);
  // The next play clears it.
  await start(page, SWEEP);
  await expect(page.getByTestId('sht-message')).toHaveText('');
});

/** A phone, in a language, with the floor faked; with less motion asked for when `calm`. */
async function phone(browser: Browser, width: number, language: 'en' | 'ja', calm: boolean) {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 812 }, isMobile: true, hasTouch: true, reducedMotion: calm ? 'reduce' : 'no-preference' });
  await instantScroll(context);
  const page = await context.newPage();
  await openStall(page, language);
  return { context, page };
}

test('shooting-gallery fits 375 and 320 px phones in English and Japanese: the shelves and the gun on screen together, every figure 44 px to tap, and nothing moves through a play', async ({ browser }) => {
  test.setTimeout(180_000);
  // Two of the four with the corks flying (the widest in English, the narrowest in Japanese), two with less motion.
  for (const [width, language, calm] of [
    [375, 'en', false],
    [375, 'ja', true],
    [320, 'en', true],
    [320, 'ja', false],
  ] as const) {
    const where = `${width} px ${language}${calm ? ', less motion' : ''}`;
    const { context, page } = await phone(browser, width, language, calm);
    const sideways = () => page.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((panel) => panel.scrollWidth)));
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    // Scrolled down to START, as a player who has read the page; START brings the stall on screen with FIRE.
    await page.getByTestId('sht-start').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
    const boxes = () =>
      page.evaluate(() =>
        ['sht-stage', 'sht-status', 'sht-start', 'sht-skip', 'sht-fire', 'sht-medals-led', 'sht-win-led', 'sht-message', 'sht-sound', 'sht-figure-0', 'sht-figure-8'].map((id) => {
          const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)} ${Math.round(box.left)} ${Math.round(box.width)}`;
        }),
      );
    const before = await boxes();
    const seen = new Set<string>([JSON.stringify(before)]);
    await start(page, SWEEP);
    const inView = (id: string) =>
      page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('[class*="GlobalToolbar"]')?.getBoundingClientRect().bottom ?? 0;
        return r.top >= bar - 1 && r.bottom <= window.innerHeight + 1;
      });
    await expect.poll(() => inView('sht-stage'), { message: `${where}: the stall` }).toBe(true);
    for (const id of ['sht-gun', 'sht-fire', 'sht-figure-1']) expect(await inView(id), `${where}: ${id}`).toBe(true);
    for (let c = 0; c < CORKS; c++) {
      await inGun(page, c);
      seen.add(JSON.stringify(await boxes()));
      await shoot(page, c, AIMS[c]);
      seen.add(JSON.stringify(await boxes()));
      expect(await sideways(), where).toBeLessThanOrEqual(width);
    }
    await ended(page);
    seen.add(JSON.stringify(await boxes()));
    expect([...seen], where).toEqual([JSON.stringify(before)]);
    await expect(machine(page)).toHaveAttribute('data-result', 'down-6');
    // Everything the stall prints (its tags, the sight's band, the plaque) is at least 11 px: readable on the narrowest phone.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="sht-stage"] span')].flatMap((el) => {
        const size = parseFloat(getComputedStyle(el).fontSize);
        return el.textContent?.trim() && size < 10.95 ? [`${el.textContent} ${size.toFixed(1)}px`] : [];
      }),
    );
    expect(small, `${where}: text under 11 px`).toEqual([]);
    // The tap targets: START, Skip, FIRE and every figure's place at least 44 px.
    for (const id of ['sht-start', 'sht-skip', 'sht-fire', ...Array.from({ length: 9 }, (_, t) => `sht-figure-${t}`)]) {
      const size = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect());
      expect(Math.min(size.width, size.height), `${where}: ${id}`).toBeGreaterThanOrEqual(44);
    }
    // The Odds tab fits too.
    await page.locator('#sht-tab-odds').click();
    await expect(page.getByTestId('sht-perfect')).toHaveText('91.95%');
    await expect(page.getByTestId('sht-typical')).toHaveText('65.23%');
    await expect(page.getByTestId('sht-blind')).toHaveText('31.11%');
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    await context.close();
  }
});

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('shooting-gallery: a cork’s answer is shown at once, a slide and then a fall bring the cat down, and the lanterns hang still', async ({ page }) => {
    test.setTimeout(60_000);
    await openStall(page);
    expect(await page.locator('[class*="lantern"]').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    const shots: Shot[] = [[1, BASE], [1, BASE], [1, TOP], ...AIMS.slice(0, 3)];
    await start(page, drawFor(shots, ['slide', 'slide', 'fall', 'rock', 'miss', 'fall']));
    const started = Date.now();
    await shoot(page, 0, shots[0]);
    // No flight: the cat stands a step back, and the next cork is in, at once.
    await expect(page.getByTestId('sht-figure-1')).toHaveAttribute('data-position', '1');
    await inGun(page, 1);
    expect(Date.now() - started).toBeLessThan(6_000);
    await shoot(page, 1, shots[1]);
    await expect(page.getByTestId('sht-figure-1')).toHaveAttribute('data-position', '2');
    await expect(page.getByTestId('sht-figure-1')).toHaveAttribute('aria-label', /on the brink/);
    await shoot(page, 2, shots[2]);
    await expect(page.getByTestId('sht-figure-1')).toHaveAttribute('data-position', '-1');
    await expect(page.getByTestId('sht-flash')).toHaveAttribute('data-kind', 'cat');
    for (let c = 3; c < CORKS; c++) await shoot(page, c, shots[c]);
    await ended(page);
    await expect(machine(page)).toHaveAttribute('data-result', 'cat');
    await expect(page.getByTestId('sht-status')).toHaveText('THE CAT FELL! +27');
    await expect.poll(() => bankBalance(page)).toBe(WELCOME - STAKE + 27);
  });
});
