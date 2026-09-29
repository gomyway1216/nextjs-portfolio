import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { Blackjack } from '@/components/game/Blackjack';
import { HoleCard, PlayingCard } from '@/components/game/Blackjack/Cards';
import { OddsTab } from '@/components/game/Blackjack/OddsTab';
import { DEFAULT_BET, INITIAL_BANKROLL, PlayTab } from '@/components/game/Blackjack/PlayTab';
import { SimTab } from '@/components/game/Blackjack/SimTab';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('cards', () => {
  it('labels face-up cards and hides the hole card', () => {
    expect(renderToStaticMarkup(<PlayingCard card={{ rank: 'T', suit: '♦' }} />)).toContain('aria-label="10♦"');
    const hole = renderToStaticMarkup(<HoleCard label="Dealer" />);
    expect(hole).toContain('data-hole="true"');
    expect(hole).not.toContain('data-rank');
  });
});

describe('PlayTab', () => {
  it('opens with a full bankroll, a default bet and the felt printed with the rules', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain(`data-testid="bj-bankroll">${INITIAL_BANKROLL}<`);
    expect(markup).toContain(`data-testid="bj-bet">${DEFAULT_BET}<`);
    expect(markup).toContain('BLACKJACK PAYS 3 TO 2');
    expect(markup).toContain('>DEAL<');
    // No round yet: every action is disabled.
    for (const a of ['hit', 'stand', 'double', 'split']) expect(markup).toMatch(new RegExp(`data-action="${a}"[^>]*disabled=""`));
    expect(markup).toContain('A fresh six-deck shoe is shuffled on the first deal.');
    expect(markup).toContain('Count cards (Hi-Lo)');
    expect(markup).not.toContain('data-testid="bj-count"');
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('所持金');
    expect(markup).toContain('>ディール<');
    expect(markup).toContain('>ヒット<');
    expect(markup).toContain('ブラックジャックは3対2');
    expect(markup).not.toContain('BLACKJACK PAYS');
  });
});

describe('OddsTab', () => {
  it('shows the exact house edge, dealer outcomes, the derived chart and the rule effects', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="bj-house-edge">0.512%<');
    expect(markup).toContain('data-testid="bj-insurance-edge">7.69%<');
    expect(markup).toContain('data-testid="bust-6">42.3%<');
    expect(markup).toContain('data-testid="bust-11">11.5%<');
    expect(markup).toContain('data-testid="rule-sixFive">1.865%<');
    expect(markup).toContain('data-testid="rule-h17">0.731%<');
    // 16 hard rows + 8 soft rows + 10 pair rows, 10 up cards each.
    expect(markup.match(/data-cell="/g)).toHaveLength(340);
    expect(markup.match(/<sup aria-hidden="true">\*<\/sup>/g)).toHaveLength(2);
    expect(markup).toContain('data-cell="hard-16-10"');
    // 16 vs 10 is picked by default: hit, by a hair.
    expect(markup).toMatch(/Hit beats Stand by 0\.000\d per unit bet\./);
  });

  it('is localized', () => {
    const markup = render(<OddsTab />, 'ja');
    expect(markup).toContain('ベーシックストラテジーを導く');
    expect(markup).toContain('ルールでエッジはどう動くか');
  });
});

describe('SimTab and shell', () => {
  it('offers the strategy simulation', () => {
    const markup = render(<SimTab />);
    expect(markup).toContain('Three ways to play, same shoes');
    expect(markup).toContain('Counting cards');
    expect(markup.match(/>Run</g)).toHaveLength(2);
  });

  it('keeps every tab panel mounted and hides the inactive ones', () => {
    const markup = render(<Blackjack />, 'ja');
    const panels = [...markup.matchAll(/<div role="tabpanel" id="bj-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['play', false],
      ['odds', true],
      ['sim', true],
    ]);
    expect(markup).toContain('ブラックジャック');
  });
});
