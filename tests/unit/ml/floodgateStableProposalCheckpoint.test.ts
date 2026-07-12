import { createHash, createHmac, hkdfSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SHOGI_WASM_BASE64 } from "../../../src/components/game/ShogiImproved/wasm/shogiWasmBase64";
import {
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_PREFIX_STATUS,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
  FLOODGATE_STABLE_PROPOSAL_SEMANTIC_BINDING_DOMAIN,
  FLOODGATE_STABLE_PROPOSAL_SEMANTIC_BINDING_SCHEMA,
  FLOODGATE_STABLE_PROPOSAL_WORK_VERIFICATION_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_PROPOSAL_WORK_VERIFICATION_CONTRACT,
  FLOODGATE_STABLE_PROPOSAL_WORK_VERIFICATION_STATUS,
  FloodgateStableProposalCheckpointPersistenceIndeterminateError,
  checkpointFloodgateStableProposalsCoreForTests,
  verifyAuthenticatedFloodgateStableProposalWork,
  type FloodgateStableProposalCheckpointDependencies,
  type FloodgateStableProposalCheckpointFailpointEvent,
  type FloodgateStableProposalCheckpointOptions,
  type FloodgateStableProposalWorkVerificationOptions,
} from "../../../ml/floodgate-stable-proposal-checkpoint";
import {
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  authorizeFloodgateTeacherStageCoreForTests,
  claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests,
  type FloodgateTeacherStageAuthorizationReceipt,
  type FloodgateTeacherStageLease,
} from "../../../ml/floodgate-teacher-stage-authorization";
import {
  generateFloodgateStableWasmProposalsCoreForTests,
  type FloodgateStableWasmProposalArtifact,
  type FloodgateStableWasmProposerAssets,
  type FloodgateStableWasmProposerDependencies,
  type FloodgateStableWasmRawSearchResult,
  type FloodgateStableWasmSearchResultBox,
} from "../../../ml/floodgate-stable-wasm-proposer";
import {
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
} from "../../../ml/floodgate-role-bundle-result";
import { FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT } from "../../../ml/floodgate-role-bundle";
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
} from "../../../ml/floodgate-training-row-consumer";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import { positionFromSfen, resolveUsiMove } from "../../../ml/shogi-sfen";
import { positionKeyFromSfen } from "../../../ml/sibling-data";

const REPOSITORY_ROOT = process.cwd();
const MATE_SFEN = "4k4/9/5G3/9/4+R4/9/9/9/4K4 b 3P 1";
const MATE_VARIANT_SFEN = "4k4/9/5G3/9/4+R4/9/9/P8/4K4 b 2P 1";
const MATE_SECOND_VARIANT_SFEN = "4k4/9/5G3/9/4+R4/9/9/1P7/4K4 b 2P 1";
const MATE_MOVE = "4c5b";
const RUN_ID = "12".repeat(32);
const OTHER_RUN_ID = "34".repeat(32);
const KEY_ID = "synthetic-checkpoint-key-1";
const ROOT_KEY_BYTE = 0x4b;
const ROOT_KEY_HEX = ROOT_KEY_BYTE.toString(16).padStart(2, "0").repeat(32);
const HEADER_DOMAIN = "shogi-floodgate-stable-proposal-work-header-v1\0";
const ENTRY_DOMAIN = "shogi-floodgate-stable-proposal-work-entry-v1\0";
const SEAL_DOMAIN = "shogi-floodgate-stable-proposal-work-seal-v1\0";
const HKDF_INFO = "shogi-floodgate-stable-proposal-checkpoint-key-v1\0";

const temporaryRoots: string[] = [];
let artifactPromise:
  Promise<Readonly<FloodgateStableWasmProposalArtifact>> | undefined;

type AuthorizationOptions = Parameters<
  typeof authorizeFloodgateTeacherStageCoreForTests
>[0];

interface Fixture {
  readonly root: string;
  readonly publicationParent: string;
  readonly stageRoot: string;
  readonly options: AuthorizationOptions;
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("checkpoint tests require a POSIX effective uid");
  }
  return process.geteuid();
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function rootKey(byte = ROOT_KEY_BYTE): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function checkpointOptions(
  overrides: Partial<FloodgateStableProposalCheckpointOptions> = {},
): FloodgateStableProposalCheckpointOptions {
  return { runId: RUN_ID, keyId: KEY_ID, ...overrides };
}

function checkpointDependencies(
  overrides: Partial<FloodgateStableProposalCheckpointDependencies> = {},
): FloodgateStableProposalCheckpointDependencies {
  return {
    rootKey: rootKey(),
    effectiveUserId: effectiveUserId(),
    ...overrides,
  };
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(filePath: string, contents: string): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, { mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

async function fixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "stable-proposal-checkpoint-test-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  const repositoryRoot = path.join(root, "repository");
  const rawLockRoot = path.join(root, "raw-lock");
  const roleLockRoot = path.join(root, "role-lock");
  const roleBundleRoot = path.join(root, "role-bundle");
  const publicationParent = path.join(root, "publication");
  const stageBasename = "stable-proposal-stage";
  const stageRoot = path.join(publicationParent, stageBasename);
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
    options: {
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      roleBundleRoot,
      legacyProtectedPositionIdsPath,
      publicationParent,
      stageBasename,
      destinationBasename: "stable-proposal-final",
      engineBin,
      engineReceipt,
      engineArgs: [engineArgument],
      evalDir,
    },
  };
}

async function authorize(value: Fixture): Promise<FloodgateTeacherStageLease> {
  return authorizeFloodgateTeacherStageCoreForTests(value.options, {
    effectiveUserId: effectiveUserId(),
    inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  });
}

function gameId(seed: string): string {
  return `sha256:${sha256(`synthetic-checkpoint-game-v1\0${seed}`)}`;
}

function parentId(game: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${game}\0${ply}`)}`;
}

function parent(
  seed: string,
  sfen: string,
  ply: number,
): Readonly<FloodgateTrainingParent> {
  const game = gameId(seed);
  return {
    schema_version: 1,
    game_id: game,
    parent_id: parentId(game, ply),
    position_id: positionKeyFromSfen(sfen),
    parent_sfen: sfen,
    ply,
    played_move: MATE_MOVE,
  };
}

function authenticatedInput(
  inputRows: readonly Readonly<FloodgateTrainingParent>[],
): AuthenticatedFloodgateTrainingRows {
  const rows = [...inputRows].sort((left, right) =>
    Buffer.compare(Buffer.from(left.parent_id), Buffer.from(right.parent_id)),
  );
  const games = new Set(rows.map((row) => row.game_id));
  const parents = new Set(rows.map((row) => row.parent_id));
  const positions = new Set(rows.map((row) => row.position_id));
  return {
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: "training",
    binding: {
      result_receipt_bytes: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
      result_receipt_sha256: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
      bundle_manifest_bytes: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.bytes,
      bundle_manifest_sha256: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.sha256,
      bundle_producer_revision: "a".repeat(40),
      verifier_revision: "b".repeat(40),
      raw_format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
      raw_bytes: 1,
      raw_sha256: "c".repeat(64),
      records: rows.length,
      games: games.size,
      game_ids_sha256: floodgateIdentifierDigest(games),
      parent_ids_sha256: floodgateIdentifierDigest(parents),
      position_ids_count: positions.size,
      position_ids_sha256: floodgateIdentifierDigest(positions),
    },
    rows,
  };
}

function assets(): FloodgateStableWasmProposerAssets {
  return {
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

async function syntheticArtifact(): Promise<
  Readonly<FloodgateStableWasmProposalArtifact>
> {
  artifactPromise ??= (() => {
    const input = authenticatedInput([
      parent("alpha", MATE_SFEN, 0),
      parent("beta", MATE_VARIANT_SFEN, 0),
      parent("gamma", MATE_SECOND_VARIANT_SFEN, 0),
    ]);
    const search: FloodgateStableWasmProposerDependencies["search"] = (
      requests,
    ) =>
      Promise.resolve(
        boxedResults(
          requests.map((request) => ({
            index: request.index,
            packed_move: packedMove(
              input.rows[request.index].parent_sfen,
              MATE_MOVE,
            ),
            raw_search_score: 0,
            completed_depth: 11,
            nodes: 10 + request.index,
            leaves: 20 + request.index,
          })),
        ),
      );
    return generateFloodgateStableWasmProposalsCoreForTests(
      input,
      assets(),
      {
        workers: 1,
        startupTimeoutMilliseconds: 30_000,
        searchTimeoutMilliseconds: 30_000,
      },
      { search },
    );
  })();
  return artifactPromise;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function macForLine(
  line: Readonly<Record<string, unknown>>,
  macKey: string,
  domain: string,
  runId = RUN_ID,
  key: Uint8Array = rootKey(),
): string {
  const payload = Object.fromEntries(
    Object.entries(line).filter(([key]) => key !== macKey),
  );
  const derived = Buffer.from(
    hkdfSync(
      "sha256",
      key,
      Buffer.from(runId, "hex"),
      Buffer.from(HKDF_INFO),
      32,
    ),
  );
  return createHmac("sha256", derived)
    .update(domain, "utf8")
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
}

function parseWorkRecords(bytes: Uint8Array): Array<Record<string, unknown>> {
  return Buffer.from(bytes)
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function resignWorkRecords(
  original: Uint8Array,
  mutate: (records: Array<Record<string, unknown>>) => void,
  runId = RUN_ID,
  key: Uint8Array = rootKey(),
): Buffer {
  const records = JSON.parse(
    JSON.stringify(parseWorkRecords(original)),
  ) as Array<Record<string, unknown>>;
  mutate(records);

  records[0].header_mac = macForLine(
    records[0],
    "header_mac",
    HEADER_DOMAIN,
    runId,
    key,
  );
  let previousMac = records[0].header_mac as string;
  for (let index = 1; index < records.length - 1; index += 1) {
    records[index].previous_mac = previousMac;
    records[index].entry_mac = macForLine(
      records[index],
      "entry_mac",
      ENTRY_DOMAIN,
      runId,
      key,
    );
    previousMac = records[index].entry_mac as string;
  }
  const seal = records.at(-1)!;
  seal.final_entry_mac = previousMac;
  seal.seal_mac = macForLine(seal, "seal_mac", SEAL_DOMAIN, runId, key);
  return Buffer.from(`${records.map(canonicalJson).join("\n")}\n`, "utf8");
}

function refreshProposalReceiptIdentity(
  records: Array<Record<string, unknown>>,
): void {
  const header = records[0];
  const producer = header.producer as Record<string, unknown>;
  const seal = records.at(-1)!;
  const receipt = {
    claim_boundary: producer.proposal_claim_boundary,
    execution_boundary: producer.execution_boundary,
    input: header.input,
    operational: producer.operational,
    output: seal.proposal_output,
    preregistered_plan: producer.preregistered_plan,
    required_search_contract: producer.required_search_contract,
    schema: producer.proposal_schema,
    semantic_run_fingerprint_sha256: producer.semantic_run_fingerprint_sha256,
    status: producer.proposal_status,
    supplied_engine_assets: producer.supplied_engine_assets,
  };
  producer.proposal_receipt_sha256 = sha256(`${canonicalJson(receipt)}\n`);
}

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(
    value as Readonly<Record<string, unknown>>,
  )) {
    expectDeepFrozen(nested);
  }
}

function workPath(value: Fixture): string {
  return path.join(
    value.stageRoot,
    FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
  );
}

async function createCompleteCheckpoint(
  value: Fixture,
  artifact: Readonly<FloodgateStableWasmProposalArtifact>,
) {
  return checkpointFloodgateStableProposalsCoreForTests(
    await authorize(value),
    artifact,
    checkpointOptions(),
    checkpointDependencies(),
  );
}

async function freshAuthorizationReceipt(
  value: Fixture,
): Promise<Readonly<FloodgateTeacherStageAuthorizationReceipt>> {
  const lease = await authorize(value);
  const receipt = lease.receipt;
  await lease.close();
  return receipt;
}

function verificationOptions(
  stageAuthorizationReceipt: Readonly<FloodgateTeacherStageAuthorizationReceipt>,
  overrides: Partial<FloodgateStableProposalWorkVerificationOptions> = {},
): FloodgateStableProposalWorkVerificationOptions {
  return {
    rootKey: rootKey(),
    runId: RUN_ID,
    keyId: KEY_ID,
    stageAuthorizationReceipt,
    ...overrides,
  };
}

async function expectRejectedAndPreserved(
  value: Fixture,
  artifact: Readonly<FloodgateStableWasmProposalArtifact>,
  options = checkpointOptions(),
  dependencies = checkpointDependencies(),
): Promise<Error> {
  const before = await fs.promises.readFile(workPath(value));
  let failure: unknown;
  try {
    await checkpointFloodgateStableProposalsCoreForTests(
      await authorize(value),
      artifact,
      options,
      dependencies,
    );
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(await fs.promises.readFile(workPath(value))).toEqual(before);
  return failure as Error;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate stable proposal authenticated checkpoint", () => {
  it("creates only a private canonical work stream with authenticated header, entries, and seal", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    const receipt = await createCompleteCheckpoint(value, artifact);
    const bytes = await fs.promises.readFile(workPath(value));
    const lines = bytes.toString("utf8").trimEnd().split("\n");
    const parsed = lines.map(
      (line) => JSON.parse(line) as Readonly<Record<string, unknown>>,
    );

    expect(await fs.promises.readdir(value.stageRoot)).toEqual([
      FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
    ]);
    expect((await fs.promises.lstat(workPath(value))).mode & 0o7777).toBe(
      0o600,
    );
    expect(lines).toHaveLength(artifact.rows.length + 2);
    expect(parsed[0]).toMatchObject({
      schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
      kind: "header",
      run_id: RUN_ID,
      key_id: KEY_ID,
      algorithm: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
      status: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_PREFIX_STATUS,
      claim_boundary: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_CLAIM_BOUNDARY,
    });
    expect(parsed.slice(1, -1).map((line) => line.sequence)).toEqual([0, 1, 2]);
    expect(parsed.at(-1)).toMatchObject({
      schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
      kind: "seal",
      entries: artifact.rows.length,
      status: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS,
    });
    expect(receipt).toMatchObject({
      contract: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
      status: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS,
      claim_boundary: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_CLAIM_BOUNDARY,
      algorithm: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
      run_id: RUN_ID,
      key_id: KEY_ID,
      work: {
        filename: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
        records: artifact.rows.length,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
        completed_entries: artifact.rows.length,
        resumed_entries: 0,
      },
    });
    expect(parsed[0].header_mac).toBe(
      macForLine(parsed[0], "header_mac", HEADER_DOMAIN),
    );
    for (let index = 1; index < parsed.length - 1; index += 1) {
      expect(parsed[index].entry_mac).toBe(
        macForLine(parsed[index], "entry_mac", ENTRY_DOMAIN),
      );
      expect(parsed[index].previous_mac).toBe(
        index === 1 ? parsed[0].header_mac : parsed[index - 1].entry_mac,
      );
    }
    expect(parsed.at(-1)?.seal_mac).toBe(
      macForLine(parsed.at(-1)!, "seal_mac", SEAL_DOMAIN),
    );
    expect(bytes.toString("utf8")).not.toContain(ROOT_KEY_HEX);
    expect(JSON.stringify(receipt)).not.toContain(ROOT_KEY_HEX);
  });

  it("returns an already sealed checkpoint without rewriting it", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    await createCompleteCheckpoint(value, artifact);
    const beforeBytes = await fs.promises.readFile(workPath(value));
    const before = await fs.promises.lstat(workPath(value), { bigint: true });

    const receipt = await createCompleteCheckpoint(value, artifact);
    const after = await fs.promises.lstat(workPath(value), { bigint: true });

    expect(await fs.promises.readFile(workPath(value))).toEqual(beforeBytes);
    expect({
      dev: after.dev,
      ino: after.ino,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    }).toEqual({
      dev: before.dev,
      ino: before.ino,
      size: before.size,
      mtimeNs: before.mtimeNs,
      ctimeNs: before.ctimeNs,
    });
    expect(receipt.work.resumed_entries).toBe(artifact.rows.length);
  });

  it("resumes a valid authenticated entry prefix", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    await expect(
      checkpointFloodgateStableProposalsCoreForTests(
        await authorize(value),
        artifact,
        checkpointOptions(),
        checkpointDependencies({
          failpointForTests: (event) => {
            if (event.phase === "after-entry-durable" && event.sequence === 0) {
              throw new Error("synthetic interruption after entry zero");
            }
          },
        }),
      ),
    ).rejects.toBeInstanceOf(
      FloodgateStableProposalCheckpointPersistenceIndeterminateError,
    );
    expect(
      (await fs.promises.readFile(workPath(value), "utf8")).split("\n"),
    ).toHaveLength(3);

    const receipt = await createCompleteCheckpoint(value, artifact);
    expect(receipt.work.resumed_entries).toBe(1);
  });

  it("recovers an exact-prefix partial header with header durability semantics", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    await createCompleteCheckpoint(value, artifact);
    const header = (await fs.promises.readFile(workPath(value), "utf8")).split(
      "\n",
    )[0];
    await fs.promises.truncate(
      workPath(value),
      Math.floor(Buffer.byteLength(header) / 2),
    );
    const events: FloodgateStableProposalCheckpointFailpointEvent[] = [];

    const receipt = await checkpointFloodgateStableProposalsCoreForTests(
      await authorize(value),
      artifact,
      checkpointOptions(),
      checkpointDependencies({
        failpointForTests: (event) => {
          events.push(event);
        },
      }),
    );

    expect(events[0]).toEqual({ phase: "after-header-durable" });
    expect(receipt.work.resumed_entries).toBe(0);
  });

  it("recovers a private zero-byte work file left after creation but before its header", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    await mkdir0700(value.stageRoot);
    await write0600(workPath(value), "");
    const events: FloodgateStableProposalCheckpointFailpointEvent[] = [];

    const receipt = await checkpointFloodgateStableProposalsCoreForTests(
      await authorize(value),
      artifact,
      checkpointOptions(),
      checkpointDependencies({
        failpointForTests: (event) => {
          events.push(event);
        },
      }),
    );

    expect(events[0]).toEqual({ phase: "after-header-durable" });
    expect(receipt.work.resumed_entries).toBe(0);
    expect(
      (await fs.promises.readFile(workPath(value), "utf8")).endsWith("\n"),
    ).toBe(true);
  });

  it("truncates an exact expected next-line fragment and resumes from the last authenticated offset", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    await createCompleteCheckpoint(value, artifact);
    const lines = (await fs.promises.readFile(workPath(value), "utf8")).split(
      "\n",
    );
    const torn = `${lines[0]}\n${lines[1].slice(0, Math.floor(lines[1].length / 2))}`;
    await fs.promises.writeFile(workPath(value), torn, { mode: 0o600 });

    const receipt = await createCompleteCheckpoint(value, artifact);

    expect(receipt.work.resumed_entries).toBe(0);
    expect(
      (await fs.promises.readFile(workPath(value), "utf8")).endsWith("\n"),
    ).toBe(true);
  });

  it("treats every post-durability failpoint as persistence-indeterminate and remains resumable", async () => {
    const artifact = await syntheticArtifact();
    const cases: ReadonlyArray<{
      readonly phase: FloodgateStableProposalCheckpointFailpointEvent["phase"];
      readonly sequence?: number;
      readonly resumed: number;
    }> = [
      { phase: "after-header-durable", resumed: 0 },
      { phase: "after-entry-durable", sequence: 1, resumed: 2 },
      { phase: "after-seal-durable", resumed: artifact.rows.length },
      { phase: "before-final-reopen", resumed: artifact.rows.length },
    ];
    for (const testCase of cases) {
      const value = await fixture();
      let failure: unknown;
      try {
        await checkpointFloodgateStableProposalsCoreForTests(
          await authorize(value),
          artifact,
          checkpointOptions(),
          checkpointDependencies({
            failpointForTests: (event) => {
              if (
                event.phase === testCase.phase &&
                (testCase.sequence === undefined ||
                  event.sequence === testCase.sequence)
              ) {
                throw new Error(`synthetic ${testCase.phase}`);
              }
            },
          }),
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(
        FloodgateStableProposalCheckpointPersistenceIndeterminateError,
      );
      expect(
        (
          failure as FloodgateStableProposalCheckpointPersistenceIndeterminateError
        ).mayHavePersisted,
      ).toBe(true);
      const receipt = await createCompleteCheckpoint(value, artifact);
      expect(receipt.work.resumed_entries).toBe(testCase.resumed);
    }
  });

  it("rejects complete-line corruption, bad MACs, reorder, duplication, and data after the seal without changing bytes", async () => {
    const artifact = await syntheticArtifact();
    const mutations: ReadonlyArray<
      readonly [string, (lines: string[]) => string]
    > = [
      [
        "corrupt",
        (lines) =>
          `${lines[0]}\n${lines[1].replace('"kind":"proposal"', '"kind":"tampered"')}\n${lines.slice(2).join("\n")}\n`,
      ],
      [
        "bad MAC",
        (lines) => {
          const entry = JSON.parse(lines[1]) as Record<string, unknown>;
          entry.entry_mac = "0".repeat(64);
          return `${lines[0]}\n${canonicalJson(entry)}\n${lines.slice(2).join("\n")}\n`;
        },
      ],
      [
        "reorder",
        (lines) =>
          `${lines[0]}\n${lines[2]}\n${lines[1]}\n${lines.slice(3).join("\n")}\n`,
      ],
      [
        "duplicate",
        (lines) =>
          `${lines[0]}\n${lines[1]}\n${lines[1]}\n${lines.slice(2).join("\n")}\n`,
      ],
      ["after seal", (lines) => `${lines.join("\n")}\n{}\n`],
    ];
    for (const [_label, mutate] of mutations) {
      const value = await fixture();
      await createCompleteCheckpoint(value, artifact);
      const lines = (await fs.promises.readFile(workPath(value), "utf8"))
        .trimEnd()
        .split("\n");
      await fs.promises.writeFile(workPath(value), mutate(lines), {
        mode: 0o600,
      });
      await expectRejectedAndPreserved(value, artifact);
    }
  });

  it("rejects UTF-8 BOM bytes before either the header or an entry and preserves the exact stream", async () => {
    const artifact = await syntheticArtifact();
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    for (const location of ["header", "entry"] as const) {
      const value = await fixture();
      await createCompleteCheckpoint(value, artifact);
      const original = await fs.promises.readFile(workPath(value));
      const insertionOffset =
        location === "header" ? 0 : original.indexOf(0x0a) + 1;
      expect(insertionOffset).toBeGreaterThanOrEqual(0);
      const mutated = Buffer.concat([
        original.subarray(0, insertionOffset),
        bom,
        original.subarray(insertionOffset),
      ]);
      await fs.promises.writeFile(workPath(value), mutated, { mode: 0o600 });

      await expectRejectedAndPreserved(value, artifact);
    }
  });

  it("rejects a wrong key, run, or artifact and preserves the authenticated checkpoint", async () => {
    const artifact = await syntheticArtifact();
    const value = await fixture();
    await createCompleteCheckpoint(value, artifact);

    const wrongKeyError = await expectRejectedAndPreserved(
      value,
      artifact,
      checkpointOptions(),
      checkpointDependencies({ rootKey: rootKey(0x5a) }),
    );
    expect(String(wrongKeyError)).not.toContain(ROOT_KEY_HEX);
    await expectRejectedAndPreserved(
      value,
      artifact,
      checkpointOptions({ runId: OTHER_RUN_ID }),
    );
    const alteredArtifact = {
      ...artifact,
      jsonl: artifact.jsonl.replace(MATE_MOVE, "9a9b"),
    };
    await expectRejectedAndPreserved(value, alteredArtifact);
  });

  it("rejects a valid checkpoint copied to a different authorized stage", async () => {
    const artifact = await syntheticArtifact();
    const source = await fixture();
    await createCompleteCheckpoint(source, artifact);
    const copied = await fs.promises.readFile(workPath(source));
    const destination = await fixture();
    await mkdir0700(destination.stageRoot);
    await fs.promises.writeFile(workPath(destination), copied, { mode: 0o600 });

    await expectRejectedAndPreserved(destination, artifact);
  });

  it("rejects generic-stage extras before creating or changing work.jsonl", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    await mkdir0700(value.stageRoot);
    await write0600(path.join(value.stageRoot, "manifest.json"), "{}\n");

    await expect(
      checkpointFloodgateStableProposalsCoreForTests(
        await authorize(value),
        artifact,
        checkpointOptions(),
        checkpointDependencies(),
      ),
    ).rejects.toThrow(/only work\.jsonl/);
    expect(await fs.promises.readdir(value.stageRoot)).toEqual([
      "manifest.json",
    ]);
  });

  it("rejects symlink, hard-link, and non-private work.jsonl objects", async () => {
    const artifact = await syntheticArtifact();
    for (const kind of ["symlink", "hardlink", "mode"] as const) {
      const value = await fixture();
      const lease = await authorize(value);
      const external = path.join(value.root, `${kind}-external`);
      await write0600(external, "synthetic external bytes\n");
      if (kind === "symlink") {
        await fs.promises.symlink(external, workPath(value));
      } else if (kind === "hardlink") {
        await fs.promises.link(external, workPath(value));
      } else {
        await fs.promises.copyFile(external, workPath(value));
        await fs.promises.chmod(workPath(value), 0o644);
      }
      const before = await fs.promises.readFile(external);
      await expect(
        checkpointFloodgateStableProposalsCoreForTests(
          lease,
          artifact,
          checkpointOptions(),
          checkpointDependencies(),
        ),
      ).rejects.toThrow();
      expect(await fs.promises.readFile(external)).toEqual(before);
    }
  });

  it("claims the exact lease as its first action, consumes it once, and closes it after capture failure", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    const lease = await authorize(value);

    const pending = checkpointFloodgateStableProposalsCoreForTests(
      lease,
      artifact,
      checkpointOptions({ runId: "not-a-run-id" }),
      checkpointDependencies(),
    );
    expect(() =>
      claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests(lease),
    ).toThrow(/exact active unclaimed lease/);
    await expect(pending).rejects.toThrow(/runId/);

    const replacement = await authorize(value);
    await replacement.close();
  });

  it("deep-captures caller-owned proposal rows and receipt metadata before the first await", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    const mutable = JSON.parse(
      JSON.stringify({
        rows: artifact.rows,
        jsonl: artifact.jsonl,
        receipt: artifact.receipt,
        receipt_json: artifact.receipt_json,
      }),
    ) as {
      rows: Array<{ search: { nodes: number } }>;
      jsonl: string;
      receipt: { operational: { workers: number } };
      receipt_json: string;
    };
    const originalNodes = mutable.rows[0].search.nodes;
    const originalWorkers = mutable.receipt.operational.workers;

    const pending = checkpointFloodgateStableProposalsCoreForTests(
      await authorize(value),
      mutable as unknown as FloodgateStableWasmProposalArtifact,
      checkpointOptions(),
      checkpointDependencies(),
    );
    mutable.rows[0].search.nodes = 999_999;
    mutable.receipt.operational.workers = 12;
    mutable.jsonl = "caller-mutated-after-invocation\n";
    mutable.receipt_json = "caller-mutated-after-invocation\n";
    await pending;

    const lines = (await fs.promises.readFile(workPath(value), "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const header = lines[0] as {
      producer: { operational: { workers: number } };
    };
    const firstEntry = lines[1] as {
      proposal: { search: { nodes: number } };
    };
    expect(firstEntry.proposal.search.nodes).toBe(originalNodes);
    expect(header.producer.operational.workers).toBe(originalWorkers);
  });

  it("loops over bounded short writes and rejects a zero-progress write as persistence-indeterminate", async () => {
    const artifact = await syntheticArtifact();
    const shortWriteValue = await fixture();
    const requests: Array<
      Readonly<{ label: string; offset: number; length: number }>
    > = [];
    const receipt = await checkpointFloodgateStableProposalsCoreForTests(
      await authorize(shortWriteValue),
      artifact,
      checkpointOptions(),
      checkpointDependencies({
        writeForTests: async (request, write) => {
          requests.push({
            label: request.label,
            offset: request.offset,
            length: request.length,
          });
          return write(Math.max(1, Math.floor(request.length / 3)));
        },
      }),
    );
    expect(receipt.work.completed_entries).toBe(artifact.rows.length);
    expect(requests.some((request) => request.offset > 0)).toBe(true);
    expect(new Set(requests.map((request) => request.label))).toEqual(
      new Set([
        "checkpoint header",
        "checkpoint entry 0",
        "checkpoint entry 1",
        "checkpoint entry 2",
        "checkpoint seal",
      ]),
    );

    const zeroWriteValue = await fixture();
    let failure: unknown;
    try {
      await checkpointFloodgateStableProposalsCoreForTests(
        await authorize(zeroWriteValue),
        artifact,
        checkpointOptions(),
        checkpointDependencies({
          writeForTests: async () => 0,
        }),
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(
      FloodgateStableProposalCheckpointPersistenceIndeterminateError,
    );
    expect(
      (
        failure as FloodgateStableProposalCheckpointPersistenceIndeterminateError
      ).mayHavePersisted,
    ).toBe(true);
    expect((await fs.promises.lstat(workPath(zeroWriteValue))).size).toBe(0);
  });

  it("never reports success when the final work-file or held-stage descriptor close fails", async () => {
    const artifact = await syntheticArtifact();
    const workValue = await fixture();
    let workCloses = 0;
    let workFailure: unknown;
    try {
      await checkpointFloodgateStableProposalsCoreForTests(
        await authorize(workValue),
        artifact,
        checkpointOptions(),
        checkpointDependencies({
          closeForTests: async (kind, close) => {
            await close();
            if (kind === "work") {
              workCloses += 1;
              if (workCloses === 2) {
                throw new Error(
                  "synthetic final work descriptor close failure",
                );
              }
            }
          },
        }),
      );
    } catch (error) {
      workFailure = error;
    }
    expect(workCloses).toBe(2);
    expect(workFailure).toBeInstanceOf(
      FloodgateStableProposalCheckpointPersistenceIndeterminateError,
    );

    const stageValue = await fixture();
    let stageFailure: unknown;
    try {
      await checkpointFloodgateStableProposalsCoreForTests(
        await authorize(stageValue),
        artifact,
        checkpointOptions(),
        checkpointDependencies({
          closeForTests: async (kind, close) => {
            await close();
            if (kind === "stage") {
              throw new Error("synthetic held-stage descriptor close failure");
            }
          },
        }),
      );
    } catch (error) {
      stageFailure = error;
    }
    expect(stageFailure).toBeInstanceOf(Error);
    expect(stageFailure).toBeInstanceOf(
      FloodgateStableProposalCheckpointPersistenceIndeterminateError,
    );
    expect(
      (
        stageFailure as FloodgateStableProposalCheckpointPersistenceIndeterminateError
      ).mayHavePersisted,
    ).toBe(true);
    expect(String(stageFailure)).toMatch(
      /handle close failed.*may have persisted/i,
    );
  });

  it("does not persist or report root key bytes, including on authentication failure", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    const receipt = await createCompleteCheckpoint(value, artifact);
    const work = await fs.promises.readFile(workPath(value), "utf8");
    const failure = await expectRejectedAndPreserved(
      value,
      artifact,
      checkpointOptions(),
      checkpointDependencies({ rootKey: rootKey(0x5a) }),
    );

    expect(work).not.toContain(ROOT_KEY_HEX);
    expect(JSON.stringify(receipt)).not.toContain(ROOT_KEY_HEX);
    expect(String(failure)).not.toContain(ROOT_KEY_HEX);
  });
});

describe("Floodgate stable proposal standalone work verifier", () => {
  it("returns exact, deeply frozen evidence and a stage-independent semantic binding from fresh same-stage receipts without leaking key bytes", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    const checkpointReceipt = await createCompleteCheckpoint(value, artifact);
    const bytes = await fs.promises.readFile(workPath(value));
    const firstStageReceipt = await freshAuthorizationReceipt(value);
    const secondStageReceipt = await freshAuthorizationReceipt(value);

    expect(firstStageReceipt).not.toBe(secondStageReceipt);
    const first = verifyAuthenticatedFloodgateStableProposalWork(
      bytes,
      verificationOptions(firstStageReceipt),
    );
    const second = verifyAuthenticatedFloodgateStableProposalWork(
      bytes,
      verificationOptions(secondStageReceipt),
    );

    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual([
      "contract",
      "status",
      "claim_boundary",
      "evidence",
      "semantic_binding",
    ]);
    expect(Object.keys(first.evidence)).toEqual([
      "work",
      "run_id",
      "key_id",
      "stage",
      "header",
      "seal",
    ]);
    expect(first).toMatchObject({
      contract: FLOODGATE_STABLE_PROPOSAL_WORK_VERIFICATION_CONTRACT,
      status: FLOODGATE_STABLE_PROPOSAL_WORK_VERIFICATION_STATUS,
      claim_boundary:
        FLOODGATE_STABLE_PROPOSAL_WORK_VERIFICATION_CLAIM_BOUNDARY,
      evidence: {
        work: {
          bytes: bytes.byteLength,
          sha256: sha256(bytes),
        },
        run_id: RUN_ID,
        key_id: KEY_ID,
        stage: {
          stage_basename: firstStageReceipt.stage_basename,
          parent_dev: firstStageReceipt.parent_identity.dev.toString(10),
          parent_ino: firstStageReceipt.parent_identity.ino.toString(10),
          stage_dev: firstStageReceipt.stage_identity.dev.toString(10),
          stage_ino: firstStageReceipt.stage_identity.ino.toString(10),
        },
        header: {
          schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
          kind: "header",
        },
        seal: {
          schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
          kind: "seal",
          entries: artifact.rows.length,
        },
      },
      semantic_binding: {
        domain: FLOODGATE_STABLE_PROPOSAL_SEMANTIC_BINDING_DOMAIN,
        projection: {
          schema: FLOODGATE_STABLE_PROPOSAL_SEMANTIC_BINDING_SCHEMA,
          checkpoint_schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
          input: artifact.receipt.input,
          output: artifact.receipt.output,
        },
      },
    });
    const parsed = parseWorkRecords(bytes);
    expect(first.evidence.header).toEqual(parsed[0]);
    expect(first.evidence.seal).toEqual(parsed.at(-1));
    expect(first.semantic_binding.projection).toEqual({
      schema: FLOODGATE_STABLE_PROPOSAL_SEMANTIC_BINDING_SCHEMA,
      checkpoint_schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
      producer: {
        proposal_schema: artifact.receipt.schema,
        proposal_status: artifact.receipt.status,
        proposal_claim_boundary: artifact.receipt.claim_boundary,
        semantic_run_fingerprint_sha256:
          artifact.receipt.semantic_run_fingerprint_sha256,
      },
      input: artifact.receipt.input,
      output: artifact.receipt.output,
    });
    expect(first.evidence.work.sha256).toBe(checkpointReceipt.work.sha256);
    expect(first.semantic_binding.sha256).toBe(
      sha256(
        `${FLOODGATE_STABLE_PROPOSAL_SEMANTIC_BINDING_DOMAIN}\0${canonicalJson(first.semantic_binding.projection)}`,
      ),
    );
    expectDeepFrozen(first);
    for (const verifiedRecord of [
      first,
      first.evidence,
      first.evidence.work,
      first.evidence.stage,
      first.evidence.header,
      first.evidence.seal,
      first.semantic_binding,
      first.semantic_binding.projection,
    ]) {
      expect(Object.getPrototypeOf(verifiedRecord)).toBeNull();
    }
    expect(JSON.stringify(first)).not.toContain(ROOT_KEY_HEX);
  });

  it("rejects the wrong root key, run id, key id, or authorized stage without exposing either tested key", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    await createCompleteCheckpoint(value, artifact);
    const bytes = await fs.promises.readFile(workPath(value));
    const stageReceipt = await freshAuthorizationReceipt(value);
    const other = await fixture();
    const otherStageReceipt = await freshAuthorizationReceipt(other);
    const wrongKeyHex = Buffer.from(rootKey(0x5a)).toString("hex");
    const cases: ReadonlyArray<
      readonly [string, FloodgateStableProposalWorkVerificationOptions]
    > = [
      [
        "root key",
        verificationOptions(stageReceipt, { rootKey: rootKey(0x5a) }),
      ],
      ["run id", verificationOptions(stageReceipt, { runId: OTHER_RUN_ID })],
      [
        "key id",
        verificationOptions(stageReceipt, {
          keyId: "synthetic-checkpoint-key-other",
        }),
      ],
      ["stage", verificationOptions(otherStageReceipt)],
    ];

    for (const [_label, options] of cases) {
      let failure: unknown;
      try {
        verifyAuthenticatedFloodgateStableProposalWork(bytes, options);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).not.toContain(ROOT_KEY_HEX);
      expect(String(failure)).not.toContain(wrongKeyHex);
    }

    const invalidStageReceipts = [
      { ...stageReceipt, contract: "wrong-authorization-contract" },
      {
        ...stageReceipt,
        trust_boundary: "wrong-authorization-trust-boundary",
      },
      { ...stageReceipt, status: "wrong-authorization-status" },
      { ...stageReceipt, allowed_entries: ["work.jsonl"] },
      { ...stageReceipt, stage_basename: "../unsafe-stage" },
      {
        ...stageReceipt,
        stage_identity: { ...stageReceipt.stage_identity, ino: BigInt(0) },
      },
    ] as unknown as ReadonlyArray<
      Readonly<FloodgateTeacherStageAuthorizationReceipt>
    >;
    for (const invalidReceipt of invalidStageReceipts) {
      expect(() =>
        verifyAuthenticatedFloodgateStableProposalWork(
          bytes,
          verificationOptions(invalidReceipt),
        ),
      ).toThrow();
    }
  });

  it("rejects torn bytes, a missing final LF, and any complete record after the authenticated seal", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    await createCompleteCheckpoint(value, artifact);
    const bytes = await fs.promises.readFile(workPath(value));
    const options = verificationOptions(await freshAuthorizationReceipt(value));
    const variants = [
      bytes.subarray(0, Math.floor(bytes.byteLength / 2)),
      bytes.subarray(0, bytes.byteLength - 1),
      Buffer.concat([bytes, Buffer.from("{}\n", "utf8")]),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]),
      Buffer.concat([
        bytes.subarray(0, 8),
        Buffer.from([0]),
        bytes.subarray(9),
      ]),
      Buffer.concat([
        bytes.subarray(0, 8),
        Buffer.from("\r"),
        bytes.subarray(8),
      ]),
      Buffer.concat([
        bytes.subarray(0, 8),
        Buffer.from([0xff]),
        bytes.subarray(9),
      ]),
      Buffer.concat([bytes, Buffer.from("\n", "utf8")]),
      Buffer.concat([Buffer.alloc(64 * 1024 + 1, 0x61), Buffer.from("\n")]),
    ];

    for (const variant of variants) {
      expect(() =>
        verifyAuthenticatedFloodgateStableProposalWork(variant, options),
      ).toThrow();
    }
  });

  it("rejects fully re-signed semantic tampering in parent linkage, seal output, semantic fingerprint, receipt identity, or nested proposal shape", async () => {
    const value = await fixture();
    const artifact = await syntheticArtifact();
    await createCompleteCheckpoint(value, artifact);
    const bytes = await fs.promises.readFile(workPath(value));
    const options = verificationOptions(await freshAuthorizationReceipt(value));
    const replacementParent = `sha256:${"d".repeat(64)}`;
    const mutations: ReadonlyArray<
      readonly [string, (records: Array<Record<string, unknown>>) => void]
    > = [
      [
        "parent linkage",
        (records) => {
          records[1].parent_id = replacementParent;
        },
      ],
      [
        "seal output",
        (records) => {
          const output = records.at(-1)!.proposal_output as Record<
            string,
            unknown
          >;
          output.sha256 = "e".repeat(64);
        },
      ],
      [
        "semantic fingerprint",
        (records) => {
          const producer = records[0].producer as Record<string, unknown>;
          producer.semantic_run_fingerprint_sha256 = "f".repeat(64);
        },
      ],
      [
        "proposal receipt identity",
        (records) => {
          const producer = records[0].producer as Record<string, unknown>;
          producer.proposal_receipt_sha256 = "0".repeat(64);
        },
      ],
      [
        "nested extra",
        (records) => {
          const proposal = records[1].proposal as Record<string, unknown>;
          const search = proposal.search as Record<string, unknown>;
          search.synthetic_extra = true;
        },
      ],
    ];

    for (const [_label, mutate] of mutations) {
      const signedTamper = resignWorkRecords(bytes, mutate);
      expect(() =>
        verifyAuthenticatedFloodgateStableProposalWork(signedTamper, options),
      ).toThrow();
    }
  });

  it("changes exact work identity across stage, run, and key contexts while preserving one synthetic semantic digest", async () => {
    const artifact = await syntheticArtifact();
    const base = await fixture();
    await createCompleteCheckpoint(base, artifact);
    const baseBytes = await fs.promises.readFile(workPath(base));
    const baseReceipt = await freshAuthorizationReceipt(base);
    const baseVerification = verifyAuthenticatedFloodgateStableProposalWork(
      baseBytes,
      verificationOptions(baseReceipt),
    );

    const otherStage = await fixture();
    await createCompleteCheckpoint(otherStage, artifact);
    const otherStageBytes = await fs.promises.readFile(workPath(otherStage));
    const stageVerification = verifyAuthenticatedFloodgateStableProposalWork(
      otherStageBytes,
      verificationOptions(await freshAuthorizationReceipt(otherStage)),
    );

    const otherRunBytes = resignWorkRecords(
      baseBytes,
      (records) => {
        records[0].run_id = OTHER_RUN_ID;
      },
      OTHER_RUN_ID,
    );
    const runVerification = verifyAuthenticatedFloodgateStableProposalWork(
      otherRunBytes,
      verificationOptions(baseReceipt, { runId: OTHER_RUN_ID }),
    );

    const otherKey = rootKey(0x5a);
    const otherKeyId = "synthetic-checkpoint-key-2";
    const otherKeyBytes = resignWorkRecords(
      baseBytes,
      (records) => {
        records[0].key_id = otherKeyId;
      },
      RUN_ID,
      otherKey,
    );
    const keyVerification = verifyAuthenticatedFloodgateStableProposalWork(
      otherKeyBytes,
      verificationOptions(baseReceipt, {
        rootKey: otherKey,
        keyId: otherKeyId,
      }),
    );

    const operationalBytes = resignWorkRecords(baseBytes, (records) => {
      const producer = records[0].producer as Record<string, unknown>;
      const operational = producer.operational as Record<string, unknown>;
      operational.workers = (operational.workers as number) + 1;
      refreshProposalReceiptIdentity(records);
    });
    const operationalVerification =
      verifyAuthenticatedFloodgateStableProposalWork(
        operationalBytes,
        verificationOptions(baseReceipt),
      );

    const verifications = [
      baseVerification,
      stageVerification,
      runVerification,
      keyVerification,
      operationalVerification,
    ];
    expect(
      new Set(verifications.map((entry) => entry.evidence.work.sha256)).size,
    ).toBe(verifications.length);
    expect(
      new Set(verifications.map((entry) => entry.semantic_binding.sha256)),
    ).toEqual(new Set([baseVerification.semantic_binding.sha256]));
  });
});
