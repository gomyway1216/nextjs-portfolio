import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { REELS, analyzeMachine } from '@/components/game/SlotMachine/engine';
import { getStrings } from '@/components/game/SlotMachine/i18n';
import { OddsTab } from '@/components/game/SlotMachine/OddsTab';
import { INITIAL_CREDITS, PlayTab } from '@/components/game/SlotMachine/PlayTab';
import { Reels } from '@/components/game/SlotMachine/Reels';
import { SlotMachine } from '@/components/game/SlotMachine';
import { createI18nInstance } from '@/lib/i18n';

const ODDS = analyzeMachine();

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('Reels', () => {
  it('renders three 25-cell strips resting on the given stops', () => {
    const markup = render(<Reels stops={[4, 8, 2]} spinId={0} anticipation={false} winningReels={[]} label="reels" />);
    const strips = [...markup.matchAll(/data-reel="(\d)"/g)];
    expect(strips).toHaveLength(3);
    expect(markup.match(/data-symbol=/g)).toHaveLength(75);
    // Stop 4 in the middle row → top row index 3 → −3/25 of the strip.
    expect(markup).toContain('transform:translate3d(0, -12.0000%, 0)');
    expect(markup).toContain('aria-label="reels"');
    expect(markup).toContain('data-spinning="false"');
  });

  it('lights up only the winning reels once settled', () => {
    const markup = render(<Reels stops={[2, 6, 5]} spinId={0} anticipation={false} winningReels={[0, 1]} label="x" />);
    expect(markup.match(/winFrameOn/g)).toHaveLength(2);
  });
});

describe('PlayTab', () => {
  it('starts with a full meter, bet chips and the paytable, on a non-winning line', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain(`data-testid="slot-credits">${INITIAL_CREDITS}<`);
    expect(markup).toContain('>SPIN<');
    expect(markup.match(/role="radio"/g)).toHaveLength(4);
    expect(markup).toContain('aria-checked="true" aria-label="Bet 1 credit"');
    expect(markup).toContain('aria-label="Pull the lever to spin"');
    expect(markup).toContain('95.26%');
    // Initial resting stops show plum / BAR / plum — not a win.
    expect([REELS[0][4].symbol, REELS[1][8].symbol, REELS[2][2].symbol]).toEqual(['plum', 'bar', 'plum']);
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('クレジット');
    expect(markup).toContain('レバーを引いて回す');
    expect(markup).toContain('配当表');
  });
});

describe('OddsTab', () => {
  it('shows the exact RTP as a fraction and every paytable row', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain(`data-testid="slot-rtp">${(ODDS.rtp * 100).toFixed(3)}%<`);
    expect(markup).toContain('249,724 ÷ 262,144');
    expect(markup.match(/data-rule="/g)).toHaveLength(7);
    expect(markup).toContain('1 in 262,144');
    expect(markup).toContain('12× as often as the jackpot');
  });

  it('draws all 3 × 22 virtual-reel stops with their weights', () => {
    const markup = render(<OddsTab />);
    expect(markup.match(/title="\d+ of 64 virtual stops"/g)).toHaveLength(66);
    expect(markup.match(/title="6 of 64 virtual stops"/g)?.length).toBeGreaterThanOrEqual(6);
  });
});

describe('SlotMachine', () => {
  it('renders the tabs and quotes the computed RTP in the help text', () => {
    const markup = render(<SlotMachine />, 'ja');
    expect(markup).toContain('スロットマシン');
    expect(markup).toContain('>遊ぶ<');
    expect(markup).toContain('>正確な確率<');
    expect(markup).toContain('>シミュレーション<');
    const rtp = `${(ODDS.rtp * 100).toFixed(2)}%`;
    expect(getStrings('en').infoBody(rtp).join(' ')).toContain(`returns ${rtp}`);
  });
});
