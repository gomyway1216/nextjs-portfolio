import { createHash, createHmac, hkdfSync } from "node:crypto";
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
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_PREFIX_STATUS,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS,
  checkpointFloodgateStableProposalsCoreForTests,
  type FloodgateStableProposalCheckpointOptions,
} from "../../../ml/floodgate-stable-proposal-checkpoint";
import {
  FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CONTRACT,
  FLOODGATE_STABLE_PROPOSAL_FINALIZATION_STATUS,
  FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME,
  FLOODGATE_STABLE_PROPOSAL_MANIFEST_SCHEMA,
  FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
  FLOODGATE_STABLE_PROPOSAL_RESULT_SCHEMA,
  FloodgateStableProposalFinalizerError,
  finalizeAndPublishFloodgateStableProposalsCoreForTests,
  type FloodgateStableProposalFinalizerDependencies,
  type FloodgateStableProposalFinalizerEvent,
} from "../../../ml/floodgate-stable-proposal-finalizer";
import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  FLOODGATE_ROLE_BUNDLE_SCHEMA,
  type FloodgateRoleBundleRawIdentity,
  type FloodgateRoleBundleRawParent,
} from "../../../ml/floodgate-role-bundle";
import {
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
  type VerifiedPinnedFloodgateRoleBundle,
} from "../../../ml/floodgate-role-bundle-result";
import {
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  authorizeFloodgateTeacherStageCoreForTests,
  type FloodgateTeacherStageAuthorizationDependencies,
  type FloodgateTeacherStageAuthorizationOptions,
  type FloodgateTeacherStageLease,
  type FloodgateTeacherStagePublicationDependencies,
} from "../../../ml/floodgate-teacher-stage-authorization";
import {
  FLOODGATE_TRAINING_RAW_FILENAME,
  claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests,
  withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests,
  type FloodgateTrainingConsumerPostflightReceipt,
  type FloodgateTrainingRowConsumerDependencies,
  type FloodgateTrainingRowConsumerOptions,
} from "../../../ml/floodgate-training-row-consumer";
import {
  generateFloodgateStableWasmProposalsCoreForTests,
  type FloodgateStableWasmProposalArtifact,
  type FloodgateStableWasmProposerAssets,
  type FloodgateStableWasmProposerDependencies,
  type FloodgateStableWasmRawSearchResult,
  type FloodgateStableWasmSearchResultBox,
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
const KEY_ID = "synthetic-finalizer-key-1";
const ROOT_KEY_BYTE = 0x4b;
const FINALIZER_HKDF_INFO =
  "shogi-floodgate-stable-proposal-finalizer-key-v1\0";
const RESULT_DOMAIN = "shogi-floodgate-stable-proposal-result-v1\0";
const MANIFEST_DOMAIN = "shogi-floodgate-stable-proposal-manifest-v1\0";
const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

interface ConsumerFixture {
  readonly outputRoot: string;
  readonly identity: Readonly<FloodgateRoleBundleRawIdentity>;
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

interface SyntheticCapability {
  readonly receipt: Readonly<FloodgateTrainingConsumerPostflightReceipt>;
  readonly artifact: Readonly<FloodgateStableWasmProposalArtifact>;
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("stable proposal finalizer tests require a POSIX euid");
  }
  return process.geteuid();
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function rootKey(byte = ROOT_KEY_BYTE): Uint8Array {
  return new Uint8Array(32).fill(byte);
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

function fixtureRows(seed: string): readonly FloodgateRoleBundleRawParent[] {
  const url = `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+synthetic-${seed}+synthetic-b+20260101000000.csa`;
  const gameId = floodgateCanonicalUrlGameId(url);
  const gameSha256 = sha256(
    `synthetic finalizer fixture; no real game; ${seed}`,
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

async function consumerFixture(seed = "a"): Promise<ConsumerFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "stable-finalizer-consumer-"),
  );
  const container = await fs.promises.realpath(created);
  temporaryRoots.push(container);
  await fs.promises.chmod(container, 0o700);
  const outputRoot = path.join(container, "bundle");
  await mkdir0700(outputRoot);
  const rows = fixtureRows(seed);
  const bytes = rawBytes(rows);
  await write0600(
    path.join(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME),
    bytes,
  );
  return {
    outputRoot,
    identity: rawIdentity(rows, bytes),
    options: {
      repositoryRoot: path.join(container, "repository"),
      verifierRevision: VERIFIER_REVISION,
      rawLockRoot: path.join(container, "raw-lock"),
      roleLockRoot: path.join(container, "role-lock"),
      legacyProtectedPositionIdsPath: path.join(container, "legacy-ids.txt"),
      outputRoot,
    },
  };
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

function consumerDependencies(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): FloodgateTrainingRowConsumerDependencies {
  const verified = verifiedBundle(identity);
  return {
    verifyBundle: vi.fn(async () => verified),
    expectedManifestIdentity: verified.result.manifest.identity,
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

function bindArtifactToConsumer(
  artifact: Readonly<FloodgateStableWasmProposalArtifact>,
  binding: Readonly<Record<string, unknown>>,
): Readonly<FloodgateStableWasmProposalArtifact> {
  const receipt = structuredClone(artifact.receipt) as Record<string, unknown>;
  const input = receipt.input as Record<string, unknown>;
  input.authenticated_training_binding = structuredClone(binding);
  const fingerprintPayload = {
    authenticated_training_binding: input.authenticated_training_binding,
    input_rows_sha256: input.input_rows_sha256,
    plan: receipt.preregistered_plan,
    supplied_engine_assets: receipt.supplied_engine_assets,
    required_search_contract: receipt.required_search_contract,
  };
  receipt.semantic_run_fingerprint_sha256 = sha256(
    `shogi-floodgate-stable-proposer-run-v1\0${canonicalJson(
      fingerprintPayload,
    )}`,
  );
  return Object.freeze({
    rows: artifact.rows,
    jsonl: artifact.jsonl,
    receipt: Object.freeze(receipt),
    receipt_json: `${canonicalJson(receipt)}\n`,
  });
}

async function mintCapability(
  input: ConsumerFixture,
): Promise<SyntheticCapability> {
  let artifact: Readonly<FloodgateStableWasmProposalArtifact> | undefined;
  const receipt =
    await withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
      input.options,
      async (authenticated) => {
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          authenticated,
        );
        const proposerInput = Object.freeze({
          ...authenticated,
          binding: Object.freeze({
            ...authenticated.binding,
            bundle_manifest_bytes:
              FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.bytes,
            bundle_manifest_sha256:
              FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.sha256,
          }),
        });
        const search: FloodgateStableWasmProposerDependencies["search"] = (
          requests,
        ) =>
          Promise.resolve(
            boxedResults(
              requests.map((request) => ({
                index: request.index,
                packed_move: packedMove(
                  authenticated.rows[request.index].parent_sfen,
                  authenticated.rows[request.index].played_move,
                ),
                raw_search_score: 0,
                completed_depth: 11,
                nodes: 10 + request.index,
                leaves: 20 + request.index,
              })),
            ),
          );
        const generated =
          await generateFloodgateStableWasmProposalsCoreForTests(
            proposerInput,
            assets(),
            {
              workers: 1,
              startupTimeoutMilliseconds: 30_000,
              searchTimeoutMilliseconds: 30_000,
            },
            { search },
          );
        artifact = bindArtifactToConsumer(
          generated,
          authenticated.binding as unknown as Readonly<Record<string, unknown>>,
        );
      },
      consumerDependencies(input.identity),
    );
  if (artifact === undefined) throw new Error("synthetic proposer did not run");
  return { receipt, artifact };
}

async function stageFixture(): Promise<StageFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "stable-finalizer-stage-"),
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

function authorizationDependencies(
  overrides: Partial<FloodgateTeacherStageAuthorizationDependencies> = {},
): FloodgateTeacherStageAuthorizationDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
    ...overrides,
  };
}

async function authorize(
  value: StageFixture,
  overrides: Partial<FloodgateTeacherStageAuthorizationDependencies> = {},
): Promise<Readonly<FloodgateTeacherStageLease>> {
  return authorizeFloodgateTeacherStageCoreForTests(
    value.options,
    authorizationDependencies(overrides),
  );
}

function checkpointOptions(): FloodgateStableProposalCheckpointOptions {
  return { runId: RUN_ID, keyId: KEY_ID };
}

async function createCheckpoint(
  value: StageFixture,
  artifact: Readonly<FloodgateStableWasmProposalArtifact>,
): Promise<void> {
  await checkpointFloodgateStableProposalsCoreForTests(
    await authorize(value),
    artifact,
    checkpointOptions(),
    {
      rootKey: rootKey(),
      effectiveUserId: effectiveUserId(),
    },
  );
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

async function publicationDependencies(
  value: StageFixture,
  afterRename?: (destination: string) => void | Promise<void>,
): Promise<Readonly<FloodgateTeacherStagePublicationDependencies>> {
  const [parent, stage] = await Promise.all([
    fs.promises.lstat(value.publicationParent, { bigint: true }),
    fs.promises.lstat(value.stageRoot, { bigint: true }),
  ]);
  return Object.freeze({
    exclusiveRename: async (source: string, destination: string) => {
      await fs.promises.rename(source, destination);
      await afterRename?.(destination);
      return renameReceipt(parent, stage);
    },
  });
}

function finalizerDependencies(
  failpointForTests?: (
    event: FloodgateStableProposalFinalizerEvent,
  ) => void | Promise<void>,
): FloodgateStableProposalFinalizerDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    ...(failpointForTests === undefined ? {} : { failpointForTests }),
  };
}

function finalizerOptions(key = rootKey()) {
  return { rootKey: key, runId: RUN_ID, keyId: KEY_ID };
}

async function finalize(
  value: StageFixture,
  receipt: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  overrides: {
    readonly lease?: Readonly<FloodgateTeacherStageLease>;
    readonly key?: Uint8Array;
    readonly failpoint?: (
      event: FloodgateStableProposalFinalizerEvent,
    ) => void | Promise<void>;
    readonly publication?: Readonly<FloodgateTeacherStagePublicationDependencies>;
  } = {},
) {
  const lease = overrides.lease ?? (await authorize(value));
  const publication =
    overrides.publication ?? (await publicationDependencies(value));
  return finalizeAndPublishFloodgateStableProposalsCoreForTests(
    lease,
    receipt,
    finalizerOptions(overrides.key),
    finalizerDependencies(overrides.failpoint),
    publication,
  );
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

function parsedCanonicalFile(bytes: Uint8Array): Record<string, unknown> {
  const text = Buffer.from(bytes).toString("utf8");
  expect(text.endsWith("\n")).toBe(true);
  expect(text.endsWith("\n\n")).toBe(false);
  const parsed = JSON.parse(text) as Record<string, unknown>;
  expect(text).toBe(`${canonicalJson(parsed)}\n`);
  return parsed;
}

function verifyMetadataMac(
  record: Record<string, unknown>,
  macKey: "result_mac" | "manifest_mac",
  domain: string,
): void {
  const supplied = record[macKey];
  const unsigned = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== macKey),
  );
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      rootKey(),
      Buffer.from(RUN_ID, "hex"),
      Buffer.from(FINALIZER_HKDF_INFO),
      32,
    ),
  );
  const expected = createHmac("sha256", key)
    .update(domain)
    .update(canonicalJson(unsigned))
    .digest("hex");
  key.fill(0);
  expect(supplied).toBe(expected);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await fs.promises.chmod(root, 0o700).catch(() => undefined);
      await fs.promises.rm(root, { recursive: true, force: true });
    }),
  );
});

posixDescribe("Floodgate stable proposal result/manifest finalizer", () => {
  it("finalizes deterministic authenticated files, publishes, and reverifies the destination", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);
    const events: FloodgateStableProposalFinalizerEvent[] = [];

    const receipt = await finalize(stage, capability.receipt, {
      failpoint: (event) => {
        events.push(event);
      },
    });

    expect(receipt.contract).toBe(
      FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CONTRACT,
    );
    expect(receipt.status).toBe(FLOODGATE_STABLE_PROPOSAL_FINALIZATION_STATUS);
    expect(receipt.postpublication).toEqual({
      destination_reopened: true,
      exact_entries: ["manifest.json", "result.json", "work.jsonl"],
      content_reverified: true,
    });
    expect(events).toEqual([
      "work-file-synced",
      "work-directory-synced",
      "result-created",
      "result-written",
      "result-file-synced",
      "result-directory-synced",
      "manifest-created",
      "manifest-written",
      "manifest-file-synced",
      "manifest-directory-synced",
      "source-content-reverified",
      "before-publication-commit",
      "before-destination-reopen",
      "before-destination-content-reverification",
    ]);
    expect(await sortedEntries(stage.destinationRoot)).toEqual([
      "manifest.json",
      "result.json",
      "work.jsonl",
    ]);
    await expectMissing(stage.stageRoot);
    await expectMissing(stage.leaseRoot);

    const [resultBytes, manifestBytes] = await Promise.all([
      fs.promises.readFile(
        path.join(
          stage.destinationRoot,
          FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
        ),
      ),
      fs.promises.readFile(
        path.join(
          stage.destinationRoot,
          FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME,
        ),
      ),
    ]);
    const result = parsedCanonicalFile(resultBytes);
    const manifest = parsedCanonicalFile(manifestBytes);
    expect(result.schema).toBe(FLOODGATE_STABLE_PROPOSAL_RESULT_SCHEMA);
    expect(manifest.schema).toBe(FLOODGATE_STABLE_PROPOSAL_MANIFEST_SCHEMA);
    const workVerification = result.work_verification as Record<
      string,
      unknown
    >;
    const checkpoint = workVerification.checkpoint as Record<string, unknown>;
    expect(checkpoint.status).toBe(FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS);
    expect(checkpoint.header_status).toBe(
      FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_PREFIX_STATUS,
    );
    verifyMetadataMac(result, "result_mac", RESULT_DOMAIN);
    verifyMetadataMac(manifest, "manifest_mac", MANIFEST_DOMAIN);
    expect(receipt.content.result).toMatchObject({
      bytes: resultBytes.byteLength,
      sha256: sha256(resultBytes),
      mode: "0600",
    });
    expect(receipt.content.manifest).toMatchObject({
      bytes: manifestBytes.byteLength,
      sha256: sha256(manifestBytes),
      mode: "0600",
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.content)).toBe(true);
  });

  it("requires exact lease and postflight authorities without consuming their originals through clones", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);
    const lease = await authorize(stage);
    const copiedLease = { ...lease } as Readonly<FloodgateTeacherStageLease>;

    const leaseFailure = await captureFailure(
      finalize(stage, capability.receipt, { lease: copiedLease }),
    );
    expect(leaseFailure).toMatchObject({
      phase: "authority-transfer",
      postflightClaimConsumed: false,
      mayHavePublished: false,
    });
    expect(
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
        capability.receipt,
      ),
    ).toBeUndefined();
    await lease.close();

    const secondCapability = await mintCapability(consumer);
    const secondLease = await authorize(stage);
    const clonedReceipt = structuredClone(secondCapability.receipt);
    const receiptFailure = await captureFailure(
      finalize(stage, clonedReceipt, { lease: secondLease }),
    );
    expect(receiptFailure).toMatchObject({
      phase: "postflight-claim",
      postflightClaimConsumed: false,
      mayHavePublished: false,
      leaseMayRemain: false,
    });
    expect(
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
        secondCapability.receipt,
      ),
    ).toBeUndefined();
    await expectMissing(stage.leaseRoot);
  });

  it("rejects a wrong key and a different authenticated consumer binding before creating result.json", async () => {
    const consumer = await consumerFixture("binding-a");
    const capability = await mintCapability(consumer);
    const wrongConsumer = await consumerFixture("binding-b");
    const wrongCapability = await mintCapability(wrongConsumer);

    const wrongKeyStage = await stageFixture();
    await createCheckpoint(wrongKeyStage, capability.artifact);
    const wrongKeyFailure = await captureFailure(
      finalize(wrongKeyStage, capability.receipt, {
        key: rootKey(ROOT_KEY_BYTE + 1),
      }),
    );
    expect(wrongKeyFailure).toMatchObject({
      phase: "work-verification",
      workVerified: false,
      mayHavePublished: false,
      retryDisposition: "fresh-authority-may-resume-exact-prefix",
    });
    await expectMissing(
      path.join(
        wrongKeyStage.stageRoot,
        FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
      ),
    );
    await expectMissing(wrongKeyStage.destinationRoot);

    const mismatchStage = await stageFixture();
    await createCheckpoint(mismatchStage, capability.artifact);
    const mismatchFailure = await captureFailure(
      finalize(mismatchStage, wrongCapability.receipt),
    );
    expect(mismatchFailure).toMatchObject({
      phase: "work-verification",
      workVerified: false,
      mayHavePublished: false,
    });
    expect(String((mismatchFailure as Error).message)).toMatch(
      /does not match consumer postflight binding/,
    );
    await expectMissing(
      path.join(
        mismatchStage.stageRoot,
        FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
      ),
    );
  });

  for (const metadata of [
    {
      filename: FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
      event: "result-written" as const,
    },
    {
      filename: FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME,
      event: "manifest-written" as const,
    },
  ]) {
    it(`resumes an exact deterministic prefix of ${metadata.filename}`, async () => {
      const consumer = await consumerFixture();
      const first = await mintCapability(consumer);
      const stage = await stageFixture();
      await createCheckpoint(stage, first.artifact);
      const firstFailure = await captureFailure(
        finalize(stage, first.receipt, {
          failpoint: (event) => {
            if (event === metadata.event) {
              throw new Error(`synthetic crash after ${metadata.event}`);
            }
          },
        }),
      );
      expect(firstFailure).toBeInstanceOf(
        FloodgateStableProposalFinalizerError,
      );
      expect(firstFailure).toMatchObject({ mayHavePersisted: true });
      await expectMissing(stage.destinationRoot);
      await expectMissing(stage.leaseRoot);

      const metadataPath = path.join(stage.stageRoot, metadata.filename);
      const complete = await fs.promises.readFile(metadataPath);
      expect(complete.byteLength).toBeGreaterThan(2);
      await fs.promises.truncate(
        metadataPath,
        Math.floor(complete.byteLength / 2),
      );
      const prefix = await fs.promises.readFile(metadataPath);
      expect(complete.subarray(0, prefix.byteLength)).toEqual(prefix);

      const retry = await mintCapability(consumer);
      const receipt = await finalize(stage, retry.receipt);
      const published = await fs.promises.readFile(
        path.join(stage.destinationRoot, metadata.filename),
      );
      expect(published).toEqual(complete);
      expect(receipt.postpublication.content_reverified).toBe(true);
    });
  }

  it("preserves and rejects manifest-without-result and unknown-extra states", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);

    for (const invalid of [
      "manifest-without-result",
      "unknown-extra",
    ] as const) {
      const stage = await stageFixture();
      await createCheckpoint(stage, capability.artifact);
      const invalidPath =
        invalid === "manifest-without-result"
          ? path.join(
              stage.stageRoot,
              FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME,
            )
          : path.join(stage.stageRoot, "train.jsonl");
      const invalidBytes = Buffer.from(`synthetic ${invalid}\n`);
      await write0600(invalidPath, invalidBytes);
      const freshCapability = await mintCapability(consumer);

      const failure = await captureFailure(
        finalize(stage, freshCapability.receipt),
      );
      expect(failure).toMatchObject({
        phase: "work-verification",
        retryDisposition: "manual-content-reconciliation-required",
        mayHavePublished: false,
      });
      expect(await fs.promises.readFile(invalidPath)).toEqual(invalidBytes);
      await expectMissing(stage.destinationRoot);
      await expectMissing(stage.leaseRoot);
    }
  });

  it("aborts cleanly after a persistence failpoint and leaves a resumable zero-byte result", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);

    const failure = await captureFailure(
      finalize(stage, capability.receipt, {
        failpoint: (event) => {
          if (event === "result-created") {
            throw new Error("synthetic result-create crash");
          }
        },
      }),
    );

    expect(failure).toMatchObject({
      phase: "result-persistence",
      mayHavePersisted: true,
      mayHavePublished: false,
      retryDisposition: "fresh-authority-may-resume-exact-prefix",
    });
    expect(
      (
        await fs.promises.stat(
          path.join(stage.stageRoot, FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME),
        )
      ).size,
    ).toBe(0);
    await expectMissing(stage.destinationRoot);
    await expectMissing(stage.leaseRoot);

    const retry = await mintCapability(consumer);
    await expect(finalize(stage, retry.receipt)).resolves.toMatchObject({
      postpublication: { content_reverified: true },
    });
  });

  it("reports manual lease reconciliation when abort cannot remove its lease", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);
    const lease = await authorize(stage, {
      beforeLeaseRemovalForTests: () => {
        throw new Error("synthetic abort lease cleanup failure");
      },
    });

    const failure = await captureFailure(
      finalize(stage, capability.receipt, {
        lease,
        failpoint: (event) => {
          if (event === "result-created") {
            throw new Error("synthetic primary finalization failure");
          }
        },
      }),
    );

    expect(failure).toMatchObject({
      phase: "result-persistence",
      mayHavePublished: false,
      leaseMayRemain: true,
      retryDisposition: "manual-lease-reconciliation-required",
    });
    expect(
      (failure as FloodgateStableProposalFinalizerError).cleanupFailures,
    ).toHaveLength(1);
    expect(
      String(
        (failure as FloodgateStableProposalFinalizerError).cleanupFailures[0],
      ),
    ).toMatch(/synthetic abort lease cleanup failure/);
    expect(
      (
        await fs.promises.lstat(stage.leaseRoot, { bigint: true })
      ).isDirectory(),
    ).toBe(true);
    await expectMissing(stage.destinationRoot);
  });

  it("propagates a pre-rename publication failure without publishing content", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);
    const publication: FloodgateTeacherStagePublicationDependencies = {
      exclusiveRename: async () => {
        throw new Error("synthetic rename failure before mutation");
      },
    };

    const failure = await captureFailure(
      finalize(stage, capability.receipt, { publication }),
    );

    expect(failure).toMatchObject({
      phase: "publication",
      mayHavePublished: false,
      retryDisposition: "fresh-authority-may-resume-exact-prefix",
    });
    expect(await sortedEntries(stage.stageRoot)).toEqual([
      "manifest.json",
      "result.json",
      "work.jsonl",
    ]);
    await expectMissing(stage.destinationRoot);
  });

  it("detects result tampering performed by the rename boundary after publication", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);
    const moving = await publicationDependencies(stage);
    let destinationWasReopened = false;
    const publication: FloodgateTeacherStagePublicationDependencies = {
      ...moving,
      beforeDestinationReopenForTests: () => {
        destinationWasReopened = true;
      },
      syncDirectoryForTests: async (kind, sync) => {
        if (kind === "parent-before-lease-removal") {
          expect(destinationWasReopened).toBe(true);
          await fs.promises.appendFile(
            path.join(
              stage.destinationRoot,
              FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
            ),
            "synthetic post-reopen tamper\n",
          );
        }
        await sync();
      },
    };

    const failure = await captureFailure(
      finalize(stage, capability.receipt, { publication }),
    );

    expect(failure).toMatchObject({
      phase: "destination-reverification",
      mayHavePublished: true,
      publicationDurability: "published-and-lease-removal-durable",
      destinationReopened: true,
      retryDisposition: "manual-publication-reconciliation-required",
    });
    expect(String((failure as Error).message)).toMatch(
      /published result\.json differs from finalized content/,
    );
    expect(destinationWasReopened).toBe(true);
    await expectMissing(stage.stageRoot);
    expect(await sortedEntries(stage.destinationRoot)).toEqual([
      "manifest.json",
      "result.json",
      "work.jsonl",
    ]);
  });

  it("requires combined publication and lease reconciliation after an indeterminate post-rename failure", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);
    const basePublication = await publicationDependencies(stage);
    const publication: FloodgateTeacherStagePublicationDependencies = {
      ...basePublication,
      beforeDestinationReopenForTests: () => {
        throw new Error("synthetic destination reopen failure after rename");
      },
    };

    const failure = await captureFailure(
      finalize(stage, capability.receipt, { publication }),
    );

    expect(failure).toMatchObject({
      phase: "publication",
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

  it("places the final mutation seam before destination content revalidation", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);

    const failure = await captureFailure(
      finalize(stage, capability.receipt, {
        failpoint: async (event) => {
          if (event === "before-destination-content-reverification") {
            await fs.promises.appendFile(
              path.join(
                stage.destinationRoot,
                FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
              ),
              "synthetic terminal-seam tamper\n",
            );
          }
        },
      }),
    );

    expect(failure).toMatchObject({
      phase: "destination-reverification",
      mayHavePublished: true,
      destinationReopened: true,
      retryDisposition: "manual-publication-reconciliation-required",
    });
    expect(String((failure as Error).message)).toMatch(
      /published result\.json differs from finalized content/,
    );
  });

  it("rejects destination pathname replacement even when the same file inodes are moved back", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);
    const displaced = `${stage.destinationRoot}.displaced`;

    const failure = await captureFailure(
      finalize(stage, capability.receipt, {
        failpoint: async (event) => {
          if (event !== "before-destination-content-reverification") return;
          await fs.promises.rename(stage.destinationRoot, displaced);
          await mkdir0700(stage.destinationRoot);
          for (const filename of [
            "manifest.json",
            "result.json",
            "work.jsonl",
          ]) {
            await fs.promises.rename(
              path.join(displaced, filename),
              path.join(stage.destinationRoot, filename),
            );
          }
        },
      }),
    );

    expect(failure).toMatchObject({
      phase: "destination-reverification",
      mayHavePublished: true,
      destinationReopened: true,
      retryDisposition: "manual-publication-reconciliation-required",
    });
    expect(String((failure as Error).message)).toMatch(
      /published destination before content revalidation pathname/,
    );
  });

  it("marks precommit held-content mutation for manual content reconciliation", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);

    const failure = await captureFailure(
      finalize(stage, capability.receipt, {
        failpoint: async (event) => {
          if (event === "manifest-directory-synced") {
            await fs.promises.appendFile(
              path.join(
                stage.stageRoot,
                FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
              ),
              "synthetic precommit tamper\n",
            );
          }
        },
      }),
    );

    expect(failure).toMatchObject({
      phase: "source-reverification",
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "manual-content-reconciliation-required",
    });
    await expectMissing(stage.destinationRoot);
    await expectMissing(stage.leaseRoot);
    expect(await sortedEntries(stage.stageRoot)).toEqual([
      "manifest.json",
      "result.json",
      "work.jsonl",
    ]);
  });

  it("wraps a hostile Proxy failure without bypassing typed cleanup", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);
    const hostile = new Proxy(Object.create(null) as object, {
      getOwnPropertyDescriptor: () => {
        throw new Error("proxy descriptor trap");
      },
      getPrototypeOf: () => {
        throw new Error("proxy prototype trap");
      },
    });

    const failure = await captureFailure(
      finalize(stage, capability.receipt, {
        failpoint: (event) => {
          if (event === "result-created") throw hostile;
        },
      }),
    );

    expect(failure).toBeInstanceOf(FloodgateStableProposalFinalizerError);
    expect(failure).toMatchObject({
      phase: "result-persistence",
      mayHavePublished: false,
      leaseMayRemain: false,
    });
    expect((failure as Error).message).toMatch(/uninspectable Proxy failure/);
    await expectMissing(stage.leaseRoot);
  });

  it("preserves an inherited failure message in the typed diagnostic", async () => {
    const consumer = await consumerFixture();
    const capability = await mintCapability(consumer);
    const stage = await stageFixture();
    await createCheckpoint(stage, capability.artifact);
    const inheritedFailure = Object.create({
      message: "synthetic inherited failure detail",
    }) as object;

    const failure = await captureFailure(
      finalize(stage, capability.receipt, {
        failpoint: (event) => {
          if (event === "result-created") throw inheritedFailure;
        },
      }),
    );

    expect(failure).toBeInstanceOf(FloodgateStableProposalFinalizerError);
    expect((failure as Error).message).toMatch(
      /synthetic inherited failure detail/,
    );
    expect(failure).toMatchObject({
      phase: "result-persistence",
      mayHavePublished: false,
      leaseMayRemain: false,
    });
  });
});
