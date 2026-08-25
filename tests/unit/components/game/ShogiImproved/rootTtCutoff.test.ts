/**
 * rootTtCutoff.test.ts — the root of a search must actually be searched.
 *
 * The transposition table is shared across the whole game: it holds entries
 * written by the previous move's search and by up to 30 seconds of pondering
 * on the opponent's time, and it carries no generation or age. An EXACT hit at
 * ply 0 therefore used to end the entire search before it began — the engine
 * replayed the stored move, spent none of its time budget, and still reported
 * the stored depth, which is how a "depth 13" answer could come back from
 * essentially zero fresh nodes. A move chosen that way is frozen: no matter
 * how the game has moved on, the answer is whatever the table remembers, which
 * is what let the reported rook-pawn shuttle repeat itself move after move.
 *
 * This is the direct, deterministic lock on that fix. On the pre-fix engine the
 * re-ask below returns after 4 and 8 nodes; a search that really runs needs
 * two orders of magnitude more than that. The behavioural rook-pawn scenario in
 * wasmEngineNnue.test.ts is a probabilistic smoke test on top of this — it is
 * this file that fails outright if the cutoff comes back.
 */
import { describe, expect, it } from 'vitest';

import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { FU, GI, HI, KA, KE, KI, KY, Te, getKomashu } from '@/components/game/ShogiImproved/types';

import {
  buildPositionHistoryHashes,
  type ReplayableMove,
} from '@/components/game/ShogiImproved/positionHistory';
import {
  clearWasmTT,
  getLastWasmSearchStats,
  wasmSearchBestMove,
} from '@/components/game/ShogiImproved/wasmEngine';

import {
  ACTIVE_HALFKP81_PRODUCTION_WASM_PATH,
  loadShogiWasm,
  syncWasm,
  type ShogiSearchWasm,
} from '../../../../../wasm-spike/search-driver';

const DROP_LETTER: Readonly<Record<string, number>> = {
  P: FU,
  L: KY,
  N: KE,
  S: GI,
  G: KI,
  B: KA,
  R: HI,
};

/** A quiet middlegame root with a real move list behind it. */
const OPENING = [
  '2g2f', '8c8d', '2f2e', '8d8e', '6i7h', '4a3b', '2e2d', '2c2d', '2h2d', 'P*2c',
  '2d2h', '8e8f',
];

const usiSquare = (file: string, rank: string): number =>
  ((file.charCodeAt(0) - 48) << 4) + (rank.charCodeAt(0) - 96);

function findUsiMove(usi: string, legal: Te[]): Te {
  if (usi[1] === '*') {
    const to = usiSquare(usi[2], usi[3]);
    const komashu = DROP_LETTER[usi[0]];
    const drop = legal.find((m) => m.from === 0 && m.to === to && getKomashu(m.koma) === komashu);
    if (!drop) throw new Error(`no legal drop for ${usi}`);
    return drop;
  }
  const from = usiSquare(usi[0], usi[1]);
  const to = usiSquare(usi[2], usi[3]);
  const match = legal.find((m) => m.from === from && m.to === to && m.promote === (usi[4] === '+'));
  if (!match) throw new Error(`no legal move for ${usi}`);
  return match;
}

describe('root search with a warm transposition table', () => {
  it('searches the root instead of returning the table entry', () => {
    const wasm = loadShogiWasm(ACTIVE_HALFKP81_PRODUCTION_WASM_PATH) as ShogiSearchWasm;
    const position = InitialPositionImproved.createInitialPosition();
    for (const usi of OPENING) {
      const move = findUsiMove(usi, GenerateMovesImproved.generateLegalMoves(position));
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
    }

    const search = (maxDepth: number) => {
      syncWasm(wasm, position);
      wasm.setRootTesu(OPENING.length);
      const key = wasm.searchBestMove(0, maxDepth, 8);
      return { key, depth: wasm.getSearchDepth(), nodes: wasm.getSearchNodes() };
    };

    // Warm the table the way a real game does: one full search of this exact
    // root, leaving a deep EXACT entry behind.
    wasm.clearTT();
    const warm = search(8);
    expect(warm.key).not.toBe(0);
    expect(warm.depth).toBe(8);
    expect(warm.nodes).toBeGreaterThan(1_000);

    // Ask again for a SHALLOWER search. The stored entry is deeper than every
    // requested depth, so the pre-fix engine satisfied the whole request from
    // the table and returned after 4 nodes.
    const shallow = search(4);
    expect(shallow.key).not.toBe(0);
    expect(shallow.nodes).toBeGreaterThan(50);

    // And at the stored depth itself, where the pre-fix engine returned after
    // 8 nodes while reporting depth 8.
    const same = search(8);
    expect(same.key).not.toBe(0);
    expect(same.nodes).toBeGreaterThan(50);

    // The table is still doing its job — a re-search is far cheaper than the
    // cold one, because the entry is used for move ordering.
    expect(same.nodes).toBeLessThan(warm.nodes);
  });
});

describe('transposition table across a change of game history', () => {
  // Repetition detection now consults the already-played positions, so a
  // stored score can embody "this line repeats". A TT entry records only the
  // board hash, never the history it was computed under. While the game only
  // appends positions that is harmless - an older entry can only have counted
  // too FEW occurrences, which is the pre-fix behaviour. Going backwards
  // (待った, a restored save, an imported kifu) is the dangerous direction: an
  // entry written when a position had three earlier occurrences would claim a
  // draw that no longer exists. The engine drops the table in that case.
  it('keeps the table while the game moves forward and drops it when it does not', () => {
    const position = InitialPositionImproved.createInitialPosition();
    const played: ReplayableMove[] = [];
    for (const usi of OPENING) {
      const move = findUsiMove(usi, GenerateMovesImproved.generateLegalMoves(position));
      played.push({ koma: move.koma, from: move.from, to: move.to, promote: move.promote });
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
    }
    const history = buildPositionHistoryHashes(
      InitialPositionImproved.createInitialPosition(),
      played,
      position
    );
    expect(history).toHaveLength(played.length * 2);

    const search = (gameHistory: readonly number[]): number => {
      const move = wasmSearchBestMove(position.clone(), played.length, 0, 6, 8, null, gameHistory);
      expect(move).not.toBeNull();
      return getLastWasmSearchStats()?.nodes ?? 0;
    };

    clearWasmTT();
    const cold = search(history);
    expect(cold).toBeGreaterThan(1_000);

    // Same history: a pure (empty) continuation, so the table survives and the
    // re-search is far cheaper.
    const warm = search(history);
    expect(warm).toBeLessThan(cold / 2);

    // One more position appended, the way the game actually advances. Still a
    // forward continuation, so the table is still worth something.
    const forward = [...history, position.HashVal, position.SecondaryHashVal];
    expect(search(forward)).toBeLessThan(cold);

    // Now go BACKWARDS, as 待った does. This is not a continuation of what was
    // primed, so the table must be dropped and the next search pays full price
    // again instead of trusting entries computed under a longer history.
    const rewound = history.slice(0, history.length - 4);
    expect(search(rewound)).toBeGreaterThan(cold / 2);
  });
});
