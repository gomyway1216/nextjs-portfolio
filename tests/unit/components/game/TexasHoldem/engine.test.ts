import { describe, expect, it } from 'vitest';

import {
  advanceRunout,
  applyPlayerAction,
  cardKey,
  createDeck,
  createGame,
  evaluateBest,
  evaluateFive,
  settleShowdown,
  type Card,
  type PlayerState,
} from '@/components/game/TexasHoldem/engine';

const cards = (input: string): Card[] => {
  const suitMap: Record<string, Card['suit']> = { s: '♠', h: '♥', d: '♦', c: '♣' };
  return input.split(' ').map((token) => ({ rank: token[0] as Card['rank'], suit: suitMap[token[1]] }));
};

const player = (hole: string, contribution: number): PlayerState => ({
  id: hole,
  name: hole,
  isHuman: false,
  stack: 0,
  hole: cards(hole),
  folded: false,
  allIn: true,
  streetBet: 0,
  totalContribution: contribution,
  lastAction: null,
});

describe('Texas Hold’em engine', () => {
  it('builds a unique 52-card deck', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardKey)).size).toBe(52);
  });

  it('ranks made hands in poker order', () => {
    expect(evaluateFive(cards('As Ks Qs Js Ts')).name).toBe('straight-flush');
    expect(evaluateFive(cards('Ah Ad Ac As 2d')).name).toBe('four-of-a-kind');
    expect(evaluateFive(cards('Kh Kd Ks 2c 2d')).name).toBe('full-house');
    expect(evaluateFive(cards('2h 5h 8h Jh Kh')).name).toBe('flush');
    expect(evaluateFive(cards('9s 8h 7d 6c 5s')).name).toBe('straight');
  });

  it('recognizes the ace-to-five wheel and selects the best five of seven', () => {
    const wheel = evaluateFive(cards('As 2h 3d 4c 5s'));
    expect(wheel.name).toBe('straight');
    expect(wheel.tiebreak).toEqual([5]);

    const best = evaluateBest(cards('As Ah Kd Kc Ks 2d 3c'));
    expect(best.name).toBe('full-house');
    expect(best.tiebreak).toEqual([13, 14]);
  });

  it('splits main and side pots by contribution level', () => {
    const result = settleShowdown(
      [player('As Ah', 50), player('Ks Kh', 100), player('Qs Qh', 100)],
      cards('2c 3d 7h 9c Jd'),
      2,
    );
    expect(result.pots.map((pot) => pot.amount)).toEqual([150, 100]);
    expect(result.payouts).toEqual([150, 100, 0]);
  });

  it('returns an uncalled overbet without reporting the losing player as a winner', () => {
    const result = settleShowdown(
      [player('2s 3h', 200), player('As Ah', 100)],
      cards('4c 7d 9h Jc Kd'),
      1,
    );
    expect(result.pots.map((pot) => pot.amount)).toEqual([200]);
    expect(result.payouts).toEqual([100, 200]);
    expect(result.winnerIndices).toEqual([1]);
  });

  it('uses heads-up blind order and awards an uncontested fold', () => {
    const game = createGame(2, { rng: () => 0.42 });
    expect(game.dealerIndex).toBe(0);
    expect(game.smallBlindIndex).toBe(0);
    expect(game.bigBlindIndex).toBe(1);
    expect(game.currentActor).toBe(0);

    const finished = applyPlayerAction(game, 0, { type: 'fold' });
    expect(finished.street).toBe('complete');
    expect(finished.result?.uncontested).toBe(true);
    expect(finished.result?.payouts[1]).toBe(3);
    expect(finished.players.reduce((sum, seat) => sum + seat.stack, 0)).toBe(400);
  });

  it('runs out a preflop all-in one community card at a time before showdown', () => {
    let game = createGame(2, { rng: () => 0.31 });
    game = applyPlayerAction(game, 0, { type: 'raise', raiseTo: 200 });
    game = applyPlayerAction(game, 1, { type: 'call' });
    expect(game.runout).toBe(true);
    expect(game.street).toBe('preflop');
    expect(game.board).toHaveLength(0);

    for (let revealed = 1; revealed <= 5; revealed += 1) {
      game = advanceRunout(game);
      expect(game.board).toHaveLength(revealed);
      expect(game.runout).toBe(true);
      expect(game.result).toBeNull();
    }
    expect(game.street).toBe('river');

    game = advanceRunout(game);
    expect(game.street).toBe('complete');
    expect(game.runout).toBe(false);
    expect(game.players.reduce((sum, seat) => sum + seat.stack, 0)).toBe(400);
  });

  it('distinguishes an opening postflop bet from a raise', () => {
    let game = createGame(2, { rng: () => 0.56 });
    game = applyPlayerAction(game, 0, { type: 'call' });
    game = applyPlayerAction(game, 1, { type: 'check' });
    expect(game.street).toBe('flop');
    expect(game.currentActor).toBe(1);

    game = applyPlayerAction(game, 1, { type: 'raise', raiseTo: 2 });
    expect(game.players[1].lastAction).toBe('bet');
    expect(game.log.at(-1)?.detail).toBe('bet');
  });

  it('supports a full eight-seat table', () => {
    const game = createGame(8, { rng: () => 0.73 });
    expect(game.players).toHaveLength(8);
    expect(game.players.every((seat) => seat.hole.length === 2)).toBe(true);
    expect(new Set(game.players.flatMap((seat) => seat.hole).map(cardKey)).size).toBe(16);
  });
});
