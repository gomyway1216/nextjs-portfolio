import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/game/ShogiImproved/OpeningBookImproved', () => ({
  ensureExternalOpeningBookLoaded: vi.fn(async () => undefined),
  getOpeningMoveImproved: vi.fn(() => null),
}));

vi.mock('@/components/game/ShogiImproved/wasmEngine', () => ({
  clearWasmRootPolicyRank: vi.fn(),
  clearWasmTT: vi.fn(),
  createWasmRootPolicyRankReceipt: vi.fn(() => null),
  enableSharedTT: vi.fn(() => false),
  getLastWasmSearchStats: vi.fn(() => null),
  isNnueEnabled: vi.fn(() => false),
  isNnueWeightsLoaded: vi.fn(() => false),
  isWasmEngineReady: vi.fn(() => true),
  loadNnueWeights: vi.fn(() => false),
  measureEmbeddedWasmRuntimeIdentity: vi.fn(async () => ({
    bytes: 4,
    sha256: 'c'.repeat(64),
  })),
  publishSearchGeneration: vi.fn(),
  setSearchGeneration: vi.fn(),
  setWasmNnueEnabled: vi.fn(() => false),
  wasmSearchBestMove: vi.fn(() => null),
}));

type PostedMessage = {
  type: string;
  id?: number;
  diagnostics?: unknown;
};

const posted: PostedMessage[] = [];
const scope = {
  postMessage: (message: PostedMessage) => posted.push(message),
  onmessage: null as ((event: { data: unknown }) => void) | null,
};

async function diagnostic(id: number): Promise<PostedMessage> {
  expect(scope.onmessage).toBeTypeOf('function');
  scope.onmessage!({ data: { type: 'engineDiagnostics', id } });
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = posted.find((message) => message.type === 'engineDiagnosticsResult' && message.id === id);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`missing diagnostics id=${id}`);
}

beforeAll(async () => {
  const rejectedBytes = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () =>
        rejectedBytes.buffer.slice(
          rejectedBytes.byteOffset,
          rejectedBytes.byteOffset + rejectedBytes.byteLength,
        ),
    })),
  );
  vi.stubGlobal('self', scope);
  await import('@/components/game/ShogiImproved/shogi-ai.worker');
});

describe('shogi-ai.worker rejected NNUE diagnostics', () => {
  it('reports rejection without retaining or hashing rejected bytes', async () => {
    expect((await diagnostic(951)).diagnostics).toEqual({
      schema: 'shogi-ai-engine-diagnostics-v1',
      nnue: {
        fetchStatus: 'rejected',
        fetchedWeights: null,
        loaded: false,
        enabled: false,
      },
      wasm: {
        ready: true,
        embedded: { bytes: 4, sha256: 'c'.repeat(64) },
      },
      lastSearch: null,
    });
  });
});
