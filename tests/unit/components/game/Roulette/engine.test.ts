import { describe, expect, it } from 'vitest';
import {
  colorOf,
  isEvenMoney,
  payoutMultiplier,
  spin,
} from '@/components/game/Roulette/engine';

describe('Roulette engine', () => {
  it('classifies pocket colors', () => {
    expect(colorOf(0)).toBe('green');
    expect(colorOf(1)).toBe('red');
    expect(colorOf(2)).toBe('black');
  });

  it('calculates payout multipliers for outside and inside bets', () => {
    expect(payoutMultiplier({ kind: 'red' }, 1)).toBe(2);
    expect(payoutMultiplier({ kind: 'black' }, 1)).toBe(0);
    expect(payoutMultiplier({ kind: 'dozen', which: 2 }, 18)).toBe(3);
    expect(payoutMultiplier({ kind: 'straight', number: 0 }, 0)).toBe(36);
    expect(payoutMultiplier({ kind: 'split', numbers: [8, 11] }, 11)).toBe(18);
  });

  it('detects even-money bets and spins with injected rng', () => {
    expect(isEvenMoney({ kind: 'high' })).toBe(true);
    expect(isEvenMoney({ kind: 'straight', number: 5 })).toBe(false);
    expect(spin(() => 0.999)).toBe(36);
  });
});
