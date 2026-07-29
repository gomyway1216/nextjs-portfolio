import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import {
  computeRootPolicyRanks,
  setRootPolicyRankProvider,
  type RootPolicyRankProvider,
} from '@/components/game/ShogiImproved/rootPolicyRank';
import {
  ROOT_POLICY_ADMISSION_FAULTS,
  ROOT_POLICY_ADMISSION_FAULT_PARENTS_PER_DOMAIN,
  ROOT_POLICY_ADMISSION_FIREWALL_PARENTS_PER_DOMAIN,
  ROOT_POLICY_ADMISSION_FIXTURE_COUNT,
  ROOT_POLICY_ADMISSION_NON_ROOT_PLIES,
  ROOT_POLICY_ADMISSION_REPEATS,
  ROOT_POLICY_ADMISSION_TT_OPERATIONS,
  ROOT_POLICY_ADMISSION_WARMUP_ROOTS,
  auditRootPolicyProductionSources,
  createSyntheticRootPolicyRankProvider,
  nearestRank,
  runRootPolicyRuntimeAdmission,
  type RootPolicyAdmissionFault,
  type RootPolicyAdmissionFixture,
  type RootPolicyAdmissionFirewallObservation,
  type RootPolicyAdmissionRootObservation,
  type RootPolicyAdmissionRuntime,
  type RootPolicyAdmissionStaticSource,
} from '@/components/game/ShogiImproved/rootPolicyRuntimeAdmission';
import {
  createWasmRootPolicyRankReceipt,
  getLastWasmRootPolicyRankDiagnostics,
} from '@/components/game/ShogiImproved/wasmEngine';

interface SyntheticFixturePayload {
  readonly index: number;
  readonly moveKeys: readonly number[];
}

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values.map((value) => value & 0xff));
}

function float32Bytes(values: readonly number[]): Uint8Array {
  const result = new Uint8Array(values.length * 4);
  const view = new DataView(result.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return result;
}

function fixtures(): readonly RootPolicyAdmissionFixture<SyntheticFixturePayload>[] {
  return Array.from({ length: ROOT_POLICY_ADMISSION_FIXTURE_COUNT }, (_, index) => ({
    id: `${index < 512 ? 'browser' : 'v9'}-${String(index).padStart(4, '0')}`,
    domain: index < 512 ? 'browser' : 'v9',
    payload: {
      index,
      moveKeys: [index * 8 + 1, index * 8 + 2, index * 8 + 3, index * 8 + 4],
    },
  }));
}

function stableState(fixture: RootPolicyAdmissionFixture<SyntheticFixturePayload>): Uint8Array {
  return bytes(
    fixture.payload.index,
    fixture.payload.index >>> 8,
    fixture.domain === 'browser' ? 0x42 : 0x56,
  );
}

function firewallObservation(
  fixture: RootPolicyAdmissionFixture<SyntheticFixturePayload>,
): RootPolicyAdmissionFirewallObservation {
  const stable = stableState(fixture);
  return {
    studentInferenceCalls: 0,
    tensorReads: 0,
    studentToEvaluatorFlows: 0,
    studentToTtFlows: 0,
    studentToUiFlows: 0,
    stableBytesBefore: stable,
    stableBytesAfter: stable.slice(),
  };
}

function createSyntheticRuntime(): RootPolicyAdmissionRuntime<SyntheticFixturePayload> {
  const rootObservation = (
    fixture: RootPolicyAdmissionFixture<SyntheticFixturePayload>,
    enabled: boolean,
    sequence: number,
    rankProvider: RootPolicyRankProvider,
    fault: RootPolicyAdmissionFault | null = null,
  ): RootPolicyAdmissionRootObservation => {
    const moveKeys = fixture.payload.moveKeys;
    const ranked =
      enabled && fault === null
        ? rankProvider({
            sequence,
            moves: [],
            moveKeys,
          })
        : null;
    const orderedMoveKeys =
      ranked === null
        ? [...moveKeys]
        : [...ranked]
            .sort((left, right) => left.rank - right.rank)
            .map((item) => item.moveKey);
    return {
      jsMoveKeys: moveKeys,
      wasmMoveKeys: moveKeys.slice(),
      orderedMoveKeys,
      combinedCpBytes:
        enabled && fault === null
          ? float32Bytes(moveKeys.map((moveKey) => (moveKey % 97) - 48))
          : bytes(),
      inferenceCalls: enabled && fault === null ? 1 : 0,
      tensorReads: enabled && fault === null ? 1 : 0,
      modelLoads: 1,
      incrementalMilliseconds: 1 + fixture.payload.index,
      completedDepths: [1, 2, 3, 4],
      rootRankAppliedDepths: [1, 2, 3, 4],
      nonRootStudentCalls: 0,
      studentToEvaluatorFlows: 0,
      studentToTtFlows: 0,
      studentToUiFlows: 0,
      preRootSearchStateBytes: stableState(fixture),
      typedFault: fault,
    };
  };

  return {
    staticSources: [
      {
        path: 'root-hook.ts',
        source: "import type { RootPolicyMoveRank } from './rootPolicyRank';",
        role: 'root-hook',
      },
      {
        path: 'tt.ts',
        source: 'export function probe(): number { return 0; }',
        role: 'tt',
      },
      {
        path: 'evaluator.ts',
        source: 'export function evaluate(): number { return 0; }',
        role: 'evaluator',
      },
    ],
    runRoot(fixture, request) {
      return rootObservation(
        fixture,
        request.enabled,
        request.sequence,
        request.rankProvider,
      );
    },
    probeNonRoot(fixture) {
      return firewallObservation(fixture);
    },
    probeTt(fixture) {
      return firewallObservation(fixture);
    },
    probeEvaluator(fixture) {
      return firewallObservation(fixture);
    },
    runFault(fixture, fault, _repeat, sequence) {
      return rootObservation(
        fixture,
        true,
        sequence,
        createSyntheticRootPolicyRankProvider(),
        fault,
      );
    },
  };
}

afterEach(() => setRootPolicyRankProvider(null));

describe('root-policy runtime admission harness', () => {
  it('runs the complete locked synthetic case table and leaves tensor admission pending', async () => {
    let clock = 0;
    const result = await runRootPolicyRuntimeAdmission({
      fixtures: fixtures(),
      runtime: createSyntheticRuntime(),
      rankProvider: createSyntheticRootPolicyRankProvider(),
      providerKind: 'synthetic',
      now: () => {
        clock += 0.25;
        return clock;
      },
    });

    expect(result).toMatchObject({
      schema: 'shogi-child-board-root-policy-runtime-admission-harness-result-v1',
      status: 'complete-synthetic-provider-tensor-specific-admission-pending',
      providerKind: 'synthetic',
      admitted: false,
      harnessChecksPassed: true,
      tensorSpecificAdmission: 'pending',
      fixtureCount: 1024,
      warmupRoots: 100,
      measuredRoots: 1024,
      repeats: 3,
      warmupInferenceCalls: 100,
      measuredRootInferenceCalls: 1024 * 3,
      rootInferenceCalls: 100 + 1024 * 3,
      disabledInferenceCalls: 0,
      nonRootStudentCalls: 0,
      studentToEvaluatorFlows: 0,
      studentToTtFlows: 0,
      studentToUiFlows: 0,
      faultsChecked:
        ROOT_POLICY_ADMISSION_FAULT_PARENTS_PER_DOMAIN *
        2 *
        ROOT_POLICY_ADMISSION_FAULTS.length *
        ROOT_POLICY_ADMISSION_REPEATS,
      failures: [],
      staticDependencyViolations: [],
      liveWeightsChanged: false,
      tuneOpened: false,
      sealedOpened: false,
    });
    expect(result.disabledByteParityReceipts).toHaveLength(1024);
    expect(result.determinismReceipts).toHaveLength(1024);
    expect(result.fixtureIdentityReceipt).toMatchObject({
      bytes: expect.any(Number),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(result.latency.rawIncrementalMilliseconds).toHaveLength(1024);
    expect(result.latency.rawEndToEndMilliseconds).toHaveLength(1024);
    expect(result.latency).toMatchObject({
      incrementalP50Milliseconds: 512,
      incrementalP95Milliseconds: 973,
      endToEndP50Milliseconds: 0.25,
      endToEndP95Milliseconds: 0.25,
    });

    // The case-table multipliers stay visible and locked in the test.
    expect(ROOT_POLICY_ADMISSION_WARMUP_ROOTS).toBe(100);
    expect(ROOT_POLICY_ADMISSION_FIREWALL_PARENTS_PER_DOMAIN).toBe(128);
    expect(ROOT_POLICY_ADMISSION_NON_ROOT_PLIES).toEqual([1, 2, 4, 8]);
    expect(ROOT_POLICY_ADMISSION_TT_OPERATIONS).toEqual([
      'probe',
      'exact',
      'lower',
      'upper',
      'replacement',
    ]);
  });

  it('uses one-indexed nearest-rank p50/p95 for all 1024 raw samples', () => {
    const values = Array.from({ length: 1024 }, (_, index) => index + 1);
    expect(nearestRank(values, 0.5)).toBe(512);
    expect(nearestRank(values, 0.95)).toBe(973);
    expect(nearestRank([], 0.95)).toBeNaN();
    expect(nearestRank([1, Number.NaN], 0.95)).toBeNaN();
  });

  it('rejects an incomplete fixture before invoking the runtime', async () => {
    const runtime = createSyntheticRuntime();
    let calls = 0;
    const original = runtime.runRoot;
    runtime.runRoot = (...args) => {
      calls++;
      return original(...args);
    };
    const result = await runRootPolicyRuntimeAdmission({
      fixtures: fixtures().slice(0, 1023),
      runtime,
      rankProvider: createSyntheticRootPolicyRankProvider(),
      providerKind: 'synthetic',
    });

    expect(result.harnessChecksPassed).toBe(false);
    expect(result.admitted).toBe(false);
    expect(result.failures).toContain('fixture-count:1023!=1024');
    expect(calls).toBe(0);
  });

  it('keeps the stable production WASM unenrolled before tensor-specific admission', () => {
    const position = InitialPositionImproved.createInitialPosition();
    const provider = createSyntheticRootPolicyRankProvider();
    setRootPolicyRankProvider(provider);
    const ranks = computeRootPolicyRanks(position, 991, true);
    expect(ranks).not.toBeNull();
    const receipt = createWasmRootPolicyRankReceipt(position, 991, ranks!);
    expect(receipt).toBeNull();
    expect(getLastWasmRootPolicyRankDiagnostics()).toBeNull();
  });

  it('fails closed for malformed synthetic ranks without changing stable order', () => {
    const position = InitialPositionImproved.createInitialPosition();
    setRootPolicyRankProvider(({ moveKeys }) =>
      moveKeys.map((moveKey) => ({ moveKey, rank: 0 })),
    );
    expect(computeRootPolicyRanks(position, 992, true)).toBeNull();

    setRootPolicyRankProvider(({ moveKeys }) =>
      moveKeys.map((moveKey, rank) => ({
        moveKey,
        rank: rank === moveKeys.length - 1 ? Number.NaN : rank,
      })),
    );
    expect(computeRootPolicyRanks(position, 993, true)).toBeNull();
  });
});

describe('root-policy production dependency firewall', () => {
  it('keeps MPS, PyTorch, training assets and root dataflow out of production TT/evaluator', () => {
    const root = process.cwd();
    const records: RootPolicyAdmissionStaticSource[] = [
      ['src/components/game/ShogiImproved/rootPolicyRank.ts', 'root-hook'],
      ['src/components/game/ShogiImproved/shogi-ai.worker.ts', 'worker'],
      ['src/components/game/ShogiImproved/shogi-ai-helper.worker.ts', 'worker'],
      ['src/components/game/ShogiImproved/wasmEngine.ts', 'wasm-wrapper'],
      ['wasm-spike/assembly/index.ts', 'wasm'],
      ['src/components/game/ShogiImproved/TranspositionTableImprovedPackedDual.ts', 'tt'],
      ['src/components/game/ShogiImproved/ShogiAIImprovedV20.ts', 'evaluator'],
    ].map(([path, role]) => ({
      path,
      role: role as RootPolicyAdmissionStaticSource['role'],
      source: readFileSync(join(root, path), 'utf8'),
    }));

    expect(auditRootPolicyProductionSources(records)).toEqual([]);
  });

  it('reports forbidden production dependencies and TT/evaluator dataflow', () => {
    expect(
      auditRootPolicyProductionSources([
        {
          path: 'runtime.ts',
          role: 'root-hook',
          source: "import torch from 'pytorch'; const model = 'teacher-checkpoint.pt';",
        },
        {
          path: 'tt.ts',
          role: 'tt',
          source: 'export function write(rootPolicyRank: number): void {}',
        },
      ]),
    ).toEqual([
      'runtime.ts: forbidden production dependency pytorch',
      "runtime.ts: forbidden training artifact reference 'teacher-checkpoint.pt'",
      'tt.ts: root-policy dataflow reached tt',
    ]);
  });
});
