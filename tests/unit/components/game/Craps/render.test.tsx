import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { Craps } from '@/components/game/Craps';
import { DiceTray, DieFace } from '@/components/game/Craps/Dice';
import { OddsTab } from '@/components/game/Craps/OddsTab';
import { INITIAL_BANKROLL, PlayTab } from '@/components/game/Craps/PlayTab';
import { BET_IDS } from '@/components/game/Craps/engine';
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
  it('starts coming out with a full bankroll, the puck OFF and every bet on the layout', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain(`data-testid="craps-bankroll">${INITIAL_BANKROLL}<`);
    expect(markup).toContain('data-testid="craps-on-table">0<');
    expect([...markup.matchAll(/data-bet="([a-zA-Z0-9]+)"/g)].map((m) => m[1]).sort()).toEqual([...BET_IDS].sort());
    expect(markup).toContain('>OFF<');
    expect(markup).not.toContain('data-testid="craps-puck"');
    expect(markup).toContain('>ROLL<');
    expect(markup).toContain('>SIX<');
    expect(markup).toContain('>NINE<');
    expect(markup).toContain('aria-label="Place 6 (7:6)"');
    expect(markup).toContain('aria-label="Hard 8 (9:1)"');
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('所持金');
    expect(markup).toContain('カムアウト');
    expect(markup).toContain('aria-label="パスライン（1:1）"');
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
});

describe('Craps shell', () => {
  it('keeps both tab panels mounted and hides the inactive one', () => {
    const markup = render(<Craps />, 'ja');
    const panels = [...markup.matchAll(/<div role="tabpanel" id="craps-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['play', false],
      ['odds', true],
    ]);
    expect(markup).toContain('クラップス');
    expect(markup).toContain('>正確な確率<');
  });
});
