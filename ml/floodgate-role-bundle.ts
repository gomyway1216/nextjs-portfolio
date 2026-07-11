/**
 * Label-free publication boundary for the preregistered Floodgate roles.
 *
 * The bundle recovers only the strong game's played move from authenticated
 * CSA bytes. It never reads teacher/candidate scores or labeled holdouts. The
 * three role assignments are inherited unchanged from a fully reproduced role
 * lock, and the final manifest is the sole completion marker.
 */

import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  isDeepStrictEqual,
  promisify,
  types as nodeUtilTypes,
} from "node:util";

import {
  durableCreateNoClobber,
  floodgateCanonicalUrlGameId,
  floodgateRawObjectPath,
  serializeFloodgateRawLockManifest,
  verifyExistingFloodgateRawObject,
  FLOODGATE_RAW_LOCK_GAME_ID_DOMAIN,
  type FloodgateDurableCreatePhase,
  type FloodgateDurableLinkedFileIdentity,
  type FloodgateRawCsaIndexEntry,
} from "./floodgate-raw-lock";
import {
  buildFloodgateReplayExclusionUnion,
  FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
  type FloodgateReplayExclusionUnionArtifact,
  type FloodgateReplayExclusionUnionReceipt,
} from "./floodgate-replay-exclusion";
import {
  FLOODGATE_GIT_COMMAND_PREFIX,
  FLOODGATE_GIT_EXECUTABLE,
  assertFloodgateGitTrackedTreeMatchesHead,
  floodgateGitEnvironment,
  floodgateGitTrackedEntriesAreOrdinary,
} from "./floodgate-git";
import {
  assertExistingFloodgateRoleLockFilesystemClosure,
  FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_PATH,
  FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_SHA256,
  verifyExistingFloodgateRoleLock,
  type FloodgateRoleLockFilesystemClosure,
  type VerifiedFloodgateRoleLock,
  type VerifyExistingFloodgateRoleLockOptions,
} from "./floodgate-role-lock";
import {
  DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
  FLOODGATE_PARENTS_PER_GAME,
  FLOODGATE_ROLE_PRIORITY,
  floodgateIdentifierDigest,
  type FloodgatePureAllocationArtifact,
  type FloodgateRole,
} from "./floodgate-roles";
import { parseFloodgateCsa } from "./import-csa-games";
import { compareBytewise, positionKeyFromSfen } from "./sibling-data";

export const FLOODGATE_ROLE_BUNDLE_SCHEMA =
  "shogi-floodgate-label-free-role-bundle-v1" as const;
export const FLOODGATE_ROLE_BUNDLE_MINIMUM_PRODUCER_REVISION =
  "2a4e94697c2a673c217348b9a9d79d9ce54d0c97" as const;
export const FLOODGATE_ROLE_BUNDLE_INVALID_MANIFEST_SENTINEL = "!" as const;
export const FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT =
  "shogi-floodgate-label-free-raw-parent-jsonl-v1" as const;
export const FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME = "manifest.json" as const;
export const FLOODGATE_ROLE_BUNDLE_REPLAY_FILENAME =
  "replay-excluded-position-ids.txt" as const;
export const FLOODGATE_ROLE_BUNDLE_REPLAY_RECEIPT_FILENAME =
  "replay-exclusion-receipt.json" as const;
export const FLOODGATE_ROLE_BUNDLE_CAS_READ_CONCURRENCY = 16 as const;

const REVISION_RE = /^[0-9a-f]{40}$/;
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;
const execFile = promisify(execFileCallback);
const ROLE_FILENAMES: Readonly<
  Record<FloodgateRole, Readonly<{ raw: string; protected: string }>>
> = Object.freeze({
  fresh_final_holdout: Object.freeze({
    raw: "fresh-final-holdout.raw.jsonl",
    protected: "fresh-final-holdout.protected-position-ids.txt",
  }),
  fresh_selection: Object.freeze({
    raw: "fresh-selection.raw.jsonl",
    protected: "fresh-selection.protected-position-ids.txt",
  }),
  training: Object.freeze({
    raw: "training.raw.jsonl",
    protected: "training.protected-position-ids.txt",
  }),
});

export interface FloodgateRoleBundleFileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateRoleBundleRawParent {
  readonly schema_version: 1;
  readonly source: "floodgate";
  readonly source_url: string;
  readonly game_sha256: string;
  readonly game_id: string;
  readonly parent_id: string;
  readonly position_id: string;
  readonly parent_sfen: string;
  readonly ply: number;
  readonly played_move: string;
}

export interface FloodgateRoleBundleRawIdentity
  extends FloodgateRoleBundleFileIdentity {
  readonly format: typeof FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT;
  readonly records: number;
  readonly games: number;
  readonly game_ids_sha256: string;
  readonly parent_ids_sha256: string;
  readonly position_ids_count: number;
  readonly position_ids_sha256: string;
}

export interface FloodgateRoleBundleProtectedIdentity
  extends FloodgateRoleBundleFileIdentity {
  readonly format: typeof FLOODGATE_PROTECTED_POSITION_ID_FORMAT;
  readonly count: number;
  readonly identifiers_sha256: string;
}

export interface FloodgateRoleBundleRoleArtifact {
  readonly rows: readonly FloodgateRoleBundleRawParent[];
  readonly rawText: string;
  readonly rawIdentity: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly protectedIdentifiers: readonly string[];
  readonly protectedText: string;
  readonly protectedIdentity: Readonly<FloodgateRoleBundleProtectedIdentity>;
}

export interface FloodgateRoleBundleManifest {
  readonly schema: typeof FLOODGATE_ROLE_BUNDLE_SCHEMA;
  readonly status: "complete-label-free-role-bundle";
  readonly provenance: {
    readonly network_requests: 0;
    readonly teacher_or_candidate_scores_read: false;
    readonly labeled_selection_read: false;
    readonly labeled_final_holdout_read: false;
    readonly role_allocation_changed: false;
  };
  readonly pipeline: {
    readonly source_revision: string;
    readonly tracked_tree_clean: true;
  };
  readonly sources: {
    readonly raw_lock: {
      readonly manifest: FloodgateRoleBundleFileIdentity;
      readonly source_revision: string;
    };
    readonly role_lock: {
      readonly manifest: FloodgateRoleBundleFileIdentity;
      readonly allocation: FloodgateRoleBundleFileIdentity;
      readonly result_receipt: FloodgateRoleBundleFileIdentity;
      readonly producer_revision: string;
      readonly verifier_revision: string;
    };
    readonly legacy_replay_exclusion: FloodgateRoleBundleProtectedIdentity;
  };
  readonly contract: {
    readonly role_priority: typeof FLOODGATE_ROLE_PRIORITY;
    readonly role_game_counts: typeof DEFAULT_FLOODGATE_ROLE_GAME_COUNTS;
    readonly parents_per_game: typeof FLOODGATE_PARENTS_PER_GAME;
    readonly raw_parent_format: typeof FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT;
    readonly game_id_domain: typeof FLOODGATE_RAW_LOCK_GAME_ID_DOMAIN;
    readonly canonical_duplicate_policy: "lowest-utf8-bytewise-url-per-body";
    readonly played_move_source: "authenticated-csa-move-at-allocated-ply";
    readonly cas_read_concurrency: typeof FLOODGATE_ROLE_BUNDLE_CAS_READ_CONCURRENCY;
    readonly replay_components: readonly [
      "legacy",
      "fresh_final_holdout",
      "fresh_selection",
    ];
    readonly training_in_replay_exclusion: false;
  };
  readonly roles: Readonly<
    Record<
      FloodgateRole,
      Readonly<{
        raw_parents: FloodgateRoleBundleRawIdentity;
        protected_position_ids: FloodgateRoleBundleProtectedIdentity;
      }>
    >
  >;
  readonly replay_exclusion: {
    readonly identifiers: FloodgateRoleBundleProtectedIdentity;
    readonly receipt: FloodgateRoleBundleFileIdentity;
    readonly summary: FloodgateReplayExclusionUnionReceipt;
  };
  readonly isolation: {
    readonly legacy_and_fresh_final: 0;
    readonly legacy_and_fresh_selection: 0;
    readonly fresh_final_and_fresh_selection: 0;
    readonly all_three: 0;
    readonly duplicate_memberships: 0;
    readonly cross_role_game_ids: 0;
    readonly cross_role_parent_ids: 0;
    readonly training_in_replay_exclusion: 0;
  };
}

export interface CreateFloodgateRoleBundleOptions
  extends VerifyExistingFloodgateRoleLockOptions {
  readonly outputRoot: string;
}

export interface VerifyExistingFloodgateRoleBundleOptions
  extends VerifyExistingFloodgateRoleLockOptions {
  readonly outputRoot: string;
}

export interface VerifiedFloodgateRoleBundle {
  readonly manifest: Readonly<FloodgateRoleBundleManifest>;
  readonly manifestText: string;
  readonly roleLock: Readonly<VerifiedFloodgateRoleLock>;
  readonly producerRevision: string;
  readonly verifierRevision: string;
}

interface RoleBundleBuild {
  readonly manifest: Readonly<FloodgateRoleBundleManifest>;
  readonly manifestText: string;
  readonly roles: Readonly<
    Record<FloodgateRole, FloodgateRoleBundleRoleArtifact>
  >;
  readonly replay: FloodgateReplayExclusionUnionArtifact;
  readonly replayIdentity: Readonly<FloodgateRoleBundleProtectedIdentity>;
  readonly replayReceiptIdentity: Readonly<FloodgateRoleBundleFileIdentity>;
  readonly files: ReadonlyMap<string, string>;
}

type RoleAllocationView = Pick<
  FloodgatePureAllocationArtifact["output"],
  "roles" | "role_summaries"
>;

function fail(message: string): never {
  throw new Error(`invalid Floodgate role bundle: ${message}`);
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value !== null && typeof value === "object") {
    const object = value as object;
    if (!seen.has(object)) {
      seen.add(object);
      for (const key of Reflect.ownKeys(object)) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (descriptor && "value" in descriptor)
          deepFreeze(descriptor.value, seen);
      }
      Object.freeze(object);
    }
  }
  return value;
}

function strictObject(value: unknown, label: string): Record<string, unknown> {
  if (
    nodeUtilTypes.isProxy(value) ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    fail(`${label} must be a non-Proxy plain object without symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`${label}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.getOwnPropertyNames(value).sort(compareBytewise);
  const wanted = [...expected].sort(compareBytewise);
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys are not exact`);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index))
        fail("canonical JSON rejects sparse arrays");
    }
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort(compareBytewise);
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return fail(`canonical JSON does not support ${typeof value}`);
}

function canonicalAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value.includes("\0") ||
    path.resolve(value) !== value ||
    path.parse(value).root === value
  ) {
    fail(`${label} must be a canonical non-root absolute path`);
  }
  return value;
}

function pathInsideOrEqual(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function assertDisjointTrees(left: string, right: string, label: string): void {
  if (pathInsideOrEqual(left, right) || pathInsideOrEqual(right, left)) {
    fail(`${label} must be disjoint directory trees`);
  }
}

interface RegularFileReadSnapshot {
  readonly bytes: Uint8Array;
  readonly identity: Readonly<RegularFileSnapshot>;
}

async function readRegularFileSnapshotNoFollow(
  filePath: string,
): Promise<Readonly<RegularFileReadSnapshot>> {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") fail("production requires O_NOFOLLOW");
  if ((await fs.promises.realpath(filePath)) !== filePath) {
    fail(`${filePath} must not traverse symbolic links`);
  }
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_RDONLY | noFollow,
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail(`${filePath} must be a regular file`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const beforeSnapshot = regularFileSnapshot(before);
    const afterSnapshot = regularFileSnapshot(after);
    if (
      !sameRegularFileSnapshot(beforeSnapshot, afterSnapshot) ||
      BigInt(bytes.byteLength) !== after.size
    ) {
      fail(`${filePath} changed while it was being read`);
    }
    const pathStat = await fs.promises.lstat(filePath, { bigint: true });
    if (
      !pathStat.isFile() ||
      pathStat.isSymbolicLink() ||
      !sameRegularFileSnapshot(regularFileSnapshot(pathStat), afterSnapshot)
    ) {
      fail(`${filePath} path changed while it was being read`);
    }
    return Object.freeze({
      bytes: new Uint8Array(bytes),
      identity: afterSnapshot,
    });
  } finally {
    await handle.close();
  }
}

async function readRegularFileNoFollow(filePath: string): Promise<Uint8Array> {
  return (await readRegularFileSnapshotNoFollow(filePath)).bytes;
}

function fatalUtf8(bytes: Uint8Array, label: string): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    return fail(`${label} is not fatal-valid UTF-8`);
  }
  if (text.startsWith("\ufeff") || text.includes("\0") || text.includes("\r")) {
    fail(`${label} contains forbidden framing`);
  }
  return text;
}

function parseCanonicalManifest(bytes: Uint8Array): unknown {
  const text = fatalUtf8(bytes, "role-bundle manifest");
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    fail("role-bundle manifest must have exactly one final LF");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(0, -1)) as unknown;
  } catch {
    return fail("role-bundle manifest is not valid JSON");
  }
  if (`${canonicalJson(parsed)}\n` !== text) {
    fail("role-bundle manifest is not canonical JSON");
  }
  return deepFreeze(parsed);
}

interface HistoricalRoleBundleRevisionBinding {
  readonly bundleProducerRevision: string;
  readonly roleLockProducerRevision: string;
  readonly rawLockSourceRevision: string;
}

function manifestRevision(value: unknown, label: string): string {
  if (typeof value !== "string" || !REVISION_RE.test(value)) {
    fail(`${label} must be a full lowercase Git revision`);
  }
  return value;
}

function historicalRoleBundleRevisionBinding(
  candidate: unknown,
): Readonly<HistoricalRoleBundleRevisionBinding> {
  const manifest = strictObject(candidate, "existing role-bundle manifest");
  exactKeys(
    manifest,
    [
      "contract",
      "isolation",
      "pipeline",
      "provenance",
      "replay_exclusion",
      "roles",
      "schema",
      "sources",
      "status",
    ],
    "existing role-bundle manifest",
  );
  if (
    manifest.schema !== FLOODGATE_ROLE_BUNDLE_SCHEMA ||
    manifest.status !== "complete-label-free-role-bundle"
  ) {
    fail("existing role-bundle manifest schema/status is unsupported");
  }
  const pipeline = strictObject(
    manifest.pipeline,
    "existing role-bundle manifest.pipeline",
  );
  exactKeys(
    pipeline,
    ["source_revision", "tracked_tree_clean"],
    "existing role-bundle manifest.pipeline",
  );
  if (pipeline.tracked_tree_clean !== true) {
    fail("existing role-bundle producer did not record a clean tree");
  }
  const bundleProducerRevision = manifestRevision(
    pipeline.source_revision,
    "existing role-bundle producer revision",
  );
  const sources = strictObject(
    manifest.sources,
    "existing role-bundle manifest.sources",
  );
  exactKeys(
    sources,
    ["legacy_replay_exclusion", "raw_lock", "role_lock"],
    "existing role-bundle manifest.sources",
  );
  const rawLock = strictObject(
    sources.raw_lock,
    "existing role-bundle manifest.sources.raw_lock",
  );
  exactKeys(
    rawLock,
    ["manifest", "source_revision"],
    "existing role-bundle manifest.sources.raw_lock",
  );
  const rawLockSourceRevision = manifestRevision(
    rawLock.source_revision,
    "existing role-bundle raw-lock source revision",
  );
  const roleLock = strictObject(
    sources.role_lock,
    "existing role-bundle manifest.sources.role_lock",
  );
  exactKeys(
    roleLock,
    [
      "allocation",
      "manifest",
      "producer_revision",
      "result_receipt",
      "verifier_revision",
    ],
    "existing role-bundle manifest.sources.role_lock",
  );
  const roleLockProducerRevision = manifestRevision(
    roleLock.producer_revision,
    "existing role-bundle role-lock producer revision",
  );
  const recordedRoleLockVerifier = manifestRevision(
    roleLock.verifier_revision,
    "existing role-bundle recorded role-lock verifier revision",
  );
  if (recordedRoleLockVerifier !== bundleProducerRevision) {
    fail(
      "existing role-bundle role-lock verifier revision must equal the bundle producer revision",
    );
  }
  const resultReceipt = strictObject(
    roleLock.result_receipt,
    "existing role-bundle manifest.sources.role_lock.result_receipt",
  );
  exactKeys(
    resultReceipt,
    ["bytes", "path", "sha256"],
    "existing role-bundle manifest.sources.role_lock.result_receipt",
  );
  if (
    resultReceipt.path !== FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_PATH ||
    resultReceipt.bytes !== FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_BYTES ||
    resultReceipt.sha256 !== FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_SHA256
  ) {
    fail("existing role-bundle cites an unpinned role-lock result receipt");
  }
  return Object.freeze({
    bundleProducerRevision,
    roleLockProducerRevision,
    rawLockSourceRevision,
  });
}

type RevisionAncestryCheck = (
  ancestor: string,
  descendant: string,
) => Promise<boolean>;

async function assertRoleBundleRevisionAncestry(
  binding: Readonly<HistoricalRoleBundleRevisionBinding>,
  verifierRevision: string,
  isAncestor: RevisionAncestryCheck,
): Promise<void> {
  manifestRevision(verifierRevision, "role-bundle verifier revision");
  const edges = [
    [
      FLOODGATE_ROLE_BUNDLE_MINIMUM_PRODUCER_REVISION,
      binding.bundleProducerRevision,
    ],
    [binding.bundleProducerRevision, verifierRevision],
    [binding.roleLockProducerRevision, binding.bundleProducerRevision],
    [binding.rawLockSourceRevision, binding.roleLockProducerRevision],
  ] as const;
  for (const [ancestor, descendant] of edges) {
    if (!(await isAncestor(ancestor, descendant))) {
      fail(
        "role-bundle revisions are outside the audited producer/verifier ancestry",
      );
    }
  }
}

async function gitOutput(
  repositoryRoot: string,
  arguments_: readonly string[],
): Promise<string> {
  const { stdout } = await execFile(
    FLOODGATE_GIT_EXECUTABLE,
    [...FLOODGATE_GIT_COMMAND_PREFIX, ...arguments_],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: floodgateGitEnvironment(),
    },
  );
  return stdout;
}

async function assertRoleBundleGitClosure(
  repositoryRoot: string,
  verifierRevision: string,
  binding: Readonly<HistoricalRoleBundleRevisionBinding>,
): Promise<void> {
  const assertCurrent = async (): Promise<void> => {
    const rootStat = await fs.promises.lstat(repositoryRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      fail("role-bundle repository root must be a real directory");
    }
    if ((await fs.promises.realpath(repositoryRoot)) !== repositoryRoot) {
      fail("role-bundle repository root must not traverse symbolic links");
    }
    const topLevel = (
      await gitOutput(repositoryRoot, ["rev-parse", "--show-toplevel"])
    ).trim();
    const head = (
      await gitOutput(repositoryRoot, [
        "rev-parse",
        "--verify",
        "HEAD^{commit}",
      ])
    ).trim();
    const status = await gitOutput(repositoryRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    const trackedFlags = await gitOutput(repositoryRoot, [
      "ls-files",
      "-v",
      "-z",
    ]);
    if (
      topLevel !== repositoryRoot ||
      head !== verifierRevision ||
      status !== "" ||
      !floodgateGitTrackedEntriesAreOrdinary(trackedFlags)
    ) {
      fail(
        "role-bundle verification requires the exact clean verifier revision",
      );
    }
    await assertFloodgateGitTrackedTreeMatchesHead(repositoryRoot).catch(() =>
      fail("role-bundle verification requires exact tracked HEAD bytes"),
    );
  };
  await assertCurrent();
  await assertRoleBundleRevisionAncestry(
    binding,
    verifierRevision,
    async (ancestor, descendant) => {
      try {
        await gitOutput(repositoryRoot, [
          "merge-base",
          "--is-ancestor",
          ancestor,
          descendant,
        ]);
        return true;
      } catch {
        return false;
      }
    },
  );
  const producerReceipt = await gitOutput(repositoryRoot, [
    "cat-file",
    "blob",
    `${binding.bundleProducerRevision}:${FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_PATH}`,
  ]).catch(() =>
    fail(
      "role-bundle producer tree does not contain the pinned result receipt",
    ),
  );
  if (
    Buffer.byteLength(producerReceipt, "utf8") !==
      FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_BYTES ||
    sha256Hex(producerReceipt) !== FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_SHA256
  ) {
    fail("role-bundle producer tree contains a different result receipt");
  }
  await assertCurrent();
}

/** Explicit non-production seam for historical v1 revision-binding tests. */
export function historicalFloodgateRoleBundleRevisionBindingCoreForTests(
  manifestText: string,
): Readonly<HistoricalRoleBundleRevisionBinding> {
  return historicalRoleBundleRevisionBinding(
    parseCanonicalManifest(new TextEncoder().encode(manifestText)),
  );
}

/** Explicit non-production seam for mocked Git ancestry graphs. */
export async function assertFloodgateRoleBundleRevisionAncestryCoreForTests(
  binding: Readonly<HistoricalRoleBundleRevisionBinding>,
  verifierRevision: string,
  isAncestor: RevisionAncestryCheck,
): Promise<void> {
  if (typeof isAncestor !== "function") {
    fail("non-production ancestry checker must be a function");
  }
  await assertRoleBundleRevisionAncestry(
    Object.freeze({
      bundleProducerRevision: manifestRevision(
        binding.bundleProducerRevision,
        "non-production bundle producer revision",
      ),
      roleLockProducerRevision: manifestRevision(
        binding.roleLockProducerRevision,
        "non-production role-lock producer revision",
      ),
      rawLockSourceRevision: manifestRevision(
        binding.rawLockSourceRevision,
        "non-production raw-lock source revision",
      ),
    }),
    verifierRevision,
    isAncestor,
  );
}

function fileIdentity(
  artifactPath: string,
  text: string,
): Readonly<FloodgateRoleBundleFileIdentity> {
  return Object.freeze({
    path: artifactPath,
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: sha256Hex(text),
  });
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256Hex(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

async function mapWithLimit<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(limit) || limit <= 0) fail("map limit is invalid");
  const output = new Array<R>(values.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (!failed) {
        const index = next;
        next += 1;
        if (index >= values.length) return;
        try {
          output[index] = await operation(values[index], index);
        } catch (error) {
          if (!failed) {
            failure = error;
            failed = true;
          }
          return;
        }
      }
    },
  );
  await Promise.all(workers);
  if (failed) throw failure;
  return output;
}

/** Explicit non-production seam for bounded-concurrency failure tests. */
export async function mapFloodgateRoleBundleWithLimitCoreForTests<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  return mapWithLimit(values, limit, operation);
}

function canonicalEntriesByGameId(
  csaIndex: readonly Readonly<FloodgateRawCsaIndexEntry>[],
): ReadonlyMap<string, Readonly<FloodgateRawCsaIndexEntry>> {
  const groups = new Map<string, Readonly<FloodgateRawCsaIndexEntry>[]>();
  for (const entry of csaIndex) {
    const group = groups.get(entry.game_id) ?? [];
    group.push(entry);
    groups.set(entry.game_id, group);
  }
  const canonical = new Map<string, Readonly<FloodgateRawCsaIndexEntry>>();
  for (const [gameId, entries] of groups) {
    const canonicalRows = entries.filter(
      (entry) => entry.url === entry.canonical_url,
    );
    if (canonicalRows.length !== 1) {
      fail(`game ${gameId} does not have exactly one canonical raw-index row`);
    }
    const selected = canonicalRows[0];
    if (
      gameId !== floodgateCanonicalUrlGameId(selected.canonical_url) ||
      selected.object !== floodgateRawObjectPath(selected.sha256) ||
      entries.some(
        (entry) =>
          entry.game_id !== gameId ||
          entry.canonical_url !== selected.canonical_url ||
          entry.bytes !== selected.bytes ||
          entry.sha256 !== selected.sha256 ||
          entry.object !== selected.object,
      )
    ) {
      fail(`game ${gameId} has inconsistent canonical raw-index binding`);
    }
    canonical.set(gameId, selected);
  }
  return canonical;
}

interface MaterializeRolesOptions {
  readonly allocation: RoleAllocationView;
  readonly csaIndex: readonly Readonly<FloodgateRawCsaIndexEntry>[];
  readonly readObject: (
    entry: Readonly<FloodgateRawCsaIndexEntry>,
  ) => Promise<Uint8Array>;
  readonly enforceProductionCounts: boolean;
}

async function materializeRoleArtifacts(
  options: MaterializeRolesOptions,
): Promise<Readonly<Record<FloodgateRole, FloodgateRoleBundleRoleArtifact>>> {
  const canonicalEntries = canonicalEntriesByGameId(options.csaIndex);
  const output = {} as Record<FloodgateRole, FloodgateRoleBundleRoleArtifact>;
  const seenGames = new Set<string>();
  const seenParents = new Set<string>();

  for (const role of FLOODGATE_ROLE_PRIORITY) {
    const allocatedGames = options.allocation.roles[role];
    if (options.enforceProductionCounts) {
      const expectedGames = DEFAULT_FLOODGATE_ROLE_GAME_COUNTS[role];
      if (
        allocatedGames.length !== expectedGames ||
        allocatedGames.some(
          (game) => game.parents.length !== FLOODGATE_PARENTS_PER_GAME,
        )
      ) {
        fail(`${role} does not have its exact production game/parent quota`);
      }
    }
    const perGame = await mapWithLimit(
      allocatedGames,
      FLOODGATE_ROLE_BUNDLE_CAS_READ_CONCURRENCY,
      async (allocated) => {
        if (seenGames.has(allocated.game_id)) {
          fail(`allocated game ${allocated.game_id} crosses roles`);
        }
        seenGames.add(allocated.game_id);
        const entry = canonicalEntries.get(allocated.game_id);
        if (!entry)
          fail(`allocated game ${allocated.game_id} is absent from raw index`);
        const bytes = await options.readObject(entry);
        if (
          bytes.byteLength !== entry.bytes ||
          sha256Hex(bytes) !== entry.sha256
        ) {
          fail(`CAS reader returned wrong bytes for ${entry.canonical_url}`);
        }
        const parsed = parseFloodgateCsa(bytes, entry.canonical_url);
        if (
          parsed.sourceUrl !== entry.canonical_url ||
          parsed.gameSha256 !== entry.sha256 ||
          parsed.terminal !== "TORYO"
        ) {
          fail(`authenticated CSA parse does not match ${entry.canonical_url}`);
        }
        return allocated.parents.map((parent): FloodgateRoleBundleRawParent => {
          if (seenParents.has(parent.parent_id)) {
            fail(`allocated parent ${parent.parent_id} crosses roles`);
          }
          seenParents.add(parent.parent_id);
          const move = parsed.moves[parent.ply];
          if (!move) {
            fail(`allocated parent ${parent.parent_id} has no CSA move at ply`);
          }
          const expectedParentId = parentOccurrenceId(
            allocated.game_id,
            parent.ply,
          );
          const expectedPositionId = positionKeyFromSfen(move.parentSfen);
          const playedChildId = positionKeyFromSfen(move.childSfen);
          if (
            parent.parent_id !== expectedParentId ||
            parent.parent_sfen !== move.parentSfen ||
            parent.position_id !== expectedPositionId ||
            !parent.protected_position_ids.includes(expectedPositionId) ||
            !parent.protected_position_ids.includes(playedChildId)
          ) {
            fail(
              `allocated parent ${parent.parent_id} does not match CSA semantics`,
            );
          }
          return Object.freeze({
            schema_version: 1 as const,
            source: "floodgate" as const,
            source_url: entry.canonical_url,
            game_sha256: entry.sha256,
            game_id: allocated.game_id,
            parent_id: parent.parent_id,
            position_id: parent.position_id,
            parent_sfen: parent.parent_sfen,
            ply: parent.ply,
            played_move: move.usi,
          });
        });
      },
    );
    const rows = perGame
      .flat()
      .sort((left, right) => compareBytewise(left.parent_id, right.parent_id));
    const rawText = `${rows.map((row) => canonicalJson(row)).join("\n")}\n`;
    const gameIds = new Set(rows.map((row) => row.game_id));
    const parentIds = new Set(rows.map((row) => row.parent_id));
    const positionIds = new Set(rows.map((row) => row.position_id));
    const protectedIdentifiers = [
      ...new Set(
        allocatedGames.flatMap((game) =>
          game.parents.flatMap((parent) => parent.protected_position_ids),
        ),
      ),
    ].sort(compareBytewise);
    const protectedText = `${protectedIdentifiers.join("\n")}\n`;
    const summary = options.allocation.role_summaries[role];
    if (
      gameIds.size !== allocatedGames.length ||
      parentIds.size !== rows.length ||
      summary.selected_games !== allocatedGames.length ||
      summary.selected_parents !== rows.length ||
      summary.game_ids_sha256 !== floodgateIdentifierDigest(gameIds) ||
      summary.parent_ids_sha256 !== floodgateIdentifierDigest(parentIds) ||
      summary.protected_position_ids_count !== protectedIdentifiers.length ||
      summary.protected_position_ids_sha256 !==
        floodgateIdentifierDigest(protectedIdentifiers)
    ) {
      fail(`${role} raw/protected artifacts do not close over role summary`);
    }
    const rawBase = fileIdentity(ROLE_FILENAMES[role].raw, rawText);
    const protectedBase = fileIdentity(
      ROLE_FILENAMES[role].protected,
      protectedText,
    );
    output[role] = deepFreeze({
      rows,
      rawText,
      rawIdentity: {
        ...rawBase,
        format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
        records: rows.length,
        games: gameIds.size,
        game_ids_sha256: floodgateIdentifierDigest(gameIds),
        parent_ids_sha256: floodgateIdentifierDigest(parentIds),
        position_ids_count: positionIds.size,
        position_ids_sha256: floodgateIdentifierDigest(positionIds),
      },
      protectedIdentifiers,
      protectedText,
      protectedIdentity: {
        ...protectedBase,
        format: FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
        count: protectedIdentifiers.length,
        identifiers_sha256: floodgateIdentifierDigest(protectedIdentifiers),
      },
    });
  }
  return deepFreeze(output);
}

/** Explicit small-fixture seam; it does not establish production provenance. */
export async function materializeFloodgateRoleBundleRolesCoreForTests(
  options: Omit<MaterializeRolesOptions, "enforceProductionCounts">,
): Promise<Readonly<Record<FloodgateRole, FloodgateRoleBundleRoleArtifact>>> {
  return materializeRoleArtifacts({
    ...options,
    enforceProductionCounts: false,
  });
}

async function readCanonicalPositionIdFile(
  filePath: string,
  artifactPath: string,
): Promise<
  Readonly<{
    text: string;
    identifiers: readonly string[];
    identity: FloodgateRoleBundleProtectedIdentity;
  }>
> {
  const bytes = await readRegularFileNoFollow(filePath);
  const text = fatalUtf8(bytes, artifactPath);
  if (text.length === 0 || !text.endsWith("\n") || text.endsWith("\n\n")) {
    fail(`${artifactPath} must use exact single-final-LF framing`);
  }
  const identifiers = text.slice(0, -1).split("\n");
  for (let index = 0; index < identifiers.length; index += 1) {
    if (!POSITION_ID_RE.test(identifiers[index])) {
      fail(`${artifactPath}[${index}] is not a canonical position ID`);
    }
    if (
      index > 0 &&
      compareBytewise(identifiers[index - 1], identifiers[index]) >= 0
    ) {
      fail(`${artifactPath} must be UTF-8-bytewise sorted and unique`);
    }
  }
  return deepFreeze({
    text,
    identifiers,
    identity: {
      path: artifactPath,
      format: FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
      bytes: bytes.byteLength,
      sha256: sha256Hex(bytes),
      count: identifiers.length,
      identifiers_sha256: floodgateIdentifierDigest(identifiers),
    },
  });
}

function setIntersectionSize(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  let count = 0;
  const [small, large] =
    left.size <= right.size ? [left, right] : [right, left];
  for (const value of small) if (large.has(value)) count += 1;
  return count;
}

function assertVerifiedRoleLockStable(
  actual: Readonly<VerifiedFloodgateRoleLock>,
  expected: Readonly<VerifiedFloodgateRoleLock>,
): void {
  if (
    actual.manifestText !== expected.manifestText ||
    actual.materializedInputText !== expected.materializedInputText ||
    actual.allocationText !== expected.allocationText ||
    actual.producerRevision !== expected.producerRevision ||
    actual.verifierRevision !== expected.verifierRevision ||
    !isDeepStrictEqual(actual.resultReceipt, expected.resultReceipt) ||
    !sameRoleLockClosureAcrossBundleOperation(
      actual.filesystemClosure,
      expected.filesystemClosure,
    ) ||
    serializeFloodgateRawLockManifest(actual.rawManifest) !==
      serializeFloodgateRawLockManifest(expected.rawManifest)
  ) {
    fail("verified role-lock source closure changed during bundle operation");
  }
}

function sameRoleLockClosureAcrossBundleOperation(
  actual: Readonly<FloodgateRoleLockFilesystemClosure>,
  expected: Readonly<FloodgateRoleLockFilesystemClosure>,
): boolean {
  return (
    actual.parent.dev === expected.parent.dev &&
    actual.parent.ino === expected.parent.ino &&
    isDeepStrictEqual(actual.root, expected.root) &&
    isDeepStrictEqual(actual.files, expected.files)
  );
}

/** Explicit seam for the one known sibling-root mkdir during publication. */
export function assertFloodgateRoleBundleRoleLockClosureCoreForTests(
  actual: Readonly<FloodgateRoleLockFilesystemClosure>,
  expected: Readonly<FloodgateRoleLockFilesystemClosure>,
): void {
  if (!sameRoleLockClosureAcrossBundleOperation(actual, expected)) {
    fail(
      "verified role-lock filesystem closure changed during bundle operation",
    );
  }
}

async function buildRoleBundle(
  roleLock: Readonly<VerifiedFloodgateRoleLock>,
  rawLockRoot: string,
  legacyPath: string,
  bundleProducerRevision: string,
): Promise<Readonly<RoleBundleBuild>> {
  const roles = await materializeRoleArtifacts({
    allocation: roleLock.allocation,
    csaIndex: roleLock.rawManifest.csa_index,
    readObject: (entry) =>
      verifyExistingFloodgateRawObject(rawLockRoot, {
        bytes: entry.bytes,
        sha256: entry.sha256,
        object: entry.object,
      }),
    enforceProductionCounts: true,
  });
  const legacy = await readCanonicalPositionIdFile(
    legacyPath,
    roleLock.manifest.legacy_protected_position_ids.path,
  );
  const expectedLegacy = roleLock.manifest.legacy_protected_position_ids;
  if (
    legacy.identity.bytes !== expectedLegacy.bytes ||
    legacy.identity.sha256 !== expectedLegacy.sha256 ||
    legacy.identity.count !== expectedLegacy.count ||
    legacy.identity.identifiers_sha256 !== expectedLegacy.identifiers_sha256
  ) {
    fail("legacy replay exclusion does not match verified role-lock evidence");
  }
  const replay = buildFloodgateReplayExclusionUnion({
    legacy: legacy.text,
    fresh_final: roles.fresh_final_holdout.protectedText,
    fresh_selection: roles.fresh_selection.protectedText,
  });
  const overlaps = replay.receipt.overlaps;
  if (
    overlaps.legacy_and_fresh_final !== 0 ||
    overlaps.legacy_and_fresh_selection !== 0 ||
    overlaps.fresh_final_and_fresh_selection !== 0 ||
    overlaps.all_three !== 0 ||
    replay.receipt.summary.duplicate_memberships !== 0
  ) {
    fail("production replay components must be pairwise disjoint");
  }
  const replayBase = fileIdentity(
    FLOODGATE_ROLE_BUNDLE_REPLAY_FILENAME,
    replay.text,
  );
  const replayIdentity: FloodgateRoleBundleProtectedIdentity = deepFreeze({
    ...replayBase,
    format: FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
    count: replay.receipt.output.count,
    identifiers_sha256: replay.receipt.output.identifiers_sha256,
  });
  if (
    replayIdentity.bytes !== replay.receipt.output.bytes ||
    replayIdentity.sha256 !== replay.receipt.output.sha256
  ) {
    fail("replay union output identity does not close");
  }
  const replayReceiptIdentity = fileIdentity(
    FLOODGATE_ROLE_BUNDLE_REPLAY_RECEIPT_FILENAME,
    replay.receipt_json,
  );
  const replaySet = new Set(replay.identifiers);
  const trainingSet = new Set(roles.training.protectedIdentifiers);
  if (setIntersectionSize(replaySet, trainingSet) !== 0) {
    fail("training semantics unexpectedly enter the replay exclusion union");
  }

  const rawManifestText = serializeFloodgateRawLockManifest(
    roleLock.rawManifest,
  );
  const rawManifestIdentity = fileIdentity("manifest.json", rawManifestText);
  const roleManifestIdentity = fileIdentity(
    "manifest.json",
    roleLock.manifestText,
  );
  const allocationIdentity = fileIdentity(
    roleLock.manifest.artifacts.allocation.path,
    roleLock.allocationText,
  );
  const roleOutputs = Object.fromEntries(
    FLOODGATE_ROLE_PRIORITY.map((role) => [
      role,
      Object.freeze({
        raw_parents: roles[role].rawIdentity,
        protected_position_ids: roles[role].protectedIdentity,
      }),
    ]),
  ) as FloodgateRoleBundleManifest["roles"];
  const manifest: FloodgateRoleBundleManifest = deepFreeze({
    schema: FLOODGATE_ROLE_BUNDLE_SCHEMA,
    status: "complete-label-free-role-bundle",
    provenance: {
      network_requests: 0,
      teacher_or_candidate_scores_read: false,
      labeled_selection_read: false,
      labeled_final_holdout_read: false,
      role_allocation_changed: false,
    },
    pipeline: {
      source_revision: bundleProducerRevision,
      tracked_tree_clean: true,
    },
    sources: {
      raw_lock: {
        manifest: rawManifestIdentity,
        source_revision: roleLock.rawManifest.source.revision,
      },
      role_lock: {
        manifest: roleManifestIdentity,
        allocation: allocationIdentity,
        result_receipt: roleLock.resultReceipt,
        producer_revision: roleLock.producerRevision,
        verifier_revision: bundleProducerRevision,
      },
      legacy_replay_exclusion: legacy.identity,
    },
    contract: {
      role_priority: FLOODGATE_ROLE_PRIORITY,
      role_game_counts: DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
      parents_per_game: FLOODGATE_PARENTS_PER_GAME,
      raw_parent_format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
      game_id_domain: FLOODGATE_RAW_LOCK_GAME_ID_DOMAIN,
      canonical_duplicate_policy: "lowest-utf8-bytewise-url-per-body",
      played_move_source: "authenticated-csa-move-at-allocated-ply",
      cas_read_concurrency: FLOODGATE_ROLE_BUNDLE_CAS_READ_CONCURRENCY,
      replay_components: ["legacy", "fresh_final_holdout", "fresh_selection"],
      training_in_replay_exclusion: false,
    },
    roles: roleOutputs,
    replay_exclusion: {
      identifiers: replayIdentity,
      receipt: replayReceiptIdentity,
      summary: replay.receipt,
    },
    isolation: {
      legacy_and_fresh_final: 0,
      legacy_and_fresh_selection: 0,
      fresh_final_and_fresh_selection: 0,
      all_three: 0,
      duplicate_memberships: 0,
      cross_role_game_ids: 0,
      cross_role_parent_ids: 0,
      training_in_replay_exclusion: 0,
    },
  });
  const manifestText = `${canonicalJson(manifest)}\n`;
  const files = new Map<string, string>();
  for (const role of FLOODGATE_ROLE_PRIORITY) {
    files.set(roles[role].rawIdentity.path, roles[role].rawText);
    files.set(roles[role].protectedIdentity.path, roles[role].protectedText);
  }
  files.set(replayIdentity.path, replay.text);
  files.set(replayReceiptIdentity.path, replay.receipt_json);
  if (files.size !== 8) fail("role-bundle nonmanifest file paths collide");
  return deepFreeze({
    manifest,
    manifestText,
    roles,
    replay,
    replayIdentity,
    replayReceiptIdentity,
    files,
  });
}

export interface NonProductionFloodgateRoleBundlePublishSequenceFixture {
  readonly validateCandidate: () => void;
  readonly publishDataFiles: () => Promise<void>;
  readonly verifyDataFiles: () => Promise<void>;
  readonly revalidateSourceClosure: () => Promise<void>;
  readonly publishManifest: () => Promise<void>;
  readonly verifyCompleteBundle: () => Promise<void>;
}

async function runRoleBundlePublishSequence(
  fixture: NonProductionFloodgateRoleBundlePublishSequenceFixture,
): Promise<void> {
  fixture.validateCandidate();
  await fixture.publishDataFiles();
  await fixture.verifyDataFiles();
  await fixture.revalidateSourceClosure();
  await fixture.verifyDataFiles();
  fixture.validateCandidate();
  await fixture.publishManifest();
  await fixture.verifyCompleteBundle();
}

/** Explicit non-production seam for manifest-order and closure tests. */
export async function runFloodgateRoleBundlePublishSequenceCoreForTests(
  fixtureInput: NonProductionFloodgateRoleBundlePublishSequenceFixture,
): Promise<void> {
  const fixture = strictObject(
    fixtureInput,
    "non-production role-bundle publication fixture",
  );
  exactKeys(
    fixture,
    [
      "publishDataFiles",
      "publishManifest",
      "revalidateSourceClosure",
      "validateCandidate",
      "verifyCompleteBundle",
      "verifyDataFiles",
    ],
    "non-production role-bundle publication fixture",
  );
  for (const callback of Object.values(fixture)) {
    if (typeof callback !== "function") {
      fail(
        "every non-production role-bundle publication field must be a function",
      );
    }
  }
  await runRoleBundlePublishSequence(fixtureInput);
}

interface DirectoryIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

interface DirectorySnapshot extends DirectoryIdentity {
  readonly ctimeNs: bigint;
}

interface RegularFileSnapshot extends DirectoryIdentity {
  readonly size: bigint;
  readonly ctimeNs: bigint;
  readonly mtimeNs: bigint;
  readonly nlink: bigint;
}

function directorySnapshot(stat: fs.BigIntStats): DirectorySnapshot {
  return Object.freeze({ dev: stat.dev, ino: stat.ino, ctimeNs: stat.ctimeNs });
}

function regularFileSnapshot(stat: fs.BigIntStats): RegularFileSnapshot {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    ctimeNs: stat.ctimeNs,
    mtimeNs: stat.mtimeNs,
    nlink: stat.nlink,
  });
}

function sameRegularFileSnapshot(
  left: Readonly<RegularFileSnapshot>,
  right: Readonly<RegularFileSnapshot>,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.ctimeNs === right.ctimeNs &&
    left.mtimeNs === right.mtimeNs &&
    left.nlink === right.nlink
  );
}

function openDirectoryNoFollow(
  directory: string,
  label: string,
): {
  fd: number;
  snapshot: DirectorySnapshot;
} {
  const noFollow = fs.constants.O_NOFOLLOW;
  const directoryOnly = fs.constants.O_DIRECTORY;
  const nonblock = fs.constants.O_NONBLOCK;
  if (
    typeof noFollow !== "number" ||
    typeof directoryOnly !== "number" ||
    typeof nonblock !== "number"
  ) {
    fail("production requires O_NOFOLLOW, O_DIRECTORY, and O_NONBLOCK");
  }
  if (fs.realpathSync.native(directory) !== directory) {
    fail(`${label} must not traverse symbolic links`);
  }
  const pathStat = fs.lstatSync(directory, { bigint: true });
  if (!pathStat.isDirectory() || pathStat.isSymbolicLink()) {
    fail(`${label} must be a real directory`);
  }
  const fd = fs.openSync(
    directory,
    fs.constants.O_RDONLY | noFollow | directoryOnly | nonblock,
  );
  try {
    const handleStat = fs.fstatSync(fd, { bigint: true });
    const pathAfter = fs.lstatSync(directory, { bigint: true });
    if (
      !handleStat.isDirectory() ||
      handleStat.dev !== pathStat.dev ||
      handleStat.ino !== pathStat.ino ||
      !pathAfter.isDirectory() ||
      pathAfter.isSymbolicLink() ||
      pathAfter.dev !== handleStat.dev ||
      pathAfter.ino !== handleStat.ino ||
      fs.realpathSync.native(directory) !== directory
    ) {
      fail(`${label} directory identity changed while opening`);
    }
    return { fd, snapshot: directorySnapshot(handleStat) };
  } catch (error) {
    try {
      fs.closeSync(fd);
    } catch {
      // Preserve the identity/opening failure.
    }
    throw error;
  }
}

class RoleBundleOutputRootGuard {
  readonly #root: string;
  readonly #parent: string;
  readonly #rootFd: number;
  readonly #parentFd: number;
  readonly #rootIdentity: DirectoryIdentity;
  readonly #parentIdentity: DirectoryIdentity;
  readonly #parentCtimeNs: bigint;
  #entrySnapshots = new Map<string, Readonly<RegularFileSnapshot>>();
  #rootCtimeNs: bigint;
  #closed = false;

  private constructor(
    root: string,
    parentFd: number,
    parentSnapshot: DirectorySnapshot,
    rootFd: number,
    rootSnapshot: DirectorySnapshot,
  ) {
    this.#root = root;
    this.#parent = path.dirname(root);
    this.#parentFd = parentFd;
    this.#rootFd = rootFd;
    this.#rootIdentity = Object.freeze({
      dev: rootSnapshot.dev,
      ino: rootSnapshot.ino,
    });
    this.#parentIdentity = Object.freeze({
      dev: parentSnapshot.dev,
      ino: parentSnapshot.ino,
    });
    this.#parentCtimeNs = parentSnapshot.ctimeNs;
    this.#rootCtimeNs = rootSnapshot.ctimeNs;
  }

  static async acquireFresh(
    rootInput: string,
  ): Promise<RoleBundleOutputRootGuard> {
    const root = canonicalAbsolutePath(rootInput, "role-bundle output root");
    const parent = path.dirname(root);
    const openedParent = openDirectoryNoFollow(
      parent,
      "role-bundle output parent",
    );
    let rootFd: number | null = null;
    try {
      try {
        fs.mkdirSync(root, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          fail("role-bundle output root must be freshly created");
        }
        throw error;
      }
      fs.fsyncSync(openedParent.fd);
      const parentAfter = fs.fstatSync(openedParent.fd, { bigint: true });
      const createdStat = fs.lstatSync(root, { bigint: true });
      if (
        !createdStat.isDirectory() ||
        createdStat.isSymbolicLink() ||
        (createdStat.mode & BigInt(0o777)) !== BigInt(0o700)
      ) {
        fail(
          "fresh role-bundle output root is not the private directory just created",
        );
      }
      const rootOpened = openDirectoryNoFollow(
        root,
        "fresh role-bundle output root",
      );
      rootFd = rootOpened.fd;
      if (
        rootOpened.snapshot.dev !== createdStat.dev ||
        rootOpened.snapshot.ino !== createdStat.ino
      ) {
        fail("fresh role-bundle output root changed before capability capture");
      }
      const guard = new RoleBundleOutputRootGuard(
        root,
        openedParent.fd,
        directorySnapshot(parentAfter),
        rootOpened.fd,
        rootOpened.snapshot,
      );
      await guard.assertState([], false, "fresh output acquisition");
      return guard;
    } catch (error) {
      if (rootFd !== null) {
        try {
          fs.closeSync(rootFd);
        } catch {
          // Preserve the acquisition failure.
        }
      }
      try {
        fs.closeSync(openedParent.fd);
      } catch {
        // Preserve the acquisition failure.
      }
      // Never delete by pathname here: it may now name a foreign directory.
      throw error;
    }
  }

  static async acquireExisting(
    rootInput: string,
    expectedEntries: readonly string[],
  ): Promise<RoleBundleOutputRootGuard> {
    const root = canonicalAbsolutePath(rootInput, "existing role-bundle root");
    const parent = path.dirname(root);
    const openedParent = openDirectoryNoFollow(
      parent,
      "existing role-bundle parent",
    );
    let rootFd: number | null = null;
    try {
      const openedRoot = openDirectoryNoFollow(
        root,
        "existing role-bundle root",
      );
      rootFd = openedRoot.fd;
      const guard = new RoleBundleOutputRootGuard(
        root,
        openedParent.fd,
        openedParent.snapshot,
        openedRoot.fd,
        openedRoot.snapshot,
      );
      await guard.#seedExistingEntries(expectedEntries);
      await guard.assertState(
        expectedEntries,
        false,
        "existing bundle acquisition",
      );
      return guard;
    } catch (error) {
      if (rootFd !== null) {
        try {
          fs.closeSync(rootFd);
        } catch {
          // Preserve the acquisition failure.
        }
      }
      try {
        fs.closeSync(openedParent.fd);
      } catch {
        // Preserve the acquisition failure.
      }
      throw error;
    }
  }

  async #seedExistingEntries(
    expectedEntries: readonly string[],
  ): Promise<void> {
    if (this.#entrySnapshots.size !== 0) {
      fail("existing role-bundle entries were already seeded");
    }
    const wanted = [...expectedEntries].sort(compareBytewise);
    if (
      new Set(wanted).size !== wanted.length ||
      wanted.some(
        (entry) =>
          entry.length === 0 ||
          path.basename(entry) !== entry ||
          entry.includes("\0"),
      )
    ) {
      fail("existing role-bundle entry names are not exact direct children");
    }
    const entries = (await fs.promises.readdir(this.#root)).sort(
      compareBytewise,
    );
    if (
      entries.length !== wanted.length ||
      entries.some((entry, index) => entry !== wanted[index])
    ) {
      fail("existing role-bundle root entries are not exact");
    }
    const snapshots = new Map<string, Readonly<RegularFileSnapshot>>();
    for (const entry of wanted) {
      const stat = await fs.promises.lstat(path.join(this.#root, entry), {
        bigint: true,
      });
      if (!stat.isFile() || stat.isSymbolicLink()) {
        fail(`existing role-bundle entry ${entry} is not a regular file`);
      }
      snapshots.set(entry, regularFileSnapshot(stat));
    }
    this.#entrySnapshots = snapshots;
  }

  async assertState(
    expectedEntries: readonly string[],
    adoptKnownWrite: boolean,
    stage: string,
  ): Promise<void> {
    if (this.#closed) fail(`role-bundle output guard is closed at ${stage}`);
    const parentHandleBefore = fs.fstatSync(this.#parentFd, { bigint: true });
    const parentPathBefore = await fs.promises.lstat(this.#parent, {
      bigint: true,
    });
    if (
      !parentHandleBefore.isDirectory() ||
      !parentPathBefore.isDirectory() ||
      parentPathBefore.isSymbolicLink() ||
      parentHandleBefore.dev !== this.#parentIdentity.dev ||
      parentHandleBefore.ino !== this.#parentIdentity.ino ||
      parentPathBefore.dev !== this.#parentIdentity.dev ||
      parentPathBefore.ino !== this.#parentIdentity.ino ||
      parentHandleBefore.ctimeNs !== this.#parentCtimeNs ||
      parentPathBefore.ctimeNs !== this.#parentCtimeNs ||
      (await fs.promises.realpath(this.#parent)) !== this.#parent
    ) {
      fail(`role-bundle output parent changed at ${stage}`);
    }
    const rootHandleBefore = fs.fstatSync(this.#rootFd, { bigint: true });
    const rootPathBefore = await fs.promises.lstat(this.#root, {
      bigint: true,
    });
    if (
      !rootHandleBefore.isDirectory() ||
      !rootPathBefore.isDirectory() ||
      rootPathBefore.isSymbolicLink() ||
      rootHandleBefore.dev !== this.#rootIdentity.dev ||
      rootHandleBefore.ino !== this.#rootIdentity.ino ||
      rootPathBefore.dev !== this.#rootIdentity.dev ||
      rootPathBefore.ino !== this.#rootIdentity.ino ||
      rootPathBefore.ctimeNs !== rootHandleBefore.ctimeNs ||
      (await fs.promises.realpath(this.#root)) !== this.#root
    ) {
      fail(`role-bundle output root changed at ${stage}`);
    }
    if (!adoptKnownWrite && rootHandleBefore.ctimeNs !== this.#rootCtimeNs) {
      fail(`role-bundle output root ctime changed at ${stage}`);
    }
    const entries = (await fs.promises.readdir(this.#root)).sort(
      compareBytewise,
    );
    const wanted = [...expectedEntries].sort(compareBytewise);
    if (
      entries.length !== wanted.length ||
      entries.some((entry, index) => entry !== wanted[index])
    ) {
      fail(`role-bundle output entries changed at ${stage}`);
    }
    const currentSnapshots = new Map<string, Readonly<RegularFileSnapshot>>();
    let additions = 0;
    for (const entry of wanted) {
      const stat = await fs.promises.lstat(path.join(this.#root, entry), {
        bigint: true,
      });
      if (!stat.isFile() || stat.isSymbolicLink()) {
        fail(`role-bundle output entry ${entry} is not a regular file`);
      }
      const current = regularFileSnapshot(stat);
      const known = this.#entrySnapshots.get(entry);
      if (known && !sameRegularFileSnapshot(current, known)) {
        fail(`role-bundle output entry ${entry} changed at ${stage}`);
      }
      if (!known) {
        if (!adoptKnownWrite) {
          fail(`role-bundle output entry ${entry} appeared at ${stage}`);
        }
        additions += 1;
      }
      currentSnapshots.set(entry, current);
    }
    let removals = 0;
    for (const entry of this.#entrySnapshots.keys()) {
      if (!currentSnapshots.has(entry)) removals += 1;
    }
    if (adoptKnownWrite) {
      if (additions + removals !== 1 || (additions > 0 && removals > 0)) {
        fail(`role-bundle output adoption is not one known write at ${stage}`);
      }
    } else if (additions !== 0 || removals !== 0) {
      fail(`role-bundle output entry identity set changed at ${stage}`);
    }
    const rootHandleAfter = fs.fstatSync(this.#rootFd, { bigint: true });
    const rootPathAfter = await fs.promises.lstat(this.#root, { bigint: true });
    const parentHandleAfter = fs.fstatSync(this.#parentFd, { bigint: true });
    const parentPathAfter = await fs.promises.lstat(this.#parent, {
      bigint: true,
    });
    if (
      rootHandleAfter.dev !== rootHandleBefore.dev ||
      rootHandleAfter.ino !== rootHandleBefore.ino ||
      rootHandleAfter.ctimeNs !== rootHandleBefore.ctimeNs ||
      rootPathAfter.dev !== rootPathBefore.dev ||
      rootPathAfter.ino !== rootPathBefore.ino ||
      rootPathAfter.ctimeNs !== rootPathBefore.ctimeNs ||
      parentHandleAfter.dev !== parentHandleBefore.dev ||
      parentHandleAfter.ino !== parentHandleBefore.ino ||
      parentHandleAfter.ctimeNs !== parentHandleBefore.ctimeNs ||
      parentPathAfter.dev !== parentPathBefore.dev ||
      parentPathAfter.ino !== parentPathBefore.ino ||
      parentPathAfter.ctimeNs !== parentPathBefore.ctimeNs
    ) {
      fail(`role-bundle output directories changed during ${stage}`);
    }
    if (adoptKnownWrite) {
      this.#rootCtimeNs = rootHandleAfter.ctimeNs;
      this.#entrySnapshots = currentSnapshots;
    }
  }

  async invalidateOwnedPublishedChild(
    filename: string,
    handle: fs.promises.FileHandle,
    expectedIdentity: Readonly<FloodgateDurableLinkedFileIdentity>,
  ): Promise<void> {
    if (filename.length === 0 || path.basename(filename) !== filename) {
      fail("role-bundle invalidation filename must be one direct child");
    }
    const stat = await handle.stat({ bigint: true });
    if (
      !stat.isFile() ||
      stat.dev !== expectedIdentity.dev ||
      stat.ino !== expectedIdentity.ino
    ) {
      fail(`refusing to invalidate an unowned ${filename} handle`);
    }
    const sentinel = Buffer.from(
      FLOODGATE_ROLE_BUNDLE_INVALID_MANIFEST_SENTINEL,
      "ascii",
    );
    const written = await handle.write(sentinel, 0, sentinel.byteLength, 0);
    if (written.bytesWritten !== sentinel.byteLength) {
      fail(`failed to invalidate the complete owned ${filename}`);
    }
    await handle.sync();
    await handle.truncate(sentinel.byteLength);
    await handle.sync();
    const after = await handle.stat({ bigint: true });
    if (
      !after.isFile() ||
      after.dev !== expectedIdentity.dev ||
      after.ino !== expectedIdentity.ino ||
      after.size !== BigInt(sentinel.byteLength)
    ) {
      fail(`${filename} invalidation changed the held inode unexpectedly`);
    }
    const observed = Buffer.alloc(sentinel.byteLength);
    const read = await handle.read(observed, 0, observed.byteLength, 0);
    if (read.bytesRead !== sentinel.byteLength || !observed.equals(sentinel)) {
      fail(`${filename} invalidation did not persist its tombstone`);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    let failure: unknown;
    try {
      fs.closeSync(this.#rootFd);
    } catch (error) {
      failure = error;
    }
    try {
      fs.closeSync(this.#parentFd);
    } catch (error) {
      if (failure === undefined) failure = error;
    }
    if (failure !== undefined) throw failure;
  }
}

interface RoleBundleTrackedManifestPublicationState {
  ownedIdentity: Readonly<FloodgateDurableLinkedFileIdentity> | null;
  ownedHandle: fs.promises.FileHandle | null;
  stableIdentity: Readonly<RegularFileSnapshot> | null;
}

async function statRegularFileSnapshotNoFollow(
  filePath: string,
): Promise<Readonly<RegularFileSnapshot>> {
  if ((await fs.promises.realpath(filePath)) !== filePath) {
    fail(`${filePath} must not traverse symbolic links`);
  }
  const stat = await fs.promises.lstat(filePath, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`${filePath} must be a regular file`);
  }
  return regularFileSnapshot(stat);
}

async function durablePublishTrackedRoleBundleManifest(
  manifestPath: string,
  manifestText: string,
  state: RoleBundleTrackedManifestPublicationState,
  injectedFailpoint?: (
    phase: FloodgateDurableCreatePhase,
    linkedIdentity?: Readonly<FloodgateDurableLinkedFileIdentity>,
  ) => void | Promise<void>,
): Promise<void> {
  await durableCreateNoClobber(manifestPath, manifestText, {
    transferLinkedFileHandle: (handle, linkedIdentity) => {
      if (state.ownedHandle || state.ownedIdentity) {
        fail("role-bundle manifest publisher transferred ownership twice");
      }
      state.ownedHandle = handle;
      state.ownedIdentity = Object.freeze({ ...linkedIdentity });
    },
    failpoint: async (phase, linkedIdentity) => {
      if (phase === "after-link") {
        if (
          !linkedIdentity ||
          !state.ownedIdentity ||
          !state.ownedHandle ||
          state.ownedIdentity.dev !== linkedIdentity.dev ||
          state.ownedIdentity.ino !== linkedIdentity.ino
        ) {
          fail("role-bundle manifest linked-handle transfer was incomplete");
        }
        const observed = await statRegularFileSnapshotNoFollow(manifestPath);
        if (
          observed.dev !== linkedIdentity.dev ||
          observed.ino !== linkedIdentity.ino
        ) {
          fail("role-bundle manifest path no longer names its owned inode");
        }
        state.stableIdentity = observed;
      }
      await injectedFailpoint?.(phase, linkedIdentity);
    },
  });
  if (!state.ownedHandle || !state.ownedIdentity || !state.stableIdentity) {
    fail("role-bundle manifest publication lost its owned inode capability");
  }
  const stableIdentity = await statRegularFileSnapshotNoFollow(manifestPath);
  if (
    stableIdentity.dev !== state.ownedIdentity.dev ||
    stableIdentity.ino !== state.ownedIdentity.ino
  ) {
    fail("role-bundle manifest path displaced its publisher-owned inode");
  }
  state.stableIdentity = stableIdentity;
}

function roleBundlePublicationAndInvalidationFailure(
  primary: unknown,
  invalidation: unknown,
): AggregateError {
  const primaryMessage =
    primary instanceof Error ? primary.message : String(primary);
  const invalidationMessage =
    invalidation instanceof Error ? invalidation.message : String(invalidation);
  return new AggregateError(
    [primary, invalidation],
    `${primaryMessage}; role-bundle manifest invalidation also failed: ${invalidationMessage}`,
  );
}

async function invalidateTrackedRoleBundleManifestAfterFailure(
  guard: RoleBundleOutputRootGuard,
  state: RoleBundleTrackedManifestPublicationState,
  primary: unknown,
): Promise<never> {
  if (state.ownedIdentity || state.ownedHandle) {
    try {
      if (!state.ownedIdentity || !state.ownedHandle) {
        fail("role-bundle manifest ownership-transfer state is incomplete");
      }
      await guard.invalidateOwnedPublishedChild(
        FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
        state.ownedHandle,
        state.ownedIdentity,
      );
    } catch (invalidationError) {
      throw roleBundlePublicationAndInvalidationFailure(
        primary,
        invalidationError,
      );
    }
  }
  throw primary;
}

async function closeRoleBundlePublicationResources(
  guard: RoleBundleOutputRootGuard,
  state: RoleBundleTrackedManifestPublicationState,
  primaryFailed: boolean,
): Promise<void> {
  let closeFailure: unknown;
  const handle = state.ownedHandle;
  state.ownedHandle = null;
  try {
    if (handle) await handle.close();
  } catch (error) {
    closeFailure = error;
  }
  try {
    await guard.close();
  } catch (error) {
    if (closeFailure === undefined) closeFailure = error;
  }
  if (closeFailure !== undefined && !primaryFailed) throw closeFailure;
}

/** Explicit non-production seam for CLI-check-to-core-mkdir race tests. */
export async function acquireAndReleaseFreshFloodgateRoleBundleRootForTests(
  outputRoot: string,
): Promise<void> {
  const guard = await RoleBundleOutputRootGuard.acquireFresh(outputRoot);
  await guard.close();
}

/** Explicit non-production seam for held-handle rename/ABA tests. */
export async function runFreshFloodgateRoleBundleRootGuardCoreForTests(
  outputRoot: string,
  mutate: (root: string) => Promise<void>,
): Promise<void> {
  if (typeof mutate !== "function") {
    fail("non-production root-guard mutation must be a function");
  }
  const guard = await RoleBundleOutputRootGuard.acquireFresh(outputRoot);
  let primaryFailed = false;
  try {
    await mutate(outputRoot);
    await guard.assertState([], false, "non-production ABA check");
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    try {
      await guard.close();
    } catch (closeError) {
      if (!primaryFailed) throw closeError;
    }
  }
}

/** Explicit non-production seam for existing-bundle identity-closure tests. */
export async function verifyExistingFloodgateRoleBundleArtifactsCoreForTests(
  outputRoot: string,
  expectedInput: Readonly<Record<string, string>>,
  beforeFinalRead: () => Promise<void> = async () => undefined,
): Promise<void> {
  if (typeof beforeFinalRead !== "function") {
    fail("non-production existing-bundle verifier hook must be a function");
  }
  const expectedObject = strictObject(
    expectedInput,
    "non-production existing-bundle artifacts",
  );
  const expected = new Map<string, string>();
  for (const filename of Object.getOwnPropertyNames(expectedObject)) {
    if (
      filename.length === 0 ||
      path.basename(filename) !== filename ||
      typeof expectedObject[filename] !== "string"
    ) {
      fail("non-production existing-bundle artifacts are invalid");
    }
    expected.set(filename, expectedObject[filename] as string);
  }
  const entries = [...expected.keys()];
  const guard = await RoleBundleOutputRootGuard.acquireExisting(
    outputRoot,
    entries,
  );
  let primaryFailed = false;
  const verify = async (stage: string): Promise<void> => {
    await guard.assertState(entries, false, `before ${stage}`);
    for (const [filename, contents] of expected) {
      const snapshot = await readRegularFileSnapshotNoFollow(
        path.join(outputRoot, filename),
      );
      if (!Buffer.from(snapshot.bytes).equals(Buffer.from(contents, "utf8"))) {
        fail(`non-production existing-bundle bytes changed: ${filename}`);
      }
    }
    await guard.assertState(entries, false, `after ${stage}`);
  };
  try {
    await verify("initial existing-bundle read");
    await beforeFinalRead();
    await verify("final existing-bundle read");
    await guard.assertState(entries, false, "final existing-bundle closure");
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    try {
      await guard.close();
    } catch (closeError) {
      if (!primaryFailed) throw closeError;
    }
  }
}

/**
 * Exercise the real manifest-last filesystem transaction with tiny unlabeled
 * bytes. The callback runs after the final data read and before the manifest.
 */
export async function runFreshFloodgateRoleBundleOutputLifecycleCoreForTests(
  outputRoot: string,
  beforeManifestCheck: (root: string) => Promise<void>,
  manifestFailpoint?: (
    phase: FloodgateDurableCreatePhase,
    linkedIdentity?: Readonly<FloodgateDurableLinkedFileIdentity>,
  ) => void | Promise<void>,
): Promise<void> {
  if (typeof beforeManifestCheck !== "function") {
    fail("non-production pre-manifest mutation must be a function");
  }
  if (
    manifestFailpoint !== undefined &&
    typeof manifestFailpoint !== "function"
  ) {
    fail("non-production manifest failpoint must be a function");
  }
  const guard = await RoleBundleOutputRootGuard.acquireFresh(outputRoot);
  const fixtureFiles = new Map<string, string>([
    ["fixture-a.raw.jsonl", '{"fixture":"a"}\n'],
    ["fixture-b.protected-position-ids.txt", `sha256:${"1".repeat(64)}\n`],
  ]);
  const dataEntries: string[] = [];
  const verifyData = async (includeManifest = false): Promise<void> => {
    const expectedEntries = [
      ...dataEntries,
      ...(includeManifest ? [FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME] : []),
    ];
    await guard.assertState(
      expectedEntries,
      false,
      "fixture data verification",
    );
    for (const [filename, expected] of fixtureFiles) {
      const actual = await readRegularFileNoFollow(
        path.join(outputRoot, filename),
      );
      if (!Buffer.from(actual).equals(Buffer.from(expected, "utf8"))) {
        fail(`non-production fixture data changed: ${filename}`);
      }
    }
    await guard.assertState(
      expectedEntries,
      false,
      "after fixture data verification",
    );
  };
  const manifestText = '{"fixture":"manifest"}\n';
  const manifestPublication: RoleBundleTrackedManifestPublicationState = {
    ownedIdentity: null,
    ownedHandle: null,
    stableIdentity: null,
  };
  let primaryFailed = false;
  try {
    await runRoleBundlePublishSequence({
      validateCandidate: () => undefined,
      publishDataFiles: async () => {
        for (const [filename, contents] of fixtureFiles) {
          await guard.assertState(
            dataEntries,
            false,
            `before fixture ${filename}`,
          );
          await durableCreateNoClobber(
            path.join(outputRoot, filename),
            contents,
          );
          dataEntries.push(filename);
          await guard.assertState(
            dataEntries,
            true,
            `after fixture ${filename}`,
          );
        }
      },
      verifyDataFiles: verifyData,
      revalidateSourceClosure: async () => undefined,
      publishManifest: async () => {
        await beforeManifestCheck(outputRoot);
        await guard.assertState(
          dataEntries,
          false,
          "fixture before manifest publication",
        );
        const manifestPath = path.join(
          outputRoot,
          FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
        );
        await durablePublishTrackedRoleBundleManifest(
          manifestPath,
          manifestText,
          manifestPublication,
          manifestFailpoint,
        );
        await guard.assertState(
          [...dataEntries, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME],
          true,
          "fixture after manifest publication",
        );
      },
      verifyCompleteBundle: async () => {
        await verifyData(true);
        const manifestSnapshot = await readRegularFileSnapshotNoFollow(
          path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
        );
        if (
          !Buffer.from(manifestSnapshot.bytes).equals(
            Buffer.from(manifestText, "utf8"),
          ) ||
          !manifestPublication.stableIdentity ||
          !sameRegularFileSnapshot(
            manifestSnapshot.identity,
            manifestPublication.stableIdentity,
          )
        ) {
          fail("non-production fixture manifest changed");
        }
        await guard.assertState(
          [...dataEntries, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME],
          false,
          "fixture complete verification",
        );
      },
    });
  } catch (error) {
    primaryFailed = true;
    await invalidateTrackedRoleBundleManifestAfterFailure(
      guard,
      manifestPublication,
      error,
    );
  } finally {
    await closeRoleBundlePublicationResources(
      guard,
      manifestPublication,
      primaryFailed,
    );
  }
}

async function assertExistingBundleRoot(
  outputRoot: string,
  expectedEntries: readonly string[],
): Promise<void> {
  const stat = await fs.promises.lstat(outputRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail("existing role-bundle root must be a real directory");
  }
  if ((await fs.promises.realpath(outputRoot)) !== outputRoot) {
    fail("existing role-bundle root must not traverse symbolic links");
  }
  const entries = (await fs.promises.readdir(outputRoot)).sort(compareBytewise);
  const wanted = [...expectedEntries].sort(compareBytewise);
  if (
    entries.length !== wanted.length ||
    entries.some((entry, index) => entry !== wanted[index])
  ) {
    fail("existing role-bundle root entries are not exact");
  }
}

async function verifyBundleFiles(
  outputRoot: string,
  build: Readonly<RoleBundleBuild>,
  includeManifest: boolean,
): Promise<void> {
  const expectedEntries = [
    ...build.files.keys(),
    ...(includeManifest ? [FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME] : []),
  ];
  await assertExistingBundleRoot(outputRoot, expectedEntries);
  for (const [filename, expected] of build.files) {
    const bytes = await readRegularFileNoFollow(
      path.join(outputRoot, filename),
    );
    if (!Buffer.from(bytes).equals(Buffer.from(expected, "utf8"))) {
      fail(`published role-bundle artifact differs: ${filename}`);
    }
  }
  if (includeManifest) {
    const manifestBytes = await readRegularFileNoFollow(
      path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
    );
    const parsed = parseCanonicalManifest(manifestBytes);
    if (
      !Buffer.from(manifestBytes).equals(
        Buffer.from(build.manifestText, "utf8"),
      ) ||
      !isDeepStrictEqual(parsed, build.manifest)
    ) {
      fail("published role-bundle manifest differs from verified evidence");
    }
  }
}

function normalizedOptions(
  optionsInput: CreateFloodgateRoleBundleOptions,
  label: string,
): Readonly<CreateFloodgateRoleBundleOptions> {
  const options = strictObject(optionsInput, label);
  exactKeys(
    options,
    [
      "legacyProtectedPositionIdsPath",
      "outputRoot",
      "rawLockRoot",
      "repositoryRoot",
      "roleLockRoot",
      "verifierRevision",
    ],
    label,
  );
  const repositoryRoot = canonicalAbsolutePath(
    options.repositoryRoot,
    `${label}.repositoryRoot`,
  );
  const rawLockRoot = canonicalAbsolutePath(
    options.rawLockRoot,
    `${label}.rawLockRoot`,
  );
  const roleLockRoot = canonicalAbsolutePath(
    options.roleLockRoot,
    `${label}.roleLockRoot`,
  );
  const legacyProtectedPositionIdsPath = canonicalAbsolutePath(
    options.legacyProtectedPositionIdsPath,
    `${label}.legacyProtectedPositionIdsPath`,
  );
  const outputRoot = canonicalAbsolutePath(
    options.outputRoot,
    `${label}.outputRoot`,
  );
  const verifierRevision = options.verifierRevision;
  if (
    typeof verifierRevision !== "string" ||
    !REVISION_RE.test(verifierRevision)
  ) {
    fail(`${label}.verifierRevision is invalid`);
  }
  const captured = Object.freeze({
    repositoryRoot,
    verifierRevision,
    rawLockRoot,
    roleLockRoot,
    legacyProtectedPositionIdsPath,
    outputRoot,
  });
  const roots: string[] = [
    captured.repositoryRoot,
    captured.rawLockRoot,
    captured.roleLockRoot,
    captured.outputRoot,
  ];
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      assertDisjointTrees(
        roots[left],
        roots[right],
        `${label} roots ${left}/${right}`,
      );
    }
  }
  return captured;
}

/** Explicit seam proving caller-owned option records cannot redirect later I/O. */
export function captureFloodgateRoleBundleOptionsCoreForTests(
  optionsInput: CreateFloodgateRoleBundleOptions,
): Readonly<CreateFloodgateRoleBundleOptions> {
  return normalizedOptions(optionsInput, "non-production role-bundle options");
}

function roleLockOptions(
  options: CreateFloodgateRoleBundleOptions,
): VerifyExistingFloodgateRoleLockOptions {
  return {
    repositoryRoot: options.repositoryRoot,
    verifierRevision: options.verifierRevision,
    rawLockRoot: options.rawLockRoot,
    roleLockRoot: options.roleLockRoot,
    legacyProtectedPositionIdsPath: options.legacyProtectedPositionIdsPath,
  };
}

function validateBuild(build: Readonly<RoleBundleBuild>): void {
  if (`${canonicalJson(build.manifest)}\n` !== build.manifestText) {
    fail("role-bundle manifest candidate is not canonical");
  }
  for (const role of FLOODGATE_ROLE_PRIORITY) {
    const artifact = build.roles[role];
    const raw = fileIdentity(artifact.rawIdentity.path, artifact.rawText);
    const protectedFile = fileIdentity(
      artifact.protectedIdentity.path,
      artifact.protectedText,
    );
    if (
      raw.bytes !== artifact.rawIdentity.bytes ||
      raw.sha256 !== artifact.rawIdentity.sha256 ||
      protectedFile.bytes !== artifact.protectedIdentity.bytes ||
      protectedFile.sha256 !== artifact.protectedIdentity.sha256 ||
      !isDeepStrictEqual(
        build.manifest.roles[role].raw_parents,
        artifact.rawIdentity,
      ) ||
      !isDeepStrictEqual(
        build.manifest.roles[role].protected_position_ids,
        artifact.protectedIdentity,
      )
    ) {
      fail(`${role} manifest/artifact identities do not close`);
    }
  }
  const replay = fileIdentity(build.replayIdentity.path, build.replay.text);
  const receipt = fileIdentity(
    build.replayReceiptIdentity.path,
    build.replay.receipt_json,
  );
  if (
    replay.bytes !== build.replayIdentity.bytes ||
    replay.sha256 !== build.replayIdentity.sha256 ||
    receipt.bytes !== build.replayReceiptIdentity.bytes ||
    receipt.sha256 !== build.replayReceiptIdentity.sha256 ||
    !isDeepStrictEqual(
      build.manifest.replay_exclusion.identifiers,
      build.replayIdentity,
    ) ||
    !isDeepStrictEqual(
      build.manifest.replay_exclusion.receipt,
      build.replayReceiptIdentity,
    ) ||
    !isDeepStrictEqual(
      build.manifest.replay_exclusion.summary,
      build.replay.receipt,
    )
  ) {
    fail("replay manifest/artifact identities do not close");
  }
}

async function publishRoleBundle(
  options: CreateFloodgateRoleBundleOptions,
  roleLock: Readonly<VerifiedFloodgateRoleLock>,
  build: Readonly<RoleBundleBuild>,
): Promise<void> {
  const guard = await RoleBundleOutputRootGuard.acquireFresh(
    options.outputRoot,
  );
  const dataEntries: string[] = [];
  const manifestPublication: RoleBundleTrackedManifestPublicationState = {
    ownedIdentity: null,
    ownedHandle: null,
    stableIdentity: null,
  };
  let primaryFailed = false;
  try {
    await runRoleBundlePublishSequence({
      validateCandidate: () => validateBuild(build),
      publishDataFiles: async () => {
        for (const filename of [...build.files.keys()].sort(compareBytewise)) {
          await guard.assertState(
            dataEntries,
            false,
            `before ${filename} publication`,
          );
          await durableCreateNoClobber(
            path.join(options.outputRoot, filename),
            build.files.get(filename)!,
          );
          dataEntries.push(filename);
          await guard.assertState(
            dataEntries,
            true,
            `after ${filename} publication`,
          );
        }
      },
      verifyDataFiles: async () => {
        await guard.assertState(
          dataEntries,
          false,
          "data artifact verification",
        );
        await verifyBundleFiles(options.outputRoot, build, false);
        await guard.assertState(
          dataEntries,
          false,
          "after data artifact verification",
        );
      },
      revalidateSourceClosure: async () => {
        const reverified = await verifyExistingFloodgateRoleLock(
          roleLockOptions(options),
        );
        assertVerifiedRoleLockStable(reverified, roleLock);
        await assertRoleBundleGitClosure(
          options.repositoryRoot,
          options.verifierRevision,
          Object.freeze({
            bundleProducerRevision: options.verifierRevision,
            roleLockProducerRevision: roleLock.producerRevision,
            rawLockSourceRevision: roleLock.rawManifest.source.revision,
          }),
        );
      },
      publishManifest: async () => {
        await guard.assertState(
          dataEntries,
          false,
          "before manifest publication",
        );
        const manifestPath = path.join(
          options.outputRoot,
          FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
        );
        await durablePublishTrackedRoleBundleManifest(
          manifestPath,
          build.manifestText,
          manifestPublication,
        );
        await guard.assertState(
          [...dataEntries, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME],
          true,
          "after manifest publication",
        );
      },
      verifyCompleteBundle: async () => {
        await guard.assertState(
          [...dataEntries, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME],
          false,
          "complete bundle verification",
        );
        await verifyBundleFiles(options.outputRoot, build, true);
        const manifestSnapshot = await readRegularFileSnapshotNoFollow(
          path.join(
            options.outputRoot,
            FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
          ),
        );
        if (
          !manifestPublication.stableIdentity ||
          !sameRegularFileSnapshot(
            manifestSnapshot.identity,
            manifestPublication.stableIdentity,
          )
        ) {
          fail("published role-bundle manifest inode changed");
        }
        await guard.assertState(
          [...dataEntries, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME],
          false,
          "after complete bundle verification",
        );
      },
    });
  } catch (error) {
    primaryFailed = true;
    await invalidateTrackedRoleBundleManifestAfterFailure(
      guard,
      manifestPublication,
      error,
    );
  } finally {
    await closeRoleBundlePublicationResources(
      guard,
      manifestPublication,
      primaryFailed,
    );
  }
}

/**
 * Publish the exact three role inputs and replay exclusion. No teacher process
 * is invoked and no labeled data path is accepted by this API.
 */
export async function createFloodgateRoleBundle(
  optionsInput: CreateFloodgateRoleBundleOptions,
): Promise<Readonly<FloodgateRoleBundleManifest>> {
  const options = normalizedOptions(optionsInput, "create role-bundle options");
  const roleLock = await verifyExistingFloodgateRoleLock(
    roleLockOptions(options),
  );
  await assertRoleBundleGitClosure(
    options.repositoryRoot,
    options.verifierRevision,
    Object.freeze({
      bundleProducerRevision: options.verifierRevision,
      roleLockProducerRevision: roleLock.producerRevision,
      rawLockSourceRevision: roleLock.rawManifest.source.revision,
    }),
  );
  const build = await buildRoleBundle(
    roleLock,
    options.rawLockRoot,
    options.legacyProtectedPositionIdsPath,
    options.verifierRevision,
  );
  validateBuild(build);
  await publishRoleBundle(options, roleLock, build);
  return build.manifest;
}

/** Verify a complete bundle and independently rebuild every output byte. */
export async function verifyExistingFloodgateRoleBundle(
  optionsInput: VerifyExistingFloodgateRoleBundleOptions,
): Promise<Readonly<VerifiedFloodgateRoleBundle>> {
  const options = normalizedOptions(
    optionsInput,
    "verify existing role-bundle options",
  );
  const expectedEntries = [
    ...Object.values(ROLE_FILENAMES).flatMap(
      ({ raw, protected: protected_ }) => [raw, protected_],
    ),
    FLOODGATE_ROLE_BUNDLE_REPLAY_FILENAME,
    FLOODGATE_ROLE_BUNDLE_REPLAY_RECEIPT_FILENAME,
    FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
  ];
  const guard = await RoleBundleOutputRootGuard.acquireExisting(
    options.outputRoot,
    expectedEntries,
  );
  let primaryFailed = false;
  try {
    await guard.assertState(
      expectedEntries,
      false,
      "before historical manifest read",
    );
    const historicalManifestSnapshot = await readRegularFileSnapshotNoFollow(
      path.join(options.outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
    );
    const historicalManifestCandidate = parseCanonicalManifest(
      historicalManifestSnapshot.bytes,
    );
    const binding = historicalRoleBundleRevisionBinding(
      historicalManifestCandidate,
    );
    await guard.assertState(
      expectedEntries,
      false,
      "after historical manifest read",
    );
    await assertRoleBundleGitClosure(
      options.repositoryRoot,
      options.verifierRevision,
      binding,
    );

    const roleLock = await verifyExistingFloodgateRoleLock(
      roleLockOptions(options),
    );
    if (roleLock.producerRevision !== binding.roleLockProducerRevision) {
      fail("historical bundle cites a different role-lock producer revision");
    }
    if (
      roleLock.rawManifest.source.revision !== binding.rawLockSourceRevision
    ) {
      fail("historical bundle cites a different raw-lock source revision");
    }
    const build = await buildRoleBundle(
      roleLock,
      options.rawLockRoot,
      options.legacyProtectedPositionIdsPath,
      binding.bundleProducerRevision,
    );
    validateBuild(build);
    await guard.assertState(
      expectedEntries,
      false,
      "before first complete bundle verification",
    );
    await verifyBundleFiles(options.outputRoot, build, true);
    await assertExistingFloodgateRoleLockFilesystemClosure(
      options.roleLockRoot,
      roleLock.filesystemClosure,
    );
    await guard.assertState(
      expectedEntries,
      false,
      "after first complete bundle verification",
    );

    const reverified = await verifyExistingFloodgateRoleLock(
      roleLockOptions(options),
    );
    assertVerifiedRoleLockStable(reverified, roleLock);
    if (reverified.producerRevision !== binding.roleLockProducerRevision) {
      fail("role-lock producer changed during bundle verification");
    }
    if (
      reverified.rawManifest.source.revision !== binding.rawLockSourceRevision
    ) {
      fail("raw-lock source revision changed during bundle verification");
    }
    await assertRoleBundleGitClosure(
      options.repositoryRoot,
      options.verifierRevision,
      binding,
    );
    await guard.assertState(
      expectedEntries,
      false,
      "before final complete bundle verification",
    );
    await verifyBundleFiles(options.outputRoot, build, true);
    await assertExistingFloodgateRoleLockFilesystemClosure(
      options.roleLockRoot,
      roleLock.filesystemClosure,
    );
    await guard.assertState(
      expectedEntries,
      false,
      "final bundle filesystem closure",
    );
    return deepFreeze({
      manifest: build.manifest,
      manifestText: build.manifestText,
      roleLock,
      producerRevision: binding.bundleProducerRevision,
      verifierRevision: options.verifierRevision,
    });
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    try {
      await guard.close();
    } catch (closeError) {
      if (!primaryFailed) throw closeError;
    }
  }
}
