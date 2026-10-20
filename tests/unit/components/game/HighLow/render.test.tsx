import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { HighLow } from '@/components/game/HighLow';
import { BETS, BET_MOST, RANKS, TOP, payFor } from '@/components/game/HighLow/engine';
import { bestPercent } from '@/components/game/HighLow/HighLow';
import { getStrings, type HighLowStrings } from '@/components/game/HighLow/i18n';
import { OddsTab } from '@/components/game/HighLow/OddsTab';
import { BET_PLACES, LADDER_PLACES, MEDAL_PLACES, PlayTab } from '@/components/game/HighLow/PlayTab';
import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the machine', () => {
  it('starts with its counters dark until the medals are read, the ladder, two cards face down, the bets and START', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="hl-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="hl-start"[^>]*disabled=""[^>]*>START</);
    // Skip is there from the start, so that nothing moves when a card turns; it does nothing until one does.
    expect(markup).toMatch(/<button[^>]*data-testid="hl-skip"[^>]*disabled=""/);
    expect(markup.match(/<polygon/g)).toHaveLength((MEDAL_PLACES + BET_PLACES + LADDER_PLACES) * 7);
    expect(markup.match(/<li[^>]*data-rung="/g)).toHaveLength(TOP);
    expect(markup).toContain('aria-label="Rung 12, the top: 200 medals"');
    expect(markup.match(/role="radio"/g)).toHaveLength(BETS.length);
    expect(markup).toContain('aria-checked="true" aria-label="Bet 5 medals"');
    expect(markup).toContain('data-testid="hl-card" data-card="" data-up="false"');
    expect(markup).toContain('data-testid="hl-next" data-card="" data-up="false"');
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // No refill of its own until there are no medals, and no reset: both are the medal center's.
    expect(markup).not.toContain('hl-refill');
    expect(markup).not.toContain('hl-card-away');
  });

  it('is in Japanese too', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>スタート<');
    expect(markup).toContain('aria-label="5枚ベット"');
    expect(markup).toContain('ベットを選んでスタート！');
    expect(markup).toContain(NOT_MONEY.ja);
  });
});

describe('the page', () => {
  it('has the machine and its Odds tab, the floor jackpot over it, and the way back to the medal center', () => {
    const markup = render(<HighLow />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('High &amp; Low');
    expect(markup).toContain('id="hl-tab-machine"');
    expect(markup).toContain('id="hl-tab-odds"');
    expect(markup).toMatch(/id="hl-panel-odds"[^>]*hidden=""/);
    expect(markup).toContain('data-testid="hl-center"');
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
    expect(render(<HighLow />, 'ja')).toContain('ハイ＆ロー');
  });

  it('stands open on the medal center’s floor, is a game of the site, and is linked to the floor jackpot', () => {
    expect(FLOOR.find(({ id }) => id === 'high-low')?.path).toBe('/games/high-low');
    expect(FLOOR_GAMES).toContain('high-low');
    expect(games.find(({ id }) => id === 'high-low')).toMatchObject({ path: '/games/high-low', category: 'Arcade', title: 'High & Low Ladder' });
    expect(linked('high-low')).toBe(true);
    const hub = render(<MedalCenter />);
    expect(hub).toMatch(/<li[^>]*data-open="true" data-machine="high-low"/);
    const play = hub.match(/<a[^>]*data-testid="center-play-high-low"[^>]*>/)?.[0] ?? '';
    expect(play).toContain('href="/games/high-low"');
    // Its name, in both languages, from the site's own words.
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/en/common.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/ja/common.json'), 'utf8'));
    expect(en.games['high-low'].title).toBe(getStrings('en').title);
    expect(ja.games['high-low'].title).toBe(getStrings('ja').title);
  });
});

/** Every string a player can be shown, with sample numbers (and every rank) in the ones that take them. */
function everyString(t: HighLowStrings, language: 'en' | 'ja'): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (typeof value === 'function') {
      const call = value as (...a: unknown[]) => unknown;
      const ranks = Array.from({ length: RANKS }, (_, rank) => rank);
      const samples: unknown[][] =
        value.length <= 1 ? [...ranks.map((r) => [r]), [1_000], ['3,500'], ['high'], ['low']] : value.length === 2 ? [...ranks.map((r) => [r, true]), ...ranks.map((r) => [r, false]), [3, 12], ['high', 6], ['9', '0.5%']] : [...ranks.map((r) => [3, 12, r]), [TOP, 200, true]];
      for (const args of samples) add(`${key}(${args.join(',')})`, call(...args));
    } else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  for (const [key, value] of Object.entries(t)) add(key, key === 'infoBody' ? t.infoBody(payFor(BET_MOST, TOP), bestPercent(language)) : value);
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
      for (const { key, text } of everyString(t, lang)) {
        if (text === t.notMoney) continue;
        expect(text, `${lang} ${key}`).not.toMatch(money);
      }
      expect(t.infoBody(payFor(BET_MOST, TOP), bestPercent(lang))).toContain(t.notMoney);
    }
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
    // TAKE is TAKE / テイク, never anything a money counter says.
    expect(getStrings('en').take).toBe('TAKE');
    expect(getStrings('ja').take).toBe('テイク');
  });

  it('show no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      const text = render(<HighLow />, lang)
        .replace(/<[^>]*>/g, ' ')
        .split(t.notMoney)
        .join(' ');
      expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
    }
  });

  it('say the ranks as English says them: an 8, an Ace, a 10', () => {
    const t = getStrings('en');
    expect(t.status.lost(6, false)).toBe('It was an 8: wrong this time. The ladder is gone.');
    expect(t.status.lost(12, false)).toBe('It was an Ace: wrong this time. The ladder is gone.');
    expect(t.status.lost(8, true)).toBe('Another 10: a tie loses. The ladder is gone.');
    expect(t.status.first(11)).toBe('Will the next card be higher or lower than the King?');
    expect(t.sayRight(6, 2, 8)).toBe('An 8. Right! Rung 2: 8 medals.');
    expect(t.cardName(12, 0)).toBe('Ace of spades');
    expect(getStrings('ja').cardName(12, 1)).toBe('ハートのA');
  });

  it('name no other product: the machine, its ladder and its cards are its own', () => {
    for (const lang of ['en', 'ja'] as const) {
      const all = everyString(getStrings(lang), lang)
        .map(({ text }) => text)
        .join(' ');
      expect(all).not.toMatch(/Sega|セガ|Sigma|シグマ|Konami|コナミ|Bandai|バンダイ|Namco|ナムコ|Taito|タイトー|Sammy|サミー|Aruze|Card Sharks|Play Your Cards Right|Stake|Playtech|Evolution|COOL ?104/i);
    }
  });
});

describe('the Odds tab', () => {
  it('shows best play’s exact return, the chance of HIGH and LOW from every card, the ladder, the chart and every simple way of playing', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="hl-rtp">89.96%<');
    expect(markup).toContain('data-testid="hl-thumb">89.78%<');
    expect(markup).toContain('data-testid="hl-climb-top">1.05%<');
    // A row a card, 2 to A: from a 2, HIGH wins 12 ranks in 13; from an 8, each side 6; a tie is always 1 in 13.
    expect(markup.match(/<tr data-rank="/g)).toHaveLength(RANKS);
    expect(markup).toMatch(/<tr data-rank="2">.*?12\/13.*?0\/13.*?1\/13/);
    expect(markup).toMatch(/<tr data-rank="8">.*?6\/13.*?6\/13.*?1\/13/);
    expect(markup.match(/<tr data-rung="/g)).toHaveLength(TOP + TOP);
    expect(markup.match(/data-move="take"/g)).toHaveLength(55);
    // Every way of playing: best, the rule of thumb, taking on each rung, climbing to the top.
    expect(markup.match(/<tr data-way="/g)).toHaveLength(2 + TOP);
    expect(markup).toContain('data-testid="hl-way-best">89.965%<');
    expect(markup).toContain('data-testid="hl-way-take-1">85.207%<');
    expect(markup).toContain('data-testid="hl-way-take-12">42.176%<');
    expect(markup.match(/<tr data-ending="/g)).toHaveLength(1 + TOP);
    const ja = render(<OddsTab />, 'ja');
    expect(ja).toContain('最善の遊び方');
    expect(ja).toContain('13分の');
  });
});
