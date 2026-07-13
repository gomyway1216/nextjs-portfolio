import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_CANDIDATE_UNION_CLAIM_BOUNDARY,
  FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS,
  FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS,
  FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
  FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
  buildFloodgateV7CandidateUnionCoreForTests,
  type FloodgateV7CandidateUnionInput,
} from "../../../ml/floodgate-v7-candidate-union";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
} from "../../../ml/floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
} from "../../../ml/floodgate-stable-wasm-proposer";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import { positionKeyFromSfen } from "../../../ml/sibling-data";

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const FORCED_SFEN = "4k4/2B6/3GRG3/9/9/9/9/9/K8 w - 1";
const ADJACENT_KINGS_SFEN = "4k4/4K4/9/9/9/9/9/9/9 b - 1";
const CHECKMATED_SFEN = "4k4/4+R4/5G3/9/9/9/9/9/4K4 w - 1";
const SMALL_LEGAL_SET_SFEN = "4k4/9/9/9/9/9/9/9/K8 b - 1";

interface MutableProposalLine extends Record<string, unknown> {
  cp: number;
  move: string;
  multipv: number;
  pv: string[];
}

interface MutableTestInput extends Record<string, unknown> {
  parent: Record<string, unknown> & {
    parent_sfen: string;
    played_move: string;
    position_id: string;
  };
  legal: Record<string, unknown> & {
    count: number;
    moves: string[];
    parent_sfen: string;
  };
  stable: Record<string, unknown> & {
    child_sfen: string;
    parent_id: string;
    parent_payload_sha256: string;
    stable_move: string;
    search: Record<string, unknown> & {
      completed_depth: number;
      nodes: number;
      raw_search_score: number;
      requested_depth: number;
      termination: string;
    };
  };
  runtime: {
    receipt: Record<string, unknown> & {
      asset_authority_execution_boundary: string;
      engine_id: string;
      execution_boundary: string;
      fixed_options: string[];
      runtime: Record<string, unknown>;
      snapshot: {
        engine: Record<string, unknown>;
        eval: Record<string, unknown>;
      };
    };
    proposal: Record<string, unknown> & {
      bestmove: string;
      lines: MutableProposalLine[];
      observedNodes: number;
      requested_multipv: number;
    };
  };
}

interface CapturedRuntimeBinding {
  readonly receipt: Readonly<{
    readonly runtime_receipt_sha256: string;
  }>;
  readonly proposal: Readonly<{
    readonly requested_multipv: number;
    readonly line_count: number;
    readonly root_moves_sha256: string;
    readonly proposal_result_sha256: string;
  }>;
}

function runtimeBinding(value: unknown): CapturedRuntimeBinding {
  return value as CapturedRuntimeBinding;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function parentPayloadSha256(
  parent: Readonly<Record<string, unknown>>,
): string {
  return sha256(`shogi-floodgate-stable-parent-v1\0${canonicalJson(parent)}`);
}

function legalMoves(sfen: string): string[] {
  const { position } = positionFromSfen(sfen);
  return rulesCompleteLegalMoves(position).map((entry) => entry.usi);
}

function runtimeReceipt(): Record<string, unknown> {
  return {
    contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-assets-and-runtime-dependencies",
    asset_authority_execution_boundary:
      "production-fixed-registry-and-deployment-root",
    engine_id: FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
    runtime: {
      engine_count: 12,
      threads_per_engine: 1,
      hash_mb_per_engine: 64,
      fv_scale: 20,
      depth: 16,
      proposal_multipv_max: 12,
      independent_rescore_multipv: 1,
      no_process_arguments: true,
      shell: false,
      minimal_environment: true,
      per_worker_private_directories: true,
      queue_bound: 48,
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
      engine: { bytes: 1, sha256: "a".repeat(64), mode: "0500" },
      eval: { bytes: 2, sha256: "b".repeat(64), mode: "0400" },
    },
  };
}

function makeInput(
  options: {
    sfen?: string;
    playedMove?: string;
    stableMove?: string;
    proposalMoves?: readonly string[];
  } = {},
): FloodgateV7CandidateUnionInput {
  const sfen = options.sfen ?? START_SFEN;
  const legal = legalMoves(sfen);
  const playedMove =
    options.playedMove ?? legal[Math.min(12, legal.length - 1)];
  const stableMove =
    options.stableMove ?? legal[Math.min(13, legal.length - 1)];
  const gameId = `sha256:${sha256("v7-candidate-union-game")}`;
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
    parent_payload_sha256: parentPayloadSha256(parent),
    stable_move: stableMove,
    child_sfen: childSfen,
    child_position_id: positionKeyFromSfen(childSfen),
    search: {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH as 11,
      completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      termination: "requested-depth-complete" as const,
      raw_search_score: 17,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: 100,
      leaves: 50,
      root_tesu: 0,
    },
  };
  const requested = Math.min(12, legal.length);
  const proposalMoves = [
    ...(options.proposalMoves ?? legal.slice(0, requested)),
  ];
  const proposal = {
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
      source: "caller-supplied-until-authenticated-by-v7-coordinator" as const,
      count: legal.length,
    },
    reset_before_search: true as const,
  };
  return {
    parent,
    legal: {
      source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
      parent_sfen: sfen,
      count: legal.length,
      moves: legal,
    },
    stable,
    runtime:
      legal.length < 2
        ? null
        : {
            receipt: runtimeReceipt() as never,
            proposal,
          },
  };
}

function mutableInput(
  options: Parameters<typeof makeInput>[0] = {},
): MutableTestInput {
  return structuredClone(makeInput(options)) as unknown as MutableTestInput;
}

describe("Floodgate v7 candidate union test core", () => {
  it("sorts and de-duplicates proposal, played, and stable moves with exact provenance", () => {
    const input = makeInput();
    const result = buildFloodgateV7CandidateUnionCoreForTests(input);
    expect(result.status).toBe(FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS);
    if (result.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS) {
      throw new Error("expected pending candidate union");
    }
    const expected = new Set([
      ...(input.runtime?.proposal.lines.map((line) => line.move) ?? []),
      input.parent.played_move,
      input.stable.stable_move,
    ]);
    expect(result.candidates.map((candidate) => candidate.move)).toEqual(
      [...expected].sort((left, right) =>
        Buffer.compare(Buffer.from(left), Buffer.from(right)),
      ),
    );
    expect(
      result.candidates.find(
        (candidate) => candidate.move === input.parent.played_move,
      )?.provenance,
    ).toEqual({
      production_proposal: false,
      strong_game_played: true,
      stable_policy: false,
    });
    expect(
      result.candidates.find(
        (candidate) => candidate.move === input.stable.stable_move,
      )?.provenance,
    ).toEqual({
      production_proposal: false,
      strong_game_played: false,
      stable_policy: true,
    });
    expect(result.completion).toEqual({
      state: "incomplete",
      independent_rescores_required: expected.size,
      independent_rescores_completed: 0,
      teacher_labels_emitted: 0,
    });
    expect(result.claim_boundary).toBe(
      FLOODGATE_V7_CANDIDATE_UNION_CLAIM_BOUNDARY,
    );
    expect(result.input_authentication_claim).toBe(false);
    expect(result.stable_binding.plain_object_stable_authentication_claim).toBe(
      false,
    );
  });

  it("merges all three provenance flags when the same move appears everywhere", () => {
    const legal = legalMoves(START_SFEN);
    const input = makeInput({
      playedMove: legal[0],
      stableMove: legal[0],
    });
    const result = buildFloodgateV7CandidateUnionCoreForTests(input);
    if (result.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS) {
      throw new Error("expected pending candidate union");
    }
    const candidate = result.candidates.find(
      (entry) => entry.move === legal[0],
    );
    expect(candidate).toMatchObject({
      proposal_rank: 1,
      provenance: {
        production_proposal: true,
        strong_game_played: true,
        stable_policy: true,
      },
      independent_rescore: "required-not-yet-run",
    });
    expect(result.candidates).toHaveLength(12);
  });

  it("requests exactly the legal count when a non-forced parent has fewer than 12 moves", () => {
    const legal = legalMoves(SMALL_LEGAL_SET_SFEN);
    expect(legal.length).toBeGreaterThan(1);
    expect(legal.length).toBeLessThan(12);
    const result = buildFloodgateV7CandidateUnionCoreForTests(
      makeInput({
        sfen: SMALL_LEGAL_SET_SFEN,
        playedMove: legal[0],
        stableMove: legal[1],
      }),
    );
    if (result.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS) {
      throw new Error("expected pending candidate union");
    }
    expect(runtimeBinding(result.runtime_binding).proposal).toMatchObject({
      requested_multipv: legal.length,
      line_count: legal.length,
    });
  });

  it("deep-freezes the complete receipt graph and carries only nonclaim bindings", () => {
    const result = buildFloodgateV7CandidateUnionCoreForTests(makeInput());
    if (result.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS) {
      throw new Error("expected pending candidate union");
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.parent)).toBe(true);
    expect(Object.isFrozen(result.legal)).toBe(true);
    expect(Object.isFrozen(result.runtime_binding)).toBe(true);
    expect(Object.isFrozen(result.runtime_binding.receipt)).toBe(true);
    expect(Object.isFrozen(result.candidates)).toBe(true);
    expect(Object.isFrozen(result.candidates[0])).toBe(true);
    expect(Object.isFrozen(result.candidates[0].provenance)).toBe(true);
    expect(result.runtime_binding).toMatchObject({
      receipt: {
        execution_boundary: "production-fixed-assets-and-runtime-dependencies",
        engine_id: FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
        plain_object_production_authentication_claim: false,
        runtime: { depth: 16, proposal_multipv_max: 12 },
      },
      proposal: { result_authentication_claim: false },
    });
  });

  it("emits an explicit zero-label skip when played and stable equal the sole legal move", () => {
    const legal = legalMoves(FORCED_SFEN);
    expect(legal).toHaveLength(1);
    const result = buildFloodgateV7CandidateUnionCoreForTests(
      makeInput({
        sfen: FORCED_SFEN,
        playedMove: legal[0],
        stableMove: legal[0],
      }),
    );
    expect(result.status).toBe(FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS);
    if (result.status !== FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS) {
      throw new Error("expected forced skip");
    }
    expect(result.runtime_binding).toBeNull();
    expect(result.candidates).toEqual([]);
    expect(result.skip).toEqual({
      reason: "fewer-than-two-rules-complete-legal-moves",
      forced_move: legal[0],
      played_move_matches_forced_move: true,
      stable_move_matches_forced_move: true,
      proposal_search_performed: false,
      independent_rescore_required: false,
      teacher_labels_emitted: 0,
    });
    expect(Object.isFrozen(result.skip)).toBe(true);
  });

  it("requires forced parents to omit runtime and non-forced parents to provide it", () => {
    const forcedLegal = legalMoves(FORCED_SFEN);
    const forced = mutableInput({
      sfen: FORCED_SFEN,
      playedMove: forcedLegal[0],
      stableMove: forcedLegal[0],
    });
    Reflect.set(forced, "runtime", {
      receipt: runtimeReceipt(),
      proposal: {},
    });
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(forced as never),
    ).toThrow(/forced parent must skip/);

    const ordinary = mutableInput();
    Reflect.set(ordinary, "runtime", null);
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(ordinary as never),
    ).toThrow(/non-forced parent requires/);
  });

  it.each([
    [
      "execution boundary",
      (input: MutableTestInput) => {
        input.runtime.receipt.execution_boundary =
          "test-only-injected-asset-root-and-runtime-dependencies";
      },
    ],
    [
      "asset boundary",
      (input: MutableTestInput) => {
        input.runtime.receipt.asset_authority_execution_boundary =
          "test-only-injected-expected-registry-and-root";
      },
    ],
    [
      "engine ID",
      (input: MutableTestInput) => {
        input.runtime.receipt.engine_id = "forged";
      },
    ],
    [
      "depth",
      (input: MutableTestInput) => {
        input.runtime.receipt.runtime.depth = 15;
      },
    ],
    [
      "option order",
      (input: MutableTestInput) => {
        input.runtime.receipt.fixed_options.reverse();
      },
    ],
    [
      "snapshot mode",
      (input: MutableTestInput) => {
        input.runtime.receipt.snapshot.eval.mode = "0600";
      },
    ],
  ])("rejects a changed production-shaped receipt %s", (_name, mutate) => {
    const input = mutableInput();
    mutate(input);
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(input as never),
    ).toThrow(/runtime receipt/);
  });

  it.each([
    [
      "requested MultiPV",
      (input: MutableTestInput) => {
        input.runtime.proposal.requested_multipv = 11;
      },
    ],
    [
      "line count",
      (input: MutableTestInput) => {
        input.runtime.proposal.lines.pop();
      },
    ],
    [
      "rank",
      (input: MutableTestInput) => {
        input.runtime.proposal.lines[1].multipv = 1;
      },
    ],
    [
      "bestmove",
      (input: MutableTestInput) => {
        input.runtime.proposal.bestmove = input.runtime.proposal.lines[1].move;
      },
    ],
    [
      "observed nodes",
      (input: MutableTestInput) => {
        input.runtime.proposal.observedNodes += 1;
      },
    ],
    [
      "duplicate root",
      (input: MutableTestInput) => {
        input.runtime.proposal.lines[1].move =
          input.runtime.proposal.lines[0].move;
        input.runtime.proposal.lines[1].pv = [
          input.runtime.proposal.lines[0].move,
        ];
      },
    ],
    [
      "illegal root",
      (input: MutableTestInput) => {
        input.runtime.proposal.lines[0].move = "5a5b";
        input.runtime.proposal.lines[0].pv = ["5a5b"];
        input.runtime.proposal.bestmove = "5a5b";
      },
    ],
  ])("rejects malformed proposal evidence: %s", (_name, mutate) => {
    const input = mutableInput();
    mutate(input);
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(input as never),
    ).toThrow(/runtime proposal/);
  });

  it("rejects legal evidence that differs in count, content, or parent SFEN", () => {
    for (const mutate of [
      (input: MutableTestInput) => {
        input.legal.count -= 1;
      },
      (input: MutableTestInput) => {
        input.legal.moves[0] = input.legal.moves[1];
      },
      (input: MutableTestInput) => {
        input.legal.parent_sfen = FORCED_SFEN;
      },
    ]) {
      const input = mutableInput();
      mutate(input);
      expect(() =>
        buildFloodgateV7CandidateUnionCoreForTests(input as never),
      ).toThrow(/legal evidence/);
    }
  });

  it("treats caller legal-evidence order as non-authoritative and canonicalizes it", () => {
    const ordered = buildFloodgateV7CandidateUnionCoreForTests(makeInput());
    const reversed = mutableInput();
    reversed.legal.moves.reverse();
    const reordered = buildFloodgateV7CandidateUnionCoreForTests(
      reversed as never,
    );
    expect(reordered.legal).toEqual(ordered.legal);
  });

  it("fails closed when the core rederives zero legal moves", () => {
    expect(legalMoves(CHECKMATED_SFEN)).toHaveLength(0);
    const input = mutableInput();
    input.parent.parent_sfen = CHECKMATED_SFEN;
    input.parent.position_id = positionKeyFromSfen(CHECKMATED_SFEN);
    input.legal.parent_sfen = CHECKMATED_SFEN;
    input.legal.count = 0;
    input.legal.moves = [];
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(input as never),
    ).toThrow(/core-derived legal move count/);
  });

  it("fails closed when a malformed parent exposes an opposing-king capture", () => {
    expect(legalMoves(ADJACENT_KINGS_SFEN)).toContain("5b5a");
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(
        makeInput({ sfen: ADJACENT_KINGS_SFEN }),
      ),
    ).toThrow(/capture the opposing king/);
  });

  it("rejects stable row identity, payload, move, child, and search changes", () => {
    for (const mutate of [
      (input: MutableTestInput) => {
        input.stable.parent_id = `sha256:${"c".repeat(64)}`;
      },
      (input: MutableTestInput) => {
        input.stable.parent_payload_sha256 = "d".repeat(64);
      },
      (input: MutableTestInput) => {
        input.stable.stable_move = "5a5b";
      },
      (input: MutableTestInput) => {
        input.stable.child_sfen = START_SFEN;
      },
      (input: MutableTestInput) => {
        input.stable.search.requested_depth = 10;
      },
    ]) {
      const input = mutableInput();
      mutate(input);
      expect(() =>
        buildFloodgateV7CandidateUnionCoreForTests(input as never),
      ).toThrow(/stable proposal/);
    }
  });

  it("rejects parent identity, canonical SFEN, and played-move changes", () => {
    for (const mutate of [
      (input: MutableTestInput) => {
        input.parent.parent_id = `sha256:${"e".repeat(64)}`;
      },
      (input: MutableTestInput) => {
        input.parent.parent_sfen = `${input.parent.parent_sfen} `;
      },
      (input: MutableTestInput) => {
        input.parent.played_move = "5a5b";
      },
    ]) {
      const input = mutableInput();
      mutate(input);
      expect(() =>
        buildFloodgateV7CandidateUnionCoreForTests(input as never),
      ).toThrow(/parent|played move/);
    }
  });

  it("rejects extra keys, sparse arrays, accessors, symbols, thenables, and Proxies", () => {
    const extra = mutableInput();
    extra.unexpected = true;
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(extra as never),
    ).toThrow(/exactly/);

    const sparse = mutableInput();
    delete sparse.legal.moves[1];
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(sparse as never),
    ).toThrow(/dense/);

    class ArraySubclass<T> extends Array<T> {}
    const subclass = mutableInput();
    subclass.legal.moves = new ArraySubclass(...subclass.legal.moves);
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(subclass as never),
    ).toThrow(/ordinary array/);

    const accessor = mutableInput();
    Object.defineProperty(accessor.parent, "played_move", {
      enumerable: true,
      get: () => accessor.legal.moves[0],
    });
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(accessor as never),
    ).toThrow(/data property/);

    const symbol = mutableInput();
    Reflect.set(symbol, Symbol("hidden"), true);
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(symbol as never),
    ).toThrow(/symbol/);

    const thenable = mutableInput();
    thenable.then = () => undefined;
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(thenable as never),
    ).toThrow(/exactly/);

    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(
        new Proxy(mutableInput(), {}) as never,
      ),
    ).toThrow(/non-Proxy/);
  });

  it("rejects non-canonical PV moves and inconsistent mate projections", () => {
    const badPv = mutableInput();
    badPv.runtime.proposal.lines[0].pv.push("7G7F");
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(badPv as never),
    ).toThrow(/canonical USI/);

    const badMate = mutableInput();
    badMate.runtime.proposal.lines[0] = {
      ...badMate.runtime.proposal.lines[0],
      scoreKind: "mate",
      mate: 3,
      mateSign: 1,
      cp: 1,
    };
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(badMate as never),
    ).toThrow(/mate score/);
  });

  it("normalizes parser-valid signed zero before canonical proposal hashing", () => {
    const signedZero = mutableInput();
    signedZero.runtime.proposal.lines[0].cp = -0;
    signedZero.runtime.proposal.lines[0].nodes = -0;
    const canonicalZero = mutableInput();
    canonicalZero.runtime.proposal.lines[0].cp = 0;
    canonicalZero.runtime.proposal.lines[0].nodes = 0;

    const signedResult = buildFloodgateV7CandidateUnionCoreForTests(
      signedZero as never,
    );
    const canonicalResult = buildFloodgateV7CandidateUnionCoreForTests(
      canonicalZero as never,
    );
    if (
      signedResult.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS ||
      canonicalResult.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS
    ) {
      throw new Error("expected pending candidate unions");
    }
    expect(
      runtimeBinding(signedResult.runtime_binding).proposal
        .proposal_result_sha256,
    ).toBe(
      runtimeBinding(canonicalResult.runtime_binding).proposal
        .proposal_result_sha256,
    );

    const negativeMateZero = mutableInput();
    negativeMateZero.runtime.proposal.lines[0] = {
      ...negativeMateZero.runtime.proposal.lines[0],
      scoreKind: "mate",
      mate: -0,
      mateSign: -1,
      cp: -1_000_000,
    };
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(negativeMateZero as never),
    ).not.toThrow();
  });

  it("rederives every candidate child and domain-separates all stage digests", () => {
    const input = makeInput();
    const result = buildFloodgateV7CandidateUnionCoreForTests(input);
    if (result.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS) {
      throw new Error("expected pending candidate union");
    }
    for (const candidate of result.candidates) {
      const child = childSfenAfterUsi(input.parent.parent_sfen, candidate.move);
      expect(candidate.child_sfen).toBe(child);
      expect(candidate.child_position_id).toBe(positionKeyFromSfen(child));
    }
    const runtime = runtimeBinding(result.runtime_binding);
    const digests = [
      result.legal.moves_sha256,
      runtime.proposal.root_moves_sha256,
      runtime.proposal.proposal_result_sha256,
      runtime.receipt.runtime_receipt_sha256,
      result.stable_binding.stable_row_sha256,
      result.candidate_union_sha256,
    ];
    expect(digests.every((digest) => /^[0-9a-f]{64}$/.test(digest))).toBe(true);
    expect(new Set(digests)).toHaveLength(digests.length);
  });

  it("binds full proposal evidence even when the root move list is unchanged", () => {
    const baseline = buildFloodgateV7CandidateUnionCoreForTests(makeInput());
    if (baseline.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS) {
      throw new Error("expected pending candidate union");
    }
    const scoreChangedInput = mutableInput();
    scoreChangedInput.runtime.proposal.lines[0].cp += 1;
    const scoreChanged = buildFloodgateV7CandidateUnionCoreForTests(
      scoreChangedInput as never,
    );
    const pvChangedInput = mutableInput();
    pvChangedInput.runtime.proposal.lines[0].pv.push(
      pvChangedInput.runtime.proposal.lines[1].move,
    );
    const pvChanged = buildFloodgateV7CandidateUnionCoreForTests(
      pvChangedInput as never,
    );
    if (
      scoreChanged.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS ||
      pvChanged.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS
    ) {
      throw new Error("expected pending candidate unions");
    }
    const baselineProposal = runtimeBinding(baseline.runtime_binding).proposal;
    const scoreProposal = runtimeBinding(scoreChanged.runtime_binding).proposal;
    const pvProposal = runtimeBinding(pvChanged.runtime_binding).proposal;
    expect(scoreProposal.root_moves_sha256).toBe(
      baselineProposal.root_moves_sha256,
    );
    expect(pvProposal.root_moves_sha256).toBe(
      baselineProposal.root_moves_sha256,
    );
    expect(scoreProposal.proposal_result_sha256).not.toBe(
      baselineProposal.proposal_result_sha256,
    );
    expect(pvProposal.proposal_result_sha256).not.toBe(
      baselineProposal.proposal_result_sha256,
    );
  });

  it("binds full runtime receipt and stable row projections", () => {
    const baseline = buildFloodgateV7CandidateUnionCoreForTests(makeInput());
    const changed = mutableInput();
    changed.runtime.receipt.snapshot.engine.sha256 = "c".repeat(64);
    changed.stable.search.nodes += 1;
    const modified = buildFloodgateV7CandidateUnionCoreForTests(
      changed as never,
    );
    if (
      baseline.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS ||
      modified.status !== FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS
    ) {
      throw new Error("expected pending candidate unions");
    }
    expect(
      runtimeBinding(modified.runtime_binding).receipt.runtime_receipt_sha256,
    ).not.toBe(
      runtimeBinding(baseline.runtime_binding).receipt.runtime_receipt_sha256,
    );
    expect(modified.stable_binding.stable_row_sha256).not.toBe(
      baseline.stable_binding.stable_row_sha256,
    );
  });

  it("accepts only the stable proposer's positive early-mate band contract", () => {
    const valid = mutableInput();
    valid.stable.search.completed_depth = 10;
    valid.stable.search.termination = "winning-mate-band-early";
    valid.stable.search.raw_search_score = 89_990_000;
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(valid as never),
    ).not.toThrow();

    for (const score of [89_989_999, -89_990_000]) {
      const malformed = structuredClone(valid);
      malformed.stable.search.raw_search_score = score;
      expect(() =>
        buildFloodgateV7CandidateUnionCoreForTests(malformed as never),
      ).toThrow(/positive mate-band/);
    }
  });

  it("does not invoke hostile proposal-line Proxy traps or accessors", () => {
    const proxyInput = mutableInput();
    let ownKeysCalls = 0;
    proxyInput.runtime.proposal.lines[0] = new Proxy(
      proxyInput.runtime.proposal.lines[0],
      {
        ownKeys() {
          ownKeysCalls += 1;
          return [];
        },
      },
    );
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(proxyInput as never),
    ).toThrow(/non-Proxy/);
    expect(ownKeysCalls).toBe(0);

    const accessorInput = mutableInput();
    let getterCalls = 0;
    Object.defineProperty(accessorInput.runtime.proposal.lines[0], "cp", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 0;
      },
    });
    expect(() =>
      buildFloodgateV7CandidateUnionCoreForTests(accessorInput as never),
    ).toThrow(/data property/);
    expect(getterCalls).toBe(0);
  });

  it("captures synchronously so later caller mutation cannot change the receipt", () => {
    const input = mutableInput();
    const result = buildFloodgateV7CandidateUnionCoreForTests(input as never);
    const serialized = canonicalJson(result);
    input.parent.played_move = input.legal.moves[0];
    input.legal.moves.reverse();
    input.stable.search.nodes += 100;
    input.runtime.proposal.lines[0].cp += 100;
    input.runtime.receipt.snapshot.engine.sha256 = "f".repeat(64);
    expect(canonicalJson(result)).toBe(serialized);
  });
});
