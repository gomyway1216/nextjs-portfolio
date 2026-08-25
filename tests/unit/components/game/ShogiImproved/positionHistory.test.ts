/**
 * positionHistory.test.ts — the transport that tells the WASM search what has
 * already been on the board this game.
 *
 * Two things have to hold for that transport to be worth anything, and neither
 * is visible from the search-level regression tests:
 *
 * 1. The hash pair JS computes for a replayed position must be bit-identical to
 *    the pair the engine computes for the same position. The two Zobrist tables
 *    are generated independently (TS `KyokumenImproved.initializeHash()` and the
 *    AssemblyScript port), so nothing but a test keeps them in step; if they
 *    ever drift, `pushGameHistoryHash` silently primes noise and the repetition
 *    fix quietly stops working.
 * 2. A replay that cannot reproduce the position being searched must yield an
 *    EMPTY history rather than a partial or wrong one — an empty history is the
 *    exact pre-feature behaviour, a wrong one would make the engine hallucinate
 *    repetitions.
 *
 * The last test closes the loop by showing the engine actually acts on what it
 * is told: primed with three earlier occurrences of the root, the search
 * recognises the position as already repeated and stops, which it cannot do
 * from its own path stack (that stack starts empty at every search).
 */
import { describe, expect, it } from 'vitest';

import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import {
  buildPositionHistoryHashes,
  type ReplayableMove,
} from '@/components/game/ShogiImproved/positionHistory';
import { FU, HI, KA, KE, KI, KY, GI, Te, getKomashu } from '@/components/game/ShogiImproved/types';

import {
  ACTIVE_HALFKP81_PRODUCTION_WASM_PATH,
  loadShogiWasm,
  syncWasm,
  type ShogiSearchWasm,
} from '../../../../../wasm-spike/search-driver';

type HistoryWasm = ShogiSearchWasm & {
  clearGameHistory(): void;
  pushGameHistoryHash(hashA: number, hashB: number): void;
  getGameHistorySize(): number;
  getSecondaryHashVal(): number;
};

const DROP_LETTER: Readonly<Record<string, number>> = {
  P: FU,
  L: KY,
  N: KE,
  S: GI,
  G: KI,
  B: KA,
  R: HI,
};

/** A real game fragment: quiet moves, an exchange, a capture and a drop. */
const GAME: readonly string[] = [
  '2g2f', '8c8d', '2f2e', '8d8e', '6i7h', '4a3b', '2e2d', '2c2d', '2h2d', 'P*2c',
  '2d2h', '8e8f', '8g8f', '8b8f', 'P*8g', '8f8d', '3i3h', '3c3d', '5i6h',
];

function usiSquare(file: string, rank: string): number {
  return ((file.charCodeAt(0) - 48) << 4) + (rank.charCodeAt(0) - 96);
}

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
  const promote = usi[4] === '+';
  const match = legal.find((m) => m.from === from && m.to === to && m.promote === promote);
  if (!match) throw new Error(`no legal move for ${usi}`);
  return match;
}

/** Replay GAME, returning every position's JS hash pair plus the move list. */
function replayGame(): {
  position: ReturnType<typeof InitialPositionImproved.createInitialPosition>;
  played: ReplayableMove[];
  jsHashes: number[];
} {
  const position = InitialPositionImproved.createInitialPosition();
  const played: ReplayableMove[] = [];
  const jsHashes: number[] = [];
  for (const usi of GAME) {
    jsHashes.push(position.HashVal, position.SecondaryHashVal);
    const move = findUsiMove(usi, GenerateMovesImproved.generateLegalMoves(position));
    played.push({ koma: move.koma, from: move.from, to: move.to, promote: move.promote });
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
  }
  return { position, played, jsHashes };
}

describe('position history transport', () => {
  it('hands the engine the same hash pair the engine computes for itself', () => {
    const { position, played, jsHashes } = replayGame();
    const history = buildPositionHistoryHashes(
      InitialPositionImproved.createInitialPosition(),
      played,
      position
    );
    // One pair per position played BEFORE the root; the root's own occurrence
    // is contributed by the search when it pushes ply 0.
    expect(history).toEqual(jsHashes);
    expect(history).toHaveLength(GAME.length * 2);

    // Now replay the same game against the engine and compare pairwise. This
    // is the assertion that keeps the two independently generated Zobrist
    // tables in step.
    const wasm = loadShogiWasm(ACTIVE_HALFKP81_PRODUCTION_WASM_PATH) as HistoryWasm;
    const walk = InitialPositionImproved.createInitialPosition();
    for (const [index, usi] of GAME.entries()) {
      syncWasm(wasm, walk);
      expect(wasm.getHashVal()).toBe(history[index * 2]);
      expect(wasm.getSecondaryHashVal()).toBe(history[index * 2 + 1]);
      const move = findUsiMove(usi, GenerateMovesImproved.generateLegalMoves(walk));
      move.capture = walk.get(move.to);
      walk.move(move);
      walk.toggleTeban();
    }
    syncWasm(wasm, position);
    expect(wasm.getHashVal()).toBe(position.HashVal);
    expect(wasm.getSecondaryHashVal()).toBe(position.SecondaryHashVal);
  });

  it('returns an empty history rather than a wrong one when the replay diverges', () => {
    const { position, played } = replayGame();

    // A move list that does not lead to `position` (one ply short) must not
    // produce a truncated history that the engine would treat as the truth.
    expect(
      buildPositionHistoryHashes(
        InitialPositionImproved.createInitialPosition(),
        played.slice(0, -1),
        position
      )
    ).toEqual([]);

    // An unplayable move list (imported kifu starting mid-game) is rejected
    // the same way rather than throwing.
    expect(
      buildPositionHistoryHashes(
        InitialPositionImproved.createInitialPosition(),
        [{ koma: played[0].koma, from: played[0].from, to: 0x99, promote: false }],
        position
      )
    ).toEqual([]);
  });

  it('makes the search see a repetition it could never see from its own path', () => {
    const { position, played } = replayGame();
    const history = buildPositionHistoryHashes(
      InitialPositionImproved.createInitialPosition(),
      played,
      position
    );
    const wasm = loadShogiWasm(ACTIVE_HALFKP81_PRODUCTION_WASM_PATH) as HistoryWasm;

    const searchWith = (extraRootOccurrences: number): number => {
      syncWasm(wasm, position);
      wasm.clearTT();
      wasm.setRootTesu(played.length);
      wasm.clearGameHistory();
      for (let i = 0; i + 1 < history.length; i += 2) {
        wasm.pushGameHistoryHash(history[i], history[i + 1]);
      }
      for (let i = 0; i < extraRootOccurrences; i++) {
        wasm.pushGameHistoryHash(position.HashVal, position.SecondaryHashVal);
      }
      expect(wasm.getGameHistorySize()).toBe(history.length / 2 + extraRootOccurrences);
      wasm.searchBestMove(0, 4, 6);
      return wasm.getSearchDepth();
    };

    // Two earlier occurrences: this is only the third time the position has
    // been on the board, the game is not drawn, and the search runs normally.
    expect(searchWith(2)).toBeGreaterThan(0);

    // Three earlier occurrences: the root IS the fourth occurrence, so the
    // search declares the repetition immediately and completes no depth. The
    // engine's own path stack is empty at ply 0, so this can only come from
    // the primed game history.
    expect(searchWith(3)).toBe(0);

    // And the history is per-search state owned by the host: clearing it puts
    // the engine straight back to its history-blind behaviour.
    syncWasm(wasm, position);
    wasm.clearTT();
    wasm.clearGameHistory();
    expect(wasm.getGameHistorySize()).toBe(0);
    wasm.searchBestMove(0, 4, 6);
    expect(wasm.getSearchDepth()).toBeGreaterThan(0);
  });
});
