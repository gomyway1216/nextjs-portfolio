import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { CoinMaze } from '@/components/game/CoinMaze';
import { GATE_KINDS, GATE_PATTERNS, OPENING, PIN_ROWS, POCKETS, STAGES, TIMEOUT, WINDOW_MS, playOf, type Draw, type StageEnd } from '@/components/game/CoinMaze/engine';
import { getStrings, type CoinMazeStrings } from '@/components/game/CoinMaze/i18n';
import { OddsTab } from '@/components/game/CoinMaze/OddsTab';
import { MEDAL_PLACES, PlayTab, WIN_PLACES, phrasesOf } from '@/components/game/CoinMaze/PlayTab';
import { BOARD_H, BOARD_W, CUPS, CUP_LIP, FUNNEL, GATE_X, HOLES, POCKET_REST_Y, POCKET_X, R, SHELVES, cuesOf, dropTrack, flickTrack, gateLook, pinsTrack, poseAt, type Track } from '@/components/game/CoinMaze/scene';
import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const draw = (over: Partial<Draw> = {}): Draw => ({ gates: [0, 0, 0, 0], phases: [0, 0, 0, 0], wobbles: [true, true, true, true], blinds: [1, 1, 1, 1], pins: [true, true, false, false], ...over });

describe('the machine', () => {
  it('starts with its counters dark until the medals are read, an empty case, DROP, the lever and Skip', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="cm-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="cm-drop"[^>]*disabled=""/);
    // The lever and Skip are there from the start, so that nothing moves when a play begins; they do nothing until then.
    expect(markup).toMatch(/<button[^>]*data-testid="cm-lever"[^>]*aria-disabled="true"/);
    expect(markup).toMatch(/<button[^>]*data-testid="cm-skip"[^>]*disabled=""/);
    expect(markup.match(/<polygon/g)).toHaveLength((MEDAL_PLACES + WIN_PLACES) * 7);
    expect(markup.match(/data-gate="/g)).toHaveLength(STAGES);
    expect(markup.match(/data-pocket="/g)).toHaveLength(POCKETS.length);
    expect(markup).toContain('role="img" aria-label="The maze: four lever cups with a moving gate at each, then four rows of pins over the pockets. No medal in the maze."');
    expect(markup).toContain('>1 MEDAL A PLAY<');
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // No refill of its own until there are no medals, and no reset: both are the medal center's.
    expect(markup).not.toContain('cm-refill');
    expect(markup).not.toContain('cm-card-away');
  });

  it('is in Japanese too, the cabinet’s English only where a real one prints it', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>メダルを入れる<');
    expect(markup).toContain('>レバー<');
    expect(markup).toContain('>大当り<');
    expect(markup).toContain('>あたり<');
    expect(markup).toContain(NOT_MONEY.ja);
    // The status line, kept whole between its phrases.
    expect(markup).toMatch(/>「メダルを入れる」で<\/span><wbr\/><span[^>]*>メダルを1枚入れよう。</);
    expect(markup).not.toMatch(/>(BIG|WIN|DROP|LEVER)</);
  });

  it('breaks its lines between phrases: after 、。：！… and at the zero-width spaces the words carry', () => {
    expect(phrasesOf('ゲート1／4：​開いたら​はじこう！')).toEqual(['ゲート1／4：', '開いたら', 'はじこう！']);
    expect(phrasesOf('Gate 1 of 4: flick when it opens!')).toEqual(['Gate ', '1 ', 'of ', '4: ', 'flick ', 'when ', 'it ', 'opens!']);
  });
});

/** Every pose along a track, sampled finely, and the cues it gives. */
const along = (way: Track) => Array.from({ length: Math.ceil(way.length * 240) + 1 }, (_, i) => poseAt(way, i / 240));

describe('the medal’s way', () => {
  it('drops in at the slot, rolls down the first shelf and comes to rest in the first cup', () => {
    const way = dropTrack(false);
    const poses = along(way);
    expect(poses[0].y).toBeLessThan(30);
    expect(poses.at(-1)).toMatchObject({ x: CUPS[0].x, y: CUPS[0].y, shown: 1 });
    // A roll turns the medal as it goes: so many degrees for the distance it rolled.
    expect(Math.abs(poses.at(-1)!.turn)).toBeGreaterThan(90);
    expect(cuesOf(way).map((c) => c.sound).filter(Boolean)).toEqual(['drop', 'roll', 'drop']);
    // It never jumps: from one 240th of a second to the next it moves a little at most.
    for (let i = 1; i < poses.length; i++) expect(Math.hypot(poses[i].x - poses[i - 1].x, poses[i].y - poses[i - 1].y)).toBeLessThan(6);
  });

  it('sails through an open gate (or squeezes through after a graze) to the next cup, and from the fourth into the funnel over the pins', () => {
    const flights: [number, StageEnd][] = [];
    for (let stage = 0; stage < STAGES; stage++) flights.push([stage, 'through'], [stage, 'graze-through']);
    for (const [s, end] of flights) {
      const way = flickTrack(s, end, false);
      const poses = along(way);
      expect(poses[0]).toMatchObject({ x: CUPS[s].x, y: CUPS[s].y });
      const last = poses.at(-1)!;
      if (s + 1 < STAGES) expect(last).toMatchObject({ x: CUPS[s + 1].x, y: CUPS[s + 1].y, shown: 1 });
      else expect(last).toMatchObject({ x: FUNNEL.x, y: FUNNEL.y });
      expect(cuesOf(way)[0]).toMatchObject({ sound: 'spring', cue: 'launch' });
      for (let i = 1; i < poses.length; i++) expect(Math.hypot(poses[i].x - poses[i - 1].x, poses[i].y - poses[i - 1].y)).toBeLessThan(8);
      // Clear of the gate's foot and the cup's lip: the medal never goes below its cup until it lands on the next shelf.
      for (const pose of poses.slice(0, Math.round(0.05 * 240))) expect(pose.y).toBeLessThanOrEqual(CUPS[s].y + 1);
      // Never through the shelf over its own cup: the lob passes under it.
      const shelf = SHELVES[s];
      for (const pose of poses) {
        const lo = Math.min(shelf.from.x, shelf.to.x);
        const hi = Math.max(shelf.from.x, shelf.to.x);
        if (pose.x < lo || pose.x > hi || pose.y > CUPS[s].y + 2) continue;
        const line = shelf.from.y + ((shelf.to.y - shelf.from.y) * (pose.x - shelf.from.x)) / (shelf.to.x - shelf.from.x);
        expect(pose.y - R, `gate ${s + 1}, ${end}`).toBeGreaterThan(line + 2);
      }
    }
  });

  it('clacks against a shut gate, wobbles on a half-open one, and drops into the OUT hole, out of sight', () => {
    for (const s of [0, 1]) {
      for (const end of ['shut', 'graze-out', 'timeout'] as StageEnd[]) {
        const way = flickTrack(s, end, false);
        const poses = along(way);
        expect(poses.at(-1)).toMatchObject({ x: HOLES[s].x, y: HOLES[s].y, shown: 0 });
        // It drops between the gate and the cup's lip, never through the cup's floor or the gate.
        for (const pose of poses) {
          if (pose.y <= CUPS[s].y + R + 3) continue;
          expect(Math.min(Math.abs(pose.x - GATE_X[s]), Math.abs(pose.x - CUP_LIP[s])), `gate ${s + 1}, ${end}`).toBeGreaterThanOrEqual(R - 0.5);
          expect(Math.sign(pose.x - GATE_X[s])).not.toBe(Math.sign(pose.x - CUP_LIP[s]));
        }
      }
    }
    expect(cuesOf(flickTrack(1, 'shut', false)).map((c) => c.sound)).toContain('clack');
    const grazed = flickTrack(2, 'graze-through', false);
    expect(cuesOf(grazed).map((c) => c.cue)).toEqual(['launch', 'clack', 'through', undefined, undefined, undefined, 'cup']);
    expect(poseAt(grazed, grazed.length)).toMatchObject({ x: CUPS[3].x, y: CUPS[3].y });
    // On the gate's edge it tips (seen edge-on) as it wobbles.
    expect(Math.min(...along(grazed).map((p) => p.tip))).toBeLessThan(0.7);
  });

  it('goes down through the pins left or right as drawn, into its pocket, pin by pin', () => {
    for (const pins of [
      [true, true, false, false],
      [true, true, true, true],
      [false, false, false, false],
      [false, true, false, false],
    ]) {
      const way = pinsTrack(pins, false);
      const bin = pins.filter(Boolean).length;
      expect(poseAt(way, way.length)).toMatchObject({ x: POCKET_X[bin], y: POCKET_REST_Y, shown: 1 });
      expect(cuesOf(way).filter((c) => c.sound === 'pin')).toHaveLength(PIN_ROWS);
      expect(cuesOf(way).at(-1)).toMatchObject({ sound: 'pocket', cue: 'pocket' });
    }
    expect(POCKET_REST_Y + R).toBeLessThanOrEqual(BOARD_H);
    expect(POCKET_X[0] - 20).toBeGreaterThanOrEqual(0);
    expect(POCKET_X.at(-1)! + 20).toBeLessThanOrEqual(BOARD_W);
  });

  it('with less motion, puts the medal where each piece ends, at once', () => {
    expect(dropTrack(true).length).toBeLessThan(0.5);
    expect(poseAt(dropTrack(true), 1)).toMatchObject({ x: CUPS[0].x, y: CUPS[0].y });
    expect(flickTrack(0, 'through', true).length).toBeLessThan(0.5);
    expect(poseAt(flickTrack(0, 'shut', true), 1)).toMatchObject({ shown: 0 });
    expect(pinsTrack([true, true, true, true], true).length).toBeLessThan(0.5);
  });

  it('shows a gate never more open than it stands: it closes inside an open window, and opens inside the next', () => {
    for (const kind of GATE_KINDS) {
      const levels = GATE_PATTERNS[kind].map((slot) => OPENING[slot]);
      for (let t = 0; t < WINDOW_MS * 8; t += 7) {
        const window = Math.floor(t / WINDOW_MS);
        expect(gateLook(levels, 0, t, WINDOW_MS, false), `${kind} at ${t} ms`).toBeLessThanOrEqual(levels[window] + 1e-9);
      }
    }
    // With less motion, it steps from window to window.
    expect(gateLook([0, 1], 0, WINDOW_MS - 1, WINDOW_MS, true)).toBe(0);
    expect(gateLook([0, 1], 0, WINDOW_MS, WINDOW_MS, true)).toBe(1);
  });
});

describe('the page', () => {
  it('has the machine and its Odds tab, the floor jackpot over it, and the way back to the medal center', () => {
    const markup = render(<CoinMaze />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('Candy Shop');
    expect(markup).toContain('id="cm-tab-machine"');
    expect(markup).toContain('id="cm-tab-odds"');
    expect(markup).toMatch(/id="cm-panel-odds"[^>]*hidden=""/);
    expect(markup).toContain('data-testid="cm-center"');
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
    expect(render(<CoinMaze />, 'ja')).toContain('駄菓子屋');
  });

  it('stands open on the medal center’s floor in the kids and candy shop corner, is a game of the site, and is linked to the floor jackpot', () => {
    expect(FLOOR.find(({ id }) => id === 'coin-maze')?.path).toBe('/games/coin-maze');
    expect(FLOOR_GAMES).toContain('coin-maze');
    expect(games.find(({ id }) => id === 'coin-maze')).toMatchObject({ path: '/games/coin-maze', category: 'Arcade', title: 'Candy Shop Medal Maze' });
    expect(linked('coin-maze')).toBe(true);
    const hub = render(<MedalCenter />);
    expect(hub).toMatch(/<li[^>]*data-open="true" data-machine="coin-maze" data-zone="kids" data-wide="false"/);
    expect(hub.match(/<a[^>]*data-testid="center-play-coin-maze"[^>]*>/)?.[0] ?? '').toContain('href="/games/coin-maze"');
    expect(hub).toContain('data-testid="center-best-coin-maze">Best return 92.5%</span>');
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/en/common.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/ja/common.json'), 'utf8'));
    expect(en.games['coin-maze'].title).toBe(getStrings('en').title);
    expect(ja.games['coin-maze'].title).toBe(getStrings('ja').title);
  });
});

/** Every string a player can be shown, with sample arguments for the ones that take them. */
function everyString(t: CoinMazeStrings): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const plays = [
    playOf(draw(), [1, 1, 1, 1]),
    playOf(draw({ pins: [true, true, true, true] }), [1, 1, 1, 1]),
    playOf(draw({ pins: [true, false, false, false] }), [1, 1, 1, 1]),
    playOf(draw(), [1, 7]),
    playOf(draw({ wobbles: [false, false, false, false] }), [0]),
    playOf(draw(), [TIMEOUT]),
  ];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  for (const [key, value] of Object.entries(t)) {
    if (key === 'status') {
      const status = value as CoinMazeStrings['status'];
      for (const [name, item] of Object.entries(status)) {
        if (typeof item === 'string') add(`status.${name}`, item);
      }
      for (let s = 0; s < STAGES; s++) add('status.wait', status.wait(s));
      for (const end of ['through', 'graze-through', 'graze-out', 'shut', 'timeout'] as StageEnd[]) add('status.end', status.end(end));
      continue;
    }
    if (typeof value !== 'function') {
      add(key, value);
      continue;
    }
    if (key === 'outcome' || key === 'historyEntry') for (const play of plays) add(key, (value as (p: typeof play) => unknown)(play));
    else if (key === 'pocketName' || key === 'pocketShort' || key === 'pocketPays') for (const pocket of ['big', 'win', 'out'] as const) add(key, (value as (p: typeof pocket) => unknown)(pocket));
    else if (key === 'kindName') for (const kind of GATE_KINDS) add(key, t.kindName(kind));
    else if (key === 'infoBody') add(key, t.infoBody('92.53%', '75.81%', '4.97%'));
    else {
      const call = value as (...a: unknown[]) => unknown;
      for (const args of [[0], [3], [100], ['9'], ['1/2']]) add(`${key}(${args.join(',')})`, call(...args));
    }
  }
  return out;
}

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player is shown reads as money, except the note
  // that says the medals are not money. The real cabinets took 10-yen coins: this one takes medals, never coins.
  const EN_MONEY = /\b(bank|banks|banked|deposit|withdraw|cash|money|dollars?|balance|credits?|wager(ed|s)?|bankroll|paid out|pay ?out|payout|coins?|yen)\b|cash out|\$/i;
  const JA_MONEY = /預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|クレジット|賭け金|払い戻し|持ち金|払い出し|収支|賭け|儲け|稼|賞金|10円|十円|硬貨|コイン/;

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
      expect(t.infoBody('92.53%', '75.81%', '4.97%')).toContain(t.notMoney);
    }
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('show no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      for (const node of [<CoinMaze key="page" />, <OddsTab key="odds" />]) {
        const text = render(node, lang)
          .replace(/<[^>]*>/g, ' ')
          .split(t.notMoney)
          .join(' ');
        expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
      }
    }
  });

  it('name no real machine, maker or character: the maze and its gates are the floor’s own', () => {
    for (const lang of ['en', 'ja'] as const) {
      const all = everyString(getStrings(lang))
        .map(({ text }) => text)
        .join(' ');
      expect(all).not.toMatch(/新幹線|Shinkansen|ニシキ|Nishiki|ホップステップ|Hop Step|山のぼり|ジャンケンマン|Sega|セガ|Konami|コナミ|Bandai|バンダイ|Namco|ナムコ|Taito|タイトー|Doraemon|ドラえもん|Anpanman|アンパンマン/i);
    }
  });

  it('tells how a play ended in a few words, and in a sentence for a screen reader', () => {
    const en = getStrings('en');
    expect(en.outcome(playOf(draw(), [1, 1, 1, 1]))).toEqual({ status: 'WIN! +2', say: 'Through all four gates and into the WIN pocket: 2 medals won.' });
    expect(en.outcome(playOf(draw(), [1, 7])).status).toBe('OUT at gate 2: the gate was shut');
    expect(en.outcome(playOf(draw(), [TIMEOUT])).status).toBe('OUT at gate 1: time ran out');
    const ja = getStrings('ja');
    expect(ja.outcome(playOf(draw({ pins: [true, true, true, true] }), [1, 1, 1, 1])).status).toBe('大当たり！​+5枚');
  });
});

describe('the Odds tab', () => {
  it('shows the three hands’ exact returns, every gate and kind, the pins, skipping, and a check by play', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="cm-perfect">92.53%<');
    expect(markup).toContain('data-testid="cm-typical">75.81%<');
    expect(markup).toContain('data-testid="cm-blind">4.97%<');
    expect(markup).toContain('data-testid="cm-reach">67.29%<');
    expect(markup).toContain('121275/131072');
    expect(markup.match(/<tr data-stage="/g)).toHaveLength(STAGES);
    expect(markup.match(/<tr data-kind="/g)).toHaveLength(GATE_KINDS.length);
    expect(markup.match(/<tr data-pocket="/g)).toHaveLength(POCKETS.length);
    expect(markup).toContain('Wide 5 · Even 2 · Flutter 1');
    expect(markup).toContain('>Play them<');
    const ja = render(<OddsTab />, 'ja');
    expect(ja).toContain('動的計画法');
    expect(ja).toContain('>遊ぶ<');
  });
});
