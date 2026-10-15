import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { Craps } from '@/components/game/Craps';
import { DiceTray, DieFace } from '@/components/game/Craps/Dice';
import { OddsTab } from '@/components/game/Craps/OddsTab';
import { PlayTab } from '@/components/game/Craps/PlayTab';
import { SimTab } from '@/components/game/Craps/SimTab';
import { BET_IDS } from '@/components/game/Craps/engine';
import { NOT_MONEY_EN, NOT_MONEY_JA, getStrings } from '@/components/game/Craps/i18n';
import { BET_SIZES } from '@/components/game/Craps/medalTable';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('DieFace / DiceTray', () => {
  it('draws the right number of pips', () => {
    for (let v = 1; v <= 6; v++) {
      const markup = renderToStaticMarkup(<DieFace value={v} />);
      expect(markup.match(/<circle/g)).toHaveLength(v);
    }
  });

  it('renders two dice resting in the tray with all six faces available', () => {
    const markup = render(<DiceTray dice={null} rollId={0} label="table" />);
    expect(markup.match(/data-die="\d"/g)).toHaveLength(2);
    expect(markup.match(/data-value="\d"/g)).toHaveLength(12);
    expect(markup).toContain('data-rolling="false"');
    expect(markup).toContain('aria-label="table"');
  });
});

describe('PlayTab', () => {
  it('waits for the player’s medals, with the puck OFF and every bet on the layout', () => {
    const markup = render(<PlayTab />);
    // Nothing is known of the medals on the server: the counter holds its place, and nothing can be bet yet.
    expect(markup).toMatch(/data-testid="craps-counter" data-loaded="false"/);
    expect(markup).toContain('data-testid="craps-medals">—<');
    expect(markup).toContain('data-testid="craps-on-table">0<');
    expect(markup).toContain('>YOUR MEDALS<');
    expect([...markup.matchAll(/data-bet="([a-zA-Z0-9]+)"/g)].map((m) => m[1]).sort()).toEqual([...BET_IDS].sort());
    expect(markup.match(/<button[^>]*data-bet="[a-zA-Z0-9]+"[^>]*>/g)?.every((tag) => tag.includes('disabled=""'))).toBe(true);
    expect(markup).toContain('>OFF<');
    expect(markup).not.toContain('data-testid="craps-puck"');
    expect(markup).toContain('>ROLL<');
    expect(markup).toContain('>SIX<');
    expect(markup).toContain('>NINE<');
    expect(markup).toContain('aria-label="Place 6 (7:6), in 6s"');
    expect(markup).toContain('aria-label="Place 5 (7:5), in 5s"');
    expect(markup).toContain('aria-label="Hard 8 (9:1)"');
    // The BET buttons are medals, from one medal up; there are no chips, and the table has no reset of its own.
    expect([...markup.matchAll(/aria-label="BET (\d+) medals?"/g)].map((m) => Number(m[1]))).toEqual([...BET_SIZES]);
    expect(markup).not.toMatch(/>Reset</);
    expect(markup).not.toMatch(/Chip|Bankroll/);
    // The note that medals are not money, by the counter, and the way to the Medal Game Center.
    expect(markup).toContain(NOT_MONEY_EN);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('カムアウト');
    expect(markup).toContain('aria-label="パスライン（1:1）"');
    expect(markup).toContain('aria-label="プレイス 6（7:6）・6枚単位"');
    expect(markup).toContain('aria-label="1枚ベット"');
    expect(markup).toContain(NOT_MONEY_JA);
  });
});

/** What a player reads: the text of the page and its labels, and every other string the game shows. */
function readable(lang: 'en' | 'ja'): string {
  const markup = render(<Craps />, lang);
  const labels = [...markup.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1]);
  const t = getStrings(lang);
  const said = [
    ...t.infoBody,
    ...t.hint,
    ...(['comeOutOnly', 'needsPoint', 'needsLineBet', 'oddsLimit', 'spotLimit', 'step', 'noMedals', 'notHere', 'notKept', 'nothing'] as const).map((e) => t.tableError(e, 50)),
    t.stepped('Place 6', 6),
    t.upTo('Place 6', 48),
    t.betAria('Place 6', '7:6', 12, 6),
    t.wonMedals(10),
    t.refill(100),
    t.sayRefill(100),
    t.sayReset,
    t.cardAway,
    t.playHere,
    t.noticeTitle,
    t.noticeBody,
    t.noticeLink,
    t.centerNote,
    t.yourMedals,
    t.net,
    t.onTable,
    t.wholeIntro,
    t.wholeNote,
    t.simOwnMedals,
  ];
  return [markup.replace(/<[^>]+>/g, ' '), ...labels, ...said].join('\n');
}

describe('nothing a player reads could be taken for money', () => {
  it('says medals in English, and never bank, cash, money, balance or credits, but in the note that medals are not money', () => {
    const text = readable('en').split(NOT_MONEY_EN).join(' ');
    expect(text).not.toMatch(/\b(bank|bankroll|deposit|withdraw|cash|money|dollars?|balance|credits?|paid|payout)\b|\$/i);
    expect(text).toMatch(/medals/);
  });

  it('says メダル in Japanese, and never 預け, 引き出し, 残高, お金, 円 or 換金, but in the note that medals are not money', () => {
    const text = readable('ja').split(NOT_MONEY_JA).join(' ');
    expect(text).not.toMatch(/預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|所持金|持ち金|賭け金/);
    expect(text).toContain('持ちメダル');
  });
});

describe('OddsTab', () => {
  it('shows the exact edges, the Pass derivation and the shooter numbers', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="edge-pass">1.414%<');
    expect(markup).toContain('data-testid="edge-passOdds">0.000%<');
    expect(markup).toContain('data-testid="edge-any7">16.667%<');
    expect(markup).toContain('data-testid="pass-win">244/495 = 49.293%<');
    expect(markup).toContain('data-testid="expected-rolls">8.53<');
    expect(markup).toContain('1,671/196');
    expect(markup).toMatch(/about 1 in 5,590,26\d,\d{3}\./);
    // Sorted from the fairest bet to the worst.
    const order = [...markup.matchAll(/<tr data-bet="(\w+)"/g)].map((m) => m[1]);
    expect(order.slice(0, 2).sort()).toEqual(['dontPassOdds', 'passOdds']);
    expect(order[order.length - 1]).toBe('any7');
  });

  it('lists every bet that pays a fraction, and the medals it takes at a time so that it pays whole medals', () => {
    const markup = render(<OddsTab />);
    const rows = [...markup.matchAll(/<tr data-whole="([\w-]+)"><td>[^<]*<\/td><td>([\d:]+)<\/td><td[^>]*>(\d+)s<\/td>/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
    expect(rows).toEqual([
      'place-4 9:5 5',
      'place-5 7:5 5',
      'place-6 7:6 6',
      'passOdds-4 2:1 1',
      'passOdds-5 3:2 2',
      'passOdds-6 6:5 5',
      'dontPassOdds-4 1:2 2',
      'dontPassOdds-5 2:3 3',
      'dontPassOdds-6 5:6 6',
    ]);
    expect(markup).toContain('every edge on this page is exactly the edge on the table');
  });
});

describe('Craps shell', () => {
  it('keeps every tab panel mounted and hides the inactive ones', () => {
    const markup = render(<Craps />, 'ja');
    const panels = [...markup.matchAll(/<div role="tabpanel" id="craps-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['play', false],
      ['odds', true],
      ['sim', true],
    ]);
    expect(markup).toContain('>シミュレーション<');
    expect(markup).toContain('クラップス');
    expect(markup).toContain('>正確な確率<');
  });

  it('stands on the floor of the Medal Game Center, with a way back to it', () => {
    const markup = render(<Craps />);
    const link = markup.match(/<a[^>]*data-testid="craps-center"[^>]*>/)?.[0] ?? '';
    expect(link).toContain(`href="${MEDAL_CENTER_PATH}"`);
    expect(markup).toContain('Medal Game Center');
  });
});

describe('SimTab', () => {
  it('plays with medals of its own, and says so', () => {
    const markup = render(<SimTab />);
    expect(markup).toContain('your medals are not touched');
    expect(markup).toContain('Starting medals');
  });
});
