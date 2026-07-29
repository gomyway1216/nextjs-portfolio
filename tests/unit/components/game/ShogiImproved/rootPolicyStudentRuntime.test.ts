import { createHash } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { MoveListImproved } from '@/components/game/ShogiImproved/MoveListImproved';
import {
  computeRootPolicyRanks,
  setRootPolicyRankProvider,
} from '@/components/game/ShogiImproved/rootPolicyRank';
import {
  ROOT_POLICY_STUDENT_MANIFEST_URL,
  ROOT_POLICY_STUDENT_PARAMETERS,
  ROOT_POLICY_STUDENT_PAYLOAD_BYTES,
  ROOT_POLICY_STUDENT_STATE_TENSOR_SHAPES,
  ROOT_POLICY_STUDENT_TENSOR_URL,
  createRootPolicyStudentRankProviderForTests,
  encodeRootPolicyStudentBoard,
  encodeRootPolicyStudentMove,
  ensureFrozenRootPolicyStudentLoaded,
  getRootPolicyStudentRuntimeDiagnostics,
  parseStrictRootPolicyStudentJson,
  resetRootPolicyStudentRuntimeForTests,
  stableRootPolicyStudentRanks,
  type RootPolicyStudentScorer,
} from '@/components/game/ShogiImproved/rootPolicyStudentRuntime';
import { SFU, Te } from '@/components/game/ShogiImproved/types';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const tensorBytes = new Uint8Array(ROOT_POLICY_STUDENT_PAYLOAD_BYTES);
let manifestText = '';
let manifestSha256 = '';

beforeAll(() => {
  let offset = 0;
  const tensors = Object.entries(ROOT_POLICY_STUDENT_STATE_TENSOR_SHAPES)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, shape]) => {
      const length = shape.reduce((product, value) => product * value, 1) * 4;
      const row = {
        name,
        shape,
        dtype: 'float32-le',
        offset,
        length,
        sha256: sha256(tensorBytes.subarray(offset, offset + length)),
      };
      offset += length;
      return row;
    });
  expect(offset).toBe(ROOT_POLICY_STUDENT_PAYLOAD_BYTES);
  manifestText = `${JSON.stringify({
    schema: 'shogi-child-board-root-policy-student-manifest-v1',
    model_schema: 'shogi-child-board-root-policy-student-v1',
    feature_version: 'dense-43-plane-shared-parent-child-livecp-root-v1',
    model_variant: 'shared-child16x2-residual-mlp-root-ordering-v1',
    parameters: ROOT_POLICY_STUDENT_PARAMETERS,
    format:
      'bytewise-utf8-name-order-contiguous-row-major-little-endian-float32-no-padding',
    payload: {
      path: '/fixture/student.f32.bin',
      bytes: tensorBytes.byteLength,
      sha256: sha256(tensorBytes),
    },
    tensors,
    protocol: { schema: 'fixture-protocol' },
    teacher_hashes: { seed42: 'a'.repeat(64), seed314159: 'b'.repeat(64) },
  })}\n`;
  manifestSha256 = sha256(new TextEncoder().encode(manifestText));
});

afterEach(() => {
  resetRootPolicyStudentRuntimeForTests();
  setRootPolicyRankProvider(null);
});

function fixtureFetcher(
  tensor = tensorBytes,
  manifest = manifestText,
) {
  return vi.fn(async (url: string) => {
    if (url === ROOT_POLICY_STUDENT_MANIFEST_URL) {
      return {
        ok: true,
        status: 200,
        text: async () => manifest,
        arrayBuffer: async () => new TextEncoder().encode(manifest).buffer,
      };
    }
    if (url === ROOT_POLICY_STUDENT_TENSOR_URL) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        arrayBuffer: async () => Uint8Array.from(tensor).buffer,
      };
    }
    return {
      ok: false,
      status: 404,
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  });
}

describe('frozen root-policy student feature parity', () => {
  it('matches the Python 43-plane and explicit move fixture', () => {
    const position = InitialPositionImproved.createInitialPosition();
    const planes = encodeRootPolicyStudentBoard(position, 0);
    const active = Array.from(planes.entries())
      .filter(([, value]) => value === 1)
      .map(([index]) => index);
    expect(active).toEqual([
      6, 15, 24, 33, 42, 51, 60, 69, 78, 89, 161, 179, 233, 269,
      305, 359, 377, 475, 502, 611, 1136, 1145, 1154, 1163, 1172,
      1181, 1190, 1199, 1208, 1215, 1287, 1305, 1359, 1395, 1431,
      1485, 1503, 1549, 1684, 1737,
    ]);
    expect(planes.slice(28 * 81, 42 * 81).every((value) => value === 0)).toBe(true);
    expect(planes.slice(42 * 81).every((value) => value === 0)).toBe(true);

    const moves = GenerateMovesImproved.generateLegalMovesPooled(
      position,
      new MoveListImproved(),
    );
    const move = moves.find(
      (candidate) => candidate.from === 0x77 && candidate.to === 0x76,
    );
    expect(move).toBeDefined();
    expect(encodeRootPolicyStudentMove(position, move!, 0)).toEqual({
      fromSquare: 60,
      toSquare: 59,
      movedPiece: 1,
      capturedPiece: 0,
      action: 0,
      deltaFile: 8,
      deltaRank: 7,
      selfKingRelation: 175,
      enemyKingRelation: 183,
      plyBucket: 0,
    });
  });

  it('matches Python score-descending and bytewise-USI tie ordering', () => {
    const moves = [
      new Te(SFU, 0x77, 0x76, false, 0),
      new Te(SFU, 0x27, 0x26, false, 0),
      new Te(SFU, 0x37, 0x36, false, 0),
    ];
    expect(
      stableRootPolicyStudentRanks(
        { moves, moveKeys: [701, 201, 301] },
        [10, 10, 20],
      ),
    ).toEqual([
      { moveKey: 301, rank: 0 },
      { moveKey: 201, rank: 1 },
      { moveKey: 701, rank: 2 },
    ]);
  });

  it('calls the scorer once at root and fails closed on scorer faults', () => {
    const position = InitialPositionImproved.createInitialPosition();
    const scoreRoot = vi.fn((_position, moves: readonly Te[], _gamePly, searchPly) => {
      expect(searchPly).toBe(0);
      return moves.map((_move, index) => index);
    });
    setRootPolicyRankProvider(
      createRootPolicyStudentRankProviderForTests({ scoreRoot }),
    );
    const ranks = computeRootPolicyRanks(position, 91, true, 32);
    expect(scoreRoot).toHaveBeenCalledTimes(1);
    expect(ranks).not.toBeNull();
    expect(ranks).toHaveLength(
      GenerateMovesImproved.generateLegalMovesPooled(
        position,
        new MoveListImproved(),
      ).length,
    );

    const scorer: RootPolicyStudentScorer = {
      scoreRoot() {
        throw new Error('fixture failure');
      },
    };
    setRootPolicyRankProvider(
      createRootPolicyStudentRankProviderForTests(scorer),
    );
    expect(computeRootPolicyRanks(position, 92, true, 0)).toBeNull();
  });
});

describe('frozen root-policy student asset loader', () => {
  it('strictly validates every tensor member before installing the model', async () => {
    const fetchAsset = fixtureFetcher();
    await expect(
      ensureFrozenRootPolicyStudentLoaded({
        fetchAsset,
        expectedManifestSha256: manifestSha256,
        digest: async (bytes) => sha256(bytes),
        evaluateLiveNnue: () => 0,
      }),
    ).resolves.toBe(true);
    expect(fetchAsset).toHaveBeenCalledTimes(2);
    expect(getRootPolicyStudentRuntimeDiagnostics()).toMatchObject({
      state: 'ready',
      fault: null,
      modelLoads: 1,
      tensorReads: 1,
      inferenceCalls: 0,
      manifest: {
        bytes: new TextEncoder().encode(manifestText).byteLength,
        sha256: manifestSha256,
      },
      tensor: {
        bytes: ROOT_POLICY_STUDENT_PAYLOAD_BYTES,
        sha256: sha256(tensorBytes),
      },
      liveNnue: {
        bytes: 1_185_988,
        sha256: 'e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc',
      },
    });
  });

  it('rejects duplicate manifest keys and returns a typed fail-closed state', async () => {
    const duplicate = '{"schema":1,"schema":2}';
    expect(() => parseStrictRootPolicyStudentJson(duplicate)).toThrow(
      /duplicate JSON key/u,
    );
    await expect(
      ensureFrozenRootPolicyStudentLoaded({
        fetchAsset: fixtureFetcher(tensorBytes, duplicate),
        expectedManifestSha256: sha256(new TextEncoder().encode(duplicate)),
        digest: async (bytes) => sha256(bytes),
      }),
    ).resolves.toBe(false);
    expect(getRootPolicyStudentRuntimeDiagnostics()).toMatchObject({
      state: 'faulted',
      fault: 'bad-manifest-sha',
      modelLoads: 0,
      tensorReads: 0,
      inferenceCalls: 0,
    });
  });

  it('rejects payload drift without installing or invoking a model', async () => {
    const tampered = Uint8Array.from(tensorBytes);
    tampered[0] = 1;
    await expect(
      ensureFrozenRootPolicyStudentLoaded({
        fetchAsset: fixtureFetcher(tampered),
        expectedManifestSha256: manifestSha256,
        digest: async (bytes) => sha256(bytes),
      }),
    ).resolves.toBe(false);
    expect(getRootPolicyStudentRuntimeDiagnostics()).toMatchObject({
      state: 'faulted',
      fault: 'bad-tensor-sha',
      modelLoads: 0,
      tensorReads: 1,
      inferenceCalls: 0,
    });
  });
});
