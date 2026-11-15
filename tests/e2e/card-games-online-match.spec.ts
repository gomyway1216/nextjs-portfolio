import { test, expect, type Locator, type Page } from './fixtures';

import { daifugoRoom, doubtRoom, enterOnlineMatch, shichinarabeRoom } from './cardGameRooms';
import { fakeGameRoom, type FakeRoomOptions } from './fakeGameRoom';
import { arrived } from './streamedPage';
import { getDaifugoLobbyStrings } from '../../src/components/game/Daifugo/lobbyStrings';
import { getDoubtLobbyStrings, getDoubtStrings } from '../../src/components/game/Doubt/i18n';
import { getShichinarabeLobbyStrings, getShichinarabeStrings } from '../../src/components/game/Shichinarabe/i18n';

// The online match screens of Daifugo, Shichinarabe and Doubt, on a phone, with a room faked in the browser (no
// backend in CI: see fakeGameRoom). They used to be English only in the Japanese site, and Shichinarabe's board and
// Doubt's hand ran off the side of the phone, taking the whole page with them.

type Language = 'ja' | 'en';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });

async function openMatch(page: Page, slug: string, room: FakeRoomOptions, language: Language, online: string, lobby: {
  createRoom: string; yourName: string; roomPassword: string; create: string;
}) {
  await fakeGameRoom(page, room);
  const site = test.info().project.use.baseURL ?? 'http://localhost:3000';
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: site }]);
  expect((await page.goto(`/games/${slug}`))?.status()).toBe(200);
  await arrived(page);
  await enterOnlineMatch(page, { online, ...lobby });
}

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** `target` is below the site toolbar and is what a tap at its centre hits. */
async function expectClearOfToolbar(target: Locator, what: string) {
  await expect
    .poll(() => target.evaluate((element) => {
      const toolbar = document.querySelector('div[class*="toolbar"].sticky.top-0');
      if (!toolbar) throw new Error('the site toolbar was not found on the page');
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        belowBar: box.top >= toolbar.getBoundingClientRect().bottom,
        onTop: hit !== null && element.contains(hit),
      };
    }), what)
    .toEqual({ belowBar: true, onTop: true });
}

for (const language of ['ja', 'en'] as const) {
  test(`Shichinarabe online (${language}): the board fits inside its panel and the match speaks the page's language`, async ({ page }) => {
    const t = getShichinarabeStrings(language);
    const lobby = getShichinarabeLobbyStrings(language);
    await openMatch(page, 'shichinarabe', shichinarabeRoom(), language, t.menuOnline, lobby);

    const title = page.getByRole('heading', { name: lobby.matchTitle, exact: true });
    await expect(title).toBeVisible();
    await expectClearOfToolbar(title, 'the match title');
    await expect(page.getByTestId('shichinarabe-online-status')).toHaveText(`${lobby.playerCount(4)} · ${t.yourTurn}`);
    await expect(page.getByRole('button', { name: t.pass, exact: true })).toBeVisible();
    await expect(page.getByText(t.logStart, { exact: true })).toBeVisible();

    const board = page.getByTestId('shichinarabe-online-board');
    await expect(board).toBeVisible();
    const fit = await board.evaluate((element) => {
      const panel = element.parentElement!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      // The last column of every suit: the king's slot.
      const rows = [...element.children].map((row) => row.lastElementChild!.getBoundingClientRect().right);
      return {
        overflow: element.scrollWidth - element.clientWidth,
        inPanel: box.left >= panel.left && box.right <= panel.right,
        kingsInPanel: rows.every((right) => right <= panel.right),
        inWindow: box.right <= window.innerWidth,
      };
    });
    expect({ inPanel: fit.inPanel, kingsInPanel: fit.kingsInPanel, inWindow: fit.inWindow }).toEqual({ inPanel: true, kingsInPanel: true, inWindow: true });
    expect(fit.overflow, 'the board scrolls sideways inside its panel').toBeLessThanOrEqual(0);
    expect(await page.getByTestId('shichinarabe-online-hand').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
    expect(await sideways(page), 'the page scrolls sideways').toBeLessThanOrEqual(0);
  });
}

test('Doubt online (ja): the hand wraps on a phone, and the log and results are in Japanese', async ({ page }) => {
  const t = getDoubtStrings('ja');
  const lobby = getDoubtLobbyStrings('ja');
  await openMatch(page, 'doubt', doubtRoom(false, 'challenge'), 'ja', t.menuOnline, lobby);

  const title = page.getByRole('heading', { name: lobby.matchTitle, exact: true });
  await expect(title).toBeVisible();
  await expectClearOfToolbar(title, 'the match title');
  await expect(page.getByTestId('doubt-online-status')).toHaveText(t.yourTurn);
  await expect(page.getByRole('button', { name: t.doubt, exact: true })).toBeEnabled();
  // The log's first entry is the engine's "Game started", shown in the page's language.
  await expect(page.getByText(t.logStart, { exact: true })).toBeVisible();
  await expect(page.getByText('Game started')).toHaveCount(0);
  expect(await page.getByTestId('doubt-online-hand').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
  expect(await sideways(page), 'the page scrolls sideways').toBeLessThanOrEqual(0);
});

test('Doubt online (ja): a finished room shows its results', async ({ page }) => {
  const t = getDoubtStrings('ja');
  const lobby = getDoubtLobbyStrings('ja');
  await openMatch(page, 'doubt', doubtRoom(true), 'ja', t.menuOnline, lobby);
  await expect(page.getByRole('heading', { name: t.results, exact: true })).toBeVisible();
  await expect(page.getByText(`${t.place(1)}: Yudai`, { exact: true })).toBeVisible();
  expect(await sideways(page), 'the page scrolls sideways').toBeLessThanOrEqual(0);
});

test('Daifugo online (ja): the title, room badge and log are in Japanese and the table fits', async ({ page }) => {
  const lobby = getDaifugoLobbyStrings('ja');
  await openMatch(page, 'daifugo', daifugoRoom(), 'ja', 'オンライン対戦 (3〜6人)', lobby);
  const title = page.getByRole('heading', { name: '大富豪オンライン', exact: true });
  await expect(title).toBeVisible();
  await expectClearOfToolbar(title, 'the match title');
  await expect(page.getByText(lobby.roomBadge('K7Q2'), { exact: true })).toBeVisible();
  await expect(page.getByText('ログ', { exact: true })).toBeVisible();
  await expect(page.getByText('Log', { exact: true })).toHaveCount(0);
  expect(await sideways(page), 'the page scrolls sideways').toBeLessThanOrEqual(0);
});
