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
  FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS,
  FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS,
  FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
  FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
  buildFloodgateV7CandidateUnionCoreForTests,
  type FloodgateV7CandidateUnionInput,
} from "../../../ml/floodgate-v7-candidate-union";
import {
  FLOODGATE_V7_COMPLETED_PARENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_COMPLETED_PARENT_SCHEMA,
  FLOODGATE_V7_COMPLETED_PARENT_STATUS,
  buildFloodgateV7CompletedParentCoreForTests,
  type FloodgateV7CompletedParentInput,
  verifyFloodgateV7CompletedParentEvidenceCoreForTests,
} from "../../../ml/floodgate-v7-completed-parent";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import { positionKeyFromSfen } from "../../../ml/sibling-data";
import { mateToCp } from "../../../ml/usi-multipv";

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const FORCED_SFEN = "4k4/2B6/3GRG3/9/9/9/9/9/K8 w - 1";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function legalMoves(sfen: string): string[] {
  return rulesCompleteLegalMoves(positionFromSfen(sfen).position).map(
    (entry) => entry.usi,
  );
}

function teacherRuntimeReceipt(): Record<string, unknown> {
  return {
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
  };
}

function candidateUnionInput(
  sfen = START_SFEN,
): FloodgateV7CandidateUnionInput {
  const legal = legalMoves(sfen);
  const forced = legal.length === 1;
  const playedMove = legal[Math.min(12, legal.length - 1)];
  const stableMove = legal[Math.min(13, legal.length - 1)];
  const gameId = `sha256:${sha256(`completed-parent-game:${sfen}`)}`;
  const parent = {
    schema_version: 1 as const,
    game_id: gameId,
    parent_id: `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${0}`)}`,
    position_id: positionKeyFromSfen(sfen),
    parent_sfen: sfen,
    ply: 0,
    played_move: playedMove,
  };
  const childSfen = childSfenAfterUsi(sfen, stableMove);
  const stable = {
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: sha256(
      `shogi-floodgate-stable-parent-v1\0${canonicalJson(parent)}`,
    ),
    stable_move: stableMove,
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
      root_tesu: 0,
    },
  } as const;
  if (forced) {
    return {
      parent,
      legal: {
        source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
        parent_sfen: sfen,
        count: 1,
        moves: legal,
      },
      stable,
      runtime: null,
    };
  }
  const requested = Math.min(12, legal.length);
  const proposalMoves = legal.slice(0, requested);
  return {
    parent,
    legal: {
      source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
      parent_sfen: sfen,
      count: legal.length,
      moves: legal,
    },
    stable,
    runtime: {
      receipt: teacherRuntimeReceipt() as never,
      proposal: {
        depth: 16,
        lines: proposalMoves.map((move, index) => ({
          depth: 16,
          multipv: index + 1,
          cp: index,
          nodes: 10 + index,
          move,
          pv: [move],
          scoreKind: "cp" as const,
        })),
        bestmove: proposalMoves[0],
        observedNodes: 9 + proposalMoves.length,
        requested_multipv: requested,
        legal_move_count_evidence: {
          source:
            "caller-supplied-until-authenticated-by-v7-coordinator" as const,
          count: legal.length,
        },
        reset_before_search: true,
      },
    },
  };
}

function cpRescore(
  move: string,
  index: number,
  pv: readonly string[] = [move],
): Readonly<FloodgateProductionTeacherRescoreResult> {
  return {
    depth: 16,
    lines: [
      {
        depth: 16,
        multipv: 1,
        cp: index,
        nodes: 100 + index,
        move,
        pv: [...pv],
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

function completedInput(sfen = START_SFEN): FloodgateV7CompletedParentInput {
  const source = candidateUnionInput(sfen);
  const union = buildFloodgateV7CandidateUnionCoreForTests(source);
  const row = source.stable;
  return {
    union,
    stable_runtime: {
      schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
      row,
      runtime_binding: {
        claim_boundary:
          FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
        execution_boundary:
          "production-fixed-asset-authority-and-reusable-pool",
        runtime_receipt_sha256: "c".repeat(64),
        reusable_pool_receipt_sha256: "d".repeat(64),
        parent_payload_sha256: row.parent_payload_sha256,
        row_sha256: sha256(
          `shogi-floodgate-production-stable-runtime-row-v1\0${canonicalJson(row)}`,
        ),
        origin: "direct-owning-runtime-capability-call-v1",
        plain_result_authentication_claim: false,
      },
    },
    rescores: union.candidates.map((candidate, index) =>
      cpRescore(candidate.move, index),
    ),
  };
}

function mutableInput(sfen = START_SFEN): Record<string, unknown> {
  return structuredClone(completedInput(sfen)) as unknown as Record<
    string,
    unknown
  >;
}

function firstMutableRescore(input: Record<string, unknown>): {
  readonly result: Record<string, unknown>;
  readonly line: Record<string, unknown>;
} {
  const result = (input.rescores as Record<string, unknown>[])[0];
  const line = (result.lines as Record<string, unknown>[])[0];
  return { result, line };
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child, seen);
}

function resignCompletedEvidence(value: Record<string, unknown>): void {
  const unsigned = structuredClone(value);
  delete unsigned.completed_parent_sha256;
  value.completed_parent_sha256 = sha256(
    `shogi-floodgate-v7-completed-parent-v1\0${canonicalJson(unsigned)}`,
  );
}

function resignCandidateUnion(value: Record<string, unknown>): void {
  const candidateUnion = value.candidate_union as Record<string, unknown>;
  const parent = value.parent as Record<string, unknown>;
  const legal = value.legal as Record<string, unknown>;
  const stable = value.stable as Record<string, unknown>;
  const teacher = value.teacher_proposal_runtime_binding as Record<
    string,
    unknown
  > | null;
  const candidates = candidateUnion.candidates as unknown[];
  const payload =
    candidateUnion.status === FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS
      ? {
          parent_id: parent.parent_id,
          parent_payload_sha256: parent.parent_payload_sha256,
          legal_moves_sha256: legal.moves_sha256,
          stable_row_sha256: stable.candidate_union_row_sha256,
          runtime_receipt_sha256: teacher?.runtime_receipt_sha256,
          proposal_result_sha256: teacher?.proposal_result_sha256,
          state: "awaiting-independent-rescores",
          candidates,
        }
      : {
          parent_id: parent.parent_id,
          parent_payload_sha256: parent.parent_payload_sha256,
          legal_moves_sha256: legal.moves_sha256,
          stable_row_sha256: stable.candidate_union_row_sha256,
          state: "skipped-forced",
          candidates,
        };
  candidateUnion.sha256 = sha256(
    `shogi-floodgate-v7-candidate-union-v1\0${canonicalJson(payload)}`,
  );
  resignCompletedEvidence(value);
}

describe("Floodgate v7 completed-parent test core", () => {
  it("captures a complete pending parent without retaining raw PV text", () => {
    const input = completedInput();
    const result = buildFloodgateV7CompletedParentCoreForTests(input);

    expect(result).toMatchObject({
      schema: FLOODGATE_V7_COMPLETED_PARENT_SCHEMA,
      status: FLOODGATE_V7_COMPLETED_PARENT_STATUS,
      claim_boundary: FLOODGATE_V7_COMPLETED_PARENT_CLAIM_BOUNDARY,
      input_authentication_claim: false,
      strong_game_played_move: candidateUnionInput().parent.played_move,
      completion: {
        state: "complete",
        independent_rescores_required: input.rescores.length,
        independent_rescores_completed: input.rescores.length,
        teacher_labels_emitted: 0,
      },
    });
    expect(result.candidate_union.status).toBe(
      FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS,
    );
    expect(result.teacher_proposal_runtime_binding).not.toBeNull();
    expect(result.stable_runtime_binding.parent_payload_sha256).toBe(
      result.parent.parent_payload_sha256,
    );
    expect(result.stable.production_runtime_row_sha256).not.toBe(
      result.stable.candidate_union_row_sha256,
    );
    expect(result.rescores.map((entry) => entry.move)).toEqual(
      result.candidate_union.candidates.map((entry) => entry.move),
    );
    expect(result.rescores[0].pv).toEqual({
      moves: 1,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(result.rescores[0]).not.toHaveProperty("lines");
    expect(result.rescores[0]).not.toHaveProperty("raw_pv");
    expect(result.completed_parent_sha256).toMatch(/^[0-9a-f]{64}$/);
    expectDeepFrozen(result);
  });

  it("canonicalizes parser-valid cp -0 before hashing without weakening its bound", () => {
    const signedZeroInput = mutableInput();
    firstMutableRescore(signedZeroInput).line.cp = -0;
    const signedZero = buildFloodgateV7CompletedParentCoreForTests(
      signedZeroInput as never,
    );
    const canonical =
      buildFloodgateV7CompletedParentCoreForTests(completedInput());

    expect(Object.is(signedZero.rescores[0].score.cp, -0)).toBe(false);
    expect(signedZero.rescores[0].score.cp).toBe(0);
    expect(signedZero.rescores[0].result_sha256).toBe(
      canonical.rescores[0].result_sha256,
    );
    expect(signedZero.completed_parent_sha256).toBe(
      canonical.completed_parent_sha256,
    );

    const outsideBound = mutableInput();
    firstMutableRescore(outsideBound).line.cp = 900_001;
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests(outsideBound as never),
    ).toThrow(/lines\[0\]\.cp is outside the supported integer range/);
  });

  it("canonicalizes parser-valid nodes -0 before hashing without allowing negative nodes", () => {
    const signedZeroInput = mutableInput();
    const signedZeroRescore = firstMutableRescore(signedZeroInput);
    signedZeroRescore.line.nodes = -0;
    signedZeroRescore.result.observedNodes = -0;

    const canonicalInput = mutableInput();
    const canonicalRescore = firstMutableRescore(canonicalInput);
    canonicalRescore.line.nodes = 0;
    canonicalRescore.result.observedNodes = 0;

    const signedZero = buildFloodgateV7CompletedParentCoreForTests(
      signedZeroInput as never,
    );
    const canonical = buildFloodgateV7CompletedParentCoreForTests(
      canonicalInput as never,
    );
    expect(Object.is(signedZero.rescores[0].nodes, -0)).toBe(false);
    expect(Object.is(signedZero.rescores[0].observed_nodes, -0)).toBe(false);
    expect(signedZero.rescores[0].nodes).toBe(0);
    expect(signedZero.rescores[0].observed_nodes).toBe(0);
    expect(signedZero.rescores[0].result_sha256).toBe(
      canonical.rescores[0].result_sha256,
    );
    expect(signedZero.completed_parent_sha256).toBe(
      canonical.completed_parent_sha256,
    );

    const negativeInput = mutableInput();
    const negativeRescore = firstMutableRescore(negativeInput);
    negativeRescore.line.nodes = -1;
    negativeRescore.result.observedNodes = -1;
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests(negativeInput as never),
    ).toThrow(/lines\[0\]\.nodes is outside the supported integer range/);
  });

  it("accepts only an exact early terminal-mate fallback and binds its PV digest", () => {
    const input = structuredClone(
      completedInput(),
    ) as FloodgateV7CompletedParentInput;
    const candidate = input.union.candidates[0];
    const mate = 5;
    const replacement = {
      depth: 8,
      lines: [
        {
          depth: 8,
          multipv: 1,
          cp: mateToCp(mate, 1),
          nodes: 77,
          move: candidate.move,
          pv: [candidate.move, candidate.move],
          scoreKind: "mate" as const,
          mate,
          mateSign: 1 as const,
        },
      ],
      bestmove: candidate.move,
      observedNodes: 77,
      requested_multipv: 1 as const,
      searchmoves: [candidate.move] as readonly [string],
      reset_before_search: true as const,
    };
    const rescores = [...input.rescores];
    rescores[0] = replacement;
    const result = buildFloodgateV7CompletedParentCoreForTests({
      ...input,
      rescores,
    });
    expect(result.rescores[0]).toMatchObject({
      depth: 8,
      completion: "exact-terminal-mate-before-requested-depth",
      score: { kind: "mate", mate_distance: 5, mate_sign: 1 },
      pv: { moves: 2 },
    });

    const bad = structuredClone(replacement) as Record<string, unknown>;
    const lines = bad.lines as Record<string, unknown>[];
    lines[0].mateSign = -1;
    rescores[0] = bad as never;
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests({ ...input, rescores }),
    ).toThrow(/mate and mateSign disagree/);

    const negativeZero = structuredClone(replacement) as unknown as {
      lines: Record<string, unknown>[];
    } & Record<string, unknown>;
    negativeZero.lines[0].mate = -0;
    negativeZero.lines[0].mateSign = -1;
    negativeZero.lines[0].cp = mateToCp(-0, -1);
    rescores[0] = negativeZero as never;
    const negativeZeroResult = buildFloodgateV7CompletedParentCoreForTests({
      ...input,
      rescores,
    });
    expect(negativeZeroResult.rescores[0].score).toEqual({
      kind: "mate",
      cp: mateToCp(-0, -1),
      mate_distance: 0,
      mate_sign: -1,
    });
  });

  it("captures a forced parent with stable runtime evidence and zero USI work", () => {
    const input = completedInput(FORCED_SFEN);
    const result = buildFloodgateV7CompletedParentCoreForTests(input);
    expect(result.candidate_union.status).toBe(
      FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS,
    );
    expect(result.teacher_proposal_runtime_binding).toBeNull();
    expect(result.rescores).toEqual([]);
    expect(result.completion).toEqual({
      state: "forced-parent-skip",
      candidates: 0,
      independent_rescores_required: 0,
      independent_rescores_completed: 0,
      teacher_labels_emitted: 0,
    });
    expect(result.strong_game_played_move).toBe(
      input.stable_runtime.row.stable_move,
    );
    expect(result.stable_runtime_binding.origin).toBe(
      "direct-owning-runtime-capability-call-v1",
    );
  });

  it("rejects missing, reordered, shallow non-mate, and noncanonical PV rescores", () => {
    const input = completedInput();
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests({
        ...input,
        rescores: input.rescores.slice(1),
      }),
    ).toThrow(/rescore count/);

    const reordered = [...input.rescores];
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests({
        ...input,
        rescores: reordered,
      }),
    ).toThrow(/searchmoves\[0\]/);

    const shallow = structuredClone(input.rescores) as unknown as Record<
      string,
      unknown
    >[];
    shallow[0].depth = 8;
    (shallow[0].lines as Record<string, unknown>[])[0].depth = 8;
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests({
        ...input,
        rescores: shallow as never,
      }),
    ).toThrow(/non-mate result did not reach fixed depth/);

    const badPv = structuredClone(input.rescores) as unknown as Record<
      string,
      unknown
    >[];
    (badPv[0].lines as Record<string, unknown>[])[0].pv = ["resign"];
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests({
        ...input,
        rescores: badPv as never,
      }),
    ).toThrow(/canonical USI move/);
  });

  it("independently rejects forged legal, teacher, root-move, and stable bindings", () => {
    const legal = mutableInput();
    ((legal.union as Record<string, unknown>).legal as Record<string, unknown>)[
      "moves_sha256"
    ] = "f".repeat(64);
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests(legal as never),
    ).toThrow(/legal\.moves_sha256/);

    const teacher = mutableInput();
    const runtimeBinding = (teacher.union as Record<string, unknown>)[
      "runtime_binding"
    ] as Record<string, unknown>;
    (runtimeBinding.receipt as Record<string, unknown>).engine_id = "forged";
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests(teacher as never),
    ).toThrow(/receipt\.engine_id/);

    const roots = mutableInput();
    const rootsRuntime = (roots.union as Record<string, unknown>)[
      "runtime_binding"
    ] as Record<string, unknown>;
    (rootsRuntime.proposal as Record<string, unknown>).root_moves_sha256 =
      "e".repeat(64);
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests(roots as never),
    ).toThrow(/root_moves_sha256/);

    const stable = mutableInput();
    const stableRuntime = stable.stable_runtime as Record<string, unknown>;
    (stableRuntime.runtime_binding as Record<string, unknown>).row_sha256 =
      "a".repeat(64);
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests(stable as never),
    ).toThrow(/runtime_binding\.row_sha256/);
  });

  it("rejects accessors, Proxies, extra keys, and post-capture mutation", () => {
    const accessor = mutableInput();
    Object.defineProperty(accessor, "rescores", {
      get: () => [],
      enumerable: true,
    });
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests(accessor as never),
    ).toThrow(/enumerable own data property/);

    const proxy = completedInput();
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests(
        new Proxy(proxy, {}) as FloodgateV7CompletedParentInput,
      ),
    ).toThrow(/plain non-Proxy object/);

    const extra = mutableInput();
    extra.unexpected = true;
    expect(() =>
      buildFloodgateV7CompletedParentCoreForTests(extra as never),
    ).toThrow(/unexpected key set/);

    const mutable = structuredClone(
      completedInput(),
    ) as FloodgateV7CompletedParentInput;
    const result = buildFloodgateV7CompletedParentCoreForTests(mutable);
    (mutable.rescores[0].lines[0].pv as string[]).push("3c3d");
    expect(result.rescores[0].pv.moves).toBe(1);
  });

  it("strictly reverifies cloned compact evidence for checkpoint resume", () => {
    const built = buildFloodgateV7CompletedParentCoreForTests(completedInput());
    const cloned = structuredClone(built);
    const verified =
      verifyFloodgateV7CompletedParentEvidenceCoreForTests(cloned);
    expect(verified).toEqual(built);
    expect(verified).not.toBe(cloned);
    expectDeepFrozen(verified);

    const wrongDigest = structuredClone(built) as unknown as Record<
      string,
      unknown
    >;
    wrongDigest.completed_parent_sha256 = "0".repeat(64);
    expect(() =>
      verifyFloodgateV7CompletedParentEvidenceCoreForTests(
        wrongDigest as never,
      ),
    ).toThrow(/completed_parent_sha256/);

    const resignedCount = structuredClone(built) as unknown as Record<
      string,
      unknown
    >;
    (resignedCount.completion as Record<string, unknown>)[
      "independent_rescores_completed"
    ] = 0;
    resignCompletedEvidence(resignedCount);
    expect(() =>
      verifyFloodgateV7CompletedParentEvidenceCoreForTests(
        resignedCount as never,
      ),
    ).toThrow(/independent_rescores_completed/);

    const resignedPv = structuredClone(built) as unknown as Record<
      string,
      unknown
    >;
    const pv = ((resignedPv.rescores as Record<string, unknown>[])[0].pv ??
      {}) as Record<string, unknown>;
    pv.moves = 0;
    resignCompletedEvidence(resignedPv);
    expect(() =>
      verifyFloodgateV7CompletedParentEvidenceCoreForTests(resignedPv as never),
    ).toThrow(/pv\.moves/);

    const nestedExtra = structuredClone(built) as unknown as Record<
      string,
      unknown
    >;
    (
      ((nestedExtra.rescores as Record<string, unknown>[])[0].pv ??
        {}) as Record<string, unknown>
    ).raw = "not-retained";
    resignCompletedEvidence(nestedExtra);
    expect(() =>
      verifyFloodgateV7CompletedParentEvidenceCoreForTests(
        nestedExtra as never,
      ),
    ).toThrow(/unexpected key set/);
  });

  it("rejects every compact rescore invariant even after the outer digest is resigned", () => {
    const built = buildFloodgateV7CompletedParentCoreForTests(completedInput());
    const mutations: readonly Readonly<{
      name: string;
      expected: RegExp;
      mutate: (rescore: Record<string, unknown>) => void;
    }>[] = [
      {
        name: "candidate index",
        expected: /candidate_index/,
        mutate: (rescore) => {
          rescore.candidate_index = 1;
        },
      },
      {
        name: "move",
        expected: /\.move/,
        mutate: (rescore) => {
          rescore.move = "1a1b";
        },
      },
      {
        name: "child",
        expected: /child_position_id/,
        mutate: (rescore) => {
          rescore.child_position_id = `sha256:${"0".repeat(64)}`;
        },
      },
      {
        name: "depth",
        expected: /\.depth/,
        mutate: (rescore) => {
          rescore.depth = 17;
        },
      },
      {
        name: "completion",
        expected: /\.completion/,
        mutate: (rescore) => {
          rescore.completion = "exact-terminal-mate-before-requested-depth";
        },
      },
      {
        name: "score bound",
        expected: /score\.cp/,
        mutate: (rescore) => {
          (rescore.score as Record<string, unknown>).cp = 900_001;
        },
      },
      {
        name: "node equality",
        expected: /observed_nodes/,
        mutate: (rescore) => {
          rescore.observed_nodes = (rescore.nodes as number) + 1;
        },
      },
      {
        name: "pv bound",
        expected: /pv\.moves/,
        mutate: (rescore) => {
          (rescore.pv as Record<string, unknown>).moves = 0;
        },
      },
      {
        name: "pv digest",
        expected: /pv\.sha256/,
        mutate: (rescore) => {
          (rescore.pv as Record<string, unknown>).sha256 = "not-a-digest";
        },
      },
      {
        name: "result digest",
        expected: /result_sha256/,
        mutate: (rescore) => {
          rescore.result_sha256 = "not-a-digest";
        },
      },
      {
        name: "multipv",
        expected: /requested_multipv/,
        mutate: (rescore) => {
          rescore.requested_multipv = 2;
        },
      },
      {
        name: "searchmove",
        expected: /searchmoves\[0\]/,
        mutate: (rescore) => {
          rescore.searchmoves = ["1a1b"];
        },
      },
      {
        name: "reset",
        expected: /reset_before_search/,
        mutate: (rescore) => {
          rescore.reset_before_search = false;
        },
      },
      {
        name: "score extra key",
        expected: /unexpected key set/,
        mutate: (rescore) => {
          (rescore.score as Record<string, unknown>).raw = 1;
        },
      },
    ];

    for (const mutation of mutations) {
      const changed = structuredClone(built) as unknown as Record<
        string,
        unknown
      >;
      const first = (changed.rescores as Record<string, unknown>[])[0];
      mutation.mutate(first);
      resignCompletedEvidence(changed);
      expect(
        () =>
          verifyFloodgateV7CompletedParentEvidenceCoreForTests(
            changed as never,
          ),
        mutation.name,
      ).toThrow(mutation.expected);
    }
  });

  it("rejects resigned candidate, parent, teacher, and stable semantic substitutions", () => {
    const built = buildFloodgateV7CompletedParentCoreForTests(completedInput());

    const noProvenance = structuredClone(built) as unknown as Record<
      string,
      unknown
    >;
    const candidate = (
      (noProvenance.candidate_union as Record<string, unknown>)
        .candidates as Record<string, unknown>[]
    ).find((entry) => entry.proposal_rank === null);
    if (candidate === undefined)
      throw new Error("fixture needs a union-only move");
    candidate.provenance = {
      production_proposal: false,
      strong_game_played: false,
      stable_policy: false,
    };
    resignCandidateUnion(noProvenance);
    expect(() =>
      verifyFloodgateV7CompletedParentEvidenceCoreForTests(
        noProvenance as never,
      ),
    ).toThrow(/no provenance source/);

    const wrongRoot = structuredClone(built) as unknown as Record<
      string,
      unknown
    >;
    (
      wrongRoot.teacher_proposal_runtime_binding as Record<string, unknown>
    ).root_moves_sha256 = "0".repeat(64);
    resignCompletedEvidence(wrongRoot);
    expect(() =>
      verifyFloodgateV7CompletedParentEvidenceCoreForTests(wrongRoot as never),
    ).toThrow(/root_moves_sha256/);

    const wrongPlayed = structuredClone(built) as unknown as Record<
      string,
      unknown
    >;
    wrongPlayed.strong_game_played_move = "1a1b";
    resignCompletedEvidence(wrongPlayed);
    expect(() =>
      verifyFloodgateV7CompletedParentEvidenceCoreForTests(
        wrongPlayed as never,
      ),
    ).toThrow(/parent_payload_sha256/);

    const wrongStableDomain = structuredClone(built) as unknown as Record<
      string,
      unknown
    >;
    (wrongStableDomain.stable as Record<string, unknown>)[
      "completed_parent_row_sha256"
    ] = "0".repeat(64);
    resignCompletedEvidence(wrongStableDomain);
    expect(() =>
      verifyFloodgateV7CompletedParentEvidenceCoreForTests(
        wrongStableDomain as never,
      ),
    ).toThrow(/completed_parent_row_sha256/);
  });

  it("treats retained PV/result hashes as authenticated commitments, not engine truth", () => {
    const built = buildFloodgateV7CompletedParentCoreForTests(completedInput());
    const opaque = structuredClone(built) as unknown as Record<string, unknown>;
    const first = (opaque.rescores as Record<string, unknown>[])[0];
    (first.pv as Record<string, unknown>).sha256 = "e".repeat(64);
    first.result_sha256 = "f".repeat(64);
    resignCompletedEvidence(opaque);

    const verified = verifyFloodgateV7CompletedParentEvidenceCoreForTests(
      opaque as never,
    );
    expect(verified.rescores[0].pv.sha256).toBe("e".repeat(64));
    expect(verified.rescores[0].result_sha256).toBe("f".repeat(64));
    expect(verified.input_authentication_claim).toBe(false);
    expect(verified.claim_boundary).toContain("unauthenticated");
  });
});
