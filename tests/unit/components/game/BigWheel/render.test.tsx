import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { BigWheel } from '@/components/game/BigWheel';
import { SEGMENT_COUNT, SPOTS, TOP_MULTIPLE } from '@/components/game/BigWheel/engine';
import { getStrings, type BigWheelStrings } from '@/components/game/BigWheel/i18n';
import { SPOT_MAX } from '@/components/game/BigWheel/medalTable';
import { OddsTab } from '@/components/game/BigWheel/OddsTab';
import { BET_PLACES, MEDAL_PLACES, PlayTab, WIN_PLACES } from '@/components/game/BigWheel/PlayTab';
import { DRAWN } from '@/components/game/BigWheel/Wheel';
import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the machine', () => {
  it('starts with its counters dark until the medals are read, the board’s seven numbers, and SPIN not yet pressable', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="bw-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="bw-spin"[^>]*disabled=""[^>]*>SPIN</);
    // Skip is there from the start, so that nothing moves when a spin begins; it does nothing until one has.
    expect(markup).toMatch(/<button[^>]*data-testid="bw-skip"[^>]*disabled=""/);
    expect(markup.match(/data-on="(true|false)" data-top/g)).toHaveLength(DRAWN.lamps);
    expect(markup.match(/<polygon/g)).toHaveLength((MEDAL_PLACES + BET_PLACES + WIN_PLACES) * 7);
    for (const spot of SPOTS) expect(markup).toContain(`data-testid="bw-spot-${spot}"`);
    expect(markup.match(/role="radio"/g)).toHaveLength(3);
    expect(markup).toContain('aria-checked="true" aria-label="1 medal a tap"');
    // The wheel: 54 segments with a peg between each two, its 16 lamps, the flapper and the frame's bulbs.
    expect(markup.match(/data-segment="/g)).toHaveLength(SEGMENT_COUNT);
    expect(DRAWN.segments).toBe(54);
    expect(markup).toContain('data-testid="bw-wheel"');
    expect(markup).toContain('aria-label="The big wheel: standing still"');
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // No refill of its own until there are no medals, and no reset: both are the medal center's.
    expect(markup).not.toContain('bw-refill');
    expect(markup).not.toContain('bw-card-away');
  });

  it('is in Japanese too', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>スピン<');
    expect(markup).toContain('aria-label="1タップ1枚"');
    expect(markup).toContain('数字にメダルを置く');
    expect(markup).toContain(NOT_MONEY.ja);
  });
});

describe('the page', () => {
  it('has the machine and its Odds tab, the floor jackpot over it, and the way back to the medal center', () => {
    const markup = render(<BigWheel />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('Star Festival');
    expect(markup).toContain('id="bw-tab-machine"');
    expect(markup).toContain('id="bw-tab-odds"');
    expect(markup).toMatch(/id="bw-panel-odds"[^>]*hidden=""/);
    expect(markup).toContain('data-testid="bw-center"');
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
    expect(render(<BigWheel />, 'ja')).toContain('ビッグホイール');
  });

  it('stands open on the medal center’s floor, is a game of the site, and is linked to the floor jackpot', () => {
    expect(FLOOR.find(({ id }) => id === 'big-wheel')?.path).toBe('/games/big-wheel');
    expect(FLOOR_GAMES).toContain('big-wheel');
    expect(games.find(({ id }) => id === 'big-wheel')).toMatchObject({ path: '/games/big-wheel', category: 'Arcade', title: 'Star Festival Big Wheel' });
    expect(linked('big-wheel')).toBe(true);
    const hub = render(<MedalCenter />);
    expect(hub).toMatch(/<li[^>]*data-open="true" data-machine="big-wheel"/);
    const play = hub.match(/<a[^>]*data-testid="center-play-big-wheel"[^>]*>/)?.[0] ?? '';
    expect(play).toContain('href="/games/big-wheel"');
    // Its name, in both languages, from the site's own words.
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/en/common.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/ja/common.json'), 'utf8'));
    expect(en.games['big-wheel'].title).toBe(getStrings('en').title);
    expect(ja.games['big-wheel'].title).toBe(getStrings('ja').title);
  });
});

/** Every string a player can be shown, with sample numbers in the ones that take them. */
function everyString(t: BigWheelStrings): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (typeof value === 'function') {
      // Sample arguments by how many it takes: a number (and the BONUS segment), a number and a multiplier, or a
      // number, a multiplier and the medals won.
      const call = value as (...a: unknown[]) => unknown;
      const samples: unknown[][] = value.length <= 1 ? [[2], [40], ['bonus']] : value.length === 2 ? [[40, 3], [8, 1]] : [[10, 3, 150], [5, 1, 25], [5, 10, 1]];
      for (const args of samples) add(`${key}(${args.join(',')})`, call(...args));
    } else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  for (const [key, value] of Object.entries(t)) add(key, key === 'infoBody' ? t.infoBody(TOP_MULTIPLE * SPOT_MAX) : value);
  return out;
}

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player is shown reads as money, except the note
  // that says the medals are not money.
  const EN_MONEY = /\b(bank|banks|banked|deposit|withdraw|cash|money|dollars?|balance|credits?|wager(ed|s)?|bankroll|paid out|pay ?out|payout|coins?)\b|\$/i;
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
      expect(t.infoBody(TOP_MULTIPLE * SPOT_MAX)).toContain(t.notMoney);
    }
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('show no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      const text = render(<BigWheel />, lang)
        .replace(/<[^>]*>/g, ' ')
        .split(t.notMoney)
        .join(' ');
      expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
    }
  });

  it('name no other product: the wheel, its symbols and its bonus are its own', () => {
    for (const lang of ['en', 'ja'] as const) {
      const all = everyString(getStrings(lang))
        .map(({ text }) => text)
        .join(' ');
      expect(all).not.toMatch(/Interblock|Aruze|Universal|Evolution|Dream ?Catcher|Crazy Time|Monopoly|Wheel of Fortune|Super Spin|Sega|セガ|Konami|コナミ|Bandai|バンダイ|Namco|ナムコ|Taito|タイトー|Magician/i);
    }
  });
});

describe('the Odds tab', () => {
  it('shows the exact return of every number, the lamps, the ×40’s amounts and the comparison with a casino’s wheel', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="bw-rtp">90%<');
    expect(markup).toContain('9/10 of every medal, exactly');
    expect(markup.match(/<tr data-spot="/g)).toHaveLength(SPOTS.length);
    for (const spot of SPOTS) expect(markup).toContain(`data-testid="bw-return-${spot}">9/10<`);
    expect(markup.match(/<tr data-lamp="/g)).toHaveLength(3);
    expect(markup.match(/<tr data-pays="/g)).toHaveLength(5);
    expect(markup).toContain('data-testid="bw-bonus-chance">2/27<');
    expect(markup).toContain('data-testid="bw-top-chance">1/10,800<');
    // ×2: on 20 of the 54 segments, 10/27 to stop on, 2/5 to win a spin.
    expect(markup).toContain('10/27');
    expect(markup).toContain('2/5');
    expect(markup).toContain('43/16');
    expect(markup).toContain('75.9% to 88.9%');
    const ja = render(<OddsTab />, 'ja');
    expect(ja).toContain('使ったメダルのちょうど9/10');
  });
});
