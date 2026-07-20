import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  canonicalFreshTeacherJson,
  readFreshTeacherPrivateArtifact,
  validateFreshTeacherArtifacts,
  validateFreshTeacherStoredCompletion,
  type FreshTeacherArtifactValidationRequest,
} from "../../../ml/floodgate-fresh-teacher-artifact-validation";
import {
  SIBLING_TEACHER_WORK_SCHEMA,
  STRENGTH_FIRST_PROPOSAL_INCOMPLETE_SKIP_REASON,
  freshSelectionSiblingTeacherRunFingerprintFromEvidence,
  siblingTeacherStagePaths,
  stageSiblingTeacherDatasetWithFreshTimeoutQuarantineCoreForTests,
} from "../../../ml/generate-sibling-teacher";
import { FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT } from "../../../ml/floodgate-role-bundle";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import {
  FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
  type FloodgateFreshSelectionRawIdentity,
} from "../../../ml/floodgate-training-row-validation";
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
} from "../../../ml/floodgate-training-row-consumer";
import { positionKeyFromSfen } from "../../../ml/sibling-data";
import {
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import { mateToCp } from "../../../ml/usi-multipv";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ENGINE = path.resolve(HERE, "../../fixtures/ml/fake-usi-engine.mjs");
const REVISION = "0123456789abcdef0123456789abcdef01234567";
const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const ONE_LEGAL =
  "1+R3l2l/4+Pgk2/1s2p1sp1/p3np2p/3B3N1/P1G3S2/1P2+pP2P/1R2+n4/L+b2K1GNL b GS2P5p 107";
const TWO_LEGAL =
  "ln4nn1/2r3gk1/3p2gp1/2s1R3S/p1p2P2p/3P2PL1/P+pSS1G1L1/1K7/LN6+b b G5Pb3p 119";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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
  );
  return receipt;
}

function sourceParents(): readonly Readonly<FloodgateTrainingParent>[] {
  return Object.freeze(
    [
      {
        schema_version: 1 as const,
        game_id: "game-complete",
        parent_id: "parent-complete",
        position_id: positionKeyFromSfen(START),
        parent_sfen: START,
        ply: 0,
        played_move: "7g7f",
      },
      {
        schema_version: 1 as const,
        game_id: "game-forced",
        parent_id: "parent-forced",
        position_id: positionKeyFromSfen(ONE_LEGAL),
        parent_sfen: ONE_LEGAL,
        ply: 106,
        played_move: "8h5h",
      },
    ]
      .sort((left, right) =>
        Buffer.compare(
          Buffer.from(left.parent_id),
          Buffer.from(right.parent_id),
        ),
      )
      .map((row) => Object.freeze(row)),
  );
}

function fallbackSourceParents(): readonly Readonly<FloodgateTrainingParent>[] {
  return Object.freeze([
    Object.freeze({
      schema_version: 1 as const,
      game_id: "game-fallback",
      parent_id: "parent-fallback",
      position_id: positionKeyFromSfen(TWO_LEGAL),
      parent_sfen: TWO_LEGAL,
      ply: 118,
      played_move: "8h7i",
    }),
  ]);
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
      raw_format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
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

interface GeneratedFixture {
  readonly request: Readonly<FreshTeacherArtifactValidationRequest>;
  readonly workRows: readonly Record<string, unknown>[];
}

async function generatedFixture(
  options: Readonly<{
    rows?: readonly Readonly<FloodgateTrainingParent>[];
    engineArgs?: readonly string[];
  }> = {},
): Promise<GeneratedFixture> {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "fresh-artifact-contract-"),
  );
  const rows = options.rows ?? sourceParents();
  const rawBytes = Buffer.from(
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  const stageRoot = path.join(root, "stage");
  const outcome =
    await stageSiblingTeacherDatasetWithFreshTimeoutQuarantineCoreForTests(
      authenticatedInput(rawBytes, rows),
      {
        stageRoot,
        runnerRevision: REVISION,
        engineBin: process.execPath,
        engineArgs: [FAKE_ENGINE, ...(options.engineArgs ?? [])],
        engineReceipt: await writeEngineReceipt(root),
        multipv: 2,
        proposalDepth: 6,
        depth: 8,
        engines: 2,
        hashMb: 64,
        timeoutMs: 5_000,
        proposalIncompleteAllLegalFallbackMaxMoves: 2,
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
    siblingTeacherStagePaths(stageRoot).work,
  );
  const workRows = workBytes
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const entries = workRows.slice(1);
  const completed = entries.filter((entry) => entry.kind === "parent");
  const forced = entries.filter((entry) => entry.kind === "skip");
  const records = completed.flatMap(
    (entry) => entry.records as readonly unknown[],
  );
  const emittedParentIds = completed.map((entry) => entry.parent_id as string);
  const forcedParentIds = forced.map((entry) => entry.parent_id as string);
  const fewerThanTwoParentIds = forced
    .filter((entry) => entry.reason === "fewer-than-two-legal-moves")
    .map((entry) => entry.parent_id as string);
  const timeoutParentIds = forced
    .filter((entry) => entry.reason === "search-timeout-no-label")
    .map((entry) => entry.parent_id as string);
  const datasetBytes = Buffer.from(
    records.length === 0
      ? ""
      : `${records.map((record) => canonicalFreshTeacherJson(record)).join("\n")}\n`,
  );
  return {
    request: Object.freeze({
      label: "test fresh teacher",
      inputGames: new Set(rows.map((row) => row.game_id)).size,
      inputParents: rows.length,
      sourceParentIdsSha256: floodgateIdentifierDigest(
        rows.map((row) => row.parent_id),
      ),
      datasetBytes,
      workBytes,
      sourceRows: rows,
      sourceRawSha256: sha256(rawBytes),
      expectedGenerationRunFingerprint: outcome.run_fingerprint,
      expectedRevision: REVISION,
      searchPolicy: Object.freeze({
        teacher: Object.freeze({
          proposal: Object.freeze({ multipv: 2, depth: 6 }),
          typed_incomplete_proposal_fallback: Object.freeze({
            allowed_only_when_legal_moves_at_most: 2,
          }),
          independent_rescore: Object.freeze({ depth: 8 }),
        }),
        runtime: Object.freeze({ timeout_ms_per_search: 5_000 }),
      }),
      completion: Object.freeze({
        input_games: new Set(rows.map((row) => row.game_id)).size,
        input_parents: rows.length,
        completed_parents: rows.length,
        forced_parents_skipped: forced.length,
        forced_skip_reasons: Object.freeze({
          fewer_than_two_legal_moves: fewerThanTwoParentIds.length,
          search_timeout_no_label: timeoutParentIds.length,
        }),
        parent_accounting: Object.freeze({
          parent_ids_sha256: floodgateIdentifierDigest(
            rows.map((row) => row.parent_id),
          ),
          forced_parent_ids_sha256: floodgateIdentifierDigest(forcedParentIds),
          emitted_parent_ids_sha256:
            floodgateIdentifierDigest(emittedParentIds),
          fewer_than_two_legal_moves_parent_ids_sha256:
            floodgateIdentifierDigest(fewerThanTwoParentIds),
          search_timeout_parent_ids_sha256:
            floodgateIdentifierDigest(timeoutParentIds),
        }),
        emitted_parent_groups: completed.length,
        dataset_records: records.length,
        sealed: true,
      }),
    }),
    workRows,
  };
}

function withWorkRows(
  request: Readonly<FreshTeacherArtifactValidationRequest>,
  workRows: readonly unknown[],
): Readonly<FreshTeacherArtifactValidationRequest> {
  return {
    ...request,
    workBytes: Buffer.from(
      `${workRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    ),
  };
}

function withDerivedDatasetAndWorkRows(
  request: Readonly<FreshTeacherArtifactValidationRequest>,
  workRows: readonly Record<string, unknown>[],
): Readonly<FreshTeacherArtifactValidationRequest> {
  const records = workRows
    .filter((row) => row.kind === "parent")
    .flatMap((row) => row.records as readonly unknown[]);
  return {
    ...withWorkRows(request, workRows),
    datasetBytes: Buffer.from(
      records.length === 0
        ? ""
        : `${records.map((record) => canonicalFreshTeacherJson(record)).join("\n")}\n`,
    ),
  };
}

function resealWorkEntry(entry: Record<string, unknown>): void {
  const payload = { ...entry };
  delete payload.payload_sha256;
  entry.payload_sha256 = sha256(canonicalFreshTeacherJson(payload));
}

function cloneWorkRows(
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return structuredClone(rows) as Record<string, unknown>[];
}

describe("fresh teacher shared artifact validation", () => {
  it("derives the fresh-selection generation fingerprint from complete independent evidence", async () => {
    const engineBytes = await fs.promises.readFile(process.execPath);
    const receiptBytes = Buffer.from(
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
    );
    const rows = Object.freeze(
      Array.from({ length: 4_800 }, (_, index) =>
        Object.freeze({
          schema_version: 1 as const,
          game_id: `game-${Math.floor(index / 24)
            .toString()
            .padStart(3, "0")}`,
          parent_id: `parent-${index.toString().padStart(4, "0")}`,
          position_id: `position-${index.toString().padStart(4, "0")}`,
          parent_sfen: START,
          ply: 0,
          played_move: "7g7f",
        }),
      ),
    );
    const sourceFor = (
      sourceRows: readonly Readonly<FloodgateTrainingParent>[],
    ): Readonly<FloodgateFreshSelectionRawIdentity> => {
      const games = new Set(sourceRows.map((row) => row.game_id));
      const parents = sourceRows.map((row) => row.parent_id);
      const positions = new Set(sourceRows.map((row) => row.position_id));
      return Object.freeze({
        bytes: 1,
        format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
        game_ids_sha256: floodgateIdentifierDigest(games),
        games: games.size,
        parent_ids_sha256: floodgateIdentifierDigest(parents),
        path: "fresh-selection.raw.jsonl",
        position_ids_count: positions.size,
        position_ids_sha256: floodgateIdentifierDigest(positions),
        records: sourceRows.length,
        sha256: sha256("fresh-selection-source"),
      });
    };
    const fingerprintFor = (
      sourceRows: readonly Readonly<FloodgateTrainingParent>[],
      source = sourceFor(sourceRows),
    ) =>
      freshSelectionSiblingTeacherRunFingerprintFromEvidence({
        source,
        sourceRows,
        pipeline: { source_revision: REVISION, tracked_tree_clean: true },
        engineBinSha256: sha256(engineBytes),
        engineBinBytes: engineBytes.byteLength,
        engineReceiptBytes: receiptBytes,
        evalSha256: sha256("eval"),
        multipv: 6,
        proposalDepth: 14,
        depth: 16,
        parallelEngines: 12,
        hashMbPerEngine: 512,
        timeoutMs: 600_000,
        proposalIncompleteAllLegalFallbackMaxMoves: 6,
      });

    const fingerprint = fingerprintFor(rows);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintFor(rows)).toBe(fingerprint);
    const changedRows = [...rows];
    changedRows[changedRows.length - 1] = {
      ...changedRows.at(-1)!,
      parent_id: "parent-9999",
    };
    expect(fingerprintFor(changedRows)).not.toBe(fingerprint);
    expect(() => fingerprintFor(changedRows, sourceFor(rows))).toThrow(
      /parent IDs are invalid/,
    );
    const duplicateRows = [...rows];
    duplicateRows[1] = duplicateRows[0];
    expect(() => fingerprintFor(duplicateRows, sourceFor(rows))).toThrow(
      /parent IDs are invalid/,
    );
  });

  it("accepts a real generator work artifact and its exact derived dataset", async () => {
    const fixture = await generatedFixture();

    expect(validateFreshTeacherArtifacts(fixture.request)).toMatchObject({
      completedEntries: 1,
      forcedEntries: 1,
      timeoutEntries: 0,
    });
  }, 15_000);

  it("rejects header drift, parent order, duplicate coverage, and dataset drift", async () => {
    const fixture = await generatedFixture();
    const headerDrift = cloneWorkRows(fixture.workRows);
    headerDrift[0].source_raw_sha256 = sha256("wrong-source");
    expect(() =>
      validateFreshTeacherArtifacts(withWorkRows(fixture.request, headerDrift)),
    ).toThrow(/header does not match/);

    const reordered = cloneWorkRows(fixture.workRows);
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    expect(() =>
      validateFreshTeacherArtifacts(withWorkRows(fixture.request, reordered)),
    ).toThrow(/order or coverage/);

    const duplicate = cloneWorkRows(fixture.workRows);
    duplicate[2] = structuredClone(duplicate[1]);
    expect(() =>
      validateFreshTeacherArtifacts(withWorkRows(fixture.request, duplicate)),
    ).toThrow();

    expect(() =>
      validateFreshTeacherArtifacts({
        ...fixture.request,
        datasetBytes: Buffer.concat([
          Buffer.from(fixture.request.datasetBytes),
          Buffer.from("\n"),
        ]),
      }),
    ).toThrow(/dataset does not exactly match/);
  }, 15_000);

  it("rejects resealed unknown fields throughout nested work evidence", async () => {
    const fixture = await generatedFixture();
    const completedIndex = fixture.workRows.findIndex(
      (row) => row.kind === "parent",
    );
    const mutations: readonly ((entry: Record<string, unknown>) => void)[] = [
      (entry) => {
        (entry.initial_search as Record<string, unknown>).unknown = true;
      },
      (entry) => {
        (
          (entry.initial_search as Record<string, unknown>)
            .requested_limit as Record<string, unknown>
        ).unknown = true;
      },
      (entry) => {
        (
          (entry.initial_search as Record<string, unknown>).scores as Record<
            string,
            unknown
          >[]
        )[0].unknown = true;
      },
      (entry) => {
        (entry.exact_search as Record<string, unknown>).unknown = true;
      },
      (entry) => {
        (
          (entry.exact_search as Record<string, unknown>).searches as Record<
            string,
            unknown
          >[]
        )[0].unknown = true;
      },
      (entry) => {
        (
          (entry.exact_search as Record<string, unknown>).scores as Record<
            string,
            unknown
          >[]
        )[0].unknown = true;
      },
      (entry) => {
        (entry.records as Record<string, unknown>[])[0].unknown = true;
      },
    ];

    for (const mutate of mutations) {
      const rows = cloneWorkRows(fixture.workRows);
      const entry = rows[completedIndex];
      mutate(entry);
      resealWorkEntry(entry);
      expect(() =>
        validateFreshTeacherArtifacts(withWorkRows(fixture.request, rows)),
      ).toThrow(/fields are not exact|exact search limit/);
    }
  }, 15_000);

  it("validates real all-legal fallback evidence and rejects resealed nested extensions", async () => {
    const fixture = await generatedFixture({
      rows: fallbackSourceParents(),
      engineArgs: ["--incomplete-proposal"],
    });
    expect(validateFreshTeacherArtifacts(fixture.request)).toMatchObject({
      completedEntries: 1,
      forcedEntries: 0,
    });
    const completedIndex = fixture.workRows.findIndex(
      (row) => row.kind === "parent",
    );
    expect(fixture.workRows[completedIndex].proposal_fallback).toBeDefined();
    const mutations: readonly ((fallback: Record<string, unknown>) => void)[] =
      [
        (fallback) => {
          (fallback.trigger as Record<string, unknown>).unknown = true;
        },
        (fallback) => {
          (fallback.searches as Record<string, unknown>[])[0].unknown = true;
        },
        (fallback) => {
          (
            (fallback.searches as Record<string, unknown>[])[0]
              .requested_limit as Record<string, unknown>
          ).unknown = true;
        },
      ];
    for (const mutate of mutations) {
      const rows = cloneWorkRows(fixture.workRows);
      const entry = rows[completedIndex];
      mutate(entry.proposal_fallback as Record<string, unknown>);
      resealWorkEntry(entry);
      expect(() =>
        validateFreshTeacherArtifacts(withWorkRows(fixture.request, rows)),
      ).toThrow(/fields are not exact|exact search limit/);
    }
  }, 15_000);

  it("accepts exact mate variants but rejects resealed extra mate fields", async () => {
    const fixture = await generatedFixture();
    const completedIndex = fixture.workRows.findIndex(
      (row) => row.kind === "parent",
    );
    const mateRows = cloneWorkRows(fixture.workRows);
    const entry = mateRows[completedIndex];
    const initial = entry.initial_search as Record<string, unknown>;
    const initialScore = (initial.scores as Record<string, unknown>[])[0];
    Object.assign(initialScore, {
      cp: mateToCp(1, 1),
      score_kind: "mate",
      mate: 1,
      mate_sign: 1,
    });
    resealWorkEntry(entry);
    expect(() =>
      validateFreshTeacherArtifacts(withWorkRows(fixture.request, mateRows)),
    ).not.toThrow();

    initialScore.unknown = true;
    resealWorkEntry(entry);
    expect(() =>
      validateFreshTeacherArtifacts(withWorkRows(fixture.request, mateRows)),
    ).toThrow(/fields are not exact/);

    const exactMateRows = cloneWorkRows(fixture.workRows);
    const exactEntry = exactMateRows[completedIndex];
    const exact = exactEntry.exact_search as Record<string, unknown>;
    const rankedScore = (exact.scores as Record<string, unknown>[])[0];
    const rankedMove = rankedScore.move;
    const singleSearch = (exact.searches as Record<string, unknown>[]).find(
      (search) =>
        (search.scores as Record<string, unknown>[])[0].move === rankedMove,
    );
    expect(singleSearch).toBeDefined();
    const singleScore = (singleSearch!.scores as Record<string, unknown>[])[0];
    for (const score of [rankedScore, singleScore]) {
      Object.assign(score, {
        cp: mateToCp(1, 1),
        score_kind: "mate",
        mate: 1,
        mate_sign: 1,
      });
    }
    const record = (exactEntry.records as Record<string, unknown>[]).find(
      (candidate) => candidate.move === rankedMove,
    );
    expect(record).toBeDefined();
    Object.assign(record!, {
      cp: -mateToCp(1, 1),
      teacher_child_cp: -mateToCp(1, 1),
      teacher_parent_cp: mateToCp(1, 1),
      teacher_score_kind: "mate",
      teacher_mate: 1,
      teacher_mate_sign: 1,
    });
    resealWorkEntry(exactEntry);
    const exactMateRequest = withDerivedDatasetAndWorkRows(
      fixture.request,
      exactMateRows,
    );
    expect(() => validateFreshTeacherArtifacts(exactMateRequest)).not.toThrow();

    record!.unknown = true;
    resealWorkEntry(exactEntry);
    expect(() =>
      validateFreshTeacherArtifacts(
        withDerivedDatasetAndWorkRows(fixture.request, exactMateRows),
      ),
    ).toThrow(/fields are not exact/);
  }, 15_000);

  it("rejects a resealed proposal-incomplete skip and recomputed completion digest drift", async () => {
    const fixture = await generatedFixture();
    const rows = cloneWorkRows(fixture.workRows);
    const completedIndex = rows.findIndex((row) => row.kind === "parent");
    const original = rows[completedIndex];
    const incomplete: Record<string, unknown> = {
      schema: SIBLING_TEACHER_WORK_SCHEMA,
      kind: "skip",
      run_fingerprint: original.run_fingerprint,
      payload_sha256: "",
      parent_id: original.parent_id,
      reason: STRENGTH_FIRST_PROPOSAL_INCOMPLETE_SKIP_REASON,
      legal_moves: 30,
      incomplete: {
        phase: "proposal",
        requested_multipv: 2,
        requested_limit: { depth: 6 },
        final_exact_ranks: 1,
        final_cp_ranks: 1,
        final_mate_ranks: 0,
        missing_or_non_exact_ranks: 1,
      },
    };
    resealWorkEntry(incomplete);
    rows[completedIndex] = incomplete;
    expect(() =>
      validateFreshTeacherArtifacts(withWorkRows(fixture.request, rows)),
    ).toThrow(/forbidden proposal-incomplete/);

    const completion = structuredClone(fixture.request.completion) as Record<
      string,
      unknown
    >;
    (
      completion.parent_accounting as Record<string, unknown>
    ).emitted_parent_ids_sha256 = sha256("resealed-but-wrong");
    expect(() =>
      validateFreshTeacherArtifacts({ ...fixture.request, completion }),
    ).toThrow(/work and completion accounting drifted/);
  }, 15_000);

  it("rejects a resealed timeout metadata extension and enforces the exact 4,800-parent cap", async () => {
    const fixture = await generatedFixture();
    const rows = cloneWorkRows(fixture.workRows);
    const completedIndex = rows.findIndex((row) => row.kind === "parent");
    const original = rows[completedIndex];
    const parent = fixture.request.sourceRows.find(
      (row) => row.parent_id === original.parent_id,
    );
    expect(parent).toBeDefined();
    const legalMoves = rulesCompleteLegalMoves(
      positionFromSfen(parent!.parent_sfen).position,
    );
    const timeout: Record<string, unknown> = {
      schema: SIBLING_TEACHER_WORK_SCHEMA,
      kind: "skip",
      run_fingerprint: original.run_fingerprint,
      payload_sha256: "",
      parent_id: original.parent_id,
      reason: "search-timeout-no-label",
      legal_moves: legalMoves.length,
      timeout: {
        phase: "proposal",
        requested_multipv: Math.min(2, legalMoves.length),
        requested_limit: { depth: 6 },
        searchmoves: [],
        timeout_ms: 5_000,
        unknown: true,
      },
    };
    resealWorkEntry(timeout);
    rows[completedIndex] = timeout;
    expect(() =>
      validateFreshTeacherArtifacts(withWorkRows(fixture.request, rows)),
    ).toThrow(/timeout metadata has extra fields/);

    const completion = (timeouts: number) => ({
      input_games: 200,
      input_parents: 4_800,
      completed_parents: 4_800,
      forced_parents_skipped: timeouts,
      forced_skip_reasons: {
        fewer_than_two_legal_moves: 0,
        search_timeout_no_label: timeouts,
      },
      parent_accounting: {
        parent_ids_sha256: sha256("parents"),
        forced_parent_ids_sha256: sha256("forced"),
        emitted_parent_ids_sha256: sha256("emitted"),
        fewer_than_two_legal_moves_parent_ids_sha256: sha256("none"),
        search_timeout_parent_ids_sha256: sha256("timeouts"),
      },
      emitted_parent_groups: 4_800 - timeouts,
      dataset_records: 2 * (4_800 - timeouts),
      sealed: true,
    });
    expect(() =>
      validateFreshTeacherStoredCompletion(completion(5), {
        label: "timeout boundary",
        inputGames: 200,
        inputParents: 4_800,
        sourceParentIdsSha256: sha256("parents"),
      }),
    ).not.toThrow();
    expect(() =>
      validateFreshTeacherStoredCompletion(completion(6), {
        label: "timeout boundary",
        inputGames: 200,
        inputParents: 4_800,
        sourceParentIdsSha256: sha256("parents"),
      }),
    ).toThrow(/stored completion is invalid/);
  }, 15_000);

  it("rejects shuffled source parents and a source game-count lie", async () => {
    const fixture = await generatedFixture();
    expect(() =>
      validateFreshTeacherArtifacts({
        ...fixture.request,
        sourceRows: [...fixture.request.sourceRows].reverse(),
      }),
    ).toThrow(/source parent identity is invalid/);
    expect(() =>
      validateFreshTeacherArtifacts({
        ...fixture.request,
        sourceRows: fixture.request.sourceRows.map((row) => ({
          ...row,
          game_id: "one-game-only",
        })),
      }),
    ).toThrow(/source parent identity is invalid/);
  }, 15_000);

  it("reads only canonical private single-link regular files inside the artifact root", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "fresh-private-read-"),
    );
    const file = path.join(root, "artifact.json");
    await fs.promises.writeFile(file, "{}\n", { mode: 0o600 });
    const uid = process.geteuid?.() ?? 0;
    await expect(
      readFreshTeacherPrivateArtifact(
        file,
        root,
        uid,
        "schema-v1",
        "private",
        "test",
      ),
    ).resolves.toMatchObject({ identity: { path: "private/artifact.json" } });
    await expect(
      readFreshTeacherPrivateArtifact(
        file,
        root,
        uid + 1,
        "schema-v1",
        "private",
        "test",
      ),
    ).rejects.toThrow(/private single-link 0600/);
    await expect(
      readFreshTeacherPrivateArtifact(
        path
          .join(root, ".", "artifact.json")
          .replace("/artifact.json", "/./artifact.json"),
        root,
        uid,
        "schema-v1",
        "private",
        "test",
      ),
    ).rejects.toThrow(/outside its root/);

    await fs.promises.chmod(file, 0o644);
    await expect(
      readFreshTeacherPrivateArtifact(
        file,
        root,
        uid,
        "schema-v1",
        "private",
        "test",
      ),
    ).rejects.toThrow(/private single-link 0600/);
    await fs.promises.chmod(file, 0o600);

    const hardlink = path.join(root, "hardlink.json");
    await fs.promises.link(file, hardlink);
    await expect(
      readFreshTeacherPrivateArtifact(
        file,
        root,
        uid,
        "schema-v1",
        "private",
        "test",
      ),
    ).rejects.toThrow(/private single-link 0600/);
    await fs.promises.unlink(hardlink);

    const symlink = path.join(root, "symlink.json");
    await fs.promises.symlink(file, symlink);
    await expect(
      readFreshTeacherPrivateArtifact(
        symlink,
        root,
        uid,
        "schema-v1",
        "private",
        "test",
      ),
    ).rejects.toThrow(/path is not canonical|private single-link/);

    const outside = path.join(
      path.dirname(root),
      `${path.basename(root)}-outside.json`,
    );
    await fs.promises.writeFile(outside, "{}\n", { mode: 0o600 });
    await expect(
      readFreshTeacherPrivateArtifact(
        outside,
        root,
        uid,
        "schema-v1",
        "private",
        "test",
      ),
    ).rejects.toThrow(/outside its root/);
    await expect(
      readFreshTeacherPrivateArtifact(
        root,
        root,
        uid,
        "schema-v1",
        "private",
        "test",
      ),
    ).rejects.toThrow(/private single-link 0600/);
  });
});
