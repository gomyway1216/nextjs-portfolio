import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { REELS, analyzeMachine } from '@/components/game/SlotMachine/engine';
import { getStrings, type SlotStrings } from '@/components/game/SlotMachine/i18n';
import { OddsTab } from '@/components/game/SlotMachine/OddsTab';
import { BET_PLACES, MEDAL_PLACES, PlayTab, WIN_PLACES } from '@/components/game/SlotMachine/PlayTab';
import { Reels } from '@/components/game/SlotMachine/Reels';
import { SimTab } from '@/components/game/SlotMachine/SimTab';
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
  it('starts with its LED counter dark until the medals are read, medals to bet 1–3, and the paytable, on a non-winning line', () => {
    const markup = render(<PlayTab />);
    // On the server nothing is known of the player's medals: the counter is dark and nothing can be bet yet.
    expect(markup).toContain('data-testid="slot-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>SPIN</);
    // Seven-segment displays for the medals, the bet and the win, every segment there and none lit but the bet's 1.
    expect(markup.match(/data-on="/g)).toHaveLength((MEDAL_PLACES + BET_PLACES + WIN_PLACES) * 7);
    expect(markup.match(/data-on="true"/g)).toHaveLength(2 + 6);
    expect(markup.match(/role="radio"/g)).toHaveLength(3);
    expect(markup).toContain('aria-checked="true" aria-label="BET 1 medal"');
    expect(markup).toContain('aria-label="BET 3 medals"');
    expect(markup).toContain('aria-label="Pull the lever to spin"');
    expect(markup).toContain('95.26%');
    // The note that medals are not money is by the counter, with the way to the medal center.
    expect(markup).toContain(getStrings('en').notMoney);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // No reset and no refill of its own: both are the medal center's.
    expect(markup).not.toContain('>Reset<');
    expect(markup).not.toContain('slot-refill');
    expect(markup).not.toContain('slot-card-away');
    // Initial resting stops show plum / BAR / plum — not a win.
    expect([REELS[0][4].symbol, REELS[1][8].symbol, REELS[2][2].symbol]).toEqual(['plum', 'bar', 'plum']);
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('aria-label="1枚ベット"');
    expect(markup).toContain('レバーを引いて回す');
    expect(markup).toContain('配当表');
    expect(markup).toContain(getStrings('ja').notMoney);
  });
});

/** Every string a player can be shown, with sample numbers in the ones that take them. */
function everyString(t: SlotStrings): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (Array.isArray(value)) value.forEach((item, i) => add(`${key}.${i}`, item));
    else if (typeof value === 'function') add(key, value.length === 0 ? value() : value.length === 1 ? value(3) : value(3, 'x'));
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) add(`${key}.${name}`, item);
  };
  for (const [key, value] of Object.entries(t)) add(key, key === 'reelsResult' ? value(['7', '7', '7']) : key === 'infoBody' ? value('95.26%') : value);
  return out;
}

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player is shown reads as money, except the note
  // that says the medals are not money.
  const EN_MONEY = /\b(bank|banks|deposit|withdraw|cash|money|dollars?|balance|credits?|wager(ed|s)?|bankroll|paid out|pay ?out|payout)\b|\$/i;
  const JA_MONEY = /預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|クレジット|賭け金|払い戻し|持ち金|払い出し|収支|賭け|儲け|稼/;

  it('never reads as money in English or Japanese, but for the note that says the medals are not money', () => {
    for (const [lang, money] of [
      ['en', EN_MONEY],
      ['ja', JA_MONEY],
    ] as const) {
      const t = getStrings(lang);
      for (const { key, text } of everyString(t)) {
        if (text === t.notMoney) continue;
        expect(text, `${lang} ${key}`).not.toMatch(money);
      }
      // The note is in the help too, in the player's language.
      expect(t.infoBody('95.26%')).toContain(t.notMoney);
    }
    // The medal center's own note, word for word, in each language.
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
  });

  it('shows no money words anywhere on the page, in either language', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      const text = [render(<SlotMachine />, lang), render(<SimTab />, lang)]
        .join(' ')
        .replace(/<[^>]*>/g, ' ')
        .split(t.notMoney)
        .join(' ');
      expect(text).not.toMatch(lang === 'en' ? EN_MONEY : JA_MONEY);
    }
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
    // Hit frequency reads the same in the tile and the table footer.
    expect(markup).toContain('1 in 5.03');
    expect(markup).toContain('>5.03<');
    // Per-row values are percentage points of RTP (they sum to the RTP), so the column says so.
    expect(markup).toContain('>Contribution to RTP<');
    expect(markup).not.toContain('Share of RTP');
  });

  it('draws all 3 × 22 virtual-reel stops with their weights', () => {
    const markup = render(<OddsTab />);
    expect(markup.match(/title="\d+ of 64 virtual stops"/g)).toHaveLength(66);
    expect(markup.match(/title="6 of 64 virtual stops"/g)?.length).toBeGreaterThanOrEqual(6);
  });
});

describe('SlotMachine', () => {
  it('keeps every tab panel mounted and hides the inactive ones (a rolling spin survives a tab switch)', () => {
    const markup = render(<SlotMachine />);
    const panels = [...markup.matchAll(/<div role="tabpanel" id="slot-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['play', false],
      ['odds', true],
      ['sim', true],
    ]);
  });

  it('renders the tabs and quotes the computed RTP in the help text', () => {
    const markup = render(<SlotMachine />, 'ja');
    expect(markup).toContain('スロットマシン');
    expect(markup).toContain('>遊ぶ<');
    expect(markup).toContain('>正確な確率<');
    expect(markup).toContain('>シミュレーション<');
    const rtp = `${(ODDS.rtp * 100).toFixed(2)}%`;
    expect(getStrings('en').infoBody(rtp).join(' ')).toContain(`gives back ${rtp} of the medals bet`);
    expect(getStrings('ja').infoBody(rtp).join(' ')).toContain(`ベットしたメダルの ${rtp} を返します`);
  });

  it('links to the medal center above its title, and draws the one-time note with its gate, which hides it before the first paint where it was read', () => {
    const markup = render(<SlotMachine />);
    expect(markup).toMatch(new RegExp(`<a[^>]*href="${MEDAL_CENTER_PATH}"[^>]*data-testid="slot-center"`));
    expect(markup).toContain('Medal Game Center');
    // The note is in the server's drawing, so the machine never moves for it (MedalCenter/onceNote.tsx).
    expect(markup).toMatch(/<script>[^<]*slot-machine-medals-notice[^<]*<\/script><section[^>]*data-testid="slot-notice"[^>]*data-once-note="slot-machine"/);
  });

  it('simulates sessions in medals, starting from the medal center’s free cupful, with the machine’s own bets', () => {
    const markup = render(<SimTab />);
    expect(markup).toContain('Starting medals');
    expect(markup).toMatch(/<input[^>]*value="100"/);
    // The bets a session can make (the other select is the number of spins, which runs to millions).
    expect([...markup.matchAll(/<option value="(\d)"[^>]*>\d<\/option>/g)].map((m) => Number(m[1]))).toEqual([1, 2, 3]);
  });
});
