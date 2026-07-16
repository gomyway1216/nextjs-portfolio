import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
} from "../../../ml/floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
} from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
  type FloodgateProductionTeacherRescoreResult,
} from "../../../ml/floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
} from "../../../ml/floodgate-stable-wasm-proposer";
import {
  FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
  FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
  buildFloodgateV7CandidateUnionCoreForTests,
} from "../../../ml/floodgate-v7-candidate-union";
import {
  buildFloodgateV7CompletedParentCoreForTests,
  type FloodgateV7CompletedParentEvidence,
  type FloodgateV7CompletedParentInput,
} from "../../../ml/floodgate-v7-completed-parent";
import {
  buildFloodgateV7CheckpointScanLoadCompletedParentCoreForTests,
  generateFloodgateV7CheckpointScanLoadParentsCoreForTests,
} from "../../../ml/floodgate-v7-checkpoint-scan-load";
import {
  projectFloodgateV7CompletedParentEvidenceToTrainingLabels,
  type FloodgateV7TrainingLabelRow,
  type FloodgateV7TrainingLabelProjection,
} from "../../../ml/floodgate-v7-training-label-projection";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import {
  buildSiblingGroup,
  compareBytewise,
  positionKeyFromSfen,
  validateParentGroups,
  type SiblingCandidateInput,
  type SiblingRecord,
} from "../../../ml/sibling-data";
import { mateToCp } from "../../../ml/usi-multipv";

const FORCED_SFEN = "4k4/2B6/3GRG3/9/9/9/9/9/K8 w - 1";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(compareBytewise);
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function fourteenCandidateInput(): FloodgateV7CompletedParentInput {
  const generated = generateFloodgateV7CheckpointScanLoadParentsCoreForTests(1);
  const parent = generated[0];
  if (parent === undefined) throw new Error("missing scan-load parent fixture");
  return structuredClone(
    buildFloodgateV7CheckpointScanLoadCompletedParentCoreForTests(parent),
  );
}

function fourteenCandidateEvidence(
  mutate?: (input: FloodgateV7CompletedParentInput) => void,
): Readonly<FloodgateV7CompletedParentEvidence> {
  const input = fourteenCandidateInput();
  mutate?.(input);
  return buildFloodgateV7CompletedParentCoreForTests(input);
}

function teacherRuntimeReceipt(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-assets-and-runtime-dependencies",
    asset_authority_execution_boundary:
      "production-fixed-registry-and-deployment-root",
    engine_id: FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
    runtime: {
      engine_count: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines,
      threads_per_engine:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.threads_per_engine,
      hash_mb_per_engine:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.hash_mb_per_engine,
      fv_scale: 20,
      depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
      proposal_multipv_max:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.multipv,
      independent_rescore_multipv:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.multipv,
      no_process_arguments: true,
      shell: false,
      minimal_environment: true,
      per_worker_private_directories: true,
      queue_bound: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines * 4,
    },
    fixed_options: [
      "EvalDir=<private-shared-snapshot>/eval",
      "FV_SCALE=20",
      "USI_Hash=64",
      "Threads=1",
      "USI_OwnBook=false",
      "BookFile=no_book",
      "NetworkDelay=0",
      "NetworkDelay2=0",
    ],
    timeouts: {
      usiMs: 15_000,
      readyMs: 120_000,
      searchMs: 600_000,
      termGraceMs: 500,
      killGraceMs: 1_000,
    },
    limits: {
      lineBytes: 64 * 1024,
      stdoutBytesPerPhase: 16 * 1024 * 1024,
      stdoutLinesPerPhase: 65_536,
      stderrBytesTotal: 8 * 1024 * 1024,
    },
    snapshot: {
      one_shared_private_snapshot: true,
      source_authority_revalidated: true,
      destination_revalidated: true,
      engine: {
        ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou,
        mode: "0500",
      },
      eval: {
        ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn,
        mode: "0400",
      },
    },
  });
}

function cpRescore(
  move: string,
  index: number,
): Readonly<FloodgateProductionTeacherRescoreResult> {
  return {
    depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.depth,
    lines: [
      {
        depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.depth,
        multipv: 1,
        cp: index,
        nodes: 100 + index,
        move,
        pv: [move],
        scoreKind: "cp",
      },
    ],
    bestmove: move,
    observedNodes: 100 + index,
    requested_multipv: 1,
    searchmoves: [move],
    reset_before_search: true,
  };
}

function multiProvenanceEvidence(): Readonly<FloodgateV7CompletedParentEvidence> {
  const generated = generateFloodgateV7CheckpointScanLoadParentsCoreForTests(1);
  const fixture = generated[0];
  if (fixture === undefined) throw new Error("missing provenance fixture");
  const legal = rulesCompleteLegalMoves(
    positionFromSfen(fixture.parent.parent_sfen).position,
  ).map((entry) => entry.usi);
  const sharedMove = legal[0];
  if (sharedMove === undefined) throw new Error("missing legal move fixture");
  const parent = { ...fixture.parent, played_move: sharedMove };
  const childSfen = childSfenAfterUsi(parent.parent_sfen, sharedMove);
  const stable = {
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: sha256(
      `shogi-floodgate-stable-parent-v1\0${canonicalJson(parent)}`,
    ),
    stable_move: sharedMove,
    child_sfen: childSfen,
    child_position_id: positionKeyFromSfen(childSfen),
    search: {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      termination: "requested-depth-complete" as const,
      raw_search_score: 17,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: 100,
      leaves: 50,
      root_tesu: parent.ply,
    },
  } as const;
  const requested = Math.min(
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.multipv,
    legal.length,
  );
  const proposalMoves = legal.slice(0, requested);
  const union = buildFloodgateV7CandidateUnionCoreForTests({
    parent,
    legal: {
      source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
      parent_sfen: parent.parent_sfen,
      count: legal.length,
      moves: legal,
    },
    stable,
    runtime: {
      receipt: teacherRuntimeReceipt() as never,
      proposal: {
        depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
        lines: proposalMoves.map((move, index) => ({
          depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
          multipv: index + 1,
          cp: index,
          nodes: 10 + index,
          move,
          pv: [move],
          scoreKind: "cp" as const,
        })),
        bestmove: sharedMove,
        observedNodes: 9 + requested,
        requested_multipv: requested,
        legal_move_count_evidence: {
          source:
            "caller-supplied-until-authenticated-by-v7-coordinator" as const,
          count: legal.length,
        },
        reset_before_search: true,
      },
    },
  });
  const input: FloodgateV7CompletedParentInput = {
    union,
    stable_runtime: {
      schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
      row: stable,
      runtime_binding: {
        claim_boundary:
          FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
        execution_boundary:
          "production-fixed-asset-authority-and-reusable-pool",
        runtime_receipt_sha256: "c".repeat(64),
        reusable_pool_receipt_sha256: "d".repeat(64),
        parent_payload_sha256: stable.parent_payload_sha256,
        row_sha256: sha256(
          `shogi-floodgate-production-stable-runtime-row-v1\0${canonicalJson(
            stable,
          )}`,
        ),
        origin: "direct-owning-runtime-capability-call-v1",
        plain_result_authentication_claim: false,
      },
    },
    rescores: union.candidates.map((candidate, index) =>
      cpRescore(candidate.move, index),
    ),
  };
  return buildFloodgateV7CompletedParentCoreForTests(input);
}

function forcedEvidence(): Readonly<FloodgateV7CompletedParentEvidence> {
  const gameId = `sha256:${sha256("training-label-forced-game")}`;
  const parent = {
    schema_version: 1 as const,
    game_id: gameId,
    parent_id: `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${0}`)}`,
    position_id: positionKeyFromSfen(FORCED_SFEN),
    parent_sfen: FORCED_SFEN,
    ply: 0,
    played_move: "5a4a",
  };
  const childSfen = childSfenAfterUsi(FORCED_SFEN, parent.played_move);
  const stable = {
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: sha256(
      `shogi-floodgate-stable-parent-v1\0${canonicalJson(parent)}`,
    ),
    stable_move: parent.played_move,
    child_sfen: childSfen,
    child_position_id: positionKeyFromSfen(childSfen),
    search: {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH as 11,
      completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH as 11,
      termination: "requested-depth-complete" as const,
      raw_search_score: 17,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: 100,
      leaves: 50,
      root_tesu: 0,
    },
  };
  const union = buildFloodgateV7CandidateUnionCoreForTests({
    parent,
    legal: {
      source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
      parent_sfen: FORCED_SFEN,
      count: 1,
      moves: [parent.played_move],
    },
    stable,
    runtime: null,
  });
  return buildFloodgateV7CompletedParentCoreForTests({
    union,
    stable_runtime: {
      schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
      row: stable,
      runtime_binding: {
        claim_boundary:
          FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
        execution_boundary:
          "production-fixed-asset-authority-and-reusable-pool",
        runtime_receipt_sha256: "c".repeat(64),
        reusable_pool_receipt_sha256: "d".repeat(64),
        parent_payload_sha256: stable.parent_payload_sha256,
        row_sha256: sha256(
          `shogi-floodgate-production-stable-runtime-row-v1\0${canonicalJson(
            stable,
          )}`,
        ),
        origin: "direct-owning-runtime-capability-call-v1",
        plain_result_authentication_claim: false,
      },
    },
    rescores: [],
  });
}

function sources(
  candidate: Readonly<
    FloodgateV7CompletedParentEvidence["candidate_union"]["candidates"][number]
  >,
): string[] {
  return [
    ...(candidate.provenance.strong_game_played ? ["played"] : []),
    ...(candidate.provenance.production_proposal ? ["teacher"] : []),
    ...(candidate.provenance.stable_policy ? ["stable"] : []),
  ];
}

function expectedRows(
  evidence: Readonly<FloodgateV7CompletedParentEvidence>,
): readonly Readonly<SiblingRecord>[] {
  if (evidence.completion.state === "forced-parent-skip") return [];
  const candidatesByMove = new Map(
    evidence.candidate_union.candidates.map((candidate) => [
      candidate.move,
      candidate,
    ]),
  );
  const ranked = [...evidence.rescores].sort(
    (left, right) =>
      right.score.cp - left.score.cp || compareBytewise(left.move, right.move),
  );
  const candidateInputs: SiblingCandidateInput[] = ranked.map(
    (rescore, index) => {
      const candidate = candidatesByMove.get(rescore.move);
      if (candidate === undefined) throw new Error("missing candidate fixture");
      return {
        move: rescore.move,
        child_sfen: rescore.child_sfen,
        sources: sources(candidate),
        teacher_parent_cp: rescore.score.cp,
        teacher_rank: index + 1,
        teacher_score_kind: rescore.score.kind,
        ...(rescore.score.kind === "mate"
          ? {
              teacher_mate:
                rescore.score.mate_sign * rescore.score.mate_distance,
              teacher_mate_sign: rescore.score.mate_sign,
            }
          : {}),
      };
    },
  );
  return buildSiblingGroup(
    {
      game_id: evidence.parent.game_id,
      parent_id: evidence.parent.parent_id,
      position_id: evidence.parent.position_id,
      parent_sfen: evidence.parent.parent_sfen,
      parent_ply: evidence.parent.ply,
    },
    candidateInputs,
  ).map((row) => ({ ...row, split: "train" as const }));
}

function rows(
  projection: Readonly<FloodgateV7TrainingLabelProjection>,
): readonly FloodgateV7TrainingLabelRow[] {
  return projection.rows;
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child, seen);
}

describe("Floodgate v7 deterministic training-label projection", () => {
  it("projects a 14-candidate completed parent into canonical ranked training rows", () => {
    const evidence = fourteenCandidateEvidence();
    const projection =
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(evidence);
    const projectedRows = rows(projection);

    expect(evidence.completion).toMatchObject({
      candidates: 14,
      independent_rescores_completed: 14,
      teacher_labels_emitted: 0,
    });
    expect(projection.labels).toEqual({
      records: 14,
      teacher_labels_emitted: 14,
      rank: "teacher-parent-cp-descending-then-utf8-move-bytewise",
      child_score: "negated-parent-perspective-cp",
      split: "train",
    });
    expect(projectedRows).toHaveLength(14);
    expect(projectedRows).toEqual(expectedRows(evidence));
    expect(projectedRows.map((row) => row.teacher_rank)).toEqual(
      Array.from({ length: 14 }, (_value, index) => index + 1),
    );
    expect(projectedRows.every((row) => row.split === "train")).toBe(true);
    for (const row of projectedRows) {
      expect(row.cp).toBe(row.teacher_child_cp);
      expect(row.teacher_child_cp).toBe(
        row.teacher_parent_cp === 0 ? 0 : -row.teacher_parent_cp,
      );
      expect(row.child_position_id).toBe(positionKeyFromSfen(row.child_sfen));
      expect(row.sfen).toBe(row.child_sfen);
      expect(row.ply).toBe(row.parent_ply + 1);
    }
    expect(
      validateParentGroups(
        projectedRows.map((row) => ({
          ...row,
          sources: [...row.sources],
        })),
      ),
    ).toEqual([
      expect.objectContaining({
        parent_id: evidence.parent.parent_id,
        records: 14,
        split: "train",
      }),
    ]);
    expectDeepFrozen(projection);

    const mergedEvidence = multiProvenanceEvidence();
    const mergedCandidate = mergedEvidence.candidate_union.candidates.find(
      (candidate) =>
        candidate.provenance.strong_game_played &&
        candidate.provenance.production_proposal &&
        candidate.provenance.stable_policy,
    );
    expect(mergedCandidate).toBeDefined();
    const mergedRow = rows(
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(mergedEvidence),
    ).find((row) => row.move === mergedCandidate?.move);
    expect(mergedRow?.sources).toEqual(["played", "teacher", "stable"]);
    expect(Object.isFrozen(mergedRow?.sources)).toBe(true);
  });

  it("breaks equal teacher scores only by UTF-8 move order", () => {
    const evidence = fourteenCandidateEvidence((input) => {
      const rescores = input.rescores as Array<
        FloodgateV7CompletedParentInput["rescores"][number]
      >;
      const first = structuredClone(rescores[0]);
      const second = structuredClone(rescores[1]);
      if (first === undefined || second === undefined) {
        throw new Error("missing tie fixtures");
      }
      (first.lines[0] as { cp: number }).cp = 77;
      (second.lines[0] as { cp: number }).cp = 77;
      rescores[0] = first;
      rescores[1] = second;
    });
    const tiedMoves = evidence.rescores
      .filter((rescore) => rescore.score.cp === 77)
      .map((rescore) => rescore.move)
      .sort(compareBytewise);
    const projected = rows(
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(evidence),
    );

    expect(projected.slice(0, 2).map((row) => row.move)).toEqual(tiedMoves);
    expect(projected.slice(0, 2).map((row) => row.teacher_rank)).toEqual([
      1, 2,
    ]);
  });

  it("preserves mate kind, distance, sign, mapped parent cp, and child sign", () => {
    const evidence = fourteenCandidateEvidence((input) => {
      const rescores = input.rescores as Array<
        FloodgateV7CompletedParentInput["rescores"][number]
      >;
      const original = rescores[0];
      if (original === undefined) throw new Error("missing mate fixture");
      const move = original.bestmove;
      rescores[0] = {
        depth: 8,
        lines: [
          {
            depth: 8,
            multipv: 1,
            cp: mateToCp(5, 1),
            nodes: 77,
            move,
            pv: [move],
            scoreKind: "mate",
            mate: 5,
            mateSign: 1,
          },
        ],
        bestmove: move,
        observedNodes: 77,
        requested_multipv: 1,
        searchmoves: [move],
        reset_before_search: true,
      };
    });
    const projected = rows(
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(evidence),
    );
    const mate = projected.find((row) => row.teacher_score_kind === "mate");

    expect(mate).toMatchObject({
      teacher_rank: 1,
      teacher_parent_cp: mateToCp(5, 1),
      teacher_child_cp: -mateToCp(5, 1),
      cp: -mateToCp(5, 1),
      teacher_score_kind: "mate",
      teacher_mate: 5,
      teacher_mate_sign: 1,
      split: "train",
    });

    const negativeZeroEvidence = fourteenCandidateEvidence((input) => {
      const rescores = input.rescores as Array<
        FloodgateV7CompletedParentInput["rescores"][number]
      >;
      const original = rescores[0];
      if (original === undefined) {
        throw new Error("missing negative-zero mate fixture");
      }
      const move = original.bestmove;
      rescores[0] = {
        depth: 8,
        lines: [
          {
            depth: 8,
            multipv: 1,
            cp: mateToCp(-0, -1),
            nodes: 78,
            move,
            pv: [move],
            scoreKind: "mate",
            mate: -0,
            mateSign: -1,
          },
        ],
        bestmove: move,
        observedNodes: 78,
        requested_multipv: 1,
        searchmoves: [move],
        reset_before_search: true,
      };
    });
    const negativeZeroMate = rows(
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(
        negativeZeroEvidence,
      ),
    ).find((row) => row.teacher_score_kind === "mate");
    expect(negativeZeroMate).toMatchObject({
      teacher_parent_cp: mateToCp(-0, -1),
      teacher_child_cp: -mateToCp(-0, -1),
      teacher_score_kind: "mate",
      teacher_mate: 0,
      teacher_mate_sign: -1,
    });
    expect(Object.is(negativeZeroMate?.teacher_mate, -0)).toBe(false);

    const negativeMateEvidence = fourteenCandidateEvidence((input) => {
      const rescores = input.rescores as Array<
        FloodgateV7CompletedParentInput["rescores"][number]
      >;
      const original = rescores[0];
      if (original === undefined) {
        throw new Error("missing negative-mate fixture");
      }
      const move = original.bestmove;
      rescores[0] = {
        depth: 8,
        lines: [
          {
            depth: 8,
            multipv: 1,
            cp: mateToCp(-7, -1),
            nodes: 79,
            move,
            pv: [move],
            scoreKind: "mate",
            mate: -7,
            mateSign: -1,
          },
        ],
        bestmove: move,
        observedNodes: 79,
        requested_multipv: 1,
        searchmoves: [move],
        reset_before_search: true,
      };
    });
    const negativeMate = rows(
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(
        negativeMateEvidence,
      ),
    ).find((row) => row.teacher_score_kind === "mate");
    expect(negativeMate).toMatchObject({
      teacher_parent_cp: mateToCp(-7, -1),
      teacher_child_cp: -mateToCp(-7, -1),
      cp: -mateToCp(-7, -1),
      teacher_score_kind: "mate",
      teacher_mate: -7,
      teacher_mate_sign: -1,
      split: "train",
    });
  });

  it("emits no row for a forced parent", () => {
    const evidence = forcedEvidence();
    const projection =
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(evidence);

    expect(evidence.completion).toEqual({
      state: "forced-parent-skip",
      candidates: 0,
      independent_rescores_required: 0,
      independent_rescores_completed: 0,
      teacher_labels_emitted: 0,
    });
    expect(rows(projection)).toEqual([]);
    expect(projection.labels).toMatchObject({
      records: 0,
      teacher_labels_emitted: 0,
      split: "train",
    });
    expectDeepFrozen(projection);
  });

  it("accepts a valid clone, rejects tamper and Proxy without traps, and enforces arity", () => {
    const evidence = fourteenCandidateEvidence();
    const clone = structuredClone(evidence);
    expect(
      rows(projectFloodgateV7CompletedParentEvidenceToTrainingLabels(clone)),
    ).toEqual(
      rows(projectFloodgateV7CompletedParentEvidenceToTrainingLabels(evidence)),
    );

    const tampered = structuredClone(evidence) as unknown as Record<
      string,
      unknown
    >;
    const rescores = tampered.rescores as Array<Record<string, unknown>>;
    const score = rescores[0]?.score as Record<string, unknown> | undefined;
    if (score === undefined) throw new Error("missing tamper fixture");
    score.cp = 123_456;
    expect(() =>
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(
        tampered as never,
      ),
    ).toThrow();

    let traps = 0;
    const hostile = new Proxy(evidence, {
      get() {
        traps += 1;
        throw new Error("Proxy trap must not run");
      },
      getOwnPropertyDescriptor() {
        traps += 1;
        throw new Error("Proxy trap must not run");
      },
      ownKeys() {
        traps += 1;
        throw new Error("Proxy trap must not run");
      },
    });
    expect(() =>
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(hostile),
    ).toThrow();
    expect(traps).toBe(0);

    expect(() =>
      (
        projectFloodgateV7CompletedParentEvidenceToTrainingLabels as (
          ...values: unknown[]
        ) => unknown
      )(),
    ).toThrow();
    expect(() =>
      (
        projectFloodgateV7CompletedParentEvidenceToTrainingLabels as (
          ...values: unknown[]
        ) => unknown
      )(evidence, evidence),
    ).toThrow();
  });

  it("is repeat-deterministic while making label emission a new projection boundary", () => {
    const evidence = fourteenCandidateEvidence();
    const before = structuredClone(evidence);
    const first =
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(evidence);
    const second =
      projectFloodgateV7CompletedParentEvidenceToTrainingLabels(evidence);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(evidence).toEqual(before);
    expect(evidence.completion.teacher_labels_emitted).toBe(0);
    expect(first.labels.teacher_labels_emitted).toBe(evidence.rescores.length);
    expect(rows(first)).toHaveLength(evidence.rescores.length);
    expect(rows(first).length).toBeGreaterThan(0);
    expect(
      Object.values(first.nonclaims).every((claim) => claim === false),
    ).toBe(true);
    expectDeepFrozen(first);
    expectDeepFrozen(second);
  });
});
