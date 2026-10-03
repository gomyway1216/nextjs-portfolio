import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { VideoPoker } from '@/components/game/VideoPoker';
import { MiniCard, PlayingCard } from '@/components/game/VideoPoker/Cards';
import { OddsTab } from '@/components/game/VideoPoker/OddsTab';
import { EMPTY_STATS, INITIAL_CREDITS, PlayTab, effectivePays, judgePlay } from '@/components/game/VideoPoker/PlayTab';
import { SimTab } from '@/components/game/VideoPoker/SimTab';
import { analyzeHand } from '@/components/game/VideoPoker/analysis';
import { PAY_TABLES } from '@/components/game/VideoPoker/engine';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('cards', () => {
  it('labels a card and marks red suits', () => {
    // 8 + 13 = ten of hearts.
    const markup = renderToStaticMarkup(<PlayingCard card={21} />);
    expect(markup).toContain('aria-label="10♥"');
    expect(markup).toContain('data-card="21"');
    expect(renderToStaticMarkup(<MiniCard card={21} />)).toContain('data-red="true"');
    expect(renderToStaticMarkup(<MiniCard card={0} />)).not.toContain('data-red');
  });
});

describe('PlayTab', () => {
  it('opens on five face-down cards with the 9/6 pay table and a five-coin bet', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain(`data-testid="vp-credits">${INITIAL_CREDITS.toLocaleString('en-US')}<`);
    expect(markup).toContain('data-testid="vp-bet">5<');
    expect(markup.match(/aria-label="Face-down card"/g)).toHaveLength(10); // 5 slots + 5 card backs
    expect(markup).not.toContain('data-card=');
    // Royal row: 250 per coin, 4,000 at five coins; full house 9, flush 6.
    expect(markup).toMatch(/data-hand="royalFlush"><th[^>]*>Royal Flush<\/th><td[^>]*>250<\/td><td[^>]*>500<\/td><td[^>]*>750<\/td><td[^>]*>1,000<\/td><td[^>]*>4,000<\/td>/);
    expect(markup).toMatch(/data-hand="fullHouse"><th[^>]*>Full House<\/th><td[^>]*>9</);
    expect(markup).toMatch(/data-hand="flush"><th[^>]*>Flush<\/th><td[^>]*>6</);
    expect(markup).toContain('>DEAL<');
    expect(markup).toContain('Press DEAL to start.');
    expect(markup).toContain('9/6 · 99.54%');
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('クレジット');
    expect(markup).toContain('>ディール<');
    expect(markup).toContain('ロイヤルフラッシュ');
  });

  it('names the bet each pay column is for, and the current one, for screen readers', () => {
    const markup = render(<PlayTab />);
    expect(markup).toMatch(/<caption[^>]*>Pay table<\/caption>/);
    expect(markup).toMatch(/<th scope="col"><span[^>]*>1 coin<\/span><\/th>/);
    expect(markup).toMatch(/<th scope="col"><span[^>]*>4 coins<\/span><\/th>/);
    expect(markup).toMatch(/<th scope="col" aria-current="true"><span[^>]*>5 coins \(current bet\)<\/span><\/th>/);
    expect(render(<PlayTab />, 'ja')).toContain('5コイン（現在のベット）');
  });

  it('judges a finished hold against the best play under the rules it was dealt with', () => {
    // A♠ K♠ Q♠ J♠ + 9♠: a made flush, but the best play breaks it for four to a royal.
    const hand = [12, 11, 10, 9, 7];
    const pays = effectivePays(PAY_TABLES['9/6'], 5);
    const values = analyzeHand(hand, pays);
    expect(values[0].mask).toBe(0b01111);
    const kept = judgePlay(EMPTY_STATS, { hand, mask: 0b01111, pays, coins: 5 });
    expect(kept).toMatchObject({ judged: 1, best: 1, givenUp: 0 });
    // Keeping the flush gives up the difference, in coins.
    const flush = values.find((h) => h.mask === 0b11111)!;
    const both = judgePlay(kept, { hand, mask: 0b11111, pays, coins: 5 });
    expect(both.judged).toBe(2);
    expect(both.best).toBe(1);
    expect(both.givenUp).toBeCloseTo((values[0].ev - flush.ev) * 5, 9);
    expect(both.givenUp).toBeCloseTo((18.4255 - 6) * 5, 2);
    // At one coin the royal pays 250, and the same hand is worth less: the snapshot matters.
    expect(analyzeHand(hand, effectivePays(PAY_TABLES['9/6'], 1))[0].ev).toBeLessThan(values[0].ev);
    // Hands and money are counted at the draw, not here.
    expect(both).toMatchObject({ hands: 0, wagered: 0, paid: 0 });
  });

  it('pays the short royal below five coins', () => {
    expect(effectivePays(PAY_TABLES['9/6'], 5)[9]).toBe(800);
    expect(effectivePays(PAY_TABLES['9/6'], 4)[9]).toBe(250);
    expect(effectivePays(PAY_TABLES['9/6'], 4)[6]).toBe(9);
  });
});

describe('OddsTab', () => {
  it('shows the exact payback, hand frequencies and every pay table', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="vp-payback">99.5439%<');
    expect(markup).toContain('data-testid="vp-edge">0.4561%<');
    expect(markup).toContain('data-testid="vp-short">98.37%<');
    expect(markup).toContain('data-testid="one-in-royalFlush">40,390.55<');
    expect(markup).toContain('data-testid="one-in-fourOfAKind">423.27<');
    expect(markup).toContain('data-testid="payback-8/5">97.2984%<');
    expect(markup).toContain('data-testid="payback-6/5">94.9961%<');
    expect(markup).toContain('134,459');
    // The close calls need the lookup tables, which are built after mount.
    expect(markup).toContain('Calculating every draw…');
  });

  it('is localized', () => {
    const markup = render(<OddsTab />, 'ja');
    expect(markup).toContain('完璧にプレイしたときの還元率');
    expect(markup).toContain('迷いやすい手');
  });
});

describe('SimTab', () => {
  it('describes the three strategies with their exact paybacks to come, and offers both simulations', () => {
    const markup = render(<SimTab />);
    expect(markup).toContain('Perfect play against two habits, on the same deals');
    expect(markup).toContain('One evening at the machine');
    expect(markup).toContain('Common-sense rules');
    expect(markup.match(/>Run</g)).toHaveLength(2);
    expect(markup).not.toContain('data-testid="vp-sim-strategies"');
  });

  it('is localized', () => {
    const markup = render(<SimTab />, 'ja');
    expect(markup).toContain('マシンで過ごす一晩');
    expect(markup).toContain('>実行<');
  });
});

describe('VideoPoker shell', () => {
  it('keeps every tab panel mounted and hides the inactive ones', () => {
    const markup = render(<VideoPoker />, 'ja');
    const panels = [...markup.matchAll(/<div role="tabpanel" id="vp-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['play', false],
      ['odds', true],
      ['sim', true],
    ]);
    expect(markup).toContain('ビデオポーカー');
  });
});
