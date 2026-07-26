import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

interface Asset {
  path: string;
  bytes: number;
  sha256: string;
  buckets?: number;
}

interface Plan {
  plan_id: string;
  status: string;
  claim_boundary: {
    not_claimed: string[];
  };
  pinned_inputs: {
    production_wasm: Asset;
    immutable_live_weights: Asset;
  };
  planned_research_artifacts: {
    research_wasm: Asset;
    match_runner: Asset;
  };
  direct_play_gate: {
    games: number;
    opening_pairs: number;
    pair_workers: number;
    milliseconds_per_move: number;
    pass_halfpoints: number;
    score_denominator_halfpoints: number;
    opening_policy: {
      pair_seeds: number[];
      opening_fingerprints: string[];
      intersection_with_predecessor_and_existing_count: number;
    };
    pass_effect: string;
  };
  execution_manifest: {
    experiment_id: string;
    assets: {
      runner: Asset;
      candidate_wasm: Asset;
      production_wasm: Asset;
      weights: Asset;
    };
    match: {
      pairs: number;
      games: number;
      pair_workers: number;
      milliseconds_per_move: number;
      opening_plies: number;
      max_plies: number;
      search_depth: number;
      quiescence_depth: number;
      color_order: string[];
      tt_policy: string;
      book: boolean;
      mate_solver: boolean;
      fallback: boolean;
      pair_seeds: number[];
      pass_halfpoints: number;
      score_denominator_halfpoints: number;
      wall_clock_limit_seconds: number;
    };
  };
}

interface CorrectnessReceipt {
  schema: string;
  plan_sha256: string;
  strength_metric: boolean;
  live_change_authorized: boolean;
  direct_play_authorized: boolean;
  gates: Record<string, boolean>;
  all_gates_passed: boolean;
}

type CandidateResult = "win" | "draw" | "loss";
type CandidateColor = "sente" | "gote";
type Termination =
  | "no-legal-moves"
  | "fourfold-repetition"
  | "perpetual-check"
  | "max-plies";

interface GameReceipt {
  game_index: number;
  candidate_color: CandidateColor;
  candidate_result: CandidateResult;
  termination: Termination;
  plies: number;
  legal_moves_checked: number;
}

interface PairReceipt {
  schema: string;
  plan_sha256: string;
  pair_index: number;
  seed: number;
  opening_fingerprint: string;
  games: GameReceipt[];
  candidate_halfpoints: number;
  technical_fault: boolean;
  receipt_sha256: string;
}

interface RunReceipt {
  schema: string;
  plan_sha256: string;
  correctness_result_sha256: string;
  started_at_ms: number;
  wall_clock_limit_seconds: number;
  deadline_at_ms: number;
}

interface ResultReceipt {
  schema: string;
  plan_sha256: string;
  correctness_result_sha256: string;
  experiment_id: string;
  status: string;
  decision: string;
  strength_conclusion_allowed: boolean;
  completed_pairs: number;
  completed_games: number;
  missing_pairs: number[];
  candidate_wins: number;
  candidate_draws: number;
  candidate_losses: number;
  candidate_halfpoints: number;
  score_denominator_halfpoints: number;
  pass_halfpoints: number;
  maximum_possible_final_halfpoints: number;
  all_observed_openings_unique: boolean;
  all_observed_moves_legal: boolean;
  technical_fault_count: number;
  wall_clock_expired: boolean;
  promotion_authorized: boolean;
  live_weight_write_authorized: boolean;
  result_sha256: string;
}

interface PairFile {
  path: string;
  bytes: Buffer;
  receipt: PairReceipt;
}

const PLAN_SHA256 =
  "dfb82a42fe57565fb6f8d002c48d83530b5979051421465af1bebc1af910de63";
const CORRECTNESS_SHA256 =
  "5529d03cc37df7c359c149d408aa4fdddb4ef95695a4b8291f83fe6e852c314e";
const RUN_FILE_SHA256 =
  "e9630aafac05e1fe8d7ca7be5435913721c83036fb728f73fd6f4476e76bd271";
const RESULT_FILE_SHA256 =
  "ea24dd1c0eef2164892ed54f226154c881418033be90c1d8f0eccf56be11a492";
const RESULT_CONTENT_SHA256 =
  "2780f298051d49a1b8f3a1203828b44e4a701a565c3904955e3a15cf34286296";
const PAIR_MANIFEST_SHA256 =
  "758bce947f40cda53d14606a28e1fa2923b832c67b19f3a21e2223ba411fbb26";
const PAIR_DOMAIN = "shogi-dual-hash-lock-pair-v1\0";
const RESULT_DOMAIN = "shogi-dual-hash-lock-result-v1\0";
const PAIR_MANIFEST_DOMAIN = "shogi-dual-hash-lock-terminal-pair-manifest-v1\0";
const EXPECTED_CORRECTNESS_GATES = [
  "aggregate_candidate_vs_production_at_least",
  "evalCacheIsolated",
  "evalLockRejected",
  "fixturePrimaryCollision",
  "holdout_shape",
  "memory_delta_bytes_at_most",
  "median_candidate_vs_production_at_least",
  "offExactProductionAB",
  "offExactProductionBA",
  "off_arm_completed",
  "off_exact_64",
  "onCleanMovesLegal",
  "onFixesAB",
  "onFixesBA",
  "on_deterministic_64",
  "on_legal_64",
  "p90_wall_regression_at_most",
  "productionCollisionReproduced",
  "repetitionIsolated",
  "repetitionLockRejected",
  "secondaryIncrementalHashes",
  "secondaryLocksDiffer",
  "secondary_incremental_16384",
  "secondary_incremental_64",
  "stateUnchanged",
  "states_unchanged_64",
  "ttLockRejected",
] as const;

const root = process.cwd();
const planPath = join(root, "ml/protocols/dual-hash-lock-v1-plan.json");
const correctnessPath = join(
  root,
  "docs/data/shogi-dual-hash-lock-correctness-raw-2026-07-26.json",
);
const rawDirectory = join(
  root,
  "docs/data/shogi-dual-hash-lock-match-raw-2026-07-26",
);
const pairDirectory = join(rawDirectory, "pairs");
const runPath = join(rawDirectory, "run.json");
const resultPath = join(rawDirectory, "result.json");
const summaryPath = join(
  root,
  "docs/data/shogi-dual-hash-lock-match-result-2026-07-26.json",
);
const productionSnapshotPath = join(
  root,
  "docs/data/shogi-dual-hash-lock-production-wasm-2026-07-25.base64",
);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || Object.is(value, -0))
    ) {
      throw new Error("canonical JSON rejects invalid numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(`canonical JSON rejects ${typeof value}`);
}

function identity(path: string): { bytes: number; sha256: string } {
  const bytes = readFileSync(path);
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function artifactIdentity(asset: Asset): { bytes: number; sha256: string } {
  return { bytes: asset.bytes, sha256: asset.sha256 };
}

function halfpoints(result: CandidateResult): number {
  return result === "win" ? 2 : result === "draw" ? 1 : 0;
}

function exactKeys(value: object, expected: string[]): void {
  expect(Object.keys(value).sort()).toEqual([...expected].sort());
}

const planBytes = readFileSync(planPath);
const plan = JSON.parse(planBytes.toString("utf8")) as Plan;
const correctnessBytes = readFileSync(correctnessPath);
const correctness = JSON.parse(
  correctnessBytes.toString("utf8"),
) as CorrectnessReceipt;
const runBytes = readFileSync(runPath);
const run = JSON.parse(runBytes.toString("utf8")) as RunReceipt;
const resultBytes = readFileSync(resultPath);
const result = JSON.parse(resultBytes.toString("utf8")) as ResultReceipt;
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const pairNames = readdirSync(pairDirectory).sort();
const pairFiles: PairFile[] = pairNames.map((path) => {
  const bytes = readFileSync(join(pairDirectory, path));
  return {
    path,
    bytes,
    receipt: JSON.parse(bytes.toString("utf8")) as PairReceipt,
  };
});

function aggregate() {
  const games = pairFiles.flatMap(({ receipt }) => receipt.games);
  const wins = games.filter((game) => game.candidate_result === "win").length;
  const draws = games.filter((game) => game.candidate_result === "draw").length;
  const losses = games.filter(
    (game) => game.candidate_result === "loss",
  ).length;
  const candidateHalfpoints = pairFiles.reduce(
    (sum, pair) => sum + pair.receipt.candidate_halfpoints,
    0,
  );
  const byColor = (color: CandidateColor) => {
    const selected = games.filter((game) => game.candidate_color === color);
    return {
      wins: selected.filter((game) => game.candidate_result === "win").length,
      draws: selected.filter((game) => game.candidate_result === "draw").length,
      losses: selected.filter((game) => game.candidate_result === "loss")
        .length,
      halfpoints: selected.reduce(
        (sum, game) => sum + halfpoints(game.candidate_result),
        0,
      ),
    };
  };
  const terminationCount = (termination: Termination) =>
    games.filter((game) => game.termination === termination).length;
  return {
    games,
    wins,
    draws,
    losses,
    candidateHalfpoints,
    plies: games.reduce((sum, game) => sum + game.plies, 0),
    legalityChecks: games.reduce(
      (sum, game) => sum + game.legal_moves_checked,
      0,
    ),
    terminations: {
      noLegalMoves: terminationCount("no-legal-moves"),
      fourfoldRepetition: terminationCount("fourfold-repetition"),
      perpetualCheck: terminationCount("perpetual-check"),
      maxPlies: terminationCount("max-plies"),
    },
    byCandidateColor: {
      sente: byColor("sente"),
      gote: byColor("gote"),
    },
  };
}

function pairManifest() {
  return pairFiles.map(({ path, bytes, receipt }) => ({
    path,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    receipt_sha256: receipt.receipt_sha256,
  }));
}

function expectedSummary() {
  const match = plan.execution_manifest.match;
  const totals = aggregate();
  const runIdentity = identity(runPath);
  return {
    schema: "shogi-dual-hash-lock-match-evidence-v1",
    name: "Dual-hash lock formal direct-play non-regression result",
    status: result.status === "PASS" ? "passed" : "failed",
    recordedAt: "2026-07-26",
    recordedAtScope:
      "repository-report-date-only-not-an-execution-finish-timestamp",
    preregistration: {
      planId: plan.plan_id,
      path: "ml/protocols/dual-hash-lock-v1-plan.json",
      ...identity(planPath),
      status: plan.status,
      mergeCommit: "5c5b82c2b7838bc236fcaa29440cbda1f80539f7",
    },
    correctnessAuthorization: {
      path: "docs/data/shogi-dual-hash-lock-correctness-raw-2026-07-26.json",
      ...identity(correctnessPath),
      allGatesPassed: correctness.all_gates_passed,
      directPlayAuthorized: correctness.direct_play_authorized,
      liveChangeAuthorized: correctness.live_change_authorized,
      strengthMetric: correctness.strength_metric,
    },
    rawEvidence: {
      run: {
        trackedPath:
          "docs/data/shogi-dual-hash-lock-match-raw-2026-07-26/run.json",
        bytes: runIdentity.bytes,
        fileSha256: runIdentity.sha256,
        schema: run.schema,
        startedAtMs: run.started_at_ms,
        wallClockLimitSeconds: run.wall_clock_limit_seconds,
        deadlineAtMs: run.deadline_at_ms,
      },
      result: {
        trackedPath:
          "docs/data/shogi-dual-hash-lock-match-raw-2026-07-26/result.json",
        bytes: resultBytes.byteLength,
        fileSha256: sha256(resultBytes),
        internalContentSeal: {
          domain: RESULT_DOMAIN,
          scope: "canonical result body excluding the result_sha256 field",
          sha256: result.result_sha256,
        },
      },
      pairReceipts: {
        trackedDirectory:
          "docs/data/shogi-dual-hash-lock-match-raw-2026-07-26/pairs",
        filePattern: "pair-0000.json..pair-0047.json",
        files: pairFiles.length,
        totalBytes: pairFiles.reduce(
          (sum, pair) => sum + pair.bytes.byteLength,
          0,
        ),
        manifest: {
          domain: PAIR_MANIFEST_DOMAIN,
          canonicalProjection:
            "pair-index-sorted array of {path,bytes,sha256,receipt_sha256}",
          sha256: sha256(
            `${PAIR_MANIFEST_DOMAIN}${canonicalJson(pairManifest())}`,
          ),
        },
      },
    },
    execution: {
      matchRunner: plan.planned_research_artifacts.match_runner,
      candidateWasm: plan.planned_research_artifacts.research_wasm,
      productionBaselineWasm: {
        planPath: plan.pinned_inputs.production_wasm.path,
        snapshotPath:
          "docs/data/shogi-dual-hash-lock-production-wasm-2026-07-25.base64",
        snapshotEncoding: "base64",
        decodedBytes: plan.pinned_inputs.production_wasm.bytes,
        decodedSha256: plan.pinned_inputs.production_wasm.sha256,
      },
      sharedWeights: plan.pinned_inputs.immutable_live_weights,
      settings: {
        pairs: match.pairs,
        games: match.games,
        pairWorkers: match.pair_workers,
        millisecondsPerMove: match.milliseconds_per_move,
        openingPlies: match.opening_plies,
        maxPlies: match.max_plies,
        searchDepth: match.search_depth,
        quiescenceDepth: match.quiescence_depth,
        colorOrder: match.color_order,
        transpositionTablePolicy: match.tt_policy,
        book: match.book,
        mateSolver: match.mate_solver,
        fallback: match.fallback,
      },
    },
    observed: {
      completedPairs: result.completed_pairs,
      completedGames: result.completed_games,
      missingPairs: result.missing_pairs,
      candidateWins: totals.wins,
      candidateDraws: totals.draws,
      candidateLosses: totals.losses,
      candidateHalfpoints: totals.candidateHalfpoints,
      scoreDenominatorHalfpoints: result.score_denominator_halfpoints,
      scoreRate:
        totals.candidateHalfpoints / result.score_denominator_halfpoints,
      passHalfpoints: result.pass_halfpoints,
      passRate: result.pass_halfpoints / result.score_denominator_halfpoints,
      maximumPossibleFinalHalfpoints: result.maximum_possible_final_halfpoints,
      plies: totals.plies,
      runnerLegalityChecks: totals.legalityChecks,
      allObservedMoveKeysPassedRunnerLegalityChecks:
        result.all_observed_moves_legal,
      openingFingerprintsUnique: new Set(
        pairFiles.map((pair) => pair.receipt.opening_fingerprint),
      ).size,
      openingIntersectionWithPinnedHistoricalUnion:
        plan.direct_play_gate.opening_policy
          .intersection_with_predecessor_and_existing_count,
      technicalFaultCount: result.technical_fault_count,
      wallClockExpired: result.wall_clock_expired,
      terminations: totals.terminations,
      byCandidateColor: totals.byCandidateColor,
    },
    decision: {
      status: result.status,
      decision: result.decision,
      strengthConclusionAllowed: result.strength_conclusion_allowed,
      meaning:
        "The research candidate passed the preregistered bounded non-regression screen. The 50.00% observed score does not establish a strength gain.",
    },
    authorization: {
      nextStepAllowedByPlan:
        "Permit work on a separate production implementation and browser-validation PR for review.",
      promotionAuthorized: result.promotion_authorized,
      mergeAuthorizedByThisResult: false,
      deploymentAuthorized: false,
      liveChangeAuthorized: false,
      liveWeightWriteAuthorized: result.live_weight_write_authorized,
      strengthGainClaimAuthorized: false,
      highDanClaimAuthorized: false,
    },
    integrityLimitations: [
      "Each pair receipt binds to the fixed plan SHA but does not contain the correctness receipt SHA or a run receipt identifier.",
      "The terminal result does not contain the run.json SHA or a cryptographic root of the 48 pair receipts, so the tracked evidence test links those records independently.",
      "Pair receipts retain outcomes, termination, plies, and legality-check counts but not complete move transcripts; independent replay of every observed move is therefore unavailable.",
      "The run receipt contains a start and deadline but the terminal receipt contains no authenticated finish timestamp, so no exact elapsed-time claim is made.",
      "The receipts are integrity hashes rather than an external signature or third-party execution attestation.",
      "The match covers the isolated WASM direct-play path without the live browser host, JavaScript fallback, shared transposition table, opening book, or mate solver.",
    ],
    claimBoundary: {
      supported:
        "The fixed research WASM completed the preregistered direct screen at 47 wins, 47 losses, and two draws, passed its 82/192 bounded non-regression floor, and recorded zero technical faults.",
      notClaimed: [
        "The candidate is stronger than production or gained Elo.",
        "The engine has reached high-dan strength.",
        "The live browser engine has changed or passed full-path validation.",
        "The direct screen authorizes promotion, merge, deployment, or a live-weight change.",
      ],
    },
  };
}

describe("dual hash lock terminal match evidence", () => {
  it("authenticates the fixed plan, correctness authorization, and historical assets", () => {
    expect(identity(planPath)).toEqual({
      bytes: 14242,
      sha256: PLAN_SHA256,
    });
    expect(identity(correctnessPath)).toEqual({
      bytes: 34210,
      sha256: CORRECTNESS_SHA256,
    });
    expect(correctness).toMatchObject({
      schema: "shogi-dual-hash-lock-correctness-result-v1",
      plan_sha256: PLAN_SHA256,
      strength_metric: false,
      live_change_authorized: false,
      direct_play_authorized: true,
      all_gates_passed: true,
    });
    expect(Object.keys(correctness.gates).sort()).toEqual(
      [...EXPECTED_CORRECTNESS_GATES].sort(),
    );
    expect(Object.values(correctness.gates).every(Boolean)).toBe(true);
    expect(plan.execution_manifest.assets.runner).toEqual(
      plan.planned_research_artifacts.match_runner,
    );
    expect(plan.execution_manifest.assets.candidate_wasm).toEqual(
      plan.planned_research_artifacts.research_wasm,
    );
    expect(plan.execution_manifest.assets.production_wasm).toEqual(
      plan.pinned_inputs.production_wasm,
    );
    expect(plan.execution_manifest.assets.weights).toEqual(
      plan.pinned_inputs.immutable_live_weights,
    );
    for (const asset of [
      plan.planned_research_artifacts.match_runner,
      plan.planned_research_artifacts.research_wasm,
      plan.pinned_inputs.immutable_live_weights,
    ]) {
      expect(identity(join(root, asset.path))).toEqual(artifactIdentity(asset));
    }
    const encoded = readFileSync(productionSnapshotPath, "utf8").trim();
    const productionBytes = Buffer.from(encoded, "base64");
    expect(productionBytes.toString("base64")).toBe(encoded);
    expect({
      bytes: productionBytes.byteLength,
      sha256: sha256(productionBytes),
    }).toEqual(artifactIdentity(plan.pinned_inputs.production_wasm));
  });

  it("preserves and binds the durable run and terminal result receipts", () => {
    for (const path of [runPath, resultPath]) {
      expect(lstatSync(path).isFile()).toBe(true);
      expect(lstatSync(path).isSymbolicLink()).toBe(false);
    }
    expect(identity(runPath)).toEqual({
      bytes: 310,
      sha256: RUN_FILE_SHA256,
    });
    expect(identity(resultPath)).toEqual({
      bytes: 839,
      sha256: RESULT_FILE_SHA256,
    });
    exactKeys(run, [
      "correctness_result_sha256",
      "deadline_at_ms",
      "plan_sha256",
      "schema",
      "started_at_ms",
      "wall_clock_limit_seconds",
    ]);
    expect(run).toEqual({
      schema: "shogi-dual-hash-lock-run-v1",
      plan_sha256: PLAN_SHA256,
      correctness_result_sha256: CORRECTNESS_SHA256,
      started_at_ms: 1785053532271,
      wall_clock_limit_seconds: 7200,
      deadline_at_ms: 1785060732271,
    });
    expect(run.deadline_at_ms - run.started_at_ms).toBe(7_200_000);

    exactKeys(result, [
      "all_observed_moves_legal",
      "all_observed_openings_unique",
      "candidate_draws",
      "candidate_halfpoints",
      "candidate_losses",
      "candidate_wins",
      "completed_games",
      "completed_pairs",
      "correctness_result_sha256",
      "decision",
      "experiment_id",
      "live_weight_write_authorized",
      "maximum_possible_final_halfpoints",
      "missing_pairs",
      "pass_halfpoints",
      "plan_sha256",
      "promotion_authorized",
      "result_sha256",
      "schema",
      "score_denominator_halfpoints",
      "status",
      "strength_conclusion_allowed",
      "technical_fault_count",
      "wall_clock_expired",
    ]);
    const resultBody = { ...result } as Record<string, unknown>;
    delete resultBody.result_sha256;
    expect(sha256(`${RESULT_DOMAIN}${canonicalJson(resultBody)}`)).toBe(
      RESULT_CONTENT_SHA256,
    );
    expect(result.result_sha256).toBe(RESULT_CONTENT_SHA256);
    expect(result.plan_sha256).toBe(PLAN_SHA256);
    expect(result.correctness_result_sha256).toBe(CORRECTNESS_SHA256);
    expect(RESULT_FILE_SHA256).not.toBe(RESULT_CONTENT_SHA256);
  });

  it("independently authenticates all 48 pair receipts and their plan mapping", () => {
    expect(pairNames).toEqual(
      Array.from(
        { length: 48 },
        (_, index) => `pair-${String(index).padStart(4, "0")}.json`,
      ),
    );
    expect(plan.execution_manifest.match.pair_seeds).toEqual(
      plan.direct_play_gate.opening_policy.pair_seeds,
    );
    expect(
      plan.direct_play_gate.opening_policy.opening_fingerprints,
    ).toHaveLength(48);
    for (const [index, pairFile] of pairFiles.entries()) {
      expect(lstatSync(join(pairDirectory, pairFile.path)).isFile()).toBe(true);
      expect(
        lstatSync(join(pairDirectory, pairFile.path)).isSymbolicLink(),
      ).toBe(false);
      const pair = pairFile.receipt;
      exactKeys(pair, [
        "candidate_halfpoints",
        "games",
        "opening_fingerprint",
        "pair_index",
        "plan_sha256",
        "receipt_sha256",
        "schema",
        "seed",
        "technical_fault",
      ]);
      expect(pair).toMatchObject({
        schema: "shogi-dual-hash-lock-pair-v1",
        plan_sha256: PLAN_SHA256,
        pair_index: index,
        seed: plan.execution_manifest.match.pair_seeds[index],
        opening_fingerprint:
          plan.direct_play_gate.opening_policy.opening_fingerprints[index],
        technical_fault: false,
      });
      expect(pair.games).toHaveLength(2);
      for (const [gameIndex, game] of pair.games.entries()) {
        exactKeys(game, [
          "candidate_color",
          "candidate_result",
          "game_index",
          "legal_moves_checked",
          "plies",
          "termination",
        ]);
        expect(game.game_index).toBe(gameIndex);
        expect(game.candidate_color).toBe(gameIndex === 0 ? "sente" : "gote");
        expect(["win", "draw", "loss"]).toContain(game.candidate_result);
        expect([
          "no-legal-moves",
          "fourfold-repetition",
          "perpetual-check",
          "max-plies",
        ]).toContain(game.termination);
        expect(Number.isSafeInteger(game.plies)).toBe(true);
        expect(game.plies).toBeGreaterThanOrEqual(
          plan.execution_manifest.match.opening_plies,
        );
        expect(game.plies).toBeLessThanOrEqual(
          plan.execution_manifest.match.max_plies,
        );
        expect(game.legal_moves_checked).toBe(
          game.plies - plan.execution_manifest.match.opening_plies,
        );
      }
      expect(pair.candidate_halfpoints).toBe(
        pair.games.reduce(
          (sum, game) => sum + halfpoints(game.candidate_result),
          0,
        ),
      );
      const pairBody = { ...pair } as Record<string, unknown>;
      delete pairBody.receipt_sha256;
      expect(sha256(`${PAIR_DOMAIN}${canonicalJson(pairBody)}`)).toBe(
        pair.receipt_sha256,
      );
    }
    expect(
      new Set(pairFiles.map((pair) => pair.receipt.receipt_sha256)).size,
    ).toBe(48);
    expect(
      new Set(pairFiles.map((pair) => pair.receipt.opening_fingerprint)).size,
    ).toBe(48);
    expect(
      sha256(`${PAIR_MANIFEST_DOMAIN}${canonicalJson(pairManifest())}`),
    ).toBe(PAIR_MANIFEST_SHA256);
  });

  it("recomputes the complete aggregate and bounded PASS without a strength claim", () => {
    const totals = aggregate();
    expect(totals).toMatchObject({
      wins: 47,
      draws: 2,
      losses: 47,
      candidateHalfpoints: 96,
      plies: 11739,
      legalityChecks: 11163,
      terminations: {
        noLegalMoves: 93,
        fourfoldRepetition: 1,
        perpetualCheck: 1,
        maxPlies: 1,
      },
      byCandidateColor: {
        sente: { wins: 27, draws: 1, losses: 20, halfpoints: 55 },
        gote: { wins: 20, draws: 1, losses: 27, halfpoints: 41 },
      },
    });
    expect(result).toMatchObject({
      schema: "shogi-dual-hash-lock-result-v1",
      experiment_id: plan.execution_manifest.experiment_id,
      status: "PASS",
      decision: "pass",
      strength_conclusion_allowed: true,
      completed_pairs: 48,
      completed_games: 96,
      missing_pairs: [],
      candidate_wins: totals.wins,
      candidate_draws: totals.draws,
      candidate_losses: totals.losses,
      candidate_halfpoints: totals.candidateHalfpoints,
      score_denominator_halfpoints: 192,
      pass_halfpoints: 82,
      maximum_possible_final_halfpoints: totals.candidateHalfpoints,
      all_observed_openings_unique: true,
      all_observed_moves_legal: true,
      technical_fault_count: 0,
      wall_clock_expired: false,
      promotion_authorized: false,
      live_weight_write_authorized: false,
    });
    expect(result.candidate_halfpoints).toBeGreaterThanOrEqual(
      plan.direct_play_gate.pass_halfpoints,
    );
    expect(
      result.candidate_halfpoints / result.score_denominator_halfpoints,
    ).toBe(0.5);
    expect(result.promotion_authorized).toBe(false);
    expect(result.live_weight_write_authorized).toBe(false);
  });

  it("projects the readable summary exactly and preserves every limitation", () => {
    expect(summary).toEqual(expectedSummary());
    expect(summary.authorization).toMatchObject({
      promotionAuthorized: false,
      mergeAuthorizedByThisResult: false,
      deploymentAuthorized: false,
      liveChangeAuthorized: false,
      liveWeightWriteAuthorized: false,
      strengthGainClaimAuthorized: false,
      highDanClaimAuthorized: false,
    });
    expect(summary.integrityLimitations).toHaveLength(6);
    expect(summary.rawEvidence.result.fileSha256).toBe(RESULT_FILE_SHA256);
    expect(summary.rawEvidence.result.internalContentSeal.sha256).toBe(
      RESULT_CONTENT_SHA256,
    );
    expect(summary.rawEvidence.result.fileSha256).not.toBe(
      summary.rawEvidence.result.internalContentSeal.sha256,
    );
  });
});
