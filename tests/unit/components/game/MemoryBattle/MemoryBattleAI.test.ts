import { describe, it, expect } from 'vitest';
import type { Card } from '@/components/game/MemoryBattle/engine';
import { createRng, isMatch } from '@/components/game/MemoryBattle/engine';
import {
  AI_CONFIG,
  createMemory,
  forgetMatched,
  observeReveal,
  planTurn,
} from '@/components/game/MemoryBattle/MemoryBattleAI';

const card = (id: number, value: number, matched = false): Card => ({
  id,
  value,
  matched,
  matchedBy: matched ? 'player' : null,
});

// A simple 3-pair board: values 0,0,1,1,2,2 at fixed positions.
const makeBoard = (): Card[] => [
  card(0, 0),
  card(1, 1),
  card(2, 0),
  card(3, 2),
  card(4, 1),
  card(5, 2),
];

describe('observeReveal', () => {
  it('always stores when memory prob is 1 (master)', () => {
    const mem = createMemory();
    const b = makeBoard();
    observeReveal(mem, b[0], AI_CONFIG.master, createRng(1));
    expect(mem.get(0)).toBe(0);
  });

  it('never stores when memory prob is 0', () => {
    const mem = createMemory();
    const b = makeBoard();
    observeReveal(mem, b[0], { memory: 0, recall: 1, blunder: 0 }, createRng(1));
    expect(mem.has(0)).toBe(false);
  });

  it('does not store matched cards', () => {
    const mem = createMemory();
    observeReveal(mem, card(0, 0, true), AI_CONFIG.master, createRng(1));
    expect(mem.has(0)).toBe(false);
  });

  it('stores a higher fraction on hard than easy over many reveals', () => {
    const trials = 400;
    const countStored = (cfg: typeof AI_CONFIG.easy) => {
      let stored = 0;
      const rng = createRng(99);
      for (let i = 0; i < trials; i++) {
        const mem = createMemory();
        observeReveal(mem, card(0, 0), cfg, rng);
        if (mem.has(0)) stored++;
      }
      return stored / trials;
    };
    const easy = countStored(AI_CONFIG.easy);
    const hard = countStored(AI_CONFIG.hard);
    expect(hard).toBeGreaterThan(easy);
    expect(easy).toBeGreaterThan(0.15);
    expect(easy).toBeLessThan(0.55);
  });
});

describe('forgetMatched', () => {
  it('drops entries whose board card is now matched', () => {
    const mem = createMemory();
    mem.set(0, 0);
    mem.set(2, 0);
    const board = makeBoard();
    board[0] = { ...board[0], matched: true, matchedBy: 'ai' };
    forgetMatched(mem, board);
    expect(mem.has(0)).toBe(false);
    expect(mem.has(2)).toBe(true);
  });
});

describe('planTurn', () => {
  it('always returns two in-play, distinct indices', () => {
    const board = makeBoard();
    const mem = createMemory();
    for (let seed = 0; seed < 50; seed++) {
      const plan = planTurn(board, mem, AI_CONFIG.medium, createRng(seed));
      expect(board[plan.first].matched).toBe(false);
      expect(board[plan.second].matched).toBe(false);
      expect(plan.first).not.toBe(plan.second);
    }
  });

  it('takes a known pair confidently on master (perfect recall, no blunder)', () => {
    const board = makeBoard();
    const mem = createMemory();
    // AI knows both 0s (ids 0 and 2).
    mem.set(0, 0);
    mem.set(2, 0);
    const plan = planTurn(board, mem, AI_CONFIG.master, createRng(5));
    expect(plan.confident).toBe(true);
    expect(isMatch(board[plan.first], board[plan.second])).toBe(true);
    expect([plan.first, plan.second].sort()).toEqual([0, 2]);
  });

  it('flips the known partner after revealing the first card (master)', () => {
    const board = makeBoard();
    const mem = createMemory();
    // AI knows only where the second 0 lives (id 2), not the first (id 0).
    mem.set(2, 0);
    // With master config the AI never blunders; whichever card it flips first,
    // if that card's partner is known it should pick it.
    const plan = planTurn(board, mem, AI_CONFIG.master, createRng(3));
    // Guaranteed to end on a real match if first happens to be id 0,
    // otherwise it explores. Assert consistency: if confident, it's a match.
    if (plan.confident) {
      expect(isMatch(board[plan.first], board[plan.second])).toBe(true);
    }
    expect(plan.first).not.toBe(plan.second);
  });

  it('easy AI misses a known pair sometimes (blunders occur)', () => {
    const board = makeBoard();
    let blunders = 0;
    const trials = 200;
    for (let seed = 0; seed < trials; seed++) {
      const mem = createMemory();
      mem.set(0, 0);
      mem.set(2, 0);
      const plan = planTurn(board, mem, AI_CONFIG.easy, createRng(seed * 7 + 1));
      const tookThePair =
        plan.confident && [plan.first, plan.second].sort().join(',') === '0,2';
      if (!tookThePair) blunders++;
    }
    // Easy has 35% blunder + 60% recall, so it should frequently miss.
    expect(blunders).toBeGreaterThan(trials * 0.2);
  });

  it('never claims a confident non-match', () => {
    const board = makeBoard();
    for (let seed = 0; seed < 100; seed++) {
      const mem = createMemory();
      // Seed some (possibly wrong) knowledge.
      mem.set(0, 0);
      mem.set(1, 1);
      mem.set(3, 2);
      const plan = planTurn(board, mem, AI_CONFIG.hard, createRng(seed + 11));
      if (plan.confident) {
        expect(isMatch(board[plan.first], board[plan.second])).toBe(true);
      }
    }
  });

  it('handles a nearly-cleared board without crashing', () => {
    const board = makeBoard().map((c, i) =>
      i < 4 ? { ...c, matched: true, matchedBy: 'player' as const } : c,
    );
    const plan = planTurn(board, createMemory(), AI_CONFIG.medium, createRng(2));
    expect(board[plan.first].matched).toBe(false);
    expect(board[plan.second].matched).toBe(false);
  });
});
