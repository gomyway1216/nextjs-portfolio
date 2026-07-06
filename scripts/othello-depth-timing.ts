/**
 * Measure per-move wall-clock time at a given mid-game search depth.
 *
 * The production AI runs synchronously on the main thread, so the *worst single
 * move* time is what determines UI responsiveness — not the average. This plays
 * a self-play game (production cf evaluator) at the requested depth and reports
 * the max / p95 / mean per-move time and which turn the max occurred on.
 *
 * Run: npx tsx scripts/othello-depth-timing.ts [depth] [games]
 */

import { Board } from '../src/components/game/Othello/Board';
import { OthelloAI } from '../src/components/game/Othello/AI';
import { MAX_TURNS, type Difficulty, type Point } from '../src/components/game/Othello/types';

const DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'expert', 'master']);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main(): void {
  // arg1 is either a fixed mid-game depth (number) or a difficulty name.
  // A difficulty exercises its real production params (incl. timeLimitMs).
  const arg1 = process.argv[2] ?? '6';
  const games = parseInt(process.argv[3] ?? '3', 10);
  const rng = mulberry32(12345);

  let ai: OthelloAI;
  let label: string;
  if (DIFFICULTIES.has(arg1)) {
    ai = new OthelloAI(arg1 as Difficulty);
    label = `difficulty=${arg1}`;
  } else {
    // Use difficulty 'hard' so endgame params match; override only mid-game depth.
    ai = new OthelloAI('hard', { midDepthOverride: parseInt(arg1, 10) });
    label = `depth=${arg1}`;
  }

  const times: { ms: number; turn: number }[] = [];
  const origLog = console.log;

  for (let g = 0; g < games; g++) {
    const board = new Board();
    // small random opening for variety
    for (let i = 0; i < 4; i++) {
      const legal = board.getMovablePos();
      if (legal.length === 0) break;
      board.move(legal[Math.floor(rng() * legal.length)]);
    }
    let passStreak = 0;
    while (board.getTurns() < MAX_TURNS) {
      const legal = board.getMovablePos();
      if (legal.length === 0) {
        board.pass();
        if (++passStreak >= 2) break;
        continue;
      }
      passStreak = 0;
      const turn = board.getTurns();
      console.log = () => {};
      const t0 = Date.now();
      const mv = ai.getBestMove(board) as Point;
      const ms = Date.now() - t0;
      console.log = origLog;
      times.push({ ms, turn });
      board.move(mv);
    }
  }

  times.sort((a, b) => a.ms - b.ms);
  const n = times.length;
  const mean = times.reduce((s, t) => s + t.ms, 0) / n;
  const p95 = times[Math.floor(n * 0.95)];
  const max = times[n - 1];
  const median = times[Math.floor(n * 0.5)];

  console.log(`${label} | games=${games} | moves=${n}`);
  console.log(`per-move ms  mean=${mean.toFixed(0)}  median=${median.ms}  p95=${p95.ms}  MAX=${max.ms} (turn ${max.turn})`);
  // Show the slowest few moves and their turns (spikes cluster near the boost/endgame edge).
  const slowest = times.slice(-6).reverse().map((t) => `${t.ms}ms@t${t.turn}`).join('  ');
  console.log(`slowest moves: ${slowest}`);
}

main();
