import { test, expect, type Page } from '@playwright/test';

import { SLOT, slotSpot } from '../../src/components/game/MedalPusher/arms';
import { CHAIN_GOAL, CHESTS, JACKPOT_START, ROULETTE } from '../../src/components/game/MedalPusher/lottery';
import { BOWL_TIMES, START_CREDITS, TIMING, advance, createSession } from '../../src/components/game/MedalPusher/session';
import { SOUND_SETTINGS_KEY } from '../../src/components/game/MedalPusher/soundSettings';
import { STORAGE_KEY, restore, serialize } from '../../src/components/game/MedalPusher/storage';
import { SCREEN, VIEW, project } from '../../src/components/game/MedalPusher/view';

// The field is physics with a random seed, so the tests check what must hold
// whatever the medals do: the purse, the counters and the controls.

async function openGame(page: Page, language: 'en' | 'ja' = 'en', query = '') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto(`/games/medal-pusher${query}`);
  expect(response?.status()).toBe(200);
  // While the page streams in, React briefly keeps a second, hidden copy of the
  // content in the document. Wait until there is one before looking anything up.
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
  await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
}

/**
 * Where things are on the stage, as shares of its height. The stage is the
 * whole cabinet in one picture: the screen is the upper part of its back
 * wall, with a panel under it down to the pusher, and the two tables are in
 * front. These three are a spot in the middle of the lower table, a spot on
 * the panel under the screen, and a spot on the screen itself.
 */
const ON_TABLE = 0.81;
const ON_WALL = 0.5;
const ON_SCREEN = 0.26;

// Every tab panel stays mounted, so everything is looked up inside its own panel.
const machine = (page: Page) => page.locator('#pusher-panel-machine');
const odds = (page: Page) => page.locator('#pusher-panel-odds');
const sim = (page: Page) => page.locator('#pusher-panel-sim');
const records = (page: Page) => page.locator('#pusher-panel-records');
type Rail = 'left' | 'right';
/** The feed button of a rail: L for the left one, R for the right. */
const feedButton = (page: Page, rail: Rail) => machine(page).getByTestId(`pusher-feed-${rail}`);
const autoButton = (page: Page) => machine(page).getByTestId('pusher-auto');
/** The slider that aims a rail. Its value is how far across the field the rail's tip is, in percent. */
const aimSlider = (page: Page, rail: Rail) => machine(page).getByTestId(`pusher-aim-${rail}`);
const aimOf = async (page: Page, rail: Rail) => Number(await aimSlider(page, rail).inputValue());

/** A counter of the machine as a number. It is read from the DOM, so it works while the tab is hidden too. */
async function counter(page: Page, id: string): Promise<number> {
  const text = (await machine(page).getByTestId(`pusher-${id}`).textContent()) ?? '';
  return Number(text.replace(/,/g, ''));
}

/**
 * Collects what would show that drawing the field went wrong: any error
 * nobody caught, and any call the browser reports that WebGL refused, which
 * it writes to the console at whatever level as `INVALID_OPERATION` and the
 * like. The game itself writes nothing to the console, so that is all a
 * renderer could put there. Everything else on the console is left out on
 * purpose: the rest of the site reports its failed sign-in and network calls
 * there, which CI's placeholder credentials make certain, and a browser
 * drawing WebGL in software says so, and remarks on its speed.
 */
function watchForTrouble(page: Page): string[] {
  const trouble: string[] = [];
  page.on('pageerror', (error) => trouble.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (/INVALID_(ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)|GL_OUT_OF_MEMORY/.test(text)) trouble.push(`${message.type()}: ${text}`);
  });
  return trouble;
}

/**
 * The colour of the middle of the lower table, as [red, green, blue, alpha].
 * With the 3D renderer the picture is on the canvas under the field, and a
 * WebGL canvas can only be read in the frame it was drawn in, so both
 * canvases are read right after the game's own frame.
 */
function fieldPixel(page: Page): Promise<number[]> {
  return page.evaluate(
    (share) =>
      new Promise<number[]>((resolve) => {
        requestAnimationFrame(() => {
          const probe = document.createElement('canvas');
          probe.width = probe.height = 1;
          const context = probe.getContext('2d');
          if (!context) return resolve([]);
          for (const canvas of document.querySelectorAll<HTMLCanvasElement>('#pusher-panel-machine canvas')) {
            context.drawImage(canvas, Math.floor(canvas.width / 2), Math.floor(canvas.height * share), 1, 1, 0, 0, 1, 1);
          }
          resolve(Array.from(context.getImageData(0, 0, 1, 1).data));
        });
      }),
    ON_TABLE,
  );
}

/**
 * Waits until the field is painted: its middle is the lower table and its
 * medals, blue or gold. An empty canvas is clear there, and a 3D scene with
 * nothing in it is nearly black.
 */
async function expectFieldPainted(page: Page, timeout = 5_000) {
  await expect
    .poll(
      async () => {
        const [red = 0, green = 0, blue = 0, alpha = 0] = await fieldPixel(page);
        return alpha === 255 && red + green + blue > 60;
      },
      { timeout },
    )
    .toBe(true);
}

/** Feeds one medal into a rail with its button, retrying until hydration has attached the handlers. */
async function feedOne(page: Page, rail: Rail = 'left') {
  const before = await counter(page, 'played');
  await expect(async () => {
    await feedButton(page, rail).click({ timeout: 1_000 });
    expect(await counter(page, 'played')).toBeGreaterThan(before);
  }).toPass({ timeout: 20_000 });
}

/** The rails that have a medal on them in the save the browser holds: 0 for the left, 1 for the right. */
async function railsInUse(page: Page): Promise<number[]> {
  const saved = await savedMachine(page);
  return [...new Set((saved?.machine.rolling ?? []).map((medal) => medal.arm))].sort();
}

/** The purse always holds what it started with, less what was dropped, plus what was won. */
async function expectPurseToBalance(page: Page) {
  await expect(async () => {
    const [credits, played, won] = await Promise.all([counter(page, 'credits'), counter(page, 'played'), counter(page, 'won')]);
    expect(credits).toBe(START_CREDITS - played + won);
  }).toPass({ timeout: 5_000 });
}

test('a new machine is drawn, with a full purse and nothing played', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);

  await expect(page.getByRole('heading', { level: 1, name: /Medal Pusher/ })).toBeVisible();
  await expect(machine(page).getByTestId('pusher-credits')).toHaveText(String(START_CREDITS));
  await expect(machine(page).getByTestId('pusher-jackpot')).toHaveText(String(JACKPOT_START));
  // The hold's lamps are drawn in the cabinet, under the screen. What says how many are lit is still on the page, by the name it had.
  await expect(machine(page).getByRole('img', { name: '0 of 8 spins held' })).toBeAttached();
  await expect(machine(page).getByTestId('pusher-stock')).toHaveAttribute('data-held', '0');
  await expect(machine(page).getByTestId('pusher-played')).toHaveText('0');
  await expect(machine(page).getByTestId('pusher-return')).toHaveText('—');
  await expect(machine(page).getByTestId('pusher-caption')).toContainText('7·7·7 ▸ BALL');
  await expect(machine(page).getByTestId('pusher-mode')).toHaveText('NUMBER SLOT');
  // Each of the three reels is a drum with nine faces, and every face says what three of its digit lead to.
  await expect(machine(page).locator('[data-leads="ball"]')).toHaveCount(3);
  await expect(machine(page).locator('[data-leads]')).toHaveCount(27);
  // A face is a picture with its digit written on it.
  for (const digit of [3, 5, 8]) await expect(machine(page).locator(`[data-digit="${digit}"] svg text`).first()).toHaveText(String(digit));
  // A new machine's drums stand turned to 3, 5 and 8: the nine faces are 40 degrees apart, the 1 at no turn at all.
  const turns = await machine(page)
    .locator('[data-fast]')
    .evaluateAll((strips) => strips.map((strip) => Number(/rotateX\((-?[\d.]+)deg\)/.exec((strip as HTMLElement).style.transform)?.[1])));
  expect(turns).toEqual([-80, -160, -280]);
  // No reach is cut in across them before the first spin.
  await expect(machine(page).getByTestId('pusher-cut-in')).toHaveCount(0);
  // The sugoroku board lies in front of the slot, the piece on its first square, which is the tile at the front left.
  await expect(machine(page).getByTestId('pusher-board')).toHaveAttribute('data-square', '0');
  await expect(machine(page).getByTestId('pusher-board').locator('li')).toHaveCount(12);
  await expect(machine(page).getByTestId('pusher-board').locator('li[data-here="true"]')).toHaveCount(1);
  await expect(machine(page).getByTestId('pusher-refill')).toHaveCount(0);

  // The field is painted, by one renderer or the other.
  await expectFieldPainted(page);
  await expect(machine(page).getByTestId('pusher-field')).toHaveAttribute('data-renderer', /^(webgl|2d)$/);

  // A machine nobody feeds keeps its medals.
  await page.waitForTimeout(1_500);
  await expect(machine(page).getByTestId('pusher-won')).toHaveText('0');
  await expect(machine(page).getByTestId('pusher-lost')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('the field says which renderer draws it, and nothing goes wrong while the machine runs', async ({ page }) => {
  const trouble = watchForTrouble(page);
  await openGame(page);
  const field = machine(page).getByTestId('pusher-field');
  // In 3D where this browser has WebGL2 and a graphics card behind it, on the canvas where it has not: one of the two.
  await expect(field).toHaveAttribute('data-renderer', /^(webgl|2d)$/);
  const renderer = await field.getAttribute('data-renderer');
  await expectFieldPainted(page);

  // Feed it for a few seconds: medals fall, land, and are pushed about.
  await feedOne(page);
  await autoButton(page).click();
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
  await autoButton(page).click();
  await expectFieldPainted(page);
  await expectPurseToBalance(page);
  // It is still the renderer it started with, and neither it nor anything else has complained.
  await expect(field).toHaveAttribute('data-renderer', renderer ?? '');
  expect(trouble).toEqual([]);
});

test('the canvas renderer draws the field when the address asks for it', async ({ page }) => {
  const trouble = watchForTrouble(page);
  await openGame(page, 'en', '?renderer=2d');
  const field = machine(page).getByTestId('pusher-field');
  await expect(field).toHaveAttribute('data-renderer', '2d');
  await expectFieldPainted(page);
  // The whole picture is on the field's own canvas, as it was before there was a second one under it for the 3D scene.
  const alphas = await page.evaluate(
    (share) =>
      Array.from(document.querySelectorAll<HTMLCanvasElement>('#pusher-panel-machine canvas'), (canvas) => {
        const context = canvas.dataset.testid === 'pusher-field' ? canvas.getContext('2d') : null;
        return context ? context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * share), 1, 1).data[3] : -1;
      }),
    ON_TABLE,
  );
  expect(alphas).toEqual([-1, 255]);
  // Where the screen is, the picture is left clear, so the page's screen behind the canvas shows through: all that is
  // there is the faint light on the glass.
  const clear = await page.evaluate((share) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="pusher-field"]');
    const context = canvas?.getContext('2d');
    return canvas && context ? context.getImageData(Math.floor(canvas.width * 0.3), Math.floor(canvas.height * share), 1, 1).data[3] : -1;
  }, ON_SCREEN);
  expect(clear).toBeGreaterThanOrEqual(0);
  expect(clear).toBeLessThan(40);

  // The game plays as it does in 3D: the L button feeds a medal, and a press on the left of the field aims the left rail and feeds nothing.
  await feedOne(page);
  const box = await field.boundingBox();
  if (!box) throw new Error('the field has no box');
  const before = await counter(page, 'played');
  await page.waitForTimeout(300);
  await field.click({ position: { x: box.width * 0.25, y: box.height * ON_WALL } });
  await expect.poll(() => aimOf(page, 'left')).toBeLessThan(35);
  await page.waitForTimeout(400);
  expect(await counter(page, 'played')).toBe(before);
  await expectPurseToBalance(page);
  expect(trouble).toEqual([]);
});

test('on a phone the START pockets are three holes side by side, and each slot has a mouth a medal fits', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  // The canvas renderer draws the same cabinet as the 3D one, and its picture can be read back.
  await openGame(page, 'en', '?renderer=2d');
  const field = machine(page).getByTestId('pusher-field');
  await expect(field).toHaveAttribute('data-renderer', '2d');
  await expectFieldPainted(page);
  const box = await field.boundingBox();
  if (!box) throw new Error('the field has no box');
  // Where the middle of each slot's mouth is, as shares of the picture: the slots never move.
  const mouths = ([0, 1] as const).map((arm) => {
    const middle = slotSpot(arm, 0, 0, SLOT.face - SLOT.deep);
    const at = project(middle.x, middle.height, middle.depth);
    return { x: at.x / VIEW.width, y: at.y / VIEW.height };
  });
  /**
   * The black in the picture, which is the inside of a hole and nothing else: how long the stretch of it is down
   * the middle of the picture, where the middle pocket is, and every stretch of it on the line across the picture
   * through the middle of that; and, for each slot, how far it reaches across and down through the middle of the
   * slot's mouth. Lengths are in pixels of the page.
   */
  const black = () =>
    page.evaluate((slots) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="pusher-field"]');
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return null;
      const each = canvas.getBoundingClientRect().width / canvas.width;
      /** The stretches of black along a line of pixels, each as where it begins and how long it is. */
      const runs = (data: Uint8ClampedArray) => {
        const found: { from: number; length: number }[] = [];
        let start = -1;
        for (let i = 0; i <= data.length / 4; i++) {
          const dark = i < data.length / 4 && data[i * 4 + 3] === 255 && data[i * 4] < 16 && data[i * 4 + 1] < 16 && data[i * 4 + 2] < 16;
          if (dark && start < 0) start = i;
          if (!dark && start >= 0) {
            found.push({ from: start * each, length: (i - start) * each });
            start = -1;
          }
        }
        return found;
      };
      const through = (data: Uint8ClampedArray, pixel: number) => runs(data).find((run) => run.from <= pixel * each && run.from + run.length >= pixel * each)?.length ?? 0;
      // The catcher rides with the pusher, so the pockets are looked for from where the lip is at the back of its stroke to where the catcher's foot is at the front of it.
      const top = Math.floor(canvas.height * 0.55);
      const tall = Math.floor(canvas.height * 0.25);
      const [down] = runs(context.getImageData(Math.floor(canvas.width / 2), top, 1, tall).data).sort((a, b) => b.length - a.length);
      const row = down ? top + Math.round((down.from + down.length / 2) / each) : -1;
      return {
        down: down ? { from: down.from + top * each, length: down.length } : null,
        across: row < 0 ? [] : runs(context.getImageData(0, row, canvas.width, 1).data),
        slots: slots.map((slot) => {
          const [x, y] = [Math.round(slot.x * canvas.width), Math.round(slot.y * canvas.height)];
          return { wide: through(context.getImageData(0, y, canvas.width, 1).data, x), tall: through(context.getImageData(x, 0, 1, canvas.height).data, y) };
        }),
      };
    }, mouths);
  // Three of them, each a good many pixels of a phone's screen across. A medal on its way down one covers some of the black for a moment, so the picture is looked at until none is.
  await expect.poll(async () => (await black())?.across.filter((run) => run.length >= 14).length, { timeout: 10_000 }).toBe(3);
  const seen = await black();
  if (!seen?.down) throw new Error('no pocket was found in the picture');
  const pockets = seen.across.filter((run) => run.length >= 14);
  expect(pockets).toHaveLength(3);
  // Deep enough to be seen into, all inside the stage, side by side at even steps, the middle one in the middle.
  expect(seen.down.length).toBeGreaterThanOrEqual(5);
  expect(seen.down.from).toBeGreaterThan(box.height * 0.55);
  expect(seen.down.from + seen.down.length).toBeLessThan(box.height * 0.8);
  const middles = pockets.map((run) => run.from + run.length / 2);
  expect(pockets[0].from).toBeGreaterThan(box.width * 0.25);
  expect(pockets[2].from + pockets[2].length).toBeLessThan(box.width * 0.75);
  expect(Math.abs(middles[1] - box.width / 2)).toBeLessThan(3);
  expect(Math.abs(middles[1] - middles[0] - (middles[2] - middles[1]))).toBeLessThan(3);
  expect(middles[1] - middles[0]).toBeGreaterThan(pockets[1].length + 4);
  // Each slot's mouth is dark too, a medal's height tall and a good deal wider than a medal is thick.
  for (const slot of seen.slots) {
    expect(slot.wide).toBeGreaterThanOrEqual(10);
    expect(slot.tall).toBeGreaterThanOrEqual(20);
    expect(slot.tall).toBeGreaterThan(slot.wide * 1.5);
  }
});

test('the 3D renderer draws the field wherever the browser has WebGL2 at all, when the address insists', async ({ page }) => {
  // Left to itself the game does not draw in 3D on a browser that has no graphics card behind it, which is
  // what CI runs: it would be slow. `?renderer=webgl` insists, so this is where the shaders are really
  // compiled and the scene really drawn. Drawn in software it is slow, hence the patience.
  test.setTimeout(90_000);
  const trouble = watchForTrouble(page);
  await openGame(page, 'en', '?renderer=webgl');
  const field = machine(page).getByTestId('pusher-field');
  const hasWebgl2 = await page.evaluate(() => document.createElement('canvas').getContext('webgl2') !== null);
  await expect(field).toHaveAttribute('data-renderer', hasWebgl2 ? 'webgl' : '2d', { timeout: 30_000 });
  await expectFieldPainted(page, 30_000);
  if (hasWebgl2) {
    // The scene is on the canvas under the field, and the field's own canvas is only the glass over it: clear in the middle.
    const glass = await page.evaluate((share) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="pusher-field"]');
      const context = canvas?.getContext('2d');
      return canvas && context ? context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * share), 1, 1).data[3] : -1;
    }, ON_TABLE);
    expect(glass).toBeGreaterThanOrEqual(0);
    expect(glass).toBeLessThan(60);
  }
  // That is as far as this goes. Drawn in software the page answers too slowly to be played against the clock (on
  // CI a click did not get through in a second, three tries running), and playing is the same code whichever
  // renderer draws: the other tests play it on the canvas, and a unit test holds the two cameras to one another.
  expect(trouble).toEqual([]);
});

test('the L and R buttons each take a medal from the purse', async ({ page }) => {
  await openGame(page);
  await expect(feedButton(page, 'left')).toHaveAccessibleName('Feed the left rail');
  await expect(feedButton(page, 'right')).toHaveAccessibleName('Feed the right rail');
  await feedOne(page, 'left');
  await page.waitForTimeout(300);
  await feedOne(page, 'right');
  const played = await counter(page, 'played');
  expect(played).toBeGreaterThanOrEqual(2);
  // Feeding does not aim: both rails point where a new machine has them.
  expect([await aimOf(page, 'left'), await aimOf(page, 'right')]).toEqual([42, 58]);
  await expectPurseToBalance(page);
  await expect(machine(page).getByTestId('pusher-return')).not.toHaveText('—');
});

/** The machine the browser holds a save of, read the way the game reads it, or null when it holds none that reads. */
async function savedMachine(page: Page) {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  return restore(text, 1);
}

test('the machine is still there after a reload, until it is reset', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);
  await feedOne(page);
  await feedOne(page);
  await feedOne(page);
  // The feed arms are part of the machine too: swing each as far to its own side as it goes.
  await aimSlider(page, 'right').focus();
  await page.keyboard.press('End');
  await expect(aimSlider(page, 'right')).toHaveValue('100');
  await aimSlider(page, 'left').focus();
  await page.keyboard.press('Home');
  await expect(aimSlider(page, 'left')).toHaveValue('0');
  // Let the counter catch up with the last press before reading it.
  await page.waitForTimeout(500);
  const dropped = await counter(page, 'played');
  expect(dropped).toBeGreaterThanOrEqual(3);

  // The machine is saved every few seconds: wait for a save that has these medals in it, and the arms where they were put.
  await expect.poll(async () => (await savedMachine(page))?.inserted ?? -1, { timeout: 20_000 }).toBe(dropped);
  await expect.poll(async () => (await savedMachine(page))?.machine.aims[1] ?? -1, { timeout: 20_000 }).toBeGreaterThan(95);
  await expect.poll(async () => (await savedMachine(page))?.machine.aims[0] ?? 99, { timeout: 20_000 }).toBeLessThan(5);
  await expect(machine(page).getByTestId('pusher-saved')).toHaveAttribute('data-saved', 'true');
  // Nobody is signed in, so the machine is this device's alone, and the note says how to keep it on an account.
  await expect(machine(page).getByTestId('pusher-saved')).toHaveAttribute('data-where', 'device');
  await expect(machine(page).getByTestId('pusher-sign-in')).toHaveAttribute('href', '/signin?redirect=%2Fgames%2Fmedal-pusher', { timeout: 15_000 });

  await page.reload();
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
  await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
  // The page is first drawn as a new machine, and then shows the one it remembers.
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBe(dropped);
  // Its arms are pointed where they were left, each on its own.
  await expect(aimSlider(page, 'right')).toHaveValue('100');
  await expect(aimSlider(page, 'left')).toHaveValue('0');
  await expectPurseToBalance(page);

  // Reset takes two presses, and leaves a new machine with nothing of the old one saved.
  const reset = machine(page).getByTestId('pusher-reset');
  await expect(reset).toHaveText('Reset the machine');
  await reset.click();
  await expect(reset).toHaveAttribute('data-armed', 'true');
  await expect(reset).toHaveText('Press again to reset');
  await reset.click();
  await expect(reset).toHaveAttribute('data-armed', 'false');
  await expect(machine(page).getByTestId('pusher-played')).toHaveText('0');
  await expect(machine(page).getByTestId('pusher-credits')).toHaveText(String(START_CREDITS));
  await expect(machine(page).getByTestId('pusher-announcement')).toContainText('has been reset');
  await expect.poll(async () => (await savedMachine(page))?.inserted ?? 0, { timeout: 20_000 }).toBe(0);
});

test('the note says so when the browser will not keep the machine', async ({ page }) => {
  // Writing this game's save fails, as it does when storage is full or blocked. Nothing else on the site is touched.
  await page.addInitScript((key) => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, name: string, value: string) {
      if (name === key) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      write.call(this, name, value);
    };
  }, STORAGE_KEY);
  await openGame(page);
  const note = machine(page).getByTestId('pusher-saved');
  await expect(note).toHaveAttribute('data-saved', 'false');
  await expect(note).toContainText('could not be saved');
  // The game itself goes on.
  await feedOne(page);
  await expectPurseToBalance(page);
  expect(await savedMachine(page)).toBeNull();
});

test('a press on the field aims the rail on that side and feeds nothing', async ({ page }) => {
  await openGame(page);
  await feedOne(page);
  const field = machine(page).getByTestId('pusher-field');
  const box = await field.boundingBox();
  if (!box) throw new Error('the field has no box');
  await page.waitForTimeout(600);
  const played = await counter(page, 'played');
  expect([await aimOf(page, 'left'), await aimOf(page, 'right')]).toEqual([42, 58]);

  // On the left half it is the left rail that moves, and the right rail stays.
  await field.click({ position: { x: box.width * 0.25, y: box.height * ON_WALL } });
  await expect.poll(() => aimOf(page, 'left')).toBeLessThan(35);
  expect(await aimOf(page, 'right')).toBe(58);

  // On the right half it is the right rail, and the left one stays where the last press put it.
  const left = await aimOf(page, 'left');
  await field.click({ position: { x: box.width * 0.8, y: box.height * ON_WALL } });
  await expect.poll(() => aimOf(page, 'right')).toBeGreaterThan(65);
  expect(await aimOf(page, 'left')).toBe(left);

  // Only the main button aims: a right or a middle click is left to the browser.
  const aims = [await aimOf(page, 'left'), await aimOf(page, 'right')];
  await field.click({ button: 'right', position: { x: box.width * 0.4, y: box.height * ON_WALL } });
  await field.click({ button: 'middle', position: { x: box.width * 0.7, y: box.height * ON_WALL } });
  await page.waitForTimeout(200);
  expect([await aimOf(page, 'left'), await aimOf(page, 'right')]).toEqual(aims);
  await page.keyboard.press('Escape');

  // The screen is part of the back wall, and the picture is over it: a press on it aims under the pointer, as anywhere else.
  await field.click({ position: { x: box.width * 0.3, y: box.height * ON_SCREEN } });
  await expect.poll(() => aimOf(page, 'left')).toBeLessThan(40);

  // A drag moves the rail it began on, and goes on moving it past the middle, as far as that rail reaches.
  // The pointer is taken to places on the field itself, not to where the field stood when the test began: the
  // stage is taller than the window, and the clicks above have scrolled it.
  await field.hover({ position: { x: box.width * 0.3, y: box.height * ON_WALL } });
  await page.mouse.down();
  await field.hover({ position: { x: box.width * 0.48, y: box.height * ON_WALL } });
  await expect.poll(() => aimOf(page, 'left')).toBeGreaterThan(35);
  await field.hover({ position: { x: box.width * 0.6, y: box.height * ON_WALL } });
  await page.mouse.up();
  await expect.poll(() => aimOf(page, 'left')).toBeGreaterThan(50);
  expect(await aimOf(page, 'left')).toBeLessThanOrEqual(61);
  expect(await aimOf(page, 'right')).toBeGreaterThan(65);

  // None of that fed a medal: the field only aims.
  await page.waitForTimeout(500);
  expect(await counter(page, 'played')).toBe(played);
  await expectPurseToBalance(page);
});

test('the screen stands in the back wall of the cabinet, behind the picture, exactly where the housing leaves room for it', async ({ page }) => {
  await openGame(page);
  const stage = await machine(page).getByTestId('pusher-field').boundingBox();
  const screen = await machine(page).getByTestId('pusher-screen').boundingBox();
  if (!stage || !screen) throw new Error('the stage has no box');
  // The stage is one picture, taller than it is wide: the whole cabinet.
  expect(stage.height / stage.width).toBeCloseTo(VIEW.height / VIEW.width, 2);
  expect(stage.height / stage.width).toBeGreaterThan(1.3);
  // The screen is the upper part of it: in the middle, most of the stage wide, from under the hood down to about two fifths of the way.
  expect(Math.abs(screen.x + screen.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(1);
  expect(screen.width / stage.width).toBeGreaterThan(0.75);
  expect((screen.y - stage.y) / stage.height).toBeGreaterThan(0.04);
  expect((screen.y - stage.y) / stage.height).toBeLessThan(0.12);
  expect((screen.y + screen.height - stage.y) / stage.height).toBeGreaterThan(0.38);
  expect((screen.y + screen.height - stage.y) / stage.height).toBeLessThan(0.48);
  // It is where the scene's own camera puts that part of the wall, to the pixel: the top corners of the screen are the
  // widest part of what the browser draws, and its foot the lowest.
  const k = stage.width / VIEW.width;
  const [left, right, foot] = [project(SCREEN.left, SCREEN.top, 0), project(SCREEN.right, SCREEN.top, 0), project(SCREEN.left, SCREEN.foot, 0)];
  expect(Math.abs(screen.x - (stage.x + left.x * k))).toBeLessThan(1.5);
  expect(Math.abs(screen.y - (stage.y + left.y * k))).toBeLessThan(1.5);
  expect(Math.abs(screen.x + screen.width - (stage.x + right.x * k))).toBeLessThan(1.5);
  expect(Math.abs(screen.y + screen.height - (stage.y + foot.y * k))).toBeLessThan(1.5);
  // The picture is over it: the point in its middle belongs to the field, and the screen is under that.
  const under = await page.evaluate(
    ([x, y]) => document.elementsFromPoint(x, y).map((element) => element.closest('[data-testid="pusher-screen"], canvas')?.getAttribute('data-testid') ?? null),
    [screen.x + screen.width / 2, screen.y + screen.height / 2],
  );
  expect(under[0]).toBe('pusher-field');
  expect(under).toContain('pusher-screen');
  expect(under.indexOf('pusher-screen')).toBeGreaterThan(under.indexOf('pusher-field'));
});

/** Opens the game on a machine with a choice of three chests on its screen, saved as the game saves one, for the page to find. */
async function openOnChests(page: Page) {
  const session = createSession(5);
  session.bonus = { kind: 'chest', prizes: [...CHESTS], fallback: 0, picked: -1, elapsed: 0, pickedAt: -1, told: false, payout: -1 };
  const save = serialize(session);
  expect(restore(save, 1)).not.toBeNull();
  await page.addInitScript(
    ([key, text]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text);
    },
    [STORAGE_KEY, save],
  );
  await openGame(page);
  await expect(machine(page).getByTestId('pusher-screen')).toHaveAttribute('data-mode', 'chest');
}

test('a chest on the screen is picked by pressing it, though the picture is over it, and no medal is fed', async ({ page }) => {
  await openOnChests(page);
  const field = machine(page).getByTestId('pusher-field');
  const stage = await field.boundingBox();
  const screen = await machine(page).getByTestId('pusher-screen').boundingBox();
  if (!stage || !screen) throw new Error('the stage has no box');
  // The three chests are on the screen, and each is a button that can be pressed.
  const middles: { x: number; y: number }[] = [];
  for (const index of [0, 1, 2]) {
    const chest = machine(page).getByTestId(`pusher-chest-${index}`);
    await expect(chest).toBeEnabled();
    const box = await chest.boundingBox();
    if (!box) throw new Error('the chest has no box');
    expect(box.x).toBeGreaterThanOrEqual(screen.x);
    expect(box.x + box.width).toBeLessThanOrEqual(screen.x + screen.width);
    expect(box.y).toBeGreaterThanOrEqual(screen.y);
    expect(box.y + box.height).toBeLessThanOrEqual(screen.y + screen.height);
    middles.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  const played = await counter(page, 'played');
  const aimed = [await aimOf(page, 'left'), await aimOf(page, 'right')];
  // The pointer over a chest shows it as it would if it could reach it, and the field shows that a press there picks.
  await page.mouse.move(middles[2].x, middles[2].y);
  await expect(machine(page).getByTestId('pusher-chest-2')).toHaveAttribute('data-hover', 'true');
  await expect(field).toHaveCSS('cursor', 'pointer');
  await page.mouse.move(middles[0].x, middles[0].y);
  await expect(machine(page).getByTestId('pusher-chest-0')).toHaveAttribute('data-hover', 'true');
  await expect(machine(page).getByTestId('pusher-chest-2')).not.toHaveAttribute('data-hover', 'true');
  // Left alone the clock would pick the first. A press on the last picks the last: it lands on the field, which
  // hands it to the chest under the pointer, and moves neither rail's aim.
  await field.click({ position: { x: middles[2].x - stage.x, y: middles[2].y - stage.y } });
  await expect(machine(page).getByTestId('pusher-chest-2')).toHaveAttribute('data-chosen', 'true');
  await expect(machine(page).getByTestId('pusher-chest-0')).toHaveAttribute('data-chosen', 'false');
  await page.waitForTimeout(400);
  expect(await counter(page, 'played')).toBe(played);
  expect([await aimOf(page, 'left'), await aimOf(page, 'right')]).toEqual(aimed);
  // Once one is picked they are chests no longer to be pressed: a press there is a press on the field again,
  // which aims the rail on that side and still feeds nothing.
  await expect(machine(page).getByTestId('pusher-chest-1')).toBeDisabled();
  await field.click({ position: { x: middles[1].x - stage.x, y: middles[1].y - stage.y } });
  await expect.poll(async () => [await aimOf(page, 'left'), await aimOf(page, 'right')]).not.toEqual(aimed);
  await page.waitForTimeout(400);
  expect(await counter(page, 'played')).toBe(played);
});

test('a chest on the screen is picked from the keyboard too', async ({ page }) => {
  await openOnChests(page);
  const played = await counter(page, 'played');
  // They are real buttons, behind the picture: they take the focus and answer the keyboard as they did.
  const chest = machine(page).getByTestId('pusher-chest-1');
  await chest.focus();
  await expect(chest).toBeFocused();
  await expect(chest).toHaveAccessibleName(/chest/i);
  await page.keyboard.press('Enter');
  await expect(chest).toHaveAttribute('data-chosen', 'true');
  await expect(machine(page).getByTestId('pusher-chest-0')).toHaveAttribute('data-chosen', 'false');
  expect(await counter(page, 'played')).toBe(played);
});

test('holding L streams medals into the left rail and letting go stops them', async ({ page }) => {
  await openGame(page);
  await feedOne(page);
  const before = await counter(page, 'played');
  const box = await feedButton(page, 'left').boundingBox();
  if (!box) throw new Error('the button has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
  await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'false');
  await expect.poll(() => counter(page, 'played'), { timeout: 10_000 }).toBeGreaterThanOrEqual(before + 4);
  // The button keeps hold of the pointer: sliding off its edge does not stop the stream.
  await page.mouse.move(box.x + box.width + 40, box.y - 40, { steps: 3 });
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
  await page.mouse.up();
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'false');
  await page.waitForTimeout(300);
  const after = await counter(page, 'played');
  await page.waitForTimeout(900);
  // The click that ends a stream does not feed one more.
  expect(await counter(page, 'played')).toBe(after);
  await expectPurseToBalance(page);
});

test('both buttons held at once, by two pointers, feed from both rails', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);
  await feedOne(page);
  await page.waitForTimeout(400);
  const before = await counter(page, 'played');
  // Two fingers, each a pointer of its own, as a touch screen sends them: one goes down on L and stays, then one on R.
  const finger = (pointerId: number) => ({ pointerId, pointerType: 'touch', isPrimary: pointerId === 21, button: 0, buttons: 1, bubbles: true, cancelable: true });
  await feedButton(page, 'left').dispatchEvent('pointerdown', finger(21));
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
  await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'false');
  await feedButton(page, 'right').dispatchEvent('pointerdown', finger(22));
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
  await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'true');
  // Both rails stream. The machine is saved every few seconds, and a save taken meanwhile has medals on both.
  await expect.poll(() => counter(page, 'played'), { timeout: 10_000 }).toBeGreaterThanOrEqual(before + 8);
  await expect.poll(() => railsInUse(page), { timeout: 20_000 }).toEqual([0, 1]);
  // The first finger comes up: its rail stops, and the other, still held, goes on.
  await feedButton(page, 'left').dispatchEvent('pointerup', finger(21));
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'false');
  await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'true');
  const one = await counter(page, 'played');
  await expect.poll(() => counter(page, 'played'), { timeout: 10_000 }).toBeGreaterThan(one);
  // A touch the browser takes away ends its press like one that is lifted.
  await feedButton(page, 'right').dispatchEvent('pointercancel', finger(22));
  await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'false');
  await page.waitForTimeout(300);
  const after = await counter(page, 'played');
  await page.waitForTimeout(900);
  expect(await counter(page, 'played')).toBe(after);
  await expectPurseToBalance(page);
});

/** The key the switches of feel are kept under. It is not the machine's save, which has STORAGE_KEY. */
const FEEL_STORAGE_KEY = 'medal-pusher-feel';
const feelSwitch = (page: Page, name: 'sweep' | 'vibration' | 'fullscreen') => machine(page).getByTestId(`pusher-${name}`);
type Spot = { x: number; y: number };
/** The middle of something, where it is on the screen at this moment: never kept across a scroll. */
async function middleOf(locator: ReturnType<Page['locator']>): Promise<Spot> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('it has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
/**
 * Fingers on the glass, sent as a touch screen sends them, each with a number of its own. A start or a move names
 * every finger that is down; an end names the ones that came up; a cancel takes them all away.
 */
async function touchScreen(page: Page) {
  const session = await page.context().newCDPSession(page);
  return (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: (Spot & { id: number })[]) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}
/**
 * Waits until the page has come to life in the browser. The server draws Sweep alone, because it cannot know the
 * device; the fullscreen button appears once the browser has taken the page over, and with it every handler works.
 */
async function alive(page: Page) {
  await expect(feelSwitch(page, 'fullscreen')).toBeVisible({ timeout: 20_000 });
}
/**
 * How much of each control is its own to hit: how tall the strip through its middle is that takes the touch, whatever
 * the control looks like, and how wide the control is. A control that is not there is 0 by 0.
 */
function hitSizes(page: Page, ids: string[]) {
  return page.evaluate(
    (testIds) =>
      testIds.map((id) => {
        const element = document.querySelector(`#pusher-panel-machine [data-testid="${id}"]`);
        if (!element) return { id, tall: 0, wide: 0 };
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        let tall = 1;
        for (const way of [-1, 1]) for (let d = 1; d < 40 && element.contains(document.elementFromPoint(x, y + way * d)); d++) tall++;
        return { id, tall, wide: Math.round(rect.width) };
      }),
    ids,
  );
}
/** Has the page believe it is hidden, or showing again, and tells it so. */
async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((hide) => {
    if (hide) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    else delete (document as unknown as { visibilityState?: string }).visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('in the hand, on a phone', () => {
  // A phone held upright: a touch screen 375 px wide, two pixels to the point. Headless Chromium has a vibration
  // function and can fill the screen.
  test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  test('the switches of feel are there, named, in one row, and remembered across a reload', async ({ page }) => {
    test.setTimeout(60_000);
    const trouble = watchForTrouble(page);
    await openGame(page);
    await alive(page);
    await expect(machine(page).getByRole('group', { name: 'Ways to play' })).toBeVisible();
    for (const [name, label] of [
      ['sweep', 'Swing'],
      ['vibration', 'Vibrate'],
      ['fullscreen', 'Fullscreen'],
    ] as const) {
      await expect(feelSwitch(page, name)).toBeVisible();
      await expect(feelSwitch(page, name)).toHaveAccessibleName(label);
    }
    // Sweep and fullscreen start off; vibration starts on, on a device that has a motor and has not asked for less motion.
    await expect(feelSwitch(page, 'sweep')).toHaveAttribute('aria-pressed', 'false');
    await expect(feelSwitch(page, 'fullscreen')).toHaveAttribute('aria-pressed', 'false');
    await expect(feelSwitch(page, 'vibration')).toHaveAttribute('aria-pressed', 'true');

    // They fit a phone: nothing scrolls sideways, the three are in one row inside the controls, and each is at least
    // 44 px to hit, as are Auto, Sound and the sliders. A switch looks smaller than that: a strip through its middle is its own.
    await feelSwitch(page, 'sweep').scrollIntoViewIfNeeded();
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.inner);
    const controls = await machine(page).getByTestId('pusher-controls').boundingBox();
    const boxes = await Promise.all((['sweep', 'vibration', 'fullscreen'] as const).map((name) => feelSwitch(page, name).boundingBox()));
    if (!controls || boxes.some((box) => !box)) throw new Error('the switches have no boxes');
    for (const box of boxes) {
      expect(Math.abs((box?.y ?? 0) - (boxes[0]?.y ?? 0))).toBeLessThan(2);
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(controls.x);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(controls.x + controls.width);
    }
    const reach = await hitSizes(page, ['pusher-auto', 'pusher-sound', 'pusher-sweep', 'pusher-vibration', 'pusher-fullscreen', 'pusher-aim-left', 'pusher-aim-right']);
    for (const control of reach) {
      expect(control.tall, `${control.id} is ${control.tall} px tall to hit`).toBeGreaterThanOrEqual(44);
      expect(control.wide, `${control.id} is ${control.wide} px wide`).toBeGreaterThanOrEqual(44);
    }
    // Nothing in the cabinet is text to select, and a double tap on it does not zoom the page.
    await expect(machine(page).getByTestId('pusher-credits')).toHaveCSS('user-select', 'none');
    await expect(feelSwitch(page, 'sweep')).toHaveCSS('touch-action', 'manipulation');
    await expect(aimSlider(page, 'left')).toHaveCSS('touch-action', 'pan-y');

    // Sweep on: the rails swing by themselves, the sliders show it, and a line says what to do.
    await expect(machine(page).getByTestId('pusher-lead-left')).toHaveCount(0);
    await feelSwitch(page, 'sweep').tap();
    await expect(feelSwitch(page, 'sweep')).toHaveAttribute('aria-pressed', 'true');
    await expect(machine(page).getByTestId('pusher-sweep-note')).toContainText('Press L or R when the ▼');
    await expect(machine(page).getByTestId('pusher-lead-left')).toHaveCount(1);
    await expect(machine(page).getByTestId('pusher-lead-right')).toHaveCount(1);
    const seen = new Set<number>();
    await expect
      .poll(
        async () => {
          seen.add(await aimOf(page, 'left'));
          return seen.size;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(4);
    // The two swing together, the right rail always the same way ahead of the left: they never cross.
    const [left, right] = await page.evaluate(() => {
      const value = (id: string) => Number((document.querySelector(`#pusher-panel-machine [data-testid="${id}"]`) as HTMLInputElement).value);
      return [value('pusher-aim-left'), value('pusher-aim-right')];
    });
    expect(right - left).toBeGreaterThanOrEqual(38);
    expect(right - left).toBeLessThanOrEqual(40);
    // Vibration off.
    await feelSwitch(page, 'vibration').tap();
    await expect(feelSwitch(page, 'vibration')).toHaveAttribute('aria-pressed', 'false');
    // Both choices are kept under a key of their own, and the machine's save is not touched by them.
    expect(await page.evaluate((key) => window.localStorage.getItem(key), FEEL_STORAGE_KEY)).toBe(JSON.stringify({ v: 1, vibration: false, sweep: true }));
    expect(FEEL_STORAGE_KEY).not.toBe(STORAGE_KEY);
    await expect(machine(page).getByTestId('pusher-saved')).toHaveAttribute('data-saved', 'true');

    await page.reload();
    await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
    await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
    // The page is first drawn with nothing chosen, and then shows what this browser remembers.
    await expect(feelSwitch(page, 'sweep')).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await expect(feelSwitch(page, 'vibration')).toHaveAttribute('aria-pressed', 'false');
    await expect(machine(page).getByTestId('pusher-sweep-note')).toBeVisible();

    // A hand on a slider takes over: Sweep goes off, says so, and the rail stays where the hand put it.
    await aimSlider(page, 'left').focus();
    await page.keyboard.press('Home');
    await expect(feelSwitch(page, 'sweep')).toHaveAttribute('aria-pressed', 'false');
    await expect(machine(page).getByTestId('pusher-announcement')).toContainText('aiming by hand');
    await expect(machine(page).getByTestId('pusher-sweep-note')).toHaveCount(0);
    await expect(machine(page).getByTestId('pusher-lead-left')).toHaveCount(0);
    await page.waitForTimeout(600);
    await expect(aimSlider(page, 'left')).toHaveValue('0');
    expect(await page.evaluate((key) => window.localStorage.getItem(key), FEEL_STORAGE_KEY)).toBe(JSON.stringify({ v: 1, vibration: false, sweep: false }));
    expect(trouble).toEqual([]);
  });

  test('with the sound settings open and Swing on, the controls are still one panel a thumb can work', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page);
    await alive(page);
    const controls = machine(page).getByTestId('pusher-controls');
    await controls.scrollIntoViewIfNeeded();
    const closed = await controls.boundingBox();
    // Everything the controls can show at once: the row of sound settings, and the line about Swing.
    await openSoundSettings(page);
    await feelSwitch(page, 'sweep').tap();
    await expect(machine(page).getByTestId('pusher-sweep-note')).toBeVisible();
    await controls.scrollIntoViewIfNeeded();
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.inner);
    const box = async (id: string) => {
      const found = await machine(page).getByTestId(id).boundingBox();
      if (!found) throw new Error(`${id} has no box`);
      return found;
    };
    const [open, auto, sound, more, feel, row, note] = await Promise.all([
      box('pusher-controls'),
      box('pusher-auto'),
      box('pusher-sound'),
      box('pusher-sound-settings'),
      box('pusher-feel'),
      box('pusher-sound-panel'),
      box('pusher-sweep-note'),
    ]);
    if (!closed) throw new Error('the controls have no box');
    // One row under another: Auto, Sound and the settings' button; the switches of feel; the sound settings; the line.
    expect(Math.abs(auto.y - sound.y)).toBeLessThan(2);
    expect(Math.abs(more.y - sound.y)).toBeLessThan(2);
    expect(feel.y).toBeGreaterThanOrEqual(sound.y + sound.height);
    expect(row.y).toBeGreaterThanOrEqual(feel.y + feel.height);
    expect(note.y).toBeGreaterThanOrEqual(row.y + row.height);
    for (const part of [feel, row, note]) {
      expect(part.x).toBeGreaterThanOrEqual(open.x);
      expect(part.x + part.width).toBeLessThanOrEqual(open.x + open.width);
    }
    expect(note.y + note.height).toBeLessThanOrEqual(open.y + open.height);
    // With all of it open the controls are under 400 px tall on a phone, and opening it added less than 120.
    expect(open.height).toBeLessThanOrEqual(400);
    expect(open.height - closed.height).toBeLessThanOrEqual(120);
    // Every one of them is at least 44 px to hit, the sound settings' own included: their slider is the cabinet's
    // slider, with its thumb, and the mark at the level the cabinet was made at is still behind the thumb there.
    const reach = await hitSizes(page, ['pusher-auto', 'pusher-sound', 'pusher-sound-settings', 'pusher-sweep', 'pusher-vibration', 'pusher-fullscreen', 'pusher-volume', 'pusher-music', 'pusher-aim-left', 'pusher-aim-right']);
    for (const control of reach) {
      expect(control.tall, `${control.id} is ${control.tall} px tall to hit`).toBeGreaterThanOrEqual(44);
      expect(control.wide, `${control.id} is ${control.wide} px wide`).toBeGreaterThanOrEqual(32);
    }
    await expect(volumeSlider(page)).toHaveCSS('touch-action', 'pan-y');
    await expect(volumeSlider(page)).toHaveValue('100');
    const mark = await volumeSlider(page).evaluate((slider) => {
      const track = slider.parentElement as HTMLElement;
      const notch = getComputedStyle(track, '::before');
      const around = track.getBoundingClientRect();
      return { at: parseFloat(notch.left) + parseFloat(notch.marginLeft) + parseFloat(notch.width) / 2, middle: around.width / 2, tall: parseFloat(notch.height) };
    });
    expect(Math.abs(mark.at - mark.middle)).toBeLessThan(1.5);
    // It is taller than the 28 px thumb, so it shows over and under it.
    expect(mark.tall).toBeGreaterThan(28);
    // The sound row shuts again and the controls are as tall as they were with only the line about Swing more.
    await soundSettings(page).tap();
    await expect(soundRow(page)).toHaveCount(0);
    const shut = await box('pusher-controls');
    expect(shut.height).toBeLessThan(open.height - 40);
  });

  test('two thumbs hold L and R at once, a thumb that slides off still holds, and a press that ends unheard is let go', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page);
    await feedOne(page);
    await page.waitForTimeout(400);
    const touch = await touchScreen(page);
    await feedButton(page, 'left').scrollIntoViewIfNeeded();
    // Where the two buttons are now. A touch on either does not scroll the page, so they stay there; that is checked below.
    const scrolled = await page.evaluate(() => window.scrollY);
    const l = await middleOf(feedButton(page, 'left'));
    const r = await middleOf(feedButton(page, 'right'));
    const before = await counter(page, 'played');

    await touch('touchStart', [{ ...l, id: 1 }]);
    await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
    await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'false');
    await touch('touchStart', [
      { ...l, id: 1 },
      { ...r, id: 2 },
    ]);
    await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
    await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'true');
    await expect.poll(() => counter(page, 'played'), { timeout: 10_000 }).toBeGreaterThanOrEqual(before + 8);
    // The left thumb slides up off its button: it is still holding it, and the page has not moved under either thumb.
    for (let step = 1; step <= 6; step++) {
      await touch('touchMove', [
        { x: l.x + step * 6, y: l.y - step * 20, id: 1 },
        { ...r, id: 2 },
      ]);
    }
    await page.waitForTimeout(200);
    await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
    await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'true');
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    // It comes up out there: its rail stops, and the other, still held, goes on.
    await touch('touchEnd', [{ x: l.x + 36, y: l.y - 120, id: 1 }]);
    await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'false');
    await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'true');
    const one = await counter(page, 'played');
    await expect.poll(() => counter(page, 'played'), { timeout: 10_000 }).toBeGreaterThan(one);
    // The page is hidden with the right thumb still down, and nobody hears it come up: the press is let go all the same.
    await setHidden(page, true);
    await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'false');
    await setHidden(page, false);
    await page.waitForTimeout(300);
    const after = await counter(page, 'played');
    await page.waitForTimeout(900);
    expect(await counter(page, 'played')).toBe(after);
    await touch('touchCancel', []);
    // A window that loses the focus lets go of a held button in the same way.
    await touch('touchStart', [{ ...l, id: 3 }]);
    await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'false');
    await touch('touchCancel', []);
    await expectPurseToBalance(page);
  });

  test('a swipe up the field scrolls the page and leaves the rails alone, while a tap and a sideways drag aim', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page);
    await alive(page);
    const touch = await touchScreen(page);
    const field = machine(page).getByTestId('pusher-field');
    /** A spot on the field, where the field is on the screen now. */
    const onField = async (across: number, down: number): Promise<Spot> => {
      await field.scrollIntoViewIfNeeded();
      const box = await field.boundingBox();
      if (!box) throw new Error('the field has no box');
      return { x: box.x + box.width * across, y: box.y + box.height * down };
    };
    expect([await aimOf(page, 'left'), await aimOf(page, 'right')]).toEqual([42, 58]);

    // A finger goes down on the left half and swipes up: the page scrolls, and neither rail has moved.
    const from = await onField(0.2, 0.7);
    const top = await page.evaluate(() => window.scrollY);
    await touch('touchStart', [{ ...from, id: 1 }]);
    for (let step = 1; step <= 10; step++) await touch('touchMove', [{ x: from.x, y: from.y - step * 15, id: 1 }]);
    await touch('touchEnd', [{ x: from.x, y: from.y - 150, id: 1 }]);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top + 40);
    await page.waitForTimeout(300);
    expect([await aimOf(page, 'left'), await aimOf(page, 'right')]).toEqual([42, 58]);

    // A tap on the left half aims the left rail there, and the right rail stays.
    const tap = await onField(0.25, ON_WALL);
    await touch('touchStart', [{ ...tap, id: 2 }]);
    await touch('touchEnd', [{ ...tap, id: 2 }]);
    await expect.poll(() => aimOf(page, 'left')).toBeLessThan(35);
    expect(await aimOf(page, 'right')).toBe(58);

    // A sideways drag on the right half moves the right rail along with the finger.
    const drag = await onField(0.6, ON_WALL);
    await touch('touchStart', [{ ...drag, id: 3 }]);
    for (let step = 1; step <= 8; step++) await touch('touchMove', [{ x: drag.x + step * 10, y: drag.y + (step % 2), id: 3 }]);
    await expect.poll(() => aimOf(page, 'right')).toBeGreaterThan(70);
    await touch('touchEnd', [{ x: drag.x + 80, y: drag.y, id: 3 }]);
    expect(await aimOf(page, 'left')).toBeLessThan(35);
    // None of it fed a medal.
    await page.waitForTimeout(300);
    expect(await counter(page, 'played')).toBe(0);
  });

  test('the cabinet fills the screen and comes back, with its controls and a sharp picture', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page);
    await alive(page);
    const button = feelSwitch(page, 'fullscreen');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.scrollIntoViewIfNeeded();
    await button.tap();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    // It is the cabinet that fills the screen, not the page: the field and the controls are in it, and the tabs are not.
    const measure = () => page.evaluate((drawingWidth) => {
      const full = document.fullscreenElement;
      const has = (selector: string) => !!full && full.contains(document.querySelector(selector));
      const rect = full?.getBoundingClientRect();
      const field = document.querySelector('#pusher-panel-machine [data-testid="pusher-field"]') as HTMLCanvasElement;
      const shown = field.getBoundingClientRect();
      const within = (id: string) => {
        const box = document.querySelector(`#pusher-panel-machine [data-testid="${id}"]`)?.getBoundingClientRect();
        return !!box && box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight;
      };
      return {
        field: has('#pusher-panel-machine [data-testid="pusher-field"]'),
        controls: has('#pusher-panel-machine [data-testid="pusher-controls"]'),
        tabs: has('[role="tablist"]'),
        fills: !!rect && Math.round(rect.left) === 0 && Math.round(rect.top) === 0 && Math.round(rect.width) === window.innerWidth && Math.round(rect.height) === window.innerHeight,
        scrolls: !!full && (full.scrollHeight > full.clientHeight || full.scrollWidth > full.clientWidth),
        onScreen: ['pusher-feed-left', 'pusher-feed-right', 'pusher-aim-left', 'pusher-aim-right', 'pusher-auto', 'pusher-sound', 'pusher-sweep', 'pusher-fullscreen', 'pusher-credits', 'pusher-jackpot'].filter((id) => !within(id)),
        shape: shown.width / shown.height,
        shownWidth: shown.width,
        // The canvas holds as many pixels as the screen shows of it, up to two to the point and never under half the drawing's own.
        sharp: Math.abs(field.width - Math.round(drawingWidth * Math.max(0.5, (Math.min(2, window.devicePixelRatio) * field.clientWidth) / drawingWidth))) <= 1,
        touchAction: getComputedStyle(field).touchAction,
      };
    }, VIEW.width);
    // The canvases are told their new size a frame after the layout changes.
    await expect.poll(async () => (await measure()).sharp, { timeout: 5_000 }).toBe(true);
    const inside = await measure();
    expect(inside.field).toBe(true);
    expect(inside.controls).toBe(true);
    expect(inside.tabs).toBe(false);
    expect(inside.fills).toBe(true);
    expect(inside.scrolls).toBe(false);
    expect(inside.onScreen).toEqual([]);
    expect(Math.abs(inside.shape - VIEW.width / VIEW.height)).toBeLessThan(0.01);
    expect(inside.shownWidth).toBeGreaterThan(200);
    // There is no page to scroll there, so a finger on the field aims whichever way it goes.
    expect(inside.touchAction).toBe('none');
    // The screen is still where the scene's own camera puts that part of the wall, to the pixel, at the new size.
    const stage = await machine(page).getByTestId('pusher-field').boundingBox();
    const screen = await machine(page).getByTestId('pusher-screen').boundingBox();
    if (!stage || !screen) throw new Error('the stage has no box');
    const k = stage.width / VIEW.width;
    const [left, right, foot] = [project(SCREEN.left, SCREEN.top, 0), project(SCREEN.right, SCREEN.top, 0), project(SCREEN.left, SCREEN.foot, 0)];
    expect(Math.abs(screen.x - (stage.x + left.x * k))).toBeLessThan(1.5);
    expect(Math.abs(screen.y - (stage.y + left.y * k))).toBeLessThan(1.5);
    expect(Math.abs(screen.x + screen.width - (stage.x + right.x * k))).toBeLessThan(1.5);
    expect(Math.abs(screen.y + screen.height - (stage.y + foot.y * k))).toBeLessThan(1.5);
    // The machine goes on being played there.
    await feedButton(page, 'left').tap();
    await expect.poll(() => counter(page, 'played')).toBeGreaterThanOrEqual(1);

    // Leaving it the system's way, without the button: the button follows.
    await page.evaluate(() => document.exitFullscreen());
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    // And the button leaves it too.
    await button.scrollIntoViewIfNeeded();
    await button.tap();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await button.tap();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expectPurseToBalance(page);
  });

  test('a tap on a chest picks it with the cabinet filling the screen, and aims nothing', async ({ page }) => {
    await openOnChests(page);
    await alive(page);
    const button = feelSwitch(page, 'fullscreen');
    await button.scrollIntoViewIfNeeded();
    await button.tap();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const aimed = [await aimOf(page, 'left'), await aimOf(page, 'right')];
    const chest = machine(page).getByTestId('pusher-chest-2');
    await expect(chest).toBeEnabled();
    // The chests are on the screen, in the back wall, behind the picture: a finger on one lands on the field, which
    // hands the tap to the chest under it.
    const [screen, box] = await Promise.all([machine(page).getByTestId('pusher-screen').boundingBox(), chest.boundingBox()]);
    if (!screen || !box) throw new Error('the chest has no box');
    expect(box.x).toBeGreaterThanOrEqual(screen.x);
    expect(box.x + box.width).toBeLessThanOrEqual(screen.x + screen.width);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(chest).toHaveAttribute('data-chosen', 'true');
    await expect(machine(page).getByTestId('pusher-chest-0')).toHaveAttribute('data-chosen', 'false');
    await page.waitForTimeout(300);
    expect([await aimOf(page, 'left'), await aimOf(page, 'right')]).toEqual(aimed);
    expect(await counter(page, 'played')).toBe(0);
  });

  test('a press is a tick in the hand, a held button ticks slowly, and switched off nothing buzzes', async ({ page }) => {
    test.setTimeout(90_000);
    // What the page asks of the motor is written down instead of being played.
    await page.addInitScript(() => {
      const buzzes: { at: number; pattern: number[] }[] = [];
      (window as unknown as { buzzes: typeof buzzes }).buzzes = buzzes;
      navigator.vibrate = (pattern) => {
        buzzes.push({ at: performance.now(), pattern: ([] as number[]).concat(pattern as number | number[]) });
        return true;
      };
    });
    await openGame(page);
    type Buzzes = { at: number; pattern: number[] }[];
    /** When each tick for a medal was asked for, in milliseconds. */
    const tickTimes = () => page.evaluate(() => (window as unknown as { buzzes: Buzzes }).buzzes.filter(({ pattern }) => pattern.length === 1 && pattern[0] === 15).map(({ at }) => at));
    const ticks = async () => (await tickTimes()).length;
    const asked = () => page.evaluate(() => (window as unknown as { buzzes: Buzzes }).buzzes.map(({ pattern }) => pattern));
    const forget = () => page.evaluate(() => void ((window as unknown as { buzzes: Buzzes }).buzzes.length = 0));
    await alive(page);
    await expect(feelSwitch(page, 'vibration')).toHaveAttribute('aria-pressed', 'true');
    await feedButton(page, 'left').scrollIntoViewIfNeeded();
    // A tap that feeds a medal is a tick, each one: after three taps and more, as many ticks as medals. (A tap the
    // slot was not ready for feeds nothing, and is not felt either.)
    for (let fed = 1; fed <= 3; fed++) {
      await expect(async () => {
        await feedButton(page, 'left').tap();
        await page.waitForTimeout(400);
        expect(await counter(page, 'played')).toBeGreaterThanOrEqual(fed);
      }).toPass({ timeout: 20_000 });
    }
    await expect.poll(async () => (await ticks()) - (await counter(page, 'played'))).toBe(0);
    expect(await ticks()).toBeGreaterThanOrEqual(3);
    // A button that stays held feeds a medal every fifth of a second and ticks at most three times a second: the
    // press itself, and then never two ticks less than a third of a second apart.
    await forget();
    const touch = await touchScreen(page);
    const l = await middleOf(feedButton(page, 'left'));
    const before = await counter(page, 'played');
    await touch('touchStart', [{ ...l, id: 1 }]);
    await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThanOrEqual(before + 8);
    await touch('touchEnd', [{ ...l, id: 1 }]);
    await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'false');
    const fed = (await counter(page, 'played')) - before;
    const times = await tickTimes();
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect(times.length).toBeLessThanOrEqual(fed);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(325);
    // Auto feeds with no finger on anything: its medals are not felt.
    await forget();
    const byAuto = await counter(page, 'played');
    await autoButton(page).tap();
    await expect(autoButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThanOrEqual(byAuto + 3);
    await autoButton(page).tap();
    await expect(autoButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await ticks()).toBe(0);
    /** Taps L until a medal has gone in, which is a tick: a tap the slot was not ready for feeds nothing. */
    const tapIn = async () => {
      const had = await counter(page, 'played');
      await expect(async () => {
        await feedButton(page, 'left').tap();
        await page.waitForTimeout(400);
        expect(await counter(page, 'played')).toBeGreaterThan(had);
      }).toPass({ timeout: 20_000 });
      await expect.poll(ticks).toBeGreaterThanOrEqual(1);
    };
    // A hidden page stops the motor, and so does a reset: whatever the old machine was playing is cut off and
    // forgotten, and the new machine's first press is felt at once.
    await tapIn();
    await forget();
    await setHidden(page, true);
    expect(await asked()).toContainEqual([0]);
    await setHidden(page, false);
    await tapIn();
    await forget();
    const reset = machine(page).getByTestId('pusher-reset');
    await reset.tap();
    await expect(reset).toHaveAttribute('data-armed', 'true');
    await reset.tap();
    await expect(reset).toHaveAttribute('data-armed', 'false');
    await expect(machine(page).getByTestId('pusher-played')).toHaveText('0');
    expect(await asked()).toContainEqual([0]);
    await forget();
    await tapIn();
    await expect.poll(async () => (await ticks()) - (await counter(page, 'played'))).toBe(0);
    // Switched off: whatever was playing is stopped, which is the last thing asked of the motor. Medals go on falling
    // and being fed, and none of it buzzes.
    await feelSwitch(page, 'vibration').tap();
    await expect(feelSwitch(page, 'vibration')).toHaveAttribute('aria-pressed', 'false');
    expect((await asked()).at(-1)).toEqual([0]);
    await forget();
    await feedButton(page, 'left').tap();
    await page.waitForTimeout(600);
    expect(await asked()).toEqual([]);
    await expectPurseToBalance(page);
  });

  test('on a phone with no vibration and no fullscreen, as an iPhone is, neither switch is shown and nothing is kept free for it', async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      delete (Navigator.prototype as unknown as { vibrate?: unknown }).vibrate;
      Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => false });
    });
    const trouble = watchForTrouble(page);
    await openGame(page);
    // The page has to have come to life before what it does not show means anything: a medal goes in only once it has.
    await feedOne(page);
    expect(await page.evaluate(() => typeof navigator.vibrate)).toBe('undefined');
    await expect(feelSwitch(page, 'sweep')).toBeVisible();
    await expect(feelSwitch(page, 'vibration')).toHaveCount(0);
    await expect(feelSwitch(page, 'fullscreen')).toHaveCount(0);
    await expect(machine(page).getByTestId('pusher-feel').getByRole('button')).toHaveCount(1);
    // Sweep is alone in its row, in the middle of it.
    await feelSwitch(page, 'sweep').scrollIntoViewIfNeeded();
    const [row, sweep] = await Promise.all([machine(page).getByTestId('pusher-feel').boundingBox(), feelSwitch(page, 'sweep').boundingBox()]);
    if (!row || !sweep) throw new Error('the row has no box');
    expect(Math.abs(sweep.x + sweep.width / 2 - (row.x + row.width / 2))).toBeLessThan(2);
    // The machine has played as anywhere, with nothing to buzz.
    await expectPurseToBalance(page);
    expect(trouble).toEqual([]);
  });
});

test('on a desk there is a fullscreen button and no vibration switch, and with less motion asked for vibration starts off', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await openGame(page);
  await alive(page);
  // A desktop browser has the vibration function and nothing to shake.
  await expect(feelSwitch(page, 'sweep')).toBeVisible();
  await expect(feelSwitch(page, 'fullscreen')).toBeVisible();
  await expect(feelSwitch(page, 'vibration')).toHaveCount(0);

  // A phone that asks for reduced motion: the switch is there, and off until the player says otherwise.
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce', baseURL: new URL(page.url()).origin });
  const phone = await context.newPage();
  await openGame(phone);
  await alive(phone);
  await expect(feelSwitch(phone, 'vibration')).toHaveAttribute('aria-pressed', 'false');
  await feelSwitch(phone, 'vibration').scrollIntoViewIfNeeded();
  await feelSwitch(phone, 'vibration').tap();
  await expect(feelSwitch(phone, 'vibration')).toHaveAttribute('aria-pressed', 'true');
  expect(await phone.evaluate((key) => window.localStorage.getItem(key), FEEL_STORAGE_KEY)).toBe(JSON.stringify({ v: 1, vibration: true, sweep: false }));
  await context.close();
});

test('F and J feed the left and right rails, and held together feed both', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);
  await feedOne(page);
  await page.waitForTimeout(400);
  // Where there is a keyboard, each button has its key written on it.
  await expect(feedButton(page, 'left').locator('kbd')).toHaveText('F');
  await expect(feedButton(page, 'right').locator('kbd')).toHaveText('J');
  await expect(machine(page).getByTestId('pusher-keys')).toContainText('F and J feed the left and right rails');

  // A tap of a key feeds one medal, like a press of its button.
  let before = await counter(page, 'played');
  await page.keyboard.press('f');
  await expect.poll(() => counter(page, 'played')).toBe(before + 1);
  await page.waitForTimeout(300);
  await page.keyboard.press('j');
  await expect.poll(() => counter(page, 'played')).toBe(before + 2);

  // Held, a key streams, and its button shows that it is down. The keyboard repeating the key is not more presses.
  await page.waitForTimeout(300);
  before = await counter(page, 'played');
  await page.keyboard.down('f');
  await page.keyboard.down('f');
  await page.keyboard.down('f');
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
  await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'false');
  await expect.poll(() => counter(page, 'played'), { timeout: 10_000 }).toBeGreaterThanOrEqual(before + 4);
  // The other key goes down as well: both rails feed, and a save taken meanwhile has medals on both.
  await page.keyboard.down('j');
  await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'true');
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'true');
  await expect.poll(() => railsInUse(page), { timeout: 20_000 }).toEqual([0, 1]);
  // Each stops when its own key comes up.
  await page.keyboard.up('f');
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'false');
  await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'true');
  await page.keyboard.up('j');
  await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'false');
  await page.waitForTimeout(300);
  const after = await counter(page, 'played');
  await page.waitForTimeout(900);
  expect(await counter(page, 'played')).toBe(after);

  // A key that is still down when the window loses the keyboard is let go.
  if ((await counter(page, 'credits')) > 0) {
    await page.keyboard.down('j');
    await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'true');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(feedButton(page, 'right')).toHaveAttribute('data-held', 'false');
    await page.keyboard.up('j');
  }
  // With a modifier held, the keys are the browser's and not the machine's.
  await page.waitForTimeout(300);
  const unmoved = await counter(page, 'played');
  await page.keyboard.press('Shift+F');
  await page.keyboard.press('Alt+j');
  await page.waitForTimeout(500);
  expect(await counter(page, 'played')).toBe(unmoved);
  await expectPurseToBalance(page);
});

test('the keys do nothing while another tab is showing or the focus is in a field', async ({ page }) => {
  await openGame(page);
  await feedOne(page);
  await page.waitForTimeout(400);
  const played = await counter(page, 'played');
  const aims = [await aimOf(page, 'left'), await aimOf(page, 'right')];

  // In a text field the keys are letters, and they are typed: the machine neither takes them nor acts on them.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'pusher-probe';
    document.querySelector('#pusher-panel-machine')?.append(input);
    input.focus();
  });
  await page.keyboard.type('fjsdkl');
  await expect(page.locator('#pusher-probe')).toHaveValue('fjsdkl');
  await page.keyboard.down('f');
  await page.waitForTimeout(500);
  await expect(feedButton(page, 'left')).toHaveAttribute('data-held', 'false');
  await page.keyboard.up('f');
  expect(await counter(page, 'played')).toBe(played);
  expect([await aimOf(page, 'left'), await aimOf(page, 'right')]).toEqual(aims);
  await page.evaluate(() => document.querySelector('#pusher-probe')?.remove());

  // With the Odds tab showing, the machine is out of sight and the keys are not its own.
  await page.getByRole('tab', { name: 'Odds' }).click();
  await expect(odds(page)).toBeVisible();
  await page.keyboard.down('f');
  await page.keyboard.down('j');
  await page.keyboard.press('d');
  await page.keyboard.press('k');
  await page.waitForTimeout(500);
  await page.keyboard.up('f');
  await page.keyboard.up('j');
  expect(await counter(page, 'played')).toBe(played);

  // Back on the Machine tab nothing has been fed and nothing has moved, and the keys work again.
  await page.getByRole('tab', { name: 'Machine' }).click();
  await expect(machine(page)).toBeVisible();
  expect(await counter(page, 'played')).toBe(played);
  expect([await aimOf(page, 'left'), await aimOf(page, 'right')]).toEqual(aims);
  await page.keyboard.press('j');
  await expect.poll(() => counter(page, 'played')).toBe(played + 1);
});

test('Auto drops medals until it is switched off', async ({ page }) => {
  await openGame(page);
  await feedOne(page);
  const before = await counter(page, 'played');
  await autoButton(page).click();
  await expect(autoButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThanOrEqual(before + 4);
  await autoButton(page).click();
  await expect(autoButton(page)).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(400);
  const after = await counter(page, 'played');
  await page.waitForTimeout(1_200);
  expect(await counter(page, 'played')).toBe(after);
  await expectPurseToBalance(page);
});

// ── The sound settings: a volume and a switch for the music, in a row that opens from a button beside Sound ──

const soundButton = (page: Page) => machine(page).getByTestId('pusher-sound');
const soundSettings = (page: Page) => machine(page).getByTestId('pusher-sound-settings');
const soundRow = (page: Page) => machine(page).getByTestId('pusher-sound-panel');
const volumeSlider = (page: Page) => machine(page).getByTestId('pusher-volume');
const musicSwitch = (page: Page) => machine(page).getByTestId('pusher-music');

/** Opens the row of sound settings with its button, retrying until hydration has attached the handler. */
async function openSoundSettings(page: Page) {
  await expect(async () => {
    if ((await soundSettings(page).getAttribute('aria-expanded')) !== 'true') await soundSettings(page).click({ timeout: 1_000 });
    await expect(soundRow(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test('the sound has a volume and a switch for the music, worked from the keyboard, in a row that opens beside Sound', async ({ page }) => {
  await openGame(page);
  await feedOne(page);
  // Closed, there is only the button, which says what it opens and that it is shut.
  await expect(soundSettings(page)).toHaveAccessibleName('Sound settings');
  await expect(soundSettings(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(soundRow(page)).toHaveCount(0);
  await openSoundSettings(page);
  await expect(soundSettings(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(machine(page).getByRole('group', { name: 'Sound settings' })).toBeVisible();

  // The volume is a slider with a name, on the level the cabinet was made at, which it says in words.
  await expect(volumeSlider(page)).toHaveAccessibleName('Volume');
  await expect(volumeSlider(page)).toHaveValue('100');
  await expect(volumeSlider(page)).toHaveAttribute('aria-valuetext', '100%, the usual level');
  await expect(machine(page).getByTestId('pusher-volume-value')).toHaveText('100%usual');
  // The arrow keys move it a step; Home is silent and End is as loud as it goes, twice the usual.
  await volumeSlider(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(volumeSlider(page)).toHaveValue('105');
  await expect(volumeSlider(page)).toHaveAttribute('aria-valuetext', '105%');
  await page.keyboard.press('Home');
  await expect(volumeSlider(page)).toHaveValue('0');
  await expect(volumeSlider(page)).toHaveAttribute('aria-valuetext', '0%, silent');
  await page.keyboard.press('End');
  await expect(volumeSlider(page)).toHaveValue('200');
  for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowLeft');
  await expect(volumeSlider(page)).toHaveValue('170');

  // The music has a switch of its own, which says which way it is.
  await expect(musicSwitch(page)).toHaveAccessibleName('Music');
  await expect(musicSwitch(page)).toHaveAttribute('aria-pressed', 'true');
  await musicSwitch(page).focus();
  await page.keyboard.press('Space');
  await expect(musicSwitch(page)).toHaveAttribute('aria-pressed', 'false');

  // A letter does nothing in a slider, so with the focus there the machine's keys are still the machine's,
  // as they are in the aim sliders: J feeds the right rail and the volume stays where it was.
  const played = await counter(page, 'played');
  await volumeSlider(page).focus();
  await page.keyboard.press('j');
  await expect.poll(() => counter(page, 'played')).toBe(played + 1);
  await expect(volumeSlider(page)).toHaveValue('170');

  // Escape shuts the row and puts the focus back on the button that opened it.
  await page.keyboard.press('Escape');
  await expect(soundRow(page)).toHaveCount(0);
  await expect(soundSettings(page)).toBeFocused();
  await expect(soundSettings(page)).toHaveAttribute('aria-expanded', 'false');
  // None of it has switched the sound on: that still takes its own press.
  await expect(soundButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expectPurseToBalance(page);
});

test('the sound settings are remembered on this device, apart from the machine, and nonsense is not believed', async ({ page }) => {
  await openGame(page);
  await feedOne(page);
  await openSoundSettings(page);
  await volumeSlider(page).focus();
  for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowLeft');
  await expect(volumeSlider(page)).toHaveValue('60');
  await musicSwitch(page).click();
  await expect(musicSwitch(page)).toHaveAttribute('aria-pressed', 'false');
  // They are kept under a key of their own, and the machine's save says nothing about them.
  expect(await page.evaluate((key) => window.localStorage.getItem(key), SOUND_SETTINGS_KEY)).toBe('{"volume":60,"music":false}');
  const saved = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  expect(saved).not.toBeNull();
  expect(saved).not.toMatch(/volume|music/);

  // After a reload the row is shut and the sound is off, as on any visit, and the settings are as they were left.
  await page.reload();
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
  await expect(soundRow(page)).toHaveCount(0);
  await expect(soundButton(page)).toHaveAttribute('aria-pressed', 'false');
  await openSoundSettings(page);
  await expect(volumeSlider(page)).toHaveValue('60');
  await expect(volumeSlider(page)).toHaveAttribute('aria-valuetext', '60%');
  await expect(musicSwitch(page)).toHaveAttribute('aria-pressed', 'false');

  // What is kept there but makes no sense is not believed: the settings are the usual ones.
  await page.evaluate((key) => window.localStorage.setItem(key, '{"volume":"loud","music":7}'), SOUND_SETTINGS_KEY);
  await page.reload();
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
  await openSoundSettings(page);
  await expect(volumeSlider(page)).toHaveValue('100');
  await expect(musicSwitch(page)).toHaveAttribute('aria-pressed', 'true');
  // A volume that is a number but out of range is brought into it.
  await page.evaluate((key) => window.localStorage.setItem(key, '{"volume":9000,"music":false}'), SOUND_SETTINGS_KEY);
  await page.reload();
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
  await openSoundSettings(page);
  await expect(volumeSlider(page)).toHaveValue('200');
  await expect(musicSwitch(page)).toHaveAttribute('aria-pressed', 'false');
});

test('on a phone the sound settings are one short row inside the controls, and the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGame(page);
  await feedOne(page);
  const controls = machine(page).getByTestId('pusher-controls');
  // The button is in the row of switches, beside Sound and as tall as it, and wide enough for a finger.
  const [sound, button, closed] = await Promise.all([soundButton(page).boundingBox(), soundSettings(page).boundingBox(), controls.boundingBox()]);
  if (!sound || !button || !closed) throw new Error('the switches have no boxes');
  expect(Math.abs(sound.y - button.y)).toBeLessThan(2);
  expect(Math.abs(sound.height - button.height)).toBeLessThan(2);
  expect(button.x).toBeGreaterThanOrEqual(sound.x + sound.width);
  expect(button.width).toBeGreaterThanOrEqual(32);
  expect(button.x + button.width).toBeLessThanOrEqual(closed.x + closed.width);

  await openSoundSettings(page);
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.inner);
  const [row, slider, music, open] = await Promise.all([soundRow(page).boundingBox(), volumeSlider(page).boundingBox(), musicSwitch(page).boundingBox(), controls.boundingBox()]);
  if (!row || !slider || !music || !open) throw new Error('the sound settings have no boxes');
  // The row is inside the controls, under the switches, and short: it adds less than the height of a feed button.
  expect(row.x).toBeGreaterThanOrEqual(open.x);
  expect(row.x + row.width).toBeLessThanOrEqual(open.x + open.width);
  expect(row.y).toBeGreaterThan(button.y + button.height - 1);
  expect(row.height).toBeLessThanOrEqual(72);
  expect(open.height - closed.height).toBeLessThanOrEqual(80);
  // The slider has room to be dragged, and the music's switch is beside it, both inside the row.
  expect(slider.width).toBeGreaterThanOrEqual(140);
  expect(slider.x).toBeGreaterThanOrEqual(row.x);
  expect(music.x).toBeGreaterThanOrEqual(slider.x + slider.width);
  expect(music.x + music.width).toBeLessThanOrEqual(row.x + row.width);
  expect(music.y).toBeGreaterThanOrEqual(row.y);
  expect(music.y + music.height).toBeLessThanOrEqual(row.y + row.height);
  // The feed buttons and the aims are where they were: the row opened under them.
  await expect(feedButton(page, 'left')).toBeVisible();
  await expect(aimSlider(page, 'right')).toBeVisible();
  const aim = await aimSlider(page, 'left').boundingBox();
  expect(aim && aim.y + aim.height).toBeLessThan(row.y);
});

test('each rail can be aimed from the keyboard, by its slider and by the keys beside its feed key', async ({ page }) => {
  await openGame(page);
  await feedOne(page);
  await page.waitForTimeout(400);
  const fed = await counter(page, 'played');
  // A slider for each rail, with a name of its own, on where a new machine points it.
  await expect(aimSlider(page, 'left')).toHaveAccessibleName(/Left rail aim/);
  await expect(aimSlider(page, 'right')).toHaveAccessibleName(/Right rail aim/);
  await aimSlider(page, 'left').focus();
  await expect(aimSlider(page, 'left')).toHaveValue('42');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(aimSlider(page, 'left')).toHaveValue('45');
  await expect(aimSlider(page, 'left')).toHaveAttribute('aria-valuetext', '45% across');
  await expect(aimSlider(page, 'right')).toHaveValue('58');
  // Each goes as far as its own rail reaches: the left one from the left edge to a little past the middle.
  await page.keyboard.press('Home');
  await expect(aimSlider(page, 'left')).toHaveValue('0');
  await aimSlider(page, 'right').focus();
  await page.keyboard.press('End');
  await expect(aimSlider(page, 'right')).toHaveValue('100');
  await aimSlider(page, 'left').focus();
  await page.keyboard.press('End');
  await expect(aimSlider(page, 'left')).toHaveValue('61');
  await aimSlider(page, 'right').focus();
  await page.keyboard.press('Home');
  // The rails do not cross: the right one comes as far left as the left one is, and no further.
  await expect(aimSlider(page, 'right')).toHaveValue('61');
  await page.keyboard.press('End');
  await aimSlider(page, 'left').focus();
  await page.keyboard.press('Home');

  // S and D move the left rail's aim and K and L the right rail's, wherever the focus is but in a field.
  await feedButton(page, 'left').focus();
  await page.keyboard.press('d');
  await expect.poll(() => aimOf(page, 'left')).toBeGreaterThan(0);
  await page.keyboard.down('d');
  await expect.poll(() => aimOf(page, 'left'), { timeout: 10_000 }).toBeGreaterThan(15);
  await page.keyboard.up('d');
  const left = await aimOf(page, 'left');
  await page.keyboard.down('k');
  await expect.poll(() => aimOf(page, 'right'), { timeout: 10_000 }).toBeLessThan(85);
  await page.keyboard.up('k');
  await page.waitForTimeout(200);
  const right = await aimOf(page, 'right');
  await page.keyboard.press('s');
  await expect.poll(() => aimOf(page, 'left')).toBeLessThan(left);
  await page.keyboard.press('l');
  await expect.poll(() => aimOf(page, 'right')).toBeGreaterThan(right);
  // Aiming feeds nothing.
  expect(await counter(page, 'played')).toBe(fed);
});

test('the tabs work from the keyboard and the machine waits while it is out of sight', async ({ page }) => {
  await openGame(page);
  await feedOne(page);
  await autoButton(page).click();
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);

  const tabs = page.getByRole('tab');
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(odds(page)).toBeVisible();
  await expect(machine(page)).toBeHidden();

  await page.waitForTimeout(400);
  const paused = await counter(page, 'played');
  await page.waitForTimeout(1_500);
  expect(await counter(page, 'played')).toBe(paused);

  // End goes to the last tab, which is Records, and the arrow comes back from it.
  await page.keyboard.press('End');
  await expect(tabs.nth(3)).toBeFocused();
  await expect(records(page)).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(2)).toBeFocused();
  await expect(sim(page)).toBeVisible();
  await page.keyboard.press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  await expect(machine(page)).toBeVisible();
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThan(paused);
  await expectPurseToBalance(page);
});

test('the odds tab lists the exact chances and works out a return', async ({ page }) => {
  await openGame(page);
  await page.getByRole('tab', { name: 'Odds' }).click();
  await expect(odds(page)).toBeVisible();

  const slot = odds(page).getByTestId('pusher-slot-table');
  await expect(slot.locator('tr[data-tier="seven"]')).toContainText('0.7%');
  await expect(slot.locator('tr[data-tier="seven"]')).toContainText('1 in 143');
  await expect(slot.locator('tr[data-tier="seven"]')).toContainText('A prize ball on the field');
  await expect(slot.locator('tr[data-tier="big"]')).toContainText('A choice of three chests');
  await expect(slot.locator('tr[data-tier="small"]')).toContainText('A roll on the sugoroku board');
  await expect(slot.locator('tr[data-tier="small"]')).toContainText('8.8 medals');
  await expect(odds(page).getByTestId('pusher-board-table').locator('tbody td')).toHaveCount(12);
  await expect(odds(page).getByTestId('pusher-chest-table').locator('tbody tr')).toHaveCount(3);
  await expect(slot.locator('tr[data-tier="miss"]')).toContainText('93.8%');
  // How far to trust a reach: the long one hits far more often than the ordinary one.
  const reach = odds(page).getByTestId('pusher-reach-table');
  await expect(reach.locator('tbody tr')).toHaveCount(3);
  await expect(reach.locator('tr[data-reach="long"]')).toContainText('63.8%');
  await expect(reach.locator('tr[data-reach="normal"]')).toContainText('17.2%');
  await expect(reach.locator('tr[data-reach="any"]')).toContainText('30.6%');
  await expect(odds(page).getByTestId('pusher-roulette-table').locator('tbody tr')).toHaveCount(5);
  await expect(odds(page).getByTestId('pusher-roulette-table').locator('tr[data-pocket="stop"]')).toContainText('33.3%');
  // Four numbers in a row lead to the three bowls: a row for what the holes of each bowl do, and each of the three ends one time in three.
  await expect(odds(page).getByTestId('pusher-chain-table').locator('tbody td')).toHaveCount(4);
  await expect(odds(page).getByTestId('pusher-chain-table').locator('tbody td').last()).toHaveText('19.8%');
  await expect(odds(page).getByTestId('pusher-bowl-table').locator('tbody')).toHaveCount(3);
  await expect(odds(page).getByTestId('pusher-bowl-table').locator('tbody tr[data-hole]')).toHaveCount(5);
  await expect(odds(page).getByTestId('pusher-bowl-table').locator('tr[data-bowl="1"][data-hole="down"]')).toContainText('66.7%');
  await expect(odds(page).getByTestId('pusher-bowl-table').locator('tr[data-hole="jackpot"]')).toContainText('33.3%');
  await expect(odds(page)).toContainText('One ball in 15.2 wins it, and one spin in 2,170 leads to it');
  await expect(odds(page).getByTestId('pusher-value-table')).toContainText('63.7 medals');
  await expect(odds(page).getByTestId('pusher-value-table')).toContainText('1.096 medals');
  // Chance time: an ordinary spin and a gold one to five places, and what being gold adds, the same at every size of jackpot.
  const chance = odds(page).getByTestId('pusher-chance-table');
  await expect(chance.locator('tbody tr')).toHaveCount(3);
  await expect(chance.locator('tbody tr').first()).toContainText('1.09614 medals');
  await expect(chance.locator('tbody tr').first()).toContainText('1.74614 medals');
  await expect(chance.locator('tbody td', { hasText: '0.65000 medals' })).toHaveCount(3);
  await expect(odds(page)).toContainText('turns one of the held spins gold');

  // 80% by the front and 0.18 spins a medal at 1.096 medals a spin.
  const result = odds(page).getByTestId('pusher-calc-return');
  await expect(result).toHaveText('95.8%');
  await expect(result).toHaveAttribute('data-sign', 'neg');
  await expect(odds(page).getByTestId('pusher-calc-note')).toContainText('23%');

  const front = odds(page).getByRole('slider', { name: /leave by the front/ });
  await front.focus();
  await page.keyboard.press('End');
  await expect(result).toHaveAttribute('data-sign', 'pos');
  await expect(result).toHaveText('119.7%');
  await page.keyboard.press('Home');
  await expect(result).toHaveText('59.9%');
  await expect(odds(page).getByTestId('pusher-calc-note')).toContainText('91%');
});

test('the simulation measures the four aims and can be cancelled', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  await expect(sim(page)).toBeVisible();
  await sim(page).getByLabel('Medals per aim').selectOption('500');

  const run = sim(page).getByTestId('pusher-sim-run');
  await run.click();
  await expect(sim(page).getByTestId('pusher-sim-result')).toBeVisible({ timeout: 90_000 });
  await expect(run).toHaveText('Run');
  await expect(sim(page).getByRole('heading', { name: '500 medals per aim, 5 a second' })).toBeVisible();

  const rows = sim(page).getByTestId('pusher-sim-table').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  // Fed down the middle, about one medal in six ends up through a START pocket on the pusher's lip (13% to 22% over
  // twenty runs of this size, and more when a tower goes over through one). Fed at the edges far fewer do, though
  // some: the pile carries medals across, and what the screen pays lands all over the pusher.
  const cells = (aim: string) => sim(page).locator(`tr[data-aim="${aim}"] td`);
  const throughAPocket = async (aim: string) => Number(((await cells(aim).nth(3).textContent()) ?? '').replace('%', ''));
  const middle = await throughAPocket('centre');
  expect(middle).toBeGreaterThan(8);
  expect(middle).toBeLessThan(40);
  expect(await throughAPocket('edges')).toBeLessThan(middle);
  for (const aim of ['centre', 'anywhere', 'beside', 'edges']) {
    const front = Number(((await cells(aim).nth(2).textContent()) ?? '').replace('%', ''));
    expect(front).toBeGreaterThan(60);
    expect(front).toBeLessThan(92);
  }
  await expect(sim(page).locator('svg[role="img"] polyline')).toHaveCount(4);
  await expect(sim(page).getByTestId('pusher-sim-slot').locator('tbody tr')).toHaveCount(4);

  // A second run can be stopped, and the first result stays.
  await sim(page).getByLabel('Medals per aim').selectOption('2000');
  await run.click();
  const cancel = sim(page).getByTestId('pusher-sim-cancel');
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(cancel).toHaveCount(0);
  await expect(run).toHaveText('Run');
  await expect(run).toBeEnabled();
  await expect(sim(page).getByRole('heading', { name: '500 medals per aim, 5 a second' })).toBeVisible();
});

test('reads in Japanese', async ({ page }) => {
  await openGame(page, 'ja');
  await expect(page.getByRole('heading', { level: 1, name: /メダルプッシャー/ })).toBeVisible();
  await expect(feedButton(page, 'left')).toHaveAccessibleName('左のレールにメダルを入れる');
  await expect(feedButton(page, 'right')).toHaveAccessibleName('右のレールにメダルを入れる');
  await expect(aimSlider(page, 'left')).toHaveAccessibleName(/左のレールの狙い/);
  await expect(machine(page).getByTestId('pusher-caption')).toContainText('1·3·5·9 ▸ 宝箱');
  await expect(machine(page).getByTestId('pusher-mode')).toHaveText('ナンバースロット');
  await expect(page.getByRole('tab', { name: '確率' })).toBeVisible();
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(odds(page).getByTestId('pusher-slot-table')).toContainText('143回に1回');
  await expect(odds(page).getByTestId('pusher-slot-table')).toContainText('3つの宝箱から1つ選ぶ');
  await expect(odds(page).getByTestId('pusher-reach-table')).toContainText('スーパーリーチ');
  await expect(odds(page).getByTestId('pusher-reach-table')).toContainText('信頼度');
  await expect(odds(page).getByTestId('pusher-bowl-table')).toContainText('ジャックポット');
  await expect(odds(page).getByTestId('pusher-bowl-table')).toContainText('3段目');
  await expect(odds(page)).toContainText('数字が4回続くとジャックポットチャレンジが始まります');
});

test('fits a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGame(page);
  await feedOne(page);
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.inner);
  const box = await machine(page).getByTestId('pusher-field').boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.width).toBeLessThanOrEqual(375);
  // The two feed buttons are at the two ends of the controls, the medals on a plate between them, and each is big enough for a thumb.
  const [leftButton, plate, rightButton] = await Promise.all([
    feedButton(page, 'left').boundingBox(),
    machine(page).getByTestId('pusher-credits').boundingBox(),
    feedButton(page, 'right').boundingBox(),
  ]);
  if (!leftButton || !plate || !rightButton) throw new Error('the controls have no boxes');
  expect(leftButton.x).toBeGreaterThanOrEqual(0);
  expect(leftButton.x + leftButton.width).toBeLessThan(plate.x);
  expect(plate.x + plate.width).toBeLessThan(rightButton.x);
  expect(rightButton.x + rightButton.width).toBeLessThanOrEqual(375);
  expect(Math.abs(leftButton.y - rightButton.y)).toBeLessThan(2);
  for (const button of [leftButton, rightButton]) {
    expect(button.width).toBeGreaterThanOrEqual(64);
    expect(Math.abs(button.width - button.height)).toBeLessThan(2);
  }
  // A touch on one is the button's alone, so two can be held: the browser does not scroll or zoom with it.
  for (const rail of ['left', 'right'] as const) await expect(feedButton(page, rail)).toHaveCSS('touch-action', 'none');
  await expect(aimSlider(page, 'left')).toBeVisible();
  await expect(aimSlider(page, 'right')).toBeVisible();

  // The screen is inside the stage, in its upper part, and nearly as wide.
  const screenBox = await machine(page).getByTestId('pusher-screen').boundingBox();
  const title = await machine(page).getByTestId('pusher-mode').boundingBox();
  if (!box || !screenBox || !title) throw new Error('the stage has no box');
  expect(screenBox.x).toBeGreaterThan(box.x);
  expect(screenBox.x + screenBox.width).toBeLessThan(box.x + box.width);
  expect(screenBox.y).toBeGreaterThan(box.y);
  expect(screenBox.y + screenBox.height).toBeLessThan(box.y + box.height / 2);
  expect(screenBox.width).toBeGreaterThan(250);
  // Its title is on it, in one line, large enough to read.
  expect(title.x).toBeGreaterThanOrEqual(screenBox.x);
  expect(title.x + title.width).toBeLessThanOrEqual(screenBox.x + screenBox.width);
  expect(title.height).toBeGreaterThanOrEqual(11);
  expect(title.height).toBeLessThan(20);
  // What each line of the slot leads to is under the stage, where there is room to read it, and not on the screen as well.
  await expect(machine(page).getByTestId('pusher-legend')).toBeVisible();
  await expect(machine(page).getByTestId('pusher-legend')).toContainText('7·7·7 ▸ BALL');
  await expect(machine(page).getByTestId('pusher-caption').locator('span span').first()).toBeHidden();
  const legend = await machine(page).getByTestId('pusher-legend').boundingBox();
  expect(legend?.y).toBeGreaterThanOrEqual(box.y + box.height);

  // The hold's eight lamps are drawn in the cabinet, under the screen. The page still has one for each, under the
  // name the hold always had, for whoever cannot see the picture: they take up no room on the screen.
  const lamps = machine(page).getByTestId('pusher-stock').locator('[data-lit]');
  await expect(lamps).toHaveCount(8);
  await expect(machine(page).getByTestId('pusher-stock')).toHaveAttribute('aria-label', /of 8 spins held/);
  const held = await machine(page).getByTestId('pusher-stock').boundingBox();
  expect(held?.width ?? 0).toBeLessThan(2);

  // All twelve tiles of the sugoroku board lie inside the screen, each wide enough to read, and the far side of the
  // board is drawn smaller than the near side: it is seen in perspective, whatever the screen is playing.
  const tiles = await machine(page)
    .getByTestId('pusher-board')
    .locator('li')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
  expect(tiles).toHaveLength(12);
  for (const tile of tiles) {
    expect(tile.width).toBeGreaterThanOrEqual(24);
    expect(tile.x).toBeGreaterThanOrEqual(screenBox.x);
    expect(tile.x + tile.width).toBeLessThanOrEqual(screenBox.x + screenBox.width);
    expect(tile.y).toBeGreaterThanOrEqual(screenBox.y);
    expect(tile.y + tile.height).toBeLessThanOrEqual(screenBox.y + screenBox.height);
  }
  // Square 2 is on the near side and square 8, the fever, on the far side.
  expect(tiles[7].width).toBeLessThan(tiles[1].width);

  await page.getByRole('tab', { name: 'Odds' }).click();
  const oddsSizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(oddsSizes.scroll).toBeLessThanOrEqual(oddsSizes.inner);
});

test('a jackpot is counted out on the screen and on the marquee, up to what was paid and no further', async ({ page }) => {
  // A machine that has just won. A full run of four tens is behind it and the ball is in the funnel of the last of
  // the three bowls; it is played on here until the ball has dropped and the jackpot is half counted out, and
  // saved as the game saves one, for the page to find. That leaves the page over five seconds of the show.
  const session = createSession(5);
  const ten = ROULETTE.indexOf(10);
  session.roulettes = 1;
  session.roulette = {
    pocket: ten,
    from: ten,
    elapsed: TIMING.roulette + TIMING.step,
    duration: TIMING.roulette,
    landed: true,
    level: CHAIN_GOAL,
    total: 10 * CHAIN_GOAL,
    gain: 0,
    over: false,
    jackpot: false,
    bowl: { holes: [0, 0, 0], stage: 2, elapsed: BOWL_TIMES[2] - 0.5, duration: BOWL_TIMES[2], payout: -1 },
  };
  for (let i = 0; i < 3 * 60; i++) advance(session, 1 / 60);
  expect(session.roulette?.bowl?.payout).toBe(JACKPOT_START);
  expect(session.paidOut).toBe(JACKPOT_START);
  const save = serialize(session);
  expect(restore(save, 1)).not.toBeNull();
  await page.addInitScript(
    ([key, text]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text);
    },
    [STORAGE_KEY, save],
  );
  await openGame(page);
  // The bowls are on the screen, the view down at the last of them, and the hole the ball took in each is lit.
  const screen = machine(page).getByTestId('pusher-screen');
  await expect(screen).toHaveAttribute('data-mode', 'bowl');
  await expect(screen).toHaveAttribute('data-banner', 'jackpot');
  await expect(machine(page).getByTestId('pusher-bowl')).toHaveAttribute('data-stage', '2');
  await expect(machine(page).getByTestId('pusher-bowl')).toHaveAttribute('data-fallen', '0 0 0');
  await expect(machine(page).getByTestId('pusher-ladder').locator('li')).toHaveCount(3);
  // The jackpot has the stage, and the plate on the marquee counts with it.
  await expect(machine(page).getByTestId('pusher-pay-show')).toHaveAttribute('data-kind', 'jackpot');
  const plate = machine(page).getByTestId('pusher-jackpot');
  await expect(plate).toHaveAttribute('data-counting', 'true');
  // Both run up to what the jackpot stood at and stop there, and that is what the machine has paid.
  await expect(machine(page).getByTestId('pusher-pay-count')).toHaveText(`+${JACKPOT_START}`, { timeout: 20_000 });
  await expect(plate).toHaveText(String(JACKPOT_START));
  expect(await counter(page, 'paid')).toBe(JACKPOT_START);
});

test('a ball’s roulette is a wheel behind a window: twelve pockets on the board of the run, and the ball’s pocket lit when it lands', async ({ page }) => {
  // A machine saved as the game saves one: one number of the run behind it, and the second turn just begun, the
  // ball on its way to a ten.
  const session = createSession(5);
  const ten = ROULETTE.indexOf(10);
  session.roulettes = 1;
  session.roulette = { pocket: ten, from: ten, elapsed: 0, duration: TIMING.roulette, landed: false, level: 1, total: 10, gain: 0, over: false, jackpot: false, bowl: null };
  const save = serialize(session);
  expect(restore(save, 1)).not.toBeNull();
  await page.addInitScript(
    ([key, text]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text);
    },
    [STORAGE_KEY, save],
  );
  await openGame(page);
  // The monitor has given way to the ball's lottery, and the wheel is in it: a rotor of twelve pockets, four of
  // them crosses, the ball on it, and beside it the four boards of the run.
  const screen = machine(page).getByTestId('pusher-screen');
  await expect(screen).toHaveAttribute('data-mode', 'roulette');
  await expect(screen).toHaveAttribute('data-monitor', 'challenge');
  const wheel = machine(page).getByTestId('pusher-wheel');
  await expect(wheel.locator('g[data-pocket]')).toHaveCount(ROULETTE.length);
  await expect(wheel.locator('g[data-holds="stop"]')).toHaveCount(4);
  await expect(machine(page).getByTestId('pusher-wheel-ball')).toHaveCount(1);
  await expect(machine(page).getByTestId('pusher-boards').locator('li')).toHaveCount(4);
  // The ball lands in the pocket that was drawn, which lights, and its ten is paid.
  await expect(wheel.locator(`g[data-pocket="${ten}"]`)).toHaveAttribute('data-lit', 'true', { timeout: 20_000 });
  await expect.poll(() => counter(page, 'paid'), { timeout: 10_000 }).toBeGreaterThanOrEqual(10);
});
