import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { SmartBall } from '@/components/game/SmartBall';
import { HOLES, MARBLES, SIZE, WINDOWS, drawPlay, holeAt, playOf, seeded, slotFor, type Draw, type Entry } from '@/components/game/SmartBall/engine';
import { getStrings, type SmartBallStrings } from '@/components/game/SmartBall/i18n';
import { OddsTab } from '@/components/game/SmartBall/OddsTab';
import { BALL_PLACES, MEDAL_PLACES, PlayTab, WIN_PLACES, phrasesOf } from '@/components/game/SmartBall/PlayTab';
import {
  ARC,
  BOARD_H,
  BOARD_W,
  COL_X,
  DEAD,
  DROP_X,
  GUTTER_Y,
  HOLE_R,
  LANE_X,
  LEAVE,
  MR,
  PIN_ROWS,
  REST,
  ROW_Y,
  SWEEP_MS,
  createMachineClock,
  cuesOf,
  firstPin,
  holeXY,
  landingX,
  loadTrack,
  poseAt,
  shotTrack,
  strengthAt,
  weakTrack,
  windowAtHeld,
  windowOf,
  type Track,
} from '@/components/game/SmartBall/scene';
import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const at = (row: number, col: number): Entry => ({ row, col });
/** A draw that drops each marble, shot at strength 3, at `entries` (OUT for the rest). */
const draw = (entries: (Entry | null)[]): Draw => ({ drops: Array.from({ length: MARBLES }, (_, m) => slotFor(3, m < entries.length ? entries[m] : null)), blinds: Array.from({ length: MARBLES }, () => 3) });
const ALL3 = Array.from({ length: MARBLES }, () => 3);

describe('the machine', () => {
  it('starts with its counters dark until the medals are read, an empty board, START, Skip and the plunger', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="smb-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="smb-start"[^>]*disabled=""/);
    // The plunger and Skip are there from the start, so that nothing moves when a play begins; they do nothing until then.
    expect(markup).toMatch(/<button[^>]*data-testid="smb-plunger"[^>]*aria-disabled="true"/);
    expect(markup).toMatch(/<button[^>]*data-testid="smb-skip"[^>]*disabled=""/);
    // Skip only fast-forwards, once the last marble has been shot, and says so.
    const skipButton = markup.match(/<button[^>]*data-testid="smb-skip"[^>]*>/)?.[0] ?? '';
    expect(skipButton).toContain('aria-describedby="smb-skip-why"');
    expect(skipButton).toContain('title="after the last marble"');
    expect(render(<PlayTab />, 'ja')).toMatch(/<span id="smb-skip-why"[^>]*>玉を全部打ってから<\/span>/);
    expect(markup.match(/<polygon/g)).toHaveLength((MEDAL_PLACES + BALL_PLACES + WIN_PLACES) * 7);
    expect(markup.match(/data-hole="/g)).toHaveLength(HOLES);
    expect(markup.match(/data-lamp="/g)).toHaveLength(WINDOWS);
    expect(markup.match(/data-step="/g)).toHaveLength(WINDOWS);
    expect(markup).toContain('data-lit="0"');
    expect(markup).toContain('>5 MEDALS · 10 BALLS<');
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // No refill of its own until there are no medals, and no reset: both are the medal center's.
    expect(markup).not.toContain('smb-refill');
    expect(markup).not.toContain('smb-card-away');
  });

  it('is in Japanese too, the table’s English only where a real one prints it', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>スタート<');
    expect(markup).toContain('>引いて打つ<');
    expect(markup).toContain('>ビンゴ<');
    expect(markup).toContain('>100枚<');
    expect(markup).toContain(NOT_MONEY.ja);
    expect(markup).toMatch(/>「スタート」で<\/span><wbr\/><span[^>]*>メダル5枚、<\/span>/);
    expect(markup).not.toMatch(/>(START|PULL|BINGO|MEDALS|BALLS|WIN|Skip)</);
  });

  it('breaks its lines between phrases: after 、。：！… and at the zero-width spaces the words carry', () => {
    expect(phrasesOf('3／10個目：​バネを引いて、​離して打とう！')).toEqual(['3／10個目：', 'バネを引いて、', '離して打とう！']);
    expect(phrasesOf('Marble 3 of 10')).toEqual(['Marble ', '3 ', 'of ', '10']);
  });
});

/** Every pose along a track, sampled finely. */
const along = (way: Track) => Array.from({ length: Math.ceil(way.length * 240) + 1 }, (_, i) => poseAt(way, i / 240));

describe('the plunger', () => {
  it('draws back and eases in again while held, a second each way, and shoots at the strength it is let go at', () => {
    expect(strengthAt(0)).toBe(0);
    expect(strengthAt(SWEEP_MS / 2)).toBeCloseTo(0.5);
    expect(strengthAt(SWEEP_MS)).toBe(1);
    expect(strengthAt(SWEEP_MS * 1.5)).toBeCloseTo(0.5);
    expect(strengthAt(SWEEP_MS * 2)).toBeCloseTo(0);
    expect(windowOf(DEAD / 2)).toBe(-1);
    expect(windowOf(DEAD)).toBe(0);
    expect(windowOf(1)).toBe(WINDOWS - 1);
    // Every strength comes up on the way back and on the way in, each as long as the others (the hardest at the turn).
    const seen = new Map<number, number>();
    for (let t = 0; t < 2 * SWEEP_MS; t++) seen.set(windowAtHeld(t), (seen.get(windowAtHeld(t)) ?? 0) + 1);
    for (let w = 0; w < WINDOWS; w++) expect(seen.get(w), `strength ${w + 1}`).toBeGreaterThan(200);
    expect(seen.get(-1)).toBeGreaterThan(150);
  });

  it('sends each strength over the columns its chances favour, rolling off the rail further round the harder it is shot', () => {
    for (let w = 0; w < WINDOWS; w++) {
      expect(landingX(LEAVE[w])).toBeCloseTo(DROP_X[w], 3);
      if (w > 0) expect(LEAVE[w]).toBeGreaterThan(LEAVE[w - 1]);
      expect(PIN_ROWS[0].xs).toContain(firstPin(w));
    }
    // The softest over the right-hand column, the hardest over the left-hand one, the middle between the middle two.
    expect(Math.abs(DROP_X[0] - COL_X[3])).toBeLessThan(15);
    expect(Math.abs(DROP_X[6] - COL_X[0])).toBeLessThan(15);
    expect(DROP_X[3]).toBe((COL_X[1] + COL_X[2]) / 2);
  });
});

describe('the marble’s way', () => {
  it('runs up the lane, round the rail, down through the pins and into the hole the play says, never jumping', () => {
    // Sixty marbles, every strength among them.
    const random = seeded(3);
    for (let p = 0; p < 6; p++) {
      const d = drawPlay(random);
      const shots = Array.from({ length: MARBLES }, (_, m) => (m + p) % WINDOWS);
      const play = playOf(d, shots);
      for (const marble of play.marbles) {
        const way = shotTrack(marble, d.drops[marble.marble], false, 0.5);
        const poses = along(way);
        expect(poses[0].x).toBe(LANE_X);
        // Up the lane first: nowhere near the board until it has been round the rail.
        expect(poses[Math.round(0.05 * 240)].x).toBe(LANE_X);
        const last = poses.at(-1)!;
        if (marble.hole !== null) expect(last).toMatchObject({ ...holeXY(marble.hole), shown: 1, sunk: 1 });
        else expect(last.shown).toBe(0);
        for (let i = 1; i < poses.length; i++) expect(Math.hypot(poses[i].x - poses[i - 1].x, poses[i].y - poses[i - 1].y)).toBeLessThan(8);
        for (const pose of poses) {
          expect(pose.x).toBeGreaterThanOrEqual(MR);
          expect(pose.x).toBeLessThanOrEqual(BOARD_W - MR);
          expect(pose.y).toBeLessThanOrEqual(BOARD_H);
          // Round the top: never outside the rail.
          if (pose.y < ARC.y) expect(Math.hypot(pose.x - ARC.x, pose.y - ARC.y)).toBeLessThanOrEqual(ARC.r + 0.5);
        }
        const sounds = cuesOf(way).map((c) => c.sound);
        expect(sounds[0]).toBe('spring');
        expect(sounds.at(-1)).toBe(marble.hole === null ? 'drop' : 'hole');
        expect(cuesOf(way).filter((c) => c.cue === 'hole')).toHaveLength(marble.hole === null ? 0 : 1);
        expect(cuesOf(way).filter((c) => c.cue === 'out')).toHaveLength(marble.hole === null ? 1 : 0);
      }
    }
  });

  it('rattles over a lit hole and rolls on into the next one down, never through a hole it passes', () => {
    const play = playOf(draw([at(1, 2), at(1, 2)]), ALL3.slice(0, 2));
    const second = play.marbles[1];
    expect(second.hole).toBe(holeAt(2, 2));
    const way = shotTrack(second, slotFor(3, at(1, 2)), false);
    expect(cuesOf(way).map((c) => c.sound)).toContain('rattle');
    // Thrown past the top hole of its column, round it: never over its mouth.
    const top = holeXY(holeAt(0, 2));
    for (const pose of along(way)) {
      if (Math.abs(pose.y - top.y) < 2) expect(Math.abs(pose.x - top.x)).toBeGreaterThan(HOLE_R);
    }
  });

  it('goes down a gap between the columns to the gutter when the pins send it past every hole', () => {
    const play = playOf(draw([]), [3]);
    const way = shotTrack(play.marbles[0], slotFor(3, null), false);
    const poses = along(way);
    expect(poses.at(-1)!.shown).toBe(0);
    expect(Math.max(...poses.map((p) => p.y))).toBeCloseTo(GUTTER_Y, 0);
    // Clear of every hole on its way down.
    for (const pose of poses) {
      for (let h = 0; h < HOLES; h++) {
        const hole = holeXY(h);
        expect(Math.hypot(pose.x - hole.x, pose.y - hole.y)).toBeGreaterThan(HOLE_R);
      }
    }
  });

  it('rolls back down the lane after too soft a shot, and the next marble rolls onto the plunger', () => {
    const weak = weakTrack(false);
    expect(poseAt(weak, weak.length)).toMatchObject({ x: REST.x, y: REST.y });
    expect(Math.min(...along(weak).map((p) => p.y))).toBeLessThan(REST.y - 40);
    expect(cuesOf(weak).at(-1)?.cue).toBe('back');
    const load = loadTrack(false);
    expect(poseAt(load, load.length)).toMatchObject({ x: REST.x, y: REST.y, shown: 1 });
  });

  it('with less motion, puts the marble where each piece ends, at once', () => {
    const play = playOf(draw([at(3, 1)]), [3]);
    const way = shotTrack(play.marbles[0], slotFor(3, at(3, 1)), true);
    expect(way.length).toBeLessThan(0.5);
    expect(poseAt(way, 1)).toMatchObject({ ...holeXY(holeAt(3, 1)), sunk: 1 });
    expect(weakTrack(true).length).toBeLessThan(0.5);
    expect(loadTrack(true).length).toBeLessThan(0.2);
  });

  it('runs on a clock that stops while the machine is not on show, and goes on from the same point', () => {
    let real = 1_000;
    const clock = createMachineClock(() => real);
    real = 1_500;
    clock.pause();
    real = 9_000;
    expect(clock.now()).toBe(1_500);
    expect(clock.paused()).toBe(true);
    clock.resume();
    real = 9_100;
    expect(clock.now()).toBe(1_600);
    expect(clock.paused()).toBe(false);
  });

  it('lays the board out with room: the holes inside it, the columns over the gaps, the plunger at the foot of the lane', () => {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) expect(holeXY(holeAt(r, c))).toEqual({ x: COL_X[c], y: ROW_Y[r] });
    expect(COL_X[SIZE - 1] + HOLE_R + 20).toBeLessThan(LANE_X - MR);
    expect(ROW_Y[SIZE - 1] + HOLE_R).toBeLessThan(GUTTER_Y - 10);
    expect(REST.y + MR).toBeLessThan(BOARD_H);
  });
});

describe('the page', () => {
  it('has the machine and its Odds tab, the floor jackpot over it, and the way back to the medal center', () => {
    const markup = render(<SmartBall />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('Hot Spring');
    expect(markup).toContain('id="smb-tab-machine"');
    expect(markup).toContain('id="smb-tab-odds"');
    expect(markup).toMatch(/id="smb-panel-odds"[^>]*hidden=""/);
    expect(markup).toContain('data-testid="smb-center"');
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
    expect(render(<SmartBall />, 'ja')).toContain('湯けむり');
  });

  it('stands open on the medal center’s floor in the kids and candy shop corner, is a game of the site, and is linked to the floor jackpot', () => {
    expect(FLOOR.find(({ id }) => id === 'smart-ball')?.path).toBe('/games/smart-ball');
    expect(FLOOR_GAMES).toContain('smart-ball');
    expect(games.find(({ id }) => id === 'smart-ball')).toMatchObject({ path: '/games/smart-ball', category: 'Arcade', title: 'Hot Spring Smart Ball' });
    expect(linked('smart-ball')).toBe(true);
    const hub = render(<MedalCenter />);
    expect(hub).toMatch(/<li[^>]*data-open="true" data-machine="smart-ball" data-zone="kids" data-wide="false"/);
    expect(hub.match(/<a[^>]*data-testid="center-play-smart-ball"[^>]*>/)?.[0] ?? '').toContain('href="/games/smart-ball"');
    expect(hub).toContain('data-testid="center-best-smart-ball">Best return 93.5%</span>');
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/en/common.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/ja/common.json'), 'utf8'));
    expect(en.games['smart-ball'].title).toBe(getStrings('en').title);
    expect(ja.games['smart-ball'].title).toBe(getStrings('ja').title);
  });
});

/** Every string a player can be shown, with sample arguments for the ones that take them. */
function everyString(t: SmartBallStrings): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const plays = [
    playOf(draw([at(0, 0), at(0, 1), at(0, 2), at(0, 3)]), ALL3),
    playOf(draw([at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(3, 0), at(3, 1), at(3, 2), at(3, 3)]), ALL3),
    playOf(draw([at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(1, 0), at(2, 0), at(3, 0), at(1, 2), at(2, 1)]), ALL3),
    playOf(draw([at(1, 1)]), ALL3),
    playOf(draw([]), ALL3),
  ];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  for (const [key, value] of Object.entries(t)) {
    if (key === 'status') {
      for (const [name, item] of Object.entries(value as SmartBallStrings['status'])) {
        if (typeof item === 'string') add(`status.${name}`, item);
        else for (const arg of [-1, 0, 3, 6, 9, 15]) add(`status.${name}(${arg})`, (item as (n: number) => string)(arg));
      }
      continue;
    }
    if (typeof value !== 'function') {
      add(key, value);
      continue;
    }
    if (key === 'outcome' || key === 'historyEntry' || key === 'historyEntryLabel') for (const play of plays) add(key, (value as (p: typeof play) => unknown)(play));
    else if (key === 'infoBody') add(key, t.infoBody('93.46%', '77.80%', '32.62%'));
    else {
      const call = value as (...a: unknown[]) => unknown;
      for (const args of [[0], [3], [6], [100], ['9'], ['1/2'], [2, 1]]) add(`${key}(${args.join(',')})`, call(...args));
    }
  }
  return out;
}

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player is shown reads as money, except the note
  // that says the medals are not money. A real smart ball pays balls for prizes: this one pays medals, never prizes.
  const EN_MONEY = /\b(bank|banks|banked|deposit|withdraw|cash|money|dollars?|balance|credits?|wager(ed|s)?|bankroll|paid out|pay ?out|payout|coins?|yen|prizes?)\b|cash out|\$/i;
  const JA_MONEY = /預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|クレジット|賭け金|払い戻し|持ち金|払い出し|収支|賭け|儲け|稼|賞金|硬貨|コイン|景品/;

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
      expect(t.infoBody('93.46%', '77.80%', '32.62%')).toContain(t.notMoney);
    }
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('show no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      for (const node of [<SmartBall key="page" />, <OddsTab key="odds" />]) {
        const text = render(node, lang)
          .replace(/<[^>]*>/g, ' ')
          .split(t.notMoney)
          .join(' ');
        expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
      }
    }
  });

  it('name no real machine, maker, shop or character: the table is the floor’s own', () => {
    for (const lang of ['en', 'ja'] as const) {
      const all = everyString(getStrings(lang))
        .map(({ text }) => text)
        .join(' ');
      expect(all).not.toMatch(/New Star|ニュースター|三松館|Mimatsu|ともえや|Tomoeya|柳屋|Sega|セガ|Konami|コナミ|Bandai|バンダイ|Namco|ナムコ|Taito|タイトー|Sankyo|三共|Nishijin|西陣|Doraemon|ドラえもん/i);
    }
  });

  it('say what the rest of the floor says, in the same words', () => {
    const plain = (text: string) => text.replace(/​/g, '');
    const en = getStrings('en');
    const ja = getStrings('ja');
    expect(en.refill(100)).toBe('Out of medals — take 100 more');
    expect(ja.refill(100)).toBe('メダルがなくなりました — 100枚もらう');
    expect(en.cardAway).toBe('Your medals are in a machine in another tab.');
    expect(plain(ja.cardAway)).toBe('持ちメダルは別のタブのマシンで使われています。');
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('>今回のプレイ<');
    expect(markup).toContain('>最近のプレイ<');
  });

  it('tells how a play ended in a few words, and in a sentence for a screen reader', () => {
    const en = getStrings('en');
    expect(en.outcome(playOf(draw([at(0, 0), at(0, 1), at(0, 2), at(0, 3)]), ALL3))).toEqual({ status: 'BINGO! +7', say: 'All 10 marbles shot: 1 line lit, 7 medals won.' });
    expect(en.outcome(playOf(draw([at(1, 1)]), ALL3)).status).toBe('1 hole lit, no line this time');
    const ja = getStrings('ja');
    expect(ja.outcome(playOf(draw([at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(1, 0), at(2, 0), at(3, 0), at(1, 2), at(2, 1)]), ALL3)).status).toBe('ビンゴ3列！​+100枚');
  });
});
