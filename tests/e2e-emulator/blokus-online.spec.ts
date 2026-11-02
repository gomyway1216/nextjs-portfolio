/**
 * Online Blokus played on the real page, by mouse and by touch, by two to four browsers at once.
 *
 * To run: from the backend's functions/ start the emulators as its scripts/blokus-emulator-game.ts says, build here with env
 * NEXT_PUBLIC_API_KEY=emulator-key NEXT_PUBLIC_APP_ID=1:1:web:emulator NEXT_PUBLIC_PROJECT_ID=demo-blokus "NEXT_PUBLIC_DATABASE_URL=http://127.0.0.1:9000?ns=demo-blokus" npx next build,
 * then npx playwright test --config tests/e2e-emulator/playwright.config.ts (the build then only suits this: don't deploy it).
 *
 * Everything that isn't this machine is refused, so a run can't reach a real service: see `sealOff`.
 */

import { expect, test, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';
import {
  ORIENTATIONS,
  PIECES,
  flipCells,
  legalMoves,
  moveCol,
  moveOrientation,
  movePiece,
  moveRow,
  orientationOf,
  rotateCells,
  type GameState,
  type Mode,
} from '../../src/components/game/Blokus/engine';
import { getBlokusStrings } from '../../src/components/game/Blokus/i18n';
import { SHARED, nextColorFor, ownerOf, seatScores, type Seating } from '../../src/components/game/Blokus/seating';
import {
  parseMoves,
  parseSeats,
  parseWinners,
  replay,
  seatToPlay,
  leftSeatsOf,
  toSeating,
  type BlokusRoom,
  type WireSeating,
} from '../../src/components/game/Blokus/online/wire';
import { arrived } from '../e2e/streamedPage';
import { instantScroll } from '../e2e/instantScroll';
import { onPageError } from '../e2e/pageErrors';

const FUNCTION = 'http://127.0.0.1:5001/demo-blokus/us-central1/gameAction';
const AUTH = 'http://127.0.0.1:9099';
const DATABASE = 'http://127.0.0.1:9000';
const NAMESPACE = 'ns=demo-blokus';
const SHOTS = 'test-results/blokus-online-shots';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

const t = getBlokusStrings('en');

declare global {
  interface Window {
    /** Requests the page has sent the AI worker. */
    aiRequests?: number;
    /** What the copy button wrote to the clipboard. */
    copied?: string[];
  }
}

interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
  id: () => Promise<string>;
  errors: Error[];
}

const forward = async (route: Route, url: string) => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  try {
    const response = await route.fetch({ url });
    await route.fulfill({ response, headers: { ...response.headers(), ...CORS } });
  } catch {
    // The test ended with this still on its way: a turn claim, say, that lost the race.
    await route.abort().catch(() => undefined);
  }
};

/** Local traffic goes through, gameAction and sign-in go to the emulators, and everything else is refused. */
const sealOff = async (context: BrowserContext) => {
  await context.route('**/*', (route) => {
    const { hostname } = new URL(route.request().url());
    return hostname === 'localhost' || hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await context.route(/\/\/gameaction-[^/]*\.a\.run\.app/, (route) => forward(route, FUNCTION));
  await context.route(/\/\/(identitytoolkit|securetoken)\.googleapis\.com\//, (route) => {
    const url = new URL(route.request().url());
    return forward(route, `${AUTH}/${url.host}${url.pathname}${url.search}`);
  });
};

const spy = async (context: BrowserContext) => {
  await context.addInitScript(() => {
    window.aiRequests = 0;
    window.copied = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function postMessage(this: Worker, message: unknown, options?: StructuredSerializeOptions) {
      window.aiRequests = (window.aiRequests ?? 0) + 1;
      post.call(this, message, options);
    } as typeof post;
    const { clipboard } = navigator;
    if (clipboard) {
      const write = clipboard.writeText.bind(clipboard);
      clipboard.writeText = (text) => {
        window.copied?.push(text);
        return write(text);
      };
    }
  });
};

const open = async (browser: Browser, name: string, options: Parameters<Browser['newContext']>[0] = {}): Promise<Player> => {
  const context = await browser.newContext(options);
  await sealOff(context);
  await spy(context);
  await instantScroll(context);
  const page = await context.newPage();
  const errors: Error[] = [];
  onPageError(page, (error) => {
    // An ad or analytics script this run refused is not the page's fault.
    if (!/Load failed|Failed to fetch|NetworkError/.test(error.message)) errors.push(error);
  });
  return { name, context, page, errors, id: () => page.evaluate(() => localStorage.getItem('blokusPlayerId') as string) };
};

/** The phone projects play by finger, the desktop ones by mouse. */
const usesTouch = (page: Page) => (page.viewportSize()?.width ?? 1280) < 500;

const press = async (page: Page, testId: string) => {
  if (usesTouch(page)) await page.getByTestId(testId).tap();
  else await page.getByTestId(testId).click();
};

const home = async (page: Page, path = '/games/blokus') => {
  await page.goto(path);
  await arrived(page);
};

const createRoom = async ({ page, name }: Player, mode: Mode) => {
  await home(page);
  await press(page, 'blokus-online');
  await page.getByTestId('blokus-online-name').fill(name);
  await page.getByTestId(`blokus-online-mode-${mode}`).check();
  await press(page, 'blokus-online-create');
  await expect(page.getByTestId('blokus-online-waiting')).toBeVisible();
  const link = await page.getByTestId('blokus-online-link').inputValue();
  const url = new URL(link);
  return { link, code: url.searchParams.get('room') as string, key: url.searchParams.get('key') as string };
};

const joinByLink = async ({ page, name }: Player, link: string) => {
  await home(page, link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByTestId('blokus-online-lobby')).toBeVisible();
  await page.getByTestId('blokus-online-name').fill(name);
  await press(page, 'blokus-online-join');
  await expect(page.getByTestId('blokus-online-waiting')).toBeVisible();
  expect(page.url()).not.toContain('key=');
};

const startAll = async (players: Player[]) => {
  for (const { page } of players) {
    await press(page, 'blokus-online-ready');
    await expect(page.getByTestId('blokus-online-ready')).toContainText('Not ready yet');
  }
  await expect(players[0].page.getByTestId('blokus-online-start')).toBeEnabled();
  await press(players[0].page, 'blokus-online-start');
  for (const { page } of players) await expect(page.getByTestId('blokus-board')).toBeVisible();
};

interface Now {
  room: BlokusRoom;
  wire: WireSeating;
  seating: Seating;
  game: GameState;
  moves: number[];
  left: number[];
  seat: number;
  winners: number[];
}

const readRoom = async (code: string): Promise<BlokusRoom> => (await (await fetch(`${DATABASE}/gameRooms/${code}.json?${NAMESPACE}`)).json()) as BlokusRoom;

const now = async (code: string): Promise<Now> => {
  const room = await readRoom(code);
  const state = room.gameState;
  if (!state) throw new Error('no game yet');
  const wire = parseSeats(state.seatsJson) as WireSeating;
  const seating = toSeating(state.mode, wire);
  const moves = parseMoves(state.movesJson);
  const { game } = replay(state.mode, moves);
  const left = leftSeatsOf(wire);
  return { room, wire, seating, game, moves, left, seat: game.over ? -1 : seatToPlay(seating, game, state.sharedTurnSeat), winners: parseWinners(state.winnersJson) };
};

/** As if the turn had run out: this write is the emulator's admin path. */
const rewindTurnClock = async (code: string) => {
  const { room } = await now(code);
  await fetch(`${DATABASE}/gameRooms/${code}/gameState.json?${NAMESPACE}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner' },
    body: JSON.stringify({ turnStartedAt: (room.gameState?.turnStartedAt ?? 0) - 121_000 }),
  });
};

const seatedAt = async (players: Player[], current: Now, seat: number): Promise<Player> => {
  for (const player of players) {
    if ((await player.id()) === current.wire.seats[seat]?.id) return player;
  }
  throw new Error(`nobody here sits in seat ${seat}`);
};

/** The Rotate and Flip presses from how a piece comes out of the tray to `orientation`. */
const turnsTo = (piece: number, orientation: number): Array<'blokus-rotate' | 'blokus-flip'> => {
  const first = PIECES[piece].orientations[0];
  const seen = new Map<number, Array<'blokus-rotate' | 'blokus-flip'>>([[first, []]]);
  const queue = [first];
  while (queue.length > 0) {
    const from = queue.shift() as number;
    if (from === orientation) break;
    for (const [id, turn] of [['blokus-rotate', rotateCells], ['blokus-flip', flipCells]] as const) {
      const to = orientationOf(piece, turn(ORIENTATIONS[from].cells)).index;
      if (!seen.has(to)) {
        seen.set(to, [...(seen.get(from) ?? []), id]);
        queue.push(to);
      }
    }
  }
  return seen.get(orientation) as Array<'blokus-rotate' | 'blokus-flip'>;
};

/** A legal move that uses a big piece, so games finish, in any orientation, so turning a piece gets played too. */
const chooseMove = (game: GameState, turnNumber: number): number => {
  const legal = legalMoves(game);
  const biggest = Math.max(...legal.map((move) => PIECES[movePiece(move)].size));
  const pieces = legal.filter((move) => PIECES[movePiece(move)].size === biggest);
  return pieces[(turnNumber * 37) % pieces.length];
};

/** Pick the piece from the tray, turn it, put it over its spot and place it: the way a person does. */
const placeByHand = async (page: Page, move: number, size: number) => {
  const orientation = moveOrientation(move);
  const piece = PIECES[orientation.piece];
  const touch = usesTouch(page);
  const tray = page.getByTestId(`blokus-piece-${piece.name}`);
  await expect(tray).toHaveAttribute('data-state', 'ready');
  if (touch) await tray.tap();
  else await tray.click();
  await expect(tray).toHaveAttribute('aria-pressed', 'true');
  for (const id of turnsTo(piece.index, orientation.index)) await press(page, id);

  const board = page.getByTestId('blokus-board');
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  if (!box) throw new Error('no board');
  // The page centres a held piece on the cell under the pointer.
  const row = moveRow(move) + Math.floor(orientation.height / 2);
  const col = moveCol(move) + Math.floor(orientation.width / 2);
  const x = box.x + ((col + 0.5) / size) * box.width;
  const y = box.y + ((row + 0.5) / size) * box.height;
  if (touch) {
    await page.touchscreen.tap(x, y);
    await expect(page.getByTestId('blokus-ghost')).toHaveAttribute('data-legal', 'true');
    await page.getByTestId('blokus-place').tap();
  } else {
    await page.mouse.move(x, y);
    await expect(page.getByTestId('blokus-ghost')).toHaveAttribute('data-legal', 'true');
    await page.mouse.click(x, y);
  }
};

const piecesLeft = (game: GameState, color: number) => PIECES.filter((piece) => (game.hands[color] & (1 << piece.index)) !== 0).length;

/** What every screen should say about the turn in `current`: the status line, the bar, and whose hand is in the tray. */
const checkScreens = async (players: Player[], current: Now) => {
  const { game, seating, seat, wire } = current;
  const { mode } = seating;
  const color = game.toMove;
  const colorWord = t.colors[mode][color];
  const owner = ownerOf(seating, color);
  const moverName = wire.seats[seat].name;
  const colorLabel = owner === SHARED ? t.sharedColor(colorWord) : t.withColor(wire.seats[owner].name, colorWord);
  for (const player of players) {
    const { page } = player;
    const mine = wire.seats.findIndex((entry) => entry.name === player.name);
    if (wire.seats[mine]?.left) continue;
    const trayColor = mine === seat ? color : nextColorFor(seating, game, (index) => index === mine);
    const status = page.getByTestId('blokus-status');
    if (mine === seat) {
      await expect(status).toContainText(t.yourTurn);
      if (seating.seats[seat].colors.length > 1 || owner === SHARED) await expect(status).toContainText(t.playingColor(colorWord));
      await expect(page.getByTestId('blokus-online-turn')).toHaveText('Your turn');
    } else {
      await expect(status).toContainText(t.thinking(colorLabel));
      await expect(page.getByTestId('blokus-online-turn')).toHaveText(`${moverName}'s turn`);
    }
    await expect(page.getByTestId(`blokus-player-${color}`)).toHaveAttribute('data-active', 'true');
    // The tray wears the colour it holds.
    await expect
      .poll(() =>
        page.evaluate((expected) => {
          const paint = (id: string) => getComputedStyle(document.querySelector(`[data-testid="${id}"]`) as Element).getPropertyValue('--piece');
          return paint('blokus-tray') === paint(`blokus-player-${expected}`);
        }, trayColor),
      )
      .toBe(true);
  }
};

/** One real turn, from the seat to play, then wait until every screen shows it. */
const playTurn = async (players: Player[], code: string): Promise<Now> => {
  const before = await now(code);
  const mover = await seatedAt(players, before, before.seat);
  const color = before.game.toMove;
  const move = chooseMove(before.game, before.moves.length);
  await placeByHand(mover.page, move, before.game.rules.size);
  await expect.poll(async () => (await now(code)).moves.length).toBeGreaterThan(before.moves.length);
  const after = await now(code);
  expect(after.moves[before.moves.length]).toBe(move);
  const count = piecesLeft(after.game, color);
  for (const { page, name } of players) {
    if (after.wire.seats.find((seat) => seat.name === name)?.left) continue;
    await expect(page.getByTestId(`blokus-player-${color}`)).toContainText(t.piecesLeft(count));
  }
  return after;
};

const playOut = async (players: Player[], code: string) => {
  for (let turn = 0; turn < 120; turn += 1) {
    const current = await now(code);
    if (current.game.over) return current;
    await playTurn(players, code);
  }
  throw new Error('the game never ended');
};

const noAiRan = async (players: Player[]) => {
  for (const { page, name } of players) expect(await page.evaluate(() => window.aiRequests), `${name} sent the AI nothing`).toBe(0);
};

/** A tray may scroll inside itself, but the page never goes sideways. */
const noSideways = async (page: Page) => {
  const overflow = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="blokus-online-waiting"], [data-testid="blokus-board"]')?.closest('[class*="root"]');
    return root ? root.scrollWidth - root.clientWidth : -1;
  });
  expect(overflow).toBeGreaterThanOrEqual(0);
  expect(overflow).toBeLessThanOrEqual(0);
};

const noErrors = (players: Player[]) => {
  for (const { name, errors } of players) expect(errors, `${name}'s page threw nothing`).toEqual([]);
};

const closeAll = (players: Player[]) => Promise.all(players.map(({ context }) => context.close()));

const checkFinish = async (players: Player[], current: Now) => {
  const { wire, winners, seating, game } = current;
  expect(current.room.status).toBe('finished');
  expect(winners).toEqual(seatScores(seating, game).flatMap((score, seat, all) => (score === Math.max(...all) ? [seat] : [])));
  for (const { page, name } of players) {
    const mine = wire.seats.findIndex((seat) => seat.name === name);
    const headline = winners.length > 1 ? 'A tie for first' : winners[0] === mine ? 'You win!' : `${wire.seats[winners[0]].name} wins`;
    await expect(page.getByTestId('blokus-online-turn')).toHaveText(headline);
    await expect(page.getByTestId('blokus-status')).toContainText(t.finalScores);
    await expect(page.getByTestId('blokus-online-timer')).toHaveCount(0);
    await expect(page.getByTestId('blokus-result')).toHaveCount(0);
  }
};

test('Duo: the copy button, an invite link, a colour, a whole game, the winner and a rematch', async ({ browser, browserName }) => {
  const players = [await open(browser, 'Ann', browserName === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}), await open(browser, 'Ben')];
  const [ann, ben] = players;
  const { link, code } = await createRoom(ann, 'duo');

  await press(ann.page, 'blokus-online-copy');
  await expect(ann.page.getByRole('status').filter({ hasText: 'Link copied.' })).toBeVisible();
  expect(await ann.page.evaluate(() => window.copied)).toEqual([link]);
  if (browserName === 'chromium') expect(await ann.page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  await joinByLink(ben, link);
  await expect(ann.page.getByTestId('blokus-online-seat')).toHaveCount(2);

  await press(ben.page, 'blokus-online-color-0');
  await expect(ann.page.getByTestId('blokus-online-color-1')).toHaveAttribute('aria-pressed', 'true');
  await startAll(players);

  const first = await now(code);
  expect(first.wire.seats.map(({ name, colors }) => [name, colors])).toEqual([['Ann', [1]], ['Ben', [0]]]);
  await checkScreens(players, first);

  const end = await playOut(players, code);
  await checkFinish(players, end);
  await noAiRan(players);

  await expect(ann.page.getByTestId('blokus-online-rematch')).toBeVisible();
  await expect(ben.page.getByTestId('blokus-online-rematch')).toHaveCount(0);
  await press(ann.page, 'blokus-online-rematch');
  await expect.poll(async () => (await now(code)).moves.length).toBe(0);
  const again = await now(code);
  expect(again.wire.seats.map(({ colors }) => colors)).toEqual([[1], [0]]);
  expect(again.room.gameState?.matchId).toBe(2);
  await checkScreens(players, again);
  await expect(ben.page.getByTestId('blokus-piece-I1')).toHaveAttribute('data-state', 'ready');
  await playTurn(players, code);
  await noAiRan(players);
  noErrors(players);
  await closeAll(players);
});

test('two players on classic, by code and password: two colours each, and the tray follows the right one', async ({ browser }) => {
  const players = [await open(browser, 'Ann'), await open(browser, 'Ben')];
  const [ann, ben] = players;
  const { code, key } = await createRoom(ann, 'classic');

  await home(ben.page);
  await press(ben.page, 'blokus-online');
  await ben.page.getByTestId('blokus-online-name').fill('Ben');
  await ben.page.getByTestId('blokus-online-code').fill(code);
  await ben.page.getByTestId('blokus-online-password').fill(key);
  await press(ben.page, 'blokus-online-join');
  await expect(ben.page.getByTestId('blokus-online-waiting')).toBeVisible();

  await press(ann.page, 'blokus-online-color-3');
  await expect(ann.page.getByTestId('blokus-online-color-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(ben.page.getByTestId('blokus-online-color-2')).toHaveAttribute('aria-pressed', 'true');
  await startAll(players);

  let current = await now(code);
  expect(current.wire.seats.map(({ colors }) => colors)).toEqual([[1, 3], [0, 2]]);
  for (let turn = 0; turn < 8; turn += 1) {
    await checkScreens(players, current);
    current = await playTurn(players, code);
  }
  await checkScreens(players, current);

  // Whoever is waiting can pick a piece up and plan, but the board won't take it yet.
  const mover = await seatedAt(players, current, current.seat);
  const waiter = players.find((player) => player !== mover) as Player;
  const planned = waiter.page.locator('[data-testid^="blokus-piece-"][data-state="ready"]').first();
  const box = await waiter.page.getByTestId('blokus-board').boundingBox();
  if (!box) throw new Error('no board');
  if (usesTouch(waiter.page)) {
    await planned.tap();
    await waiter.page.getByTestId('blokus-board').scrollIntoViewIfNeeded();
    await waiter.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(waiter.page.getByTestId('blokus-place')).toBeDisabled();
  } else {
    await planned.click();
    await waiter.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  expect((await now(code)).moves.length).toBe(current.moves.length);
  current = await playTurn(players, code);
  await checkScreens(players, current);
  // With a piece still in hand, the turn comes round and any other piece can be played.
  if (usesTouch(waiter.page)) await planned.tap();
  else await planned.click();
  await playTurn(players, code);

  await noAiRan(players);
  noErrors(players);
  await closeAll(players);
});

test('three players: the shared colour goes round, and scores for nobody', async ({ browser }) => {
  const players = [await open(browser, 'Ann'), await open(browser, 'Ben'), await open(browser, 'Cal')];
  const [ann, ben, cal] = players;
  const { link, code } = await createRoom(ann, 'classic');
  await joinByLink(ben, link);
  await joinByLink(cal, link);
  await press(cal.page, 'blokus-online-color-3');
  await expect(ann.page.getByText('Shared colour: Red')).toBeVisible();
  await startAll(players);

  let current = await now(code);
  expect(current.seating.shared).toBe(2);
  const sharedTurns: string[] = [];
  for (let turn = 0; turn < 12; turn += 1) {
    await checkScreens(players, current);
    if (current.game.toMove === 2) sharedTurns.push(current.wire.seats[current.seat].name);
    current = await playTurn(players, code);
  }
  expect(sharedTurns).toEqual(['Ann', 'Ben', 'Cal']);
  await noAiRan(players);
  noErrors(players);
  await closeAll(players);
});

test('four players: a refused move, a reload, leavers, and solo play afterwards', async ({ browser }) => {
  const players = [await open(browser, 'Ann'), await open(browser, 'Ben'), await open(browser, 'Cal'), await open(browser, 'Dee')];
  const [ann, ben, cal, dee] = players;
  const { link, code } = await createRoom(ann, 'classic');
  await joinByLink(ben, link);
  await joinByLink(cal, link);
  await joinByLink(dee, link);
  await noSideways(ann.page);
  await startAll(players);
  await noSideways(ann.page);
  // Presence is the one write a client still makes to a Blokus room: a refused one would fail silently.
  for (const seat of [0, 1, 2, 3]) {
    await expect(ann.page.getByTestId('blokus-online-player').nth(seat).locator('[data-here]')).toHaveAttribute('data-here', 'true');
  }

  let current = await now(code);
  for (let turn = 0; turn < 5; turn += 1) {
    await checkScreens(players, current);
    current = await playTurn(players, code);
  }
  await noAiRan(players);

  // A reload mid-game comes back to the same board, seat and hand.
  const placed = async (page: Page) => (await page.getByTestId('blokus-board-text').locator('ul').textContent()) ?? '';
  const before = await placed(dee.page);
  await dee.page.reload();
  await arrived(dee.page);
  await expect(dee.page.getByTestId('blokus-online-bar')).toBeVisible();
  await expect.poll(() => placed(dee.page)).toBe(before);
  await checkScreens(players, current);

  // A move crosses with the turn running out: it was legal when it left, and the server refuses it.
  const late = await seatedAt(players, current, current.seat);
  expect(late).toBe(ben);
  const waiting = [ann, cal, dee];
  const held: Array<() => void> = [];
  await late.context.route(/\/\/gameaction-[^/]*\.a\.run\.app/, async (route) => {
    if (route.request().postData()?.includes('"type":"place"')) await new Promise<void>((resolve) => held.push(resolve));
    await route.fallback();
  });
  await placeByHand(late.page, chooseMove(current.game, current.moves.length), current.game.rules.size);
  await expect.poll(() => held.length).toBe(1);
  // While it's on its way this is still their turn, not somebody thinking.
  await expect(late.page.getByTestId('blokus-status')).toContainText(t.yourTurn);
  const missed = current.game.toMove;
  await rewindTurnClock(code);
  await expect.poll(async () => (await now(code)).moves.length).toBe(current.moves.length + 1);
  held[0]();
  await expect(late.page.locator('p[role="alert"]')).toContainText('The board moved on');
  current = await now(code);
  expect(current.moves[current.moves.length - 1]).toBe(-1);
  await expect(late.page.getByTestId(`blokus-player-${missed}`)).toContainText(t.outOfMoves);
  await expect(late.page.getByTestId('blokus-status')).toContainText(t.youAreOut);
  await checkScreens(waiting, current);

  // Next turn along clears the complaint: it was about a board that's gone.
  current = await playTurn(waiting, code);
  await expect(late.page.locator('p[role="alert"]')).toHaveCount(0);

  // Four players in the bar still leave the whole board on the screen, with the page at the top.
  await ann.page.evaluate(() => document.querySelector('[data-testid="blokus-board"]')?.closest('[data-mode]')?.parentElement?.scrollTo({ top: 0 }));
  const boardBox = await ann.page.getByTestId('blokus-board').boundingBox();
  const barBox = await ann.page.getByTestId('blokus-online-bar').boundingBox();
  const windowSize = ann.page.viewportSize();
  expect((boardBox?.y ?? 0) + (boardBox?.height ?? 0), `board ${JSON.stringify(boardBox)} bar ${JSON.stringify(barBox)}`).toBeLessThanOrEqual(windowSize?.height ?? 0);

  // Ann, the host, walks out mid-game with a piece still in hand. The room carries on with a new host.
  const inHand = ann.page.locator('[data-testid^="blokus-piece-"][data-state="ready"]').first();
  if (usesTouch(ann.page)) await inHand.tap();
  else await inHand.click();
  await press(ann.page, 'blokus-online-leave');
  await press(ann.page, 'blokus-online-leave-yes');
  await expect(ann.page.getByTestId('blokus-board')).toHaveCount(0);
  await expect(ben.page.getByText('Left the game')).toBeVisible();
  await expect.poll(async () => (await readRoom(code)).hostId).toBe(await ben.id());
  current = await now(code);
  expect(current.game.over).toBe(false);
  await checkScreens([cal, dee], current);
  await noAiRan([ben, cal, dee]);

  // Solo after leaving: the host came through the lobby, so Back gets to the setup.
  await expect(ann.page.getByTestId('blokus-online-lobby')).toBeVisible();
  // That piece mustn't take R and F for itself in the form.
  await ann.page.getByTestId('blokus-online-name').fill('');
  await ann.page.getByTestId('blokus-online-name').pressSequentially('Fred');
  await expect(ann.page.getByTestId('blokus-online-name')).toHaveValue('Fred');
  await press(ann.page, 'blokus-online-back');
  await ann.page.getByRole('button', { name: /Easy/ }).click();
  await ann.page.getByRole('button', { name: /Start Game/ }).click();
  await expect(ann.page.getByTestId('blokus-status')).toContainText(t.yourTurn, { timeout: 30_000 });
  expect(await ann.page.evaluate(() => window.aiRequests)).toBe(0);
  await placeByHand(ann.page, chooseMove(replay('classic', []).game, 0), 20);
  await expect(ann.page.getByTestId('blokus-player-0')).toContainText(t.piecesLeft(20));
  await expect(ann.page.getByTestId('blokus-player-1')).toContainText(t.piecesLeft(20), { timeout: 30_000 });
  // The spy does see the AI, so its zeros above mean something.
  expect(await ann.page.evaluate(() => window.aiRequests)).toBeGreaterThan(0);
  await expect(ann.page.getByTestId('blokus-online-bar')).toHaveCount(0);

  // The others go too, and the last one standing wins.
  for (const leaver of [cal, ben]) {
    await press(leaver.page, 'blokus-online-leave');
    await press(leaver.page, 'blokus-online-leave-yes');
    await expect(leaver.page.getByTestId('blokus-board')).toHaveCount(0);
  }
  await expect.poll(async () => (await readRoom(code)).status).toBe('finished');
  await expect(dee.page.getByTestId('blokus-online-turn')).toHaveText('You win!');
  await noAiRan([dee]);
  noErrors(players);
  await closeAll(players);
});

test('Japanese and dark mode: screenshots of the lobby, the turn and the finish', async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'one look is enough');
  const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-${name}.png`, fullPage: true });
  const dark = { colorScheme: 'dark' as const, locale: 'ja-JP' };
  const players = [await open(browser, 'あん', dark), await open(browser, 'べん', dark)];
  for (const { context } of players) await context.addInitScript(() => localStorage.setItem('i18nextLng', 'ja'));
  const [ann, ben] = players;

  await home(ann.page);
  await press(ann.page, 'blokus-online');
  await shot(ann.page, 'join-form');
  await ann.page.getByTestId('blokus-online-name').fill('あん');
  await press(ann.page, 'blokus-online-create');
  await expect(ann.page.getByTestId('blokus-online-waiting')).toBeVisible();
  const link = await ann.page.getByTestId('blokus-online-link').inputValue();
  const code = new URL(link).searchParams.get('room') as string;
  await home(ben.page, link.replace(/^https?:\/\/[^/]+/, ''));
  await ben.page.getByTestId('blokus-online-name').fill('べん');
  await press(ben.page, 'blokus-online-join');
  await expect(ben.page.getByTestId('blokus-online-waiting')).toBeVisible();
  await shot(ann.page, 'waiting');

  for (const { page } of players) await press(page, 'blokus-online-ready');
  await expect(ann.page.getByTestId('blokus-online-start')).toBeEnabled();
  await press(ann.page, 'blokus-online-start');
  await expect(ben.page.getByTestId('blokus-board')).toBeVisible();

  for (let turn = 0; turn < 6; turn += 1) {
    const current = await now(code);
    const mover = await seatedAt(players, current, current.seat);
    await placeByHand(mover.page, chooseMove(current.game, turn), 20);
    await expect.poll(async () => (await now(code)).moves.length).toBeGreaterThan(current.moves.length);
  }
  await ann.page.waitForTimeout(400);
  // What a player sees with the page at the top, at the size of the window.
  await ann.page.evaluate(() => document.querySelector('[data-testid="blokus-board"]')?.closest('[data-mode]')?.parentElement?.scrollTo({ top: 0 }));
  await ann.page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-playing-top.png` });
  await shot(ann.page, 'playing');
  await shot(ben.page, 'playing-other');

  await press(ben.page, 'blokus-online-leave');
  await shot(ben.page, 'leave-ask');
  await press(ben.page, 'blokus-online-leave-yes');
  await expect(ann.page.getByTestId('blokus-online-rematch')).toBeVisible();
  await shot(ann.page, 'finished');
  // With the other player gone, a rematch goes back to the waiting room for a new invite.
  await press(ann.page, 'blokus-online-rematch');
  await expect(ann.page.getByTestId('blokus-online-waiting')).toBeVisible();
  await expect(ann.page.getByTestId('blokus-online-link')).toHaveValue(/room=/);
  noErrors(players);
  await closeAll(players);
});
