import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { Blackjack } from '@/components/game/Blackjack';
import { HoleCard, PlayingCard } from '@/components/game/Blackjack/Cards';
import { getStrings } from '@/components/game/Blackjack/i18n';
import { MEDAL_PLACES } from '@/components/game/Blackjack/MedalCounter';
import { DEFAULT_BET } from '@/components/game/Blackjack/medalTable';
import { OddsTab } from '@/components/game/Blackjack/OddsTab';
import { PlayTab } from '@/components/game/Blackjack/PlayTab';
import { SimTab } from '@/components/game/Blackjack/SimTab';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

/** What a page shows as text: its markup with the tags taken out. */
const textOf = (markup: string) => markup.replace(/<[^>]*>/g, ' ');

describe('cards', () => {
  it('labels face-up cards and hides the hole card', () => {
    expect(renderToStaticMarkup(<PlayingCard card={{ rank: 'T', suit: '♦' }} />)).toContain('aria-label="10♦"');
    const hole = renderToStaticMarkup(<HoleCard label="Dealer" />);
    expect(hole).toContain('data-hole="true"');
    expect(hole).not.toContain('data-rank');
  });
});

describe('PlayTab', () => {
  it('opens with the medal counter waiting for the player’s medals, a bet of 2 and the felt printed with the rules', () => {
    const markup = render(<PlayTab />);
    // As the server sends it: the player's medals are not known yet, so no digit is lit and nothing can be bet.
    expect(markup).toContain('data-testid="bj-counter" data-loaded="false"');
    expect(markup).toContain('YOUR MEDALS');
    expect(markup).toContain('Finding your medals…');
    expect(markup.match(/data-on="true"/g)).toBeNull();
    // Seven digits for the medals, two for the bet and three for the win, every one dark.
    expect(markup.match(/<polygon[^>]*data-on="false"/g)?.length).toBe((MEDAL_PLACES + 2 + 3) * 7);
    expect(markup).toContain(`data-testid="bj-bet">${DEFAULT_BET}<`);
    expect(markup).toContain('>1 BET<');
    expect(markup).toContain('>MAX BET<');
    expect(markup).toMatch(/disabled=""[^>]*>DEAL</);
    expect(markup).toContain('1 to 10 medals a hand.');
    expect(markup).toContain('BLACKJACK PAYS 3 TO 2');
    // No round yet: every action is disabled.
    for (const a of ['hit', 'stand', 'double', 'split']) expect(markup).toMatch(new RegExp(`data-action="${a}"[^>]*disabled=""`));
    expect(markup).toContain('A fresh six-deck shoe is shuffled on the first deal.');
    expect(markup).toContain('Count cards (Hi-Lo)');
    expect(markup).not.toContain('data-testid="bj-count"');
    // That medals are not money, by the counter; and the way to the medal center.
    expect(markup).toContain(`data-testid="bj-not-money">${NOT_MONEY.en}<`);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // Nothing of the chips the table had before.
    expect(markup).not.toContain('1000');
    expect(markup).not.toMatch(/bankroll|chip/i);
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>ディール<');
    expect(markup).toContain('>ヒット<');
    expect(markup).toContain('>1枚ベット<');
    expect(markup).toContain('ブラックジャックは3対2');
    expect(markup).toContain(`data-testid="bj-not-money">${NOT_MONEY.ja}<`);
    expect(markup).not.toContain('BLACKJACK PAYS');
    expect(markup).not.toContain('所持金');
  });
});

describe('the words: nothing a player sees could be taken for money', () => {
  // Every string of the game, every function of one called, as a player could see it.
  const everything = (lang: 'en' | 'ja'): string => {
    const out: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') out.push(value);
      else if (typeof value === 'function') out.push(String((value as (...args: unknown[]) => unknown)(3, 4, '4½', false, false)));
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(getStrings(lang));
    // The medal center's own words, in the help too.
    expect(getStrings(lang).infoBody).toContain(NOT_MONEY[lang]);
    out.push(textOf(render(<Blackjack />, lang)));
    // The one note that says what medals are not is the only place those words may stand.
    return out.join('\n').split(getStrings(lang).notMoney).join(' ');
  };

  it('in English', () => {
    const text = everything('en');
    expect(text).not.toMatch(/\b(bank|bankroll|deposits?|withdraw\w*|cash\w*|money|dollars?|balance|credits?)\b|\$/i);
    expect(text).not.toMatch(/\bpa(y|ys|id) (in|out)\b|\bpayout\b/i);
    expect(text).not.toMatch(/\bcents?\b/i);
  });

  it('in Japanese', () => {
    const text = everything('ja');
    expect(text).not.toMatch(/預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|所持金|賭け金|銭/);
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

  it('states the exact edge of every bet in medals, with a blackjack’s half medal rounded down on an odd one', () => {
    const markup = render(<OddsTab />);
    expect(markup.match(/<tr data-bet="/g)).toHaveLength(10);
    for (const even of [2, 4, 6, 8, 10]) expect(markup).toContain(`data-testid="medal-edge-${even}">0.512%<`);
    expect(markup).toContain('data-testid="medal-edge-1">2.767%<');
    expect(markup).toContain('data-testid="medal-edge-3">1.263%<');
    expect(markup).toContain('data-testid="medal-edge-5">0.963%<');
    expect(markup).toContain('data-testid="medal-edge-7">0.834%<');
    expect(markup).toContain('data-testid="medal-edge-9">0.762%<');
    // What a blackjack wins on 3 medals: 4.
    expect(markup).toMatch(/<tr data-bet="3"><td>3 medals<\/td><td[^>]*>4 medals<\/td>/);
    expect(markup).toContain('times 4.51%, the chance of a blackjack the dealer does not match.');
  });

  it('is localized', () => {
    const markup = render(<OddsTab />, 'ja');
    expect(markup).toContain('ベーシックストラテジーを導く');
    expect(markup).toContain('ルールでエッジはどう動くか');
    expect(markup).toContain('メダルでのベット');
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
    // The table stands in the medal center: a way back to its front at the top.
    expect(markup.match(/<a[^>]*data-testid="bj-center"[^>]*>/)?.[0]).toContain(`href="${MEDAL_CENTER_PATH}"`);
  });
});
