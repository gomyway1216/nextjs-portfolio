import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { BallTower } from '@/components/game/BallTower';
import { BETS, DISCS, JACKPOT, LAMP_SETS, LEVELS, POCKETS, drawFor, runOf, type PocketKind, type Run } from '@/components/game/BallTower/engine';
import { getStrings, pocketKindsOf, type BallTowerStrings } from '@/components/game/BallTower/i18n';
import { OddsTab } from '@/components/game/BallTower/OddsTab';
import { JACKPOT_PLACES, MEDAL_PLACES, PlayTab, WIN_PLACES, phrasesOf } from '@/components/game/BallTower/PlayTab';
import { createMachineClock } from '@/components/game/BallTower/scene';
import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MACHINE_SOUNDS } from '@/components/game/MedalCenter/machineSounds';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
/** Runs to say things about: OUT on the top disc, ×3 on the second, a lamp's ×5, ×12 in the chance, and the jackpot. */
const RUNS: Run[] = [
  runOf(drawFor(['out'])),
  runOf(drawFor(['up', 'pay'], 3)),
  runOf(drawFor(['up', 'mystery'], 5)),
  runOf(drawFor(['up', 'up', 'up', 'pay'], 12)),
  runOf(drawFor(['up', 'up', 'up', 'up', 'jackpot'])),
];

describe('the machine', () => {
  it('starts with its counters dark until the medals are read, the tower drawn, the bets, START and Skip', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="bt-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="bt-start"[^>]*disabled=""/);
    // Skip is there from the start, so that nothing moves when a run begins; it does nothing until the ball is up.
    const skipButton = markup.match(/<button[^>]*data-testid="bt-skip"[^>]*>/)?.[0] ?? '';
    expect(skipButton).toContain('disabled=""');
    expect(skipButton).toContain('aria-describedby="bt-skip-why"');
    expect(skipButton).toContain('title="once the ball is up"');
    expect(render(<PlayTab />, 'ja')).toMatch(/<span id="bt-skip-why"[^>]*>ボールが上に着いてから<\/span>/);
    // The seat's bet buttons, the first one picked.
    const bets = [...markup.matchAll(/<button[^>]*data-testid="bt-bet-(\d+)"[^>]*>/g)];
    expect(bets.map((b) => Number(b[1]))).toEqual([...BETS]);
    expect(bets[0][0]).toContain('aria-pressed="true"');
    for (const b of bets.slice(1)) expect(b[0]).toContain('aria-pressed="false"');
    // The tower is a picture on a canvas, said in words.
    expect(markup).toMatch(/<canvas[^>]*data-testid="bt-canvas"[^>]*role="img"[^>]*aria-label="The ball tower: five turning discs/);
    expect(markup).toContain(`data-testid="bt-jackpot" data-amount="${JACKPOT}"`);
    expect(markup.match(/<polygon/g)).toHaveLength((JACKPOT_PLACES + MEDAL_PLACES + 2 + WIN_PLACES) * 7);
    expect(markup).toContain('data-testid="bt-not-money"');
  });

  it('breaks its lines between phrases: after 、。：！… and at the zero-width spaces the words carry', () => {
    expect(phrasesOf('2段目／5：​ころころ…')).toEqual(['2段目／5：', 'ころころ…']);
    expect(phrasesOf('Disc 2 of 5')).toEqual(['Disc ', '2 ', 'of ', '5']);
  });

  it('runs on a clock that stops while the machine is not on show, and goes on from the same point', () => {
    let real = 1_000;
    const clock = createMachineClock(() => real);
    real = 1_500;
    clock.pause();
    real = 9_000;
    expect(clock.now()).toBe(1_500);
    clock.resume();
    real = 9_100;
    expect(clock.now()).toBe(1_600);
    expect(clock.paused()).toBe(false);
  });

  it('has its own sounds: the lift carrying the ball up, and a firework bursting for the jackpot', () => {
    for (const sound of ['lift', 'burst', 'drop', 'pocket', 'rung', 'reach', 'bonus', 'fanfare'] as const) expect(MACHINE_SOUNDS).toContain(sound);
  });
});

describe('the cabinet’s motion', () => {
  const css = readFileSync(path.join(process.cwd(), 'src/components/game/BallTower/BallTower.module.css'), 'utf8');

  it('moves nothing by a 3D transform (WebKit flattens them), and chases its bulbs only for a player who has not asked for less motion', () => {
    expect(css).not.toMatch(/perspective|rotate[XY]\(|translate3d|preserve-3d/);
    const allowed = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(allowed.slice(0, allowed.indexOf('\n}\n'))).toContain('animation: bt-chase');
    expect(css.match(/animation: bt-chase/g)).toHaveLength(1);
    // The chase is of the bulbs' opacity alone, which the compositor runs without painting.
    for (const name of ['bt-chase', 'bt-chase-odd']) {
      const frames = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? '';
      expect(new Set([...frames.matchAll(/([a-z-]+):/g)].map((m) => m[1])), name).toEqual(new Set(['opacity']));
    }
  });
});

describe('the page', () => {
  it('has the machine and its Odds tab, the floor jackpot over it, and the way back to the medal center', () => {
    const markup = render(<BallTower />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('Firework');
    expect(markup).toContain('id="bt-tab-machine"');
    expect(markup).toContain('id="bt-tab-odds"');
    expect(markup).toMatch(/id="bt-panel-odds"[^>]*hidden=""/);
    expect(markup).toContain('data-testid="bt-center"');
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
    expect(render(<BallTower />, 'ja')).toContain('花火');
  });

  it('publishes every disc’s pockets on its Odds tab, kind by kind out of the disc’s count, and every roulette’s lamps', () => {
    const markup = render(<OddsTab />);
    for (let level = 0; level < LEVELS; level++) {
      const table = markup.match(new RegExp(`<table[^>]*data-testid="bt-disc-${level}"[\\s\\S]*?</table>`))?.[0] ?? '';
      expect(table, `disc ${level}`).not.toBe('');
      const rows = [...table.matchAll(/<tr data-kind="([a-z]+)" data-pays="(\d+)">[\s\S]*?<td[^>]*>(\d+)\/(\d+)<\/td>/g)];
      expect(rows.map((r) => [r[1], Number(r[2]), Number(r[3])]), `disc ${level}`).toEqual(pocketKindsOf(level).map((r) => [r.kind, r.pays, r.count]));
      for (const r of rows) expect(Number(r[4])).toBe(POCKETS[level]);
      expect(rows.reduce((sum, r) => sum + Number(r[3]), 0)).toBe(DISCS[level].length);
    }
    for (let level = 1; level < LEVELS; level++) {
      const table = markup.match(new RegExp(`<table[^>]*data-testid="bt-lamps-${level}"[\\s\\S]*?</table>`))?.[0] ?? '';
      const counts = [...table.matchAll(/<th scope="row">×(\d+)<\/th><td[^>]*>(\d+)\/(\d+)<\/td>/g)];
      expect(counts.reduce((sum, c) => sum + Number(c[2]), 0), `lamps ${level}`).toBe(LAMP_SETS[level].length);
    }
    expect(markup).not.toContain('data-testid="bt-lamps-0"');
  });

  it('stands open on the medal center’s floor among the big machines, is a game of the site, and is linked to the floor jackpot', () => {
    expect(FLOOR.find(({ id }) => id === 'ball-tower')?.path).toBe('/games/ball-tower');
    expect(FLOOR_GAMES).toContain('ball-tower');
    expect(games.find(({ id }) => id === 'ball-tower')).toMatchObject({ path: '/games/ball-tower', category: 'Arcade', title: 'Firework Ball Tower' });
    expect(linked('ball-tower')).toBe(true);
    const hub = render(<MedalCenter />);
    expect(hub).toMatch(/<li[^>]*data-open="true" data-machine="ball-tower" data-zone="big" data-wide="true"/);
    expect(hub.match(/<a[^>]*data-testid="center-play-ball-tower"[^>]*>/)?.[0] ?? '').toContain('href="/games/ball-tower"');
    expect(hub).toContain('data-testid="center-best-ball-tower">Best return 90.0%</span>');
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/en/common.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/ja/common.json'), 'utf8'));
    expect(en.games['ball-tower'].title).toBe(getStrings('en').title);
    expect(ja.games['ball-tower'].title).toBe(getStrings('ja').title);
  });
});

/** Every string a player can be shown, with sample arguments for the ones that take them. */
function everyString(t: BallTowerStrings): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  const stops = RUNS.flatMap((run) => run.stops);
  const kinds: PocketKind[] = ['up', 'out', 'pay', 'mystery', 'jackpot'];
  for (const [key, value] of Object.entries(t)) {
    if (key === 'status') {
      const status = value as BallTowerStrings['status'];
      add('status.first', status.first);
      add('status.again', status.again);
      add('status.lift', status.lift);
      for (let level = 0; level < LEVELS; level++) add(`status.disc(${level})`, status.disc(level));
      for (const stop of stops) for (const bet of BETS) add(`status.settled(${stop.level},${stop.kind},${bet})`, status.settled(stop, bet));
      add('status.lamp', status.lamp(5, 3));
      continue;
    }
    if (typeof value !== 'function') {
      add(key, value);
      continue;
    }
    if (key === 'outcome' || key === 'historyEntry' || key === 'historyEntryLabel') for (const run of RUNS) for (const bet of [1, 10]) add(`${key}(${bet})`, (value as (r: Run, b: number) => unknown)(run, bet));
    else if (key === 'flash') for (const run of RUNS) add(key, t.flash(run));
    else if (key === 'saySettled') for (const stop of stops) add(`${key}(${stop.kind})`, t.saySettled(stop, 2));
    else if (key === 'pocketWords') for (let level = 0; level < LEVELS; level++) for (const kind of kinds) add(`${key}(${kind},${level})`, t.pocketWords(kind, level, 6));
    else if (key === 'infoBody') add(key, t.infoBody('90.00%'));
    else if (key === 'discHeading') for (let level = 0; level < LEVELS; level++) add(`${key}(${level})`, t.discHeading(level, '6.67%'));
    else if (key === 'boardLabel') add(key, t.boardLabel(t.whereIdle));
    else if (key === 'lampHeading') for (let level = 1; level < LEVELS; level++) add(`${key}(${level})`, t.lampHeading(level));
    else {
      const call = value as (...a: unknown[]) => unknown;
      for (const args of [[0], [1], [2], [3], [4], [10], [300], ['9'], ['1/2']]) add(`${key}(${args.join(',')})`, call(...args));
    }
  }
  return out;
}

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player is shown reads as money, except the note
  // that says the medals are not money.
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
      expect(t.infoBody('90.00%')).toContain(t.notMoney);
    }
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('show no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      for (const node of [<BallTower key="page" />, <OddsTab key="odds" />]) {
        const text = render(node, lang)
          .replace(/<[^>]*>/g, ' ')
          .split(t.notMoney)
          .join(' ');
        expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
      }
    }
  });

  it('name no real machine or maker: the tower is the floor’s own', () => {
    for (const lang of ['en', 'ja'] as const) {
      const all = everyString(getStrings(lang))
        .map(({ text }) => text)
        .join(' ');
      expect(all).not.toMatch(/KAZAAAN|ZAAAN|GINGAAAN|100&|Sega|セガ|Konami|コナミ|Bandai|バンダイ|Taito|タイトー|Grand Cross|グランドクロス|Fortune Trinity|フォーチュン|Spin ?Fever|スピンフィーバー|Galileo|Anima ?Lotta|アニマロッタ/i);
    }
  });

  it('say what the rest of the floor says, in the same words, and tell how a run ended', () => {
    const plain = (text: string) => text.replace(/​/g, '');
    const en = getStrings('en');
    const ja = getStrings('ja');
    expect(en.refill(100)).toBe('Out of medals — take 100 more');
    expect(ja.refill(100)).toBe('メダルがなくなりました — 100枚もらう');
    expect(en.cardAway).toBe('Your medals are in a machine in another tab.');
    expect(plain(ja.cardAway)).toBe('持ちメダルは別のタブのマシンで使われています。');
    expect(en.outcome(RUNS[0], 2)).toEqual({ status: 'OUT on disc 1', say: 'The ball dropped into OUT on disc 1. Nothing this time.' });
    expect(en.outcome(RUNS[1], 2).status).toBe('×3 on disc 2! +6');
    expect(en.outcome(RUNS[4], 10).status).toBe('JACKPOT!! +3,000');
    expect(plain(ja.outcome(RUNS[2], 3).status)).toBe('2段目で×5！+15枚');
    expect(plain(ja.outcome(RUNS[3], 1).status)).toBe('チャンスの段で×12！+12枚');
    expect(en.finishedAway(6)).toBe('The run was finished while you were away: it paid 6 medals.');
    expect(plain(ja.finishedAway(0))).toBe('離れている間にボールが止まりました。OUTでした。');
  });
});
