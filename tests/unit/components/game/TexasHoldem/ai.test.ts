import { describe, expect, it } from 'vitest';

import { decideCpuAction, preflopStrength, requiredPostflopEquity } from '@/components/game/TexasHoldem/ai';
import { advanceRunout, applyPlayerAction, createGame, type Card } from '@/components/game/TexasHoldem/engine';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('Texas Hold’em CPU policy', () => {
  it('orders premium hands above marginal and trash hands', () => {
    const aces = preflopStrength([card('A', '♠'), card('A', '♥')]);
    const aceKing = preflopStrength([card('A', '♠'), card('K', '♠')]);
    const sevenTwo = preflopStrength([card('7', '♠'), card('2', '♥')]);
    expect(aces).toBeGreaterThan(aceKing);
    expect(aceKing).toBeGreaterThan(sevenTwo);
  });

  it('returns an action accepted by the rules engine at an eight-max table', () => {
    const game = createGame(8, { rng: () => 0.27 });
    const actor = game.currentActor;
    expect(actor).not.toBeNull();
    expect(game.players[actor!].isHuman).toBe(false);
    const action = decideCpuAction(game, actor!, () => 0.5);
    expect(() => applyPlayerAction(game, actor!, action)).not.toThrow();
  });

  it('folds a marginal early-position hand when facing a raise', () => {
    const game = createGame(6, { rng: () => 0.27 });
    const actor = game.currentActor!;
    const facingRaisePlayers = game.players.map((seat, index) => ({
      ...seat,
      hole: index === actor ? [card('K', '♠'), card('T', '♥')] : seat.hole,
      stack: index === 0 ? 194 : seat.stack,
      streetBet: index === 0 ? 6 : seat.streetBet,
      totalContribution: index === 0 ? 6 : seat.totalContribution,
    }));
    const facingRaise = { ...game, players: facingRaisePlayers, currentBet: 6 };
    expect(decideCpuAction(facingRaise, actor, () => 0.5)).toEqual({ type: 'fold' });

    const premiumPlayers = facingRaisePlayers.map((seat, index) => ({
      ...seat,
      hole: index === actor ? [card('A', '♠'), card('K', '♠')] : seat.hole,
    }));
    expect(decideCpuAction({ ...facingRaise, players: premiumPlayers }, actor, () => 0.5).type).not.toBe('fold');
  });

  it('requires extra equity against a betting range, especially multiway', () => {
    expect(requiredPostflopEquity(0.25, 1)).toBeCloseTo(0.305);
    expect(requiredPostflopEquity(0.25, 3)).toBeCloseTo(0.35);
  });

  it('plays complete mixed-strategy hands without illegal actions or chip loss', () => {
    let seed = 0x9e3779b9;
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (const seats of [2, 6, 8]) {
      for (let repetition = 0; repetition < 4; repetition += 1) {
        let game = createGame(seats, { rng });
        let actions = 0;
        while (game.street !== 'complete') {
          if (game.runout) {
            game = advanceRunout(game);
            continue;
          }
          const actor = game.currentActor;
          expect(actor).not.toBeNull();
          if (actor === null) throw new Error('Hand stalled without an actor or runout');
          game = applyPlayerAction(game, actor, decideCpuAction(game, actor, rng));
          actions += 1;
          expect(actions).toBeLessThan(160);
        }
        expect(game.street).toBe('complete');
        expect(game.players.reduce((sum, seat) => sum + seat.stack, 0)).toBe(seats * 200);
      }
    }
  });
});
