import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { SicBo } from '@/components/game/SicBo';
import { BET_IDS, MOST_BACK_PER_MEDAL, betInfo } from '@/components/game/SicBo/engine';
import { getStrings, type SicBoStrings } from '@/components/game/SicBo/i18n';
import { placeOf, sectionOf } from '@/components/game/SicBo/Layout';
import { SPOT_MAX } from '@/components/game/SicBo/medalTable';
import { OddsTab, ROWS } from '@/components/game/SicBo/OddsTab';
import { BET_PLACES, MEDAL_PLACES, PlayTab, WIN_PLACES } from '@/components/game/SicBo/PlayTab';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the table', () => {
  it('starts with its counters dark until the medals are read, all 50 areas, and SHAKE not yet pressable', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="sb-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="sb-shake"[^>]*disabled=""[^>]*>SHAKE</);
    // Skip is there from the start, so that nothing moves when a roll begins; it does nothing until one has.
    expect(markup).toMatch(/<button[^>]*data-testid="sb-skip"[^>]*disabled=""/);
    for (const id of BET_IDS) expect(markup).toContain(`data-testid="sb-area-${id}"`);
    expect(markup.match(/data-testid="sb-area-/g)).toHaveLength(50);
    // The counters' LED windows: seven segments a digit.
    expect(markup.match(/<polygon/g)).toHaveLength((MEDAL_PLACES + BET_PLACES + WIN_PLACES) * 7);
    // The dome: three dice of six faces each, on the felt under the glass.
    expect(markup).toContain('data-testid="sb-dome"');
    expect(markup.match(/data-face="[1-6]"><svg/g)).toHaveLength(18);
    expect(markup).toContain('aria-label="The dice dome: the dice show 1 · 2 · 3"');
    // The phone's picker: five parts of the cloth, the first chosen; and the bet sizes.
    expect(markup.match(/data-testid="sb-section-(?!note)/g)).toHaveLength(5);
    expect(markup).toMatch(/aria-checked="true"[^>]*aria-label="Small and Big"/);
    expect(markup).toContain('aria-label="1 medal a tap"');
    // The board of results holds its twenty places from the start, so that nothing moves as it fills.
    expect(markup.match(/data-kind="none"/g)).toHaveLength(20);
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    expect(markup).not.toContain('sb-refill');
    expect(markup).not.toContain('sb-card-away');
  });

  it('is in Japanese too', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>シェイク<');
    expect(markup).toContain('aria-label="1タップ1枚"');
    expect(markup).toContain('レイアウトにメダルを置く');
    expect(markup).toContain('aria-label="小（1:1）：0枚"');
    expect(markup).toContain(NOT_MONEY.ja);
  });

  it('lays out the whole cloth on a desk without two areas on one place, and every area in a part of it on a phone', () => {
    const cells = new Map<string, BetId>();
    type BetId = (typeof BET_IDS)[number];
    for (const id of BET_IDS) {
      const { col, span, row, rows } = placeOf(id);
      expect(col + span - 1, id).toBeLessThanOrEqual(210);
      for (let r = row; r < row + rows; r++)
        for (let c = col; c < col + span; c++) {
          const key = `${r}:${c}`;
          expect(cells.get(key), `${id} and ${cells.get(key)} at ${key}`).toBeUndefined();
          cells.set(key, id);
        }
    }
    // The cloth is full: six rows of 210 columns.
    expect(cells.size).toBe(6 * 210);
    const parts = new Map<string, number>();
    for (const id of BET_IDS) parts.set(sectionOf(id), (parts.get(sectionOf(id)) ?? 0) + 1);
    expect(Object.fromEntries(parts)).toEqual({ bigSmall: 3, triples: 12, totals: 14, pairs: 15, singles: 6 });
  });
});

describe('the page', () => {
  it('has the table and its Odds tab, the floor jackpot over it, and the way back to the medal center', () => {
    const markup = render(<SicBo />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('Moonlit');
    expect(markup).toContain('id="sb-tab-table"');
    expect(markup).toContain('id="sb-tab-odds"');
    expect(markup).toMatch(/id="sb-panel-odds"[^>]*hidden=""/);
    expect(markup).toContain('data-testid="sb-center"');
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
    expect(render(<SicBo />, 'ja')).toContain('シックボー');
  });

  it('stands open on the medal center’s floor, is a game of the site, and is linked to the floor jackpot', () => {
    expect(FLOOR.find(({ id }) => id === 'sic-bo')?.path).toBe('/games/sic-bo');
    expect(FLOOR_GAMES).toContain('sic-bo');
    expect(games.find(({ id }) => id === 'sic-bo')).toMatchObject({ path: '/games/sic-bo', category: 'Arcade', title: 'Moonlit Sic Bo' });
    expect(linked('sic-bo')).toBe(true);
    const hub = render(<MedalCenter />);
    expect(hub).toMatch(/<li[^>]*data-open="true" data-machine="sic-bo"/);
    const play = hub.match(/<a[^>]*data-testid="center-play-sic-bo"[^>]*>/)?.[0] ?? '';
    expect(play).toContain('href="/games/sic-bo"');
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/en/common.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(path.join(process.cwd(), 'src/locales/ja/common.json'), 'utf8'));
    expect(en.games['sic-bo'].title).toBe(getStrings('en').title);
    expect(ja.games['sic-bo'].title).toBe(getStrings('ja').title);
  });
});

/** Every string a player can be shown, with sample values in the ones that take them. */
function everyString(t: SicBoStrings): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const infos = BET_IDS.map(betInfo);
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  for (const [key, value] of Object.entries(t)) {
    if (typeof value !== 'function') add(key, value);
  }
  for (const info of infos) {
    add('areaName', t.areaName(info));
    add('areaAria', t.areaAria(info, '6:1', 3));
  }
  for (const kind of ['small', 'big', 'triple'] as const) {
    add('banner', t.banner([2, 2, 2], 6, kind));
    add('resultWin', t.resultWin([1, 2, 3], 6, kind, 1234));
    add('resultLose', t.resultLose([1, 2, 3], 6, kind));
    add('boardEntry', t.boardEntry([1, 2, 3], 6, kind));
  }
  add('fns', [
    t.domeLabel(t.domeIdle([1, 2, 3])),
    t.sectionMedals(4),
    t.stepAria(5),
    t.status.ready(7),
    t.spotFull(99),
    t.refill(100),
    t.boardCounts(1, 2, 3),
    t.faceCount(4, 9),
    t.lastWon(12),
    t.sayShake(5),
    t.sayRefill(100),
    t.bestNote(35, 36),
    t.groups.total(4, 17),
    t.singleNote(75, 15, 1),
    t.checkResult('100,000'),
    t.checkTriples('2,800', '2,777.8'),
    t.rowName('x'),
    ...t.infoBody(MOST_BACK_PER_MEDAL * SPOT_MAX),
  ]);
  return out;
}

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player is shown reads as money, except the note
  // that says the medals are not money.
  const EN_MONEY = /\b(bank|banks|banked|deposit|withdraw|cash|money|dollars?|balance|credits?|wager(ed|s)?|bankroll|paid out|pay ?out|payout|coins?)\b|\$/i;
  const JA_MONEY = /預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|クレジット|賭け金|払い戻し|持ち金|払い出し|収支|賭け|儲け|稼|賞金|配当/;

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
      expect(t.infoBody(MOST_BACK_PER_MEDAL * SPOT_MAX)).toContain(t.notMoney);
    }
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('show no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      const text = render(<SicBo />, lang)
        .replace(/<[^>]*>/g, ' ')
        .split(t.notMoney)
        .join(' ');
      expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
    }
  });

  it('name no product or maker: the table, its dome and its theme are its own', () => {
    for (const lang of ['en', 'ja'] as const) {
      const all = everyString(getStrings(lang))
        .map(({ text }) => text)
        .join(' ');
      expect(all).not.toMatch(/Huxley|TCS|Blaze|Paltronics|Interblock|Aruze|Novomatic|LT Game|Double Dragon|Sega|セガ|Konami|コナミ|Bandai|バンダイ|Namco|ナムコ|Taito|タイトー|PARADiCE|パラダイス/i);
    }
  });
});

describe('the Odds tab', () => {
  it('shows the exact return of every kind of area, from the Atlantic City paytable, with its source', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="sb-best">97.22%<');
    expect(markup.match(/<tr data-row="/g)).toHaveLength(ROWS.length);
    expect(markup).toMatch(/data-testid="sb-return-small-big"><span[^>]*>35\/36</);
    expect(markup).toMatch(/data-testid="sb-return-total-4"><span[^>]*>61\/72</);
    expect(markup).toMatch(/data-testid="sb-return-triple"><span[^>]*>181\/216</);
    expect(markup).toMatch(/data-testid="sb-return-double"><span[^>]*>22\/27</);
    expect(markup).toMatch(/data-testid="sb-return-single"><span[^>]*>199\/216</);
    expect(markup).toContain('href="https://wizardofodds.com/games/sic-bo/"');
    expect(markup).toContain('Atlantic City');
    const ja = render(<OddsTab />, 'ja');
    expect(ja).toContain('アトランティックシティ');
  });
});
