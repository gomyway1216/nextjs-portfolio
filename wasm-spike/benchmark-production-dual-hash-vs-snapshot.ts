/**
 * Read-only fixed-depth speed comparison between the integrated production
 * dual-hash WASM and the immutable pre-integration production snapshot.
 *
 * The runner writes JSON to stdout and progress to stderr. It never writes an
 * engine asset, evidence file, opening book, or live weight.
 */

import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { readFileSync } from "node:fs";

import { positionFromSfen } from "../ml/shogi-sfen";
import type { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import { syncWasm, type ShogiSearchWasm } from "./search-driver";

const FINAL_PATH = "src/components/game/ShogiImproved/wasm/shogi.wasm";
const BASELINE_PATH =
  "docs/data/shogi-dual-hash-lock-production-wasm-2026-07-25.base64";
const WEIGHTS_PATH = "public/shogi-nnue-weights.bin";
const HOLDOUT_PATH = "wasm-spike/lazy-move-picker-fixture-v2.json";
const DEPTH = 5;
const Q_DEPTH = 8;
const WARMUP_PAIRS = 3;
const MEASURED_PAIRS = 6;

interface NnueWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numerator: number, denominator: number): void;
  setNnueForceFull(flag: number): void;
  setNnueEnabled(flag: number): void;
  setSharedTtEnabled(flag: number): void;
}

type Arm = "baseline" | "final";
interface Sample {
  id: string;
  tesu: number;
  position: KyokumenImproved;
}

interface Identity {
  bytes: number;
  sha256: string;
}

const EXPECTED = {
  final: {
    bytes: 36_545,
    sha256:
      "9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31",
  },
  baseline: {
    bytes: 35_597,
    sha256:
      "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
  },
  weights: {
    bytes: 1_185_988,
    sha256:
      "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
  },
} as const;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertIdentity(
  label: string,
  bytes: Uint8Array,
  identity: Identity,
): void {
  if (bytes.byteLength !== identity.bytes || sha256(bytes) !== identity.sha256)
    throw new Error(`${label} identity differs`);
}

function instantiate(raw: Uint8Array): NnueWasm {
  const source = new ArrayBuffer(raw.byteLength);
  new Uint8Array(source).set(raw);
  return new WebAssembly.Instance(new WebAssembly.Module(source), {
    env: {
      abort(_message: number, _file: number, line: number, column: number) {
        throw new Error(`WASM abort at ${line}:${column}`);
      },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  }).exports as unknown as NnueWasm;
}

function install(wasm: NnueWasm, weights: Uint8Array): void {
  wasm.setSharedTtEnabled(0);
  wasm.setNnueBuckets(1);
  if (wasm.getNnueWeightsSize() !== weights.byteLength)
    throw new Error("weights length differs from runtime allocation");
  new Uint8Array(
    wasm.memory.buffer,
    wasm.getNnueWeightsPtr(),
    weights.byteLength,
  ).set(weights);
  wasm.setNnueScaleK(600);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  wasm.setNnueEnabled(1);
}

function search(wasm: NnueWasm, sample: Sample) {
  wasm.clearTT();
  syncWasm(wasm, sample.position);
  wasm.setRootTesu(sample.tesu);
  const key = wasm.searchBestMove(0, DEPTH, Q_DEPTH);
  return {
    key,
    score: wasm.getSearchScore(),
    depth: wasm.getSearchDepth(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
  };
}

function percentile(values: readonly number[], probability: number): number {
  if (values.length === 0) throw new Error("cannot select an empty percentile");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(probability * sorted.length) - 1)
  ];
}

export function productionDualHashSpeedBenchmarkMain(): void {
  const finalBytes = readFileSync(FINAL_PATH);
  const baselineEnvelope = readFileSync(BASELINE_PATH);
  const baselineBytes = Buffer.from(
    baselineEnvelope.toString("utf8").trim(),
    "base64",
  );
  const weights = readFileSync(WEIGHTS_PATH);
  const holdoutBytes = readFileSync(HOLDOUT_PATH);
  const holdout = JSON.parse(holdoutBytes.toString("utf8")) as {
    schemaVersion: number;
    status: string;
    caseCount: number;
    cases: Array<{ id: string; sfen: string; tesu: number }>;
  };
  if (
    holdout.schemaVersion !== 2 ||
    holdout.status !== "formal-holdout-not-for-tuning" ||
    holdout.caseCount !== 64 ||
    holdout.cases.length !== 64
  )
    throw new Error("formal holdout shape differs");

  assertIdentity("final", finalBytes, EXPECTED.final);
  assertIdentity("baseline", baselineBytes, EXPECTED.baseline);
  assertIdentity("weights", weights, EXPECTED.weights);

  const samples: Sample[] = holdout.cases.map((entry) => ({
    id: entry.id,
    tesu: entry.tesu,
    position: positionFromSfen(entry.sfen).position,
  }));
  const engines: Record<Arm, NnueWasm> = {
    baseline: instantiate(baselineBytes),
    final: instantiate(finalBytes),
  };
  install(engines.baseline, weights);
  install(engines.final, weights);

  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  process.stderr.write("decision-parity-and-initial-warmup\n");
  const decisionRows = samples.map((sample) => {
    const baseline = search(engines.baseline, sample);
    const final = search(engines.final, sample);
    return {
      id: sample.id,
      exactDecision:
        baseline.key === final.key &&
        baseline.score === final.score &&
        baseline.depth === final.depth,
      baseline,
      final,
    };
  });

  const onePass = (arm: Arm) => {
    const start = performance.now();
    let nodes = 0;
    let leaves = 0;
    for (const sample of samples) {
      const result = search(engines[arm], sample);
      nodes += result.nodes;
      leaves += result.leaves;
    }
    const elapsedMs = performance.now() - start;
    return {
      arm,
      elapsed_ms: elapsedMs,
      nodes,
      leaves,
      work: nodes + leaves,
      throughput: (nodes + leaves) / elapsedMs,
    };
  };

  const warmup: ReturnType<typeof onePass>[] = [];
  for (let pair = 0; pair < WARMUP_PAIRS; pair += 1) {
    const order: Arm[] =
      pair % 2 === 0 ? ["baseline", "final"] : ["final", "baseline"];
    for (const arm of order) {
      process.stderr.write(
        `stability warmup ${pair + 1}/${WARMUP_PAIRS} ${arm}\n`,
      );
      warmup.push(onePass(arm));
    }
  }

  const blocks: Array<
    ReturnType<typeof onePass> & {
      index: number;
      pair: number;
      order: number;
    }
  > = [];
  for (let pair = 0; pair < MEASURED_PAIRS; pair += 1) {
    const order: Arm[] =
      pair % 2 === 0 ? ["baseline", "final"] : ["final", "baseline"];
    for (let index = 0; index < order.length; index += 1) {
      const arm = order[index];
      process.stderr.write(
        `measured pair ${pair + 1}/${MEASURED_PAIRS} ${arm}\n`,
      );
      blocks.push({
        index: blocks.length,
        pair,
        order: index,
        ...onePass(arm),
      });
    }
  }

  const paired = Array.from({ length: MEASURED_PAIRS }, (_, pair) => {
    const selected = blocks.filter((block) => block.pair === pair);
    const baseline = selected.find((block) => block.arm === "baseline");
    const final = selected.find((block) => block.arm === "final");
    if (!baseline || !final) throw new Error("paired block is incomplete");
    return {
      pair,
      final_to_baseline_throughput: final.throughput / baseline.throughput,
      final_to_baseline_wall: final.elapsed_ms / baseline.elapsed_ms,
    };
  });
  const selected = (arm: Arm) =>
    blocks.filter((block) => block.arm === arm);
  const aggregateThroughput = (arm: Arm) => {
    const armBlocks = selected(arm);
    return (
      armBlocks.reduce((sum, block) => sum + block.work, 0) /
      armBlocks.reduce((sum, block) => sum + block.elapsed_ms, 0)
    );
  };
  const aggregateRatio =
    aggregateThroughput("final") / aggregateThroughput("baseline");
  const pairRatios = paired.map(
    (pair) => pair.final_to_baseline_throughput,
  );
  const wallRegressions = paired.map(
    (pair) => pair.final_to_baseline_wall - 1,
  );

  assertIdentity("final postflight", readFileSync(FINAL_PATH), EXPECTED.final);
  assertIdentity(
    "baseline postflight",
    Buffer.from(readFileSync(BASELINE_PATH, "utf8").trim(), "base64"),
    EXPECTED.baseline,
  );
  assertIdentity(
    "weights postflight",
    readFileSync(WEIGHTS_PATH),
    EXPECTED.weights,
  );

  const result = {
    schema: "shogi-production-dual-hash-speed-benchmark-raw-v1",
    startedAt,
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAtMs,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus()[0]?.model ?? "unknown",
      logicalCpus: cpus().length,
    },
    assets: {
      final: { path: FINAL_PATH, ...EXPECTED.final },
      baseline: {
        snapshotPath: BASELINE_PATH,
        decodedBytes: EXPECTED.baseline.bytes,
        decodedSha256: EXPECTED.baseline.sha256,
      },
      weights: { path: WEIGHTS_PATH, ...EXPECTED.weights, buckets: 1 },
      holdout: {
        path: HOLDOUT_PATH,
        bytes: holdoutBytes.byteLength,
        sha256: sha256(holdoutBytes),
        cases: samples.length,
      },
    },
    method: {
      reusedFrom: "wasm-spike/dual-hash-lock-collision-invariants.ts",
      fixedDepth: DEPTH,
      quiescenceDepth: Q_DEPTH,
      sharedTt: false,
      book: false,
      clearTtBeforePosition: true,
      work: "search nodes + quiescence leaves",
      warmupPassesPerArm: 1 + WARMUP_PAIRS,
      pairedMeasuredBlocksPerArm: MEASURED_PAIRS,
      pairOrder: "alternating baseline-final / final-baseline",
    },
    correctness: {
      exactDecisionCases: decisionRows.filter((row) => row.exactDecision)
        .length,
      totalCases: decisionRows.length,
      allExactDecisions: decisionRows.every((row) => row.exactDecision),
      rows: decisionRows,
    },
    warmup,
    blocks,
    paired,
    observed: {
      aggregateBaselineThroughput: aggregateThroughput("baseline"),
      aggregateFinalThroughput: aggregateThroughput("final"),
      aggregateFinalToBaselineThroughput: aggregateRatio,
      medianFinalToBaselineThroughput: percentile(pairRatios, 0.5),
      minimumFinalToBaselineThroughput: Math.min(...pairRatios),
      maximumFinalToBaselineThroughput: Math.max(...pairRatios),
      p90WallRegression: percentile(wallRegressions, 0.9),
      baselineMemoryBytes: engines.baseline.memory.buffer.byteLength,
      finalMemoryBytes: engines.final.memory.buffer.byteLength,
      memoryDeltaBytes:
        engines.final.memory.buffer.byteLength -
        engines.baseline.memory.buffer.byteLength,
    },
    postflight: {
      finalIdentityMatched: true,
      baselineDecodedIdentityMatched: true,
      weightsIdentityMatched: true,
    },
    claimBoundary: {
      strengthMetric: false,
      directWasmOnly: true,
      browserHostMeasured: false,
      sharedTtMeasured: false,
      deploymentAuthorized: false,
    },
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try {
    productionDualHashSpeedBenchmarkMain();
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    process.exitCode = 1;
  }
}
