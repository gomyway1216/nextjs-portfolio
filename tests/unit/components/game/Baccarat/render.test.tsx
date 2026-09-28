import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { Baccarat } from '@/components/game/Baccarat';
import { PlayingCard } from '@/components/game/Baccarat/Cards';
import { OddsTab } from '@/components/game/Baccarat/OddsTab';
import { INITIAL_BANKROLL, PlayTab, revealSchedule } from '@/components/game/Baccarat/PlayTab';
import { BeadPlate, BigRoad } from '@/components/game/Baccarat/Roads';
import type { RoadEntry } from '@/components/game/Baccarat/engine';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('cards and scoreboards', () => {
  it('labels a card by rank and suit, writing tens as 10', () => {
    const markup = renderToStaticMarkup(<PlayingCard card={{ rank: 'T', suit: '♥' }} sideways />);
    expect(markup).toContain('aria-label="10♥"');
    expect(markup).toContain('data-rank="T"');
  });

  it('draws one bead per hand and one big-road cell per non-tie hand', () => {
    const entries: RoadEntry[] = ['banker', 'banker', 'tie', 'player', 'banker'].map((winner) => ({
      winner: winner as RoadEntry['winner'],
      playerPair: false,
      bankerPair: winner === 'player',
      natural: false,
    }));
    const bead = renderToStaticMarkup(<BeadPlate entries={entries} name="Bead" ariaLabel="bead" letters={{ banker: 'B', player: 'P', tie: 'T' }} />);
    expect(bead.match(/data-cell="/g)).toHaveLength(5);
    expect(bead).toContain('data-cell="tie" data-col="0" data-row="2"');
    const big = renderToStaticMarkup(<BigRoad entries={entries} name="Big" ariaLabel="big" />);
    expect(big.match(/data-cell="/g)).toHaveLength(4);
    expect(big).toContain('data-cell="banker" data-col="0" data-row="1" data-ties="1"');
    expect(big).toContain('data-cell="banker" data-col="2" data-row="0"');
  });
});

describe('PlayTab', () => {
  it('opens with a full bankroll, the commission layout and fresh-shoe odds', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain(`data-testid="baccarat-bankroll">${INITIAL_BANKROLL}<`);
    expect(markup).toContain('data-testid="baccarat-on-table">0<');
    expect([...markup.matchAll(/data-bet="(\w+)"/g)].map((m) => m[1]).sort()).toEqual(
      ['banker', 'bankerPair', 'player', 'playerPair', 'tie'],
    );
    expect(markup).toContain('aria-label="Banker (0.95:1)"');
    expect(markup).toContain('aria-label="Tie (8:1)"');
    expect(markup).toContain('>DEAL<');
    expect(markup).toContain('A fresh eight-deck shoe is shuffled on the first deal.');
    // Live odds for the first hand = the eight-deck edges.
    expect(markup).toMatch(/data-live="banker"><td>Banker<\/td><td[^>]*>45\.860%<\/td><td[^>]*>1\.058%</);
    expect(markup).toMatch(/data-live="tie"><td>Tie<\/td><td[^>]*>9\.516%<\/td><td[^>]*>14\.360%</);
    expect(markup).not.toContain('data-positive');
    expect(markup).toContain('Computed from the 416 cards');
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('所持金');
    expect(markup).toContain('>ディール<');
    expect(markup).toContain('aria-label="バンカー（0.95:1）"');
    expect(markup).toContain('ビーズプレート');
  });

  it('paces the deal with a beat before third cards', () => {
    expect(revealSchedule(4).reveal).toEqual([0, 340, 680, 1020]);
    const six = revealSchedule(6);
    expect(six.reveal[4] - six.reveal[3]).toBeGreaterThan(340);
    expect(six.settle).toBeGreaterThan(six.reveal[5]);
  });
});

describe('OddsTab', () => {
  it('shows the exact eight-deck odds, sorted from the cheapest bet', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="p-banker">45.8597%<');
    expect(markup).toContain('data-testid="p-player">44.6247%<');
    expect(markup).toContain('data-testid="p-tie">9.5156%<');
    expect(markup).toContain('data-testid="total-ways">4,998,398,275,503,360<');
    expect(markup).toContain('data-testid="edge-banker">1.058%<');
    expect(markup).toContain('data-testid="edge-bankerEz">1.018%<');
    expect(markup).toContain('data-testid="edge-tie">14.360%<');
    expect(markup).toContain('data-testid="cards-per-hand">4.939<');
    expect(markup).toContain('31/415');
    const order = [...markup.matchAll(/<tr data-bet="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['bankerEz', 'banker', 'player', 'tie9', 'dragon7', 'panda8', 'pair', 'tie']);
    // The tableau: 8 banker totals × (stood + 10 third cards).
    expect(markup.match(/data-draw="/g)).toHaveLength(88);
  });

  it('is localized', () => {
    const markup = render(<OddsTab />, 'ja');
    expect(markup).toContain('ドローのルール');
    expect(markup).toContain('8デッキ');
  });
});

describe('Baccarat shell', () => {
  it('keeps every tab panel mounted and hides the inactive ones', () => {
    const markup = render(<Baccarat />, 'ja');
    const panels = [...markup.matchAll(/<div role="tabpanel" id="baccarat-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['play', false],
      ['odds', true],
    ]);
    expect(markup).toContain('バカラ');
  });
});
