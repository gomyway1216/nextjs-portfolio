import { beforeAll, describe, expect, it, vi } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';

const engine = vi.hoisted(() => {
  let loaded = false;
  let enabled = false;
  return {
    load: () => {
      loaded = true;
      return true;
    },
    loaded: () => loaded,
    enabled: () => enabled,
    enable: (requested: boolean) => {
      enabled = requested && loaded;
      return enabled;
    },
  };
});

vi.mock('@/components/game/ShogiImproved/OpeningBookImproved', () => ({
  ensureExternalOpeningBookLoaded: vi.fn(async () => undefined),
  getOpeningMoveImproved: vi.fn(() => null),
}));

vi.mock('@/components/game/ShogiImproved/wasmEngine', () => ({
  clearWasmTT: vi.fn(),
  enableSharedTT: vi.fn(() => false),
  getLastWasmSearchStats: vi.fn(() => ({ score: 1, depth: 1, nodes: 1, leaves: 1 })),
  isNnueEnabled: engine.enabled,
  isNnueWeightsLoaded: engine.loaded,
  isWasmEngineReady: vi.fn(() => true),
  loadNnueWeights: engine.load,
  measureEmbeddedWasmRuntimeIdentity: vi.fn(async () => {
    await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array([1]));
    return { bytes: 1, sha256: '0'.repeat(64) };
  }),
  publishSearchGeneration: vi.fn(),
  setSearchGeneration: vi.fn(),
  setWasmNnueEnabled: engine.enable,
  wasmSearchBestMove: vi.fn(() => ({
    koma: 1,
    from: 0x77,
    to: 0x76,
    promote: false,
    capture: 0,
  })),
}));

type PostedMessage = {
  type: string;
  id?: number;
  message?: string;
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

async function response(type: string, id: number): Promise<PostedMessage> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = posted.find((message) => message.type === type && message.id === id);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`missing ${type} id=${id}`);
}

beforeAll(async () => {
  const acceptedBytes = Uint8Array.from([1, 2, 3, 4]);
  vi.stubGlobal(
    'crypto',
    {
      subtle: {
        digest: vi.fn(async () => {
          throw new Error('forced SHA-256 failure');
        }),
      },
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () =>
        acceptedBytes.buffer.slice(
          acceptedBytes.byteOffset,
          acceptedBytes.byteOffset + acceptedBytes.byteLength,
        ),
    })),
  );
  vi.stubGlobal('self', scope);
  await import('@/components/game/ShogiImproved/shogi-ai.worker');
});

describe('shogi-ai.worker diagnostics crypto failure', () => {
  it('fails only the opt-in diagnostic and keeps the ordinary bestMove shape and behavior', async () => {
    expect(scope.onmessage).toBeTypeOf('function');
    scope.onmessage!({ data: { type: 'engineDiagnostics', id: 971 } });
    expect(await response('error', 971)).toMatchObject({
      message: 'forced SHA-256 failure',
    });

    const position = InitialPositionImproved.createInitialPosition();
    scope.onmessage!({
      data: {
        type: 'bestMove',
        id: 972,
        position: serialize(position),
        difficulty: 'hard',
        tesu: 0,
      },
    });
    const result = await response('bestMoveResult', 972);
    expect(Object.keys(result).sort()).toEqual(['depth', 'id', 'move', 'scoreCp', 'searchPath', 'type']);
    scope.onmessage!({ data: { type: 'clearTT' } });
  });
});
