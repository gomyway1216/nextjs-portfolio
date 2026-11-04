import { test, expect, type Page } from './fixtures';

import { chooseMove, seededRandom } from '@/components/game/Blokus/ai';
import { PASS, PIECES, applyMove, legalMoves, movePiece, newGame, passTurn } from '@/components/game/Blokus/engine';
import { RECORDS_KEY, RECORD_VERSION, positions, type GameRecord } from '@/components/game/Blokus/record';
import { defaultSeating } from '@/components/game/Blokus/seating';
import { arrived } from './streamedPage';

const status = (page: Page) => page.getByTestId('blokus-status');
const ghost = (page: Page) => page.getByTestId('blokus-ghost');
const record = (page: Page) => page.getByTestId('blokus-record');

/** A Duo game where you play your smallest piece every turn against a hard AI: plenty for a review to find. */
const badGame = (): GameRecord => {
  const game = newGame('duo');
  const random = seededRandom(5);
  const moves: number[] = [];
  while (!game.over) {
    const legal = legalMoves(game);
    if (legal.length === 0) {
      passTurn(game);
      moves.push(PASS);
      continue;
    }
    const move = game.toMove === 0 ? legal.reduce((small, other) => (PIECES[movePiece(other)].size < PIECES[movePiece(small)].size ? other : small)) : chooseMove(game, legal, 'hard', { random });
    applyMove(game, move);
    moves.push(move);
  }
  return {
    v: RECORD_VERSION,
    id: 'seeded',
    playedAt: Date.UTC(2026, 10, 3, 9, 30),
    online: false,
    seating: defaultSeating('duo', 2, [{ kind: 'human' }, { kind: 'ai', level: 'hard' }]),
    me: 0,
    moves,
  };
};

async function seed(page: Page, records: GameRecord[]) {
  await page.addInitScript(
    ([key, value]) => {
      if (!window.sessionStorage.getItem('seeded')) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.setItem('seeded', '1');
      }
    },
    [RECORDS_KEY, JSON.stringify(records)] as const,
  );
}

test('a saved game opens from the setup, steps back and forth, and the review finds the slips and the better move', async ({ page }) => {
  test.setTimeout(120_000);
  const game = badGame();
  await seed(page, [game]);
  await page.goto('/games/blokus');
  await arrived(page);

  await page.getByTestId('blokus-records').click();
  const list = page.getByTestId('blokus-record-list');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await list.getByRole('button').first().click();

  // It opens on the final position.
  const total = game.moves.length;
  await expect(record(page)).toBeVisible();
  const move = page.getByTestId('blokus-record-move');
  await expect(move).toContainText(`Move ${total} of ${total}`);
  await page.getByTestId('blokus-record-prev').click();
  await expect(move).toContainText(`Move ${total - 1} of ${total}`);
  await page.keyboard.press('Home');
  await expect(move).toContainText('Before the first move');
  await page.keyboard.press('ArrowRight');
  await expect(move).toContainText('1. You: I1');
  await page.getByTestId('blokus-record-slider').fill('5');
  await expect(move).toContainText('Move 5 of');

  // The review: your moves only, each with a verdict, and the costliest listed.
  await page.getByTestId('blokus-record-run').click();
  await expect(page.getByTestId('blokus-record-run')).toBeHidden({ timeout: 90_000 });
  const states = positions(game);
  const mine = game.moves.filter((played, index) => states[index].toMove === 0 && played !== PASS).length;
  await expect(page.getByTestId('blokus-record-moves').locator('[data-verdict]')).toHaveCount(mine);
  await expect(page.getByTestId('blokus-record-graph').locator('circle')).toHaveCount(mine);
  const worst = page.getByTestId('blokus-record-worst').getByRole('button');
  await expect(worst).toHaveCount(3);

  // The costliest move, and the better one in its place on the board.
  await worst.first().click();
  await expect(page.getByTestId('blokus-record-verdict')).toHaveText(/Inaccuracy|Mistake|Blunder/);
  const boardNow = () => page.getByTestId('blokus-board').innerHTML();
  const played = await boardNow();
  await page.getByTestId('blokus-record-best').click();
  await expect(page.getByTestId('blokus-record-best')).toHaveAttribute('aria-pressed', 'true');
  await expect(move).toContainText('Showing the better move');
  expect(await boardNow()).not.toBe(played);
  await page.getByTestId('blokus-record-best').click();
  expect(await boardNow()).toBe(played);

  // The review is kept with the game: after a reload it is there, with nothing to run again.
  await page.reload();
  await arrived(page);
  await page.getByTestId('blokus-records').click();
  await page.getByTestId('blokus-record-list').getByRole('button').first().click();
  await expect(page.getByTestId('blokus-record-moves').locator('[data-verdict]')).toHaveCount(mine);
  await expect(page.getByTestId('blokus-record-run')).toHaveCount(0);
});

test('copy as text gives every move and the record to rebuild it from', async ({ page, browserName, context }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are a Chromium grant');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const game = badGame();
  await seed(page, [game]);
  await page.goto('/games/blokus');
  await arrived(page);
  await page.getByTestId('blokus-records').click();
  await page.getByTestId('blokus-record-list').getByRole('button').first().click();
  await page.getByTestId('blokus-record-copy').click();
  await expect(page.getByTestId('blokus-record-copy')).toHaveText('Copied.');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split('\n')[0]).toMatch(/^Blokus duo, 2 players, 2026-11-03T09:30/);
  expect(text).toContain(`${game.moves.length}. `);
  expect(JSON.parse(text.split('\n').at(-1)!).moves).toEqual(game.moves);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  test('a game played to the end is recorded: the record opens from the scores and is in the past games after a reload', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/games/blokus');
    await arrived(page);
    await page.getByTestId('blokus-mode-duo').tap();
    await page.getByRole('button', { name: /Easy/ }).tap();
    await page.getByRole('button', { name: /Start Game/ }).tap();

    const result = page.getByTestId('blokus-result');
    const ready = page.locator('[data-testid^="blokus-piece-"][data-state="ready"]');
    let placed = 0;
    while (!(await result.isVisible())) {
      const myTurn = (await status(page).innerText()).includes('Your turn');
      if (!myTurn || (await ready.count()) === 0) {
        await page.waitForTimeout(100);
        continue;
      }
      if ((await page.locator('[data-testid^="blokus-piece-"][aria-pressed="true"]').count()) === 0) await ready.last().tap();
      await expect(ghost(page)).toBeVisible();
      for (let turn = 0; turn < 8 && (await ghost(page).getAttribute('data-legal')) !== 'true'; turn++) {
        await page.getByTestId(turn === 3 ? 'blokus-flip' : 'blokus-rotate').tap();
      }
      await page.getByTestId('blokus-place').tap();
      placed += 1;
    }

    await result.getByTestId('blokus-record-open').tap();
    await expect(record(page)).toBeVisible();
    // The scores are further down on a phone; the record still opens at its top, board first.
    await expect.poll(() => record(page).evaluate((element) => element.closest('[class*="root"]')!.scrollTop)).toBe(0);
    const moves = page.getByTestId('blokus-record-moves').getByRole('listitem');
    const total = await moves.count();
    expect(total).toBeGreaterThan(placed);
    await expect(page.getByTestId('blokus-record-move')).toContainText(`Move ${total} of ${total}`);
    // Nothing runs off sideways on a phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByTestId('blokus-record-back').tap();
    await expect(result).toBeVisible();

    await page.reload();
    await arrived(page);
    await expect(page.getByTestId('blokus-records')).toHaveText(/Past games \(1\)/);
    await page.getByTestId('blokus-records').tap();
    await page.getByTestId('blokus-record-list').getByRole('button').first().tap();
    await expect(page.getByTestId('blokus-record-moves').getByRole('listitem')).toHaveCount(total);
  });
});
