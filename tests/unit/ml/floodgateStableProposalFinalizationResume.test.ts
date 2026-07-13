import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SHOGI_WASM_BASE64 } from "../../../src/components/game/ShogiImproved/wasm/shogiWasmBase64";
import {
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
  type FloodgateExclusiveDirectoryRenameReceipt,
} from "../../../ml/floodgate-exclusive-directory-rename";
import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  FLOODGATE_ROLE_BUNDLE_SCHEMA,
  type FloodgateRoleBundleRawIdentity,
  type FloodgateRoleBundleRawParent,
} from "../../../ml/floodgate-role-bundle";
import type { VerifiedPinnedFloodgateRoleBundle } from "../../../ml/floodgate-role-bundle-result";
import {
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  type FloodgateTeacherStageAuthorizationDependencies,
  type FloodgateTeacherStageAuthorizationOptions,
  type FloodgateTeacherStagePublicationDependencies,
} from "../../../ml/floodgate-teacher-stage-authorization";
import {
  FLOODGATE_TRAINING_RAW_FILENAME,
  type FloodgateTrainingRowConsumerOptions,
} from "../../../ml/floodgate-training-row-consumer";
import type {
  FloodgateStableProposalCoordinatorDependencies,
  FloodgateStableProposalCoordinatorOptions,
} from "../../../ml/floodgate-stable-proposal-coordinator";
import type {
  FloodgateStableWasmProposerAssets,
  FloodgateStableWasmProposerDependencies,
  FloodgateStableWasmRawSearchResult,
  FloodgateStableWasmSearchResultBox,
} from "../../../ml/floodgate-stable-wasm-proposer";
import { floodgateCanonicalUrlGameId } from "../../../ml/floodgate-raw-lock";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import {
  childSfenAfterUsi,
  positionFromSfen,
  resolveUsiMove,
} from "../../../ml/shogi-sfen";
import { compareBytewise, positionKeyFromSfen } from "../../../ml/sibling-data";

const REPOSITORY_ROOT = process.cwd();
const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const PRODUCER_REVISION = "a".repeat(40);
const VERIFIER_REVISION = "b".repeat(40);
const RUN_ID = "12".repeat(32);
const KEY_ID = "synthetic-finalization-resume-key-1";
const ROOT_KEY_BYTE = 0x4b;
const ROLE_BUNDLE_RESULT_SCHEMA =
  "shogi-floodgate-role-bundle-result-v1" as const;
const ROLE_BUNDLE_RESULT_MODULE = "../../../ml/floodgate-role-bundle-result";
const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

interface SyntheticManifestIdentity {
  readonly path: "manifest.json";
  readonly bytes: number;
  readonly sha256: string;
}

interface ConsumerFixture {
  readonly rows: readonly FloodgateRoleBundleRawParent[];
  readonly identity: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly manifestIdentity: Readonly<SyntheticManifestIdentity>;
  readonly verified: Readonly<VerifiedPinnedFloodgateRoleBundle>;
  readonly options: FloodgateTrainingRowConsumerOptions;
}

interface StageFixture {
  readonly publicationParent: string;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  readonly leaseRoot: string;
  readonly options: FloodgateTeacherStageAuthorizationOptions;
}

type CoordinatorModule =
  typeof import("../../../ml/floodgate-stable-proposal-coordinator");
type ResumeModule =
  typeof import("../../../ml/floodgate-stable-proposal-finalization-resume");
type ResumeOptions = Parameters<
  ResumeModule["resumeAndPublishFloodgateStableProposalFinalizationCoreForTests"]
>[0];
type ResumeDependencies = Parameters<
  ResumeModule["resumeAndPublishFloodgateStableProposalFinalizationCoreForTests"]
>[1];
type ResumeEvent = Parameters<
  NonNullable<ResumeDependencies["phaseHookForTests"]>
>[0];

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("stable proposal resume tests require a POSIX euid");
  }
  return process.geteuid();
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function rootKey(byte = ROOT_KEY_BYTE): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function hostileSharedView(
  bytes: Uint8Array,
  forgedLength: number,
): Uint8Array {
  const value = new Uint8Array(new SharedArrayBuffer(bytes.byteLength));
  value.set(bytes);
  Object.defineProperties(value, {
    buffer: {
      configurable: true,
      get: () => new ArrayBuffer(forgedLength),
    },
    byteLength: {
      configurable: true,
      get: () => forgedLength,
    },
  });
  return value;
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
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(
  filePath: string,
  contents: string | Uint8Array,
): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

function fixtureRows(): readonly FloodgateRoleBundleRawParent[] {
  const url =
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+synthetic-resume+synthetic-b+20260101000000.csa";
  const gameId = floodgateCanonicalUrlGameId(url);
  const gameSha256 = sha256("synthetic resume fixture; no real game");
  const moves = ["7g7f", "3c3d", "2g2f", "8c8d"] as const;
  const rows: FloodgateRoleBundleRawParent[] = [];
  let parentSfen = START_SFEN;
  for (let ply = 0; ply < moves.length; ply += 1) {
    const move = moves[ply];
    if (ply >= 2) {
      rows.push({
        schema_version: 1,
        source: "floodgate",
        source_url: url,
        game_sha256: gameSha256,
        game_id: gameId,
        parent_id: `sha256:${sha256(
          `parent-occurrence-v1\0${gameId}\0${ply}`,
        )}`,
        position_id: positionKeyFromSfen(parentSfen),
        parent_sfen: parentSfen,
        ply,
        played_move: move,
      });
    }
    parentSfen = childSfenAfterUsi(parentSfen, move);
  }
  return rows.sort((left, right) =>
    compareBytewise(left.parent_id, right.parent_id),
  );
}

function rawIdentity(
  rows: readonly FloodgateRoleBundleRawParent[],
  bytes: Uint8Array,
): FloodgateRoleBundleRawIdentity {
  const gameIds = new Set(rows.map((row) => row.game_id));
  const parentIds = new Set(rows.map((row) => row.parent_id));
  const positionIds = new Set(rows.map((row) => row.position_id));
  return {
    path: FLOODGATE_TRAINING_RAW_FILENAME,
    format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    records: rows.length,
    games: gameIds.size,
    game_ids_sha256: floodgateIdentifierDigest(gameIds),
    parent_ids_sha256: floodgateIdentifierDigest(parentIds),
    position_ids_count: positionIds.size,
    position_ids_sha256: floodgateIdentifierDigest(positionIds),
  };
}

function buildVerifiedBundle(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): {
  readonly verified: Readonly<VerifiedPinnedFloodgateRoleBundle>;
  readonly manifestIdentity: Readonly<SyntheticManifestIdentity>;
} {
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
  const manifestIdentity = Object.freeze({
    path: "manifest.json" as const,
    bytes: Buffer.byteLength(manifestText),
    sha256: sha256(manifestText),
  });
  return {
    manifestIdentity,
    verified: {
      manifest,
      manifestText,
      roleLock: {},
      producerRevision: PRODUCER_REVISION,
      verifierRevision: VERIFIER_REVISION,
      result: {
        schema: ROLE_BUNDLE_RESULT_SCHEMA,
        status: "complete-label-free-role-bundle",
        claim_boundary: "integrity-only-not-playing-strength-evidence",
        manifest: { identity: manifestIdentity, value: manifest },
        execution: {},
        post_run_audit: {},
      },
    } as unknown as Readonly<VerifiedPinnedFloodgateRoleBundle>,
  };
}

async function consumerFixture(): Promise<ConsumerFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "stable-resume-consumer-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  await fs.promises.chmod(root, 0o700);
  const outputRoot = path.join(root, "bundle");
  await mkdir0700(outputRoot);
  const rows = fixtureRows();
  const bytes = Buffer.from(
    `${rows.map((row) => canonicalJson(row)).join("\n")}\n`,
  );
  await write0600(
    path.join(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME),
    bytes,
  );
  const identity = rawIdentity(rows, bytes);
  const built = buildVerifiedBundle(identity);
  return {
    rows,
    identity,
    manifestIdentity: built.manifestIdentity,
    verified: built.verified,
    options: {
      repositoryRoot: path.join(root, "repository"),
      verifierRevision: VERIFIER_REVISION,
      rawLockRoot: path.join(root, "raw-lock"),
      roleLockRoot: path.join(root, "role-lock"),
      legacyProtectedPositionIdsPath: path.join(root, "legacy-ids.txt"),
      outputRoot,
    },
  };
}

async function stageFixture(): Promise<StageFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "stable-resume-stage-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  await fs.promises.chmod(root, 0o700);
  const repositoryRoot = path.join(root, "repository");
  const rawLockRoot = path.join(root, "raw-lock");
  const roleLockRoot = path.join(root, "role-lock");
  const roleBundleRoot = path.join(root, "role-bundle");
  const publicationParent = path.join(root, "publication");
  const stageBasename = "stable-proposal-stage";
  const destinationBasename = "stable-proposal-final";
  const stageRoot = path.join(publicationParent, stageBasename);
  const destinationRoot = path.join(publicationParent, destinationBasename);
  const leaseRoot = path.join(
    publicationParent,
    `.${stageBasename}.authorization-lease`,
  );
  const legacyProtectedPositionIdsPath = path.join(root, "legacy", "ids.txt");
  const engineBin = path.join(root, "engine", "engine");
  const engineReceipt = path.join(root, "engine", "receipt.json");
  const engineArgument = path.join(root, "engine", "argument.bin");
  const evalDir = path.join(root, "eval");
  await Promise.all([
    mkdir0700(repositoryRoot),
    mkdir0700(rawLockRoot),
    mkdir0700(roleLockRoot),
    mkdir0700(roleBundleRoot),
    mkdir0700(publicationParent),
    mkdir0700(stageRoot),
    mkdir0700(evalDir),
  ]);
  await Promise.all([
    write0600(legacyProtectedPositionIdsPath, "synthetic ids\n"),
    write0600(engineBin, "synthetic engine\n"),
    write0600(engineReceipt, '{"synthetic":true}\n'),
    write0600(engineArgument, "synthetic argument\n"),
    write0600(path.join(evalDir, "nn.bin"), "synthetic eval\n"),
  ]);
  return {
    publicationParent,
    stageRoot,
    destinationRoot,
    leaseRoot,
    options: {
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      roleBundleRoot,
      legacyProtectedPositionIdsPath,
      publicationParent,
      stageBasename,
      destinationBasename,
      engineBin,
      engineReceipt,
      engineArgs: [engineArgument],
      evalDir,
    },
  };
}

let assetCache: FloodgateStableWasmProposerAssets | undefined;
function assets(): FloodgateStableWasmProposerAssets {
  assetCache ??= {
    planBytes: fs.readFileSync(
      path.join(
        REPOSITORY_ROOT,
        "ml",
        "protocols",
        "floodgate-q1-2026-fresh-sibling-plan.json",
      ),
    ),
    wasmBytes: fs.readFileSync(
      path.join(
        REPOSITORY_ROOT,
        "src",
        "components",
        "game",
        "ShogiImproved",
        "wasm",
        "shogi.wasm",
      ),
    ),
    embeddedWasmBytes: Buffer.from(SHOGI_WASM_BASE64, "base64"),
    weightsBytes: fs.readFileSync(
      path.join(REPOSITORY_ROOT, "public", "shogi-nnue-weights.bin"),
    ),
    workerSourceBytes: fs.readFileSync(
      path.join(REPOSITORY_ROOT, "ml", "floodgate-stable-wasm-worker.mjs"),
    ),
  };
  return assetCache;
}

function packedMove(sfen: string, usi: string): number {
  const { position } = positionFromSfen(sfen);
  const move = resolveUsiMove(position, usi);
  return (
    (move.koma & 0x3f) |
    (move.from << 6) |
    (move.to << 14) |
    (move.promote ? 1 << 22 : 0)
  );
}

function boxedResults(
  results: readonly Readonly<FloodgateStableWasmRawSearchResult>[],
): Readonly<FloodgateStableWasmSearchResultBox> {
  return Object.freeze({ results: Object.freeze([...results]) });
}

async function loadModules(
  manifestIdentity: Readonly<SyntheticManifestIdentity>,
): Promise<Readonly<{ coordinator: CoordinatorModule; resume: ResumeModule }>> {
  vi.resetModules();
  vi.doMock(ROLE_BUNDLE_RESULT_MODULE, async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../ml/floodgate-role-bundle-result")
      >();
    return {
      ...actual,
      FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY: manifestIdentity,
    };
  });
  const [coordinator, resume] = await Promise.all([
    import("../../../ml/floodgate-stable-proposal-coordinator"),
    import("../../../ml/floodgate-stable-proposal-finalization-resume"),
  ]);
  return { coordinator, resume };
}

function renameReceipt(
  parent: fs.BigIntStats,
  stage: fs.BigIntStats,
): Readonly<FloodgateExclusiveDirectoryRenameReceipt> {
  return Object.freeze({
    contract: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
    trust_boundary: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
    status: "verified-committed",
    parent_identity: Object.freeze({ dev: parent.dev, ino: parent.ino }),
    destination_identity: Object.freeze({ dev: stage.dev, ino: stage.ino }),
  });
}

async function movingPublication(
  value: StageFixture,
): Promise<Readonly<FloodgateTeacherStagePublicationDependencies>> {
  const [parent, stage] = await Promise.all([
    fs.promises.lstat(value.publicationParent, { bigint: true }),
    fs.promises.lstat(value.stageRoot, { bigint: true }),
  ]);
  return Object.freeze({
    exclusiveRename: async (source: string, destination: string) => {
      await fs.promises.rename(source, destination);
      return renameReceipt(parent, stage);
    },
  });
}

function authorizationDependencies(
  overrides: Partial<FloodgateTeacherStageAuthorizationDependencies> = {},
): FloodgateTeacherStageAuthorizationDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
    ...overrides,
  };
}

function coordinatorOptions(
  consumer: ConsumerFixture,
  stage: StageFixture,
): FloodgateStableProposalCoordinatorOptions {
  return {
    stageAuthorization: stage.options,
    consumer: consumer.options,
    proposerAssets: assets(),
    proposerOptions: {
      workers: 1,
      startupTimeoutMilliseconds: 30_000,
      searchTimeoutMilliseconds: 30_000,
    },
    checkpoint: { runId: RUN_ID, keyId: KEY_ID },
  };
}

async function coordinatorDependencies(
  consumer: ConsumerFixture,
  stage: StageFixture,
  overrides: Partial<FloodgateStableProposalCoordinatorDependencies> = {},
): Promise<FloodgateStableProposalCoordinatorDependencies> {
  const search = vi.fn(
    async (
      requests: Parameters<
        FloodgateStableWasmProposerDependencies["search"]
      >[0],
    ) =>
      boxedResults(
        requests.map((request) => ({
          index: request.index,
          packed_move: packedMove(
            consumer.rows[request.index].parent_sfen,
            consumer.rows[request.index].played_move,
          ),
          raw_search_score: 0,
          completed_depth: 11,
          nodes: 10 + request.index,
          leaves: 20 + request.index,
        })),
      ),
  );
  return {
    rootKey: rootKey(),
    effectiveUserId: effectiveUserId(),
    stageAuthorization: authorizationDependencies(),
    consumer: {
      verifyBundle: vi.fn(async () => consumer.verified),
      expectedManifestIdentity: consumer.manifestIdentity,
    },
    proposer: { search },
    publication: await movingPublication(stage),
    ...overrides,
  };
}

function resumeOptions(
  consumer: ConsumerFixture,
  stage: StageFixture,
): ResumeOptions {
  return {
    stageAuthorization: stage.options,
    consumer: consumer.options,
    finalization: { runId: RUN_ID, keyId: KEY_ID },
  };
}

async function resumeDependencies(
  consumer: ConsumerFixture,
  stage: StageFixture,
  key: Uint8Array,
  overrides: Partial<ResumeDependencies> = {},
): Promise<ResumeDependencies> {
  return {
    rootKey: key,
    effectiveUserId: effectiveUserId(),
    stageAuthorization: authorizationDependencies(),
    consumer: {
      verifyBundle: vi.fn(async () => consumer.verified),
      expectedManifestIdentity: consumer.manifestIdentity,
    },
    publication: await movingPublication(stage),
    ...overrides,
  };
}

async function captureFailure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
}

async function expectMissing(filePath: string): Promise<void> {
  await expect(fs.promises.lstat(filePath)).rejects.toMatchObject({
    code: "ENOENT",
  });
}

async function sortedEntries(directory: string): Promise<readonly string[]> {
  return (await fs.promises.readdir(directory)).sort(compareBytewise);
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child, seen);
}

function forbiddenReceiptKeys(value: unknown): string[] {
  const forbidden = new Set([
    "artifact",
    "fd",
    "lease",
    "postflightReceipt",
    "rawBytes",
    "rootKey",
    "rows",
    "transaction",
  ]);
  const found = new Set<string>();
  const seen = new Set<object>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object") return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key === "string" && forbidden.has(key)) found.add(key);
      visit(Reflect.get(candidate, key));
    }
  };
  visit(value);
  return [...found].sort(compareBytewise);
}

type SeedState = "work-only" | "result-prefix" | "manifest-prefix";

async function seedState(
  modules: Readonly<{ coordinator: CoordinatorModule }>,
  consumer: ConsumerFixture,
  stage: StageFixture,
  state: SeedState,
): Promise<Readonly<{ completeMetadata?: Buffer; prefixPath?: string }>> {
  const overrides: Partial<FloodgateStableProposalCoordinatorDependencies> =
    state === "work-only"
      ? {
          phaseHookForTests: (event) => {
            if (event === "postflight-complete") {
              throw new Error("synthetic work-only resume seed");
            }
          },
        }
      : {
          finalizer: {
            failpointForTests: (event) => {
              const target =
                state === "result-prefix"
                  ? "result-written"
                  : "manifest-written";
              if (event === target) {
                throw new Error(`synthetic ${state} resume seed`);
              }
            },
          },
        };
  const failure = await captureFailure(
    modules.coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
      coordinatorOptions(consumer, stage),
      await coordinatorDependencies(consumer, stage, overrides),
    ),
  );
  expect(failure).toMatchObject({
    mayHavePublished: false,
    leaseMayRemain: false,
    retryDisposition: "resume-finalization-over-complete-authenticated-work",
  });
  await expectMissing(stage.leaseRoot);
  await expectMissing(stage.destinationRoot);
  if (state === "work-only") {
    expect(await sortedEntries(stage.stageRoot)).toEqual(["work.jsonl"]);
    return {};
  }
  const filename = state === "result-prefix" ? "result.json" : "manifest.json";
  const prefixPath = path.join(stage.stageRoot, filename);
  const completeMetadata = await fs.promises.readFile(prefixPath);
  expect(completeMetadata.byteLength).toBeGreaterThan(2);
  await fs.promises.truncate(
    prefixPath,
    Math.floor(completeMetadata.byteLength / 2),
  );
  const prefix = await fs.promises.readFile(prefixPath);
  expect(completeMetadata.subarray(0, prefix.byteLength)).toEqual(prefix);
  return { completeMetadata, prefixPath };
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.doUnmock(ROLE_BUNDLE_RESULT_MODULE);
  vi.resetModules();
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await fs.promises.chmod(root, 0o700).catch(() => undefined);
      await fs.promises.rm(root, { recursive: true, force: true });
    }),
  );
});

posixDescribe("Floodgate stable proposal explicit finalization resume", () => {
  it("rejects checkpoint/proposer surfaces and a hostile shared key before side effects", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const { resume } = await loadModules(consumer.manifestIdentity);
    const verifyBundle = vi.fn(async () => consumer.verified);
    let authorizations = 0;
    const base = await resumeDependencies(consumer, stage, rootKey(), {
      consumer: {
        verifyBundle,
        expectedManifestIdentity: consumer.manifestIdentity,
      },
      stageAuthorization: authorizationDependencies({
        afterLeaseAcquiredForTests: () => {
          authorizations += 1;
        },
      }),
    });
    const invalidInvocations: readonly [unknown, unknown][] = [
      [
        {
          ...resumeOptions(consumer, stage),
          stageAuthorization: {
            ...stage.options,
            stageBasename: "../../../escape",
          },
        },
        base,
      ],
      [
        { ...resumeOptions(consumer, stage), checkpoint: { runId: RUN_ID } },
        base,
      ],
      [resumeOptions(consumer, stage), { ...base, proposer: {} }],
      [
        resumeOptions(consumer, stage),
        {
          ...base,
          rootKey: hostileSharedView(new Uint8Array([ROOT_KEY_BYTE]), 32),
        },
      ],
    ];

    for (const [invalidOptions, invalidDependencies] of invalidInvocations) {
      const failure = await captureFailure(
        resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
          invalidOptions as ResumeOptions,
          invalidDependencies as ResumeDependencies,
        ),
      );
      expect(failure).toBeInstanceOf(
        resume.FloodgateStableProposalFinalizationResumeError,
      );
      expect(failure).toMatchObject({
        phase: "capture",
        inputClaimed: false,
        leaseAcquired: false,
        postflightMinted: false,
        finalizerStarted: false,
        mayHavePersisted: false,
        mayHavePublished: false,
        leaseMayRemain: false,
      });
    }
    expect(verifyBundle).not.toHaveBeenCalled();
    expect(authorizations).toBe(0);
    expect(await sortedEntries(stage.stageRoot)).toEqual([]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("resumes work-only with one authorization, exact handoff order, and a compact frozen receipt", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const modules = await loadModules(consumer.manifestIdentity);
    await seedState(modules, consumer, stage, "work-only");
    const workBefore = await fs.promises.readFile(
      path.join(stage.stageRoot, "work.jsonl"),
    );
    const workStatBefore = await fs.promises.stat(
      path.join(stage.stageRoot, "work.jsonl"),
      { bigint: true },
    );
    const events: ResumeEvent[] = [];
    let authorizations = 0;
    const key = rootKey();
    const beforeKey = new Uint8Array(key);
    const receipt =
      await modules.resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
        resumeOptions(consumer, stage),
        await resumeDependencies(consumer, stage, key, {
          stageAuthorization: authorizationDependencies({
            afterLeaseAcquiredForTests: () => {
              authorizations += 1;
            },
          }),
          phaseHookForTests: (event) => {
            events.push(event);
          },
        }),
      );

    expect(receipt).toMatchObject({
      contract:
        modules.resume.FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_CONTRACT,
      status:
        modules.resume.FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_STATUS,
      claim_boundary:
        modules.resume
          .FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_CLAIM_BOUNDARY,
      execution_boundary: "test-only-fixed-boundary-composition",
      execution_path: "resume-finalization-only",
      run_id: RUN_ID,
      key_id: KEY_ID,
      handoff: {
        proposer_skipped: true,
        checkpoint_skipped: true,
        exact_input_claimed_synchronously: true,
        exact_postflight_minted: true,
        fresh_finalizer_lease_acquired: true,
      },
      finalization: {
        postpublication: { content_reverified: true },
      },
    });
    expect(Object.keys(receipt)).toEqual([
      "contract",
      "status",
      "claim_boundary",
      "execution_boundary",
      "execution_path",
      "run_id",
      "key_id",
      "handoff",
      "finalization",
    ]);
    expect(Object.keys(receipt.handoff)).toEqual([
      "proposer_skipped",
      "checkpoint_skipped",
      "exact_input_claimed_synchronously",
      "exact_postflight_minted",
      "fresh_finalizer_lease_acquired",
      "finalizer_contract",
    ]);
    expect(events).toEqual([
      "input-claimed",
      "fresh-finalizer-lease-acquired",
      "postflight-complete",
      "before-finalization",
    ]);
    expect(authorizations).toBe(1);
    expect(key).toEqual(beforeKey);
    expectDeepFrozen(receipt);
    expect(forbiddenReceiptKeys(receipt)).toEqual([]);
    const auditText = JSON.stringify(receipt, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString(10) : value,
    );
    expect(Buffer.byteLength(auditText, "utf8")).toBeLessThan(8_192);
    expect(await sortedEntries(stage.destinationRoot)).toEqual([
      "manifest.json",
      "result.json",
      "work.jsonl",
    ]);
    const publishedWorkPath = path.join(stage.destinationRoot, "work.jsonl");
    expect(await fs.promises.readFile(publishedWorkPath)).toEqual(workBefore);
    const workStatAfter = await fs.promises.stat(publishedWorkPath, {
      bigint: true,
    });
    expect({ dev: workStatAfter.dev, ino: workStatAfter.ino }).toEqual({
      dev: workStatBefore.dev,
      ino: workStatBefore.ino,
    });
    await expectMissing(stage.stageRoot);
    await expectMissing(stage.leaseRoot);
  });

  for (const state of ["result-prefix", "manifest-prefix"] as const) {
    it(`resumes an exact ${state} without replacing the prefix file`, async () => {
      const consumer = await consumerFixture();
      const stage = await stageFixture();
      const modules = await loadModules(consumer.manifestIdentity);
      const seeded = await seedState(modules, consumer, stage, state);
      if (
        seeded.prefixPath === undefined ||
        seeded.completeMetadata === undefined
      ) {
        throw new Error("prefix seed did not return metadata");
      }
      const prefix = await fs.promises.readFile(seeded.prefixPath);
      const beforeStat = await fs.promises.stat(seeded.prefixPath, {
        bigint: true,
      });
      const key = rootKey();
      const beforeKey = new Uint8Array(key);

      const receipt =
        await modules.resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
          resumeOptions(consumer, stage),
          await resumeDependencies(consumer, stage, key),
        );

      const filename = path.basename(seeded.prefixPath);
      const publishedPath = path.join(stage.destinationRoot, filename);
      const published = await fs.promises.readFile(publishedPath);
      expect(published).toEqual(seeded.completeMetadata);
      expect(published.subarray(0, prefix.byteLength)).toEqual(prefix);
      const afterStat = await fs.promises.stat(publishedPath, { bigint: true });
      expect({ dev: afterStat.dev, ino: afterStat.ino }).toEqual({
        dev: beforeStat.dev,
        ino: beforeStat.ino,
      });
      expect(receipt.finalization.postpublication.content_reverified).toBe(
        true,
      );
      expect(key).toEqual(beforeKey);
      await expectMissing(stage.stageRoot);
      await expectMissing(stage.leaseRoot);
    });
  }

  it("preserves a mismatched metadata prefix for manual reconciliation", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const modules = await loadModules(consumer.manifestIdentity);
    const seeded = await seedState(modules, consumer, stage, "result-prefix");
    if (seeded.prefixPath === undefined) {
      throw new Error("result-prefix seed did not return a path");
    }
    const mismatched = await fs.promises.readFile(seeded.prefixPath);
    mismatched[0] ^= 0x01;
    await fs.promises.writeFile(seeded.prefixPath, mismatched);

    const failure = await captureFailure(
      modules.resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
        resumeOptions(consumer, stage),
        await resumeDependencies(consumer, stage, rootKey()),
      ),
    );

    expect(failure).toMatchObject({
      phase: "finalization-publication",
      workVerified: true,
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "manual-content-reconciliation-required",
    });
    expect(await fs.promises.readFile(seeded.prefixPath)).toEqual(mismatched);
    expect(await sortedEntries(stage.stageRoot)).toEqual([
      "result.json",
      "work.jsonl",
    ]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("closes the fresh lease when consumer postflight detects a mutation", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const modules = await loadModules(consumer.manifestIdentity);
    await seedState(modules, consumer, stage, "work-only");
    const trainingPath = path.join(
      consumer.options.outputRoot,
      FLOODGATE_TRAINING_RAW_FILENAME,
    );

    const failure = await captureFailure(
      modules.resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
        resumeOptions(consumer, stage),
        await resumeDependencies(consumer, stage, rootKey(), {
          phaseHookForTests: async (event) => {
            if (event === "fresh-finalizer-lease-acquired") {
              await fs.promises.appendFile(
                trainingPath,
                "synthetic resume postflight mutation\n",
              );
            }
          },
        }),
      ),
    );

    expect(failure).toMatchObject({
      phase: "consumer-postflight",
      inputClaimed: true,
      leaseAcquired: true,
      postflightMinted: false,
      finalizerStarted: false,
      leaseMayRemain: false,
      retryDisposition: "rerun-finalization-resume-with-fresh-authority",
    });
    expect(await sortedEntries(stage.stageRoot)).toEqual(["work.jsonl"]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("reclaims fresh lease and postflight after a pre-finalizer interruption", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const modules = await loadModules(consumer.manifestIdentity);
    await seedState(modules, consumer, stage, "work-only");

    const failure = await captureFailure(
      modules.resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
        resumeOptions(consumer, stage),
        await resumeDependencies(consumer, stage, rootKey(), {
          phaseHookForTests: (event) => {
            if (event === "postflight-complete") {
              throw new Error("synthetic resume pre-finalizer interruption");
            }
          },
        }),
      ),
    );

    expect(failure).toMatchObject({
      phase: "consumer-postflight",
      postflightMinted: true,
      finalizerStarted: false,
      leaseMayRemain: false,
      mayHavePublished: false,
      retryDisposition: "rerun-finalization-resume-with-fresh-authority",
      cleanupFailures: [],
    });
    expect(await sortedEntries(stage.stageRoot)).toEqual(["work.jsonl"]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("preserves publication and lease ambiguity after a post-rename interruption", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const modules = await loadModules(consumer.manifestIdentity);
    await seedState(modules, consumer, stage, "work-only");
    const publication = await movingPublication(stage);

    const failure = await captureFailure(
      modules.resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
        resumeOptions(consumer, stage),
        await resumeDependencies(consumer, stage, rootKey(), {
          publication: {
            ...publication,
            beforeDestinationReopenForTests: () => {
              throw new Error("synthetic resume post-rename interruption");
            },
          },
        }),
      ),
    );

    expect(failure).toMatchObject({
      phase: "finalization-publication",
      finalizerStarted: true,
      mayHavePublished: true,
      leaseMayRemain: true,
      retryDisposition: "manual-publication-and-lease-reconciliation-required",
    });
    await expectMissing(stage.stageRoot);
    expect(await sortedEntries(stage.destinationRoot)).toEqual([
      "manifest.json",
      "result.json",
      "work.jsonl",
    ]);
    expect((await fs.promises.lstat(stage.leaseRoot)).isDirectory()).toBe(true);
  });

  it("fails closed on a wrong key without changing work or the caller key", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const modules = await loadModules(consumer.manifestIdentity);
    await seedState(modules, consumer, stage, "work-only");
    const workPath = path.join(stage.stageRoot, "work.jsonl");
    const workBefore = await fs.promises.readFile(workPath);
    const key = rootKey(ROOT_KEY_BYTE + 1);
    const beforeKey = new Uint8Array(key);

    const failure = await captureFailure(
      modules.resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
        resumeOptions(consumer, stage),
        await resumeDependencies(consumer, stage, key),
      ),
    );

    expect(failure).toBeInstanceOf(
      modules.resume.FloodgateStableProposalFinalizationResumeError,
    );
    expect(failure).toMatchObject({
      phase: "finalization-publication",
      inputClaimed: true,
      leaseAcquired: true,
      postflightMinted: true,
      finalizerStarted: true,
      workVerified: false,
      mayHavePersisted: false,
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "complete-authenticated-work-verification-required",
    });
    expect(key).toEqual(beforeKey);
    expect(await fs.promises.readFile(workPath)).toEqual(workBefore);
    expect(await sortedEntries(stage.stageRoot)).toEqual(["work.jsonl"]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("preserves foreign content and requires manual content reconciliation", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const modules = await loadModules(consumer.manifestIdentity);
    await seedState(modules, consumer, stage, "work-only");
    const foreignPath = path.join(stage.stageRoot, "train.jsonl");
    const foreignBytes = Buffer.from("synthetic foreign resume content\n");
    await write0600(foreignPath, foreignBytes);

    const failure = await captureFailure(
      modules.resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
        resumeOptions(consumer, stage),
        await resumeDependencies(consumer, stage, rootKey()),
      ),
    );

    expect(failure).toMatchObject({
      phase: "finalization-publication",
      finalizerStarted: true,
      observedState: "{train.jsonl,work.jsonl}",
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "manual-content-reconciliation-required",
    });
    expect(await fs.promises.readFile(foreignPath)).toEqual(foreignBytes);
    expect(await sortedEntries(stage.stageRoot)).toEqual([
      "train.jsonl",
      "work.jsonl",
    ]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("does not steal a stale authorization marker", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const modules = await loadModules(consumer.manifestIdentity);
    await seedState(modules, consumer, stage, "work-only");
    await mkdir0700(stage.leaseRoot);

    const failure = await captureFailure(
      modules.resume.resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
        resumeOptions(consumer, stage),
        await resumeDependencies(consumer, stage, rootKey()),
      ),
    );

    expect(failure).toMatchObject({
      phase: "finalization-authorization",
      inputClaimed: true,
      leaseAcquired: false,
      postflightMinted: false,
      finalizerStarted: false,
      leaseMayRemain: true,
      mayHavePublished: false,
      retryDisposition: "manual-lease-reconciliation-required",
    });
    expect((await fs.promises.lstat(stage.leaseRoot)).isDirectory()).toBe(true);
    expect(await sortedEntries(stage.stageRoot)).toEqual(["work.jsonl"]);
    await expectMissing(stage.destinationRoot);
  });
});
