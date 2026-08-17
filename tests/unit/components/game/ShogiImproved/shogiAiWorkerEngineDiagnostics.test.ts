import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';

const fakeWeights = Uint8Array.from([0x73, 0x79, 0x6e, 0x74, 0x68, 0x65, 0x74, 0x69, 0x63]);

const engine = vi.hoisted(() => {
  let loaded = false;
  let enabled = false;
  let allowEnable = true;
  let fetched = new Uint8Array();
  return {
    load(bytes: Uint8Array): boolean {
      fetched = new Uint8Array(bytes);
      loaded = true;
      return true;
    },
    setEnabled(requested: boolean): boolean {
      enabled = requested && loaded && allowEnable;
      return enabled;
    },
    loaded: () => loaded,
    enabled: () => enabled,
    fetched: () => fetched,
    denyEnable: () => {
      allowEnable = false;
      enabled = false;
    },
  };
});

vi.mock('@/components/game/ShogiImproved/OpeningBookImproved', () => ({
  ensureExternalOpeningBookLoaded: vi.fn(async () => undefined),
  getOpeningMoveImproved: vi.fn(() => null),
}));

vi.mock('@/components/game/ShogiImproved/wasmEngine', () => ({
  NNUE_SCALE_K: 600,
  clearWasmRootPolicyRank: vi.fn(),
  clearWasmTT: vi.fn(),
  createWasmRootPolicyRankReceipt: vi.fn(() => null),
  enableSharedTT: vi.fn(() => false),
  getLastWasmSearchStats: vi.fn(() => ({ score: 42, depth: 7, nodes: 100, leaves: 50 })),
  isNnueEnabled: engine.enabled,
  isNnueWeightsLoaded: engine.loaded,
  isWasmEngineReady: vi.fn(() => true),
  loadNnueWeights: engine.load,
  measureEmbeddedWasmRuntimeIdentity: vi.fn(async () => ({
    bytes: 4,
    sha256: 'b'.repeat(64),
  })),
  publishSearchGeneration: vi.fn(),
  setSearchGeneration: vi.fn(),
  setWasmNnueEnabled: engine.setEnabled,
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
  searchPath?: string;
  diagnostics?: unknown;
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

function send(message: unknown): void {
  expect(scope.onmessage).toBeTypeOf('function');
  scope.onmessage!({ data: message });
}

async function response(type: string, id: number): Promise<PostedMessage> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const match = posted.find((message) => message.type === type && message.id === id);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`missing ${type} id=${id}`);
}

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () =>
        fakeWeights.buffer.slice(fakeWeights.byteOffset, fakeWeights.byteOffset + fakeWeights.byteLength),
    })),
  );
  vi.stubGlobal('self', scope);
  await import('@/components/game/ShogiImproved/shogi-ai.worker');
});

describe('shogi-ai.worker engine diagnostics', () => {
  it('proves fetched identity and distinguishes NNUE WASM from silent V3 WASM fallback', async () => {
    send({ type: 'engineDiagnostics', id: 901 });
    const startup = await response('engineDiagnosticsResult', 901);
    expect(engine.fetched()).toEqual(fakeWeights);
    expect(startup.diagnostics).toEqual({
      schema: 'shogi-ai-engine-diagnostics-v1',
      nnue: {
        fetchStatus: 'loaded',
        fetchedWeights: {
          bytes: fakeWeights.byteLength,
          sha256: createHash('sha256').update(fakeWeights).digest('hex'),
        },
        loaded: true,
        enabled: false,
      },
      wasm: {
        ready: true,
        embedded: { bytes: 4, sha256: 'b'.repeat(64) },
      },
      lastSearch: null,
    });

    const position = InitialPositionImproved.createInitialPosition();
    send({
      type: 'bestMove',
      id: 902,
      position: serialize(position),
      difficulty: 'hard',
      tesu: 0,
    });
    const nnueResult = await response('bestMoveResult', 902);
    expect(nnueResult).toMatchObject({ searchPath: 'wasm' });
    expect(Object.keys(nnueResult).sort()).toEqual(['depth', 'id', 'move', 'scoreCp', 'searchPath', 'type']);

    send({ type: 'engineDiagnostics', id: 903 });
    expect((await response('engineDiagnosticsResult', 903)).diagnostics).toMatchObject({
      nnue: { loaded: true, enabled: true },
      wasm: { ready: true },
      lastSearch: {
        requestId: 902,
        searchPath: 'wasm',
        evaluationPath: 'nnue-wasm',
      },
    });

    send({ type: 'clearTT' });
    engine.denyEnable();
    send({
      type: 'bestMove',
      id: 904,
      position: serialize(position),
      difficulty: 'hard',
      tesu: 0,
    });
    expect(await response('bestMoveResult', 904)).toMatchObject({ searchPath: 'wasm' });
    send({ type: 'engineDiagnostics', id: 905 });
    expect((await response('engineDiagnosticsResult', 905)).diagnostics).toMatchObject({
      nnue: { loaded: true, enabled: false },
      lastSearch: {
        requestId: 904,
        searchPath: 'wasm',
        evaluationPath: 'v3-wasm',
      },
    });
    send({ type: 'clearTT' });
  });
});
