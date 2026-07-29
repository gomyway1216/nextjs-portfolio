import { beforeAll, describe, expect, it, vi } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';

const boundary = vi.hoisted(() => {
  let nnueAvailable = true;
  const receipt = Object.freeze({
    schema: 'shogi-root-policy-rank-receipt-v1' as const,
    sequence: 1,
    positionHashA: 11,
    positionHashB: 22,
    moveCount: 1,
    ranks: Object.freeze([Object.freeze({ moveKey: 33, rank: 0 })]),
  });
  return {
    compute: vi.fn(() => receipt.ranks),
    create: vi.fn(() => receipt),
    search: vi.fn((..._args: unknown[]) => ({
      koma: 17,
      from: 0x77,
      to: 0x76,
      promote: false,
      capture: 0,
    })),
    setNnueEnabled: vi.fn((requested: boolean) => requested && nnueAvailable),
    setNnueAvailable(available: boolean) {
      nnueAvailable = available;
    },
    isNnueAvailable() {
      return nnueAvailable;
    },
    receipt,
  };
});

vi.mock('@/components/game/ShogiImproved/OpeningBookImproved', () => ({
  ensureExternalOpeningBookLoaded: vi.fn(async () => undefined),
  getOpeningMoveImproved: vi.fn(() => null),
}));

vi.mock('@/components/game/ShogiImproved/rootPolicyRank', () => ({
  computeRootPolicyRanks: boundary.compute,
}));

vi.mock('@/components/game/ShogiImproved/rootPolicyStudentRuntime', () => ({
  ensureFrozenRootPolicyStudentLoaded: vi.fn(async () => true),
}));

vi.mock('@/components/game/ShogiImproved/wasmEngine', () => ({
  clearWasmRootPolicyRank: vi.fn(),
  clearWasmTT: vi.fn(),
  createWasmRootPolicyRankReceipt: boundary.create,
  enableSharedTT: vi.fn(() => true),
  getLastWasmSearchStats: vi.fn(() => ({
    score: 1,
    depth: 2,
    nodes: 3,
    leaves: 4,
  })),
  isNnueEnabled: vi.fn(() => false),
  isNnueWeightsLoaded: vi.fn(() => boundary.isNnueAvailable()),
  isWasmEngineReady: vi.fn(() => false),
  loadNnueWeights: vi.fn(() => false),
  measureEmbeddedWasmRuntimeIdentity: vi.fn(async () => ({
    bytes: 1,
    sha256: '0'.repeat(64),
  })),
  publishSearchGeneration: vi.fn(),
  setSearchGeneration: vi.fn(),
  setWasmNnueEnabled: boundary.setNnueEnabled,
  wasmSearchBestMove: boundary.search,
}));

type Posted = { type: string; id?: number; move?: unknown };
const posted: Posted[] = [];
const scope = {
  postMessage: (message: Posted) => posted.push(message),
  onmessage: null as ((event: { data: unknown }) => void) | null,
};

function serialize(k: KyokumenImproved) {
  const board: number[] = [];
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) board.push(k.ban[(suji << 4) + dan]);
  }
  return { board, hand: [...k.hand], teban: k.teban };
}

async function send(data: unknown): Promise<void> {
  expect(scope.onmessage).toBeTypeOf('function');
  scope.onmessage!({ data });
  await vi.waitFor(() => {
    if (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === 'bestMove' &&
      'id' in data
    ) {
      expect(posted.some((message) => message.id === data.id)).toBe(true);
    }
  });
}

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
  vi.stubGlobal('self', scope);
  await import('@/components/game/ShogiImproved/shogi-ai.worker');
});

describe('shogi-ai.worker root-policy SMP boundary', () => {
  it('infers once in main and distributes the identical receipt to every helper', async () => {
    const helperMessages: unknown[][] = [[], [], []];
    const ports = helperMessages.map((messages) => ({
      onmessage: null,
      postMessage: (message: unknown) => messages.push(message),
    }));
    await send({
      type: 'smpThreads',
      sab: new SharedArrayBuffer(64),
      ports,
    });

    const position = InitialPositionImproved.createInitialPosition();
    await send({
      type: 'bestMove',
      id: 701,
      position: serialize(position),
      difficulty: 'medium',
      tesu: 0,
      student_enabled: true,
    });

    expect(boundary.compute).toHaveBeenCalledTimes(1);
    expect(boundary.create).toHaveBeenCalledTimes(1);
    expect(boundary.search).toHaveBeenCalledTimes(1);
    expect(boundary.search.mock.calls[0][5]).toBe(boundary.receipt);
    for (const messages of helperMessages) {
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'go',
        student_enabled: true,
        rootPolicyRank: boundary.receipt,
      });
    }

    send({
      type: 'bestMove',
      id: 702,
      position: serialize(position),
      difficulty: 'medium',
      tesu: 0,
      student_enabled: false,
    });
    expect(boundary.compute).toHaveBeenCalledTimes(1);
    expect(boundary.create).toHaveBeenCalledTimes(1);
    expect(boundary.search.mock.calls[1][5]).toBeNull();

    const enabledMove = posted.find((message) => message.id === 701)?.move;
    const disabledMove = posted.find((message) => message.id === 702)?.move;
    expect(disabledMove).toEqual(enabledMove);
  });

  it('calls no provider for easy or when the exact live NNUE is unavailable', async () => {
    const position = InitialPositionImproved.createInitialPosition();
    const callsBefore = boundary.compute.mock.calls.length;

    boundary.setNnueAvailable(false);
    await send({
      type: 'bestMove',
      id: 703,
      position: serialize(position),
      difficulty: 'medium',
      tesu: 0,
      student_enabled: true,
    });
    expect(boundary.compute).toHaveBeenCalledTimes(callsBefore);
    expect(boundary.search.mock.lastCall?.[5]).toBeNull();

    boundary.setNnueAvailable(true);
    await send({
      type: 'bestMove',
      id: 704,
      position: serialize(position),
      difficulty: 'easy',
      tesu: 0,
      student_enabled: true,
    });
    expect(boundary.compute).toHaveBeenCalledTimes(callsBefore);
    expect(boundary.search.mock.lastCall?.[5]).toBeNull();

    const disabledMove = posted.find((message) => message.id === 702)?.move;
    expect(posted.find((message) => message.id === 703)?.move).toEqual(disabledMove);
    expect(posted.find((message) => message.id === 704)?.move).toEqual(disabledMove);
  });
});
