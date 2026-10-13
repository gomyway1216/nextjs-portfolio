import { test, expect, type Page } from '@playwright/test';

import { SLOT, slotSpot } from '../../src/components/game/MedalPusher/arms';
import { CHESTS, JACKPOT_START } from '../../src/components/game/MedalPusher/lottery';
import { START_CREDITS, createSession } from '../../src/components/game/MedalPusher/session';
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

  await page.keyboard.press('End');
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
  // Four numbers in a row lead to the bowl, and each of its three holes is as likely as the next.
  await expect(odds(page).getByTestId('pusher-chain-table').locator('tbody td')).toHaveCount(4);
  await expect(odds(page).getByTestId('pusher-chain-table').locator('tbody td').last()).toHaveText('19.8%');
  await expect(odds(page).getByTestId('pusher-bowl-table').locator('tbody tr')).toHaveCount(3);
  await expect(odds(page).getByTestId('pusher-bowl-table').locator('tr[data-hole="jackpot"]')).toContainText('33.3%');
  await expect(odds(page)).toContainText('One ball in 15.2 wins it, and one spin in 2,170 leads to it');
  await expect(odds(page).getByTestId('pusher-value-table')).toContainText('63.7 medals');
  await expect(odds(page).getByTestId('pusher-value-table')).toContainText('1.096 medals');

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
