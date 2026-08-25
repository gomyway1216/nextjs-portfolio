import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';
import { GOTE, SENTE, SHI, SKI } from '@/components/game/ShogiImproved/types';

const fallbackSearch = vi.hoisted(() =>
  vi.fn(() => ({
    move: { koma: 1, from: 0x77, to: 0x76, promote: false },
    scoreCp: 321,
    depth: 5,
    kind: 'search' as const,
  }))
);

/** The shortening pass of the worker's mate probe (exact iterative deepening). */
const mateMock = vi.hoisted(() => {
  let result: { koma: number; from: number; to: number; promote: boolean } | null = null;
  return {
    solve: vi.fn(() => result),
    setResult: (next: typeof result) => {
      result = next;
    },
  };
});

/** The search stage of the worker's mate probe (df-pn, no ply horizon). */
const dfpnMock = vi.hoisted(() => {
  let result: { move: { koma: number; from: number; to: number; promote: boolean }; mateDepth: number } | null = null;
  return {
    solveDetailed: vi.fn(() => result),
    setResult: (next: typeof result) => {
      result = next;
    },
  };
});

vi.mock('@/components/game/ShogiImproved/OpeningBookImproved', () => ({
  ensureExternalOpeningBookLoaded: vi.fn(async () => undefined),
  getOpeningMoveImproved: vi.fn(() => null),
}));

vi.mock('@/components/game/ShogiImproved/ShogiAIImprovedV20', () => ({
  ShogiAIImprovedV20: class {
    clearTT(): void {}

    getNextTeWithInfo(): ReturnType<typeof fallbackSearch> {
      return fallbackSearch();
    }
  },
}));

vi.mock('@/components/game/ShogiImproved/MateSolverImproved', () => ({
  MateSolverImproved: class {
    solve(): ReturnType<typeof mateMock.solve> {
      return mateMock.solve();
    }
  },
}));

vi.mock('@/components/game/ShogiImproved/DfpnMateSolverImproved', () => ({
  DfpnMateSolverImproved: class {
    solveDetailed(): ReturnType<typeof dfpnMock.solveDetailed> {
      return dfpnMock.solveDetailed();
    }
  },
}));

vi.mock('@/components/game/ShogiImproved/wasmEngine', () => ({
  clearWasmRootPolicyRank: vi.fn(),
  clearWasmTT: vi.fn(),
  createWasmRootPolicyRankReceipt: vi.fn(() => null),
  enableSharedTT: vi.fn(() => false),
  getLastWasmSearchStats: vi.fn(() => null),
  isNnueEnabled: vi.fn(() => false),
  isNnueWeightsLoaded: vi.fn(() => false),
  isWasmEngineReady: vi.fn(() => false),
  loadNnueWeights: vi.fn(() => false),
  measureEmbeddedWasmRuntimeIdentity: vi.fn(async () => ({ bytes: 4, sha256: 'a'.repeat(64) })),
  publishSearchGeneration: vi.fn(),
  setSearchGeneration: vi.fn(),
  setWasmNnueEnabled: vi.fn(),
  wasmSearchBestMove: vi.fn(() => null),
}));

type PostedMessage = {
  type: string;
  id?: number;
  move?: unknown;
  scoreCp?: number;
  depth?: number;
  searchPath?: string;
};

const posted: PostedMessage[] = [];
const scope = {
  postMessage: (message: PostedMessage) => posted.push(message),
  onmessage: null as ((event: { data: unknown }) => void) | null,
};

function serialize(k: KyokumenImproved) {
  const board: number[] = [];
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) board.push(k.ban[(suji << 4) + dan]);
  }
  return { board, hand: [...k.hand], teban: k.teban };
}

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline test'))));
  vi.stubGlobal('self', scope);
  await import('@/components/game/ShogiImproved/shogi-ai.worker');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  posted.length = 0;
  fallbackSearch.mockClear();
  mateMock.solve.mockClear();
  mateMock.setResult(null);
  dfpnMock.solveDetailed.mockClear();
  dfpnMock.setResult(null);
});

describe('shogi-ai.worker JS fallback diagnostics', () => {
  it('reports worker-js and converts its score to SENTE perspective', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(GOTE);
    expect(scope.onmessage).toBeTypeOf('function');
    scope.onmessage!({
      data: { type: 'bestMove', id: 301, position: serialize(k), difficulty: 'easy', tesu: 0 },
    });

    const result = posted.find((message) => message.type === 'bestMoveResult' && message.id === 301);
    expect(result).toMatchObject({
      searchPath: 'worker-js',
      scoreCp: -321,
      depth: 5,
      move: { koma: 1, from: 0x77, to: 0x76, promote: false },
    });
    expect(fallbackSearch).toHaveBeenCalledOnce();
  });

  /** Satisfy the worker's cheap mate-solver gate: two attacking pieces within distance 3. */
  function positionPastMateGate(): ReturnType<typeof InitialPositionImproved.createInitialPosition> {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);
    k.ban[0x54] = SHI;
    k.ban[0x64] = SKI;
    k.initAll();
    return k;
  }

  it('reports a dedicated mate-solver result and score', () => {
    const k = positionPastMateGate();
    const mateMove = { koma: SHI, from: 0x54, to: 0x52, promote: false };
    dfpnMock.setResult({ move: mateMove, mateDepth: 1 });

    scope.onmessage!({
      data: { type: 'bestMove', id: 302, position: serialize(k), difficulty: 'easy', tesu: 0 },
    });

    const result = posted.find((message) => message.type === 'bestMoveResult' && message.id === 302);
    expect(result).toMatchObject({
      searchPath: 'mate',
      scoreCp: 30_000,
      move: mateMove,
    });
    expect(result?.depth).toBeUndefined();
    expect(dfpnMock.solveDetailed).toHaveBeenCalledOnce();
    // A mate in one cannot be shortened, so the exact solver is never asked.
    expect(mateMock.solve).not.toHaveBeenCalled();
    expect(fallbackSearch).not.toHaveBeenCalled();
  });

  it('prefers a shorter exact mate over a longer df-pn proof', () => {
    const k = positionPastMateGate();
    const longMove = { koma: SHI, from: 0x54, to: 0x51, promote: false };
    const shortMove = { koma: SHI, from: 0x54, to: 0x52, promote: false };
    dfpnMock.setResult({ move: longMove, mateDepth: 9 });
    mateMock.setResult(shortMove);

    scope.onmessage!({
      data: { type: 'bestMove', id: 303, position: serialize(k), difficulty: 'medium', tesu: 0 },
    });

    const result = posted.find((message) => message.type === 'bestMoveResult' && message.id === 303);
    expect(result).toMatchObject({ searchPath: 'mate', scoreCp: 30_000, move: shortMove });
    expect(dfpnMock.solveDetailed).toHaveBeenCalledOnce();
    expect(mateMock.solve).toHaveBeenCalledOnce();
    expect(fallbackSearch).not.toHaveBeenCalled();
  });

  it('keeps the df-pn move when no shorter mate exists', () => {
    const k = positionPastMateGate();
    const longMove = { koma: SHI, from: 0x54, to: 0x51, promote: false };
    dfpnMock.setResult({ move: longMove, mateDepth: 9 });
    mateMock.setResult(null);

    scope.onmessage!({
      data: { type: 'bestMove', id: 304, position: serialize(k), difficulty: 'medium', tesu: 0 },
    });

    const result = posted.find((message) => message.type === 'bestMoveResult' && message.id === 304);
    expect(result).toMatchObject({ searchPath: 'mate', move: longMove });
    expect(mateMock.solve).toHaveBeenCalledOnce();
  });
});
