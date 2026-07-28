import { beforeAll, describe, expect, it, vi } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';

const engine = vi.hoisted(() => {
  let nnueAvailable = true;
  return {
    search: vi.fn((..._args: unknown[]) => null),
    setNnue: vi.fn((requested: boolean) => requested && nnueAvailable),
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
});
