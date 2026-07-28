import type {
  RootPolicyMoveRank,
  RootPolicyRankProvider,
} from './rootPolicyRank';

export const ROOT_POLICY_ADMISSION_FIXTURE_COUNT = 1024;
export const ROOT_POLICY_ADMISSION_BROWSER_FIXTURES = 512;
export const ROOT_POLICY_ADMISSION_V9_FIXTURES = 512;
export const ROOT_POLICY_ADMISSION_WARMUP_ROOTS = 100;
export const ROOT_POLICY_ADMISSION_REPEATS = 3;
export const ROOT_POLICY_ADMISSION_FIREWALL_PARENTS_PER_DOMAIN = 128;
export const ROOT_POLICY_ADMISSION_FAULT_PARENTS_PER_DOMAIN = 16;
export const ROOT_POLICY_ADMISSION_NON_ROOT_PLIES = Object.freeze([1, 2, 4, 8]);
export const ROOT_POLICY_ADMISSION_TT_OPERATIONS = Object.freeze([
  'probe',
  'exact',
  'lower',
  'upper',
  'replacement',
] as const);
export const ROOT_POLICY_ADMISSION_FAULTS = Object.freeze([
  'missing-tensor',
  'bad-tensor-sha',
  'bad-manifest-sha',
  'bad-shape',
  'nan-output',
  'wrong-feature-schema',
  'malformed-rank',
] as const);

export type RootPolicyAdmissionDomain = 'browser' | 'v9';
export type RootPolicyAdmissionTtOperation =
  (typeof ROOT_POLICY_ADMISSION_TT_OPERATIONS)[number];
export type RootPolicyAdmissionFault = (typeof ROOT_POLICY_ADMISSION_FAULTS)[number];

export interface RootPolicyAdmissionFixture<Payload = unknown> {
  readonly id: string;
  readonly domain: RootPolicyAdmissionDomain;
  readonly payload: Payload;
}

export interface RootPolicyByteReceipt {
  readonly bytes: number;
  readonly sha256: string;
}

export interface RootPolicyAdmissionRootObservation {
  /** Stable input order from the production JavaScript move generator. */
  readonly jsMoveKeys: readonly number[];
  /** Exact eager legal root universe observed by production WASM. */
  readonly wasmMoveKeys: readonly number[];
  /** Order returned to the search after the root hook. */
  readonly orderedMoveKeys: readonly number[];
  /** Raw little-endian float32 output bytes; empty while disabled/faulted. */
  readonly combinedCpBytes: Uint8Array;
  readonly inferenceCalls: number;
  readonly tensorReads: number;
  readonly modelLoads: number;
  readonly incrementalMilliseconds: number;
  /** Iterative depths completed by this root request. */
  readonly completedDepths: readonly number[];
  /** Depths at which the same root rank was applied. */
  readonly rootRankAppliedDepths: readonly number[];
  readonly nonRootStudentCalls: number;
  readonly studentToEvaluatorFlows: number;
  readonly studentToTtFlows: number;
  readonly studentToUiFlows: number;
  /** Search state immediately before the first root child search, excluding root order. */
  readonly preRootSearchStateBytes: Uint8Array;
  readonly typedFault: RootPolicyAdmissionFault | null;
}

export interface RootPolicyAdmissionFirewallObservation {
  readonly studentInferenceCalls: number;
  readonly tensorReads: number;
  readonly studentToEvaluatorFlows: number;
  readonly studentToTtFlows: number;
  readonly studentToUiFlows: number;
  readonly stableBytesBefore: Uint8Array;
  readonly stableBytesAfter: Uint8Array;
}

export interface RootPolicyAdmissionStaticSource {
  readonly path: string;
  readonly source: string;
  /**
   * TT/evaluator sources must contain no root-policy/student dataflow symbols.
   * Other production sources are checked for forbidden dependencies/assets.
   */
  readonly role: 'root-hook' | 'worker' | 'wasm-wrapper' | 'wasm' | 'tt' | 'evaluator';
}

export interface RootPolicyAdmissionRuntime<Payload = unknown> {
  readonly staticSources: readonly RootPolicyAdmissionStaticSource[];
  runRoot(
    fixture: RootPolicyAdmissionFixture<Payload>,
    request: {
      readonly enabled: boolean;
      readonly sequence: number;
      readonly repeat: number;
      readonly warmup: boolean;
      readonly rankProvider: RootPolicyRankProvider;
    },
  ): Promise<RootPolicyAdmissionRootObservation> | RootPolicyAdmissionRootObservation;
  probeNonRoot(
    fixture: RootPolicyAdmissionFixture<Payload>,
    ply: number,
    repeat: number,
  ): Promise<RootPolicyAdmissionFirewallObservation> | RootPolicyAdmissionFirewallObservation;
  probeTt(
    fixture: RootPolicyAdmissionFixture<Payload>,
    operation: RootPolicyAdmissionTtOperation,
    repeat: number,
  ): Promise<RootPolicyAdmissionFirewallObservation> | RootPolicyAdmissionFirewallObservation;
  probeEvaluator(
    fixture: RootPolicyAdmissionFixture<Payload>,
    repeat: number,
  ): Promise<RootPolicyAdmissionFirewallObservation> | RootPolicyAdmissionFirewallObservation;
  runFault(
    fixture: RootPolicyAdmissionFixture<Payload>,
    fault: RootPolicyAdmissionFault,
    repeat: number,
    sequence: number,
  ): Promise<RootPolicyAdmissionRootObservation> | RootPolicyAdmissionRootObservation;
}

export interface RootPolicyLatencySummary {
  readonly rawIncrementalMilliseconds: readonly number[];
  readonly rawEndToEndMilliseconds: readonly number[];
  readonly incrementalP50Milliseconds: number;
  readonly incrementalP95Milliseconds: number;
  readonly endToEndP50Milliseconds: number;
  readonly endToEndP95Milliseconds: number;
}

export interface RootPolicyRuntimeAdmissionResult {
  readonly schema: 'shogi-child-board-root-policy-runtime-admission-harness-result-v1';
  readonly status:
    | 'complete-synthetic-provider-tensor-specific-admission-pending'
    | 'complete-frozen-student-harness-pass'
    | 'runtime-admission-harness-failed';
  readonly providerKind: 'synthetic' | 'frozen-student';
  readonly admitted: false;
  readonly harnessChecksPassed: boolean;
  readonly tensorSpecificAdmission: 'pending' | 'harness-pass-awaiting-authorized-publication';
  readonly fixtureCount: number;
  readonly warmupRoots: number;
  readonly measuredRoots: number;
  readonly repeats: number;
  readonly fixtureIdentityReceipt: RootPolicyByteReceipt;
  readonly warmupInferenceCalls: number;
  readonly measuredRootInferenceCalls: number;
  readonly rootInferenceCalls: number;
  readonly disabledInferenceCalls: number;
  readonly nonRootStudentCalls: number;
  readonly studentToEvaluatorFlows: number;
  readonly studentToTtFlows: number;
  readonly studentToUiFlows: number;
  readonly disabledByteParityReceipts: readonly RootPolicyByteReceipt[];
  readonly determinismReceipts: readonly RootPolicyByteReceipt[];
  readonly latency: RootPolicyLatencySummary;
  readonly faultsChecked: number;
  readonly staticDependencyViolations: readonly string[];
  readonly failures: readonly string[];
  readonly liveWeightsChanged: false;
  readonly tuneOpened: false;
  readonly sealedOpened: false;
}

export interface RunRootPolicyRuntimeAdmissionOptions<Payload = unknown> {
  readonly fixtures: readonly RootPolicyAdmissionFixture<Payload>[];
  readonly runtime: RootPolicyAdmissionRuntime<Payload>;
  readonly rankProvider: RootPolicyRankProvider;
  readonly providerKind: 'synthetic' | 'frozen-student';
  /** Monotonic production clock; defaults to performance.now(). */
  readonly now?: () => number;
}

function mix32(value: number): number {
  let mixed = value | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

/**
 * Deterministic, tensor-free provider for plumbing/admission-harness tests.
 * It is intentionally not exported by or installed in the live worker.
 */
export function createSyntheticRootPolicyRankProvider(
  seed = 0x4f1bbcdc,
): RootPolicyRankProvider {
  return ({ moveKeys }) =>
    [...moveKeys]
      .sort((left, right) => {
        const mixed = mix32((left | 0) ^ (seed | 0)) - mix32((right | 0) ^ (seed | 0));
        return mixed || left - right;
      })
      .map((moveKey, rank): RootPolicyMoveRank => ({ moveKey, rank }));
}

function isI32(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff
  );
}

function i32Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setInt32(index * 4, value | 0, true));
  return bytes;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + 4 + part.byteLength, 0);
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setUint32(offset, part.byteLength, true);
    offset += 4;
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function byteReceipt(bytes: Uint8Array): Promise<RootPolicyByteReceipt> {
  // Copy into a fresh ArrayBuffer: callers may provide a SharedArrayBuffer
  // view, while Web Crypto's BufferSource contract intentionally excludes it.
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(bytes).buffer,
  );
  return {
    bytes: bytes.byteLength,
    sha256: Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join(''),
  };
}

export function nearestRank(
  values: readonly number[],
  percentile: number,
): number {
  if (
    values.length === 0 ||
    !Number.isFinite(percentile) ||
    percentile <= 0 ||
    percentile > 1 ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    return Number.NaN;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

function exactPermutation(
  input: readonly number[],
  candidate: readonly number[],
): boolean {
  if (
    input.length === 0 ||
    input.length !== candidate.length ||
    input.some((value) => !isI32(value) || value === 0)
  ) {
    return false;
  }
  const inputSet = new Set(input);
  return (
    inputSet.size === input.length &&
    candidate.every((value) => inputSet.has(value)) &&
    new Set(candidate).size === candidate.length
  );
}

function selectFixtureSubset<Payload>(
  fixtures: readonly RootPolicyAdmissionFixture<Payload>[],
  perDomain: number,
): readonly RootPolicyAdmissionFixture<Payload>[] {
  return [
    ...fixtures.filter((fixture) => fixture.domain === 'browser').slice(0, perDomain),
    ...fixtures.filter((fixture) => fixture.domain === 'v9').slice(0, perDomain),
  ];
}

function importSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  const pattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]);
  return specifiers;
}

export function auditRootPolicyProductionSources(
  sources: readonly RootPolicyAdmissionStaticSource[],
): readonly string[] {
  const violations: string[] = [];
  const forbiddenDependency =
    /(?:^|[/_-])(?:ml|train(?:ing)?|pytorch|torch|mps)(?:$|[/_.-])/iu;
  const forbiddenArtifact = /(?:\.pt|\.pth|teacher[-_.]checkpoint)/iu;
  const rootDataflow =
    /\b(?:rootPolicy\w*|root_policy\w*|student(?:Cp|Value|Score|Buffer)\w*)\b/u;

  for (const record of sources) {
    for (const specifier of importSpecifiers(record.source)) {
      if (forbiddenDependency.test(specifier)) {
        violations.push(`${record.path}: forbidden production dependency ${specifier}`);
      }
    }
    const stringLiterals = record.source.match(/['"`][^'"`\r\n]*['"`]/gu) ?? [];
    for (const literal of stringLiterals) {
      if (forbiddenArtifact.test(literal)) {
        violations.push(`${record.path}: forbidden training artifact reference ${literal}`);
      }
    }
    if (
      (record.role === 'tt' || record.role === 'evaluator') &&
      rootDataflow.test(record.source)
    ) {
      violations.push(`${record.path}: root-policy dataflow reached ${record.role}`);
    }
  }
  return Object.freeze(violations);
}

function validateFixtureContract<Payload>(
  fixtures: readonly RootPolicyAdmissionFixture<Payload>[],
): readonly string[] {
  const failures: string[] = [];
  if (fixtures.length !== ROOT_POLICY_ADMISSION_FIXTURE_COUNT) {
    failures.push(
      `fixture-count:${fixtures.length}!=${ROOT_POLICY_ADMISSION_FIXTURE_COUNT}`,
    );
  }
  if (
    fixtures.filter((fixture) => fixture.domain === 'browser').length !==
    ROOT_POLICY_ADMISSION_BROWSER_FIXTURES
  ) {
    failures.push('browser-fixture-count');
  }
  if (
    fixtures.filter((fixture) => fixture.domain === 'v9').length !==
    ROOT_POLICY_ADMISSION_V9_FIXTURES
  ) {
    failures.push('v9-fixture-count');
  }
  if (
    fixtures.some((fixture) => !fixture.id) ||
    new Set(fixtures.map((fixture) => fixture.id)).size !== fixtures.length
  ) {
    failures.push('fixture-id-uniqueness');
  }
  return failures;
}

function validateFirewall(
  label: string,
  observation: RootPolicyAdmissionFirewallObservation,
  failures: string[],
): void {
  if (observation.studentInferenceCalls !== 0) failures.push(`${label}:student-inference`);
  if (observation.tensorReads !== 0) failures.push(`${label}:tensor-read`);
  if (observation.studentToEvaluatorFlows !== 0) failures.push(`${label}:evaluator-flow`);
  if (observation.studentToTtFlows !== 0) failures.push(`${label}:tt-flow`);
  if (observation.studentToUiFlows !== 0) failures.push(`${label}:ui-flow`);
  if (!equalBytes(observation.stableBytesBefore, observation.stableBytesAfter)) {
    failures.push(`${label}:stable-bytes`);
  }
}

/**
 * Executes the locked runtime-admission case table without publishing or
 * activating anything. A synthetic-provider run can validate plumbing only:
 * it always returns admitted=false and leaves tensor-specific admission
 * pending.
 */
export async function runRootPolicyRuntimeAdmission<Payload>(
  options: RunRootPolicyRuntimeAdmissionOptions<Payload>,
): Promise<RootPolicyRuntimeAdmissionResult> {
  const { fixtures, runtime, rankProvider, providerKind } = options;
  const now = options.now ?? (() => performance.now());
  const failures = [...validateFixtureContract(fixtures)];
  const staticDependencyViolations = auditRootPolicyProductionSources(
    runtime.staticSources,
  );
  failures.push(...staticDependencyViolations);

  let sequence = 1;
  let warmupInferenceCalls = 0;
  let measuredRootInferenceCalls = 0;
  let rootInferenceCalls = 0;
  let disabledInferenceCalls = 0;
  let nonRootStudentCalls = 0;
  let studentToEvaluatorFlows = 0;
  let studentToTtFlows = 0;
  let studentToUiFlows = 0;
  let faultsChecked = 0;
  const rawIncrementalMilliseconds: number[] = [];
  const rawEndToEndMilliseconds: number[] = [];
  const disabledByteParityReceipts: RootPolicyByteReceipt[] = [];
  const determinismReceipts: RootPolicyByteReceipt[] = [];
  const fixtureIdentityReceipt = await byteReceipt(
    new TextEncoder().encode(
      JSON.stringify(fixtures.map((fixture) => [fixture.domain, fixture.id])),
    ),
  );

  if (failures.length === 0) {
    for (let index = 0; index < ROOT_POLICY_ADMISSION_WARMUP_ROOTS; index++) {
      let providerCalls = 0;
      const observation = await runtime.runRoot(fixtures[index], {
        enabled: true,
        sequence: sequence++,
        repeat: 0,
        warmup: true,
        rankProvider: (input) => {
          providerCalls++;
          return rankProvider(input);
        },
      });
      warmupInferenceCalls += observation.inferenceCalls;
      rootInferenceCalls += observation.inferenceCalls;
      if (observation.inferenceCalls !== 1 || providerCalls !== 1) {
        failures.push(`warmup:${index}:inference-count`);
      }
      if (!exactPermutation(observation.jsMoveKeys, observation.orderedMoveKeys)) {
        failures.push(`warmup:${index}:root-permutation`);
      }
    }

    for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex++) {
      const fixture = fixtures[fixtureIndex];
      const enabled: RootPolicyAdmissionRootObservation[] = [];
      const disabled: RootPolicyAdmissionRootObservation[] = [];
      for (let repeat = 0; repeat < ROOT_POLICY_ADMISSION_REPEATS; repeat++) {
        let enabledProviderCalls = 0;
        const start = now();
        const enabledObservation = await runtime.runRoot(fixture, {
          enabled: true,
          sequence: sequence++,
          repeat,
          warmup: false,
          rankProvider: (input) => {
            enabledProviderCalls++;
            return rankProvider(input);
          },
        });
        const stop = now();
        enabled.push(enabledObservation);
        measuredRootInferenceCalls += enabledObservation.inferenceCalls;
        rootInferenceCalls += enabledObservation.inferenceCalls;
        nonRootStudentCalls += enabledObservation.nonRootStudentCalls;
        studentToEvaluatorFlows += enabledObservation.studentToEvaluatorFlows;
        studentToTtFlows += enabledObservation.studentToTtFlows;
        studentToUiFlows += enabledObservation.studentToUiFlows;
        if (repeat === 0) {
          rawIncrementalMilliseconds.push(enabledObservation.incrementalMilliseconds);
          rawEndToEndMilliseconds.push(stop - start);
        }
        if (enabledProviderCalls !== 1) {
          failures.push(`${fixture.id}:enabled-provider-count:${repeat}`);
        }

        let disabledProviderCalls = 0;
        const disabledObservation = await runtime.runRoot(fixture, {
          enabled: false,
          sequence: sequence++,
          repeat,
          warmup: false,
          rankProvider: (input) => {
            disabledProviderCalls++;
            return rankProvider(input);
          },
        });
        disabled.push(disabledObservation);
        disabledInferenceCalls += disabledObservation.inferenceCalls;
        if (disabledProviderCalls !== 0) {
          failures.push(`${fixture.id}:disabled-provider-count:${repeat}`);
        }
      }

      const firstEnabled = enabled[0];
      const firstDisabled = disabled[0];
      if (!exactPermutation(firstEnabled.jsMoveKeys, firstEnabled.wasmMoveKeys)) {
        failures.push(`${fixture.id}:js-wasm-move-universe`);
      }
      if (!exactPermutation(firstEnabled.jsMoveKeys, firstEnabled.orderedMoveKeys)) {
        failures.push(`${fixture.id}:enabled-root-permutation`);
      }
      if (enabled.some((observation) => observation.inferenceCalls !== 1)) {
        failures.push(`${fixture.id}:enabled-inference-count`);
      }
      if (
        enabled.some(
          (observation) =>
            observation.typedFault !== null ||
            observation.completedDepths.length < 2 ||
            observation.completedDepths.some(
              (depth, index) =>
                !Number.isInteger(depth) ||
                depth <= 0 ||
                (index > 0 && depth <= observation.completedDepths[index - 1]),
            ) ||
            !equalBytes(
              i32Bytes(observation.completedDepths),
              i32Bytes(observation.rootRankAppliedDepths),
            ),
        )
      ) {
        failures.push(`${fixture.id}:iterative-root-apply`);
      }
      if (
        disabled.some(
          (observation) =>
            observation.inferenceCalls !== 0 ||
            observation.tensorReads !== 0 ||
            observation.typedFault !== null ||
            !equalBytes(
              i32Bytes(observation.jsMoveKeys),
              i32Bytes(observation.orderedMoveKeys),
            ),
        )
      ) {
        failures.push(`${fixture.id}:disabled-stable-order`);
      }
      if (
        enabled.some(
          (observation) =>
            !equalBytes(
              observation.preRootSearchStateBytes,
              firstDisabled.preRootSearchStateBytes,
            ),
        )
      ) {
        failures.push(`${fixture.id}:pre-root-search-state`);
      }

      const enabledReceiptBytes = enabled.map((observation) =>
        concatBytes([
          i32Bytes(observation.jsMoveKeys),
          i32Bytes(observation.orderedMoveKeys),
          observation.combinedCpBytes,
          i32Bytes([
            observation.inferenceCalls,
            observation.modelLoads,
            observation.tensorReads,
          ]),
        ]),
      );
      if (
        enabledReceiptBytes.some((bytes) => !equalBytes(bytes, enabledReceiptBytes[0]))
      ) {
        failures.push(`${fixture.id}:determinism`);
      }
      determinismReceipts.push(await byteReceipt(enabledReceiptBytes[0]));

      const disabledReceiptBytes = disabled.map((observation) =>
        concatBytes([
          i32Bytes(observation.jsMoveKeys),
          i32Bytes(observation.orderedMoveKeys),
          observation.preRootSearchStateBytes,
        ]),
      );
      if (
        disabledReceiptBytes.some((bytes) => !equalBytes(bytes, disabledReceiptBytes[0]))
      ) {
        failures.push(`${fixture.id}:disabled-byte-parity`);
      }
      disabledByteParityReceipts.push(await byteReceipt(disabledReceiptBytes[0]));
    }

    const firewallFixtures = selectFixtureSubset(
      fixtures,
      ROOT_POLICY_ADMISSION_FIREWALL_PARENTS_PER_DOMAIN,
    );
    for (const fixture of firewallFixtures) {
      for (let repeat = 0; repeat < ROOT_POLICY_ADMISSION_REPEATS; repeat++) {
        for (const ply of ROOT_POLICY_ADMISSION_NON_ROOT_PLIES) {
          const observation = await runtime.probeNonRoot(fixture, ply, repeat);
          nonRootStudentCalls += observation.studentInferenceCalls;
          studentToEvaluatorFlows += observation.studentToEvaluatorFlows;
          studentToTtFlows += observation.studentToTtFlows;
          studentToUiFlows += observation.studentToUiFlows;
          validateFirewall(`${fixture.id}:non-root:${ply}:${repeat}`, observation, failures);
        }
        for (const operation of ROOT_POLICY_ADMISSION_TT_OPERATIONS) {
          const observation = await runtime.probeTt(fixture, operation, repeat);
          nonRootStudentCalls += observation.studentInferenceCalls;
          studentToEvaluatorFlows += observation.studentToEvaluatorFlows;
          studentToTtFlows += observation.studentToTtFlows;
          studentToUiFlows += observation.studentToUiFlows;
          validateFirewall(`${fixture.id}:tt:${operation}:${repeat}`, observation, failures);
        }
        const evaluator = await runtime.probeEvaluator(fixture, repeat);
        nonRootStudentCalls += evaluator.studentInferenceCalls;
        studentToEvaluatorFlows += evaluator.studentToEvaluatorFlows;
        studentToTtFlows += evaluator.studentToTtFlows;
        studentToUiFlows += evaluator.studentToUiFlows;
        validateFirewall(`${fixture.id}:evaluator:${repeat}`, evaluator, failures);
      }
    }

    const faultFixtures = selectFixtureSubset(
      fixtures,
      ROOT_POLICY_ADMISSION_FAULT_PARENTS_PER_DOMAIN,
    );
    for (const fixture of faultFixtures) {
      for (const fault of ROOT_POLICY_ADMISSION_FAULTS) {
        for (let repeat = 0; repeat < ROOT_POLICY_ADMISSION_REPEATS; repeat++) {
          const observation = await runtime.runFault(
            fixture,
            fault,
            repeat,
            sequence++,
          );
          faultsChecked++;
          studentToEvaluatorFlows += observation.studentToEvaluatorFlows;
          studentToTtFlows += observation.studentToTtFlows;
          studentToUiFlows += observation.studentToUiFlows;
          if (
            observation.typedFault !== fault ||
            !equalBytes(
              i32Bytes(observation.jsMoveKeys),
              i32Bytes(observation.orderedMoveKeys),
            ) ||
            observation.combinedCpBytes.byteLength !== 0 ||
            observation.studentToEvaluatorFlows !== 0 ||
            observation.studentToTtFlows !== 0 ||
            observation.studentToUiFlows !== 0
          ) {
            failures.push(`${fixture.id}:fault:${fault}:${repeat}`);
          }
        }
      }
    }
  }

  if (
    rawIncrementalMilliseconds.length !== ROOT_POLICY_ADMISSION_FIXTURE_COUNT ||
    rawEndToEndMilliseconds.length !== ROOT_POLICY_ADMISSION_FIXTURE_COUNT
  ) {
    failures.push('latency-sample-count');
  }
  if (
    rawIncrementalMilliseconds.some(
      (duration) => !Number.isFinite(duration) || duration < 0,
    ) ||
    rawEndToEndMilliseconds.some(
      (duration) => !Number.isFinite(duration) || duration < 0,
    )
  ) {
    failures.push('latency-sample-invalid');
  }
  if (disabledInferenceCalls !== 0) failures.push('disabled-inference-total');
  if (nonRootStudentCalls !== 0) failures.push('non-root-student-total');
  if (studentToEvaluatorFlows !== 0) failures.push('student-evaluator-flow-total');
  if (studentToTtFlows !== 0) failures.push('student-tt-flow-total');
  if (studentToUiFlows !== 0) failures.push('student-ui-flow-total');

  const harnessChecksPassed = failures.length === 0;
  const status = !harnessChecksPassed
    ? 'runtime-admission-harness-failed'
    : providerKind === 'synthetic'
      ? 'complete-synthetic-provider-tensor-specific-admission-pending'
      : 'complete-frozen-student-harness-pass';

  return Object.freeze({
    schema: 'shogi-child-board-root-policy-runtime-admission-harness-result-v1',
    status,
    providerKind,
    admitted: false,
    harnessChecksPassed,
    tensorSpecificAdmission:
      providerKind === 'synthetic'
        ? 'pending'
        : 'harness-pass-awaiting-authorized-publication',
    fixtureCount: fixtures.length,
    warmupRoots: ROOT_POLICY_ADMISSION_WARMUP_ROOTS,
    measuredRoots: rawIncrementalMilliseconds.length,
    repeats: ROOT_POLICY_ADMISSION_REPEATS,
    fixtureIdentityReceipt,
    warmupInferenceCalls,
    measuredRootInferenceCalls,
    rootInferenceCalls,
    disabledInferenceCalls,
    nonRootStudentCalls,
    studentToEvaluatorFlows,
    studentToTtFlows,
    studentToUiFlows,
    disabledByteParityReceipts: Object.freeze(disabledByteParityReceipts),
    determinismReceipts: Object.freeze(determinismReceipts),
    latency: Object.freeze({
      rawIncrementalMilliseconds: Object.freeze(rawIncrementalMilliseconds),
      rawEndToEndMilliseconds: Object.freeze(rawEndToEndMilliseconds),
      incrementalP50Milliseconds: nearestRank(rawIncrementalMilliseconds, 0.5),
      incrementalP95Milliseconds: nearestRank(rawIncrementalMilliseconds, 0.95),
      endToEndP50Milliseconds: nearestRank(rawEndToEndMilliseconds, 0.5),
      endToEndP95Milliseconds: nearestRank(rawEndToEndMilliseconds, 0.95),
    }),
    faultsChecked,
    staticDependencyViolations,
    failures: Object.freeze(failures),
    liveWeightsChanged: false,
    tuneOpened: false,
    sealedOpened: false,
  });
}
