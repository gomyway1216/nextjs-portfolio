/**
 * Regression tests for the two search defects behind the reported
 * "AI repeated 8六歩打 four times" game.
 *
 * These are deliberately DETERMINISTIC. The end-to-end loop test in
 * wasmEngineNnue.test.ts exercises a realistic game but, being a rate under a
 * wall clock, it cannot tell the pre-fix runtime from the fixed one. These can:
 * each asserts on a mechanism that changed, with a margin far larger than any
 * measurement noise.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import {
  buildPositionHistoryHashes,
  type ReplayableMove,
} from '@/components/game/ShogiImproved/positionHistory';
import { FU, GI, HI, KA, KE, KY, Te, getKomashu } from '@/components/game/ShogiImproved/types';
import {
  clearWasmTT,
  getLastWasmSearchStats,
  loadNnueWeights,
  setWasmNnueEnabled,
  wasmSearchBestMove,
} from '@/components/game/ShogiImproved/wasmEngine';

const weightsPath = join(process.cwd(), 'public', 'shogi-halfkp81-production-weights.bin');

const DROP_LETTER: Record<string, number> = { P: FU, L: KY, N: KE, S: GI, B: KA, R: HI };

function usiSquare(file: string, rank: string): number {
  return ((file.charCodeAt(0) - 48) << 4) + (rank.charCodeAt(0) - 96);
}

function findUsiMove(usi: string, legal: Te[]): Te {
  if (usi[1] === '*') {
    const to = usiSquare(usi[2], usi[3]);
    const drop = legal.find(
      (m) => m.from === 0 && m.to === to && getKomashu(m.koma) === DROP_LETTER[usi[0]]
    );
    if (!drop) throw new Error(`illegal drop ${usi}`);
    return drop;
  }
  const from = usiSquare(usi[0], usi[1]);
  const to = usiSquare(usi[2], usi[3]);
  const move = legal.find((m) => m.from === from && m.to === to && m.promote === usi.endsWith('+'));
  if (!move) throw new Error(`illegal move ${usi}`);
  return move;
}

beforeAll(() => {
  const buf = readFileSync(weightsPath);
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  expect(loadNnueWeights(bytes, 600)).toBe(true);
  expect(setWasmNnueEnabled(true)).toBe(true);
});

describe('the root is searched, not answered from the table', () => {
  it('still searches when the table already holds a deeper entry for this exact root', () => {
    clearWasmTT();
    const position = InitialPositionImproved.createInitialPosition();

    // Leave the table in the state pondering leaves it in: a deep, EXACT
    // entry for the very position the engine is about to be asked about.
    wasmSearchBestMove(position.clone(), 0, 0, 10, 8, null, []);
    const primed = getLastWasmSearchStats();
    expect(primed?.depth).toBe(10);

    // Now a request whose depth the stored entry already covers. Ply 0 used to
    // accept that entry and return it, so the whole "search" cost a handful of
    // nodes and reported the STORED depth as if it had just been reached —
    // which is how the engine could re-play its previous move four times and
    // still claim a deep search. Measured here: 8 nodes before, 280 after.
    const move = wasmSearchBestMove(position.clone(), 0, 0, 8, 8, null, []);
    const stats = getLastWasmSearchStats();

    expect(move).not.toBeNull();
    expect(stats?.depth).toBe(8);
    expect(stats?.nodes).toBeGreaterThan(100);
  });
});

describe('game history handed to the search', () => {
  const PREFIX = ['2g2f', '8c8d', '2f2e', '8d8e', '6i7h', '4a3b'] as const;

  function replayPrefix(): { position: ReturnType<typeof InitialPositionImproved.createInitialPosition>; played: ReplayableMove[] } {
    const position = InitialPositionImproved.createInitialPosition();
    const played: ReplayableMove[] = [];
    for (const usi of PREFIX) {
      const move = findUsiMove(usi, GenerateMovesImproved.generateLegalMoves(position));
      played.push({ koma: move.koma, from: move.from, to: move.to, promote: move.promote });
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
    }
    return { position, played };
  }

  it('produces one hash pair per played position, stopping before the root', () => {
    const { position, played } = replayPrefix();
    const start = InitialPositionImproved.createInitialPosition();

    const history = buildPositionHistoryHashes(start, played, position);

    // Plies 0..n-1 — the root's own occurrence is contributed by the search
    // when it pushes ply 0, so including it here would double count.
    expect(history).toHaveLength(played.length * 2);
  });

  it('reports the same hashes the engine computes for those positions', () => {
    const { position, played } = replayPrefix();
    const start = InitialPositionImproved.createInitialPosition();
    const history = buildPositionHistoryHashes(start, played, position);

    // Walk the same line again and check each recorded pair against the
    // position that was actually on the board at that ply.
    const walker = InitialPositionImproved.createInitialPosition();
    for (let i = 0; i < played.length; i++) {
      expect(history[i * 2]).toBe(walker.HashVal);
      expect(history[i * 2 + 1]).toBe(walker.SecondaryHashVal);
      const m = played[i];
      const move = GenerateMovesImproved.generateLegalMoves(walker).find(
        (c) => c.koma === m.koma && c.from === m.from && c.to === m.to && c.promote === m.promote
      );
      expect(move).toBeDefined();
      move!.capture = walker.get(move!.to);
      walker.move(move!);
      walker.toggleTeban();
    }
  });

  it('yields no history at all rather than a wrong one when the replay diverges', () => {
    const { position, played } = replayPrefix();
    const start = InitialPositionImproved.createInitialPosition();

    // One move short: the replay can no longer land on `position`. An empty
    // history is always safe (the engine is then simply history-blind); a
    // partial one would silently mis-count repetitions.
    expect(buildPositionHistoryHashes(start, played.slice(0, -1), position)).toEqual([]);
  });

  it('accepts a seeded history and still returns a legal move', () => {
    clearWasmTT();
    const { position, played } = replayPrefix();
    const start = InitialPositionImproved.createInitialPosition();
    const history = buildPositionHistoryHashes(start, played, position);

    const move = wasmSearchBestMove(position.clone(), played.length, 200, 32, 8, null, history);
    expect(move).not.toBeNull();
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    expect(
      legal.some(
        (m) => m.from === move!.from && m.to === move!.to && m.promote === move!.promote
      )
    ).toBe(true);
  });
});
