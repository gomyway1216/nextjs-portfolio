import { test, expect, type BrowserContext, type Page } from './fixtures';

import { LAMP_COUNT, NUMBER_SEGMENTS, NUMBER_SEGMENT_COUNT, SEGMENT_COUNT, WHEEL } from '../../src/components/game/BigWheel/engine';
import { SPIN_KEY as BIG_WHEEL_SPIN_KEY, parseSpinRecord as parseBigWheelSpin } from '../../src/components/game/BigWheel/medalTable';
import { numbersFor as coinMazeNumbers, type Draw as CoinMazeDraw } from '../../src/components/game/CoinMaze/engine';
import { PLAY_KEY as COIN_MAZE_PLAY_KEY, parsePlay as parseCoinMazePlay } from '../../src/components/game/CoinMaze/medalTable';
import { numbersFor as kenoNumbers } from '../../src/components/game/Keno/engine';
import { GAME_KEY as KENO_GAME_KEY, parseGame as parseKenoGame } from '../../src/components/game/Keno/medalTable';
import { drawFor as towerDrawFor, numbersFor as towerNumbers } from '../../src/components/game/BallTower/engine';
import { RUN_KEY as TOWER_RUN_KEY, parseRun as parseTowerRun } from '../../src/components/game/BallTower/medalTable';
import { BANK_KEY } from '../../src/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, parseLedger } from '../../src/components/game/MedalCenter/ledger';
import { MARBLES, STAKE as SMART_BALL_STAKE, numbersFor as smartBallNumbers, slotFor } from '../../src/components/game/SmartBall/engine';
import { PLAY_KEY as SMART_BALL_PLAY_KEY, parsePlay as parseSmartBallPlay } from '../../src/components/game/SmartBall/medalTable';
import { CORKS as GALLERY_CORKS, STAKE as GALLERY_STAKE, numbersFor as galleryNumbers, type Draw as GalleryDraw } from '../../src/components/game/ShootingGallery/engine';
import { PLAY_KEY as GALLERY_PLAY_KEY, parsePlay as parseGalleryPlay } from '../../src/components/game/ShootingGallery/medalTable';
import { numberForFace, numberForLamp } from '../../src/components/game/Sugoroku/engine';
import { BOARD_KEY as SUGOROKU_BOARD_KEY, parseBoard as parseSugorokuBoard } from '../../src/components/game/Sugoroku/medalTable';
import { instantScroll } from './instantScroll';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { openRoulette, placeFirstBet, shownBet, spinButton } from './roulettePage';
import { arrived } from './streamedPage';

// A press made the moment a machine's button is drawn enabled is taken (the High & Low Ladder's own test is in
// high-low.spec.ts).
//
// Each of these machines asks a copy of "may play" (a ref) before it acts on a press, and an effect that ran after the
// paint brought the copy up to date. A press that came between the two was silently dropped. That gap opened only when
// the buttons lit on a render that nothing else hurried along: as a round settles at the end of its show, the medals
// move at the bank and React draws that render and runs its effects at once, so the copy was right in time. But when
// the bank had nothing to do as the buttons lit, the effects waited for the paint. Each test presses at such a moment,
// where the machine has one: the next race opening after the result is held, a round the medal center settled while it
// borrowed the medals (the day's bonus taken in another tab), a spin wiped by a reset there. Smart Ball and Coin Maze
// settle every play as it ends (or as the card goes), so their START and DROP have no such moment; their tests press as
// a play ends, to keep it so.
//
// The press is made from a MutationObserver the instant the button's `disabled` goes away, before the page has run
// anything after drawing it, as a quick player's press can come. It is made twice in that moment where a press stakes
// medals or puts bets back: a double press stakes once, and puts them back once. The floor's API answers at once
// (fixtures.ts); nothing reaches a real server.

test.beforeEach(async ({ context }) => {
  // One button after another on a page taller than the window: the page scrolls at once, so no press lands elsewhere.
  await instantScroll(context);
});

/** The bank, and the machine's round on record (`round`), as stored just before the presses and just after them. */
interface AsLit {
  bank: [string | null, string | null];
  round: [string | null, string | null];
}

/**
 * Arms `times` presses of the button `selector` names for the instant it is next drawn enabled after being disabled (a
 * button lit already has to go off first): from a MutationObserver on its `disabled`, all of them in that one moment.
 * `pressedAsLit` waits for them, and says what was stored under `roundKey` around them.
 */
async function pressAsItLights(page: Page, selector: string, { roundKey = '', times = 2 }: { roundKey?: string; times?: number } = {}): Promise<void> {
  await page.evaluate(
    ({ selector, times, bankKey, roundKey }) => {
      const w = window as unknown as { __asLit?: Promise<unknown> };
      const button = document.querySelector<HTMLButtonElement>(selector);
      const read = () => [window.localStorage.getItem(bankKey), roundKey ? window.localStorage.getItem(roundKey) : null];
      w.__asLit = new Promise((resolve, reject) => {
        if (!button) return reject(new Error(`no ${selector} on the page`));
        let off = button.disabled;
        const timer = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error(`${selector} never lit again`));
        }, 60_000);
        const observer = new MutationObserver(() => {
          if (button.disabled) {
            off = true;
            return;
          }
          if (!off) return;
          observer.disconnect();
          window.clearTimeout(timer);
          const before = read();
          for (let i = 0; i < times; i++) button.click();
          const after = read();
          resolve({ bank: [before[0], after[0]], round: [before[1], after[1]] });
        });
        observer.observe(button, { attributes: true, attributeFilter: ['disabled'] });
      });
      // Waited for later (`pressedAsLit`): a button that never lights again fails the test there, not the page.
      w.__asLit.catch(() => undefined);
    },
    { selector, times, bankKey: BANK_KEY, roundKey },
  );
}

const byTestId = (id: string) => `[data-testid="${id}"]`;

const pressedAsLit = (page: Page): Promise<AsLit> => page.evaluate(() => (window as unknown as { __asLit: Promise<AsLit> }).__asLit);

/** What the presses made as the button lit took out of the medals (negative) or put in. */
function stakedAsLit({ bank: [before, after] }: AsLit): number {
  const was = parseLedger(before);
  const now = parseLedger(after);
  expect(was, 'the bank as the button lit').not.toBeNull();
  expect(now, 'the bank after the presses').not.toBeNull();
  return balanceOf(now!) - balanceOf(was!);
}

/** Opens a machine's page in English, and waits until it holds the player's medals. */
async function openMachine(page: Page, baseURL: string | undefined, path: string, machine: string): Promise<void> {
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: baseURL ?? 'http://localhost:3000' }]);
  expect((await page.goto(path))?.status()).toBe(200);
  await arrived(page);
  await expect(page.getByTestId(machine)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const stored = (page: Page, key: string) => page.evaluate((k) => window.localStorage.getItem(k), key);

/**
 * The medal center, open in another tab with the day's bonus there to take, and the machine's page brought back in
 * front of it. Opened before the round, so that the bonus can be taken while the round's show is still on.
 */
async function hubBehind(context: BrowserContext, page: Page): Promise<Page> {
  const hub = await context.newPage();
  await openCenter(hub);
  await expect(hub.getByTestId('pusher-bonus-take')).toBeVisible();
  await page.bringToFront();
  return hub;
}

/**
 * The day's bonus taken at the medal center while the round's show is on: it borrows the medals for a moment, and the
 * round is settled as they go (`settled` says when it has). Then the tab is closed, and the medals come back.
 */
async function bonusWhileOn(hub: Page, settled: () => Promise<boolean>): Promise<void> {
  await hub.getByTestId('pusher-bonus-take').click();
  await expect(hub.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  await expect.poll(settled).toBe(true);
  await hub.close();
}

test('Roulette: a bet pressed as the ball stops, after the medal center was reset while it rolled, is taken', async ({ page, context }) => {
  test.setTimeout(60_000);
  const hub = await hubBehind(context, page);
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await expect.poll(() => shownBet(page)).toBe(1);
  await pressAsItLights(page, 'button[aria-label="Red (1:1)"]', { times: 1 });
  await spinButton(page).click();
  await expect(page.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'true');
  // The medal center's reset while the ball rolls: the spin goes with every other medal, and the felt lights as the
  // ball stops, with nothing to settle.
  await hub.getByTestId('center-reset').click();
  await hub.getByTestId('center-reset-confirm').click();
  await expect(hub.getByTestId('center-balance')).toHaveText(String(WELCOME));
  await expect(page.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'true');
  await hub.close();
  expect(stakedAsLit(await pressedAsLit(page))).toBe(0);
  await expect.poll(() => shownBet(page)).toBe(1);
  await expect(page.getByRole('button', { name: /^Red \(1:1\)$/ })).toHaveText('RED1');
  await expect(page.getByTestId('roulette-result')).toHaveText('');
  expect(await bankBalance(page)).toBe(WELCOME);
});

test('Big Wheel: Rebet pressed as the wheel stops, on a spin the medal center settled while it turned, puts the bets back once', async ({ page, context, baseURL }) => {
  test.setTimeout(60_000);
  const hub = await hubBehind(context, page);
  await openMachine(page, baseURL, '/games/big-wheel', 'bw-machine');
  const two = page.getByTestId('bw-spot-2');
  await pressUntil(two, async () => Number(await two.getAttribute('data-amount')) > 0);
  await expect(two).toHaveAttribute('data-amount', '1');
  // The wheel stops on 4: the medal on 2 lost.
  const stop = WHEEL.indexOf(4);
  await rigPresses(page, [(stop + 0.5) / SEGMENT_COUNT, 0.5 / LAMP_COUNT, (NUMBER_SEGMENTS.indexOf(NUMBER_SEGMENTS[0]) + 0.5) / NUMBER_SEGMENT_COUNT]);
  await pressAsItLights(page, byTestId('bw-rebet'));
  await page.getByTestId('bw-spin').click();
  await bonusWhileOn(hub, async () => parseBigWheelSpin(await stored(page, BIG_WHEEL_SPIN_KEY))?.paid === true);
  await expect(page.getByTestId('bw-machine')).toHaveAttribute('data-phase', 'spin');
  expect(stakedAsLit(await pressedAsLit(page))).toBe(0);
  await expect(two).toHaveAttribute('data-amount', '1');
  await expect(page.getByTestId('bw-rebet')).toBeDisabled();
});

test('Horse Race: Rebet pressed as betting opens on the next race puts the last tickets back once', async ({ page, baseURL }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMachine(page, baseURL, '/games/horse-race', 'hr-machine');
  const win1 = page.getByTestId('hr-ticket-win:1');
  await pressUntil(win1, async () => Number(await win1.getAttribute('data-medals')) > 0);
  await expect(win1).toHaveAttribute('data-medals', '1');
  // The horses come home in gate order, 1 then 2; the result is held on the board for a moment, and then the next
  // race's betting opens, with nothing at the bank.
  await rigPresses(page, [0, 0, 0, 0]);
  await pressAsItLights(page, byTestId('hr-rebet'));
  await page.getByTestId('hr-start').click();
  expect(stakedAsLit(await pressedAsLit(page))).toBe(0);
  await expect(page.getByTestId('hr-race')).toHaveText('RACE 2');
  await expect(win1).toHaveAttribute('data-medals', '1');
  await expect(page.getByTestId('hr-rebet')).toBeDisabled();
});

/** Keno's twenty balls: the smallest numbers, `avoid` left out. */
const kenoBalls = (avoid: number): number[] => Array.from({ length: 21 }, (_, i) => i + 1).filter((n) => n !== avoid).slice(0, 20);

test('Keno: DRAW pressed as the last ball is out, on a game the medal center settled while it was drawn, draws the next game once', async ({ page, context, baseURL }) => {
  test.setTimeout(60_000);
  const hub = await hubBehind(context, page);
  await openMachine(page, baseURL, '/games/keno', 'kn-machine');
  const spot = page.getByTestId('kn-cell-40');
  // A phone shows one half of the board at a time.
  if (!(await spot.isVisible())) await page.getByTestId('kn-half-top').click();
  await pressUntil(spot, async () => (await spot.getAttribute('aria-pressed')) === 'true');
  // Two games on a bet of 1, neither catching 40: the second is the press as DRAW lights.
  await rigPresses(page, [...kenoNumbers(kenoBalls(40)), ...kenoNumbers(kenoBalls(40))]);
  await pressAsItLights(page, byTestId('kn-draw'), { roundKey: KENO_GAME_KEY });
  await page.getByTestId('kn-draw').click();
  await bonusWhileOn(hub, async () => parseKenoGame(await stored(page, KENO_GAME_KEY))?.paid === true);
  await expect(page.getByTestId('kn-machine')).toHaveAttribute('data-phase', 'draw');
  const asLit = await pressedAsLit(page);
  expect(stakedAsLit(asLit)).toBe(-1);
  const [first, next] = asLit.round.map((text) => parseKenoGame(text));
  expect(first?.paid).toBe(true);
  expect(next).not.toBeNull();
  expect(next?.id).not.toBe(first?.id);
  await expect(page.getByTestId('kn-machine')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 });
  expect(parseKenoGame(await stored(page, KENO_GAME_KEY))?.id).toBe(next?.id);
});

/** The six numbers of Math.random that draw a Sugoroku roll of `roll` (the whale's rolls, the lamp and the final all 1). */
const sugorokuRoll = (roll: number): number[] => [numberForFace(roll), numberForFace(1), numberForFace(1), numberForFace(1), numberForLamp(0), numberForFace(1)];

test('Sugoroku: ROLL pressed as the boat stops, on a roll the medal center settled while it sailed, rolls again once', async ({ page, context, baseURL }) => {
  test.setTimeout(60_000);
  const hub = await hubBehind(context, page);
  await openMachine(page, baseURL, '/games/sugoroku', 'sg-machine');
  const board = async () => parseSugorokuBoard(await stored(page, SUGOROKU_BOARD_KEY));
  // A 3 from START, to a palm (no win), then the press as ROLL lights: a 1.
  await rigPresses(page, [...sugorokuRoll(3), ...sugorokuRoll(1)]);
  await pressAsItLights(page, byTestId('sg-roll'), { roundKey: SUGOROKU_BOARD_KEY });
  await pressUntil(page.getByTestId('sg-roll'), async () => ((await board())?.roll ?? null) !== null);
  await bonusWhileOn(hub, async () => (await board())?.roll?.paid === true);
  await expect(page.getByTestId('sg-machine')).not.toHaveAttribute('data-phase', 'idle');
  const asLit = await pressedAsLit(page);
  expect(stakedAsLit(asLit)).toBe(-2);
  const [first, next] = asLit.round.map((text) => parseSugorokuBoard(text)?.roll ?? null);
  expect(first?.paid).toBe(true);
  expect(next).not.toBeNull();
  expect(next?.id).not.toBe(first?.id);
  await expect(page.getByTestId('sg-machine')).toHaveAttribute('data-phase', 'idle', { timeout: 30_000 });
  expect((await board())?.roll?.id).toBe(next?.id);
});

/** Holds Smart Ball's plunger, and lets go the moment the board says a release would shoot at `strength`. */
async function shoot(page: Page, strength: number): Promise<void> {
  await page.evaluate(
    (strength) =>
      new Promise<void>((resolve, reject) => {
        const box = document.querySelector('[data-testid="smb-board"]')!;
        const plunger = document.querySelector<HTMLButtonElement>('[data-testid="smb-plunger"]')!;
        const timer = window.setTimeout(() => reject(new Error(`strength ${strength} never came in 6 s`)), 6_000);
        const press = (down: boolean) => plunger.dispatchEvent(new PointerEvent(down ? 'pointerdown' : 'pointerup', { pointerId: 11, isPrimary: true, button: 0, bubbles: true }));
        const observer = new MutationObserver(() => {
          if (box.getAttribute('data-window') !== String(strength)) return;
          observer.disconnect();
          window.clearTimeout(timer);
          press(false);
          resolve();
        });
        observer.observe(box, { attributes: true, attributeFilter: ['data-window'] });
        press(true);
      }),
    strength,
  );
}

test('Smart Ball: START pressed as the last marble drops starts the next play once', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMachine(page, baseURL, '/games/smart-ball', 'smb-machine');
  const machine = page.getByTestId('smb-machine');
  const play = async () => parseSmartBallPlay(await stored(page, SMART_BALL_PLAY_KEY));
  // Every marble shot at the middle strength, and every one OUT.
  const aim = 3;
  await rigPresses(page, smartBallNumbers({ drops: Array.from({ length: MARBLES }, () => slotFor(aim, null)), blinds: Array.from({ length: MARBLES }, () => aim) }));
  await pressAsItLights(page, byTestId('smb-start'), { roundKey: SMART_BALL_PLAY_KEY });
  await pressUntil(page.getByTestId('smb-start'), async () => (await play()) !== null);
  for (let m = 0; m < MARBLES; m++) {
    await expect(machine).toHaveAttribute('data-marble', String(m), { timeout: 10_000 });
    await expect(machine).toHaveAttribute('data-phase', 'aim', { timeout: 10_000 });
    await shoot(page, aim);
  }
  const asLit = await pressedAsLit(page);
  expect(stakedAsLit(asLit)).toBe(-SMART_BALL_STAKE);
  const [first, next] = asLit.round.map((text) => parseSmartBallPlay(text));
  expect(first?.paid).toBe(true);
  expect(next).not.toBeNull();
  expect(next?.id).not.toBe(first?.id);
  expect((await play())?.id).toBe(next?.id);
  await expect(machine).toHaveAttribute('data-marble', '0');
  expect(await bankBalance(page)).toBe(WELCOME - 2 * SMART_BALL_STAKE);
});

test('Shooting Gallery: FIRE pressed the moment each cork is in fires it, and START pressed as the last cork’s figure settles starts the next play once', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMachine(page, baseURL, '/games/shooting-gallery', 'sht-machine');
  const machine = page.getByTestId('sht-machine');
  const play = async () => parseGalleryPlay(await stored(page, GALLERY_PLAY_KEY));
  // Every cork misses, whatever it is fired at.
  const draw: GalleryDraw = { slots: Array.from({ length: GALLERY_CORKS }, () => 63), picks: Array.from({ length: GALLERY_CORKS }, () => 0), bands: Array.from({ length: GALLERY_CORKS }, () => 1) };
  await rigPresses(page, galleryNumbers(draw));
  await pressAsItLights(page, byTestId('sht-start'), { roundKey: GALLERY_PLAY_KEY });
  await pressUntil(page.getByTestId('sht-start'), async () => (await play()) !== null);
  for (let c = 0; c < GALLERY_CORKS; c++) {
    // FIRE is drawn ready by the frame that finds the cork in (no medals move then): pressed that instant, it fires.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const fire = document.querySelector<HTMLButtonElement>('[data-testid="sht-fire"]')!;
          const timer = window.setTimeout(() => reject(new Error('FIRE never lit in 10 s')), 10_000);
          const press = () => {
            window.clearTimeout(timer);
            fire.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 31, isPrimary: true, button: 0, bubbles: true }));
            resolve();
          };
          if (fire.getAttribute('aria-disabled') === 'false') return press();
          const observer = new MutationObserver(() => {
            if (fire.getAttribute('aria-disabled') !== 'false') return;
            observer.disconnect();
            press();
          });
          observer.observe(fire, { attributes: true, attributeFilter: ['aria-disabled'] });
        }),
    );
    await expect.poll(async () => (await play())?.shots.length, { message: `cork ${c + 1}` }).toBe(c + 1);
  }
  const asLit = await pressedAsLit(page);
  expect(stakedAsLit(asLit)).toBe(-GALLERY_STAKE);
  const [first, next] = asLit.round.map((text) => parseGalleryPlay(text));
  expect(first?.paid).toBe(true);
  expect(next).not.toBeNull();
  expect(next?.id).not.toBe(first?.id);
  expect((await play())?.id).toBe(next?.id);
  await expect(machine).toHaveAttribute('data-cork', '0');
  expect(await bankBalance(page)).toBe(WELCOME - 2 * GALLERY_STAKE);
});

test('Ball Tower: START pressed as the ball comes to rest in OUT starts the next run once', async ({ page, baseURL }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMachine(page, baseURL, '/games/ball-tower', 'bt-machine');
  const run = async () => parseTowerRun(await stored(page, TOWER_RUN_KEY));
  // UP on the top disc, then OUT on the second: nothing to pay as START lights again.
  await rigPresses(page, towerNumbers(towerDrawFor(['up', 'out'])));
  await pressAsItLights(page, byTestId('bt-start'), { roundKey: TOWER_RUN_KEY });
  await pressUntil(page.getByTestId('bt-start'), async () => (await run()) !== null);
  const asLit = await pressedAsLit(page);
  // The two presses at that instant: one ball, of the bet of 1.
  expect(stakedAsLit(asLit)).toBe(-1);
  const [first, next] = asLit.round.map((text) => parseTowerRun(text));
  expect(first?.paid).toBe(true);
  expect(next).not.toBeNull();
  expect(next?.id).not.toBe(first?.id);
  expect(next?.paid).toBe(false);
  expect((await run())?.id).toBe(next?.id);
  expect(await bankBalance(page)).toBe(WELCOME - 2);
});

/** Flicks Coin Maze's lever the moment a flick would meet the gate standing as `slot`. */
async function flickWhen(page: Page, slot: 'open' | 'shut'): Promise<void> {
  await page.evaluate(
    (slot) =>
      new Promise<void>((resolve, reject) => {
        const box = document.querySelector('[data-testid="cm-board"]')!;
        const lever = document.querySelector<HTMLButtonElement>('[data-testid="cm-lever"]')!;
        const timer = window.setTimeout(() => reject(new Error(`no ${slot} window in 6 s`)), 6_000);
        const observer = new MutationObserver(() => {
          if (box.getAttribute('data-slot') !== slot) return;
          observer.disconnect();
          window.clearTimeout(timer);
          lever.click();
          resolve();
        });
        observer.observe(box, { attributes: true, attributeFilter: ['data-window'] });
      }),
    slot,
  );
}

test('Coin Maze: DROP pressed as the medal drops OUT drops the next medal once', async ({ page, baseURL }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMachine(page, baseURL, '/games/coin-maze', 'cm-machine');
  const machine = page.getByTestId('cm-machine');
  const play = async () => parseCoinMazePlay(await stored(page, COIN_MAZE_PLAY_KEY));
  const draw: CoinMazeDraw = { gates: [0, 0, 0, 0], phases: [0, 0, 0, 0], wobbles: [true, true, true, true], blinds: [1, 1, 1, 1], pins: [true, true, true, true] };
  await rigPresses(page, coinMazeNumbers(draw));
  await pressAsItLights(page, byTestId('cm-drop'), { roundKey: COIN_MAZE_PLAY_KEY });
  await pressUntil(page.getByTestId('cm-drop'), async () => (await play()) !== null);
  // The first gate is shut as the lever is flicked: the medal drops OUT, and the play ends.
  await expect(machine).toHaveAttribute('data-stage', '0', { timeout: 10_000 });
  await expect(machine).toHaveAttribute('data-phase', 'wait', { timeout: 10_000 });
  await flickWhen(page, 'shut');
  const asLit = await pressedAsLit(page);
  expect(stakedAsLit(asLit)).toBe(-1);
  const [first, next] = asLit.round.map((text) => parseCoinMazePlay(text));
  expect(first?.paid).toBe(true);
  expect(next).not.toBeNull();
  expect(next?.id).not.toBe(first?.id);
  expect((await play())?.id).toBe(next?.id);
  expect(await bankBalance(page)).toBe(WELCOME - 2);
});
