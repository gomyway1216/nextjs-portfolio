import { test, expect, type Locator, type Page } from './fixtures';

import { getDaifugoLobbyStrings } from '../../src/components/game/Daifugo/lobbyStrings';
import { getDoubtLobbyStrings, getDoubtStrings } from '../../src/components/game/Doubt/i18n';
import { getShichinarabeLobbyStrings, getShichinarabeStrings } from '../../src/components/game/Shichinarabe/i18n';
import { instantScroll } from './instantScroll';
import { arrived } from './streamedPage';

// Daifugo, Shichinarabe and Doubt. Their screens used to be fixed, full-viewport layers, which put each one's first
// row (the link back to the games, the setup's Back, the table's title and turn, the lobby's Back) underneath the
// site's sticky toolbar: drawn there, and not clickable. These tests look at where those controls really are, and
// press them where they are. The toolbar's height is read from the page, never assumed.

type Language = 'ja' | 'en';

interface Game {
  slug: string;
  /** The mode select. */
  backToGames: string;
  vsAi: string;
  online: string;
  /** The setup: what its first row holds (Doubt's Back is at the foot of its setup card), and the way on. */
  setupTop: (page: Page) => Locator;
  start: string;
  /** The table's first row, and the way out of the table. */
  status: string;
  tableBack: string;
  /** The online lobby. */
  lobbyBack: string;
  createRoom: string;
  joinRoom: string;
}

function games(language: Language): Game[] {
  const ja = language === 'ja';
  const shichinarabe = getShichinarabeStrings(language);
  const doubt = getDoubtStrings(language);
  return [
    {
      slug: 'daifugo',
      backToGames: ja ? '← ゲーム一覧へ' : '← Back to Games',
      vsAi: ja ? 'AI対戦 (3〜6人)' : 'Play vs AI (3–6 players)',
      online: ja ? 'オンライン対戦 (3〜6人)' : 'Online Room (3–6 players)',
      setupTop: (page) => button(page, ja ? '戻る' : 'Back'),
      start: ja ? 'ゲーム開始' : 'Start Game',
      status: 'daifugo-status',
      tableBack: ja ? '戻る' : 'Back',
      lobbyBack: ja ? '戻る' : 'Back',
      createRoom: getDaifugoLobbyStrings(language).createRoom,
      joinRoom: getDaifugoLobbyStrings(language).joinRoom,
    },
    {
      slug: 'shichinarabe',
      backToGames: shichinarabe.menuBackToGames,
      vsAi: shichinarabe.menuVsAi,
      online: shichinarabe.menuOnline,
      setupTop: (page) => button(page, shichinarabe.back),
      start: shichinarabe.start,
      status: 'shichinarabe-status',
      tableBack: shichinarabe.back,
      lobbyBack: getShichinarabeLobbyStrings(language).back,
      createRoom: getShichinarabeLobbyStrings(language).createRoom,
      joinRoom: getShichinarabeLobbyStrings(language).joinRoom,
    },
    {
      slug: 'doubt',
      backToGames: doubt.menuBackToGames,
      vsAi: doubt.menuVsAi,
      online: doubt.menuOnline,
      setupTop: (page) => page.getByRole('heading', { name: doubt.title, exact: true }),
      start: doubt.startGame,
      status: 'doubt-status',
      tableBack: doubt.back,
      lobbyBack: getDoubtLobbyStrings(language).back,
      createRoom: getDoubtLobbyStrings(language).createRoom,
      joinRoom: getDoubtLobbyStrings(language).joinRoom,
    },
  ];
}

/**
 * Where `target` is, and whether a tap there would land on it: wholly inside the window, below the site toolbar, and
 * the topmost element at its centre and near each end. Throws if the site toolbar cannot be found: a test that lost
 * the toolbar would pass whatever was under it.
 */
async function place(target: Locator) {
  return target.evaluate((element) => {
    // The site toolbar, by the classes it has in every build (a production build names it `<hash>_toolbar`).
    const toolbar = document.querySelector('div[class*="toolbar"].sticky.top-0');
    if (!toolbar) throw new Error('the site toolbar was not found on the page');
    const bar = toolbar.getBoundingClientRect().bottom;
    const box = element.getBoundingClientRect();
    const points = [
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + box.width * 0.15, box.top + box.height / 2],
      [box.left + box.width * 0.85, box.top + box.height / 2],
      [box.left + box.width / 2, box.top + 3],
    ];
    return {
      bar,
      inWindow: box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth,
      belowBar: box.top >= bar,
      onTop: points.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && element.contains(hit);
      }),
    };
  });
}

/** `target` is in sight with the page at its top, clear of the toolbar, and is what a tap on it hits. */
async function expectUncovered(page: Page, target: Locator, what: string) {
  await expect(target, what).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY), `${what}: the page is not at its top`).toBe(0);
  // Polled: a screen is drawn again once the page knows its language, and a node let go of in between has no box.
  await expect
    .poll(async () => {
      const { inWindow, belowBar, onTop } = await place(target);
      return { inWindow, belowBar, onTop };
    }, what)
    .toEqual({ inWindow: true, belowBar: true, onTop: true });
  expect((await place(target)).bar, 'the site toolbar has a height').toBeGreaterThan(40);
}

const expectNoSidewaysScroll = async (page: Page, what: string) =>
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    `${what}: the page scrolls sideways`,
  ).toBeLessThanOrEqual(0);

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function openMenu(page: Page, game: Game, language: Language) {
  const site = test.info().project.use.baseURL ?? 'http://localhost:3000';
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: site }]);
  expect((await page.goto(`/games/${game.slug}`))?.status()).toBe(200);
  await arrived(page);
  await expect(button(page, game.vsAi)).toBeVisible();
}

async function startTable(page: Page, game: Game, language: Language) {
  await openMenu(page, game, language);
  await button(page, game.vsAi).click();
  await button(page, game.start).click();
  await expect(page.getByTestId(game.status)).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await instantScroll(context);
});

test.describe('on a 390px phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const language of ['ja', 'en'] as const) {
    for (const game of games(language)) {
      test(`${game.slug}: every screen's first row is clear of the site toolbar and works (${language})`, async ({ page }) => {
        // Mode select.
        await openMenu(page, game, language);
        await expectUncovered(page, page.getByRole('link', { name: game.backToGames, exact: true }), 'the link back to the games');
        await expectNoSidewaysScroll(page, 'mode select');

        // Setup, opened from wherever the mode select was scrolled to.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await button(page, game.vsAi).click();
        await expect(button(page, game.start)).toBeVisible();
        await expectUncovered(page, game.setupTop(page), "the setup's first row");
        await expectNoSidewaysScroll(page, 'setup');

        // Table.
        await button(page, game.start).click();
        await expectUncovered(page, page.getByTestId(game.status), "the table's title and turn");
        await expectNoSidewaysScroll(page, 'table');

        // Out of the table from wherever its Back is, and the mode select is at its top again.
        await button(page, game.tableBack).click();
        await expect(button(page, game.online)).toBeVisible();
        await expectUncovered(page, page.getByRole('link', { name: game.backToGames, exact: true }), 'the link back, after a game');

        // Online lobby, in the page's language.
        await button(page, game.online).click();
        await expect(button(page, game.createRoom)).toBeVisible();
        await expect(button(page, game.joinRoom)).toBeVisible();
        await expectUncovered(page, button(page, game.lobbyBack), "the lobby's Back");
        await expectNoSidewaysScroll(page, 'online lobby');
        await button(page, game.lobbyBack).click();
        await expect(button(page, game.vsAi)).toBeVisible();
      });
    }
  }

  test('shichinarabe: the whole board is inside the screen, and so is the hand', async ({ page }) => {
    await startTable(page, games('en')[1], 'en');
    await expectNoSidewaysScroll(page, 'table');

    // The board does not scroll inside its panel, and each suit's 7 (where its row starts) is in the screen's width.
    const board = page.getByTestId('shichinarabe-board');
    expect(await board.evaluate((el) => el.scrollWidth - el.clientWidth), 'the board scrolls sideways').toBeLessThanOrEqual(0);
    for (const suit of ['S', 'H', 'D', 'C']) {
      const seven = page.getByTestId(`shichinarabe-table-${suit}-7`);
      await expect(seven).toBeVisible();
      const box = (await seven.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.width, 'a card on the board is wide enough to read').toBeGreaterThanOrEqual(18);
    }
    // All thirteen places of a row are inside the board.
    const places = await board.evaluate((el) => {
      const edge = el.getBoundingClientRect();
      return Array.from(el.firstElementChild!.children).map((place) => {
        const box = place.getBoundingClientRect();
        return box.left >= edge.left - 1 && box.right <= edge.right + 1;
      });
    });
    expect(places).toHaveLength(14); // the suit's mark and its thirteen ranks
    expect(places.every(Boolean)).toBe(true);

    const hand = page.getByTestId('shichinarabe-hand');
    expect(await hand.evaluate((el) => el.scrollWidth - el.clientWidth), 'the hand scrolls sideways').toBeLessThanOrEqual(0);
    const cards = await hand.getByRole('button').evaluateAll((els) => els.map((el) => { const box = el.getBoundingClientRect(); return [box.left, box.right]; }));
    expect(cards.length).toBeGreaterThan(5);
    for (const [left, right] of cards) {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(390);
    }
  });

  test('doubt: the hand keeps its cards at full width, inside the screen', async ({ page }) => {
    await startTable(page, games('en')[2], 'en');
    const hand = page.getByTestId('doubt-hand').getByRole('button');
    const measure = () => hand.evaluateAll((els) => els.map((el) => { const box = el.getBoundingClientRect(); return [box.left, box.right, el.scrollWidth - el.clientWidth]; }));
    // A small card is 48px wide. Polled: the cards grow to their size as they are dealt.
    await expect.poll(async () => Math.min(...(await measure()).map(([left, right]) => right - left)), 'a card squeezed narrower than it is drawn').toBeGreaterThanOrEqual(47.5);
    const cards = await measure();
    expect(cards.length).toBeGreaterThan(5);
    for (const [left, right, clipped] of cards) {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(390);
      expect(clipped).toBeLessThanOrEqual(0);
    }
    await expectNoSidewaysScroll(page, 'table');
  });
});

test.describe('on a 1280px desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('daifugo: with five AIs every fan of card backs stays in its seat, off the table and inside the panel', async ({ page }) => {
    const game = games('en')[0];
    await openMenu(page, game, 'en');
    await button(page, game.vsAi).click();
    await page.getByRole('combobox').selectOption('5');
    await button(page, game.start).click();
    await expect(page.getByTestId('daifugo-seat')).toHaveCount(5);

    const layout = await page.evaluate(() => {
      const rect = (el: Element) => { const box = el.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; };
      const table = rect(document.querySelector('[data-testid="daifugo-table"]')!);
      const panel = rect(document.querySelector('[data-testid="daifugo-seats-and-table"]')!);
      // A seat's own box and everything drawn in it (the card backs are tilted, and may hang out of the seat's box).
      const seats = Array.from(document.querySelectorAll('[data-testid="daifugo-seat"]')).map((seat) =>
        [seat, ...Array.from(seat.querySelectorAll('*'))].map(rect).reduce((all, box) => ({
          left: Math.min(all.left, box.left),
          right: Math.max(all.right, box.right),
          top: Math.min(all.top, box.top),
          bottom: Math.max(all.bottom, box.bottom),
        })),
      );
      return { table, panel, seats };
    });
    for (const seat of layout.seats) {
      const overTable = seat.left < layout.table.right && seat.right > layout.table.left && seat.top < layout.table.bottom && seat.bottom > layout.table.top;
      expect(overTable, `a seat (${Math.round(seat.left)}–${Math.round(seat.right)}) reaches over the table (${Math.round(layout.table.left)}–${Math.round(layout.table.right)})`).toBe(false);
      expect(seat.left).toBeGreaterThanOrEqual(layout.panel.left);
      expect(seat.right).toBeLessThanOrEqual(layout.panel.right);
    }
    await expectUncovered(page, page.getByTestId('daifugo-status'), "the table's title and turn");
    await expectNoSidewaysScroll(page, 'table');
  });
});
