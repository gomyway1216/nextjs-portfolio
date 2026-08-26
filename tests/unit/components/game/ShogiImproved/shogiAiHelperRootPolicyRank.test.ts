import { beforeAll, describe, expect, it, vi } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';

const engine = vi.hoisted(() => {
  let nnueAvailable = true;
  return {
    search: vi.fn((..._args: unknown[]) => null),
    setNnue: vi.fn((requested: boolean) => requested && nnueAvailable),
    setSoftTimeLimit: vi.fn((_enabled: boolean) => {}),
    setNnueAvailable(available: boolean) {
      nnueAvailable = available;
    },
  };
});

vi.mock('@/components/game/ShogiImproved/wasmEngine', () => ({
  clearWasmRootPolicyRank: vi.fn(),
  clearWasmTT: vi.fn(),
  enableSharedTT: vi.fn(() => true),
  getLastWasmSearchStats: vi.fn(() => ({
    score: 0,
    depth: 1,
    nodes: 1,
    leaves: 1,
  })),
  loadNnueWeights: vi.fn(() => true),
  setSearchGeneration: vi.fn(),
  setWasmNnueEnabled: engine.setNnue,
  setWasmSearchStartDepth: vi.fn(),
  setWasmSoftTimeLimit: engine.setSoftTimeLimit,
  wasmSearchBestMove: engine.search,
}));

const scope = {
  onmessage: null as ((event: { data: unknown }) => void) | null,
};
const port = {
  onmessage: null as ((event: { data: unknown }) => void) | null,
  postMessage: vi.fn(),
};

function serialize(k: KyokumenImproved) {
  const board: number[] = [];
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) board.push(k.ban[(suji << 4) + dan]);
  }
  return { board, hand: [...k.hand], teban: k.teban };
}

const receipt = Object.freeze({
  schema: 'shogi-root-policy-rank-receipt-v1' as const,
  sequence: 8,
  positionHashA: 1,
  positionHashB: 2,
  moveCount: 1,
  ranks: Object.freeze([Object.freeze({ moveKey: 3, rank: 0 })]),
});

function go(): void {
  expect(port.onmessage).toBeTypeOf('function');
  port.onmessage!({
    data: {
      type: 'go',
      gen: 1,
      position: serialize(InitialPositionImproved.createInitialPosition()),
      tesu: 0,
      maxTimeMs: 1,
      quiescenceDepthMax: 1,
      nnue: true,
      student_enabled: true,
      rootPolicyRank: receipt,
      difficulty: 'medium',
    },
  });
}

beforeAll(async () => {
  vi.stubGlobal('self', scope);
  await import('@/components/game/ShogiImproved/shogi-ai-helper.worker');
  expect(scope.onmessage).toBeTypeOf('function');
  scope.onmessage!({
    data: {
      type: 'smpInit',
      port,
      sab: new SharedArrayBuffer(64),
      helperId: 0,
    },
  });
});

describe('shogi-ai-helper.worker root-policy gate', () => {
  it('consumes the main receipt without running another provider', () => {
    engine.setNnueAvailable(true);
    go();
    expect(engine.search.mock.lastCall?.[5]).toBe(receipt);
  });

  it('drops the receipt when this helper cannot enable the exact live NNUE', () => {
    engine.setNnueAvailable(false);
    go();
    expect(engine.search.mock.lastCall?.[5]).toBeNull();
  });

  // A helper's unfinished iteration is not discarded the way the main thread's
  // is — it lands in the shared transposition table the main thread reads on
  // the same move. Stopping a helper on the soft limit would therefore delete
  // useful work, so the helper must switch the soft limit off at startup.
  it('turns the soft time limit off for this helper', () => {
    expect(engine.setSoftTimeLimit).toHaveBeenCalledWith(false);
    expect(engine.setSoftTimeLimit.mock.calls.every(([on]) => on === false)).toBe(true);
  });
});
