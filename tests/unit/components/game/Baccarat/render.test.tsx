import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { Baccarat } from '@/components/game/Baccarat';
import { PlayingCard } from '@/components/game/Baccarat/Cards';
import { OddsTab } from '@/components/game/Baccarat/OddsTab';
import { BET_STEPS } from '@/components/game/Baccarat/medals';
import { MEDAL_PLACES } from '@/components/game/Baccarat/MedalCounter';
import { PlayTab, revealSchedule } from '@/components/game/Baccarat/PlayTab';
import { BeadPlate, BigRoad } from '@/components/game/Baccarat/Roads';
import { SimTab } from '@/components/game/Baccarat/SimTab';
import type { RoadEntry } from '@/components/game/Baccarat/engine';
import { FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { getStrings } from '@/components/game/Baccarat/i18n';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

/** The words of the keys line the markup shows, its parts' tags taken out. */
const keysLine = (markup: string, testId: string) => markup.match(new RegExp(`data-testid="${testId}">(.*?)</p>`))?.[1].replace(/<[^>]+>/g, '');

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
  it('opens at the no-commission table with the medal counter dark until the player’s medals are read, and fresh-shoe odds', () => {
    const markup = render(<PlayTab />);
    // The server knows nothing of the player's medals: the counter's windows are dark and nothing can be bet yet.
    expect(markup).toContain('data-testid="baccarat-counter" data-loaded="false"');
    expect(markup).toContain('data-testid="baccarat-medals">Looking for your medals…<');
    expect(markup).not.toMatch(/data-testid="baccarat-medals" data-medals=/);
    expect(markup).toContain('data-testid="baccarat-on-table" data-medals="0">0 on the table<');
    expect(markup.match(/<polygon[^>]*data-on="true"/g)).toBeNull();
    expect(markup.match(/<polygon[^>]*data-on="false"/g)?.length).toBeGreaterThanOrEqual(MEDAL_PLACES * 7);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>DEAL<\/button>/);
    expect([...markup.matchAll(/data-bet="(\w+)"/g)].map((m) => m[1]).sort()).toEqual(
      ['banker', 'bankerPair', 'dragon7', 'panda8', 'player', 'playerPair', 'tie'],
    );
    expect(markup).toContain('aria-label="Banker (1:1 · 3-card 7 pushes)"');
    expect(markup).toContain('aria-label="Tie (8:1)"');
    expect(markup).toContain('aria-label="Dragon 7 (40:1)"');
    // BET buttons of medals, the first one chosen.
    expect([...markup.matchAll(/data-step="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([...BET_STEPS]);
    expect(markup).toMatch(/aria-checked="true" aria-label="Bet 1 medal a press"/);
    expect(markup).toContain('A fresh eight-deck shoe is shuffled on the first deal.');
    // Live odds for the first hand = the eight-deck edges, at the EZ table.
    expect(markup).toMatch(/data-live="banker"><td>Banker<\/td><td[^>]*>43\.606%<\/td><td[^>]*>1\.018%</);
    expect(markup).toMatch(/data-live="tie"><td>Tie<\/td><td[^>]*>9\.516%<\/td><td[^>]*>14\.360%</);
    expect(markup).not.toContain('data-positive');
    expect(markup).toContain('Computed from the 416 cards');
  });

  it('says near the counter that medals are not money, and where they come from, with no reset of its own', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain(
      'data-testid="baccarat-not-money">Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.<',
    );
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}" data-testid="baccarat-center-note-link">Medal Game Center<`);
    expect(markup).not.toMatch(/>Reset</);
    // The words are the Medal Game Center's own, shared by every game on the floor.
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('is localized, in the words of a medal machine', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>ディール<');
    expect(markup).toContain('aria-label="バンカー（1:1・3枚の7は引き分け）"');
    expect(markup).toContain('aria-label="1回1枚ベット"');
    expect(markup).toContain('ビーズプレート');
    expect(markup).toContain('メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。');
    expect(markup).not.toContain('所持金');
  });

  it('names its keys for a desk, in both languages', () => {
    expect(keysLine(render(<PlayTab />), 'baccarat-keys')).toBe('Keys: Space or Enter deals · P Player · B Banker · T Tie · R rebet · U undo');
    expect(keysLine(render(<PlayTab />, 'ja'), 'baccarat-keys')).toBe('キー：Space か Enter でディール・P でプレイヤー・B でバンカー・T でタイ・R で同じベット・U で取り消し');
  });

  it('writes nothing a player sees that could be taken for real money, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const markup = render(<Baccarat />, lang);
      // The one sentence that says medals are not money names money in order to say so; nothing else may.
      const text = markup
        .replace(/<[^>]+>/g, ' ')
        .replace('Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.', '')
        .replace('メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。', '');
      expect(text, lang).not.toMatch(/bankroll|\bbank\b|deposit|withdraw|cash|money|dollar|balance|credit|\$|預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|所持金|収支|チップ/i);
      const attributes = [...markup.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(' ');
      expect(attributes, lang).not.toMatch(/bankroll|\bbank\b|money|balance|credit|chip|所持金|チップ/i);
    }
  });

  it('paces the deal with a beat before third cards', () => {
    expect(revealSchedule(4).reveal).toEqual([0, 340, 680, 1020]);
    const six = revealSchedule(6);
    expect(six.reveal[4] - six.reveal[3]).toBeGreaterThan(340);
    expect(six.settle).toBeGreaterThan(six.reveal[5]);
    // The result is called only once the last card is face up and its total is showing (0.46 s + 0.18 s).
    expect(six.settle - six.reveal[5]).toBeGreaterThanOrEqual(640);
    expect(revealSchedule(4).settle - 1020).toBeGreaterThanOrEqual(640);
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

describe('SimTab', () => {
  it('offers the three simulations, each with its own run button', () => {
    const markup = render(<SimTab />);
    expect(markup).toContain('Every bet on the same cards');
    expect(markup).toContain('Chasing the road');
    expect(markup).toContain('Counting cards');
    expect(markup.match(/>Run</g)).toHaveLength(3);
    // No results until a simulation has run.
    expect(markup).not.toContain('data-testid="baccarat-sim-lines"');
  });

  it('is localized', () => {
    const markup = render(<SimTab />, 'ja');
    expect(markup).toContain('罫線を追いかける');
    expect(markup).toContain('カードカウンティング');
  });
});

describe('Baccarat shell', () => {
  it('links back to the Medal Game Center, and keeps every tab panel mounted and hides the inactive ones', () => {
    const markup = render(<Baccarat />, 'ja');
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}" data-testid="baccarat-center"`);
    expect(markup).toContain('メダルゲームセンター');
    const panels = [...markup.matchAll(/<div role="tabpanel" id="baccarat-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['play', false],
      ['odds', true],
      ['sim', true],
    ]);
    expect(markup).toContain('バカラ');
    expect(markup).toContain('>シミュレーション<');
  });
});

describe('on the medal floor', () => {
  it('is OPEN at the Medal Game Center, with a Play link to the table', () => {
    const html = render(<MedalCenter signInHref="/signin" />);
    expect(FLOOR.find(({ id }) => id === 'baccarat')?.path).toBe('/games/baccarat');
    const play = html.match(/<a[^>]*data-testid="center-play-baccarat"[^>]*>/)?.[0] ?? '';
    expect(play).toContain('href="/games/baccarat"');
    expect(html).toMatch(/<li[^>]*data-open="true" data-machine="baccarat"/);
    expect(html).not.toMatch(/data-open="false" data-machine="baccarat"/);
  });
});
