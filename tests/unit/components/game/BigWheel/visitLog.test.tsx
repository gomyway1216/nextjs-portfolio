import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LAMPS, SPOTS, WHEEL, drawSpin, resultOf, seeded, winOf, type Spin } from '@/components/game/BigWheel/engine';
import { getStrings } from '@/components/game/BigWheel/i18n';
import { betsOf, type PlacedBet } from '@/components/game/BigWheel/medalTable';
import { NumberTally, SpinLog, type LoggedSpin } from '@/components/game/BigWheel/VisitLog';
import { END_CHANCE, emptyTally, expectedDigits, expectedOf, linesOf, tallyWith } from '@/components/game/BigWheel/visitTally';

const BONUS_STOP = WHEEL.indexOf('bonus');
const stopOn = (spot: number): number => WHEEL.indexOf(spot as (typeof SPOTS)[number]);
const logged = (id: string, no: number | null, spin: Spin, bets: PlacedBet[]): LoggedSpin => {
  const result = resultOf(spin);
  return { id, no, spot: result.spot, multiplier: result.multiplier, bonus: result.bonus, bets, wagered: bets.reduce((sum, bet) => sum + bet.amount, 0), won: winOf(betsOf(bets), spin) };
};

describe('a spin’s medals, number by number', () => {
  it('lists all seven numbers in the board’s order, and only the number the spin ended on brings medals back', () => {
    const bets: PlacedBet[] = [
      { spot: 2, amount: 10 },
      { spot: 8, amount: 3 },
    ];
    const lines = linesOf({ spot: 8, multiplier: 1, bets });
    expect(lines.map((line) => line.spot)).toEqual([...SPOTS]);
    expect(lines.find((line) => line.spot === 8)).toEqual({ spot: 8, amount: 3, back: 24, paying: true });
    expect(lines.find((line) => line.spot === 2)).toEqual({ spot: 2, amount: 10, back: 0, paying: false });
    expect(lines.find((line) => line.spot === 40)).toEqual({ spot: 40, amount: 0, back: 0, paying: false });
  });

  it('pays a second chance at the lamp’s multiplier, and adds up to what the machine paid on every drawn spin', () => {
    expect(linesOf({ spot: 5, multiplier: 3, bets: [{ spot: 5, amount: 4 }] }).find((line) => line.paying)?.back).toBe(60);
    const random = seeded(20261110);
    const bets: PlacedBet[] = SPOTS.map((spot, i) => ({ spot, amount: i + 1 }));
    for (let i = 0; i < 2_000; i++) {
      const spin = drawSpin(random);
      const { spot, multiplier } = resultOf(spin);
      const lines = linesOf({ spot, multiplier, bets });
      expect(lines.reduce((sum, line) => sum + line.back, 0)).toBe(winOf(betsOf(bets), spin));
      expect(lines.filter((line) => line.paying)).toHaveLength(1);
    }
  });
});

describe('the visit’s tally', () => {
  it('starts empty and counts each spin once, for the number it ended on, with the medals put on every number', () => {
    const empty = emptyTally();
    expect(empty.spins).toBe(0);
    for (const spot of SPOTS) expect(empty.spots[spot]).toEqual({ cameUp: 0, placed: 0, back: 0 });

    const one = tallyWith(empty, {
      spot: 4,
      multiplier: 1,
      bets: [
        { spot: 4, amount: 5 },
        { spot: 40, amount: 1 },
      ],
    });
    const two = tallyWith(one, { spot: 40, multiplier: 10, bets: [{ spot: 40, amount: 2 }] });
    const three = tallyWith(two, { spot: 2, multiplier: 1, bets: [{ spot: 4, amount: 1 }] });
    expect(three.spins).toBe(3);
    expect(three.spots[4]).toEqual({ cameUp: 1, placed: 6, back: 20 });
    expect(three.spots[40]).toEqual({ cameUp: 1, placed: 3, back: 800 });
    // It came up with nothing on it: counted as having come up, with no medals either way.
    expect(three.spots[2]).toEqual({ cameUp: 1, placed: 0, back: 0 });
    expect(SPOTS.reduce((sum, spot) => sum + three.spots[spot].cameUp, 0)).toBe(three.spins);
    // The tallies before are left as they were.
    expect(empty.spins).toBe(0);
    expect(one.spots[4]).toEqual({ cameUp: 1, placed: 5, back: 20 });
    expect(one.spots[40]).toEqual({ cameUp: 0, placed: 1, back: 0 });
  });

  it('expects each number as often as the wheel’s exact odds say: the chances add up to one spin', () => {
    expect(SPOTS.reduce((sum, spot) => sum + END_CHANCE[spot], 0)).toBeCloseTo(1, 12);
    // ×2: 20 of 54 to stop on, and 4 of 54 times 20 of 50 on a second chance.
    expect(END_CHANCE[2]).toBeCloseTo(20 / 54 + (4 / 54) * (20 / 50), 12);
    expect(END_CHANCE[40]).toBeCloseTo(1 / 54 + (4 / 54) * (1 / 50), 12);
    expect(expectedOf(0, 2)).toBe(0);
    expect(expectedOf(54, 2)).toBeCloseTo(21.6, 9);
  });

  it('matches the machine’s own draws over many spins', () => {
    const random = seeded(7);
    let tally = emptyTally();
    const spins = 40_000;
    for (let i = 0; i < spins; i++) {
      const { spot, multiplier } = resultOf(drawSpin(random));
      tally = tallyWith(tally, { spot, multiplier, bets: [{ spot: 2, amount: 1 }] });
    }
    for (const spot of SPOTS) expect(tally.spots[spot].cameUp / spins).toBeCloseTo(END_CHANCE[spot], 2);
    expect(tally.spots[2].placed).toBe(spins);
    expect(tally.spots[2].back / spins).toBeCloseTo(0.9, 1);
  });

  it('never shows a small expected count as 0.0', () => {
    const small = expectedOf(1, 40);
    expect(small).toBeLessThan(0.1);
    expect(expectedDigits(small)).toBe(2);
    expect(small.toFixed(expectedDigits(small))).toBe('0.02');
    expect(expectedDigits(expectedOf(1, 2))).toBe(1);
    expect(expectedDigits(expectedOf(10, 40))).toBe(1);
    expect(expectedDigits(0)).toBe(1);
  });
});

describe('the spin record beside the machine', () => {
  const plain = logged('b', 2, { stop: stopOn(8), lamp: null, second: null }, [
    { spot: 8, amount: 3 },
    { spot: 2, amount: 10 },
  ]);
  const bonus = logged('c', 3, { stop: BONUS_STOP, lamp: LAMPS.indexOf(3), second: stopOn(5) }, [{ spot: 5, amount: 4 }]);
  const earlier = logged('a', null, { stop: stopOn(2), lamp: null, second: null }, [{ spot: 40, amount: 1 }]);
  const history = [bonus, plain, earlier];
  const en = getStrings('en');
  const fmt = (n: number) => n.toLocaleString('en-US');
  const show = (selectedId: string | null, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<SpinLog t={getStrings(lang)} fmt={fmt} history={history} selectedId={selectedId} onSelect={() => undefined} />);

  it('keeps its place before the first spin', () => {
    const markup = renderToStaticMarkup(<SpinLog t={en} fmt={fmt} history={[]} selectedId={null} onSelect={() => undefined} />);
    expect(markup).toContain(en.historyEmpty);
    expect(markup).toContain(en.detailEmpty);
    expect(markup).toContain('data-testid="bw-spin-detail" data-spin=""');
    expect(markup).not.toContain('data-testid="bw-history');
  });

  it('shows the newest spin while none is picked: a second chance with its lamp, its medals and its net', () => {
    const markup = show(null);
    expect(markup.match(/<li data-bonus="/g)).toHaveLength(3);
    expect(markup).toMatch(/data-testid="bw-history-c"[^>]*aria-pressed="true"[^>]*aria-label="Spin 3: second chance ×3, ×5"/);
    expect(markup).toMatch(/data-testid="bw-history-b"[^>]*aria-pressed="false"[^>]*aria-label="Spin 2: ×8"/);
    expect(markup).toMatch(/data-testid="bw-history-a"[^>]*aria-pressed="false"[^>]*aria-label="Before this visit: ×2"/);
    expect(markup).toContain('data-testid="bw-spin-detail" data-spin="c"');
    expect(markup).toContain('data-testid="bw-detail-title">Spin 3<');
    expect(markup).toContain('data-testid="bw-detail-path">BONUS → lamp ×3 → second chance ×5<');
    expect(markup).toMatch(/data-paying="true" data-testid="bw-detail-bet-5"/);
    expect(markup).toContain('×5: 4 medals, 60 back');
    expect(markup).toContain('×2: no medals');
    expect(markup).toContain('data-testid="bw-detail-played">4<');
    expect(markup).toContain('data-testid="bw-detail-won">60<');
    expect(markup).toContain('data-testid="bw-detail-net">+56<');
  });

  it('shows the spin picked, and the newest again once the one picked is gone', () => {
    const markup = show('b');
    expect(markup).toMatch(/data-testid="bw-history-b"[^>]*aria-pressed="true"/);
    expect(markup).toMatch(/data-testid="bw-history-c"[^>]*aria-pressed="false"/);
    expect(markup).toContain('data-testid="bw-detail-path">Stopped on ×8<');
    expect(markup).toContain('data-testid="bw-detail-played">13<');
    expect(markup).toContain('data-testid="bw-detail-won">24<');
    expect(markup).toContain('data-testid="bw-detail-net">+11<');
    expect(markup.match(/data-testid="bw-detail-bet-/g)).toHaveLength(SPOTS.length);

    const lost = show('a');
    expect(lost).toContain('data-testid="bw-detail-title">Before this visit<');
    expect(lost).toContain('data-testid="bw-detail-net">-1<');
    expect(show('gone')).toContain('data-testid="bw-spin-detail" data-spin="c"');
  });

  it('is in Japanese too, the words a screen reader is given included', () => {
    const markup = show(null, 'ja');
    expect(markup).toContain('aria-label="3回目のスピン：セカンドチャンス×3で×5"');
    expect(markup).toContain('ボーナス → ランプ×3 → セカンドチャンス×5');
    expect(markup).toContain('aria-label="数字ごとのメダル"');
    expect(markup).toContain('×5：4枚、戻り60枚');
    expect(markup).toContain('×2：メダルなし');
    expect(show('a', 'ja')).toContain('今回より前のスピン');
  });
});

describe('the numbers of this visit', () => {
  it('shows no expectation before the first spin, and every number’s count, expectation and net after', () => {
    const empty = renderToStaticMarkup(<NumberTally t={getStrings('en')} locale="en-US" tally={emptyTally()} />);
    expect(empty.match(/<tr data-tally="/g)).toHaveLength(SPOTS.length);
    expect(empty).toContain('data-testid="bw-tally-expected-2">—<');
    expect(empty).toContain('data-testid="bw-tally-net-2">0<');

    let tally = tallyWith(emptyTally(), {
      spot: 8,
      multiplier: 1,
      bets: [
        { spot: 8, amount: 3 },
        { spot: 2, amount: 10 },
      ],
    });
    const one = renderToStaticMarkup(<NumberTally t={getStrings('en')} locale="en-US" tally={tally} />);
    expect(one).toContain('data-spins="1"');
    expect(one).toContain('data-testid="bw-tally-up-8">1<');
    expect(one).toContain('data-testid="bw-tally-expected-2">0.4<');
    expect(one).toContain('data-testid="bw-tally-expected-40">0.02<');
    expect(one).toContain('data-testid="bw-tally-net-8">+21<');
    expect(one).toContain('data-testid="bw-tally-net-2">-10<');
    expect(one).toContain('data-testid="bw-tally-net-40">0<');

    for (let i = 0; i < 53; i++) tally = tallyWith(tally, { spot: 2, multiplier: 1, bets: [] });
    const many = renderToStaticMarkup(<NumberTally t={getStrings('ja')} locale="ja-JP" tally={tally} />);
    expect(many).toContain('data-testid="bw-tally-up-2">53<');
    expect(many).toContain('data-testid="bw-tally-expected-2">21.6<');
    expect(many).toContain('出た回数');
    expect(many).toContain(getStrings('ja').tallyNote);
  });
});
