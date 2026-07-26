import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type Arm = "production" | "candidate" | "off";
type Category = "opening" | "middlegame" | "dropHeavy" | "checkEvasion";

interface AssetIdentity {
  path: string;
  bytes: number;
  sha256: string;
  buckets?: number;
}

interface SearchResult {
  key: number;
  score: number;
  depth: number;
  nodes: number;
  leaves: number;
}

interface SearchTuple {
  result: SearchResult;
  before: Record<string, number>;
  after: Record<string, number>;
}

interface SearchOrder {
  one: SearchTuple;
  two: SearchTuple;
  clean: SearchTuple;
}

interface LegalityRow {
  id: string;
  category: Category;
  off_exact: boolean;
  on_deterministic: boolean;
  on_legal: boolean;
  states_unchanged: boolean;
  secondary_incremental: boolean;
}

interface PerformanceBlock {
  index: number;
  arm: Arm;
  repeats: number;
  work: number;
  elapsed_ms: number;
  throughput: number;
}

interface RawEvidence {
  schema: string;
  plan_sha256: string;
  strength_metric: boolean;
  live_change_authorized: boolean;
  direct_play_authorized: boolean;
  collision: {
    gates: Record<string, boolean>;
    tuples: Record<
      | "production_ab"
      | "production_ba"
      | "off_ab"
      | "off_ba"
      | "on_ab"
      | "on_ba",
      SearchOrder
    >;
    eval: Record<string, number>;
    repetition: {
      off_a: number[];
      off_b_after_three_a: number;
      on_a: number[];
      on_b_after_three_a: number;
    };
    lock_rejects: {
      tt: number;
      eval: number;
      repetition: number;
    };
  };
  incremental: {
    transitions: number;
    all_incremental: boolean;
    resync_restore_failures: number;
    gate: boolean;
  };
  legality: {
    rows: LegalityRow[];
    gates: Record<string, boolean>;
  };
  performance: {
    repeats: number;
    blocks: PerformanceBlock[];
    aggregate_candidate_vs_production: number;
    median_candidate_vs_production: number;
    p90_wall_regression: number;
    memory_delta_bytes: number;
    gates: Record<string, boolean>;
  };
  gates: Record<string, boolean>;
  all_gates_passed: boolean;
}

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

const DECISION =
  "Proceed only to the preregistered 96-game direct-play non-regression screen. Do not change production, deploy, promote, write live weights, or claim strength from this result.";
const root = process.cwd();
const planPath = join(root, "ml/protocols/dual-hash-lock-v1-plan.json");
const rawPath = join(
  root,
  "docs/data/shogi-dual-hash-lock-correctness-raw-2026-07-26.json",
);
const summaryPath = join(
  root,
  "docs/data/shogi-dual-hash-lock-correctness-result-2026-07-26.json",
);
const rawBytes = readFileSync(rawPath);
const raw = JSON.parse(rawBytes.toString("utf8")) as RawEvidence;
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const plan = JSON.parse(readFileSync(planPath, "utf8"));

function identity(path: string): { bytes: number; sha256: string } {
  const bytes = readFileSync(path);
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function artifactIdentity(artifact: AssetIdentity) {
  return {
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  };
}

function nearestRank(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1)
  ];
}

function threeFieldResult(result: SearchResult) {
  return {
    key: result.key,
    score: result.score,
    depth: result.depth,
  };
}

function armBlocks(arm: Arm): PerformanceBlock[] {
  return raw.performance.blocks.filter((block) => block.arm === arm);
}

function recomputedThroughput(block: PerformanceBlock): number {
  return block.work / block.elapsed_ms;
}

function aggregateThroughput(blocks: PerformanceBlock[]): number {
  const work = blocks.reduce((sum, block) => sum + block.work, 0);
  const elapsed = blocks.reduce((sum, block) => sum + block.elapsed_ms, 0);
  return work / elapsed;
}

function instantiateMemoryBytes(artifact: AssetIdentity): number {
  expect(identity(join(root, artifact.path))).toEqual(
    artifactIdentity(artifact),
  );
  const module = new WebAssembly.Module(
    readFileSync(join(root, artifact.path)),
  );
  const instance = new WebAssembly.Instance(module, {
    env: {
      abort(_message: number, _file: number, line: number, column: number) {
        throw new Error(`WASM abort at ${line}:${column}`);
      },
      now: () => 0,
      sharedShouldStop: () => 0,
      sharedTtStore: () => {},
      sharedTtProbe: () => 0,
    },
  });
  const wasm = instance.exports as unknown as { memory: WebAssembly.Memory };
  expect(wasm.memory).toBeInstanceOf(WebAssembly.Memory);
  return wasm.memory.buffer.byteLength;
}

function recomputePerformance(memoryDeltaBytes: number) {
  const production = armBlocks("production");
  const candidate = armBlocks("candidate");
  const off = armBlocks("off");
  const aggregate =
    aggregateThroughput(candidate) / aggregateThroughput(production);
  const pairRatios = candidate.map(
    (block, index) =>
      recomputedThroughput(block) / recomputedThroughput(production[index]),
  );
  const wallRegressions = candidate.map(
    (block, index) => block.elapsed_ms / production[index].elapsed_ms - 1,
  );
  const median = nearestRank(pairRatios, 0.5);
  const p90 = nearestRank(wallRegressions, 0.9);
  const thresholds = plan.performance_gate;
  const gates = {
    aggregate_candidate_vs_production_at_least:
      aggregate >= thresholds.aggregate_candidate_vs_production_at_least,
    median_candidate_vs_production_at_least:
      median >= thresholds.median_candidate_vs_production_at_least,
    p90_wall_regression_at_most: p90 <= thresholds.p90_wall_regression_at_most,
    memory_delta_bytes_at_most:
      memoryDeltaBytes <= thresholds.memory_delta_bytes_at_most,
    off_arm_completed: off.length === production.length,
  };
  return {
    production,
    candidate,
    off,
    aggregate,
    median,
    p90,
    memoryDeltaBytes,
    gates,
  };
}

function categoryCounts(rows: LegalityRow[]) {
  return {
    opening: rows.filter((row) => row.category === "opening").length,
    middlegame: rows.filter((row) => row.category === "middlegame").length,
    dropHeavy: rows.filter((row) => row.category === "dropHeavy").length,
    checkEvasion: rows.filter((row) => row.category === "checkEvasion").length,
  };
}

function trueCount(
  rows: LegalityRow[],
  field:
    | "off_exact"
    | "on_deterministic"
    | "on_legal"
    | "states_unchanged"
    | "secondary_incremental",
): number {
  return rows.filter((row) => row[field]).length;
}

function expectedSummary(memoryDeltaBytes: number) {
  const tuples = raw.collision.tuples;
  const positionA = tuples.on_ab.one.before;
  const positionB = tuples.on_ab.two.before;
  const performance = recomputePerformance(memoryDeltaBytes);
  const passed = Object.values(raw.gates).filter(Boolean).length;
  const onCleanParityRequirement = plan.correctness_gate.required.find(
    (requirement: string) =>
      requirement.includes("toggle-ON clean-target best-move"),
  );
  const nodesAndLeavesExcludedFromCleanParity =
    typeof onCleanParityRequirement === "string" &&
    onCleanParityRequirement.includes("best-move, score, and depth parity") &&
    !onCleanParityRequirement.includes("nodes") &&
    !onCleanParityRequirement.includes("leaves");
  const decision =
    raw.direct_play_authorized &&
    raw.all_gates_passed &&
    plan.direct_play_gate.games === 96
      ? DECISION
      : "Do not start direct play or change production.";

  return {
    schema: "shogi-dual-hash-lock-correctness-evidence-v1",
    name: "Dual-hash lock formal correctness and bounded-performance result",
    status: raw.all_gates_passed ? "passed" : "failed",
    recordedAt: "2026-07-26",
    recordedAtScope: "repository-report-date-only-not-an-execution-timestamp",
    preregistration: {
      planId: plan.plan_id,
      status: plan.status,
      path: "ml/protocols/dual-hash-lock-v1-plan.json",
      ...identity(planPath),
      pullRequest: {
        number: 625,
        url: "https://github.com/gomyway1216/nextjs-portfolio/pull/625",
        mergeCommit: "5c5b82c2b7838bc236fcaa29440cbda1f80539f7",
      },
    },
    rawEvidence: {
      schema: raw.schema,
      sourcePath:
        "/Users/yudaiyaguchi/.codex/shogi-runs/dual-hash-lock-v1-formal-20260726/correctness.json",
      trackedPath:
        "docs/data/shogi-dual-hash-lock-correctness-raw-2026-07-26.json",
      ...identity(rawPath),
    },
    execution: {
      search: {
        fixedDepth: plan.correctness_gate.search.fixed_depth,
        quiescenceDepth: plan.correctness_gate.search.quiescence_depth,
        timed: plan.correctness_gate.search.timed,
        sharedTranspositionTable: plan.correctness_gate.search.shared_tt,
      },
      productionWasm: plan.pinned_inputs.production_wasm,
      candidateWasm: plan.planned_research_artifacts.research_wasm,
      weights: plan.pinned_inputs.immutable_live_weights,
      correctnessRunner: plan.planned_research_artifacts.correctness_runner,
      matchRunner: plan.planned_research_artifacts.match_runner,
    },
    collision: {
      primaryHash: positionA.hash,
      secondaryLocks: {
        positionA: positionA.secondaryHashVal,
        positionB: positionB.secondaryHashVal,
        different: positionA.secondaryHashVal !== positionB.secondaryHashVal,
      },
      production: {
        aThenB: {
          staleTarget: threeFieldResult(tuples.production_ab.two.result),
          cleanTarget: threeFieldResult(tuples.production_ab.clean.result),
        },
        bThenA: {
          staleTarget: threeFieldResult(tuples.production_ba.two.result),
          cleanTarget: threeFieldResult(tuples.production_ba.clean.result),
        },
      },
      candidate: {
        aThenBTarget: {
          ...threeFieldResult(tuples.on_ab.two.result),
          matchesCleanTarget:
            JSON.stringify(threeFieldResult(tuples.on_ab.two.result)) ===
            JSON.stringify(threeFieldResult(tuples.on_ab.clean.result)),
        },
        bThenATarget: {
          ...threeFieldResult(tuples.on_ba.two.result),
          matchesCleanTarget:
            JSON.stringify(threeFieldResult(tuples.on_ba.two.result)) ===
            JSON.stringify(threeFieldResult(tuples.on_ba.clean.result)),
        },
        nodesAndLeavesExcludedFromCleanParity,
        returnedMovesLegal: raw.collision.gates.onCleanMovesLegal,
        stateRestored: raw.collision.gates.stateUnchanged,
      },
      cacheIsolation: {
        evaluationCacheIsolated: raw.collision.gates.evalCacheIsolated,
        repetitionIdentityIsolated: raw.collision.gates.repetitionIsolated,
        secondaryLockRejects: {
          transpositionTable: raw.collision.lock_rejects.tt,
          evaluationCache: raw.collision.lock_rejects.eval,
          repetition: raw.collision.lock_rejects.repetition,
        },
      },
    },
    incrementalHash: {
      legalTransitions: raw.incremental.transitions,
      incrementalEqualsIndependentFullRecomputation:
        raw.incremental.all_incremental,
      resyncRestoreFailures: raw.incremental.resync_restore_failures,
    },
    holdout: {
      positions: raw.legality.rows.length,
      categories: categoryCounts(raw.legality.rows),
      toggleOffExactProduction: trueCount(raw.legality.rows, "off_exact"),
      toggleOnDeterministic: trueCount(raw.legality.rows, "on_deterministic"),
      toggleOnLegal: trueCount(raw.legality.rows, "on_legal"),
      statesUnchanged: trueCount(raw.legality.rows, "states_unchanged"),
      secondaryIncremental: trueCount(
        raw.legality.rows,
        "secondary_incremental",
      ),
    },
    performance: {
      thresholds: {
        aggregateCandidateVsProductionAtLeast:
          plan.performance_gate.aggregate_candidate_vs_production_at_least,
        medianCandidateVsProductionAtLeast:
          plan.performance_gate.median_candidate_vs_production_at_least,
        p90WallRegressionAtMost:
          plan.performance_gate.p90_wall_regression_at_most,
        memoryDeltaBytesAtMost:
          plan.performance_gate.memory_delta_bytes_at_most,
      },
      observed: {
        aggregateCandidateVsProduction: performance.aggregate,
        medianCandidateVsProduction: performance.median,
        p90WallRegression: performance.p90,
        memoryDeltaBytes: performance.memoryDeltaBytes,
      },
      allGatesPassed: Object.values(performance.gates).every(Boolean),
    },
    gates: {
      passed,
      total: EXPECTED_CORRECTNESS_GATES.length,
      allPassed:
        passed === EXPECTED_CORRECTNESS_GATES.length && raw.all_gates_passed,
    },
    authorization: {
      directPlayAuthorized: raw.direct_play_authorized,
      liveChangeAuthorized: raw.live_change_authorized,
      strengthMetric: raw.strength_metric,
    },
    decision,
    claimBoundary: {
      knownFact: plan.claim_boundary.known_fact,
      candidate: plan.claim_boundary.candidate,
      notClaimed: plan.claim_boundary.not_claimed,
    },
  };
}

describe("dual-hash lock formal correctness evidence", () => {
  it("pins the raw receipt, plan, plan mappings, and every summarized asset", () => {
    expect(identity(rawPath)).toEqual({
      bytes: 34_210,
      sha256:
        "5529d03cc37df7c359c149d408aa4fdddb4ef95695a4b8291f83fe6e852c314e",
    });
    expect(identity(planPath)).toEqual({
      bytes: 14_242,
      sha256:
        "dfb82a42fe57565fb6f8d002c48d83530b5979051421465af1bebc1af910de63",
    });
    expect(raw.schema).toBe("shogi-dual-hash-lock-correctness-result-v1");
    expect(raw.plan_sha256).toBe(identity(planPath).sha256);
    expect(plan.plan_id).toBe("dual-hash-lock-v1");
    expect(plan.status).toBe("fixed-before-result");

    expect(plan.execution_manifest.assets).toEqual({
      runner: plan.planned_research_artifacts.match_runner,
      candidate_wasm: plan.planned_research_artifacts.research_wasm,
      production_wasm: plan.pinned_inputs.production_wasm,
      weights: plan.pinned_inputs.immutable_live_weights,
    });
    expect(summary.execution).toEqual({
      search: {
        fixedDepth: plan.correctness_gate.search.fixed_depth,
        quiescenceDepth: plan.correctness_gate.search.quiescence_depth,
        timed: plan.correctness_gate.search.timed,
        sharedTranspositionTable: plan.correctness_gate.search.shared_tt,
      },
      productionWasm: plan.pinned_inputs.production_wasm,
      candidateWasm: plan.planned_research_artifacts.research_wasm,
      weights: plan.pinned_inputs.immutable_live_weights,
      correctnessRunner: plan.planned_research_artifacts.correctness_runner,
      matchRunner: plan.planned_research_artifacts.match_runner,
    });

    for (const artifact of [
      plan.pinned_inputs.production_wasm,
      plan.pinned_inputs.immutable_live_weights,
      plan.planned_research_artifacts.research_wasm,
      plan.planned_research_artifacts.correctness_runner,
      plan.planned_research_artifacts.match_runner,
    ] as AssetIdentity[]) {
      expect(identity(join(root, artifact.path))).toEqual(
        artifactIdentity(artifact),
      );
    }
    expect(summary.rawEvidence).not.toHaveProperty("startedAt");
    expect(summary.rawEvidence).not.toHaveProperty("finishedAt");
    expect(summary.rawEvidence).not.toHaveProperty("elapsedSeconds");
  });

  it("authenticates the independent literal 27-gate list and its derivation", () => {
    expect(EXPECTED_CORRECTNESS_GATES).toHaveLength(27);
    expect(new Set(EXPECTED_CORRECTNESS_GATES).size).toBe(27);
    expect(Object.keys(raw.gates).sort()).toEqual(
      [...EXPECTED_CORRECTNESS_GATES].sort(),
    );
    expect(Object.values(raw.gates).every(Boolean)).toBe(true);

    const memoryDeltaBytes =
      instantiateMemoryBytes(plan.planned_research_artifacts.research_wasm) -
      instantiateMemoryBytes(plan.pinned_inputs.production_wasm);
    const performance = recomputePerformance(memoryDeltaBytes);
    expect(raw.gates).toEqual({
      ...raw.collision.gates,
      ...raw.legality.gates,
      secondary_incremental_16384: raw.incremental.gate,
      ...performance.gates,
    });
    expect(raw.all_gates_passed).toBe(true);
  });

  it("reproduces stale production reuse and proves clean target identity with the lock", () => {
    const tuples = raw.collision.tuples;

    for (const member of ["one", "two", "clean"] as const) {
      expect(tuples.off_ab[member].result).toEqual(
        tuples.production_ab[member].result,
      );
      expect(tuples.off_ba[member].result).toEqual(
        tuples.production_ba[member].result,
      );
    }
    expect(threeFieldResult(tuples.production_ab.two.result)).toEqual(
      threeFieldResult(tuples.production_ab.one.result),
    );
    expect(threeFieldResult(tuples.production_ab.two.result)).not.toEqual(
      threeFieldResult(tuples.production_ab.clean.result),
    );
    expect(tuples.production_ab.two.result).toMatchObject({
      nodes: 5,
      leaves: 0,
    });
    expect(threeFieldResult(tuples.production_ba.two.result)).toEqual(
      threeFieldResult(tuples.production_ba.one.result),
    );
    expect(threeFieldResult(tuples.production_ba.two.result)).not.toEqual(
      threeFieldResult(tuples.production_ba.clean.result),
    );
    expect(tuples.production_ba.two.result).toMatchObject({
      nodes: 5,
      leaves: 0,
    });

    expect(threeFieldResult(tuples.on_ab.two.result)).toEqual(
      threeFieldResult(tuples.on_ab.clean.result),
    );
    expect(threeFieldResult(tuples.on_ba.two.result)).toEqual(
      threeFieldResult(tuples.on_ba.clean.result),
    );
    expect(tuples.on_ab.two.result.nodes).not.toBe(
      tuples.on_ab.clean.result.nodes,
    );
    expect(tuples.on_ba.two.result.nodes).not.toBe(
      tuples.on_ba.clean.result.nodes,
    );

    const positionA = tuples.on_ab.one.before;
    const positionB = tuples.on_ab.two.before;
    expect(positionA.hash).toBe(218_180_606);
    expect(positionB.hash).toBe(positionA.hash);
    expect(positionA.secondaryHashVal).toBe(3_957_758_389);
    expect(positionB.secondaryHashVal).toBe(1_939_556_287);
    expect(positionA.secondaryHashVal).not.toBe(positionB.secondaryHashVal);

    for (const order of Object.values(tuples)) {
      for (const tuple of [order.one, order.two, order.clean]) {
        expect(tuple.after).toEqual(tuple.before);
      }
    }
    expect(raw.collision.eval).toEqual({
      off_a: 3157,
      off_b_cached: 3157,
      off_b_uncached: 1809,
      on_a: 3157,
      on_b_cached: 1809,
      on_b_uncached: 1809,
    });
    expect(raw.collision.repetition).toEqual({
      off_a: [1, 1, 1],
      off_b_after_three_a: 0,
      on_a: [1, 1, 1],
      on_b_after_three_a: 1,
    });
    expect(raw.collision.lock_rejects).toEqual({
      tt: 16,
      eval: 3,
      repetition: 3,
    });
    expect(Object.values(raw.collision.gates).every(Boolean)).toBe(true);
  });

  it("authenticates all incremental transitions and all 64 holdout rows", () => {
    expect(raw.incremental).toEqual({
      transitions: 16_384,
      all_incremental: true,
      resync_restore_failures: 0,
      gate: true,
    });
    expect(raw.legality.rows).toHaveLength(64);
    expect(categoryCounts(raw.legality.rows)).toEqual({
      opening: 16,
      middlegame: 16,
      dropHeavy: 16,
      checkEvasion: 16,
    });
    for (const row of raw.legality.rows) {
      expect({
        off_exact: row.off_exact,
        on_deterministic: row.on_deterministic,
        on_legal: row.on_legal,
        states_unchanged: row.states_unchanged,
        secondary_incremental: row.secondary_incremental,
      }).toEqual({
        off_exact: true,
        on_deterministic: true,
        on_legal: true,
        states_unchanged: true,
        secondary_incremental: true,
      });
    }
    expect(Object.values(raw.legality.gates).every(Boolean)).toBe(true);
  });

  it("recomputes block throughput, aggregate statistics, and authenticated WASM memory", () => {
    for (const block of raw.performance.blocks) {
      expect(block.throughput).toBe(recomputedThroughput(block));
    }

    const productionMemoryBytes = instantiateMemoryBytes(
      plan.pinned_inputs.production_wasm,
    );
    const candidateMemoryBytes = instantiateMemoryBytes(
      plan.planned_research_artifacts.research_wasm,
    );
    expect(productionMemoryBytes).toBeGreaterThan(0);
    expect(candidateMemoryBytes).toBeGreaterThan(0);
    const performance = recomputePerformance(
      candidateMemoryBytes - productionMemoryBytes,
    );

    expect(performance.production).toHaveLength(4);
    expect(performance.candidate).toHaveLength(4);
    expect(performance.off).toHaveLength(4);
    expect(raw.performance.repeats).toBe(1);
    expect(performance.aggregate).toBe(
      raw.performance.aggregate_candidate_vs_production,
    );
    expect(performance.median).toBe(
      raw.performance.median_candidate_vs_production,
    );
    expect(performance.p90).toBe(raw.performance.p90_wall_regression);
    expect(performance.memoryDeltaBytes).toBe(
      raw.performance.memory_delta_bytes,
    );
    expect(performance.gates).toEqual(raw.performance.gates);
    expect(Object.values(performance.gates).every(Boolean)).toBe(true);
  });

  it("exactly projects every summary field from authenticated plan and raw evidence", () => {
    const memoryDeltaBytes =
      instantiateMemoryBytes(plan.planned_research_artifacts.research_wasm) -
      instantiateMemoryBytes(plan.pinned_inputs.production_wasm);
    expect(summary).toEqual(expectedSummary(memoryDeltaBytes));
  });
});
