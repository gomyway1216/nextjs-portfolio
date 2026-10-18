import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { FloorJackpotOddsNote, FloorJackpotPanel, FloorJackpotStrip, JackpotWins } from '@/components/game/MedalCenter/floor/FloorJackpot';
import { Board, BestAtEach, FeedList, PlaceCard, type PlaceState } from '@/components/game/MedalCenter/floor/FloorParts';
import { FloorRankings } from '@/components/game/MedalCenter/floor/FloorRankings';
import { FloorHub, HUB_MOMENTS_SHOWN } from '@/components/game/MedalCenter/floor/FloorTogether';
import { FLOOR_PLACE_ANCHOR, MEDAL_RANKINGS_PATH } from '@/components/game/MedalCenter/floor/paths';
import { getFloorStrings, type FloorStrings } from '@/components/game/MedalCenter/floor/strings';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import type { FloorFeedEntry, FloorRow } from '@/lib/medalFloor/types';

const inLanguage = (lang: 'en' | 'ja', node: React.ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

const words = (lang: 'en' | 'ja' = 'en') => {
  const i18n = createI18nInstance(lang);
  const locale = lang === 'ja' ? 'ja-JP' : 'en-US';
  return { t: getFloorStrings(lang), fmt: (n: number) => n.toLocaleString(locale), gameName: (game: string) => i18n.t(`games.${game}.title`) };
};

/** The medal center's front as the page puts it together: the floor played together by the door and under the machines. */
const front = (lang: 'en' | 'ja' = 'en') =>
  inLanguage(
    lang,
    <FloorHub member={null} settled signInHref="/signin">
      {({ now, together }) => <MedalCenter signInHref="/signin" now={now} together={together} />}
    </FloorHub>,
  );

const NOW = Date.UTC(2026, 9, 17, 6, 0, 0);
/** The markup with each count's nowrap wrapper taken off: the words as they read. */
const plain = (html: string) => html.replace(/<span style="white-space:nowrap">([^<]*)<\/span>/g, '$1');
const FEED: FloorFeedEntry[] = [
  { id: 3, name: 'Lucky Cat', tag: '0001', game: 'medal-pusher', label: 'jackpot', medals: 523, at: NOW - 120_000 },
  { id: 2, name: null, tag: '1234', game: 'slot-machine', label: 'seven3', medals: 3_000, at: NOW - 10_000 },
  { id: 1, name: 'みけ', tag: '0002', game: 'janken', label: 'double-up', medals: 160, at: NOW - 3 * 3_600_000 },
];

describe('the floor’s moments', () => {
  it('say who won what at which machine, and when, in English', () => {
    const marked = renderToStaticMarkup(<FeedList {...words()} feed={FEED} now={NOW} loading={false} unavailable={false} />);
    // Each count is kept on one line with what it counts.
    expect(marked).toContain('<span style="white-space:nowrap">523 medals</span>');
    expect(marked).toContain('<span style="white-space:nowrap">160-medal</span>');
    const html = plain(marked);
    expect(html).toContain('Lucky Cat</bdi> <span>hit the JACKPOT: 523 medals</span>');
    expect(html).toContain('Player 1234</bdi> <span>lined up three sevens: 3,000 medals</span>');
    expect(html).toContain('won a 160-medal double-up');
    expect(html).toContain('Medal Pusher · <time');
    expect(html).toContain('2 min ago');
    expect(html).toContain('just now');
    expect(html).toContain('3 h ago');
    expect(html.match(/data-testid="floor-moment"/g)).toHaveLength(3);
    expect(html).not.toContain('floor-hide-moment');
  });

  it('and in Japanese', () => {
    const marked = renderToStaticMarkup(<FeedList {...words('ja')} feed={FEED} now={NOW} loading={false} unavailable={false} />);
    expect(marked).toContain('<span style="white-space:nowrap">3,000枚</span>');
    const html = plain(marked);
    expect(html).toContain('ジャックポット！523枚');
    // The newest machines' named wins read as Japanese: never 「ゾロ目的中」 (「ゾロ・目的・中」).
    const ja = getFloorStrings('ja');
    expect(ja.moment('sicbo-triple', '181')).toBe('シックボーでゾロ目が的中！181枚');
    expect(ja.moment('sicbo-any-triple', '31')).toBe('シックボーの「ゾロ目どれでも」で31枚');
    expect(ja.moment('ladder-top', '2,000')).toBe('ハイ＆ローのラダーをトップまで上って2,000枚');
    expect(ja.moment('sugoroku-jp', '1,020')).toBe('くじら島すごろくでジャックポット！1,020枚');
    expect(ja.moment('whale-ride', '70')).toBe('くじら島すごろくのくじらライドで70枚');
    expect(ja.moment('maze-big', '5')).toBe('駄菓子屋メダルめいろで大当たり！5枚');
    expect(ja.moment('maze-win', '2')).toBe('駄菓子屋メダルめいろで当たり！2枚');
    expect(html).toContain('プレイヤー1234');
    expect(html).toContain('7が3つそろって3,000枚');
    expect(html).toContain('ダブルアップで160枚');
    expect(html).toContain('2分前');
  });

  it('say how long ago in whole units gone by: never "60 min" or "24 h", and a day and a half is a day', () => {
    const MIN = 60;
    const H = 3_600;
    const D = 86_400;
    const cases: [number, string, string][] = [
      [10, 'just now', 'たったいま'],
      [50, '1 min ago', '1分前'],
      [119, '1 min ago', '1分前'],
      [59.6 * MIN, '59 min ago', '59分前'],
      [60 * MIN, '1 h ago', '1時間前'],
      [100 * MIN, '1 h ago', '1時間前'],
      [23.7 * H, '23 h ago', '23時間前'],
      [24 * H, '1 d ago', '1日前'],
      [36 * H, '1 d ago', '1日前'],
      [6.5 * D, '6 d ago', '6日前'],
    ];
    for (const [seconds, en, ja] of cases) {
      expect(getFloorStrings('en').ago(Math.round(seconds)), `${seconds} s`).toBe(en);
      expect(getFloorStrings('ja').ago(Math.round(seconds)), `${seconds} s`).toBe(ja);
    }
  });

  it('say so when the floor is quiet or cannot be reached, and give the owner a way to take one off', () => {
    expect(renderToStaticMarkup(<FeedList {...words()} feed={[]} now={NOW} loading={false} unavailable={false} />)).toContain(getFloorStrings('en').feedEmpty);
    expect(renderToStaticMarkup(<FeedList {...words()} feed={[]} now={NOW} loading={false} unavailable />)).toContain(getFloorStrings('en').feedUnavailable);
    expect(renderToStaticMarkup(<FeedList {...words()} feed={FEED} now={NOW} loading={false} unavailable={false} onHide={() => {}} />).match(/floor-hide-moment/g)).toHaveLength(3);
  });
});

describe('the boards', () => {
  const rows: FloorRow[] = [
    { rank: 1, name: 'Lucky Cat', tag: '0001', score: 3_210, at: 1 },
    { rank: 2, name: null, tag: '1234', score: 160, at: 2 },
    { rank: 2, name: 'Ben', tag: '0003', score: 160, at: 3 },
  ];

  it('rank players by name and medals, sharing a rank where they tie', () => {
    const html = renderToStaticMarkup(<Board {...words()} title="Medals won" rows={rows} testId="won" />);
    expect(html.match(/data-rank="2"/g)).toHaveLength(2);
    expect(html).toContain('#1');
    expect(html).toContain('3,210 medals');
    expect(html).toContain('Player 1234');
    expect(html).not.toContain('floor-block');
    expect(renderToStaticMarkup(<Board {...words('ja')} title="獲得メダル" rows={rows} testId="won" />)).toContain('1位');
    expect(renderToStaticMarkup(<Board {...words()} title="x" rows={[]} testId="won" />)).toContain(getFloorStrings('en').boardEmpty);
  });

  it('show the owner the hidden lines, marked, with the owner’s controls', () => {
    const owned: FloorRow[] = [
      { rank: 0, name: 'Cheater', tag: '0009', score: 99_999, at: 1, pid: '0123456789abcdef', hidden: true, blocked: false },
      { rank: 0, name: 'Blocked', tag: '0008', score: 500, at: 1, pid: 'fedcba9876543210', hidden: true, blocked: true },
      { rank: 1, name: 'Ann', tag: '0001', score: 100, at: 1, pid: '00112233445566aa', hidden: false, blocked: false },
    ];
    const html = renderToStaticMarkup(<Board {...words()} title="x" rows={owned} testId="won" owner={{ hide: () => {}, block: () => {} }} />);
    expect(html.match(/data-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('>Hidden<');
    expect(html).toContain('>Show<');
    expect(html).toContain('>Unblock player<');
    expect(html.match(/>Block player</g)).toHaveLength(2);
  });

  it('give the hub the biggest win at each machine that has one', () => {
    const html = renderToStaticMarkup(
      <BestAtEach {...words()} boards={{ best: { roulette: [rows[0]!], 'slot-machine': [rows[1]!] } }} />,
    );
    expect(html.match(/data-testid="floor-best-row"/g)).toHaveLength(2);
    // In the floor's own order: the slot machine comes before roulette.
    expect(html.indexOf('data-game="slot-machine"')).toBeLessThan(html.indexOf('data-game="roulette"'));
  });
});

describe('a player’s place on the floor', () => {
  const card = (state: PlaceState, extra: Partial<Parameters<typeof PlaceCard>[0]> = {}) =>
    renderToStaticMarkup(<PlaceCard t={getFloorStrings('en')} state={state} busy={false} problem={null} signInHref="/signin" onJoin={() => {}} onLeave={() => {}} {...extra} />);

  it('asks a guest to sign in, and offers nothing else', () => {
    const html = card({ kind: 'guest' });
    expect(html).toContain('href="/signin"');
    expect(html).not.toContain('floor-join');
  });

  it('is off until the player joins, and says that nothing is sent until then', () => {
    const html = card({ kind: 'off' });
    expect(html).toContain('nothing about your play is sent anywhere');
    expect(html).toContain('>Join the floor<');
    expect(html).toContain('real name or email');
    expect(html).not.toContain('floor-leave');
  });

  it('shows a player on the floor their name, and how to change it or leave', () => {
    const html = card({ kind: 'on', name: 'Lucky Cat', tag: '0001' });
    expect(html).toContain('You are on the floor as Lucky Cat.');
    expect(html).toContain('value="Lucky Cat"');
    expect(html).toContain('>Leave the floor<');
    expect(card({ kind: 'on', name: null, tag: '0042' })).toContain('You are on the floor as Player 0042.');
    expect(card({ kind: 'blocked' })).toContain(getFloorStrings('en').blocked);
    expect(card({ kind: 'off' }, { problem: 'Please choose a different nickname.' })).toContain('role="alert"');
  });
});

describe('the floor on the medal center’s front', () => {
  it('hangs its board by the door, after the medals and the daily bonus and over the machines, and keeps the rankings and the place card under them, before anything is read', () => {
    const html = front();
    const t = getFloorStrings('en');
    const at = (id: string) => html.indexOf(`data-testid="${id}"`);
    // The medals, the bonus, the board (the floor jackpot, then the latest big wins and whether they are live), the machines, the rankings, the plate.
    const order = ['center-counter', 'center-bonus', 'floor-now', 'floor-jackpot', 'floor-live', 'floor-feed-empty', 'center-machines', 'floor-together', 'floor-rankings', 'floor-place'].map(at);
    for (const index of order) expect(index).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(at('floor-place')).toBeLessThan(html.indexOf('center-rules-title'));
    // The board has a heading of its own, and the rankings theirs.
    expect(html).toContain(`<h2 id="floor-now-title"`);
    expect(html).toContain(`>${t.nowTitle}</h2>`);
    expect(html).toContain(`>${t.title}</h2>`);
    for (const id of ['floor-more-moments', 'floor-all-rankings']) expect(html.match(new RegExp(`<a[^>]*data-testid="${id}"[^>]*>`))?.[0]).toContain(`href="${MEDAL_RANKINGS_PATH}"`);
    expect(html).toContain(t.honesty);
    expect(html).toContain('data-state="guest"');
    // The place card is where the floor jackpot's line sends a player who has not joined.
    expect(html).toContain(`<div id="${FLOOR_PLACE_ANCHOR}" `);
    // Its short boards are drawn empty while the floor is read, their lines held unseen, so they come in where they are.
    expect(html).toMatch(/data-period="day" data-floor-read="false"><div[^>]*data-testid="floor-won"><h4[^>]*>[^<]*<\/h4><p class="[^"]*unseen[^"]*" aria-hidden="true">/);
    expect(html).toMatch(/data-testid="floor-best"><h4[^>]*>[^<]*<\/h4><p class="[^"]*unseen[^"]*" aria-hidden="true">/);
    // Nothing time-based is in the server's render: the floor is read in the browser.
    expect(html).not.toContain('<time');
    expect(HUB_MOMENTS_SHOWN).toBe(3);
  });

  it('the rankings page renders in Japanese with every machine’s board to come', () => {
    const html = inLanguage('ja', <FloorRankings member={null} settled={false} owner={null} />);
    expect(html).toContain('ランキング');
    expect(html).toContain('data-state="checking"');
    expect(html).toContain(getFloorStrings('ja').honesty);
  });

  it('the rankings page draws what the floor will fill in where it will be, held unseen, so that nothing moves when it does', () => {
    const t = getFloorStrings('en');
    const html = inLanguage('en', <FloorRankings member={null} settled={false} owner={null} />);
    // Every board, empty, its line held unseen, under its heading (an h2 for the medals won, an h3 for each machine's best).
    expect(html).toMatch(/data-testid="rankings-boards" data-floor-read="false"/);
    for (const [testId, level] of [['rankings-won', 2], ...FLOOR_GAMES.map((game) => [`rankings-best-${game}`, 3] as const)] as const) {
      expect(html, testId).toMatch(new RegExp(`data-testid="${testId}"><h${level}[^>]*>[^<]*</h${level}><p class="[^"]*unseen[^"]*" aria-hidden="true">${t.boardEmpty}</p>`));
    }
    // The note on when the floor's days start, held with a time of day that is the same on the server and in the browser.
    expect(html).toMatch(/<p class="[^"]*unseen[^"]*" data-testid="rankings-period-note" data-time-zone="Asia\/Tokyo" aria-hidden="true">Days start at midnight Japan time \(12:00 PM where you are\)/);
    // The moments: dots over the quiet floor's line, which holds its place.
    expect(html).toMatch(new RegExp(`data-testid="floor-feed-empty"><span>…</span><span class="[^"]*unseen[^"]*" aria-hidden="true">${t.feedEmpty}</span>`));
    // The player's place: the question over a guest's line, which holds its place.
    expect(html).toMatch(new RegExp(`<span>${t.checking}</span><span class="[^"]*unseen[^"]*" aria-hidden="true">${t.signInToJoin}</span>`));
  });
});

describe('the floor jackpot', () => {
  it('is on the medal center’s front, over the moments, with a guest told how to take part, before anything is read', () => {
    const html = front();
    const t = getFloorStrings('en');
    expect(html).toContain('data-testid="floor-jackpot"');
    expect(html.indexOf('floor-jackpot-amount')).toBeLessThan(html.indexOf('floor-feed-empty'));
    expect(html).toContain('>FLOOR JACKPOT<');
    // Nothing is known on the server: dashes, not a number.
    expect(html).toContain('–,–––');
    expect(html).toContain('data-standing="guest"');
    expect(html.includes(`href="/signin" data-testid="jackpot-sign-in">${t.jackpotGuest}`)).toBe(true);
    expect(html).toContain(t.jackpotHonesty);
    // Which machines are linked to it, by name.
    expect(html).toContain('Linked machines: Medal Pusher, Slot Machine, Calico Janken, Roulette &amp; Martingale, Three Card Poker, Big Catch Harbor, Mini Turf Racing, Ball Bingo, Star Festival Big Wheel, High &amp; Low Ladder, Moonlit Sic Bo, Whale Isle Sugoroku, Candy Shop Medal Maze.');
  });

  it('tells a signed-in player who is not on the floor to join it, and one on it that they play for it', () => {
    const t = getFloorStrings('en');
    expect(inLanguage('en', <FloorJackpotPanel standing="off" />)).toContain(t.jackpotJoinHere);
    // The place card is further down the page, past the machines: the line goes to it.
    expect(inLanguage('en', <FloorJackpotPanel standing="off" />)).toContain(`href="#${FLOOR_PLACE_ANCHOR}" data-testid="jackpot-join-here">${t.jackpotJoinHere}</a>`);
    // How it works, and the machines linked to it, open under the counter.
    expect(inLanguage('en', <FloorJackpotPanel standing="off" />)).toMatch(/<details[^>]*data-testid="jackpot-how"><summary[^>]*>How it works<\/summary>/);
    expect(inLanguage('en', <FloorJackpotPanel standing="on" />)).toContain(t.jackpotIn);
    expect(inLanguage('en', <FloorJackpotPanel standing="none" />)).not.toContain('jackpot-join');
    expect(inLanguage('ja', <FloorJackpotPanel standing="off" />)).toContain('フロアジャックポット');
  });

  it('is over every machine, small; until the medals are read, its line holds a guest’s line’s place, unseen', () => {
    const html = inLanguage('en', <FloorJackpotStrip game="slot-machine" />);
    expect(html).toContain('data-testid="floor-jackpot-strip"');
    expect(html).toContain('data-linked="true"');
    expect(html).toContain('data-size="small"');
    // Most visitors are guests: their line comes in where it was held, and nothing under the strip moves.
    const held = (language: 'en' | 'ja') => new RegExp(`<p class="[^"]*unseen[^"]*" data-testid="jackpot-join" data-standing="unknown" aria-hidden="true">${getFloorStrings(language).jackpotGuest}</p>`);
    expect(html).toMatch(held('en'));
    expect(inLanguage('ja', <FloorJackpotStrip game="slot-machine" />)).toMatch(held('ja'));
  });

  it('says plainly over a table that is not linked to it that play there neither feeds it nor wins it', () => {
    for (const game of ['blackjack', 'video-poker', 'baccarat', 'craps'] as const) {
      const html = inLanguage('en', <FloorJackpotStrip game={game} />);
      expect(html, game).toContain('data-linked="false"');
      expect(html, game).toContain(getFloorStrings('en').jackpotNotLinked);
      expect(html, game).not.toContain('jackpot-join');
    }
    expect(inLanguage('ja', <FloorJackpotStrip game="craps" />)).toContain(getFloorStrings('ja').jackpotNotLinked);
  });

  it('says on every linked machine’s Odds tab what it adds, on top, and on what terms, in both languages', () => {
    const en = inLanguage('en', <FloorJackpotOddsNote game="slot-machine" />);
    expect(en).toContain('+ 1% of every medal played goes to the floor jackpot');
    expect(en).toContain('1 medal for every 100 you play');
    expect(en).toContain('1 in 150,000');
    expect(en).toContain('starts again at 1,000 medals');
    expect(en).toContain('1.67 medals for every 100 played');
    expect(en).toContain('first 20,000 medals');
    expect(en).toContain('exactly as shown');
    expect(en).toContain(getFloorStrings('en').jackpotHonesty);
    const ja = inLanguage('ja', <FloorJackpotOddsNote game="slot-machine" />);
    expect(ja).toContain('遊んだメダルの1%');
    expect(ja).toContain('150,000分の1');
    expect(ja).toContain('100枚につき1.67枚');
    expect(ja).toContain('20,000枚まで');
    expect(ja).toContain('対象のマシン：メダルプッシャー');
  });

  it('says on the Odds tab of a table that is not linked that it takes no part, with no figures', () => {
    const en = inLanguage('en', <FloorJackpotOddsNote game="video-poker" />);
    expect(en).toContain(getFloorStrings('en').jackpotRulesOut);
    expect(en).not.toContain('150,000');
    expect(en).not.toContain(getFloorStrings('en').jackpotHonesty);
    expect(inLanguage('ja', <FloorJackpotOddsNote game="video-poker" />)).toContain(getFloorStrings('ja').jackpotRulesOut);
  });

  it('is shown on every machine on the floor, and under every one of their Odds tabs, which still never touch the medals', () => {
    const folders: Record<string, [string, string]> = {
      'medal-pusher': ['MedalPusher/MedalPusher.tsx', 'OddsTab'],
      'slot-machine': ['SlotMachine/SlotMachine.tsx', 'OddsTab'],
      janken: ['Janken/Janken.tsx', 'OddsTab'],
      roulette: ['Roulette/Roulette.tsx', 'EdgeTab'],
      blackjack: ['Blackjack/Blackjack.tsx', 'OddsTab'],
      'video-poker': ['VideoPoker/VideoPoker.tsx', 'OddsTab'],
      baccarat: ['Baccarat/Baccarat.tsx', 'OddsTab'],
      craps: ['Craps/Craps.tsx', 'OddsTab'],
      'three-card-poker': ['ThreeCardPoker/ThreeCardPoker.tsx', 'OddsTab'],
      fishing: ['Fishing/Fishing.tsx', 'OddsTab'],
      'horse-race': ['HorseRace/HorseRace.tsx', 'OddsTab'],
      'ball-bingo': ['BallBingo/BallBingo.tsx', 'OddsTab'],
      'big-wheel': ['BigWheel/BigWheel.tsx', 'OddsTab'],
      'high-low': ['HighLow/HighLow.tsx', 'OddsTab'],
      'sic-bo': ['SicBo/SicBo.tsx', 'OddsTab'],
      sugoroku: ['Sugoroku/Sugoroku.tsx', 'OddsTab'],
      'coin-maze': ['CoinMaze/CoinMaze.tsx', 'OddsTab'],
    };
    expect(Object.keys(folders)).toEqual(FLOOR_GAMES.slice());
    const source = (file: string) => readFileSync(path.join(process.cwd(), 'src/components/game', file), 'utf8');
    for (const [game, [machine, odds]] of Object.entries(folders)) {
      const text = source(machine);
      expect(text, game).toContain(`<FloorJackpotStrip game="${game}" />`);
      // In the Odds tab's panel, straight after the tab.
      expect(text, game).toMatch(new RegExp(`<${odds} />\\s*\\{/\\*[^*]*\\*/\\}\\s*<FloorJackpotOddsNote game="${game}" />`));
      expect(source(`${machine.split('/')[0]}/${odds}.tsx`), game).not.toContain('MedalCenter');
    }
  });

  it('lists its last wins, and gives the owner a void on each that is not void already', () => {
    const w = words();
    const wins = [
      { id: '20261017-a1b2c3d4', state: 'pending' as const, name: 'Lucky Cat', tag: '0001', game: 'slot-machine' as const, medals: 3_210, at: NOW - 60_000 },
      { id: '20261016-a1b2c3d4', state: 'void' as const, name: null, tag: '0042', game: 'roulette' as const, medals: 9_999, at: NOW - 86_400_000 },
    ];
    const shown = plain(renderToStaticMarkup(<JackpotWins {...w} wins={wins.map(({ id: _id, state: _state, ...win }) => win)} now={NOW} />));
    expect(shown).toContain('Lucky Cat</bdi> hit the FLOOR JACKPOT: 3,210 medals');
    expect(shown).toContain('Player 0042');
    expect(shown).not.toContain('jackpot-void');
    const owned = renderToStaticMarkup(<JackpotWins {...w} wins={wins} now={NOW} owner={() => {}} />);
    expect(owned.match(/data-testid="jackpot-void"/g)).toHaveLength(1);
    expect(owned).toContain(getFloorStrings('en').jackpotState.void);
    expect(renderToStaticMarkup(<JackpotWins {...w} wins={[]} now={NOW} />)).toContain(getFloorStrings('en').jackpotNever);
  });
});

describe('the floor’s words', () => {
  const everything = (t: FloorStrings): string[] => {
    const out: string[] = [];
    for (const value of Object.values(t)) {
      if (typeof value === 'string') out.push(value);
      else if (typeof value === 'function') {
        out.push(String(value('x', '9')));
        for (const label of ['jackpot', 'bowl', 'seven3', 'bar3', 'double-up', 'royal', 'straight-flush', 'four-kind', 'floor-jackpot', 'harbor-lord', 'treasure', 'wheel-400', 'wheel-bonus', 'ladder-top', 'sicbo-triple', 'sicbo-any-triple', 'sugoroku-jp', 'whale-ride', 'maze-big', 'maze-win', null]) out.push(String(value(label, '9')));
      } else if (value && typeof value === 'object') out.push(...Object.values(value as Record<string, string>));
    }
    return out;
  };

  it('never read as money, in either language', () => {
    for (const text of everything(getFloorStrings('en'))) expect(text, text).not.toMatch(/\b(bank|banked|deposit|withdraw|balance|cash|money|coins?|bet)\b|\$/i);
    for (const text of everything(getFloorStrings('ja'))) expect(text, text).not.toMatch(/預け|預かり|引き出し|残高|お金|賞金|現金|換金/);
  });

  it('say every refusal of a name in both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      const refusals = getFloorStrings(lang).refusals;
      for (const reason of ['empty', 'short', 'long', 'characters', 'contact', 'reserved', 'abuse'] as const) expect(refusals[reason].length).toBeGreaterThan(5);
    }
  });
});
