/**
 * Deterministic structural projection from one completed Floodgate v7 parent
 * into strict shogi-sibling-v1 training rows.
 *
 * This module does not authenticate the origin of its input. A production
 * finalizer must first authenticate the sealed V3 work stream and then call
 * this projection while it still owns that verification lifecycle.
 */

import {
  FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS,
  type FloodgateV7PendingCandidate,
} from "./floodgate-v7-candidate-union";
import {
  verifyFloodgateV7CompletedParentEvidenceCoreForTests,
  type FloodgateV7CompletedParentEvidence,
  type FloodgateV7CompletedRescoreEvidence,
} from "./floodgate-v7-completed-parent";
import {
  buildSiblingGroup,
  compareBytewise,
  validateParentGroups,
  type SiblingCandidateInput,
  type SiblingRecord,
} from "./sibling-data";

export const FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CONTRACT =
  "shogi-floodgate-v7-training-label-projection-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PROJECTION_STATUS =
  "complete-deterministic-sibling-label-projection-structural-origin-unauthenticated" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CLAIM_BOUNDARY =
  "pure-synchronous-structural-completed-parent-to-training-label-projection-not-sealed-work-authentication-publication-training-weight-or-playing-strength-evidence" as const;

export type FloodgateV7TrainingLabelRow = Readonly<
  Omit<SiblingRecord, "sources" | "split"> & {
    readonly sources: readonly string[];
    readonly split: "train";
  }
>;

export interface FloodgateV7TrainingLabelProjection {
  readonly contract: typeof FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CONTRACT;
  readonly status: typeof FLOODGATE_V7_TRAINING_LABEL_PROJECTION_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CLAIM_BOUNDARY;
  readonly parent: Readonly<{
    readonly parent_id: string;
    readonly completed_parent_sha256: string;
    readonly forced_parent_skipped: boolean;
  }>;
  readonly labels: Readonly<{
    readonly records: number;
    readonly teacher_labels_emitted: number;
    readonly rank: "teacher-parent-cp-descending-then-utf8-move-bytewise";
    readonly child_score: "negated-parent-perspective-cp";
    readonly split: "train";
  }>;
  readonly rows: readonly FloodgateV7TrainingLabelRow[];
  readonly nonclaims: Readonly<{
    readonly input_origin_authenticated: false;
    readonly training_role_authenticated: false;
    readonly sealed_work_verified: false;
    readonly durable_result_or_manifest: false;
    readonly published: false;
    readonly optimizer_training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

function fail(message: string): never {
  throw new Error(`Floodgate v7 training-label projection failed: ${message}`);
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function sourcesForCandidate(
  candidate: Readonly<FloodgateV7PendingCandidate>,
): readonly string[] {
  const sources: string[] = [];
  if (candidate.provenance.strong_game_played) sources.push("played");
  if (candidate.provenance.production_proposal) sources.push("teacher");
  if (candidate.provenance.stable_policy) sources.push("stable");
  if (sources.length === 0) fail(`candidate ${candidate.move} has no source`);
  return Object.freeze(sources);
}

function signedMateDistance(
  score: Extract<
    FloodgateV7CompletedRescoreEvidence["score"],
    { readonly kind: "mate" }
  >,
): number {
  // JSON has no negative-zero representation. The explicit mate_sign retains
  // that semantic bit, while the distance is serialized as canonical +0.
  if (score.mate_distance === 0) return 0;
  return score.mate_sign === 1 ? score.mate_distance : -score.mate_distance;
}

function candidateInput(
  candidate: Readonly<FloodgateV7PendingCandidate>,
  rescore: Readonly<FloodgateV7CompletedRescoreEvidence>,
  rank: number,
): Readonly<SiblingCandidateInput> {
  if (
    candidate.move !== rescore.move ||
    candidate.child_sfen !== rescore.child_sfen ||
    candidate.child_position_id !== rescore.child_position_id
  ) {
    fail(`candidate ${candidate.move} does not match its independent rescore`);
  }
  const common = {
    move: candidate.move,
    child_sfen: candidate.child_sfen,
    sources: sourcesForCandidate(candidate),
    teacher_parent_cp: rescore.score.cp,
    teacher_rank: rank,
    teacher_score_kind: rescore.score.kind,
  } as const;
  return rescore.score.kind === "cp"
    ? frozenRecord(common)
    : frozenRecord({
        ...common,
        teacher_mate: signedMateDistance(rescore.score),
        teacher_mate_sign: rescore.score.mate_sign,
      });
}

function frozenTrainingRow(row: SiblingRecord): FloodgateV7TrainingLabelRow {
  return frozenRecord({
    ...row,
    sources: Object.freeze([...row.sources]),
    split: "train" as const,
  });
}

/**
 * Structurally reverify and project one completed-parent value. The returned
 * rows are labels in memory, but neither the input origin nor a durable output
 * is authenticated by this function.
 */
export function projectFloodgateV7CompletedParentEvidenceToTrainingLabels(
  evidenceValue: Readonly<FloodgateV7CompletedParentEvidence>,
): Readonly<FloodgateV7TrainingLabelProjection> {
  if (arguments.length !== 1) fail("exactly one evidence value is required");
  const evidence =
    verifyFloodgateV7CompletedParentEvidenceCoreForTests(evidenceValue);
  const forced =
    evidence.candidate_union.status ===
    FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS;

  let rows: readonly FloodgateV7TrainingLabelRow[];
  if (forced) {
    if (evidence.rescores.length !== 0) {
      fail("forced parent unexpectedly retained independent rescores");
    }
    rows = Object.freeze([]);
  } else {
    const ranked = evidence.rescores
      .map((rescore, index) => ({
        candidate: evidence.candidate_union.candidates[index],
        rescore,
      }))
      .sort(
        (left, right) =>
          right.rescore.score.cp - left.rescore.score.cp ||
          compareBytewise(left.rescore.move, right.rescore.move),
      );
    const candidates = ranked.map(({ candidate, rescore }, index) =>
      candidateInput(candidate, rescore, index + 1),
    );
    const assignedRows = buildSiblingGroup(
      {
        game_id: evidence.parent.game_id,
        parent_id: evidence.parent.parent_id,
        position_id: evidence.parent.position_id,
        parent_sfen: evidence.parent.parent_sfen,
        parent_ply: evidence.parent.ply,
      },
      candidates,
    ).map((row) => ({ ...row, split: "train" as const }));
    validateParentGroups(assignedRows);
    rows = Object.freeze(assignedRows.map(frozenTrainingRow));
  }

  return frozenRecord({
    contract: FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CONTRACT,
    status: FLOODGATE_V7_TRAINING_LABEL_PROJECTION_STATUS,
    claim_boundary: FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CLAIM_BOUNDARY,
    parent: frozenRecord({
      parent_id: evidence.parent.parent_id,
      completed_parent_sha256: evidence.completed_parent_sha256,
      forced_parent_skipped: forced,
    }),
    labels: frozenRecord({
      records: rows.length,
      teacher_labels_emitted: rows.length,
      rank: "teacher-parent-cp-descending-then-utf8-move-bytewise" as const,
      child_score: "negated-parent-perspective-cp" as const,
      split: "train" as const,
    }),
    rows,
    nonclaims: frozenRecord({
      input_origin_authenticated: false as const,
      training_role_authenticated: false as const,
      sealed_work_verified: false as const,
      durable_result_or_manifest: false as const,
      published: false as const,
      optimizer_training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}
