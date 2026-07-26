import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DUAL_HASH_LOCK_DENOMINATOR_HALFPOINTS,
  DUAL_HASH_LOCK_CORRECTNESS_GATES,
  DUAL_HASH_LOCK_PAIR_SCHEMA,
  DUAL_HASH_LOCK_PAIRS,
  DUAL_HASH_LOCK_PASS_HALFPOINTS,
  DUAL_HASH_LOCK_PLAN_SCHEMA,
  DUAL_HASH_LOCK_RUNNER_PATH,
  analyzeDualHashScreen,
  configureDualHashToggle,
  dualHashRepetitionKey,
  initializeDualHashRun,
  parseDualHashCli,
  validateDualHashCorrectnessAuthorization,
  validateDualHashPairDirectory,
  validateDualHashPlan,
  type DualHashPairReceipt,
  type DualHashPlan,
} from "../../../wasm-spike/match-dual-hash-lock-vs-production";
import {
  buildSearchWasmOpening,
  searchWasmCanonicalJson,
  searchWasmOpeningSetSha256,
} from "../../../wasm-spike/match-search-wasm-vs-production";
import { positionFromSfen } from "../../../ml/shogi-sfen";

const PLAN_SHA = "a".repeat(64);
const CORRECTNESS_SHA = "e".repeat(64);
const PAIR_DOMAIN = "shogi-dual-hash-lock-pair-v1\0";

function plan(): DualHashPlan {
  const seeds = Array.from(
    { length: DUAL_HASH_LOCK_PAIRS },
    (_, index) => 980_001 + index,
  );
  const asset = {
    path: DUAL_HASH_LOCK_RUNNER_PATH,
    bytes: 1,
    sha256: "b".repeat(64),
  };
  return {
    schema: "shogi-dual-hash-lock-execution-manifest-v1",
    experiment_id: "dual-hash-lock-v1",
    assets: {
      runner: asset,
      candidate_wasm: {
        ...asset,
        path: "wasm-spike/artifacts/candidate.wasm",
        sha256: "c".repeat(64),
      },
      production_wasm: {
        ...asset,
        path: "wasm-spike/artifacts/production.wasm",
        sha256: "d".repeat(64),
      },
      weights: { ...asset, path: "public/shogi-nnue-weights.bin", buckets: 1 },
    },
    match: {
      pairs: 48,
      games: 96,
      pair_workers: 12,
      milliseconds_per_move: 1_500,
      opening_plies: 6,
      max_plies: 256,
      search_depth: 32,
      quiescence_depth: 10,
      scale_k: 600,
      scale_numer: 1,
      scale_denom: 1,
      color_order: ["candidate-sente", "candidate-gote"],
      tt_policy: "clear-before-each-game-retain-within-game",
      book: false,
      mate_solver: false,
      fallback: false,
      pair_seeds: seeds,
      opening_set_sha256: searchWasmOpeningSetSha256(seeds),
      pass_halfpoints: 82,
      score_denominator_halfpoints: 192,
      early_stop: "mathematical-futility-only",
      wall_clock_limit_seconds: 7_200,
      wall_clock_expiry: "STOP-no-conclusion",
    },
    safety: {
      research_only: true,
      local_only: true,
      network: false,
      live_weight_write: false,
    },
  };
}

function pair(
  input: DualHashPlan,
  index: number,
  result: "win" | "draw" | "loss",
): DualHashPairReceipt {
  const games = [0, 1].map((gameIndex) => ({
    game_index: gameIndex as 0 | 1,
    candidate_color: gameIndex === 0 ? ("sente" as const) : ("gote" as const),
    candidate_result: result,
    termination: "max-plies" as const,
    plies: 256,
    legal_moves_checked: 250,
  })) as DualHashPairReceipt["games"];
  const body = {
    schema: DUAL_HASH_LOCK_PAIR_SCHEMA,
    plan_sha256: PLAN_SHA,
    pair_index: index,
    seed: input.match.pair_seeds[index],
    opening_fingerprint: buildSearchWasmOpening(input.match.pair_seeds[index])
      .fingerprint,
    games,
    candidate_halfpoints: result === "win" ? 4 : result === "draw" ? 2 : 0,
    technical_fault: false as const,
  };
  return {
    ...body,
    receipt_sha256: createHash("sha256")
      .update(`${PAIR_DOMAIN}${searchWasmCanonicalJson(body)}`)
      .digest("hex"),
  };
}

describe("dual hash lock direct match", () => {
  it("requires a split worker/coordinator CLI and a plan hash", () => {
    expect(
      parseDualHashCli([
        "--plan",
        "/absolute/plan.json",
        "--plan-sha",
        PLAN_SHA,
        "--correctness-result",
        "/absolute/correctness.json",
        "--correctness-result-sha",
        CORRECTNESS_SHA,
        "--output-dir",
        "/absolute/out",
      ]),
    ).toMatchObject({ worker: false, pairIndex: null });
    expect(() =>
      parseDualHashCli([
        "--worker",
        "--plan",
        "/absolute/plan.json",
        "--plan-sha",
        PLAN_SHA,
        "--output-dir",
        "/absolute/out",
        "--pair-index",
        "0",
      ]),
    ).toThrow(/worker/u);
  });

  it("requires an authenticated passed correctness receipt before coordination", () => {
    const directory = resolve(
      homedir(),
      ".codex",
      "shogi-runs",
      `dual-hash-auth-test-${randomUUID()}`,
    );
    const path = resolve(directory, "correctness.json");
    mkdirSync(directory, { recursive: true });
    const result = {
      schema: "shogi-dual-hash-lock-correctness-result-v1",
      plan_sha256: PLAN_SHA,
      strength_metric: false,
      live_change_authorized: false,
      direct_play_authorized: true,
      collision: {},
      incremental: {},
      legality: {},
      performance: {},
      gates: Object.fromEntries(
        DUAL_HASH_LOCK_CORRECTNESS_GATES.map((gate) => [gate, true]),
      ),
      all_gates_passed: true,
    };
    try {
      writeFileSync(path, JSON.stringify(result));
      const sha = createHash("sha256").update(readFileSync(path)).digest("hex");
      expect(
        validateDualHashCorrectnessAuthorization(path, sha, PLAN_SHA),
      ).toMatchObject({ path, sha256: sha, planSha256: PLAN_SHA });

      writeFileSync(
        path,
        JSON.stringify({
          ...result,
          direct_play_authorized: false,
          all_gates_passed: false,
        }),
      );
      const failedSha = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
      expect(() =>
        validateDualHashCorrectnessAuthorization(path, failedSha, PLAN_SHA),
      ).toThrow(/did not pass/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked durable pair directory", () => {
    const output = resolve(tmpdir(), `dual-hash-pairs-${randomUUID()}`);
    const target = resolve(tmpdir(), `dual-hash-target-${randomUUID()}`);
    mkdirSync(output);
    mkdirSync(target);
    symlinkSync(target, resolve(output, "pairs"));
    try {
      expect(() => validateDualHashPairDirectory(output)).toThrow(
        /non-symlink/u,
      );
    } finally {
      rmSync(output, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("fixes the direct screen to its 48 fresh 980001--980048 seeds", () => {
    expect(validateDualHashPlan(plan()).match.pair_seeds).toEqual(
      Array.from(
        { length: DUAL_HASH_LOCK_PAIRS },
        (_, index) => 980_001 + index,
      ),
    );
  });

  it("requires the candidate lock to be enabled and absent from production", () => {
    let enabled = 0;
    configureDualHashToggle(
      {
        setResearchDualHashLock: (value) => {
          enabled = value;
        },
        getResearchDualHashLockEnabled: () => enabled,
      },
      "candidate",
    );
    expect(enabled).toBe(1);
    expect(() =>
      configureDualHashToggle(
        { setResearchDualHashLock: () => undefined },
        "production",
      ),
    ).toThrow(/production/u);
  });

  it("adjudicates repetition with semantic positions despite the recorded primary collision", () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "wasm-spike/dual-hash-lock-collision-fixture-v1.json",
        ),
        "utf8",
      ),
    ) as {
      positions: { a: { sfen: string }; b: { sfen: string } };
    };
    const a = positionFromSfen(fixture.positions.a.sfen).position;
    const b = positionFromSfen(fixture.positions.b.sfen).position;
    expect(a.HashVal).toBe(b.HashVal);
    expect(dualHashRepetitionKey(a)).not.toBe(dualHashRepetitionKey(b));
  });

  it("passes exactly 82/192 only after all 96 games and retains its deadline", () => {
    const captured = plan();
    const results = Array.from({ length: 48 }, (_, index) =>
      pair(
        captured,
        index,
        index < 20 ? "win" : index === 20 ? "draw" : "loss",
      ),
    );
    const result = analyzeDualHashScreen(
      captured,
      PLAN_SHA,
      CORRECTNESS_SHA,
      results,
    );
    expect(result).toMatchObject({
      status: "PASS",
      candidate_halfpoints: DUAL_HASH_LOCK_PASS_HALFPOINTS,
      score_denominator_halfpoints: DUAL_HASH_LOCK_DENOMINATOR_HALFPOINTS,
      completed_games: 96,
      correctness_result_sha256: CORRECTNESS_SHA,
    });

    const output = resolve(tmpdir(), `dual-hash-lock-${randomUUID()}`);
    mkdirSync(output);
    try {
      const first = initializeDualHashRun(
        output,
        PLAN_SHA,
        CORRECTNESS_SHA,
        1_000,
      );
      expect(
        initializeDualHashRun(output, PLAN_SHA, CORRECTNESS_SHA, 9_000_000),
      ).toEqual(first);
      expect(first.deadline_at_ms).toBe(7_201_000);
      expect(() =>
        initializeDualHashRun(output, PLAN_SHA, "f".repeat(64), 1_000),
      ).toThrow(/durable run/u);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});

void DUAL_HASH_LOCK_PLAN_SCHEMA;
