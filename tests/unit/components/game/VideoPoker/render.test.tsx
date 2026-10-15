import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { VideoPoker } from '@/components/game/VideoPoker';
import { MiniCard, PlayingCard } from '@/components/game/VideoPoker/Cards';
import { OddsTab } from '@/components/game/VideoPoker/OddsTab';
import { EMPTY_STATS, MEDAL_PLACES, PlayTab, effectivePays, judgePlay } from '@/components/game/VideoPoker/PlayTab';
import { SimTab } from '@/components/game/VideoPoker/SimTab';
import { analyzeHand } from '@/components/game/VideoPoker/analysis';
import { NetHistogram, histogramBins } from '@/components/game/VideoPoker/charts';
import { PAY_TABLES } from '@/components/game/VideoPoker/engine';
import { getStrings } from '@/components/game/VideoPoker/i18n';
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
  it('opens on five face-down cards with the 9/6 pay table and a five-medal bet, and no medals shown until they are found', () => {
    const markup = render(<PlayTab />);
    // The medals are the medal center's: on the server, and until they have been read, nothing is shown and nothing can be bet.
    expect(markup).toContain('data-testid="vp-medals" data-loaded="false">—<');
    expect(markup).not.toContain('vp-credits');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>DEAL</);
    expect(markup).toContain('Looking for your medals…');
    expect(markup).toContain('data-testid="vp-bet">5<');
    // The medal counter is LED digits, every one dark until the medals are read.
    const counter = markup.match(/data-testid="vp-medal-counter"[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(counter.match(/<polygon[^>]*data-on="false"/g)?.length).toBe(MEDAL_PLACES * 7);
    expect(counter).not.toContain('data-on="true"');
    // What the medals are, by the counter.
    expect(markup).toContain('data-testid="vp-not-money">Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.<');
    // There is no reset on the machine: the one reset is at the medal center.
    expect(markup).not.toContain('>Reset<');
    expect(markup.match(/aria-label="Face-down card"/g)).toHaveLength(10); // 5 slots + 5 card backs
    expect(markup).not.toContain('data-card=');
    // Royal row: 250 per coin, 4,000 at five coins; full house 9, flush 6.
    expect(markup).toMatch(/data-hand="royalFlush"><th[^>]*>Royal Flush<\/th><td[^>]*>250<\/td><td[^>]*>500<\/td><td[^>]*>750<\/td><td[^>]*>1,000<\/td><td[^>]*>4,000<\/td>/);
    expect(markup).toMatch(/data-hand="fullHouse"><th[^>]*>Full House<\/th><td[^>]*>9</);
    expect(markup).toMatch(/data-hand="flush"><th[^>]*>Flush<\/th><td[^>]*>6</);
    expect(markup).toContain('>DEAL<');
    expect(markup).toContain('9/6 · 99.54%');
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('>メダル<');
    expect(markup).not.toContain('クレジット');
    expect(markup).toContain('>ディール<');
    expect(markup).toContain('ロイヤルフラッシュ');
    expect(markup).toContain('メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。');
  });

  it('names the bet each pay column is for, and the current one, for screen readers', () => {
    const markup = render(<PlayTab />);
    expect(markup).toMatch(/<caption[^>]*>Pay table<\/caption>/);
    expect(markup).toMatch(/<th scope="col"><span[^>]*>1 medal<\/span><\/th>/);
    expect(markup).toMatch(/<th scope="col"><span[^>]*>4 medals<\/span><\/th>/);
    expect(markup).toMatch(/<th scope="col" aria-current="true"><span[^>]*>5 medals \(current bet\)<\/span><\/th>/);
    expect(render(<PlayTab />, 'ja')).toContain('5枚（現在のベット）');
  });

  it('judges a finished hold against the best play under the rules it was dealt with', () => {
    // A♠ K♠ Q♠ J♠ + 9♠: a made flush, but the best play breaks it for four to a royal.
    const hand = [12, 11, 10, 9, 7];
    const pays = effectivePays(PAY_TABLES['9/6'], 5);
    const values = analyzeHand(hand, pays);
    expect(values[0].mask).toBe(0b01111);
    const kept = judgePlay(EMPTY_STATS, { hand, mask: 0b01111, pays, coins: 5 });
    expect(kept).toMatchObject({ judged: 1, best: 1, givenUp: 0 });
    // Keeping the flush gives up the difference, in medals.
    const flush = values.find((h) => h.mask === 0b11111)!;
    const both = judgePlay(kept, { hand, mask: 0b11111, pays, coins: 5 });
    expect(both.judged).toBe(2);
    expect(both.best).toBe(1);
    expect(both.givenUp).toBeCloseTo((values[0].ev - flush.ev) * 5, 9);
    expect(both.givenUp).toBeCloseTo((18.4255 - 6) * 5, 2);
    // At one coin the royal pays 250, and the same hand is worth less: the snapshot matters.
    expect(analyzeHand(hand, effectivePays(PAY_TABLES['9/6'], 1))[0].ev).toBeLessThan(values[0].ev);
    // Hands and medals are counted at the draw, not here.
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

describe('NetHistogram', () => {
  const values = [-100, -100, -50, 0, 40, 1200];
  const table = {
    caption: 'Sessions by result. Expected −10.',
    rangeHeader: 'Net coins',
    countHeader: 'Sessions',
    range: (from: number, to: number) => `${from} to ${to}`,
    over: 'Above +100',
    count: (n: number) => String(n),
  };

  it('puts every value in one bar and knows the whole coins each bar covers', () => {
    const { min, counts, rows, over } = histogramBins(values, 100, -10, 4);
    expect(min).toBe(-100);
    expect(counts).toEqual([2, 1, 2, 0, 1]);
    expect(rows).toEqual([
      { from: -100, to: -51, count: 2 },
      { from: -50, to: -1, count: 1 },
      { from: 0, to: 49, count: 2 },
    ]);
    expect(over).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(values.length);
  });

  it('covers every whole coin up to the cap exactly once, whatever the bar width', () => {
    // 30 bars over a range that does not divide evenly.
    const { rows, over } = histogramBins(Array.from({ length: 1778 }, (_, i) => i - 777), 1000, -4.6, 30);
    expect(rows).toHaveLength(30);
    expect(rows[0].from).toBe(-777);
    expect(rows[29].to).toBe(1000);
    for (let i = 1; i < rows.length; i++) expect(rows[i].from).toBe(rows[i - 1].to + 1);
    for (const r of rows) expect(r.count).toBe(r.to - r.from + 1);
    expect(over).toBe(0);
  });

  it('gives screen readers the bars as a table, with the expectation in the caption', () => {
    const markup = renderToStaticMarkup(<NetHistogram values={values} cap={100} marker={-10} xLabel="Net coins" table={table} bins={4} />);
    expect(markup).toContain('<caption>Sessions by result. Expected −10.</caption>');
    expect(markup).toContain('<th scope="col">Net coins</th><th scope="col">Sessions</th>');
    expect(markup).toContain('<tr><th scope="row">-100 to -51</th><td>2</td></tr>');
    expect(markup).toContain('<tr><th scope="row">0 to 49</th><td>2</td></tr>');
    expect(markup).toContain('<tr><th scope="row">Above +100</th><td>1</td></tr>');
    // Empty bars are left out of the table.
    expect(markup.match(/<th scope="row">/g)).toHaveLength(4);
    expect(markup).toContain('role="img" aria-label="Net coins"');
  });

  it('draws nothing without data', () => {
    expect(renderToStaticMarkup(<NetHistogram values={[]} cap={100} marker={0} xLabel="x" table={table} />)).toBe('');
  });
});

describe('SimTab', () => {
  it('describes the three strategies with their exact paybacks to come, and offers both simulations', () => {
    const markup = render(<SimTab />);
    expect(markup).toContain('Perfect play against two habits, on the same deals');
    expect(markup).toContain('One evening at the machine');
    expect(markup).toContain('Common-sense rules');
    expect(markup.match(/>Run</g)).toHaveLength(2);
    // The comparison is per medal at a five-medal bet (royal 800), not one-medal play.
    expect(markup).toContain('betting five medals a hand');
    expect(markup).toContain('a royal flush counts as 800 per medal');
    expect(markup).not.toContain('one medal a hand');
    expect(markup).not.toContain('data-testid="vp-sim-strategies"');
  });

  it('is localized', () => {
    const markup = render(<SimTab />, 'ja');
    expect(markup).toContain('マシンで過ごす一晩');
    expect(markup).toContain('>実行<');
    expect(markup).toContain('1ハンド5枚ベットしたときの還元率');
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

  it('stands on the medal center’s floor, with the way back to its front', () => {
    const markup = render(<VideoPoker />);
    expect(markup).toMatch(/<a[^>]*href="\/games\/medal-center"[^>]*data-testid="vp-center"/);
    expect(markup).toContain('Medal Game Center');
    // The notice that the machine plays with the medals now is the browser's to show, once: not on the server.
    expect(markup).not.toContain('vp-notice');
  });
});

describe('the words', () => {
  /** Every string a player can be shown, both languages, with the function ones called. */
  const shown = (lang: 'en' | 'ja'): string[] => {
    const out: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') out.push(value);
      else if (typeof value === 'function') {
        const fn = value as (...args: unknown[]) => unknown;
        for (const args of [[1, true, '1'], [5, false, '5'], ['A', 2, '2,000'], ['10', '20']]) walk(fn(...args));
      } else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(getStrings(lang));
    return out;
  };
  // The note on what medals are is the one place that names money, to say that they are not.
  const NOTE = { en: getStrings('en').notMoney, ja: getStrings('ja').notMoney };

  it('says nothing that could be taken for real money, in English', () => {
    const words = /\b(bank|banked|deposit|withdraw|cash|money|dollars?|balance|credits?|pay ?in|pay ?out|payback|paid back)\b|\$/i;
    expect(shown('en').length).toBeGreaterThan(150);
    expect('Credits').toMatch(words);
    for (const text of shown('en')) expect(text.replaceAll(NOTE.en, ''), text).not.toMatch(words);
  });

  it('says nothing that could be taken for real money, in Japanese', () => {
    const words = /預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|クレジット|コイン/;
    expect(shown('ja').length).toBeGreaterThan(150);
    for (const text of shown('ja')) expect(text.replaceAll(NOTE.ja, ''), text).not.toMatch(words);
  });
});
