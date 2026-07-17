import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  FLOODGATE_ROLE_BUNDLE_SCHEMA,
  type FloodgateRoleBundleRawIdentity,
  type FloodgateRoleBundleRawParent,
} from "../floodgate-role-bundle";
import {
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
  type VerifiedPinnedFloodgateRoleBundle,
} from "../floodgate-role-bundle-result";
import { floodgateIdentifierDigest } from "../floodgate-roles";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
} from "../floodgate-stable-wasm-proposer";
import {
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  FloodgateTeacherStageLeaseUnavailableError,
  authorizeFloodgateTeacherStageCoreForTests,
  type FloodgateTeacherStageAuthorizationOptions,
} from "../floodgate-teacher-stage-authorization";
import {
  FLOODGATE_TRAINING_RAW_FILENAME,
  withVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingRowConsumerDependencies,
  type FloodgateTrainingRowConsumerOptions,
} from "../floodgate-training-row-consumer";
import {
  buildFloodgateV7CheckpointScanLoadRawRowsCoreForTests,
  generateFloodgateV7CheckpointScanLoadParentsCoreForTests,
} from "../floodgate-v7-checkpoint-scan-load";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HMAC_DOMAIN,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_INFO,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_SALT,
  FloodgateV7ProductionOuterGateLeaseError,
  runWithFloodgateV7ProductionOuterGateLeaseCoreForTests,
  type FloodgateV7ProductionOuterGate,
} from "../floodgate-v7-production-outer-gate-lease";
import { FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT } from "../floodgate-v7-production-application-source-provenance";
import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "../floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
  checkpointFloodgateV7TeacherParentsV3CoreForTests,
  type FloodgateV7TeacherCheckpointRunBinding,
} from "../floodgate-v7-teacher-checkpoint";
import { compareBytewise } from "../sibling-data";

type Point =
  | "outer-active-durable"
  | "stage-lease-durable"
  | "checkpoint-first-byte-written";
type Mode = "arm" | "outer-probe" | "stage-probe";

interface Config {
  readonly protocol: "shogi-floodgate-v7-prefix100-kill-drill-child-v1";
  readonly mode: Mode;
  readonly case_id: string;
  readonly point: Point;
  readonly effective_user_id: number;
  readonly fixture_root: string;
  readonly home: string;
  readonly key_path: string;
  readonly stage: FloodgateTeacherStageAuthorizationOptions;
  readonly training: FloodgateTrainingRowConsumerOptions;
}

const PRODUCER_REVISION = "a".repeat(40);
const VERIFIER_REVISION = "b".repeat(40);
const RUN_ID = "12".repeat(32);
const DISPOSABLE_APPLICATION_SOURCE_REVISION = "e".repeat(40);
const REQUIRED_NODE_VERSION = "v22.13.0";
const childSend = process.send?.bind(process);
let killOnDisconnect = false;

function applicationSourceBinding() {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, unknown>, {
      layout: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
      revision: DISPOSABLE_APPLICATION_SOURCE_REVISION,
    }),
  );
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("fixture is not JSON data");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("child nested config differs");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== [...keys].sort().join("\0")) {
    throw new Error("child nested config keys differ");
  }
  return record;
}

function sameOrContains(root: string, candidate: string): boolean {
  if (root === candidate) return true;
  const relative = path.relative(root, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

function validateOwnedPath(
  root: string,
  candidate: unknown,
  effectiveUserId: number,
  kind: "directory" | "file",
): string {
  if (
    typeof candidate !== "string" ||
    !path.isAbsolute(candidate) ||
    path.resolve(candidate) !== candidate ||
    fs.realpathSync(candidate) !== candidate ||
    !sameOrContains(root, candidate) ||
    candidate === root
  ) {
    throw new Error("child fixture path confinement differs");
  }
  const stat = fs.lstatSync(candidate, { bigint: true });
  if (
    stat.isSymbolicLink() ||
    Number(stat.uid) !== effectiveUserId ||
    (kind === "directory" ? !stat.isDirectory() : !stat.isFile()) ||
    Number(stat.mode & BigInt(0o7777)) !==
      (kind === "directory" ? 0o700 : 0o600)
  ) {
    throw new Error("child fixture path ownership differs");
  }
  return candidate;
}

function exactConfig(value: unknown): Config {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("child config differs");
  }
  const record = value as Record<string, unknown>;
  const keys = [
    "case_id",
    "effective_user_id",
    "fixture_root",
    "home",
    "key_path",
    "mode",
    "point",
    "protocol",
    "stage",
    "training",
  ];
  if (
    Object.keys(record).sort().join("\0") !== keys.sort().join("\0") ||
    record.protocol !== "shogi-floodgate-v7-prefix100-kill-drill-child-v1" ||
    !["arm", "outer-probe", "stage-probe"].includes(String(record.mode)) ||
    ![
      "outer-active-durable",
      "stage-lease-durable",
      "checkpoint-first-byte-written",
    ].includes(String(record.point)) ||
    typeof record.case_id !== "string" ||
    !/^[0-9a-f]{32}$/.test(record.case_id) ||
    !Number.isSafeInteger(record.effective_user_id) ||
    typeof record.fixture_root !== "string" ||
    typeof record.home !== "string" ||
    typeof record.key_path !== "string"
  ) {
    throw new Error("child config differs");
  }
  const effectiveUserId = record.effective_user_id as number;
  const root = path.resolve(record.fixture_root);
  if (
    root !== record.fixture_root ||
    fs.realpathSync(root) !== root ||
    typeof process.geteuid !== "function" ||
    effectiveUserId !== process.geteuid()
  ) {
    throw new Error("child fixture root identity differs");
  }
  const rootStat = fs.lstatSync(root, { bigint: true });
  const productionHome = fs.realpathSync(os.userInfo().homedir);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    Number(rootStat.uid) !== effectiveUserId ||
    Number(rootStat.mode & BigInt(0o7777)) !== 0o700 ||
    sameOrContains(root, productionHome) ||
    sameOrContains(productionHome, root)
  ) {
    throw new Error("child fixture root ownership differs");
  }
  validateOwnedPath(root, record.home, effectiveUserId, "directory");
  validateOwnedPath(root, record.key_path, effectiveUserId, "file");
  validateOwnedPath(
    root,
    path.join(root, ".floodgate-v7-prefix100-kill-drill-fixture"),
    effectiveUserId,
    "file",
  );

  const stage = exactKeys(record.stage, [
    "destinationBasename",
    "engineArgs",
    "engineBin",
    "engineReceipt",
    "evalDir",
    "legacyProtectedPositionIdsPath",
    "publicationParent",
    "rawLockRoot",
    "repositoryRoot",
    "roleBundleRoot",
    "roleLockRoot",
    "stageBasename",
  ]);
  const training = exactKeys(record.training, [
    "legacyProtectedPositionIdsPath",
    "outputRoot",
    "rawLockRoot",
    "repositoryRoot",
    "roleLockRoot",
    "verifierRevision",
  ]);
  if (
    stage.stageBasename !== "teacher-stage" ||
    stage.destinationBasename !== "teacher-final" ||
    training.verifierRevision !== VERIFIER_REVISION ||
    !Array.isArray(stage.engineArgs) ||
    stage.engineArgs.length !== 1 ||
    Object.keys(stage.engineArgs).join("\0") !== "0" ||
    typeof stage.engineArgs[0] !== "string"
  ) {
    throw new Error("child stage or training contract differs");
  }
  const directoryFields = [
    stage.repositoryRoot,
    stage.rawLockRoot,
    stage.roleLockRoot,
    stage.roleBundleRoot,
    stage.publicationParent,
    stage.evalDir,
  ];
  for (const candidate of directoryFields) {
    validateOwnedPath(root, candidate, effectiveUserId, "directory");
  }
  const fileFields = [
    stage.legacyProtectedPositionIdsPath,
    stage.engineBin,
    stage.engineReceipt,
    stage.engineArgs[0],
    path.join(String(stage.evalDir), "nn.bin"),
  ];
  for (const candidate of fileFields) {
    validateOwnedPath(root, candidate, effectiveUserId, "file");
  }
  if (
    training.repositoryRoot !== stage.repositoryRoot ||
    training.rawLockRoot !== stage.rawLockRoot ||
    training.roleLockRoot !== stage.roleLockRoot ||
    training.legacyProtectedPositionIdsPath !==
      stage.legacyProtectedPositionIdsPath ||
    training.outputRoot !== stage.roleBundleRoot
  ) {
    throw new Error("child stage and training paths differ");
  }
  return value as Config;
}

async function send(value: Readonly<Record<string, unknown>>): Promise<void> {
  if (childSend === undefined) throw new Error("child IPC is unavailable");
  await new Promise<void>((resolve, reject) => {
    childSend(value, (error) => (error === null ? resolve() : reject(error)));
  });
}

async function pause(point: Point, caseId: string): Promise<never> {
  const keepAlive = setInterval(() => undefined, 1_000);
  await send({
    protocol: "shogi-floodgate-v7-prefix100-kill-drill-child-v1",
    type: "armed",
    case_id: caseId,
    point,
  });
  await new Promise<never>(() => undefined);
  clearInterval(keepAlive);
  throw new Error("unreachable pause completion");
}

function rawBytes(
  rows: readonly Readonly<FloodgateRoleBundleRawParent>[],
): Buffer {
  return Buffer.from(`${rows.map((row) => canonicalJson(row)).join("\n")}\n`);
}

function rawIdentity(
  rows: readonly Readonly<FloodgateRoleBundleRawParent>[],
  bytes: Uint8Array,
): Readonly<FloodgateRoleBundleRawIdentity> {
  const games = new Set(rows.map((row) => row.game_id));
  const parents = new Set(rows.map((row) => row.parent_id));
  const positions = new Set(rows.map((row) => row.position_id));
  return Object.freeze({
    path: FLOODGATE_TRAINING_RAW_FILENAME,
    format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    records: rows.length,
    games: games.size,
    game_ids_sha256: floodgateIdentifierDigest(games),
    parent_ids_sha256: floodgateIdentifierDigest(parents),
    position_ids_count: positions.size,
    position_ids_sha256: floodgateIdentifierDigest(positions),
  });
}

function verifiedBundle(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): Readonly<VerifiedPinnedFloodgateRoleBundle> {
  const manifest = {
    schema: FLOODGATE_ROLE_BUNDLE_SCHEMA,
    status: "complete-label-free-role-bundle",
    provenance: {},
    pipeline: { source_revision: PRODUCER_REVISION, tracked_tree_clean: true },
    sources: {},
    contract: {},
    roles: {
      fresh_final_holdout: {},
      fresh_selection: {},
      training: { protected_position_ids: {}, raw_parents: identity },
    },
    replay_exclusion: {},
    isolation: {},
  };
  const manifestText = `${canonicalJson(manifest)}\n`;
  const manifestIdentity = {
    path: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.path,
    bytes: Buffer.byteLength(manifestText),
    sha256: sha256(manifestText),
  };
  return {
    manifest,
    manifestText,
    roleLock: {},
    producerRevision: PRODUCER_REVISION,
    verifierRevision: VERIFIER_REVISION,
    result: {
      schema: FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
      status: "complete-label-free-role-bundle",
      claim_boundary: "integrity-only-not-playing-strength-evidence",
      manifest: { identity: manifestIdentity, value: manifest },
      execution: {},
      post_run_audit: {},
    },
  } as unknown as Readonly<VerifiedPinnedFloodgateRoleBundle>;
}

async function prepareTraining(
  config: Config,
): Promise<Readonly<FloodgateTrainingRowConsumerDependencies>> {
  const generated = generateFloodgateV7CheckpointScanLoadParentsCoreForTests(
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  );
  const rows = buildFloodgateV7CheckpointScanLoadRawRowsCoreForTests(generated);
  const bytes = rawBytes(rows);
  const trainingPath = path.join(
    config.training.outputRoot,
    FLOODGATE_TRAINING_RAW_FILENAME,
  );
  await fs.promises.writeFile(trainingPath, bytes, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(trainingPath, 0o600);
  const identity = rawIdentity(rows, bytes);
  bytes.fill(0);
  const bundle = verifiedBundle(identity);
  return Object.freeze({
    verifyBundle: async () => bundle,
    expectedManifestIdentity: bundle.result.manifest.identity,
  });
}

async function readNonSharedRootKey(keyPath: string): Promise<Uint8Array> {
  const source = await fs.promises.readFile(keyPath);
  if (source.byteLength !== 32) throw new Error("test key length differs");
  const key = new Uint8Array(32);
  key.set(source);
  source.fill(0);
  return key;
}

function runBinding(): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  return Object.freeze({
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: Object.freeze({
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    }),
    producer_control: Object.freeze({
      schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms: 1_800_000,
      abort_drain_ms: 30_000,
      max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
      cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
      late_settlement_policy:
        FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    }),
    stable_runtime_receipt_sha256: "c".repeat(64),
    teacher_usi_runtime_receipt_sha256: "d".repeat(64),
  });
}

async function arm(config: Config): Promise<never> {
  const trainingDependencies =
    config.point === "checkpoint-first-byte-written"
      ? await prepareTraining(config)
      : undefined;
  const rootKey = await readNonSharedRootKey(config.key_path);
  process.on("SIGTERM", () => undefined);
  await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
    "durable-prefix-100",
    {
      effectiveUserId: config.effective_user_id,
      homeDirectory: config.home,
      rootKey,
      hostname: "disposable-kill-drill.local",
      pid: process.pid,
      installProcessLifecycleHandlers: true,
      captureApplicationSourceForTests: async () => applicationSourceBinding(),
    },
    async () => {
      if (config.point === "outer-active-durable") {
        return pause(config.point, config.case_id);
      }
      const lease = await authorizeFloodgateTeacherStageCoreForTests(
        config.stage,
        {
          effectiveUserId: config.effective_user_id,
          inspectorPythonExecutable:
            FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
          afterLeaseAcquiredForTests:
            config.point === "stage-lease-durable"
              ? () => pause(config.point, config.case_id)
              : undefined,
        },
      );
      if (trainingDependencies === undefined) {
        throw new Error("checkpoint training fixture is unavailable");
      }
      const checkpointKey = await readNonSharedRootKey(config.key_path);
      try {
        await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          config.training,
          async (input: Readonly<AuthenticatedFloodgateTrainingRows>) => {
            await checkpointFloodgateV7TeacherParentsV3CoreForTests(
              lease,
              input,
              runBinding(),
              {
                produce: async () => {
                  throw new Error("producer ran before the checkpoint header");
                },
                abortAndDrain: async () => undefined,
              },
              {
                gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
                runId: RUN_ID,
                keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
              },
              {
                rootKey: checkpointKey,
                effectiveUserId: config.effective_user_id,
                writeForTests: async (request, write) => {
                  if (
                    request.label !== "v3 checkpoint header" ||
                    request.offset !== 0
                  ) {
                    throw new Error("first checkpoint write differs");
                  }
                  const written = await write(1);
                  if (written !== 1)
                    throw new Error("first checkpoint byte differs");
                  return pause(config.point, config.case_id);
                },
              },
            );
          },
          trainingDependencies,
        );
      } catch {
        await send({
          protocol: "shogi-floodgate-v7-prefix100-kill-drill-child-v1",
          type: "failure",
          failure_kind: "checkpoint-error",
        });
        await new Promise<never>(() => undefined);
      }
      throw new Error("checkpoint unexpectedly completed");
    },
  );
  throw new Error("kill drill unexpectedly completed");
}

async function outerProbe(config: Config): Promise<void> {
  const gates: readonly FloodgateV7ProductionOuterGate[] = [
    "durable-prefix-100",
    "durable-prefix-500",
    "sealed-final-24000",
  ];
  for (const gate of gates) {
    const rootKey = await readNonSharedRootKey(config.key_path);
    let invoked = false;
    let failure: unknown;
    try {
      await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        gate,
        {
          effectiveUserId: config.effective_user_id,
          homeDirectory: config.home,
          rootKey,
          hostname: "disposable-probe.local",
          pid: process.pid,
          installProcessLifecycleHandlers: false,
          captureApplicationSourceForTests: async () =>
            applicationSourceBinding(),
        },
        async () => {
          invoked = true;
        },
      );
    } catch (error) {
      failure = error;
    }
    if (
      invoked ||
      !(failure instanceof FloodgateV7ProductionOuterGateLeaseError) ||
      failure.phase !== "stale-inspection" ||
      failure.stale_lease_authenticated !== true ||
      failure.disposition !== "manual-reconciliation-required"
    ) {
      throw new Error("outer-probe-condition");
    }
  }
  await send({
    protocol: "shogi-floodgate-v7-prefix100-kill-drill-child-v1",
    type: "outer-probe-pass",
    case_id: config.case_id,
  });
}

async function stageProbe(config: Config): Promise<void> {
  let failure: unknown;
  try {
    await authorizeFloodgateTeacherStageCoreForTests(config.stage, {
      effectiveUserId: config.effective_user_id,
      inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
    });
  } catch (error) {
    failure = error;
  }
  if (!(failure instanceof FloodgateTeacherStageLeaseUnavailableError)) {
    throw new Error("fresh stage authorization did not preserve EEXIST");
  }
  await send({
    protocol: "shogi-floodgate-v7-prefix100-kill-drill-child-v1",
    type: "stage-probe-pass",
    case_id: config.case_id,
  });
}

async function main(value: unknown): Promise<void> {
  if (process.version !== REQUIRED_NODE_VERSION) {
    throw new Error("kill drill child runtime differs");
  }
  const config = exactConfig(value);
  killOnDisconnect = config.mode === "arm";
  if (config.mode === "arm") return arm(config);
  if (config.mode === "outer-probe") return outerProbe(config);
  return stageProbe(config);
}

process.once("disconnect", () => {
  if (killOnDisconnect) process.kill(process.pid, "SIGKILL");
});
process.once("message", (value) => {
  void main(value).then(
    () => {
      process.exitCode = 0;
      process.disconnect?.();
    },
    async (error: unknown) => {
      try {
        await send({
          protocol: "shogi-floodgate-v7-prefix100-kill-drill-child-v1",
          type: "failure",
          failure_kind:
            error instanceof FloodgateV7ProductionOuterGateLeaseError
              ? `outer:${error.phase}:${String(error.stale_lease_authenticated)}`
              : error instanceof FloodgateTeacherStageLeaseUnavailableError
                ? "stage-unavailable"
                : error instanceof Error &&
                    error.message === "outer-probe-condition"
                  ? "outer-probe-condition"
                  : error instanceof Error &&
                      error.message ===
                        "fresh stage authorization did not preserve EEXIST"
                    ? "stage-probe-condition"
                    : error !== null &&
                        typeof error === "object" &&
                        typeof (error as NodeJS.ErrnoException).code ===
                          "string"
                      ? `errno:${(error as NodeJS.ErrnoException).code}`
                      : "unexpected",
        });
      } finally {
        killOnDisconnect = false;
        process.exitCode = 2;
        process.disconnect?.();
      }
    },
  );
});

// Keep these test-only domain constants reachable so static source auditing
// can prove that no alternate or caller-selected lease algorithm was used.
void FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_SALT;
void FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_INFO;
void FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HMAC_DOMAIN;
