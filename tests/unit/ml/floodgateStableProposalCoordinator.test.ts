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
  FloodgateStableProposalCoordinatorEvent,
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
const KEY_ID = "synthetic-coordinator-key-1";
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
  readonly trainingPath: string;
  readonly rows: readonly FloodgateRoleBundleRawParent[];
  readonly identity: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly manifestIdentity: Readonly<SyntheticManifestIdentity>;
  readonly verified: Readonly<VerifiedPinnedFloodgateRoleBundle>;
  readonly options: FloodgateTrainingRowConsumerOptions;
}

interface StageFixture {
  readonly root: string;
  readonly publicationParent: string;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  readonly leaseRoot: string;
  readonly options: FloodgateTeacherStageAuthorizationOptions;
}

type CoordinatorModule =
  typeof import("../../../ml/floodgate-stable-proposal-coordinator");

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("stable proposal coordinator tests require a POSIX euid");
  }
  return process.geteuid();
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function rootKey(): Uint8Array {
  return new Uint8Array(32).fill(ROOT_KEY_BYTE);
}

function hostileSharedView(
  bytes: Uint8Array,
  forgedByteLength: number,
): Uint8Array {
  const value = new Uint8Array(new SharedArrayBuffer(bytes.byteLength));
  value.set(bytes);
  Object.defineProperties(value, {
    buffer: {
      configurable: true,
      get: () => new ArrayBuffer(forgedByteLength),
    },
    byteLength: {
      configurable: true,
      get: () => forgedByteLength,
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

function fixtureRows(seed = "a"): readonly FloodgateRoleBundleRawParent[] {
  const url = `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+synthetic-${seed}+synthetic-b+20260101000000.csa`;
  const gameId = floodgateCanonicalUrlGameId(url);
  const gameSha256 = sha256(
    `synthetic coordinator fixture; no real game; ${seed}`,
  );
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

function rawBytes(rows: readonly FloodgateRoleBundleRawParent[]): Uint8Array {
  return Buffer.from(`${rows.map((row) => canonicalJson(row)).join("\n")}\n`);
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
    path.join(os.tmpdir(), "stable-coordinator-consumer-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  await fs.promises.chmod(root, 0o700);
  const outputRoot = path.join(root, "bundle");
  await mkdir0700(outputRoot);
  const rows = fixtureRows();
  const bytes = rawBytes(rows);
  const trainingPath = path.join(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME);
  await write0600(trainingPath, bytes);
  const identity = rawIdentity(rows, bytes);
  const built = buildVerifiedBundle(identity);
  return {
    trainingPath,
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
    path.join(os.tmpdir(), "stable-coordinator-stage-"),
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
    root,
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

async function loadCoordinator(
  manifestIdentity: Readonly<SyntheticManifestIdentity>,
): Promise<CoordinatorModule> {
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
  return import("../../../ml/floodgate-stable-proposal-coordinator");
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

function options(
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

async function dependencies(
  consumer: ConsumerFixture,
  stage: StageFixture,
  key: Uint8Array,
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
    rootKey: key,
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

function forbiddenReceiptKeys(value: unknown): string[] {
  const forbidden = new Set([
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
  return [...found].sort();
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child, seen);
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

posixDescribe("Floodgate stable proposal synthetic coordinator", () => {
  it("rejects an invalid asset snapshot before consumer or lease side effects", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const verifyBundle = vi.fn(async () => consumer.verified);
    const search = vi.fn();
    let authorizations = 0;
    const deps = await dependencies(consumer, stage, rootKey(), {
      consumer: {
        verifyBundle,
        expectedManifestIdentity: consumer.manifestIdentity,
      },
      proposer: { search },
      stageAuthorization: authorizationDependencies({
        afterLeaseAcquiredForTests: () => {
          authorizations += 1;
        },
      }),
    });
    const validOptions = options(consumer, stage);
    const invalidOptions: FloodgateStableProposalCoordinatorOptions = {
      ...validOptions,
      proposerAssets: {
        ...validOptions.proposerAssets,
        planBytes: new Uint8Array(1),
      },
    };

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        invalidOptions,
        deps,
      ),
    );
    const traversalFailure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        {
          ...validOptions,
          stageAuthorization: {
            ...validOptions.stageAuthorization,
            stageBasename: "../../../escape",
          },
        },
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "capture",
      inputClaimed: false,
      checkpointStarted: false,
      finalizerStarted: false,
      mayHavePublished: false,
      leaseMayRemain: false,
    });
    expect(traversalFailure).toMatchObject({
      phase: "capture",
      inputClaimed: false,
      checkpointStarted: false,
      finalizerStarted: false,
      mayHavePublished: false,
      leaseMayRemain: false,
    });
    expect(verifyBundle).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(authorizations).toBe(0);
    expect(await sortedEntries(stage.stageRoot)).toEqual([]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("uses intrinsic byte-view facts for hostile shared root-key and asset views", async () => {
    const consumer = await consumerFixture();
    const rootStage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const rootVerifyBundle = vi.fn(async () => consumer.verified);
    const hostileRoot = hostileSharedView(new Uint8Array([7]), 32);
    const rootDependencies = await dependencies(
      consumer,
      rootStage,
      hostileRoot,
      {
        consumer: {
          verifyBundle: rootVerifyBundle,
          expectedManifestIdentity: consumer.manifestIdentity,
        },
      },
    );

    const rootFailure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, rootStage),
        rootDependencies,
      ),
    );

    expect(rootFailure).toMatchObject({ phase: "capture" });
    expect(rootVerifyBundle).not.toHaveBeenCalled();
    await expectMissing(rootStage.leaseRoot);

    const assetStage = await stageFixture();
    const assetVerifyBundle = vi.fn(async () => consumer.verified);
    const validOptions = options(consumer, assetStage);
    const workerBytes = validOptions.proposerAssets.workerSourceBytes;
    const hostileWorker = hostileSharedView(
      workerBytes,
      workerBytes.byteLength,
    );
    const assetDependencies = await dependencies(
      consumer,
      assetStage,
      rootKey(),
      {
        consumer: {
          verifyBundle: assetVerifyBundle,
          expectedManifestIdentity: consumer.manifestIdentity,
        },
      },
    );

    const assetFailure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        {
          ...validOptions,
          proposerAssets: {
            ...validOptions.proposerAssets,
            workerSourceBytes: hostileWorker,
          },
        },
        assetDependencies,
      ),
    );

    expect(assetFailure).toMatchObject({ phase: "capture" });
    expect(assetVerifyBundle).not.toHaveBeenCalled();
    await expectMissing(assetStage.leaseRoot);
  });

  it("runs the exact clean chain with a compact non-secret receipt", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const key = rootKey();
    const beforeKey = new Uint8Array(key);
    const events: FloodgateStableProposalCoordinatorEvent[] = [];
    let authorizations = 0;
    const deps = await dependencies(consumer, stage, key, {
      stageAuthorization: authorizationDependencies({
        afterLeaseAcquiredForTests: () => {
          authorizations += 1;
        },
      }),
      phaseHookForTests: (event) => {
        events.push(event);
      },
    });

    const receipt =
      await coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      );

    expect(receipt).toMatchObject({
      contract: coordinator.FLOODGATE_STABLE_PROPOSAL_COORDINATOR_CONTRACT,
      status: coordinator.FLOODGATE_STABLE_PROPOSAL_COORDINATOR_STATUS,
      execution_boundary: "test-only-fixed-boundary-composition",
      execution_path: "generate-and-checkpoint",
      run_id: RUN_ID,
      key_id: KEY_ID,
      handoff: {
        exact_input_claimed_synchronously: true,
        initial_checkpoint_lease_closed_before_postflight: true,
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
      "exact_input_claimed_synchronously",
      "initial_checkpoint_lease_closed_before_postflight",
      "exact_postflight_minted",
      "fresh_finalizer_lease_acquired",
      "finalizer_contract",
    ]);
    expectDeepFrozen(receipt);
    expect(events).toEqual([
      "input-claimed",
      "proposal-complete",
      "initial-lease-acquired",
      "checkpoint-complete",
      "fresh-lease-acquired",
      "postflight-complete",
      "before-finalization",
    ]);
    expect(authorizations).toBe(2);
    const auditText = JSON.stringify(receipt, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString(10) : value,
    );
    expect(Buffer.byteLength(auditText, "utf8")).toBeLessThan(8_192);
    expect(forbiddenReceiptKeys(receipt)).toEqual([]);
    expect(key).toEqual(beforeKey);
    expect(await sortedEntries(stage.destinationRoot)).toEqual([
      "manifest.json",
      "result.json",
      "work.jsonl",
    ]);
    await expectMissing(stage.stageRoot);
    await expectMissing(stage.leaseRoot);
  });

  it("reports consumer verification failure before proposer or lease acquisition", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const key = rootKey();
    const search = vi.fn();
    let authorizations = 0;
    const deps = await dependencies(consumer, stage, key, {
      consumer: {
        verifyBundle: vi.fn(async () => {
          throw new Error("synthetic consumer verification failure");
        }),
        expectedManifestIdentity: consumer.manifestIdentity,
      },
      proposer: { search },
      stageAuthorization: authorizationDependencies({
        afterLeaseAcquiredForTests: () => {
          authorizations += 1;
        },
      }),
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toBeInstanceOf(
      coordinator.FloodgateStableProposalCoordinatorError,
    );
    expect(failure).toMatchObject({
      phase: "consumer-claim-proposer",
      inputClaimed: false,
      proposalComplete: false,
      checkpointStarted: false,
      retryDisposition: "rerun-synthetic-coordinator-with-fresh-authority",
      leaseMayRemain: false,
    });
    expect(search).not.toHaveBeenCalled();
    expect(authorizations).toBe(0);
    expect(key).toEqual(rootKey());
    expect(await sortedEntries(stage.stageRoot)).toEqual([]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("reports proposer failure without acquiring a stage lease", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    let authorizations = 0;
    const deps = await dependencies(consumer, stage, rootKey(), {
      proposer: {
        search: vi.fn(async () => {
          throw new Error("synthetic proposer failure");
        }),
      },
      stageAuthorization: authorizationDependencies({
        afterLeaseAcquiredForTests: () => {
          authorizations += 1;
        },
      }),
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "consumer-claim-proposer",
      inputClaimed: true,
      proposalComplete: false,
      checkpointStarted: false,
      postflightMinted: false,
      leaseMayRemain: false,
    });
    expect(authorizations).toBe(0);
    expect(await sortedEntries(stage.stageRoot)).toEqual([]);
    await expectMissing(stage.leaseRoot);
  });

  it("closes the initial lease when interrupted before checkpoint ownership transfer", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const events: FloodgateStableProposalCoordinatorEvent[] = [];
    const deps = await dependencies(consumer, stage, rootKey(), {
      phaseHookForTests: (event) => {
        events.push(event);
        if (event === "initial-lease-acquired") {
          throw new Error("synthetic interruption before checkpoint");
        }
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "checkpoint-authorization",
      proposalComplete: true,
      checkpointStarted: false,
      checkpointComplete: false,
      leaseMayRemain: false,
    });
    expect(events).toEqual([
      "input-claimed",
      "proposal-complete",
      "initial-lease-acquired",
    ]);
    expect(await sortedEntries(stage.stageRoot)).toEqual([]);
    await expectMissing(stage.leaseRoot);
  });

  it("keeps a durable checkpoint prefix but closes its lease on checkpoint failure", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const key = rootKey();
    const deps = await dependencies(consumer, stage, key, {
      checkpoint: {
        failpointForTests: (event) => {
          if (event.phase === "after-header-durable") {
            throw new Error("synthetic checkpoint interruption");
          }
        },
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "checkpoint",
      inputClaimed: true,
      proposalComplete: true,
      checkpointStarted: true,
      checkpointComplete: false,
      postflightMinted: false,
      leaseMayRemain: false,
      retryDisposition: "rerun-synthetic-coordinator-with-fresh-authority",
    });
    const work = await fs.promises.readFile(
      path.join(stage.stageRoot, "work.jsonl"),
    );
    expect(work.byteLength).toBeGreaterThan(0);
    expect(work.toString("utf8").trimEnd().split("\n")).toHaveLength(1);
    expect(key).toEqual(rootKey());
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("requires manual lease reconciliation when authorization rejects over an existing marker", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    await mkdir0700(stage.leaseRoot);
    const deps = await dependencies(consumer, stage, rootKey());

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "checkpoint-authorization",
      inputClaimed: true,
      proposalComplete: true,
      checkpointStarted: false,
      checkpointComplete: false,
      freshLeaseAcquired: false,
      leaseMayRemain: true,
      retryDisposition: "manual-lease-reconciliation-required",
    });
    expect(await sortedEntries(stage.stageRoot)).toEqual([]);
    expect((await fs.promises.lstat(stage.leaseRoot)).isDirectory()).toBe(true);
    await expectMissing(stage.destinationRoot);
  });

  it("requires manual lease reconciliation when fresh authorization finds a new marker", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const deps = await dependencies(consumer, stage, rootKey(), {
      phaseHookForTests: async (event) => {
        if (event === "checkpoint-complete") await mkdir0700(stage.leaseRoot);
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "checkpoint-authorization",
      checkpointStarted: true,
      checkpointComplete: true,
      postflightMinted: false,
      freshLeaseAcquired: false,
      leaseMayRemain: true,
      retryDisposition: "manual-lease-reconciliation-required",
    });
    expect(await sortedEntries(stage.stageRoot)).toEqual(["work.jsonl"]);
    expect((await fs.promises.lstat(stage.leaseRoot)).isDirectory()).toBe(true);
    await expectMissing(stage.destinationRoot);
  });

  it("requires manual lease reconciliation when checkpoint cleanup leaves its marker", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const deps = await dependencies(consumer, stage, rootKey(), {
      stageAuthorization: authorizationDependencies({
        beforeLeaseRemovalForTests: () => {
          throw new Error("synthetic checkpoint lease cleanup failure");
        },
      }),
      checkpoint: {
        failpointForTests: (event) => {
          if (event.phase === "after-header-durable") {
            throw new Error("synthetic checkpoint persistence failure");
          }
        },
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "checkpoint",
      checkpointStarted: true,
      checkpointComplete: false,
      leaseMayRemain: true,
      retryDisposition: "manual-lease-reconciliation-required",
    });
    expect((await fs.promises.lstat(stage.leaseRoot)).isDirectory()).toBe(true);
    expect(await sortedEntries(stage.stageRoot)).toEqual(["work.jsonl"]);
    await expectMissing(stage.destinationRoot);
  });

  it("closes a carried fresh lease when consumer postflight detects mutation", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const deps = await dependencies(consumer, stage, rootKey(), {
      phaseHookForTests: async (event) => {
        if (event === "fresh-lease-acquired") {
          await fs.promises.appendFile(
            consumer.trainingPath,
            "synthetic post-callback mutation\n",
          );
        }
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "consumer-postflight",
      checkpointComplete: true,
      freshLeaseAcquired: true,
      postflightMinted: false,
      finalizerStarted: false,
      leaseMayRemain: false,
      retryDisposition: "resume-finalization-over-complete-authenticated-work",
    });
    expect(await sortedEntries(stage.stageRoot)).toEqual(["work.jsonl"]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("reports complete-work retry after postflight succeeds but before finalizer starts", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const deps = await dependencies(consumer, stage, rootKey(), {
      phaseHookForTests: (event) => {
        if (event === "postflight-complete") {
          throw new Error("synthetic handoff interruption");
        }
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "consumer-postflight",
      checkpointComplete: true,
      postflightMinted: true,
      freshLeaseAcquired: true,
      finalizerStarted: false,
      leaseMayRemain: false,
      mayHavePublished: false,
      retryDisposition: "resume-finalization-over-complete-authenticated-work",
    });
    expect(await sortedEntries(stage.stageRoot)).toEqual(["work.jsonl"]);
    await expectMissing(stage.leaseRoot);
  });

  it("contains a hostile prototype-chain failure and still cleans the carried lease", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const key = rootKey();
    const beforeKey = new Uint8Array(key);
    const hostilePrototype = new Proxy(Object.create(null) as object, {
      getPrototypeOf: () => {
        throw new Error("synthetic hostile prototype trap");
      },
    });
    const hostileFailure = Object.create(hostilePrototype) as object;
    const deps = await dependencies(consumer, stage, key, {
      phaseHookForTests: (event) => {
        if (event === "postflight-complete") throw hostileFailure;
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toBeInstanceOf(
      coordinator.FloodgateStableProposalCoordinatorError,
    );
    expect(failure).toMatchObject({
      phase: "consumer-postflight",
      checkpointComplete: true,
      postflightMinted: true,
      freshLeaseAcquired: true,
      finalizerStarted: false,
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "resume-finalization-over-complete-authenticated-work",
    });
    expect(key).toEqual(beforeKey);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("contains a forged finalizer-error accessor and still cleans the carried lease", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const finalizer =
      await import("../../../ml/floodgate-stable-proposal-finalizer");
    const key = rootKey();
    const beforeKey = new Uint8Array(key);
    const forgedFailure = Object.create(
      finalizer.FloodgateStableProposalFinalizerError.prototype,
    ) as object;
    Object.defineProperty(forgedFailure, "phase", {
      enumerable: true,
      get: () => {
        throw new Error("synthetic forged finalizer phase getter");
      },
    });
    const deps = await dependencies(consumer, stage, key, {
      phaseHookForTests: (event) => {
        if (event === "postflight-complete") throw forgedFailure;
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toBeInstanceOf(
      coordinator.FloodgateStableProposalCoordinatorError,
    );
    expect(failure).toMatchObject({
      phase: "consumer-postflight",
      checkpointComplete: true,
      postflightMinted: true,
      freshLeaseAcquired: true,
      finalizerStarted: false,
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "resume-finalization-over-complete-authenticated-work",
    });
    expect(key).toEqual(beforeKey);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("reports finalizer-prefix retry without mutating the caller key", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const key = rootKey();
    const beforeKey = new Uint8Array(key);
    const deps = await dependencies(consumer, stage, key, {
      finalizer: {
        failpointForTests: (event) => {
          if (event === "result-created") {
            throw new Error("synthetic finalizer prefix interruption");
          }
        },
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "finalization-publication",
      checkpointComplete: true,
      postflightMinted: true,
      freshLeaseAcquired: true,
      finalizerStarted: true,
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "resume-finalization-over-complete-authenticated-work",
    });
    expect(await sortedEntries(stage.stageRoot)).toEqual([
      "result.json",
      "work.jsonl",
    ]);
    expect(
      (await fs.promises.stat(path.join(stage.stageRoot, "result.json"))).size,
    ).toBe(0);
    expect(key).toEqual(beforeKey);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });

  it("preserves a finalizer manual-content disposition", async () => {
    const consumer = await consumerFixture();
    const stage = await stageFixture();
    const coordinator = await loadCoordinator(consumer.manifestIdentity);
    const deps = await dependencies(consumer, stage, rootKey(), {
      phaseHookForTests: async (event) => {
        if (event === "before-finalization") {
          await write0600(
            path.join(stage.stageRoot, "train.jsonl"),
            "synthetic foreign coordinator content\n",
          );
        }
      },
    });

    const failure = await captureFailure(
      coordinator.runFloodgateStableProposalCoordinatorCoreForTests(
        options(consumer, stage),
        deps,
      ),
    );

    expect(failure).toMatchObject({
      phase: "finalization-publication",
      checkpointComplete: true,
      finalizerStarted: true,
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "manual-content-reconciliation-required",
    });
    expect(await sortedEntries(stage.stageRoot)).toEqual([
      "train.jsonl",
      "work.jsonl",
    ]);
    await expectMissing(stage.leaseRoot);
    await expectMissing(stage.destinationRoot);
  });
});
