import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  canonicalFreshTeacherJson,
  type FreshTeacherArtifactIdentity,
} from "../../../ml/floodgate-fresh-teacher-artifact-validation";
import {
  FRESH_SELECTION_SEMANTIC_VALIDATION_BOUNDARY,
  FRESH_SELECTION_SEMANTIC_VALIDATION_RECEIPT_SCHEMA,
  FRESH_SELECTION_SEMANTIC_VALIDATION_STATUS,
  validateFreshSelectionSemanticArtifactsCoreForTests,
  type FreshSelectionSemanticSourceIdentity,
  type FreshSelectionSemanticValidationDependencies,
} from "../../../ml/floodgate-fresh-selection-semantic-validation";
import {
  FRESH_SELECTION_TEACHER_BOUNDARY,
  FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
  FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
  FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT,
  FRESH_SELECTION_TEACHER_RESULT_SCHEMA,
  FRESH_SELECTION_TEACHER_SOURCE,
  FRESH_SELECTION_TEACHER_SOURCE_RELATIVE_PATH,
  FRESH_SELECTION_TEACHER_STATUS,
  freshSelectionTeacherPaths,
} from "../../../ml/floodgate-fresh-selection-teacher-runner";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import {
  FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
  parseAuthenticatedFloodgateFreshSelectionRows,
  type FloodgateFreshSelectionRawIdentity,
  type FloodgateTrainingParent,
} from "../../../ml/floodgate-training-row-validation";
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
} from "../../../ml/floodgate-training-row-consumer";
import {
  SIBLING_TEACHER_WORK_SCHEMA,
  siblingTeacherStagePaths,
  stageSiblingTeacherDatasetWithFreshTimeoutQuarantineCoreForTests,
} from "../../../ml/generate-sibling-teacher";
import { positionKeyFromSfen } from "../../../ml/sibling-data";
import { validateFreshSelectionTeacherCliCore } from "../../../ml/validate-floodgate-fresh-selection-teacher";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, "../../..");
const FAKE_ENGINE = path.resolve(HERE, "../../fixtures/ml/fake-usi-engine.mjs");
const REVISION = "0123456789abcdef0123456789abcdef01234567";
const TWO_LEGAL =
  "ln4nn1/2r3gk1/3p2gp1/2s1R3S/p1p2P2p/3P2PL1/P+pSS1G1L1/1K7/LN6+b b G5Pb3p 119";
const PLY = 118;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileIdentity(
  file: string,
  schema: string,
): Promise<Readonly<FreshTeacherArtifactIdentity>> {
  return fs.promises.readFile(file).then((bytes) =>
    Object.freeze({
      path: `${FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT}/${path.basename(file)}`,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      schema,
    }),
  );
}

async function writeEngineReceipt(root: string): Promise<string> {
  const engineBytes = await fs.promises.readFile(process.execPath);
  const receipt = path.join(root, "engine-receipt.json");
  await fs.promises.writeFile(
    receipt,
    `${JSON.stringify({
      schema: "shogi-teacher-engine-receipt-v1",
      source_repository: "https://example.test/teacher-engine.git",
      source_commit: REVISION,
      source_commit_date: "2026-07-02T13:41:06+09:00",
      build_directory: "source",
      build_command: "test build",
      compiler: "test compiler",
      compiler_target: "test-target",
      engine_id: "deterministic fake engine",
      binary_bytes: engineBytes.byteLength,
      binary_sha256: sha256(engineBytes),
    })}\n`,
    { mode: 0o600 },
  );
  return receipt;
}

function authenticatedInput(
  rawBytes: Uint8Array,
  rows: readonly Readonly<FloodgateTrainingParent>[],
): Readonly<AuthenticatedFloodgateTrainingRows> {
  const gameIds = new Set(rows.map((row) => row.game_id));
  const parentIds = new Set(rows.map((row) => row.parent_id));
  const positionIds = new Set(rows.map((row) => row.position_id));
  return Object.freeze({
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: "training" as const,
    binding: Object.freeze({
      result_receipt_bytes: 1,
      result_receipt_sha256: sha256("result"),
      bundle_manifest_bytes: 1,
      bundle_manifest_sha256: sha256("manifest"),
      bundle_producer_revision: REVISION,
      verifier_revision: REVISION,
      raw_format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
      raw_bytes: rawBytes.byteLength,
      raw_sha256: sha256(rawBytes),
      records: rows.length,
      games: gameIds.size,
      game_ids_sha256: floodgateIdentifierDigest(gameIds),
      parent_ids_sha256: floodgateIdentifierDigest(parentIds),
      position_ids_count: positionIds.size,
      position_ids_sha256: floodgateIdentifierDigest(positionIds),
    }),
    rows,
  });
}

interface SemanticFixture {
  readonly home: string;
  readonly paths: ReturnType<typeof freshSelectionTeacherPaths>;
  readonly sourceIdentity: Readonly<FreshSelectionSemanticSourceIdentity>;
  readonly dependencies: Readonly<FreshSelectionSemanticValidationDependencies>;
  readonly completion: Readonly<Record<string, unknown>>;
}

async function semanticFixture(): Promise<SemanticFixture> {
  const home = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "fresh-selection-semantic-"),
    ),
  );
  const paths = freshSelectionTeacherPaths(home, REPOSITORY_ROOT);
  await fs.promises.mkdir(path.dirname(paths.source), {
    recursive: true,
    mode: 0o700,
  });
  await fs.promises.chmod(path.dirname(paths.source), 0o700);
  await fs.promises.mkdir(paths.outputRoot, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(paths.outputRoot, 0o700);

  const sourceUrl =
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/" +
    "wdoor+floodgate-300-10F+playerA+playerB+20260101000000.csa";
  const gameId = `sha256:${sha256(`floodgate-q1-2026-game-id-v1\0${sourceUrl}`)}`;
  const parentId = `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${PLY}`)}`;
  const positionId = positionKeyFromSfen(TWO_LEGAL);
  const rawBytes = Buffer.from(
    `${canonicalFreshTeacherJson({
      game_id: gameId,
      game_sha256: "a".repeat(64),
      parent_id: parentId,
      parent_sfen: TWO_LEGAL,
      played_move: "8h7i",
      ply: PLY,
      position_id: positionId,
      schema_version: 1,
      source: "floodgate",
      source_url: sourceUrl,
    })}\n`,
    "utf8",
  );
  const sourceIdentity: FreshSelectionSemanticSourceIdentity = Object.freeze({
    path: FRESH_SELECTION_TEACHER_SOURCE_RELATIVE_PATH,
    format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
    bytes: rawBytes.byteLength,
    sha256: sha256(rawBytes),
    records: 1,
    games: 1,
    game_ids_sha256: floodgateIdentifierDigest([gameId]),
    parent_ids_sha256: floodgateIdentifierDigest([parentId]),
    position_ids_count: 1,
    position_ids_sha256: floodgateIdentifierDigest([positionId]),
  });
  await fs.promises.writeFile(paths.source, rawBytes, { mode: 0o600 });
  const parserIdentity: FloodgateFreshSelectionRawIdentity = {
    ...sourceIdentity,
    path: "fresh-selection.raw.jsonl",
  };
  const rows = parseAuthenticatedFloodgateFreshSelectionRows(
    rawBytes,
    parserIdentity,
  );
  const outcome =
    await stageSiblingTeacherDatasetWithFreshTimeoutQuarantineCoreForTests(
      authenticatedInput(rawBytes, rows),
      {
        stageRoot: paths.outputRoot,
        runnerRevision: REVISION,
        engineBin: process.execPath,
        engineArgs: [FAKE_ENGINE, "--incomplete-proposal"],
        engineReceipt: await writeEngineReceipt(home),
        multipv: 6,
        proposalDepth: 14,
        depth: 16,
        engines: 1,
        hashMb: 64,
        timeoutMs: 600_000,
        proposalIncompleteAllLegalFallbackMaxMoves: 6,
      },
      {
        verifyRevision: async (revision) => ({
          source_revision: revision,
          tracked_tree_clean: true,
        }),
        verifyOutputPaths: async () => undefined,
      },
    );
  const workBytes = await fs.promises.readFile(
    siblingTeacherStagePaths(paths.outputRoot).work,
  );
  const workRows = workBytes
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const completed = workRows.slice(1).filter((row) => row.kind === "parent");
  const forced = workRows.slice(1).filter((row) => row.kind === "skip");
  const records = completed.flatMap((row) => row.records as readonly unknown[]);
  const fewerThanTwo = forced.filter(
    (row) => row.reason === "fewer-than-two-legal-moves",
  );
  const timeouts = forced.filter(
    (row) => row.reason === "search-timeout-no-label",
  );
  const datasetBytes = Buffer.from(
    `${records.map((record) => canonicalFreshTeacherJson(record)).join("\n")}\n`,
    "utf8",
  );
  await fs.promises.writeFile(paths.dataset, datasetBytes, { mode: 0o600 });
  await fs.promises.chmod(paths.work, 0o600);
  const completion = Object.freeze({
    input_games: 1,
    input_parents: 1,
    completed_parents: 1,
    forced_parents_skipped: forced.length,
    forced_skip_reasons: Object.freeze({
      fewer_than_two_legal_moves: fewerThanTwo.length,
      search_timeout_no_label: timeouts.length,
    }),
    parent_accounting: Object.freeze({
      parent_ids_sha256: floodgateIdentifierDigest([parentId]),
      forced_parent_ids_sha256: floodgateIdentifierDigest(
        forced.map((row) => row.parent_id as string),
      ),
      emitted_parent_ids_sha256: floodgateIdentifierDigest(
        completed.map((row) => row.parent_id as string),
      ),
      fewer_than_two_legal_moves_parent_ids_sha256: floodgateIdentifierDigest(
        fewerThanTwo.map((row) => row.parent_id as string),
      ),
      search_timeout_parent_ids_sha256: floodgateIdentifierDigest(
        timeouts.map((row) => row.parent_id as string),
      ),
    }),
    emitted_parent_groups: completed.length,
    dataset_records: records.length,
    sealed: true,
  });
  const [dataset, work] = await Promise.all([
    fileIdentity(paths.dataset, FRESH_SELECTION_TEACHER_DATASET_SCHEMA),
    fileIdentity(paths.work, SIBLING_TEACHER_WORK_SCHEMA),
  ]);
  const generationRunFingerprint = outcome.run_fingerprint;
  const runFingerprint = sha256("fresh-selection-semantic-test-run");
  const manifest = {
    schema: FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
    status: FRESH_SELECTION_TEACHER_STATUS,
    role: "fresh_selection",
    source: sourceIdentity,
    dataset,
    work,
    completion,
    generation_run_fingerprint: generationRunFingerprint,
    run_fingerprint: runFingerprint,
    boundary: FRESH_SELECTION_TEACHER_BOUNDARY,
  };
  await fs.promises.writeFile(
    paths.manifest,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  const result = {
    schema: FRESH_SELECTION_TEACHER_RESULT_SCHEMA,
    status: FRESH_SELECTION_TEACHER_STATUS,
    role: "fresh_selection",
    manifest: await fileIdentity(
      paths.manifest,
      FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
    ),
    dataset,
    work,
    completion,
    generation_run_fingerprint: generationRunFingerprint,
    run_fingerprint: runFingerprint,
    postflight_complete: true,
    boundary: FRESH_SELECTION_TEACHER_BOUNDARY,
  };
  await fs.promises.writeFile(
    paths.result,
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  return Object.freeze({
    home,
    paths,
    sourceIdentity,
    dependencies: Object.freeze({
      homeDirectory: () => home,
      repositoryRoot: REPOSITORY_ROOT,
      effectiveUserId: process.geteuid?.() ?? 0,
      availableParallelism: 13,
      captureExactCleanRevision: async () => REVISION,
    }),
    completion,
  });
}

async function coherentlyExtendWorkAndDataset(
  fixture: Readonly<SemanticFixture>,
): Promise<void> {
  const workRows = (await fs.promises.readFile(fixture.paths.work, "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const parent = workRows.find((row) => row.kind === "parent");
  if (parent === undefined) throw new Error("test parent work row is absent");
  const record = (parent.records as Record<string, unknown>[])[0];
  record.unknown_semantic_extension = true;
  const payload = { ...parent };
  delete payload.payload_sha256;
  parent.payload_sha256 = sha256(canonicalFreshTeacherJson(payload));
  const workBytes = Buffer.from(
    `${workRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    "utf8",
  );
  const records = workRows
    .filter((row) => row.kind === "parent")
    .flatMap((row) => row.records as readonly unknown[]);
  const datasetBytes = Buffer.from(
    `${records.map((entry) => canonicalFreshTeacherJson(entry)).join("\n")}\n`,
    "utf8",
  );
  await Promise.all([
    fs.promises.writeFile(fixture.paths.work, workBytes),
    fs.promises.writeFile(fixture.paths.dataset, datasetBytes),
  ]);
  const result = JSON.parse(
    await fs.promises.readFile(fixture.paths.result, "utf8"),
  ) as Record<string, unknown>;
  const [dataset, work] = await Promise.all([
    fileIdentity(fixture.paths.dataset, FRESH_SELECTION_TEACHER_DATASET_SCHEMA),
    fileIdentity(fixture.paths.work, SIBLING_TEACHER_WORK_SCHEMA),
  ]);
  const manifest = JSON.parse(
    await fs.promises.readFile(fixture.paths.manifest, "utf8"),
  ) as Record<string, unknown>;
  manifest.dataset = dataset;
  manifest.work = work;
  await fs.promises.writeFile(
    fixture.paths.manifest,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  result.dataset = dataset;
  result.work = work;
  result.manifest = await fileIdentity(
    fixture.paths.manifest,
    FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
  );
  await fs.promises.writeFile(
    fixture.paths.result,
    `${JSON.stringify(result, null, 2)}\n`,
  );
}

describe("fresh-selection semantic validation", () => {
  it("validates real generator artifacts read-only and emits the exact privacy-safe receipt", async () => {
    const fixture = await semanticFixture();
    const before = await Promise.all(
      [
        fixture.paths.source,
        fixture.paths.result,
        fixture.paths.manifest,
        fixture.paths.dataset,
        fixture.paths.work,
      ].map((file) => fs.promises.readFile(file)),
    );
    const beforeEntries = await fs.promises.readdir(fixture.paths.outputRoot);

    const receipt = await validateFreshSelectionSemanticArtifactsCoreForTests(
      fixture.dependencies,
      fixture.sourceIdentity,
    );

    expect(receipt).toEqual({
      schema: FRESH_SELECTION_SEMANTIC_VALIDATION_RECEIPT_SCHEMA,
      status: FRESH_SELECTION_SEMANTIC_VALIDATION_STATUS,
      run_fingerprint: sha256("fresh-selection-semantic-test-run"),
      generation_run_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      dataset: await fileIdentity(
        fixture.paths.dataset,
        FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
      ),
      work: await fileIdentity(fixture.paths.work, SIBLING_TEACHER_WORK_SCHEMA),
      completion_sha256: sha256(canonicalFreshTeacherJson(fixture.completion)),
      completed_parents: 1,
      emitted_parent_groups: 1,
      dataset_records: expect.any(Number),
      private_paths_emitted: false,
      labels_emitted: false,
      live_weight_changes: 0,
    });
    expect(receipt.completion_sha256).not.toBe(
      sha256(`${canonicalFreshTeacherJson(fixture.completion)}\n`),
    );
    expect(FRESH_SELECTION_SEMANTIC_VALIDATION_BOUNDARY).toBe(
      "fixed-source-policy-result-manifest-work-dataset-safe-snapshot-semantic-integrity-with-terminal-tracked-clean-closure-not-cross-file-lock-or-independent-run-or-generation-provenance",
    );
    const after = await Promise.all(
      [
        fixture.paths.source,
        fixture.paths.result,
        fixture.paths.manifest,
        fixture.paths.dataset,
        fixture.paths.work,
      ].map((file) => fs.promises.readFile(file)),
    );
    expect(after).toEqual(before);
    expect(await fs.promises.readdir(fixture.paths.outputRoot)).toEqual(
      beforeEntries,
    );

    let stdout = "";
    await expect(
      validateFreshSelectionTeacherCliCore([], {
        validate: async () => receipt,
        writeStdout: (text) => {
          stdout += text;
        },
      }),
    ).resolves.toBe(receipt);
    expect(stdout).toBe(`${canonicalFreshTeacherJson(receipt)}\n`);
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(stdout).not.toContain(fixture.home);
  }, 30_000);

  it("rejects a coherently rehashed work/dataset/result chain with invalid semantics", async () => {
    const fixture = await semanticFixture();
    await coherentlyExtendWorkAndDataset(fixture);

    await expect(
      validateFreshSelectionSemanticArtifactsCoreForTests(
        fixture.dependencies,
        fixture.sourceIdentity,
      ),
    ).rejects.toThrow(/fields are not exact/);
  }, 30_000);

  it("fails closed for an absent result, a dirty code gate, and unsafe private artifacts", async () => {
    const absentHome = await fs.promises.realpath(
      await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "fresh-selection-semantic-absent-"),
      ),
    );
    await expect(
      validateFreshSelectionSemanticArtifactsCoreForTests(
        {
          homeDirectory: () => absentHome,
          repositoryRoot: REPOSITORY_ROOT,
          effectiveUserId: process.geteuid?.() ?? 0,
          availableParallelism: 13,
          captureExactCleanRevision: async () => REVISION,
        },
        FRESH_SELECTION_TEACHER_SOURCE,
      ),
    ).rejects.toThrow(/result is absent/);

    const dirtyCode = await semanticFixture();
    await expect(
      validateFreshSelectionSemanticArtifactsCoreForTests(
        {
          ...dirtyCode.dependencies,
          captureExactCleanRevision: async () => {
            throw new Error("tracked tree is dirty");
          },
        },
        dirtyCode.sourceIdentity,
      ),
    ).rejects.toThrow(/tracked tree is dirty/);

    const terminalDrift = await semanticFixture();
    let revisionCaptures = 0;
    await expect(
      validateFreshSelectionSemanticArtifactsCoreForTests(
        {
          ...terminalDrift.dependencies,
          captureExactCleanRevision: async () => {
            revisionCaptures += 1;
            return revisionCaptures === 1 ? REVISION : "f".repeat(40);
          },
        },
        terminalDrift.sourceIdentity,
      ),
    ).rejects.toThrow(/tracked code or policy changed/);
    expect(revisionCaptures).toBe(2);

    const unsafe = await semanticFixture();
    await fs.promises.chmod(unsafe.paths.dataset, 0o644);
    await expect(
      validateFreshSelectionSemanticArtifactsCoreForTests(
        unsafe.dependencies,
        unsafe.sourceIdentity,
      ),
    ).rejects.toThrow(/bounded private single-link 0600/);

    const missingManifest = await semanticFixture();
    await fs.promises.rm(missingManifest.paths.manifest);
    await expect(
      validateFreshSelectionSemanticArtifactsCoreForTests(
        missingManifest.dependencies,
        missingManifest.sourceIdentity,
      ),
    ).rejects.toThrow(/ENOENT|no such file/i);
  }, 60_000);

  it("rejects every CLI argument before validation or output", async () => {
    const validate = vi.fn();
    const writeStdout = vi.fn();
    await expect(
      validateFreshSelectionTeacherCliCore(["--source", "/tmp/override"], {
        validate,
        writeStdout,
      }),
    ).rejects.toThrow(/no arguments or path overrides/);
    expect(validate).not.toHaveBeenCalled();
    expect(writeStdout).not.toHaveBeenCalled();
  });
});
