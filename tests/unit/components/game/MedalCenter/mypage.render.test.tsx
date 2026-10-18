import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { WAITING as BANK_WAITING, type BankState } from '@/components/game/MedalCenter/bank';
import { CENTER, createHistory, record, type History, type Observation } from '@/components/game/MedalCenter/history';
import { HISTORY_WAITING, type HistoryState } from '@/components/game/MedalCenter/historyStore';
import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MyPage, MyPageView, PAGE_SIZE } from '@/components/game/MedalCenter/MyPage';
import { getMyPageStrings } from '@/components/game/MedalCenter/myPageStrings';
import { MEDAL_PUSHER_PATH, MY_PAGE_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { createBook, type RecordBook } from '@/components/game/MedalPusher/records';
import { WAITING as BOOK_WAITING, type RecordsState } from '@/components/game/MedalPusher/recordsStore';
import { createI18nInstance } from '@/lib/i18n';

// The medal center's "my page" as it is drawn: on the server and before anything has been read, and for a player
// with medals, a history and a record book. Every state is made here; nothing is read from a browser or an account.

const DAY = '2026-10-17';
const T0 = new Date(2026, 9, 17, 14, 5).getTime();

/** A history in which a few things happened, a minute apart. */
function historyOf(device = 'phone00001'): History {
  const steps: Observation[] = [
    { type: 'bonus', medals: 40, at: T0, day: DAY, left: 140 },
    { type: 'move', game: 'roulette', round: 'spin0001', step: 'stake', medals: -5, at: T0 + 60_000, day: DAY, left: 135 },
    { type: 'move', game: 'roulette', round: 'spin0001', step: 'pay', medals: 35, at: T0 + 60_000, day: DAY, left: 170 },
    { type: 'move', game: 'slot-machine', round: 'reel0001', step: 'stake', medals: -3, at: T0 + 120_000, day: DAY, left: 167 },
    { type: 'machine', game: 'medal-pusher', fed: 40, won: 22, prize: 0, jackpots: [], at: T0 + 180_000, day: DAY, left: 149 },
    { type: 'machine', game: 'medal-pusher', fed: 0, won: 300, prize: 300, jackpots: [300], at: T0 + 200_000, day: DAY, left: 449 },
    { type: 'reset', thrown: 449, medals: 100, at: T0 + 240_000, day: DAY, left: 100 },
  ];
  return steps.reduce(record, createHistory(device, T0 - 3_600_000));
}

const bankState = (balance: number, owner: string | null = null): BankState => ({ ...BANK_WAITING, loaded: true, balance, owner, where: owner ? 'account' : 'device' });
const historyState = (history: History, owner: string | null = null): HistoryState => ({ loaded: true, owner, where: owner ? 'account' : 'device', kept: true, history });
const bookState = (book: RecordBook): RecordsState => ({ ...BOOK_WAITING, book, day: DAY });

const wrap = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const view = (lang: 'en' | 'ja' = 'en', owner: string | null = null, history = historyOf()) => {
  const book: RecordBook = { ...createBook('phone00001'), counters: { phone00001: { fed: 400, won: 380, jackpots: 1 } }, bests: { prize: 300 }, stamps: { jackpot: DAY, firstLine: DAY } };
  return wrap(<MyPageView bank={bankState(100, owner)} history={historyState(history, owner)} book={bookState(book)} signInHref="/signin?redirect=%2Fgames%2Fmedal-center%2Frecords" />, lang);
};
/** The text a page reads as, without its tags. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('the medal center’s my page, as the server sends it', () => {
  it('holds every place with nothing in it until the medals and their history have been read', () => {
    const html = wrap(<MyPage signInHref="/signin" />);
    expect(html).toMatch(/data-testid="mypage-counter" data-loaded="false"/);
    expect(html).toMatch(/data-testid="mypage-medals">—</);
    expect(html).toMatch(/data-testid="mypage-history" data-loaded="false" data-entries="0"/);
    expect(html).not.toContain('data-testid="mypage-entry"');
    expect(html).toContain(NOT_MONEY.en);
    // Every machine on the floor has its place, with nothing in it yet.
    for (const { id } of FLOOR) expect(html).toContain(`data-testid="mypage-game-${id}"`);
    expect(BANK_WAITING.loaded).toBe(false);
    expect(HISTORY_WAITING.loaded).toBe(false);
  });
});

describe('the medal center’s my page, for a player', () => {
  it('lists what happened to the medals, the latest first, each with what it took and what came back', () => {
    const html = view();
    const text = textOf(html);
    expect(html.match(/data-testid="mypage-entry"/g)).toHaveLength(6);
    const kinds = [...html.matchAll(/data-kind="([a-z]+)" data-game="([a-z-]+)" data-testid="mypage-entry"/g)].map((match) => `${match[1]}:${match[2]}`);
    expect(kinds).toEqual([`reset:${CENTER}`, 'jackpot:medal-pusher', 'play:medal-pusher', 'round:slot-machine', 'round:roulette', `bonus:${CENTER}`]);
    expect(text).toContain('Medals reset: 449 thrown away, started again with 100');
    expect(text).toContain('JACKPOT! 300 medals');
    expect(text).toContain('Fed 40 · won 322');
    expect(text).toContain('Bet 5 · won 35');
    expect(text).toContain('Bet 3 · won 0');
    expect(text).toContain('Daily bonus: 40 medals');
    expect(text).toContain('30 medals up');
    expect(text).toContain('medals after: 170');
    // The history says where it begins, and that what came before is not in it.
    expect(html).toMatch(/data-testid="mypage-since">Your history begins on [^<]+\. What was played before then is not in it\./);
  });

  it('shows each machine’s records, all of them added up, and the Medal Pusher’s own record book with a way to it', () => {
    const html = view();
    expect(html).toMatch(/data-testid="mypage-total-rounds">2</);
    expect(html).toMatch(/data-testid="mypage-total-bet">48</);
    expect(html).toMatch(/data-testid="mypage-total-won">357</);
    expect(html).toMatch(/data-testid="mypage-roulette-return">700\.0%</);
    expect(html).toMatch(/data-testid="mypage-roulette-best">1 round won in a row</);
    expect(html).toMatch(/data-testid="mypage-medal-pusher-top">300</);
    // The pusher plays no rounds and has no streak of them.
    expect(html).not.toContain('data-testid="mypage-medal-pusher-rounds"');
    expect(html).not.toContain('data-testid="mypage-medal-pusher-best"');
    // The machines not played since the history began are listed apart, by name, each with its way in.
    expect(html).toMatch(/data-played="true" data-testid="mypage-game-roulette"/);
    expect(html).toMatch(/data-game="craps" data-played="false" data-testid="mypage-game-craps"><a[^>]*href="\/games\/craps"/);
    expect(html).toContain('Not played since your history began.');
    expect(html.indexOf('data-testid="mypage-game-medal-pusher"')).toBeLessThan(html.indexOf('data-testid="mypage-game-craps"'));
    expect(html).toMatch(/data-testid="mypage-book-jackpots">1</);
    expect(html).toMatch(/data-testid="mypage-book-stamps">2 of 12</);
    expect(html.match(/<a[^>]*data-testid="mypage-book-open"[^>]*>/)?.[0]).toContain(`href="${MEDAL_PUSHER_PATH}"`);
  });

  it('draws a guest’s counter until the medals have been read, unless a member is expected, so that it does not move as they come in', () => {
    const t = getMyPageStrings('en');
    const waiting = (presumedMember: boolean) =>
      // Without React's markers between the pieces of text.
      wrap(<MyPageView bank={BANK_WAITING} history={HISTORY_WAITING} book={BOOK_WAITING} signInHref="/signin" presumedMember={presumedMember} />).replace(/<!-- -->/g, '');
    const guest = waiting(false);
    expect(guest).toMatch(new RegExp(`data-testid="mypage-member" data-owner="guest">${t.memberGuest}<`));
    expect(guest).toContain(`${t.whose.guest} ${t.where.device}`);
    expect(guest).toContain('data-testid="mypage-sign-in"');
    const member = waiting(true);
    expect(member).toMatch(new RegExp(`data-testid="mypage-member" data-owner="guest">${t.memberChecking}<`));
    expect(member).toContain(`${t.whose.account} ${t.where.checking}`);
    expect(member).not.toContain('data-testid="mypage-sign-in"');
  });

  it('invites a guest to sign in, and tells a member their account keeps it', () => {
    expect(view()).toContain('data-testid="mypage-sign-in"');
    const member = view('en', 'test-player-1');
    expect(member).not.toContain('data-testid="mypage-sign-in"');
    expect(member).toContain('Your account’s history and records. Kept on your account, and on every device you sign in on.');
  });

  it('lists a page of the history at a time', () => {
    let history = createHistory('phone00001', T0);
    for (let i = 0; i < PAGE_SIZE + 5; i++) {
      history = record(history, { type: 'move', game: 'roulette', round: `s${i}`, step: 'pay', medals: 1, at: T0 + i * 1000, day: DAY, left: 100 + i });
    }
    const html = view('en', null, history);
    expect(html.match(/data-testid="mypage-entry"/g)).toHaveLength(PAGE_SIZE);
    expect(html).toContain('Show 5 more');
  });

  it('reads in Japanese, in the words of a medal counter, and nothing on it reads as money', () => {
    const ja = view('ja');
    expect(ja).toContain('マイページ');
    expect(ja).toContain('持ちメダル');
    expect(ja).toContain('ジャックポット！ 300枚');
    expect(ja).toContain('メダルをリセット：449枚を捨てて、100枚からやり直し');
    expect(ja).toContain(NOT_MONEY.ja);
    const jaText = textOf(ja).replace(NOT_MONEY.ja, '');
    expect(jaText).not.toMatch(/預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|所持金|収支|チップ|クレジット/);
    const enText = textOf(view('en')).replace(NOT_MONEY.en, '');
    expect(enText).not.toMatch(/bankroll|\bbank\b|deposit|withdraw|cash|money|dollar|balance|credit|\$/i);
    // Every word the page can say, in both languages, not only those this state shows.
    for (const lang of ['en', 'ja'] as const) {
      const t = getMyPageStrings(lang);
      const words = Object.entries(t)
        .filter(([key]) => key !== 'notMoney')
        .flatMap(([, value]) => (typeof value === 'function' ? [String((value as (...args: string[]) => string)('1', '2', '3', '4'))] : typeof value === 'object' ? Object.values(value) : [value]))
        .join(' ');
      expect(words).not.toMatch(/bankroll|\bbank\b|deposit|withdraw|cash|money|dollar|balance|credit|\$|預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|所持金|収支/i);
    }
  });
});

describe('the way to the my page', () => {
  it('is on the medal center’s front, under the counter', () => {
    const html = wrap(<MedalCenter signInHref="/signin" />);
    expect(html.match(/<a[^>]*data-testid="center-my-page"[^>]*>/)?.[0]).toContain(`href="${MY_PAGE_PATH}"`);
    expect(wrap(<MedalCenter signInHref="/signin" />, 'ja')).toContain('マイページ');
  });
});

describe('a floor jackpot on the my page', () => {
  const withJackpot = (): History =>
    [
      { type: 'floor', id: '20261017-a1b2c3d4', medals: 2_431, at: T0 + 300_000, day: DAY, left: 2_531 },
      { type: 'floor', id: '20261019-0badcafe', medals: 1_200, at: T0 + 2 * 86_400_000, day: '2026-10-19', left: 3_731 },
    ].reduce((history, step) => record(history, step as Observation), historyOf());

  it('lists each win as an entry of its own, under the floor jackpot’s name', () => {
    const html = view('en', 'test-player-1', withJackpot());
    const t = getMyPageStrings('en');
    expect(html.match(/data-kind="floor"/g)).toHaveLength(2);
    expect(textOf(html)).toContain(`${t.floorName} FLOOR JACKPOT +2,431`);
    expect(t.floorName).toBe('Medal floor');
    expect(textOf(html)).toContain('FLOOR JACKPOT +1,200');
    expect(textOf(view('ja', 'test-player-1', withJackpot()))).toContain('フロアジャックポット +2,431枚');
  });

  it('keeps its records apart from the machines’: how many, how many medals, the biggest, the last', () => {
    const html = view('en', 'test-player-1', withJackpot());
    expect(html).toContain('data-testid="mypage-floor-jackpot"');
    expect(html).toMatch(/data-testid="mypage-floor-wins">2</);
    expect(html).toMatch(/data-testid="mypage-floor-medals">3,631</);
    expect(html).toMatch(/data-testid="mypage-floor-biggest">2,431</);
    // The machines' totals are what the machines did: the floor jackpot is not in them.
    expect(html).toMatch(/data-testid="mypage-total-won">357</);
    // Nobody who has not won one is shown the card.
    expect(view('en', 'test-player-1')).not.toContain('mypage-floor-jackpot');
  });
});
