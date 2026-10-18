import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { BET_PLACES, Cabinet, MEDAL_PLACES, WIN_PLACES } from '@/components/game/Fishing/Cabinet';
import { FISH } from '@/components/game/Fishing/engine';
import { Fishing } from '@/components/game/Fishing';
import { getStrings, type FishingStrings } from '@/components/game/Fishing/i18n';
import { OddsTab } from '@/components/game/Fishing/OddsTab';
import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the cabinet', () => {
  it('starts with its counters dark until the medals are read, a bet of 1, 3 or 5, and CAST not yet pressable', () => {
    const markup = render(<Cabinet />);
    // On the server nothing is known of the player's medals: the counter is dark and nothing can be cast yet.
    expect(markup).toContain('data-testid="fishing-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="fishing-cast"[^>]*disabled=""[^>]*>CAST</);
    // Skip is there from the start, so that nothing moves when a cast begins; it does nothing until one has.
    expect(markup).toMatch(/<button[^>]*data-testid="fishing-skip"[^>]*disabled=""/);
    expect(markup.match(/data-on="/g)).toHaveLength((MEDAL_PLACES + BET_PLACES + WIN_PLACES) * 7);
    expect(markup.match(/role="radio"/g)).toHaveLength(3);
    expect(markup).toContain('aria-checked="true" aria-label="1 medal a cast"');
    expect(markup).toContain('aria-label="5 medals a cast"');
    expect(markup).toContain('data-testid="fishing-cabinet" data-ready="false" data-casting="false" data-step="idle"');
    // The fish board lists every fish, the lord first.
    expect(markup.match(/<tr data-fish="/g)).toHaveLength(FISH.length);
    expect(markup.indexOf('data-fish="lord"')).toBeLessThan(markup.indexOf('data-fish="fry"'));
    expect(markup).toContain('Moonscale, the Harbor Lord');
    // The note that medals are not money is under the machine, with the way to the medal center.
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    expect(markup).toContain('Reeling only hurries the show');
    // No reset and no refill of its own until there are no medals: both are the medal center's.
    expect(markup).not.toContain('fishing-refill');
    expect(markup).not.toContain('fishing-card-away');
  });

  it('is in Japanese too', () => {
    const markup = render(<Cabinet />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('aria-label="1投1枚"');
    expect(markup).toContain('>キャスト<');
    expect(markup).toContain('魚図鑑');
    expect(markup).toContain('港のヌシ ツキウロコ');
    expect(markup).toContain(NOT_MONEY.ja);
  });
});

describe('the page', () => {
  it('has the machine and its Odds tab, the floor jackpot over it, and the way back to the medal center', () => {
    const markup = render(<Fishing />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('Big Catch Harbor');
    expect(markup).toContain('id="fishing-tab-machine"');
    expect(markup).toContain('id="fishing-tab-odds"');
    expect(markup).toMatch(/id="fishing-panel-odds"[^>]*hidden=""/);
    expect(markup).toContain('data-testid="fishing-center"');
    expect(render(<Fishing />, 'ja')).toContain('大漁ハーバー');
  });

  it('stands open on the medal center’s floor, is a game of the site, and is linked to the floor jackpot', () => {
    expect(FLOOR.find(({ id }) => id === 'fishing')?.path).toBe('/games/fishing');
    expect(FLOOR_GAMES).toContain('fishing');
    expect(games.find(({ id }) => id === 'fishing')).toMatchObject({ path: '/games/fishing', category: 'Arcade', title: 'Big Catch Harbor' });
    expect(linked('fishing')).toBe(true);
    const hub = render(<MedalCenter />);
    expect(hub).toMatch(/<li[^>]*data-open="true" data-machine="fishing"/);
    const play = hub.match(/<a[^>]*data-testid="center-play-fishing"[^>]*>/)?.[0] ?? '';
    expect(play).toContain('href="/games/fishing"');
    // Its name, in both languages, from the site's own words.
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/en/common.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/ja/common.json'), 'utf8'));
    expect(en.games.fishing.title).toBe(getStrings('en').title);
    expect(ja.games.fishing.title).toBe(getStrings('ja').title);
  });
});

/** Every string a player can be shown, with sample numbers in the ones that take them. */
function everyString(t: FishingStrings): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (typeof value === 'function') add(key, value.length === 0 ? value() : value.length === 1 ? value(3) : value.length === 2 ? value(3, 15) : value.length === 3 ? value('x', 3, 15) : value('1', '2', '3', '4'));
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  for (const [key, value] of Object.entries(t)) add(key, key === 'infoBody' ? value(1500) : value);
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
      expect(t.infoBody(1500)).toContain(t.notMoney);
    }
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('show no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      const text = render(<Fishing />, lang)
        .replace(/<[^>]*>/g, ' ')
        .split(t.notMoney)
        .join(' ');
      expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
    }
  });

  it('name no other product: the machine, its fish and its lord are its own', () => {
    for (const lang of ['en', 'ja'] as const) {
      const all = everyString(getStrings(lang))
        .map(({ text }) => text)
        .join(' ');
      expect(all).not.toMatch(/釣りスピリッツ|Tsuri|Spirits|Ace Angler|バンダイ|Bandai|Namco|ナムコ|SEGA|セガ|コナミ|Konami|カプコン|Capcom/i);
    }
  });
});

describe('the Odds tab', () => {
  it('shows the exact return, every fish’s figures and the chest’s prizes', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="fishing-rtp">90%<');
    expect(markup).toContain('9/10 of every medal cast, exactly, at every bet');
    expect(markup.match(/<tr data-fish="/g)).toHaveLength(FISH.length);
    expect(markup.match(/<tr data-prize="/g)).toHaveLength(4);
    // The fry: 2,100 of 10,000 cells, landed 19 times in 20, 399 casts in 2,000.
    expect(markup).toContain('21/100');
    expect(markup).toContain('19/20');
    expect(markup).toContain('399/2,000');
    // The lord: once in 8,000 casts.
    expect(markup).toContain('1/8,000');
    expect(markup).toContain('data-testid="fishing-share-total">0.9000<');
    expect(markup).toContain('15,267/40,000');
    const ja = render(<OddsTab />, 'ja');
    expect(ja).toContain('使ったメダルのちょうど9/10');
  });
});
