import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { WAITING as BANK_WAITING, type BankState } from '@/components/game/MedalCenter/bank';
import { CENTER, FLOOR_JACKPOT, HISTORY_LIMITS, createHistory, record, type History, type Observation } from '@/components/game/MedalCenter/history';
import { EVERYTHING, chosenOf, listedIn, tallyOf } from '@/components/game/MedalCenter/historyFilter';
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

  it('says the whole of the oldest day it lists once earlier things have been let go, and how many days it keeps', () => {
    // Three days of play: a round on the first, the bonus and three rounds on the second, two rounds on the third.
    const at = (date: number, minute: number) => new Date(2026, 9, date, 20, minute).getTime();
    const steps: Observation[] = [
      { type: 'move', game: 'roulette', round: 'a1', step: 'pay', medals: 5, at: at(15, 0), day: '2026-10-15', left: 105 },
      { type: 'bonus', medals: 40, at: at(16, 0), day: '2026-10-16', left: 145 },
      ...[1, 2, 3].map((n): Observation => ({ type: 'move', game: 'roulette', round: `b${n}`, step: 'pay', medals: 2, at: at(16, n), day: '2026-10-16', left: 145 + 2 * n })),
      ...[1, 2].map((n): Observation => ({ type: 'move', game: 'roulette', round: `c${n}`, step: 'pay', medals: 1, at: at(17, n), day: '2026-10-17', left: 151 + n })),
    ];
    const whole = steps.reduce(record, createHistory('phone00001', at(15, 0) - 60_000));
    // The oldest entries let go, as a history does past what it keeps: all of the first day, and the bonus and the first round of the second.
    const kept: History = { ...whole, entries: whole.entries.slice(0, 4) };
    const html = view('en', null, kept);
    expect(html.match(/data-testid="mypage-entry"/g)).toHaveLength(4);
    // Under the second day, which lists two of its four things: all four, added up.
    const cut = html.match(/data-testid="mypage-day-cut">([\s\S]*?)<\/p>/);
    expect(textOf(cut?.[1] ?? '').trim()).toBe('The whole day, with what the list no longer holds: Bet 0 · won 6 · given 40 · 3 rounds');
    // The first day, which it lists nothing of, by its totals; and how long those are kept.
    const older = html.match(/data-testid="mypage-older"[\s\S]*$/)?.[0] ?? '';
    expect(textOf(older)).toContain('Bet 0 · won 5 · given 0 · 1 round ');
    expect(textOf(html)).toContain('The latest 90 days with anything in them are kept.');
    expect(textOf(view('ja', null, kept)).replace(/ /g, '')).toContain('この日の合計（一覧にない分も含む）：ベット0枚・獲得6枚・無料40枚・3回');
    // A history that has let nothing go says nothing of the kind.
    expect(view('en', null, whole)).not.toContain('mypage-day-cut');
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

describe('the history of one machine at a time', () => {
  const listing = (machine: string, history = historyOf(), lang: 'en' | 'ja' = 'en') =>
    wrap(<MyPageView bank={bankState(100)} history={historyState(history)} book={BOOK_WAITING} listing={machine} />, lang);
  const said = (html: string) => textOf(html.match(/data-testid="mypage-filter-said"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '').trim();
  const options = (html: string) => [...(html.match(/<select[\s\S]*?<\/select>/)?.[0] ?? '').matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((match) => `${match[1]}=${match[2]}`);

  it('offers everything and each thing the list holds entries of, with how many, the latest first', () => {
    const html = view();
    expect(options(html)).toEqual([`${EVERYTHING}=Everything`, `${CENTER}=Medal Game Center (2)`, 'medal-pusher=Medal Pusher (2)', 'slot-machine=Slot Machine (1)', 'roulette=Roulette &amp; Martingale (1)']);
    expect(html).toMatch(/data-testid="mypage-history" data-loaded="true" data-entries="6" data-listing=""/);
    expect(said(html)).toBe('The history holds 6 entries.');
    expect(html).not.toContain('mypage-filter-tally');
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>Show<\/label><select id="\1"/);
  });

  it('lists only the chosen machine’s entries, and says how many they are and what its rounds add up to', () => {
    const html = listing('roulette');
    const kinds = [...html.matchAll(/data-kind="([a-z]+)" data-game="([a-z-]+)" data-testid="mypage-entry"/g)].map((match) => `${match[1]}:${match[2]}`);
    expect(kinds).toEqual(['round:roulette']);
    expect(html).toMatch(/<option value="roulette" selected="">/);
    expect(html).toContain('data-listing="roulette"');
    expect(said(html)).toBe('Roulette & Martingale: 1 of the history’s 6 entries. Bet 5 · won 35 +30 30 medals up');
    // A machine that lost says so.
    expect(said(listing('slot-machine'))).toBe('Slot Machine: 1 of the history’s 6 entries. Bet 3 · won 0 −3 3 medals down');
  });

  it('adds up a pusher’s visits as medals fed, its jackpot (the visit’s own medals) once', () => {
    const html = listing('medal-pusher');
    expect(html.match(/data-testid="mypage-entry"/g)).toHaveLength(2);
    expect(said(html)).toBe('Medal Pusher: 2 of the history’s 6 entries. Fed 40 · won 322 +282 282 medals up');
  });

  it('adds nothing up where nothing was played: the medal center’s own entries, and the floor jackpot’s', () => {
    const center = listing(CENTER);
    expect(center.match(/data-testid="mypage-entry"/g)).toHaveLength(2);
    expect(said(center)).toBe('Medal Game Center: 2 of the history’s 6 entries.');
    const won = record(historyOf(), { type: 'floor', id: '20261017-a1b2c3d4', medals: 2_431, at: T0 + 300_000, day: DAY, left: 2_531 } as Observation);
    expect(said(listing(FLOOR_JACKPOT, won))).toBe('Medal floor: 1 of the history’s 7 entries.');
  });

  it('pages through the chosen machine’s entries, not the whole history’s', () => {
    let history = createHistory('phone00001', T0);
    for (let i = 0; i < PAGE_SIZE + 5; i++) {
      history = record(history, { type: 'move', game: i % 2 ? 'roulette' : 'slot-machine', round: `s${i}`, step: 'pay', medals: 1, at: T0 + i * 1000, day: DAY, left: 100 + i });
    }
    for (let i = 0; i < PAGE_SIZE + 7; i++) {
      history = record(history, { type: 'move', game: 'blackjack', round: `c${i}`, step: 'pay', medals: 2, at: T0 + 100_000 + i * 1000, day: DAY, left: 200 + i });
    }
    const few = listing('roulette', history);
    expect(few.match(/data-testid="mypage-entry"/g)).toHaveLength(22);
    expect(few).not.toContain('data-testid="mypage-more"');
    const many = listing('blackjack', history);
    expect(many.match(/data-testid="mypage-entry"/g)).toHaveLength(PAGE_SIZE);
    expect(textOf(many)).toContain(`Showing ${PAGE_SIZE} of ${PAGE_SIZE + 7}.`);
    expect(many).toContain('Show 7 more');
  });

  it('goes back to everything when the list holds nothing of what was chosen', () => {
    const html = listing('craps');
    expect(html).toContain('data-listing=""');
    expect(html.match(/data-testid="mypage-entry"/g)).toHaveLength(6);
    expect(said(html)).toBe('The history holds 6 entries.');
  });

  it('once the history has let entries go, says a machine’s list is not all of it, and keeps the days’ totals for everything', () => {
    const at = (date: number, minute: number) => new Date(2026, 9, date, 20, minute).getTime();
    const steps: Observation[] = [
      { type: 'move', game: 'roulette', round: 'a1', step: 'pay', medals: 5, at: at(15, 0), day: '2026-10-15', left: 105 },
      ...[1, 2, 3].map((n): Observation => ({ type: 'move', game: 'roulette', round: `b${n}`, step: 'pay', medals: 2, at: at(16, n), day: '2026-10-16', left: 105 + 2 * n })),
    ];
    const whole = steps.reduce(record, createHistory('phone00001', at(15, 0) - 60_000));
    const kept: History = { ...whole, entries: whole.entries.slice(0, 2) };
    const one = listing('roulette', kept);
    expect(one).toContain('data-testid="mypage-filter-cut"');
    expect(one).not.toContain('data-testid="mypage-day-cut"');
    expect(one).not.toContain('data-testid="mypage-older"');
    const all = listing(EVERYTHING, kept);
    expect(all).not.toContain('data-testid="mypage-filter-cut"');
    expect(all).toContain('data-testid="mypage-day-cut"');
    expect(all).toContain('data-testid="mypage-older"');
    // A history that has let nothing go has nothing to say about it.
    expect(listing('roulette', whole)).not.toContain('data-testid="mypage-filter-cut"');
    expect(whole.entries.length).toBeLessThan(HISTORY_LIMITS.entries);
  });

  it('holds its place, with nothing to choose, until the history has been read and while it is empty', () => {
    const waiting = wrap(<MyPageView bank={BANK_WAITING} history={HISTORY_WAITING} book={BOOK_WAITING} />);
    expect(waiting).toMatch(/<select[^>]*data-testid="mypage-filter"[^>]*disabled=""/);
    expect(said(waiting)).toBe('—');
    const empty = listing(EVERYTHING, createHistory('phone00001', T0));
    expect(empty).toMatch(/<select[^>]*data-testid="mypage-filter"[^>]*disabled=""/);
    expect(said(empty)).toBe('The history holds 0 entries.');
    expect(empty).toContain('data-testid="mypage-empty"');
  });

  it('reads in Japanese', () => {
    const html = listing('roulette', historyOf(), 'ja');
    expect(options(html)[0]).toBe(`${EVERYTHING}=すべて`);
    expect(said(html).replace(/ /g, '')).toBe('ルーレット&マーチンゲール：履歴6件のうち1件です。ベット5枚・獲得35枚+3030枚プラス');
    expect(html).toMatch(/>絞り込み<\/label>/);
  });

  it('counts what the entries are of, and adds up only rounds and visits', () => {
    const { entries } = historyOf();
    expect(listedIn(entries)).toEqual([
      { game: CENTER, count: 2 },
      { game: 'medal-pusher', count: 2 },
      { game: 'slot-machine', count: 1 },
      { game: 'roulette', count: 1 },
    ]);
    expect(listedIn([])).toEqual([]);
    expect(chosenOf('roulette', listedIn(entries))).toBe('roulette');
    expect(chosenOf('craps', listedIn(entries))).toBe(EVERYTHING);
    expect(chosenOf('roulette', [])).toBe(EVERYTHING);
    // Every entry: the two rounds and the pusher's one visit. The bonus, the jackpot and the reset are left out.
    expect(tallyOf(entries)).toEqual({ rounds: 2, visits: 1, bet: 48, won: 357 });
    expect(tallyOf(entries.filter((entry) => entry.g === CENTER))).toEqual({ rounds: 0, visits: 0, bet: 0, won: 0 });
  });
});
