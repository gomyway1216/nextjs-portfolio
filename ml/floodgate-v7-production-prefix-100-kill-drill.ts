/**
 * Disposable process-death drill for the prefix-100 safety primitives.
 *
 * Every writable path is created below a fresh private temporary root. The
 * child calls only dependency-injected test seams; this module never invokes a
 * fixed production owner, production registry provisioner, teacher runtime,
 * live weight path, or real connector gate.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
} from "./floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
} from "./floodgate-v7-production-connector-registry";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
} from "./floodgate-v7-production-outer-gate-lease";
import type { FloodgateTeacherStageAuthorizationOptions } from "./floodgate-teacher-stage-authorization";
import { FLOODGATE_TRAINING_RAW_FILENAME } from "./floodgate-training-row-consumer";
import { FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME } from "./floodgate-v7-teacher-checkpoint";

export const FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-disposable-kill-drill-v1" as const;
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_STATUS =
  "six-disposable-process-death-cases-preserved-fail-closed-evidence-without-production-gate-execution" as const;
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_EXECUTION_BOUNDARY =
  "fixed-current-euid-private-temporary-roots-test-only-seams-darwin-process-signals" as const;
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CHILD_PROTOCOL =
  "shogi-floodgate-v7-prefix100-kill-drill-child-v1" as const;
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_POINTS =
  Object.freeze([
    "outer-active-durable",
    "stage-lease-durable",
    "checkpoint-first-byte-written",
  ] as const);
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_SIGNALS =
  Object.freeze(["SIGTERM", "SIGKILL"] as const);

export type FloodgateV7ProductionPrefix100KillDrillPoint =
  (typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_POINTS)[number];
export type FloodgateV7ProductionPrefix100KillDrillSignal =
  (typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_SIGNALS)[number];

export interface FloodgateV7ProductionPrefix100KillDrillCaseReceipt {
  readonly point: FloodgateV7ProductionPrefix100KillDrillPoint;
  readonly signal: FloodgateV7ProductionPrefix100KillDrillSignal;
  readonly exit_signal: FloodgateV7ProductionPrefix100KillDrillSignal;
  readonly lock_contended_before_death: true;
  readonly lock_released_after_death: true;
  readonly authenticated_outer_stale_blocked_all_gates: true;
  readonly inner_lease_eexist_blocked: boolean;
  readonly filesystem_snapshot_preserved: true;
}

export interface FloodgateV7ProductionPrefix100KillDrillReceipt {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_STATUS;
  readonly execution_boundary: typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_EXECUTION_BOUNDARY;
  readonly cases: readonly Readonly<FloodgateV7ProductionPrefix100KillDrillCaseReceipt>[];
  readonly verification: Readonly<{
    readonly six_cases_passed: true;
    readonly disposable_fixture_confined: true;
    readonly test_only_seams: true;
    readonly no_production_gate_invoked: true;
    readonly no_delete_truncate_or_repair_before_evidence: true;
    readonly parent_fixture_key_buffer_zeroized_after_use: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly production_prefix_100: false;
    readonly production_recovery: false;
    readonly power_loss_or_reboot: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7ProductionPrefix100KillDrillDependenciesForTests {
  readonly effectiveUserId: number;
  readonly temporaryParent: string;
  readonly nodeExecutable: string;
  readonly childModulePath: string;
  readonly lockfPath: string;
  readonly armTimeoutMilliseconds?: number;
  readonly exitTimeoutMilliseconds?: number;
  readonly probeTimeoutMilliseconds?: number;
  readonly afterEvidenceArmedForTests?: (
    event: Readonly<{
      readonly point: FloodgateV7ProductionPrefix100KillDrillPoint;
      readonly signal: FloodgateV7ProductionPrefix100KillDrillSignal;
    }>,
  ) => void | Promise<void>;
  readonly fixtureFailpointForTests?: (
    event: Readonly<{ readonly phase: "after-private-registry-created" }>,
  ) => void | Promise<void>;
  readonly fixtureRootRealpathForTests?: (
    createdPath: string,
    resolve: () => Promise<string>,
  ) => Promise<string>;
  readonly mutateChildConfigForTests?: (
    config: Readonly<Record<string, unknown>>,
    event: Readonly<{
      readonly mode: "arm" | "outer-probe" | "stage-probe";
      readonly point: FloodgateV7ProductionPrefix100KillDrillPoint;
    }>,
  ) => Readonly<Record<string, unknown>>;
}

export interface FloodgateV7ProductionPrefix100FixedAnchorSetupDependenciesForTests {
  readonly effectiveUserId: number;
  readonly fixedParent: string;
  readonly parentRealpathForTests?: (parent: string) => string;
  readonly initialLstatForTests?: (root: string) => fs.BigIntStats;
  readonly afterInitialIdentityForTests?: (root: string) => void;
}

export interface FloodgateV7ProductionPrefix100FixedAnchorSetupReceipt {
  readonly contract: "shogi-floodgate-v7-production-prefix-100-fixed-anchor-setup-test-v1";
  readonly status: "private-anchor-created-and-exactly-removed";
  readonly verification: Readonly<{
    readonly fixed_parent_canonical_private_current_euid: true;
    readonly anchor_initial_identity_captured_before_later_setup: true;
    readonly exact_anchor_removed: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly production_gate: false;
    readonly private_path_disclosed: false;
  }>;
}

interface CapturedDependencies {
  readonly effectiveUserId: number;
  readonly temporaryParent: string;
  readonly nodeExecutable: string;
  readonly childModulePath: string;
  readonly lockfPath: string;
  readonly armTimeoutMilliseconds: number;
  readonly exitTimeoutMilliseconds: number;
  readonly probeTimeoutMilliseconds: number;
  readonly afterEvidenceArmed:
    | FloodgateV7ProductionPrefix100KillDrillDependenciesForTests["afterEvidenceArmedForTests"]
    | undefined;
  readonly fixtureFailpoint:
    | FloodgateV7ProductionPrefix100KillDrillDependenciesForTests["fixtureFailpointForTests"]
    | undefined;
  readonly fixtureRootRealpath:
    | FloodgateV7ProductionPrefix100KillDrillDependenciesForTests["fixtureRootRealpathForTests"]
    | undefined;
  readonly mutateChildConfig:
    | FloodgateV7ProductionPrefix100KillDrillDependenciesForTests["mutateChildConfigForTests"]
    | undefined;
}

export type FloodgateV7ProductionPrefix100KillDrillFailurePhase =
  | "capture"
  | "fixture"
  | "arm"
  | "armed-evidence"
  | "signal"
  | "process-death"
  | "outer-probe"
  | "stage-probe"
  | "final-evidence"
  | "cleanup";

export class FloodgateV7ProductionPrefix100KillDrillManualReconciliationError extends Error {
  readonly phase!: FloodgateV7ProductionPrefix100KillDrillFailurePhase;
  readonly point!: FloodgateV7ProductionPrefix100KillDrillPoint | null;
  readonly signal!: FloodgateV7ProductionPrefix100KillDrillSignal | null;
  readonly fixture_preserved!: boolean;
  readonly manual_reconciliation_required!: true;
  readonly production_gate_invoked!: false;
  readonly private_path_disclosed!: false;
  readonly raw_failure_disclosed!: false;

  constructor(
    phase: FloodgateV7ProductionPrefix100KillDrillFailurePhase,
    point: FloodgateV7ProductionPrefix100KillDrillPoint | null,
    signal: FloodgateV7ProductionPrefix100KillDrillSignal | null,
    fixturePreserved: boolean,
  ) {
    super(
      "Floodgate v7 disposable prefix-100 kill drill requires manual reconciliation",
    );
    const name =
      "FloodgateV7ProductionPrefix100KillDrillManualReconciliationError";
    Object.defineProperties(this, {
      name: {
        configurable: false,
        enumerable: false,
        writable: false,
        value: name,
      },
      stack: {
        configurable: false,
        enumerable: false,
        writable: false,
        value: `${name}: disposable prefix-100 kill drill requires manual reconciliation`,
      },
      phase: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: phase,
      },
      point: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: point,
      },
      signal: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: signal,
      },
      fixture_preserved: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: fixturePreserved,
      },
      manual_reconciliation_required: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: true,
      },
      production_gate_invoked: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: false,
      },
      private_path_disclosed: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: false,
      },
      raw_failure_disclosed: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: false,
      },
    });
    Object.freeze(this);
  }
}

interface Fixture {
  readonly root: string;
  readonly rootDev: bigint;
  readonly rootIno: bigint;
  readonly markerPath: string;
  readonly marker: string;
  readonly home: string;
  readonly childTemporaryDirectory: string;
  readonly keyPath: string;
  readonly registryPath: string;
  readonly controlRoot: string;
  readonly activePath: string;
  readonly quarantineRoot: string;
  readonly retiredRoot: string;
  readonly stageRoot: string;
  readonly leaseRoot: string;
  readonly workPath: string;
  readonly stage: FloodgateTeacherStageAuthorizationOptions;
  readonly training: Readonly<{
    readonly repositoryRoot: string;
    readonly verifierRevision: string;
    readonly rawLockRoot: string;
    readonly roleLockRoot: string;
    readonly legacyProtectedPositionIdsPath: string;
    readonly outputRoot: string;
  }>;
}

interface FixedPrivateAnchor {
  readonly root: string;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly markerPath: string;
  readonly marker: string;
}

interface Snapshot {
  readonly kind: "file" | "directory";
  readonly dev: string;
  readonly ino: string;
  readonly uid: number;
  readonly mode: number;
  readonly nlink: number;
  readonly size: string;
  readonly sha256: string | null;
  readonly entries: readonly string[] | null;
}

interface ChildMessage {
  readonly protocol: typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CHILD_PROTOCOL;
  readonly type: "armed" | "outer-probe-pass" | "stage-probe-pass" | "failure";
  readonly case_id?: string;
  readonly point?: FloodgateV7ProductionPrefix100KillDrillPoint;
  readonly failure_kind?: string;
}

interface ChildExitReceipt {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface ChildCloseObservation {
  closed: boolean;
  receipt: Readonly<ChildExitReceipt> | undefined;
  readonly promise: Promise<Readonly<ChildExitReceipt>>;
}

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_CHILD_PATH = path.join(
  path.dirname(SCRIPT_PATH),
  "helpers",
  "floodgate-v7-production-prefix-100-kill-drill-child.ts",
);
const REQUIRED_NODE_VERSION = "v22.13.0";
const MARKER_BASENAME = ".floodgate-v7-prefix100-kill-drill-fixture";
const MAX_CHILD_OUTPUT_BYTES = 64 * 1024;
const childCloseObservations = new WeakMap<
  ChildProcess,
  ChildCloseObservation
>();
const INCOMPLETE_FIXTURE_TOP_LEVEL_ALLOWLIST = Object.freeze([
  MARKER_BASENAME,
  "child-tmp",
  "engine",
  "eval",
  "home",
  "legacy",
  "publication",
  "raw-lock",
  "repository",
  "role-bundle",
  "role-lock",
] as const);

function frozenRecord<T extends object>(value: T): Readonly<T> {
  return Object.freeze(
    Object.assign(Object.create(null), value),
  ) as Readonly<T>;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function pathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`)
  );
}

function sameOrContains(root: string, candidate: string): boolean {
  if (root === candidate) return true;
  const relative = path.relative(root, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

function privateDirectoryStat(
  directory: string,
  effectiveUserId: number,
): fs.BigIntStats {
  const stat = fs.lstatSync(directory, { bigint: true });
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    Number(stat.uid) !== effectiveUserId ||
    Number(stat.mode & BigInt(0o7777)) !== 0o700
  ) {
    throw new Error("kill drill private directory differs");
  }
  return stat;
}

function timeoutValue(value: number | undefined, fallback: number): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 100 || selected > 180_000) {
    throw new Error("kill drill timeout differs");
  }
  return selected;
}

function captureDependencies(
  value: FloodgateV7ProductionPrefix100KillDrillDependenciesForTests,
): Readonly<CapturedDependencies> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("kill drill dependencies differ");
  }
  const allowed = new Set([
    "afterEvidenceArmedForTests",
    "armTimeoutMilliseconds",
    "childModulePath",
    "effectiveUserId",
    "exitTimeoutMilliseconds",
    "fixtureFailpointForTests",
    "fixtureRootRealpathForTests",
    "lockfPath",
    "mutateChildConfigForTests",
    "nodeExecutable",
    "probeTimeoutMilliseconds",
    "temporaryParent",
  ]);
  if (
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !allowed.has(key),
    )
  ) {
    throw new Error("kill drill dependency keys differ");
  }
  if (
    !Number.isSafeInteger(value.effectiveUserId) ||
    value.effectiveUserId < 0 ||
    !path.isAbsolute(value.temporaryParent) ||
    !path.isAbsolute(value.nodeExecutable) ||
    !path.isAbsolute(value.childModulePath) ||
    !path.isAbsolute(value.lockfPath) ||
    (value.afterEvidenceArmedForTests !== undefined &&
      typeof value.afterEvidenceArmedForTests !== "function") ||
    (value.fixtureFailpointForTests !== undefined &&
      typeof value.fixtureFailpointForTests !== "function") ||
    (value.fixtureRootRealpathForTests !== undefined &&
      typeof value.fixtureRootRealpathForTests !== "function") ||
    (value.mutateChildConfigForTests !== undefined &&
      typeof value.mutateChildConfigForTests !== "function")
  ) {
    throw new Error("kill drill dependency values differ");
  }
  if (
    path.resolve(value.temporaryParent) !== value.temporaryParent ||
    fs.realpathSync(value.temporaryParent) !== value.temporaryParent
  ) {
    throw new Error("kill drill temporary parent is not canonical");
  }
  const temporaryParent = value.temporaryParent;
  const temporaryParentStat = privateDirectoryStat(
    temporaryParent,
    value.effectiveUserId,
  );
  const productionHome = fs.realpathSync(os.userInfo().homedir);
  const productionHomeStat = fs.lstatSync(productionHome, { bigint: true });
  if (
    (temporaryParentStat.dev === productionHomeStat.dev &&
      temporaryParentStat.ino === productionHomeStat.ino) ||
    sameOrContains(temporaryParent, productionHome) ||
    sameOrContains(productionHome, temporaryParent)
  ) {
    throw new Error("kill drill temporary parent overlaps the production home");
  }
  return frozenRecord({
    effectiveUserId: value.effectiveUserId,
    temporaryParent,
    nodeExecutable: fs.realpathSync(value.nodeExecutable),
    childModulePath: fs.realpathSync(value.childModulePath),
    lockfPath: fs.realpathSync(value.lockfPath),
    armTimeoutMilliseconds: timeoutValue(value.armTimeoutMilliseconds, 120_000),
    exitTimeoutMilliseconds: timeoutValue(value.exitTimeoutMilliseconds, 5_000),
    probeTimeoutMilliseconds: timeoutValue(
      value.probeTimeoutMilliseconds,
      30_000,
    ),
    afterEvidenceArmed: value.afterEvidenceArmedForTests,
    fixtureFailpoint: value.fixtureFailpointForTests,
    fixtureRootRealpath: value.fixtureRootRealpathForTests,
    mutateChildConfig: value.mutateChildConfigForTests,
  });
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(
  filePath: string,
  bytes: string | Uint8Array,
): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

interface FixedPrivateAnchorSetupSeams {
  readonly parentRealpath?: (parent: string) => string;
  readonly initialLstat?: (root: string) => fs.BigIntStats;
  readonly afterInitialIdentity?: (root: string) => void;
}

function createFixedPrivateAnchor(
  effectiveUserId: number,
  fixedParent = "/private/tmp",
  seams: Readonly<FixedPrivateAnchorSetupSeams> = {},
): FixedPrivateAnchor {
  let root: string | undefined;
  let initialStat: fs.BigIntStats | undefined;
  let marker: string | undefined;
  let markerPath: string | undefined;
  try {
    const canonicalParent =
      seams.parentRealpath === undefined
        ? fs.realpathSync(fixedParent)
        : seams.parentRealpath(fixedParent);
    if (canonicalParent !== fixedParent) {
      throw new Error("fixed kill drill parent differs");
    }
    root = fs.mkdtempSync(
      path.join(fixedParent, "floodgate-v7-prefix100-fixed-"),
    );
    // The pathname and inode are captured immediately after creation, before
    // chmod, canonical-home checks, or any injectable test failure.
    initialStat =
      seams.initialLstat === undefined
        ? fs.lstatSync(root, { bigint: true })
        : seams.initialLstat(root);
    if (
      !initialStat.isDirectory() ||
      initialStat.isSymbolicLink() ||
      Number(initialStat.uid) !== effectiveUserId ||
      !pathInside(fixedParent, root)
    ) {
      throw new Error("fixed kill drill initial anchor identity differs");
    }
    seams.afterInitialIdentity?.(root);
    fs.chmodSync(root, 0o700);
    const stat = privateDirectoryStat(root, effectiveUserId);
    if (stat.dev !== initialStat.dev || stat.ino !== initialStat.ino) {
      throw new Error("fixed kill drill anchor identity changed");
    }
    const productionHome = fs.realpathSync(os.userInfo().homedir);
    if (
      sameOrContains(root, productionHome) ||
      sameOrContains(productionHome, root)
    ) {
      throw new Error("fixed kill drill root overlaps production home");
    }
    marker = randomBytes(16).toString("hex");
    markerPath = path.join(root, MARKER_BASENAME);
    fs.writeFileSync(markerPath, `${marker}\n`, { flag: "wx", mode: 0o600 });
    fs.chmodSync(markerPath, 0o600);
    return { root, dev: stat.dev, ino: stat.ino, markerPath, marker };
  } catch (error) {
    if (root === undefined) {
      void error;
      throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
        "fixture",
        null,
        null,
        false,
      );
    }
    let removed = false;
    try {
      const stat = fs.lstatSync(root, { bigint: true });
      const entries = fs.readdirSync(root);
      const markerAllowsRemoval =
        markerPath === undefined || marker === undefined
          ? entries.length === 0
          : entries.length === 1 &&
            entries[0] === MARKER_BASENAME &&
            fs.readFileSync(markerPath, "utf8") === `${marker}\n`;
      if (
        initialStat !== undefined &&
        stat.dev === initialStat.dev &&
        stat.ino === initialStat.ino &&
        stat.isDirectory() &&
        Number(stat.uid) === effectiveUserId &&
        pathInside(fixedParent, root) &&
        markerAllowsRemoval
      ) {
        fs.rmSync(root, { recursive: true, force: false });
        removed = true;
      }
    } catch {
      // The fixed entry is preserved when its exact cleanup authority is lost.
    }
    void error;
    throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
      "fixture",
      null,
      null,
      !removed,
    );
  }
}

function cleanupFixedPrivateAnchor(anchor: FixedPrivateAnchor): void {
  const stat = fs.lstatSync(anchor.root, { bigint: true });
  if (
    stat.dev !== anchor.dev ||
    stat.ino !== anchor.ino ||
    fs.readFileSync(anchor.markerPath, "utf8") !== `${anchor.marker}\n` ||
    fs.readdirSync(anchor.root).sort().join("\0") !== MARKER_BASENAME
  ) {
    throw new Error("fixed kill drill anchor cleanup identity differs");
  }
  fs.rmSync(anchor.root, { recursive: true, force: false });
}

async function rollbackIncompleteFixture(
  dependencies: Readonly<CapturedDependencies>,
  root: string,
  rootStat: fs.BigIntStats | undefined,
  markerPath: string | undefined,
  marker: string | undefined,
): Promise<boolean> {
  try {
    if (
      rootStat === undefined ||
      !pathInside(dependencies.temporaryParent, root)
    ) {
      return false;
    }
    const current = await fs.promises.lstat(root, { bigint: true });
    if (
      current.dev !== rootStat.dev ||
      current.ino !== rootStat.ino ||
      !current.isDirectory() ||
      Number(current.uid) !== dependencies.effectiveUserId
    ) {
      return false;
    }
    if (markerPath === undefined || marker === undefined) {
      if ((await fs.promises.readdir(root)).length !== 0) return false;
    } else if (
      (await fs.promises.readFile(markerPath, "utf8")) !== `${marker}\n`
    ) {
      return false;
    }
    const entries = await fs.promises.readdir(root);
    if (
      entries.some(
        (entry) =>
          !INCOMPLETE_FIXTURE_TOP_LEVEL_ALLOWLIST.includes(
            entry as (typeof INCOMPLETE_FIXTURE_TOP_LEVEL_ALLOWLIST)[number],
          ),
      )
    ) {
      return false;
    }
    await fs.promises.rm(root, { recursive: true, force: false });
    return true;
  } catch {
    return false;
  }
}

async function populateFixture(
  dependencies: Readonly<CapturedDependencies>,
  root: string,
  rootStat: fs.BigIntStats,
  markerPath: string,
  marker: string,
): Promise<Readonly<Fixture>> {
  const home = path.join(root, "home");
  const childTemporaryDirectory = path.join(root, "child-tmp");
  await Promise.all([mkdir0700(home), mkdir0700(childTemporaryDirectory)]);
  if (!pathInside(root, home)) throw new Error("fixture home escaped root");

  const keyPath = path.join(
    home,
    ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
    FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  );
  const key = randomBytes(32);
  try {
    await write0600(keyPath, key);
  } finally {
    key.fill(0);
  }

  const registryRoot = path.join(
    home,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
  await mkdir0700(registryRoot);
  const registryPath = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  );
  await write0600(
    registryPath,
    `${JSON.stringify({ schema: "disposable-kill-drill-registry-v1" })}\n`,
  );
  await dependencies.fixtureFailpoint?.(
    frozenRecord({ phase: "after-private-registry-created" as const }),
  );

  const repositoryRoot = path.join(root, "repository");
  const rawLockRoot = path.join(root, "raw-lock");
  const roleLockRoot = path.join(root, "role-lock");
  const roleBundleRoot = path.join(root, "role-bundle");
  const publicationParent = path.join(root, "publication");
  const evalDir = path.join(root, "eval");
  await Promise.all(
    [
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      roleBundleRoot,
      publicationParent,
      evalDir,
    ].map(mkdir0700),
  );
  const legacy = path.join(root, "legacy", "protected-position-ids.txt");
  const engineBin = path.join(root, "engine", "yaneuraou");
  const engineReceipt = path.join(root, "engine", "receipt.json");
  const engineArgument = path.join(root, "engine", "argument.bin");
  await Promise.all([
    write0600(legacy, "synthetic\n"),
    write0600(engineBin, "synthetic engine\n"),
    write0600(engineReceipt, '{"synthetic":true}\n'),
    write0600(engineArgument, "synthetic argument\n"),
    write0600(path.join(evalDir, "nn.bin"), "synthetic eval\n"),
  ]);

  const stageBasename = "teacher-stage";
  const stageRoot = path.join(publicationParent, stageBasename);
  const leaseRoot = path.join(
    publicationParent,
    `.${stageBasename}.authorization-lease`,
  );
  const controlRoot = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  );
  return frozenRecord({
    root,
    rootDev: rootStat.dev,
    rootIno: rootStat.ino,
    markerPath,
    marker,
    home,
    childTemporaryDirectory,
    keyPath,
    registryPath,
    controlRoot,
    activePath: path.join(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
    ),
    quarantineRoot: path.join(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
    ),
    retiredRoot: path.join(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
    ),
    stageRoot,
    leaseRoot,
    workPath: path.join(
      stageRoot,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    ),
    stage: frozenRecord({
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      roleBundleRoot,
      legacyProtectedPositionIdsPath: legacy,
      publicationParent,
      stageBasename,
      destinationBasename: "teacher-final",
      engineBin,
      engineReceipt,
      engineArgs: Object.freeze([engineArgument]),
      evalDir,
    }),
    training: frozenRecord({
      repositoryRoot,
      verifierRevision: "b".repeat(40),
      rawLockRoot,
      roleLockRoot,
      legacyProtectedPositionIdsPath: legacy,
      outputRoot: roleBundleRoot,
    }),
  });
}

async function createFixture(
  dependencies: Readonly<CapturedDependencies>,
  point: FloodgateV7ProductionPrefix100KillDrillPoint,
  signal: FloodgateV7ProductionPrefix100KillDrillSignal,
): Promise<Readonly<Fixture>> {
  let root: string | undefined;
  let rootStat: fs.BigIntStats | undefined;
  let markerPath: string | undefined;
  let marker: string | undefined;
  try {
    const createdPath = await fs.promises.mkdtemp(
      path.join(
        dependencies.temporaryParent,
        "floodgate-v7-prefix100-kill-drill-",
      ),
    );
    // Capture the created pathname and inode before canonicalization. If the
    // following realpath fails, rollback can still prove exactly which empty
    // current-EUID directory this invocation owns.
    root = createdPath;
    rootStat = await fs.promises.lstat(createdPath, { bigint: true });
    if (
      !rootStat.isDirectory() ||
      rootStat.isSymbolicLink() ||
      Number(rootStat.uid) !== dependencies.effectiveUserId
    ) {
      throw new Error("new kill drill fixture root identity differs");
    }
    const canonicalRoot =
      dependencies.fixtureRootRealpath === undefined
        ? await fs.promises.realpath(createdPath)
        : await dependencies.fixtureRootRealpath(createdPath, () =>
            fs.promises.realpath(createdPath),
          );
    if (canonicalRoot !== createdPath) {
      throw new Error("new kill drill fixture root is not canonical");
    }
    root = canonicalRoot;
    await fs.promises.chmod(root, 0o700);
    const privateRootStat = await fs.promises.lstat(root, { bigint: true });
    if (
      !privateRootStat.isDirectory() ||
      privateRootStat.isSymbolicLink() ||
      privateRootStat.dev !== rootStat.dev ||
      privateRootStat.ino !== rootStat.ino ||
      Number(privateRootStat.uid) !== dependencies.effectiveUserId ||
      Number(privateRootStat.mode & BigInt(0o7777)) !== 0o700
    ) {
      throw new Error("new kill drill fixture root differs");
    }
    rootStat = privateRootStat;
    marker = randomBytes(16).toString("hex");
    markerPath = path.join(root, MARKER_BASENAME);
    await write0600(markerPath, `${marker}\n`);
    return await populateFixture(
      dependencies,
      root,
      rootStat,
      markerPath,
      marker,
    );
  } catch {
    const removed =
      root === undefined
        ? true
        : await rollbackIncompleteFixture(
            dependencies,
            root,
            rootStat,
            markerPath,
            marker,
          );
    throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
      "fixture",
      point,
      signal,
      !removed,
    );
  }
}

async function snapshot(filePath: string): Promise<Readonly<Snapshot>> {
  const stat = await fs.promises.lstat(filePath, { bigint: true });
  if (stat.isSymbolicLink()) throw new Error("snapshot path is a symlink");
  const common = {
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    uid: Number(stat.uid),
    mode: Number(stat.mode & BigInt(0o7777)),
    nlink: Number(stat.nlink),
    size: stat.size.toString(),
  };
  if (stat.isDirectory()) {
    return frozenRecord({
      kind: "directory" as const,
      ...common,
      sha256: null,
      entries: Object.freeze((await fs.promises.readdir(filePath)).sort()),
    });
  }
  if (!stat.isFile()) throw new Error("snapshot path is not a file");
  const descriptor = await fs.promises.open(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const held = await descriptor.stat({ bigint: true });
    if (held.dev !== stat.dev || held.ino !== stat.ino) {
      throw new Error("snapshot path identity changed");
    }
    const bytes = await descriptor.readFile();
    return frozenRecord({
      kind: "file" as const,
      ...common,
      sha256: sha256(bytes),
      entries: null,
    });
  } finally {
    await descriptor.close();
  }
}

async function missing(filePath: string): Promise<boolean> {
  try {
    await fs.promises.lstat(filePath);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

function sameSnapshot(
  left: Readonly<Snapshot>,
  right: Readonly<Snapshot>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function childConfig(
  fixture: Readonly<Fixture>,
  caseId: string,
  point: FloodgateV7ProductionPrefix100KillDrillPoint,
  mode: "arm" | "outer-probe" | "stage-probe",
  dependencies: Readonly<CapturedDependencies>,
): Readonly<Record<string, unknown>> {
  return frozenRecord({
    protocol: FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CHILD_PROTOCOL,
    mode,
    case_id: caseId,
    point,
    effective_user_id: dependencies.effectiveUserId,
    fixture_root: fixture.root,
    home: fixture.home,
    key_path: fixture.keyPath,
    stage: fixture.stage,
    training: fixture.training,
  });
}

function configuredChildConfig(
  fixture: Readonly<Fixture>,
  caseId: string,
  point: FloodgateV7ProductionPrefix100KillDrillPoint,
  mode: "arm" | "outer-probe" | "stage-probe",
  dependencies: Readonly<CapturedDependencies>,
): Readonly<Record<string, unknown>> {
  const fixed = childConfig(fixture, caseId, point, mode, dependencies);
  if (dependencies.mutateChildConfig === undefined) return fixed;
  const mutated = dependencies.mutateChildConfig(
    fixed,
    frozenRecord({ mode, point }),
  );
  if (
    mutated === null ||
    typeof mutated !== "object" ||
    Array.isArray(mutated)
  ) {
    throw new Error("mutated child config differs");
  }
  return mutated;
}

function strictChildMessage(value: unknown): Readonly<ChildMessage> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("kill drill child message differs");
  }
  const record = value as Record<string, unknown>;
  if (
    record.protocol !==
      FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CHILD_PROTOCOL ||
    !["armed", "outer-probe-pass", "stage-probe-pass", "failure"].includes(
      String(record.type),
    )
  ) {
    throw new Error("kill drill child message differs");
  }
  return value as ChildMessage;
}

function spawnChild(
  dependencies: Readonly<CapturedDependencies>,
  temporaryDirectory: string,
): Readonly<{
  child: ChildProcess;
  output: () => Readonly<{ stdout: number; stderr: number }>;
}> {
  const child = spawn(
    dependencies.nodeExecutable,
    ["-r", "tsx/cjs", dependencies.childModulePath],
    {
      cwd: path.resolve(path.dirname(SCRIPT_PATH), ".."),
      env: {
        HOME: "",
        LANG: "C",
        LC_ALL: "C",
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        TMPDIR: temporaryDirectory,
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe", "ipc"] as const,
    },
  );
  let stdout = 0;
  let stderr = 0;
  const onStdout = (chunk: Buffer): void => {
    stdout += chunk.byteLength;
    if (stdout > MAX_CHILD_OUTPUT_BYTES) child.kill("SIGKILL");
  };
  const onStderr = (chunk: Buffer): void => {
    stderr += chunk.byteLength;
    if (stderr > MAX_CHILD_OUTPUT_BYTES) child.kill("SIGKILL");
  };
  child.stdout?.on("data", onStdout);
  child.stderr?.on("data", onStderr);
  registerChildCloseObservation(child, () => {
    child.stdout?.removeListener("data", onStdout);
    child.stderr?.removeListener("data", onStderr);
  });
  return frozenRecord({
    child,
    output: () => frozenRecord({ stdout, stderr }),
  });
}

function registerChildCloseObservation(
  child: ChildProcess,
  cleanup: () => void,
): void {
  let resolveClose!: (receipt: Readonly<ChildExitReceipt>) => void;
  const observation: ChildCloseObservation = {
    closed: false,
    receipt: undefined,
    promise: new Promise((resolve) => {
      resolveClose = resolve;
    }),
  };
  const onError = (): void => {
    // A spawn/IPC error is consumed by the active operation. The close event
    // remains the authoritative proof that no child process is left running.
  };
  const onClose = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    child.removeListener("error", onError);
    cleanup();
    const receipt = frozenRecord({ code, signal });
    observation.closed = true;
    observation.receipt = receipt;
    resolveClose(receipt);
  };
  child.on("error", onError);
  child.once("close", onClose);
  childCloseObservations.set(child, observation);
}

function waitForMessage(
  child: ChildProcess,
  timeoutMilliseconds: number,
): Promise<Readonly<ChildMessage>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("kill drill child message timed out"));
    }, timeoutMilliseconds);
    const onMessage = (value: unknown): void => {
      try {
        const message = strictChildMessage(value);
        cleanup();
        resolve(message);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const onExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      cleanup();
      reject(
        new Error(
          `kill drill child exited before its message: ${String(code)}:${String(signal)}`,
        ),
      );
    };
    const onError = (): void => {
      cleanup();
      reject(new Error("kill drill child process failed"));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      child.removeListener("message", onMessage);
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
    };
    child.once("message", onMessage);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function waitForExit(
  child: ChildProcess,
  timeoutMilliseconds: number,
): Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>> {
  const observation = childCloseObservations.get(child);
  if (observation === undefined) {
    return Promise.reject(new Error("kill drill child was not observed"));
  }
  if (observation.closed && observation.receipt !== undefined) {
    return Promise.resolve(observation.receipt);
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("kill drill child exit timed out"));
    }, timeoutMilliseconds);
    void observation.promise.then((receipt) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(receipt);
    });
  });
}

async function terminateAndConfirmExit(
  child: ChildProcess,
  timeoutMilliseconds: number,
): Promise<Readonly<ChildExitReceipt>> {
  const observation = childCloseObservations.get(child);
  if (observation === undefined) {
    throw new Error("kill drill child termination observation differs");
  }
  if (observation.closed && observation.receipt !== undefined) {
    return observation.receipt;
  }
  let lastFailure: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      child.kill("SIGKILL");
    } catch (error) {
      lastFailure = error;
    }
    try {
      return await waitForExit(child, timeoutMilliseconds);
    } catch (error) {
      lastFailure = error;
    }
  }
  void lastFailure;
  throw new Error("kill drill child termination was not confirmed");
}

async function terminateAndRethrow(
  child: ChildProcess,
  timeoutMilliseconds: number,
  originalFailure: unknown,
): Promise<never> {
  try {
    await terminateAndConfirmExit(child, timeoutMilliseconds);
  } catch {
    throw new Error("kill drill child cleanup was not confirmed");
  }
  throw originalFailure;
}

function sendChildConfig(
  child: ChildProcess,
  config: Readonly<Record<string, unknown>>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (child.send === undefined || !child.connected) {
      reject(new Error("kill drill child IPC is unavailable"));
      return;
    }
    child.send(config, (error) => {
      if (error === null) resolve();
      else reject(new Error("kill drill child IPC send failed"));
    });
  });
}

async function startAndReceive(
  config: Readonly<Record<string, unknown>>,
  dependencies: Readonly<CapturedDependencies>,
  timeoutMilliseconds: number,
  temporaryDirectory: string,
): Promise<
  Readonly<{
    child: ChildProcess;
    message: Readonly<ChildMessage>;
    output: () => Readonly<{ stdout: number; stderr: number }>;
  }>
> {
  if (
    !pathInside(dependencies.temporaryParent, temporaryDirectory) ||
    fs.realpathSync(temporaryDirectory) !== temporaryDirectory
  ) {
    throw new Error("kill drill child temporary directory differs");
  }
  const running = spawnChild(dependencies, temporaryDirectory);
  const messagePromise = waitForMessage(running.child, timeoutMilliseconds);
  try {
    const [message] = await Promise.all([
      messagePromise,
      sendChildConfig(running.child, config),
    ]);
    return frozenRecord({ ...running, message });
  } catch (error) {
    return terminateAndRethrow(
      running.child,
      dependencies.exitTimeoutMilliseconds,
      error,
    );
  }
}

function lockStatus(
  fixture: Readonly<Fixture>,
  dependencies: Readonly<CapturedDependencies>,
): number | null {
  const descriptor = fs.openSync(
    fixture.registryPath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    return spawnSync(dependencies.lockfPath, ["-s", "-t", "0", "3"], {
      cwd: "/",
      env: { NODE_ENV: process.env.NODE_ENV ?? "test" },
      stdio: ["ignore", "ignore", "ignore", descriptor],
    }).status;
  } finally {
    fs.closeSync(descriptor);
  }
}

async function waitForLockRelease(
  fixture: Readonly<Fixture>,
  dependencies: Readonly<CapturedDependencies>,
): Promise<void> {
  const deadline = Date.now() + dependencies.probeTimeoutMilliseconds;
  for (;;) {
    const status = lockStatus(fixture, dependencies);
    if (status === 0) return;
    if (status !== 75 || Date.now() >= deadline) {
      throw new Error("kill drill OS lock did not release");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function runProbe(
  fixture: Readonly<Fixture>,
  caseId: string,
  point: FloodgateV7ProductionPrefix100KillDrillPoint,
  mode: "outer-probe" | "stage-probe",
  expectedType: "outer-probe-pass" | "stage-probe-pass",
  dependencies: Readonly<CapturedDependencies>,
): Promise<void> {
  const running = await startAndReceive(
    configuredChildConfig(fixture, caseId, point, mode, dependencies),
    dependencies,
    dependencies.probeTimeoutMilliseconds,
    fixture.childTemporaryDirectory,
  );
  try {
    if (
      running.message.type !== expectedType ||
      running.message.case_id !== caseId
    ) {
      throw new Error(
        `kill drill probe receipt differs: ${running.message.type}:${running.message.failure_kind ?? "none"}`,
      );
    }
    const exit = await waitForExit(
      running.child,
      dependencies.exitTimeoutMilliseconds,
    );
    const output = running.output();
    if (
      exit.code !== 0 ||
      exit.signal !== null ||
      output.stdout !== 0 ||
      output.stderr !== 0
    ) {
      throw new Error("kill drill probe process differed");
    }
  } catch (error) {
    return terminateAndRethrow(
      running.child,
      dependencies.exitTimeoutMilliseconds,
      error,
    );
  }
}

async function cleanupFixture(fixture: Readonly<Fixture>): Promise<void> {
  const root = await fs.promises.lstat(fixture.root, { bigint: true });
  if (
    root.dev !== fixture.rootDev ||
    root.ino !== fixture.rootIno ||
    (await fs.promises.readFile(fixture.markerPath, "utf8")) !==
      `${fixture.marker}\n`
  ) {
    throw new Error("kill drill fixture cleanup identity differs");
  }
  await fs.promises.rm(fixture.root, { recursive: true, force: false });
}

async function runCase(
  point: FloodgateV7ProductionPrefix100KillDrillPoint,
  signal: FloodgateV7ProductionPrefix100KillDrillSignal,
  dependencies: Readonly<CapturedDependencies>,
): Promise<Readonly<FloodgateV7ProductionPrefix100KillDrillCaseReceipt>> {
  const fixture = await createFixture(dependencies, point, signal);
  const caseId = randomBytes(16).toString("hex");
  let child: ChildProcess | undefined;
  let phase: FloodgateV7ProductionPrefix100KillDrillFailurePhase = "arm";
  let evidenceComplete = false;
  try {
    const keyBefore = await snapshot(fixture.keyPath);
    const registryBefore = await snapshot(fixture.registryPath);
    const running = await startAndReceive(
      configuredChildConfig(fixture, caseId, point, "arm", dependencies),
      dependencies,
      dependencies.armTimeoutMilliseconds,
      fixture.childTemporaryDirectory,
    );
    child = running.child;
    if (
      running.message.type !== "armed" ||
      running.message.case_id !== caseId ||
      running.message.point !== point
    ) {
      throw new Error(
        `kill drill armed receipt differs: ${running.message.type}:${running.message.failure_kind ?? "none"}`,
      );
    }
    phase = "armed-evidence";
    if (lockStatus(fixture, dependencies) !== 75) {
      throw new Error("kill drill OS lock was not contended while armed");
    }
    const activeBefore = await snapshot(fixture.activePath);
    if (
      activeBefore.kind !== "file" ||
      BigInt(activeBefore.size) <= BigInt(0)
    ) {
      throw new Error("kill drill active evidence differs");
    }
    const quarantineBefore = await snapshot(fixture.quarantineRoot);
    const retiredBefore = await snapshot(fixture.retiredRoot);
    if (
      quarantineBefore.entries?.length !== 0 ||
      retiredBefore.entries?.length !== 0
    ) {
      throw new Error("kill drill control namespace was not pristine");
    }
    let stageBefore: Readonly<Snapshot> | undefined;
    let leaseBefore: Readonly<Snapshot> | undefined;
    let workBefore: Readonly<Snapshot> | undefined;
    if (point === "outer-active-durable") {
      if (
        !(await missing(fixture.stageRoot)) ||
        !(await missing(fixture.leaseRoot)) ||
        !(await missing(fixture.workPath))
      ) {
        throw new Error("outer kill point created an inner namespace");
      }
    } else {
      stageBefore = await snapshot(fixture.stageRoot);
      leaseBefore = await snapshot(fixture.leaseRoot);
      if (
        stageBefore.kind !== "directory" ||
        leaseBefore.kind !== "directory"
      ) {
        throw new Error("stage kill point identities differ");
      }
      if (point === "stage-lease-durable") {
        if (
          !(await missing(fixture.workPath)) ||
          stageBefore.entries?.length !== 0
        ) {
          throw new Error("stage kill point wrote checkpoint data");
        }
      } else {
        workBefore = await snapshot(fixture.workPath);
        if (
          workBefore.kind !== "file" ||
          workBefore.size !== "1" ||
          stageBefore.entries?.join("\0") !==
            FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME
        ) {
          throw new Error("checkpoint first-byte kill point differs");
        }
      }
    }

    await dependencies.afterEvidenceArmed?.(frozenRecord({ point, signal }));

    phase = "signal";
    const exitPromise = waitForExit(
      child,
      dependencies.exitTimeoutMilliseconds,
    );
    if (!child.kill(signal)) throw new Error("kill drill signal was not sent");
    phase = "process-death";
    const exit = await exitPromise;
    if (exit.code !== null || exit.signal !== signal) {
      throw new Error("kill drill child exit signal differs");
    }
    const output = running.output();
    if (output.stdout !== 0 || output.stderr !== 0) {
      throw new Error("kill drill child emitted output");
    }
    await waitForLockRelease(fixture, dependencies);
    phase = "outer-probe";
    await runProbe(
      fixture,
      caseId,
      point,
      "outer-probe",
      "outer-probe-pass",
      dependencies,
    );
    if (point !== "outer-active-durable") {
      phase = "stage-probe";
      await runProbe(
        fixture,
        caseId,
        point,
        "stage-probe",
        "stage-probe-pass",
        dependencies,
      );
    }
    if (lockStatus(fixture, dependencies) !== 0) {
      throw new Error("kill drill probes retained the OS lock");
    }

    phase = "final-evidence";
    if (
      !sameSnapshot(keyBefore, await snapshot(fixture.keyPath)) ||
      !sameSnapshot(registryBefore, await snapshot(fixture.registryPath)) ||
      !sameSnapshot(activeBefore, await snapshot(fixture.activePath)) ||
      !sameSnapshot(quarantineBefore, await snapshot(fixture.quarantineRoot)) ||
      !sameSnapshot(retiredBefore, await snapshot(fixture.retiredRoot))
    ) {
      throw new Error("kill drill outer evidence changed after fresh probes");
    }
    if (point === "outer-active-durable") {
      if (
        !(await missing(fixture.stageRoot)) ||
        !(await missing(fixture.leaseRoot)) ||
        !(await missing(fixture.workPath))
      ) {
        throw new Error("fresh outer probes mutated the inner namespace");
      }
    } else if (
      stageBefore === undefined ||
      leaseBefore === undefined ||
      !sameSnapshot(stageBefore, await snapshot(fixture.stageRoot)) ||
      !sameSnapshot(leaseBefore, await snapshot(fixture.leaseRoot))
    ) {
      throw new Error("fresh probes mutated stage evidence");
    }
    if (
      workBefore !== undefined &&
      !sameSnapshot(workBefore, await snapshot(fixture.workPath))
    ) {
      throw new Error("fresh probes mutated partial checkpoint evidence");
    }

    evidenceComplete = true;
    return frozenRecord({
      point,
      signal,
      exit_signal: signal,
      lock_contended_before_death: true as const,
      lock_released_after_death: true as const,
      authenticated_outer_stale_blocked_all_gates: true as const,
      inner_lease_eexist_blocked: point !== "outer-active-durable",
      filesystem_snapshot_preserved: true as const,
    });
  } catch (error) {
    if (
      error instanceof
      FloodgateV7ProductionPrefix100KillDrillManualReconciliationError
    ) {
      throw error;
    }
    throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
      phase,
      point,
      signal,
      true,
    );
  } finally {
    if (child !== undefined) {
      try {
        await terminateAndConfirmExit(
          child,
          dependencies.exitTimeoutMilliseconds,
        );
      } catch {
        throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
          phase,
          point,
          signal,
          true,
        );
      }
    }
    if (evidenceComplete) {
      try {
        await cleanupFixture(fixture);
      } catch {
        throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
          "cleanup",
          point,
          signal,
          true,
        );
      }
    }
  }
}

async function runCaptured(
  dependencies: Readonly<CapturedDependencies>,
): Promise<Readonly<FloodgateV7ProductionPrefix100KillDrillReceipt>> {
  if (process.platform !== "darwin") {
    throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
      "capture",
      null,
      null,
      false,
    );
  }
  if (process.version !== REQUIRED_NODE_VERSION) {
    throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
      "capture",
      null,
      null,
      false,
    );
  }
  const cases: Readonly<FloodgateV7ProductionPrefix100KillDrillCaseReceipt>[] =
    [];
  for (const point of FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_POINTS) {
    for (const signal of FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_SIGNALS) {
      try {
        cases.push(await runCase(point, signal, dependencies));
      } catch (error) {
        if (
          error instanceof
          FloodgateV7ProductionPrefix100KillDrillManualReconciliationError
        ) {
          throw error;
        }
        throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
          "final-evidence",
          point,
          signal,
          true,
        );
      }
    }
  }
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_STATUS,
    execution_boundary:
      FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_EXECUTION_BOUNDARY,
    cases: Object.freeze(cases),
    verification: frozenRecord({
      six_cases_passed: true as const,
      disposable_fixture_confined: true as const,
      test_only_seams: true as const,
      no_production_gate_invoked: true as const,
      no_delete_truncate_or_repair_before_evidence: true as const,
      parent_fixture_key_buffer_zeroized_after_use: true as const,
    }),
    nonclaims: frozenRecord({
      production_prefix_100: false as const,
      production_recovery: false as const,
      power_loss_or_reboot: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

/** Test-only fixed-anchor setup seam; no path is returned or disclosed. */
export function runFloodgateV7ProductionPrefix100FixedAnchorSetupCoreForTests(
  value: FloodgateV7ProductionPrefix100FixedAnchorSetupDependenciesForTests,
): Readonly<FloodgateV7ProductionPrefix100FixedAnchorSetupReceipt> {
  try {
    if (arguments.length !== 1 || value === null || typeof value !== "object") {
      throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
        "capture",
        null,
        null,
        false,
      );
    }
    const allowed = new Set([
      "afterInitialIdentityForTests",
      "effectiveUserId",
      "fixedParent",
      "initialLstatForTests",
      "parentRealpathForTests",
    ]);
    if (
      Reflect.ownKeys(value).some(
        (key) => typeof key !== "string" || !allowed.has(key),
      ) ||
      typeof process.geteuid !== "function" ||
      value.effectiveUserId !== process.geteuid() ||
      !path.isAbsolute(value.fixedParent) ||
      path.resolve(value.fixedParent) !== value.fixedParent ||
      fs.realpathSync(value.fixedParent) !== value.fixedParent ||
      (value.parentRealpathForTests !== undefined &&
        typeof value.parentRealpathForTests !== "function") ||
      (value.initialLstatForTests !== undefined &&
        typeof value.initialLstatForTests !== "function") ||
      (value.afterInitialIdentityForTests !== undefined &&
        typeof value.afterInitialIdentityForTests !== "function")
    ) {
      throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
        "capture",
        null,
        null,
        false,
      );
    }
    privateDirectoryStat(value.fixedParent, value.effectiveUserId);
    const productionHome = fs.realpathSync(os.userInfo().homedir);
    if (
      sameOrContains(value.fixedParent, productionHome) ||
      sameOrContains(productionHome, value.fixedParent)
    ) {
      throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
        "capture",
        null,
        null,
        false,
      );
    }
    const anchor = createFixedPrivateAnchor(
      value.effectiveUserId,
      value.fixedParent,
      {
        parentRealpath: value.parentRealpathForTests,
        initialLstat: value.initialLstatForTests,
        afterInitialIdentity: value.afterInitialIdentityForTests,
      },
    );
    try {
      cleanupFixedPrivateAnchor(anchor);
    } catch {
      throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
        "cleanup",
        null,
        null,
        true,
      );
    }
    return frozenRecord({
      contract:
        "shogi-floodgate-v7-production-prefix-100-fixed-anchor-setup-test-v1" as const,
      status: "private-anchor-created-and-exactly-removed" as const,
      verification: frozenRecord({
        fixed_parent_canonical_private_current_euid: true as const,
        anchor_initial_identity_captured_before_later_setup: true as const,
        exact_anchor_removed: true as const,
      }),
      nonclaims: frozenRecord({
        production_gate: false as const,
        private_path_disclosed: false as const,
      }),
    });
  } catch (error) {
    if (
      error instanceof
      FloodgateV7ProductionPrefix100KillDrillManualReconciliationError
    ) {
      throw error;
    }
    throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
      "capture",
      null,
      null,
      false,
    );
  }
}

/** Dependency-injected disposable boundary for unit tests only. */
export function runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
  dependenciesValue: FloodgateV7ProductionPrefix100KillDrillDependenciesForTests,
): Promise<Readonly<FloodgateV7ProductionPrefix100KillDrillReceipt>> {
  if (arguments.length !== 1) {
    return Promise.reject(
      new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
        "capture",
        null,
        null,
        false,
      ),
    );
  }
  let dependencies: Readonly<CapturedDependencies>;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return Promise.reject(
      new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
        "capture",
        null,
        null,
        false,
      ),
    );
  }
  return runCaptured(dependencies);
}

/** Fixed zero-argument disposable drill. It never targets the production home. */
export function runFloodgateV7ProductionPrefix100DisposableKillDrill(): Promise<
  Readonly<FloodgateV7ProductionPrefix100KillDrillReceipt>
> {
  if (arguments.length !== 0 || typeof process.geteuid !== "function") {
    return Promise.reject(
      new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
        "capture",
        null,
        null,
        false,
      ),
    );
  }
  const effectiveUserId = process.geteuid();
  let anchor: FixedPrivateAnchor;
  try {
    anchor = createFixedPrivateAnchor(effectiveUserId);
  } catch (error) {
    return Promise.reject(
      error instanceof
        FloodgateV7ProductionPrefix100KillDrillManualReconciliationError
        ? error
        : new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
            "fixture",
            null,
            null,
            true,
          ),
    );
  }
  let dependencies: Readonly<CapturedDependencies>;
  try {
    dependencies = captureDependencies({
      effectiveUserId,
      temporaryParent: anchor.root,
      nodeExecutable: process.execPath,
      childModulePath: DEFAULT_CHILD_PATH,
      lockfPath: "/usr/bin/lockf",
    });
  } catch {
    try {
      cleanupFixedPrivateAnchor(anchor);
    } catch {
      return Promise.reject(
        new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
          "cleanup",
          null,
          null,
          true,
        ),
      );
    }
    return Promise.reject(
      new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
        "capture",
        null,
        null,
        false,
      ),
    );
  }
  return runCaptured(dependencies).then(
    (receipt) => {
      try {
        cleanupFixedPrivateAnchor(anchor);
      } catch {
        throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
          "cleanup",
          null,
          null,
          true,
        );
      }
      return receipt;
    },
    (error: unknown) => {
      const typed =
        error instanceof
        FloodgateV7ProductionPrefix100KillDrillManualReconciliationError
          ? error
          : new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
              "final-evidence",
              null,
              null,
              true,
            );
      if (!typed.fixture_preserved) {
        try {
          cleanupFixedPrivateAnchor(anchor);
        } catch {
          throw new FloodgateV7ProductionPrefix100KillDrillManualReconciliationError(
            "cleanup",
            typed.point,
            typed.signal,
            true,
          );
        }
      }
      throw typed;
    },
  );
}

// The raw training file is created only inside each disposable fixture.
void FLOODGATE_TRAINING_RAW_FILENAME;
