import { createHash, randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { GOTE, SENTE } from "../../../src/components/game/ShogiImproved/types";
import {
  SEARCH_WASM_DENOMINATOR_HALFPOINTS,
  SEARCH_WASM_GAMES,
  SEARCH_WASM_MOVE_MS,
  SEARCH_WASM_OPENING_PLIES,
  SEARCH_WASM_PAIR_SCHEMA,
  SEARCH_WASM_PAIR_WORKERS,
  SEARCH_WASM_PAIRS,
  SEARCH_WASM_PASS_HALFPOINTS,
  SEARCH_WASM_PLAN_SCHEMA,
  SEARCH_WASM_QUIESCENCE_DEPTH,
  SEARCH_WASM_RUNNER_PATH,
  SEARCH_WASM_SEARCH_DEPTH,
  SEARCH_WASM_TT_POLICY,
  SEARCH_WASM_WALL_SECONDS,
  analyzeSearchWasmScreen,
  buildSearchWasmOpening,
  configureSearchWasmResearchToggle,
  initializeSearchWasmRun,
  loadSearchWasmPlan,
  parseSearchWasmCli,
  runSearchWasmCoordinator,
  searchWasmCanonicalJson,
  searchWasmOpeningSetSha256,
  searchWasmRepetitionOutcome,
  validateSearchWasmOutputDir,
  validateSearchWasmPlan,
  verifySearchWasmResearchToggle,
  type SearchWasmGameReceipt,
  type SearchWasmPairReceipt,
  type SearchWasmPlan,
} from "../../../wasm-spike/match-search-wasm-vs-production";

const PAIR_DIGEST_DOMAIN = "shogi-search-wasm-vs-production-pair-v1\0";
const PLAN_SHA = "a".repeat(64);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function realRunnerAssets(): SearchWasmPlan["assets"] {
  const bytes = readFileSync(resolve(process.cwd(), SEARCH_WASM_RUNNER_PATH));
  const asset = {
    path: SEARCH_WASM_RUNNER_PATH,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  return {
    runner: asset,
    candidate_wasm: asset,
    production_wasm: asset,
    weights: { ...asset, buckets: 1 },
  };
}

function plan(overrides: Record<string, unknown> = {}): SearchWasmPlan {
  const pairSeeds = Array.from(
    { length: SEARCH_WASM_PAIRS },
    (_, index) => 910_001 + index,
  );
  return {
    schema: SEARCH_WASM_PLAN_SCHEMA,
    experiment_id: "bounded-quiet-history-malus-v1",
    assets: {
      runner: {
        path: SEARCH_WASM_RUNNER_PATH,
        bytes: 1,
        sha256: "2".repeat(64),
      },
      candidate_wasm: {
        path: "wasm-spike/artifacts/candidate.wasm",
        bytes: 2,
        sha256: "3".repeat(64),
      },
      production_wasm: {
        path: "src/components/game/ShogiImproved/wasm/shogi.wasm",
        bytes: 3,
        sha256: "4".repeat(64),
      },
      weights: {
        path: "public/shogi-nnue-weights.bin",
        bytes: 4,
        sha256: "5".repeat(64),
        buckets: 81,
      },
    },
    match: {
      pairs: SEARCH_WASM_PAIRS,
      games: SEARCH_WASM_GAMES,
      pair_workers: SEARCH_WASM_PAIR_WORKERS,
      milliseconds_per_move: SEARCH_WASM_MOVE_MS,
      opening_plies: SEARCH_WASM_OPENING_PLIES,
      max_plies: 256,
      search_depth: SEARCH_WASM_SEARCH_DEPTH,
      quiescence_depth: SEARCH_WASM_QUIESCENCE_DEPTH,
      scale_k: 600,
      scale_numer: 1,
      scale_denom: 1,
      color_order: ["candidate-sente", "candidate-gote"],
      tt_policy: SEARCH_WASM_TT_POLICY,
      book: false,
      mate_solver: false,
      fallback: false,
      pair_seeds: pairSeeds,
      opening_set_sha256: searchWasmOpeningSetSha256(pairSeeds),
      pass_halfpoints: SEARCH_WASM_PASS_HALFPOINTS,
      score_denominator_halfpoints: SEARCH_WASM_DENOMINATOR_HALFPOINTS,
      early_stop: "mathematical-futility-only",
      wall_clock_limit_seconds: SEARCH_WASM_WALL_SECONDS,
      wall_clock_expiry: "STOP-no-conclusion",
    },
    safety: {
      research_only: true,
      local_only: true,
      network: false,
      live_weight_write: false,
    },
    ...overrides,
  };
}

function game(
  gameIndex: 0 | 1,
  result: "win" | "draw" | "loss",
): SearchWasmGameReceipt {
  return {
    game_index: gameIndex,
    candidate_color: gameIndex === 0 ? "sente" : "gote",
    candidate_result: result,
    termination: "max-plies",
    plies: 256,
    legal_moves_checked: 250,
  };
}

function halfpoints(result: SearchWasmGameReceipt["candidate_result"]): number {
  return result === "win" ? 2 : result === "draw" ? 1 : 0;
}

function pair(
  capturedPlan: SearchWasmPlan,
  pairIndex: number,
  first: "win" | "draw" | "loss",
  second: "win" | "draw" | "loss",
): SearchWasmPairReceipt {
  const games = [game(0, first), game(1, second)] as const;
  const body = {
    schema: SEARCH_WASM_PAIR_SCHEMA,
    plan_sha256: PLAN_SHA,
    pair_index: pairIndex,
    seed: capturedPlan.match.pair_seeds[pairIndex],
    opening_fingerprint: buildSearchWasmOpening(
      capturedPlan.match.pair_seeds[pairIndex],
    ).fingerprint,
    games,
    candidate_halfpoints: halfpoints(first) + halfpoints(second),
    technical_fault: false as const,
  };
  return {
    ...body,
    receipt_sha256: sha256(
      `${PAIR_DIGEST_DOMAIN}${searchWasmCanonicalJson(body)}`,
    ),
  };
}

describe("search WASM vs production research runner", () => {
  it("fails closed when the live production WASM advances beyond the historical preregistration", () => {
    const path = resolve(
      process.cwd(),
      "ml/protocols/bounded-quiet-history-malus-v1-plan.json",
    );
    const bytes = readFileSync(path);
    const plan = JSON.parse(bytes.toString("utf8"));
    expect(() =>
      loadSearchWasmPlan(
        path,
        createHash("sha256").update(bytes).digest("hex"),
      ),
    ).toThrow(/production WASM file identity differs/);

    // The exact old production bytes remain independently authenticated for the historical
    // receipts; silently re-running that sealed experiment against the promoted runtime is
    // forbidden.
    const encoded = readFileSync(
      resolve(
        process.cwd(),
        "docs/data/shogi-dual-hash-lock-production-wasm-2026-07-25.base64",
      ),
      "utf8",
    );
    const snapshot = Buffer.from(encoded, "base64");
    expect(snapshot.byteLength).toBe(
      plan.execution_manifest.assets.production_wasm.bytes,
    );
    expect(createHash("sha256").update(snapshot).digest("hex")).toBe(
      plan.execution_manifest.assets.production_wasm.sha256,
    );
  });

  it("accepts only the fixed 28-pair, 12-worker, 1500ms research contract", () => {
    const captured = validateSearchWasmPlan(plan());

    expect(captured.match).toMatchObject({
      pairs: 28,
      games: 56,
      pair_workers: 12,
      milliseconds_per_move: 1500,
      pass_halfpoints: 62,
      score_denominator_halfpoints: 112,
      tt_policy: "clear-before-each-game-retain-within-game",
      book: false,
      mate_solver: false,
      fallback: false,
      wall_clock_limit_seconds: 7200,
      wall_clock_expiry: "STOP-no-conclusion",
    });
    expect(captured.safety).toEqual({
      research_only: true,
      local_only: true,
      network: false,
      live_weight_write: false,
    });
  });

  it("rejects worker-count, runtime-identity, and opening-set drift", () => {
    const workerDrift = plan();
    expect(() =>
      validateSearchWasmPlan({
        ...workerDrift,
        match: { ...workerDrift.match, pair_workers: 7 },
      }),
    ).toThrow(/fixed screen/u);

    const sameRuntime = plan();
    expect(() =>
      validateSearchWasmPlan({
        ...sameRuntime,
        assets: {
          ...sameRuntime.assets,
          production_wasm: { ...sameRuntime.assets.candidate_wasm },
        },
      }),
    ).toThrow(/must differ/u);

    const openingDrift = plan();
    expect(() =>
      validateSearchWasmPlan({
        ...openingDrift,
        match: {
          ...openingDrift.match,
          opening_set_sha256: "f".repeat(64),
        },
      }),
    ).toThrow(/opening set digest/u);
  });

  it("builds deterministic, fresh, quiet paired openings", () => {
    const captured = validateSearchWasmPlan(plan());
    const first = captured.match.pair_seeds.map((seed) =>
      buildSearchWasmOpening(seed),
    );
    const second = captured.match.pair_seeds.map((seed) =>
      buildSearchWasmOpening(seed),
    );

    expect(first.map((entry) => entry.fingerprint)).toEqual(
      second.map((entry) => entry.fingerprint),
    );
    expect(new Set(first.map((entry) => entry.fingerprint)).size).toBe(28);
    expect(first.every((entry) => entry.moves.length === 6)).toBe(true);
    expect(
      first.every((entry) =>
        entry.moves.every(
          (move) => move.from !== 0 && move.capture === 0 && !move.promote,
        ),
      ),
    ).toBe(true);
  });

  it("requires the candidate toggle ON and the production toggle absent", () => {
    let enabled = 0;
    const candidate = {
      setResearchQuietHistoryMalus(flag: number) {
        enabled = flag;
      },
      getResearchQuietHistoryMalusEnabled() {
        return enabled;
      },
    };
    const production = {};

    configureSearchWasmResearchToggle(candidate, "candidate");
    configureSearchWasmResearchToggle(production, "production");
    verifySearchWasmResearchToggle(candidate, production);
    expect(enabled).toBe(1);
    expect(() => configureSearchWasmResearchToggle({}, "candidate")).toThrow(
      /lacks/u,
    );
    expect(() =>
      configureSearchWasmResearchToggle(candidate, "production"),
    ).toThrow(/unexpectedly exposes/u);

    enabled = 0;
    expect(() => verifySearchWasmResearchToggle(candidate, production)).toThrow(
      /drifted/u,
    );
  });

  it("counts exactly 62 of 112 halfpoints as a complete pass", () => {
    const captured = validateSearchWasmPlan(plan());
    const gameResults = [
      ...Array.from({ length: 31 }, () => "win" as const),
      ...Array.from({ length: 25 }, () => "loss" as const),
    ];
    const pairs = Array.from({ length: 28 }, (_, index) =>
      pair(captured, index, gameResults[index * 2], gameResults[index * 2 + 1]),
    );
    const result = analyzeSearchWasmScreen(captured, PLAN_SHA, pairs);

    expect(result).toMatchObject({
      status: "PASS",
      decision: "pass",
      strength_conclusion_allowed: true,
      candidate_halfpoints: 62,
      score_denominator_halfpoints: 112,
      completed_pairs: 28,
      missing_pairs: [],
      promotion_authorized: false,
      live_weight_write_authorized: false,
    });
  });

  it("allows only mathematical futility as a partial strength conclusion", () => {
    const captured = validateSearchWasmPlan(plan());
    const pairs = Array.from({ length: 13 }, (_, index) =>
      pair(captured, index, "loss", "loss"),
    );
    const result = analyzeSearchWasmScreen(captured, PLAN_SHA, pairs);

    expect(result).toMatchObject({
      status: "REJECTED-futility",
      decision: "reject",
      strength_conclusion_allowed: true,
      candidate_halfpoints: 0,
      score_denominator_halfpoints: 112,
      maximum_possible_final_halfpoints: 60,
    });
  });

  it("turns a two-hour wall stop into STOP with no conclusion", () => {
    const captured = validateSearchWasmPlan(plan());
    const pairs = Array.from({ length: 20 }, (_, index) =>
      pair(captured, index, "win", "win"),
    );
    const result = analyzeSearchWasmScreen(captured, PLAN_SHA, pairs, {
      stop_reason: "wall-clock",
    });

    expect(result).toMatchObject({
      status: "STOP-wall-clock-no-conclusion",
      decision: "no-conclusion",
      strength_conclusion_allowed: false,
      wall_clock_expired: true,
      candidate_halfpoints: 80,
      score_denominator_halfpoints: 112,
    });
  });

  it("adjudicates one-sided perpetual check as a loss and other repetition as a draw", () => {
    const perpetual = searchWasmRepetitionOutcome(
      [0, 4, 8, 12],
      Array.from({ length: 12 }, (_, index) => ({
        mover: index % 2 === 0 ? SENTE : GOTE,
        gave_check: index % 2 === 0,
      })),
    );
    expect(perpetual).toEqual({
      termination: "perpetual-check",
      loser: SENTE,
    });

    const ordinary = searchWasmRepetitionOutcome(
      [0, 4, 8, 12],
      Array.from({ length: 12 }, (_, index) => ({
        mover: index % 2 === 0 ? SENTE : GOTE,
        gave_check: false,
      })),
    );
    expect(ordinary).toEqual({
      termination: "fourfold-repetition",
      loser: null,
    });
  });

  it("rejects pair evidence whose legal-move count does not cover every played move", () => {
    const captured = validateSearchWasmPlan(plan());
    const valid = pair(captured, 0, "draw", "draw");
    const games = [
      { ...valid.games[0], legal_moves_checked: 249 },
      valid.games[1],
    ] as const;
    const body = {
      schema: valid.schema,
      plan_sha256: valid.plan_sha256,
      pair_index: valid.pair_index,
      seed: valid.seed,
      opening_fingerprint: valid.opening_fingerprint,
      games,
      candidate_halfpoints: valid.candidate_halfpoints,
      technical_fault: false as const,
    };
    const invalid = {
      ...body,
      receipt_sha256: sha256(
        `${PAIR_DIGEST_DOMAIN}${searchWasmCanonicalJson(body)}`,
      ),
    };

    expect(() =>
      analyzeSearchWasmScreen(captured, PLAN_SHA, [invalid]),
    ).toThrow(/pair game 0 is invalid/u);
  });

  it("pins the original two-hour deadline across resume and restricts output to the research root", () => {
    const output = resolve(
      homedir(),
      ".codex",
      "shogi-runs",
      `unit-${process.pid}-${randomUUID()}`,
    );
    const assets = realRunnerAssets();

    try {
      const validated = validateSearchWasmOutputDir(output, assets);
      const first = initializeSearchWasmRun(validated, PLAN_SHA, 1_000);
      const resumed = initializeSearchWasmRun(validated, PLAN_SHA, 9_000_000);

      expect(first).toEqual({
        schema: "shogi-search-wasm-vs-production-run-v1",
        plan_sha256: PLAN_SHA,
        started_at_ms: 1_000,
        wall_clock_limit_seconds: 7_200,
        deadline_at_ms: 7_201_000,
      });
      expect(resumed).toEqual(first);
      expect(() =>
        initializeSearchWasmRun(validated, "b".repeat(64), 2_000),
      ).toThrow(/durable run receipt is invalid/u);
      expect(() =>
        validateSearchWasmOutputDir("/tmp/shogi-run", assets),
      ).toThrow(/research-only path|shogi-runs/u);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  it("makes fault and wall-stop outcomes terminal across coordinator restarts", async () => {
    const root = resolve(homedir(), ".codex", "shogi-runs");
    const faultOutput = resolve(
      root,
      `unit-fault-${process.pid}-${randomUUID()}`,
    );
    const wallOutput = resolve(
      root,
      `unit-wall-${process.pid}-${randomUUID()}`,
    );
    const captured = validateSearchWasmPlan(plan());
    const outerPlanPath = resolve(
      process.cwd(),
      "ml/protocols/bounded-quiet-history-malus-v1-plan.json",
    );
    const outerPlanBytes = readFileSync(outerPlanPath);
    const runPlanSha = createHash("sha256")
      .update(outerPlanBytes)
      .digest("hex");
    const evidencePath =
      "ml/protocols/bounded-quiet-history-existing-openings-v1.json";
    const evidenceBytes = readFileSync(resolve(process.cwd(), evidencePath));
    const loaded = {
      path: outerPlanPath,
      sha256: runPlanSha,
      plan: {
        ...captured,
        assets: realRunnerAssets(),
      } as SearchWasmPlan,
      evidenceAsset: {
        path: evidencePath,
        bytes: evidenceBytes.byteLength,
        sha256: createHash("sha256").update(evidenceBytes).digest("hex"),
      },
    };

    try {
      const faultDir = validateSearchWasmOutputDir(
        faultOutput,
        loaded.plan.assets,
      );
      initializeSearchWasmRun(faultDir, runPlanSha, Date.now());
      writeFileSync(
        resolve(faultDir, "fault.json"),
        `${JSON.stringify({
          schema: "shogi-search-wasm-vs-production-fault-v1",
          plan_sha256: runPlanSha,
          pair_index: 0,
          error_kind: "worker-process",
          error_sha256: "c".repeat(64),
          technical_fault_count: 1,
          strength_conclusion_allowed: false,
          selective_continuation_authorized: false,
        })}\n`,
      );
      const faultFirst = await runSearchWasmCoordinator(loaded, faultDir);
      const faultRestart = await runSearchWasmCoordinator(loaded, faultDir);
      expect(faultFirst).toMatchObject({
        status: "FAIL-closed-technical-fault",
        technical_fault_count: 1,
        strength_conclusion_allowed: false,
      });
      expect(faultRestart).toEqual(faultFirst);

      const wallDir = validateSearchWasmOutputDir(
        wallOutput,
        loaded.plan.assets,
      );
      initializeSearchWasmRun(
        wallDir,
        runPlanSha,
        Date.now() - SEARCH_WASM_WALL_SECONDS * 1_000 - 1,
      );
      const wallFirst = await runSearchWasmCoordinator(loaded, wallDir);
      const wallRestart = await runSearchWasmCoordinator(loaded, wallDir);
      expect(wallFirst).toMatchObject({
        status: "STOP-wall-clock-no-conclusion",
        wall_clock_expired: true,
        strength_conclusion_allowed: false,
      });
      expect(wallRestart).toEqual(wallFirst);
    } finally {
      rmSync(faultOutput, { recursive: true, force: true });
      rmSync(wallOutput, { recursive: true, force: true });
    }
  });

  it("fails closed on a fault, ordinary missing pairs, or duplicate pair evidence", () => {
    const captured = validateSearchWasmPlan(plan());
    const one = pair(captured, 0, "draw", "draw");

    expect(
      analyzeSearchWasmScreen(captured, PLAN_SHA, [one], {
        stop_reason: "technical-fault",
        technical_fault_count: 1,
      }),
    ).toMatchObject({
      status: "FAIL-closed-technical-fault",
      decision: "no-conclusion",
      strength_conclusion_allowed: false,
    });
    expect(analyzeSearchWasmScreen(captured, PLAN_SHA, [one])).toMatchObject({
      status: "FAIL-closed-incomplete",
      decision: "no-conclusion",
      strength_conclusion_allowed: false,
    });
    expect(() =>
      analyzeSearchWasmScreen(captured, PLAN_SHA, [one, one]),
    ).toThrow(/indices repeat/u);
  });

  it("requires a plan hash and keeps coordinator and worker CLIs disjoint", () => {
    expect(
      parseSearchWasmCli([
        "--plan",
        "/tmp/plan.json",
        "--plan-sha",
        PLAN_SHA,
        "--output-dir",
        "/tmp/out",
      ]),
    ).toMatchObject({ worker: false, pairIndex: null });
    expect(
      parseSearchWasmCli([
        "--worker",
        "--plan",
        "/tmp/plan.json",
        "--plan-sha",
        PLAN_SHA,
        "--pair-index",
        "4",
      ]),
    ).toMatchObject({ worker: true, pairIndex: 4 });
    expect(() =>
      parseSearchWasmCli([
        "--plan",
        "/tmp/plan.json",
        "--plan-sha",
        PLAN_SHA,
        "--pair-index",
        "4",
      ]),
    ).toThrow(/coordinator/u);
    expect(() =>
      parseSearchWasmCli([
        "--worker",
        "--plan",
        "/tmp/plan.json",
        "--plan-sha",
        PLAN_SHA,
        "--pair-index",
        "4",
        "--output-dir",
        "/tmp/out",
      ]),
    ).toThrow(/worker/u);
  });
});
