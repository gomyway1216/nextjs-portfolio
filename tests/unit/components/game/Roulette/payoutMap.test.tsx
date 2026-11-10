import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { POCKET_COUNT, RED_NUMBERS, WHEEL_ORDER } from '@/components/game/Roulette/engine';
import { CORNERS, LINES, SPLITS_ACROSS, SPLITS_ALONG, STREETS } from '@/components/game/Roulette/feltLayout';
import { getStrings } from '@/components/game/Roulette/i18n';
import type { PlacedBet } from '@/components/game/Roulette/medalTable';
import { PayoutMapPanel } from '@/components/game/Roulette/PayoutPanel';
import { payoutMap, pocketShare, signedAverage, signedNet } from '@/components/game/Roulette/payoutMap';

const en = getStrings('en');
const ja = getStrings('ja');

describe('payoutMap', () => {
  it('is nothing while no medal is on the felt', () => {
    expect(payoutMap([])).toBeNull();
    expect(payoutMap([{ bet: { kind: 'red' }, amount: 0 }])).toBeNull();
  });

  it('nets a straight-up bet: +35 a medal on its number, the stake lost on the other 36', () => {
    const map = payoutMap([{ bet: { kind: 'straight', number: 17 }, amount: 5 }])!;
    expect(map.wagered).toBe(5);
    expect(map.nets).toHaveLength(POCKET_COUNT);
    expect(map.nets[17]).toBe(175);
    expect(map.nets.filter((net) => net === -5)).toHaveLength(36);
    expect(map).toMatchObject({ ahead: 1, level: 0, behind: 36, best: 175, bestNumbers: [17], worst: -5 });
    expect(map.worstNumbers).toHaveLength(36);
    expect(map.worstNumbers).not.toContain(17);
  });

  it('nets an even-money bet: ahead on its 18 numbers, behind on the other 18 and on zero', () => {
    const map = payoutMap([{ bet: { kind: 'red' }, amount: 10 }])!;
    expect(map).toMatchObject({ ahead: 18, level: 0, behind: 19, best: 10, worst: -10 });
    expect(map.bestNumbers).toEqual([...RED_NUMBERS].sort((a, b) => a - b));
    expect(map.nets[0]).toBe(-10);
  });

  it('adds overlapping bets on a pocket and takes every medal on the felt off each', () => {
    const bets: PlacedBet[] = [
      { bet: { kind: 'straight', number: 14 }, amount: 2 },
      { bet: { kind: 'split', numbers: [14, 17] }, amount: 3 },
      { bet: { kind: 'red' }, amount: 5 },
    ];
    const map = payoutMap(bets)!;
    expect(map.wagered).toBe(10);
    // 14 is red: the straight (2 × 36), the split (3 × 18) and red (5 × 2) all pay.
    expect(map.nets[14]).toBe(72 + 54 + 10 - 10);
    // 17 is black: only the split pays.
    expect(map.nets[17]).toBe(54 - 10);
    // Another red number gets the red bet back doubled: level.
    expect(map.nets[1]).toBe(0);
    expect(map.nets[2]).toBe(-10);
    expect(map).toMatchObject({ ahead: 2, level: 17, behind: 18, best: 126, bestNumbers: [14], worst: -10 });
    expect(map.ahead + map.level + map.behind).toBe(POCKET_COUNT);
  });

  it('red and black together are level on 36 numbers and lose both on zero', () => {
    const map = payoutMap([
      { bet: { kind: 'red' }, amount: 1 },
      { bet: { kind: 'black' }, amount: 1 },
    ])!;
    expect(map).toMatchObject({ ahead: 0, level: 36, behind: 1, best: 0, worst: -2, worstNumbers: [0] });
  });

  it('averages to the house edge, 1/37 of the medals on the felt, for every kind of bet the felt takes', () => {
    const kinds: PlacedBet['bet'][] = [
      { kind: 'straight', number: 0 },
      { kind: 'split', numbers: SPLITS_ALONG[0].numbers },
      { kind: 'split', numbers: SPLITS_ACROSS[5].numbers },
      { kind: 'street', numbers: STREETS[3].numbers },
      { kind: 'corner', numbers: CORNERS[7].numbers },
      { kind: 'line', numbers: LINES[2].numbers },
      { kind: 'dozen', which: 2 },
      { kind: 'column', which: 3 },
      { kind: 'odd' },
      { kind: 'high' },
    ];
    for (const bet of kinds) {
      expect(payoutMap([{ bet, amount: 37 }])!.average).toBeCloseTo(-1, 10);
    }
    expect(payoutMap(kinds.map((bet) => ({ bet, amount: 37 })))!.average).toBeCloseTo(-kinds.length, 10);
  });

  it('a medal on every number loses one medal whatever comes up', () => {
    const map = payoutMap(Array.from({ length: POCKET_COUNT }, (_, number) => ({ bet: { kind: 'straight', number }, amount: 1 })))!;
    expect(map).toMatchObject({ ahead: 0, level: 0, behind: 37, best: -1, worst: -1 });
    expect(map.bestNumbers).toHaveLength(37);
  });
});

describe('the map’s figures as text', () => {
  it('signs a net and an average, and gives a share of the 37 pockets', () => {
    expect(signedNet(35)).toBe('+35');
    expect(signedNet(-5)).toBe('−5');
    expect(signedNet(0)).toBe('±0');
    expect(signedAverage(-10 / 37)).toBe('−0.27');
    expect(signedAverage(1.5)).toBe('+1.50');
    expect(signedAverage(-0.001)).toBe('±0.00');
    expect(pocketShare(18)).toBe('48.6%');
    expect(pocketShare(0)).toBe('0.0%');
    expect(pocketShare(37)).toBe('100.0%');
  });

  it('names a few numbers and counts many, in both languages', () => {
    expect(en.payoutOn([17])).toBe('on 17');
    expect(en.payoutOn([5, 8, 11, 14])).toBe('on 5, 8, 11, 14');
    expect(en.payoutOn([1, 2, 3, 4, 5])).toBe('on 5 numbers');
    expect(ja.payoutOn([17])).toBe('（17）');
    expect(ja.payoutOn([1, 2, 3, 4, 5])).toBe('（5個の数字）');
  });
});

describe('PayoutMapPanel', () => {
  /** The pockets of the map, in the order drawn: number, how it nets, and the net shown. */
  const cells = (markup: string) =>
    [...markup.matchAll(/<li class="[^"]*" data-net="(\w+)"><span[^>]*data-color="(\w+)"[^>]*>(\d+)<\/span><span[^>]*> (\S+): <\/span><span[^>]*>([^<]+)<\/span><\/li>/g)].map((m) => ({
      state: m[1],
      color: m[2],
      n: Number(m[3]),
      said: m[4],
      net: m[5],
    }));

  it('asks for a bet while the felt is empty, in the player’s language', () => {
    const markup = renderToStaticMarkup(<PayoutMapPanel bets={[]} t={en} />);
    expect(markup).toContain(en.payoutTitle);
    expect(markup).toContain(en.payoutEmpty);
    expect(cells(markup)).toEqual([]);
    expect(renderToStaticMarkup(<PayoutMapPanel bets={[]} t={ja} />)).toContain(ja.payoutEmpty);
  });

  it('shows every pocket in wheel order with its net, its colour said as well as shown', () => {
    const markup = renderToStaticMarkup(<PayoutMapPanel bets={[{ bet: { kind: 'straight', number: 32 }, amount: 2 }]} t={en} />);
    const drawn = cells(markup);
    expect(drawn.map((c) => c.n)).toEqual(WHEEL_ORDER);
    expect(drawn[0]).toEqual({ state: 'behind', color: 'green', n: 0, said: 'green', net: '−2' });
    expect(drawn[1]).toEqual({ state: 'ahead', color: 'red', n: 32, said: 'red', net: '+70' });
    expect(markup).toContain('aria-label="Medals won or lost on each number, bets included, in wheel order"');
    expect(markup).toContain('Ahead on 1 of 37 numbers (2.7%)');
    expect(markup).toMatch(/Best: <b[^>]*>\+70<\/b> on 32/);
    expect(markup).toMatch(/Worst: <b[^>]*>−2<\/b> on 36 numbers/);
    expect(markup).toContain('Average over all 37 numbers: −0.05 medals a spin');
  });

  it('says how many pockets are level only when some are, and is translated', () => {
    const one = renderToStaticMarkup(<PayoutMapPanel bets={[{ bet: { kind: 'red' }, amount: 1 }]} t={en} />);
    expect(one).not.toContain('break even');
    const both: PlacedBet[] = [
      { bet: { kind: 'red' }, amount: 1 },
      { bet: { kind: 'black' }, amount: 1 },
    ];
    expect(renderToStaticMarkup(<PayoutMapPanel bets={both} t={en} />)).toContain('Ahead on 0 of 37 numbers (0.0%) · break even on 36');
    const jaMarkup = renderToStaticMarkup(<PayoutMapPanel bets={both} t={ja} />);
    expect(jaMarkup).toContain('37個中0個の数字でプラス（0.0%） · 36個で±0');
    expect(jaMarkup).toMatch(/最低: <b[^>]*>−2<\/b> （0）/);
    expect(jaMarkup).toContain('37個の数字の平均：1スピンあたり−0.05枚');
    expect(cells(jaMarkup)[0].said).toBe('緑');
  });
});
