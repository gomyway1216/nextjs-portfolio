import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { Sugoroku } from '@/components/game/Sugoroku';
import { BETS, BLOWHOLE, BOARD, BOARD_SIZE, JP_LAMPS, STAR, playOf, type Draw } from '@/components/game/Sugoroku/engine';
import { getStrings, timesOf, type SugorokuStrings } from '@/components/game/Sugoroku/i18n';
import { OddsTab } from '@/components/game/Sugoroku/OddsTab';
import { BET_PLACES, MEDAL_PLACES, PlayTab, WIN_PLACES } from '@/components/game/Sugoroku/PlayTab';
import { beatsOf, finalScene, lampRun, tumbleFaces, type Banner } from '@/components/game/Sugoroku/scene';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const roll = (face: number, extra: Partial<Draw> = {}): Draw => ({ roll: face, ride: [1, 1, 1], lamp: 0, final: 1, ...extra });

describe('the machine', () => {
  it('starts with its counters dark until the medals are read, the boat at START, the board, the bets and ROLL', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="sg-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="sg-roll"[^>]*disabled=""[^>]*>ROLL</);
    // Skip is there from the start, so that nothing moves when a roll plays; it does nothing until one does.
    expect(markup).toMatch(/<button[^>]*data-testid="sg-skip"[^>]*disabled=""/);
    expect(markup.match(/<polygon/g)).toHaveLength((MEDAL_PLACES + BET_PLACES + WIN_PLACES) * 7);
    expect(markup.match(/<li[^>]*data-square="/g)).toHaveLength(BOARD_SIZE);
    expect(markup).toContain('data-boat="0"');
    expect(markup).toContain('aria-label="Square 0, START: sailing past it pays 1 medal. The boat is here"');
    expect(markup).toContain('The boat is on square 0: START.');
    expect(markup).toContain('aria-label="Square 2, Pearl: 2 medals"');
    expect(markup).toContain('aria-label="Square 15, Whirlpool: back to START"');
    expect(markup).toContain(`aria-label="The blowhole: the JP Chance"`);
    expect(markup.match(/role="radio"/g)).toHaveLength(BETS.length);
    expect(markup).toContain('aria-checked="true" aria-label="Bet 2 medals"');
    expect(markup).toContain('data-testid="sg-die" data-face="1" data-rolling="false"');
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // No refill of its own until there are no medals, and no reset: both are the medal center's.
    expect(markup).not.toContain('sg-refill');
    expect(markup).not.toContain('sg-card-away');
  });

  it('is in Japanese too, the cabinet’s English only where a real one prints it', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>サイコロをふる<');
    expect(markup).toContain('aria-label="2枚ベット"');
    // The status line, kept whole between its phrases: it breaks only after 「、」.
    expect(markup).toMatch(/>ベットを選んで、<\/span><wbr\/><span[^>]*>サイコロをふろう。</);
    expect(markup).toContain(NOT_MONEY.ja);
    // The squares print START and JP as a real board does, and their other words in Japanese.
    expect(markup).toContain('>チャンス<');
    expect(markup).toContain('>ボーナス<');
    expect(markup).toContain('>ふりだし<');
    expect(markup).not.toMatch(/>(BONUS|CHANCE|GO \d|BACK \d)</);
  });
});

describe('the show', () => {
  it('tumbles the die, hops the boat square by square through START’s lap bonus, and ends where the roll did', () => {
    const play = playOf(27, roll(5));
    const beats = beatsOf(play, false);
    const boats = beats.map((beat) => beat.scene.boat).filter((boat, i, all) => i === 0 || JSON.stringify(boat) !== JSON.stringify(all[i - 1]));
    expect(boats.map((boat) => (boat.on === 'board' ? boat.square : -1))).toEqual([27, 28, 29, 0, 1, 2]);
    expect(beats.some((beat) => beat.scene.banner.kind === 'lap')).toBe(true);
    expect(beats[0].sound).toBe('tumble');
    expect(beats.filter((beat) => beat.sound === 'hop')).toHaveLength(4);
    expect(beats.at(-1)!.scene).toMatchObject({ phase: 'done', boat: { on: 'board', square: 2 }, paid: 3 });
    // Never back in time, and the WIN counter only ever climbs.
    for (let i = 1; i < beats.length; i++) {
      expect(beats[i].at).toBeGreaterThanOrEqual(beats[i - 1].at);
      expect(beats[i].scene.paid).toBeGreaterThanOrEqual(beats[i - 1].scene.paid);
    }
  });

  it('runs the lamps round once and on to the one drawn, slowing as they go', () => {
    const run = lampRun(5);
    expect(run).toHaveLength(12 + 6);
    expect(run.at(-1)!.lamp).toBe(5);
    const gaps = run.slice(1).map((step, i) => step.at - run[i].at);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1] - 1e-9);
    expect(tumbleFaces(4, 9).at(-1)).not.toBe(4);
    const faces = tumbleFaces(6, 9);
    for (let i = 1; i < faces.length; i++) expect(faces[i]).not.toBe(faces[i - 1]);
  });

  it('rides the whale up its back to the blowhole, plays the JP final there, and brings the boat back to the gate', () => {
    const play = playOf(6, roll(6, { ride: [4, 6, 5], lamp: JP_LAMPS.indexOf(STAR), final: 6 }));
    const beats = beatsOf(play, false);
    const kinds = beats.map((beat) => beat.scene.banner.kind);
    for (const kind of ['ride', 'blowhole', 'jp', 'final', 'jackpot'] as Banner['kind'][]) expect(kinds).toContain(kind);
    const lane = beats.flatMap((beat) => (beat.scene.boat.on === 'lane' ? [beat.scene.boat.step] : []));
    expect([...new Set(lane)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, BLOWHOLE]);
    expect(beats.at(-1)!.scene).toMatchObject({ boat: { on: 'board', square: 12 }, paid: 204, lamps: { set: 'jp', stopped: true } });
    expect(beats.some((beat) => beat.sound === 'big')).toBe(true);
  });

  it('with less motion, shows the roll as it ended at once', () => {
    const play = playOf(0, roll(6, { lamp: 0 }));
    const beats = beatsOf(play, true);
    expect(beats).toHaveLength(1);
    expect(beats[0].scene).toEqual(finalScene(play));
    expect(beats[0].scene).toMatchObject({ boat: { on: 'board', square: 6 }, rolling: false, lamps: { set: 'lamp', lit: 0, stopped: true } });
  });
});

describe('the page', () => {
  it('has the machine and its Odds tab, the floor jackpot over it, and the way back to the medal center', () => {
    const markup = render(<Sugoroku />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('Whale Isle');
    expect(markup).toContain('id="sg-tab-machine"');
    expect(markup).toContain('id="sg-tab-odds"');
    expect(markup).toMatch(/id="sg-panel-odds"[^>]*hidden=""/);
    expect(markup).toContain('data-testid="sg-center"');
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
    expect(render(<Sugoroku />, 'ja')).toContain('くじら島');
  });

  it('stands open on the medal center’s floor among the big machines, is a game of the site, and is linked to the floor jackpot', () => {
    expect(FLOOR.find(({ id }) => id === 'sugoroku')?.path).toBe('/games/sugoroku');
    expect(FLOOR_GAMES).toContain('sugoroku');
    expect(games.find(({ id }) => id === 'sugoroku')).toMatchObject({ path: '/games/sugoroku', category: 'Arcade', title: 'Whale Isle Sugoroku' });
    expect(linked('sugoroku')).toBe(true);
    const hub = render(<MedalCenter />);
    expect(hub).toMatch(/<li[^>]*data-open="true" data-machine="sugoroku" data-zone="big" data-wide="true"/);
    const play = hub.match(/<a[^>]*data-testid="center-play-sugoroku"[^>]*>/)?.[0] ?? '';
    expect(play).toContain('href="/games/sugoroku"');
    expect(hub).toContain('data-testid="center-best-sugoroku">Best return 92.3%</span>');
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/en/common.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/ja/common.json'), 'utf8'));
    expect(en.games.sugoroku.title).toBe(getStrings('en').title);
    expect(ja.games.sugoroku.title).toBe(getStrings('ja').title);
  });
});

/** Every string a player can be shown, with sample arguments for the ones that take them. */
function everyString(t: SugorokuStrings): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const banners: Banner[] = [
    { kind: 'lap', pays: 1 },
    { kind: 'pays', pays: 2 },
    { kind: 'rest' },
    { kind: 'arrow', arrow: 'tailwind' },
    { kind: 'arrow', arrow: 'current' },
    { kind: 'arrow', arrow: 'storm' },
    { kind: 'arrow', arrow: 'whirlpool' },
    { kind: 'lamp' },
    { kind: 'jp' },
    { kind: 'final' },
    { kind: 'jackpot', pays: 200 },
    { kind: 'ride' },
    { kind: 'blowhole' },
    { kind: 'times', pays: 20 },
    { kind: 'times', pays: 0 },
    { kind: 'total', pays: 204 },
  ];
  const plays = [playOf(0, roll(6)), playOf(4, roll(5)), playOf(11, roll(4)), playOf(27, roll(5)), playOf(6, roll(6, { ride: [4, 6, 5], lamp: 0, final: 6 })), playOf(18, roll(6, { lamp: 3 })), playOf(6, roll(6, { ride: [2, 3, 4] }))];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  for (const [key, value] of Object.entries(t)) {
    if (typeof value !== 'function') {
      add(key, value);
      continue;
    }
    if (key === 'banner') for (const banner of banners) add(`banner.${banner.kind}`, t.banner(banner, 10));
    else if (key === 'outcome') for (const play of plays) add('outcome', t.outcome(play, 10));
    else if (key === 'squareAria') BOARD.forEach((square, s) => add(`squareAria.${s}`, t.squareAria(s, square.kind, 5, square.to, s === 3)));
    else if (key === 'squareText') BOARD.forEach((square, s) => add(`squareText.${s}`, t.squareText(square.kind, 4)));
    else if (key === 'squareName') BOARD.forEach((square) => add('squareName', t.squareName(square.kind)));
    else if (key === 'laneAria') for (let step = 1; step <= BLOWHOLE; step++) add('laneAria', t.laneAria(step, 5));
    else if (key === 'lampsLabel') for (const set of ['lamp', 'jp', null] as const) add('lampsLabel', t.lampsLabel(set));
    else if (key === 'infoBody') add(key, t.infoBody('93.06%', '89.74%'));
    else {
      const call = value as (...a: unknown[]) => unknown;
      for (const args of [[3], [1_020], ['1,879'], [3, 'Pearl'], ['9', '0.5%'], [4, 1_000], [true], [false], [6, false]]) add(`${key}(${args.join(',')})`, call(...args));
    }
  }
  return out;
}

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player is shown reads as money, except the note
  // that says the medals are not money.
  const EN_MONEY = /\b(bank|banks|banked|deposit|withdraw|cash|money|dollars?|balance|credits?|wager(ed|s)?|bankroll|paid out|pay ?out|payout|coins?)\b|cash out|\$/i;
  const JA_MONEY = /預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|クレジット|賭け金|払い戻し|持ち金|払い出し|収支|賭け|儲け|稼|賞金/;

  it('never read as money in English or Japanese, but for the note that says the medals are not money', () => {
    for (const [lang, money] of [
      ['en', EN_MONEY],
      ['ja', JA_MONEY],
    ] as const) {
      const t = getStrings(lang);
      for (const { key, text } of everyString(t)) {
        if (text === t.notMoney) continue;
        expect(text, `${lang} ${key}`).not.toMatch(money);
      }
      expect(t.infoBody('93.06%', '89.74%')).toContain(t.notMoney);
    }
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('show no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      for (const node of [<Sugoroku key="page" />, <OddsTab key="odds" />]) {
        const text = render(node, lang)
          .replace(/<[^>]*>/g, ' ')
          .split(t.notMoney)
          .join(' ');
        expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
      }
    }
  });

  it('name no real machine, maker or character: the island, the whale and every square are the floor’s own', () => {
    for (const lang of ['en', 'ja'] as const) {
      const all = everyString(getStrings(lang))
        .map(({ text }) => text)
        .join(' ');
      expect(all).not.toMatch(/Sega|セガ|Konami|コナミ|Bandai|バンダイ|Namco|ナムコ|Capcom|カプコン|Taito|タイトー|Monopoly|モノポリー|Mario|マリオ|Pok[eé]mon|ポケモン|Momotaro|桃太郎|桃鉄|Colotta|コロッタ|Druaga|ドルアーガ|Doraemon|ドラえもん|Anpanman|アンパンマン/i);
    }
  });

  it('writes a figure per 2 medals as a multiple of the bet: ×½, ×1, ×5, ×100', () => {
    expect(timesOf(1)).toBe('×½');
    expect(timesOf(2)).toBe('×1');
    expect(timesOf(3)).toBe('×1½');
    expect(timesOf(10)).toBe('×5');
    expect(timesOf(200)).toBe('×100');
  });

  it('tells what a roll came to in a few words, and in a sentence for a screen reader', () => {
    const en = getStrings('en');
    expect(en.outcome(playOf(0, roll(6, { lamp: 0 })), 4)).toEqual({ status: '6! Lamp Chance, ×10 → +40', say: 'Rolled a 6: Lamp Chance, ×10. 40 medals won.' });
    expect(en.outcome(playOf(4, roll(5)), 4).say).toBe('Rolled a 5: Storm to the Palm tree. Nothing this time.');
    expect(en.outcome(playOf(27, roll(5)), 2).status).toBe('5! past START, Pearl → +3');
    const ja = getStrings('ja');
    expect(ja.outcome(playOf(11, roll(4)), 4).status).toBe('4！うずしおでふりだしへ→なし');
  });
});

describe('the Odds tab', () => {
  it('shows the exact long run, the best and the quietest square, betting by the square, and every square', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="sg-rtp">89.74%<');
    expect(markup).toContain('data-testid="sg-best">93.06%<');
    expect(markup).toContain('data-testid="sg-worst">50.00%<');
    expect(markup).toContain('data-testid="sg-betting">92.30%<');
    expect(markup).toContain('67/72');
    expect(markup.match(/<tr data-square="/g)).toHaveLength(BOARD_SIZE);
    expect(markup).toContain('Tailwind → 10');
    expect(markup).toContain('37/12');
    expect(render(<OddsTab />, 'ja')).toContain('定常分布');
  });
});
