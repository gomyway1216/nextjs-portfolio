import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { ShootingGallery } from '@/components/game/ShootingGallery';
import { BANDS, CORKS, KINDS, KIND_IDS, SHELF, TARGETS, playOf, type Shot } from '@/components/game/ShootingGallery/engine';
import { getStrings, type ShootingGalleryStrings } from '@/components/game/ShootingGallery/i18n';
import { OddsTab } from '@/components/game/ShootingGallery/OddsTab';
import { CORK_PLACES, FIRST_PICK, MEDAL_PLACES, PlayTab, WIN_PLACES, phrasesOf } from '@/components/game/ShootingGallery/PlayTab';
import { createMachineClock } from '@/components/game/ShootingGallery/scene';
import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MACHINE_SOUNDS } from '@/components/game/MedalCenter/machineSounds';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';
import { drawFor } from './draws';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const TOP = 1;
const AIMS: Shot[] = [
  [6, TOP],
  [7, TOP],
  [8, TOP],
  [3, TOP],
  [5, TOP],
  [0, TOP],
];
const CAT_AIMS: Shot[] = [[1, 4], [1, 4], [1, TOP], [6, TOP], [7, TOP], [8, TOP]];
/** Plays to say things about: nothing off, one box, three figures, and the cat with three boxes. */
const PLAYS = [
  playOf(drawFor(AIMS, ['miss', 'rock', 'miss', 'rock', 'miss', 'rock']), AIMS),
  playOf(drawFor(AIMS, ['fall', 'rock', 'miss', 'rock', 'miss', 'rock']), AIMS),
  playOf(drawFor(AIMS, ['fall', 'fall', 'miss', 'fall', 'miss', 'rock']), AIMS),
  playOf(drawFor(CAT_AIMS, ['slide', 'slide', 'fall', 'fall', 'fall', 'fall']), CAT_AIMS),
];

describe('the machine', () => {
  it('starts with its counters dark until the medals are read, the stall set up, START, Skip and FIRE', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="sg-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="sg-start"[^>]*disabled=""/);
    // FIRE and Skip are there from the start, so that nothing moves when a play begins; they do nothing until then.
    expect(markup).toMatch(/<button[^>]*data-testid="sg-fire"[^>]*aria-disabled="true"/);
    expect(markup).toMatch(/<button[^>]*data-testid="sg-skip"[^>]*disabled=""/);
    // Skip only fast-forwards, once the last cork has been fired, and says so.
    const skipButton = markup.match(/<button[^>]*data-testid="sg-skip"[^>]*>/)?.[0] ?? '';
    expect(skipButton).toContain('aria-describedby="sg-skip-why"');
    expect(skipButton).toContain('title="after the last cork"');
    expect(render(<PlayTab />, 'ja')).toMatch(/<span id="sg-skip-why"[^>]*>コルクを全部撃ってから<\/span>/);
    expect(markup.match(/<polygon/g)).toHaveLength((MEDAL_PLACES + CORK_PLACES + WIN_PLACES) * 7);
    // The nine figures, each a button with its tag, every one standing; the sight on the middle of the bottom tier.
    const figures = [...markup.matchAll(/<button[^>]*data-testid="sg-figure-(\d)"[^>]*>/g)];
    expect(figures).toHaveLength(TARGETS);
    for (const [button, target] of figures) {
      expect(button).toContain(`data-kind="${SHELF[Number(target)]}"`);
      expect(button).toContain('data-position="0"');
      expect(button).toContain(`aria-pressed="${Number(target) === FIRST_PICK}"`);
    }
    expect(markup).toContain('aria-label="Sweet box, 2 medals: as set up. The sight is on it"');
    expect(markup).toContain('aria-label="Beckoning cat, 25 medals: as set up"');
    // The five bands on FIRE's gauge, and the gun, the sight and the cork in layers of their own.
    expect(markup.match(/data-step="/g)).toHaveLength(BANDS);
    for (const id of ['sg-gun', 'sg-sight', 'sg-cork']) expect(markup).toContain(`data-testid="${id}"`);
    expect(markup.match(/data-figure="/g)).toHaveLength(TARGETS);
    expect(markup).toContain('data-testid="sg-down">0<');
    expect(markup).toContain('>6 MEDALS · 6 CORKS<');
    expect(markup).toContain('>射</text>');
    expect(markup).toContain('>的</text>');
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // No refill of its own until there are no medals, and no reset: both are the medal center's.
    expect(markup).not.toContain('sg-refill');
    expect(markup).not.toContain('sg-card-away');
  });

  it('says plainly when a play takes more medals than there are', () => {
    expect(getStrings('en').notEnough).toBe('Not enough medals: a play takes 6.');
  });

  it('is in Japanese too, every word of the stall in Japanese', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>スタート<');
    expect(markup).toContain('>撃つ<');
    expect(markup).toContain('>落とした<');
    expect(markup).toContain('>25</span><span');
    expect(markup).toContain('>枚</span>');
    expect(markup).toContain(NOT_MONEY.ja);
    expect(markup).toMatch(/>「スタート」で<\/span><wbr\/><span[^>]*>メダル6枚、<\/span>/);
    expect(markup).not.toMatch(/>(START|FIRE|DOWN|MEDALS|CORKS|WIN|Skip)</);
  });

  it('breaks its lines between phrases: after 、。：！… and at the zero-width spaces the words carry', () => {
    expect(phrasesOf('3発目／6：​こけしを​ねらって​撃て！')).toEqual(['3発目／6：', 'こけしを', 'ねらって', '撃て！']);
    expect(phrasesOf('Cork 3 of 6')).toEqual(['Cork ', '3 ', 'of ', '6']);
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

  it('has its own sounds: the lever, the pop, a cork on a figure, a figure off the shelf, and a miss', () => {
    for (const sound of ['cock', 'cork', 'thud', 'topple', 'whiff'] as const) expect(MACHINE_SOUNDS).toContain(sound);
  });
});

describe('the stall’s motion', () => {
  const css = readFileSync(path.join(process.cwd(), 'src/components/game/ShootingGallery/ShootingGallery.module.css'), 'utf8');

  it('moves nothing by a 3D transform (WebKit flattens them), and sways the lanterns only for a player who has not asked for less motion', () => {
    expect(css).not.toMatch(/perspective|rotate[XY]\(|translate3d|preserve-3d/);
    const allowed = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(allowed.slice(0, allowed.indexOf('\n}\n'))).toContain('animation: sg-sway');
    // The lanterns' sway is of their transform alone, which the compositor runs, four sways to a long round.
    const sway = /@keyframes sg-sway \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(new Set([...sway.matchAll(/([a-z-]+):/g)].map((m) => m[1]))).toEqual(new Set(['transform']));
    expect(css).toMatch(/animation: sg-sway 18s ease-in-out infinite/);
  });
});

describe('the page', () => {
  it('has the machine and its Odds tab, the floor jackpot over it, and the way back to the medal center', () => {
    const markup = render(<ShootingGallery />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('Onsen');
    expect(markup).toContain('id="sg-tab-machine"');
    expect(markup).toContain('id="sg-tab-odds"');
    expect(markup).toMatch(/id="sg-panel-odds"[^>]*hidden=""/);
    expect(markup).toContain('data-testid="sg-center"');
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
    expect(render(<ShootingGallery />, 'ja')).toContain('湯の町');
  });

  it('publishes every figure’s chances on its Odds tab, out of 64, for every band but over the top', () => {
    const markup = render(<OddsTab />);
    for (const kind of KIND_IDS) {
      KINDS[kind].rows.forEach((rows, position) => {
        const table = markup.match(new RegExp(`<table[^>]*data-testid="sg-chances-${kind}-${position}"[\\s\\S]*?</table>`))?.[0] ?? '';
        expect(table, `${kind} ${position}`).not.toBe('');
        for (let band = 1; band < BANDS; band++) {
          const row = table.match(new RegExp(`<tr data-band="${band}">([\\s\\S]*?)</tr>`))?.[1] ?? '';
          expect([...row.matchAll(/<td[^>]*>(\d+)<\/td>/g)].map((m) => Number(m[1])), `${kind} ${position} ${band}`).toEqual([...rows[band]]);
        }
      });
    }
    expect(markup.match(/<tr data-fell="/g)).toHaveLength(CORKS + 2);
  });

  it('stands open on the medal center’s floor in the kids and candy shop corner, is a game of the site, and is linked to the floor jackpot', () => {
    expect(FLOOR.find(({ id }) => id === 'shooting-gallery')?.path).toBe('/games/shooting-gallery');
    expect(FLOOR_GAMES).toContain('shooting-gallery');
    expect(games.find(({ id }) => id === 'shooting-gallery')).toMatchObject({ path: '/games/shooting-gallery', category: 'Arcade', title: 'Onsen Shooting Gallery' });
    expect(linked('shooting-gallery')).toBe(true);
    const hub = render(<MedalCenter />);
    expect(hub).toMatch(/<li[^>]*data-open="true" data-machine="shooting-gallery" data-zone="kids" data-wide="false"/);
    expect(hub.match(/<a[^>]*data-testid="center-play-shooting-gallery"[^>]*>/)?.[0] ?? '').toContain('href="/games/shooting-gallery"');
    expect(hub).toContain('data-testid="center-best-shooting-gallery">Best return 92.0%</span>');
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/en/common.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/ja/common.json'), 'utf8'));
    expect(en.games['shooting-gallery'].title).toBe(getStrings('en').title);
    expect(ja.games['shooting-gallery'].title).toBe(getStrings('ja').title);
  });
});

/** Every string a player can be shown, with sample arguments for the ones that take them. */
function everyString(t: ShootingGalleryStrings): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  const outcomes = ['fall', 'slide', 'rock', 'miss'] as const;
  for (const [key, value] of Object.entries(t)) {
    if (key === 'status') {
      for (const [name, item] of Object.entries(value as ShootingGalleryStrings['status'])) {
        if (typeof item === 'string') add(`status.${name}`, item);
        else if (name === 'moment') for (const o of outcomes) for (const kind of KIND_IDS) add(`status.moment(${o},${kind})`, (item as (o: string, k: string) => string)(o, kind));
        else if (name === 'then') add('status.then', (item as (a: string, b: string) => string)('a', 'b'));
        else for (const kind of KIND_IDS) for (const arg of [0, 5]) add(`status.${name}(${arg},${kind})`, (item as (n: number, k: string) => string)(arg, kind));
      }
      continue;
    }
    if (typeof value !== 'function') {
      add(key, value);
      continue;
    }
    if (key === 'outcome' || key === 'historyEntry' || key === 'historyEntryLabel') for (const play of PLAYS) add(key, (value as (p: (typeof PLAYS)[number]) => unknown)(play));
    else if (key === 'infoBody') add(key, t.infoBody('91.95%', '65.23%', '31.11%'));
    else if (key === 'sayMoment') for (const o of outcomes) for (const kind of KIND_IDS) add(`${key}(${o},${kind})`, t.sayMoment(o, kind));
    else if (key === 'figureAria') for (let target = 0; target < TARGETS; target++) for (const position of [-1, 0, 1, 2]) add(`${key}(${target},${position})`, KINDS[SHELF[target]].rows.length > position ? t.figureAria(target, position, position === 0) : '');
    else if (key === 'kindName' || key === 'kindHeading' || key === 'flash' || key === 'whereAim') for (const kind of KIND_IDS) add(`${key}(${kind})`, (value as (...a: unknown[]) => unknown)(...(key === 'whereAim' ? [2, kind] : [kind])));
    else if (key === 'placeHeading') for (const position of [0, 1, 2]) add(`${key}(${position})`, t.placeHeading(position));
    else if (key === 'bandLabel' || key === 'bandName') for (let band = 0; band < BANDS; band++) add(`${key}(${band})`, (value as (b: number) => string)(band));
    else {
      const call = value as (...a: unknown[]) => unknown;
      for (const args of [[0], [1], [2], [3], [6], [100], ['9'], ['1/2']]) add(`${key}(${args.join(',')})`, call(...args));
    }
  }
  return out;
}

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player is shown reads as money, except the note
  // that says the medals are not money. A real gallery hands over what it knocks down: this one pays medals, never prizes.
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
      expect(t.infoBody('91.95%', '65.23%', '31.11%')).toContain(t.notMoney);
    }
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('show no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      for (const node of [<ShootingGallery key="page" />, <OddsTab key="odds" />]) {
        const text = render(node, lang)
          .replace(/<[^>]*>/g, ' ')
          .split(t.notMoney)
          .join(' ');
        expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
      }
    }
  });

  it('name no real stall, maker, shop or character: the gallery is the floor’s own', () => {
    for (const lang of ['en', 'ja'] as const) {
      const all = everyString(getStrings(lang))
        .map(({ text }) => text)
        .join(' ');
      expect(all).not.toMatch(/ゆしま|Yushima|ともえや|Tomoeya|柳屋|柳香軒|谷口屋|山光|泉娯楽場|Sega|セガ|Bandai|バンダイ|Taito|タイトー|Kewpie|キューピー|Hello Kitty|キティ/i);
    }
  });

  it('say what the rest of the floor says, in the same words, and tell how a play ended', () => {
    const plain = (text: string) => text.replace(/​/g, '');
    const en = getStrings('en');
    const ja = getStrings('ja');
    expect(en.refill(100)).toBe('Out of medals — take 100 more');
    expect(ja.refill(100)).toBe('メダルがなくなりました — 100枚もらう');
    expect(en.cardAway).toBe('Your medals are in a machine in another tab.');
    expect(plain(ja.cardAway)).toBe('持ちメダルは別のタブのマシンで使われています。');
    expect(plain(ja.status.ready(2, 'kokeshi'))).toBe('3発目／6：こけしをねらって撃て！');
    expect(en.outcome(PLAYS[0])).toEqual({ status: 'Nothing fell this time', say: 'All 6 corks fired: nothing came off the shelf. Nothing this time.' });
    expect(en.outcome(PLAYS[1])).toEqual({ status: '1 down! +2', say: 'All 6 corks fired: 1 figure off the shelf, 2 medals won.' });
    expect(en.outcome(PLAYS[3]).status).toBe('THE CAT FELL! +31');
    expect(plain(ja.outcome(PLAYS[2]).status)).toBe('3個落とした！+7枚');
    expect(plain(ja.outcome(PLAYS[3]).status)).toBe('招き猫が落ちた！+31枚');
  });
});
