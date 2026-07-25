/**
 * Preregistered three-arm real-search tuning screen for the packed-key heap.
 *
 * This is deliberately not a formal holdout or a strength match. It uses the
 * already-designated v1 tuning fixture and compares, in one interleaved run:
 *   P = production insertion sort
 *   H = rejected stable heap
 *   K = packed-key stable heap
 *
 * Usage (pinned runtime):
 *   ~/.nvm/versions/node/v22.13.0/bin/node -r tsx/cjs \
 *     wasm-spike/packed-heap-real-search-tuning.ts \
 *     --json /tmp/packed-heap-real-search-tuning.json
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";

import { positionFromSfen } from "../ml/shogi-sfen";
import type { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import { loadShogiWasm, syncWasm, type ShogiSearchWasm } from "./search-driver";

const EXPECTED = {
  productionWasm: {
    bytes: 35_597,
    sha256: "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
  },
  currentHeapWasm: {
    bytes: 36_358,
    sha256: "49b66b2466c654232a6bccc5e3d7a72d69ec71d46977aa17f8644cc84361d311",
  },
  packedHeapWasm: {
    bytes: 36_284,
    sha256: "8d94d2d9157b3635fd62d20847c08e2c42dbdb29d23c9e4d4e47aca9bbbbad66",
  },
  liveWeights: {
    bytes: 1_185_988,
    sha256: "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
  },
  tuningFixture: {
    bytes: 29_380,
    sha256: "59c1a68bb5515447211ad57ec9cf1a27c8933b95656d78c8e7e8f213a130bdfc",
  },
} as const;

const CONFIG = {
  requiredNodeVersion: "v22.13.0",
  depth: 5,
  qDepth: 8,
  minMoves: 64,
  minimumBlockMs: 25,
  maximumRepeats: 100,
  maximumRuntimeMs: 10 * 60 * 1_000,
  timingOrder: [
    "production",
    "currentHeap",
    "packedHeap",
    "packedHeap",
    "currentHeap",
    "production",
    "packedHeap",
    "production",
    "currentHeap",
    "currentHeap",
    "production",
    "packedHeap",
  ] as const,
  thresholds: {
    packedVsProductionAggregatePctAtLeast: 8.5,
    packedVsProductionMedianPctAtLeast: 5.5,
    packedVsProductionP90WallRegressionPctAtMost: 2,
    packedVsProductionCategoryPctAtLeast: 0,
    packedVsCurrentHeapAggregatePctAtLeast: 1.5,
    packedVsCurrentHeapMedianPctAtLeast: 0,
    packedVsCurrentHeapCategoryPctAtLeast: -0.5,
  },
} as const;

type Arm = (typeof CONFIG.timingOrder)[number];
type Category = "opening" | "middlegame" | "dropHeavy" | "checkEvasion";

interface FixtureCase {
  id: string;
  category: Category;
  sfen: string;
  tesu: number;
}

interface Fixture {
  schemaVersion: number;
  name: string;
  status?: string;
  counts: Record<Category, number>;
  cases: FixtureCase[];
}

interface PositionCase extends FixtureCase {
  position: KyokumenImproved;
}

interface ResearchWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numerator: number, denominator: number): void;
  setNnueForceFull(flag: number): void;
  setNnueEnabled(flag: number): void;
  setSharedTtEnabled(flag: number): void;
  setResearchLazyMovePicker?: (flag: number, minMoves: number) => void;
  getResearchLazyMovePickerEnabled?: () => number;
  getResearchLazyMovePickerMinMoves?: () => number;
  getResearchLazyMovePickerNodes?: () => number;
}

interface SearchResult {
  key: number;
  score: number;
  depth: number;
  nodes: number;
  leaves: number;
  elapsedMs: number;
  lazyNodes: number;
}

interface TimingBlock {
  arm: Arm;
  searches: number;
  elapsedMs: number;
  work: number;
  nps: number;
  lazyNodes: number;
}

interface TimingRow {
  id: string;
  category: Category;
  workPerSearch: number;
  repeatsPerBlock: number;
  blocks: TimingBlock[];
  arms: Record<
    Arm,
    {
      elapsedMs: number;
      work: number;
      nps: number;
      lazyNodes: number;
    }
  >;
  packedVsProductionPct: number;
  packedVsCurrentHeapPct: number;
  packedVsProductionWallRegressionPct: number;
}

function valueArg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function identity(bytes: Uint8Array): { bytes: number; sha256: string } {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function requireIdentity(
  label: string,
  bytes: Uint8Array,
  expected: { bytes: number; sha256: string },
): void {
  const actual = identity(bytes);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(
      `${label} identity mismatch: expected ${expected.bytes}/${expected.sha256}, ` +
        `got ${actual.bytes}/${actual.sha256}`,
    );
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(quantile * sorted.length) - 1];
}

function installLiveWeights(wasm: ResearchWasm, weights: Uint8Array): void {
  wasm.setSharedTtEnabled(0);
  wasm.setNnueBuckets(1);
  if (wasm.getNnueWeightsSize() !== weights.byteLength) {
    throw new Error(
      `weights size mismatch: runtime=${wasm.getNnueWeightsSize()}, file=${weights.byteLength}`,
    );
  }
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

function configureResearchArm(
  label: string,
  wasm: ResearchWasm,
  enabled: boolean,
): void {
  if (enabled) {
    if (
      !wasm.setResearchLazyMovePicker ||
      !wasm.getResearchLazyMovePickerEnabled ||
      !wasm.getResearchLazyMovePickerMinMoves ||
      !wasm.getResearchLazyMovePickerNodes
    ) {
      throw new Error(`${label} lacks research picker exports`);
    }
    wasm.setResearchLazyMovePicker(1, CONFIG.minMoves);
    if (
      wasm.getResearchLazyMovePickerEnabled() !== 1 ||
      wasm.getResearchLazyMovePickerMinMoves() !== CONFIG.minMoves
    ) {
      throw new Error(`${label} rejected the pinned picker configuration`);
    }
  } else if (wasm.setResearchLazyMovePicker) {
    throw new Error("production unexpectedly exposes the research picker");
  }
}

function search(wasm: ResearchWasm, sample: PositionCase): SearchResult {
  wasm.clearTT();
  syncWasm(wasm, sample.position);
  wasm.setRootTesu(sample.tesu);
  const started = performance.now();
  const key = wasm.searchBestMove(0, CONFIG.depth, CONFIG.qDepth);
  const elapsedMs = performance.now() - started;
  return {
    key,
    score: wasm.getSearchScore(),
    depth: wasm.getSearchDepth(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
    elapsedMs,
    lazyNodes: wasm.getResearchLazyMovePickerNodes?.() ?? 0,
  };
}

function sameTree(left: SearchResult, right: SearchResult): boolean {
  return (
    left.key === right.key &&
    left.score === right.score &&
    left.depth === right.depth &&
    left.nodes === right.nodes &&
    left.leaves === right.leaves
  );
}

function runBlock(
  arm: Arm,
  wasm: ResearchWasm,
  sample: PositionCase,
  repeats: number,
  expected: SearchResult,
  deadline: number,
): TimingBlock {
  let elapsedMs = 0;
  let lazyNodes = 0;
  for (let repeat = 0; repeat < repeats; repeat++) {
    if (performance.now() > deadline) {
      throw new Error("packed tuning exceeded the preregistered 10-minute cap");
    }
    const result = search(wasm, sample);
    if (!sameTree(expected, result)) {
      throw new Error(
        `${sample.id} ${arm} changed the fixed tree: ${JSON.stringify({
          expected,
          result,
        })}`,
      );
    }
    elapsedMs += result.elapsedMs;
    lazyNodes += result.lazyNodes;
  }
  const work = repeats * (expected.nodes + expected.leaves);
  return {
    arm,
    searches: repeats,
    elapsedMs,
    work,
    nps: (work * 1_000) / elapsedMs,
    lazyNodes,
  };
}

function summarizeArm(blocks: TimingBlock[], arm: Arm) {
  const selected = blocks.filter((block) => block.arm === arm);
  const elapsedMs = selected.reduce((sum, block) => sum + block.elapsedMs, 0);
  const work = selected.reduce((sum, block) => sum + block.work, 0);
  return {
    elapsedMs,
    work,
    nps: (work * 1_000) / elapsedMs,
    lazyNodes: selected.reduce((sum, block) => sum + block.lazyNodes, 0),
  };
}

function aggregatePair(
  rows: TimingRow[],
  baseline: Arm,
  candidate: Arm,
): number {
  const baselineElapsed = rows.reduce(
    (sum, row) => sum + row.arms[baseline].elapsedMs,
    0,
  );
  const candidateElapsed = rows.reduce(
    (sum, row) => sum + row.arms[candidate].elapsedMs,
    0,
  );
  const baselineWork = rows.reduce(
    (sum, row) => sum + row.arms[baseline].work,
    0,
  );
  const candidateWork = rows.reduce(
    (sum, row) => sum + row.arms[candidate].work,
    0,
  );
  const baselineNps = (baselineWork * 1_000) / baselineElapsed;
  const candidateNps = (candidateWork * 1_000) / candidateElapsed;
  return (candidateNps / baselineNps - 1) * 100;
}

function main(): void {
  if (process.version !== CONFIG.requiredNodeVersion) {
    throw new Error(
      `pinned runtime required: ${CONFIG.requiredNodeVersion}, got ${process.version}`,
    );
  }
  const unexpectedFlags = process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--") && arg !== "--json");
  if (unexpectedFlags.length > 0) {
    throw new Error(`unsupported flags: ${unexpectedFlags.join(", ")}`);
  }

  const startedAt = performance.now();
  const deadline = startedAt + CONFIG.maximumRuntimeMs;
  const root = resolve(__dirname, "..");
  const paths = {
    production: resolve(
      root,
      "src/components/game/ShogiImproved/wasm/shogi.wasm",
    ),
    currentHeap: resolve(
      root,
      "wasm-spike/artifacts/shogi-lazy-move-picker-research.wasm",
    ),
    packedHeap: resolve(
      root,
      "wasm-spike/artifacts/shogi-lazy-move-picker-packed-research.wasm",
    ),
    weights: resolve(root, "public/shogi-nnue-weights.bin"),
    fixture: resolve(root, "wasm-spike/lazy-move-picker-fixture-v1.json"),
  };
  const outputPath = resolve(
    valueArg("--json", "/tmp/packed-heap-real-search-tuning.json"),
  );

  const bytes = {
    production: readFileSync(paths.production),
    currentHeap: readFileSync(paths.currentHeap),
    packedHeap: readFileSync(paths.packedHeap),
    weights: readFileSync(paths.weights),
    fixture: readFileSync(paths.fixture),
  };
  requireIdentity("production WASM", bytes.production, EXPECTED.productionWasm);
  requireIdentity(
    "current heap WASM",
    bytes.currentHeap,
    EXPECTED.currentHeapWasm,
  );
  requireIdentity(
    "packed heap WASM",
    bytes.packedHeap,
    EXPECTED.packedHeapWasm,
  );
  requireIdentity("live weights", bytes.weights, EXPECTED.liveWeights);
  requireIdentity("tuning fixture", bytes.fixture, EXPECTED.tuningFixture);

  const fixture = JSON.parse(bytes.fixture.toString("utf8")) as Fixture;
  const categories: Category[] = [
    "opening",
    "middlegame",
    "dropHeavy",
    "checkEvasion",
  ];
  if (
    fixture.schemaVersion !== 1 ||
    fixture.cases.length !== 64 ||
    categories.some(
      (category) =>
        fixture.counts[category] !== 16 ||
        fixture.cases.filter((entry) => entry.category === category).length !==
          16,
    )
  ) {
    throw new Error("pinned tuning fixture contract changed");
  }
  const positions: PositionCase[] = fixture.cases.map((entry) => ({
    ...entry,
    position: positionFromSfen(entry.sfen).position,
  }));

  const engines: Record<Arm, ResearchWasm> = {
    production: loadShogiWasm(paths.production) as ResearchWasm,
    currentHeap: loadShogiWasm(paths.currentHeap) as ResearchWasm,
    packedHeap: loadShogiWasm(paths.packedHeap) as ResearchWasm,
  };
  for (const wasm of Object.values(engines)) {
    installLiveWeights(wasm, bytes.weights);
  }
  configureResearchArm("production", engines.production, false);
  configureResearchArm("current heap", engines.currentHeap, true);
  configureResearchArm("packed heap", engines.packedHeap, true);

  const fixedRows: object[] = [];
  const expectedById = new Map<string, SearchResult>();
  const fixedPackedActivations: Record<Category, number> = {
    opening: 0,
    middlegame: 0,
    dropHeavy: 0,
    checkEvasion: 0,
  };
  let mismatches = 0;
  for (const [index, sample] of positions.entries()) {
    const production = search(engines.production, sample);
    const currentHeap = search(engines.currentHeap, sample);
    const packedHeap = search(engines.packedHeap, sample);
    const exact =
      sameTree(production, currentHeap) && sameTree(production, packedHeap);
    if (!exact) mismatches++;
    fixedPackedActivations[sample.category] += packedHeap.lazyNodes;
    expectedById.set(sample.id, production);
    fixedRows.push({
      id: sample.id,
      category: sample.category,
      exact,
      production,
      currentHeap,
      packedHeap,
    });
    console.log(
      `[parity ${String(index + 1).padStart(2)}/64] ${sample.id}: ` +
        `${exact ? "exact" : "MISMATCH"}, packed activations=${packedHeap.lazyNodes}`,
    );
  }
  if (mismatches !== 0) {
    throw new Error(`fixed-depth three-arm parity failed: ${mismatches}/64`);
  }
  if (categories.some((category) => fixedPackedActivations[category] === 0)) {
    throw new Error("packed candidate did not activate in every category");
  }

  const timingRows: TimingRow[] = [];
  for (const [index, sample] of positions.entries()) {
    const expected = expectedById.get(sample.id);
    if (!expected) throw new Error(`missing parity row for ${sample.id}`);
    const warm = {
      production: search(engines.production, sample),
      currentHeap: search(engines.currentHeap, sample),
      packedHeap: search(engines.packedHeap, sample),
    };
    if (Object.values(warm).some((result) => !sameTree(expected, result))) {
      throw new Error(`${sample.id} warmup changed the fixed tree`);
    }
    const slowestWarmMs = Math.max(
      0.01,
      ...Object.values(warm).map((result) => result.elapsedMs),
    );
    const repeats = Math.min(
      CONFIG.maximumRepeats,
      Math.max(1, Math.ceil(CONFIG.minimumBlockMs / slowestWarmMs)),
    );
    const blocks = CONFIG.timingOrder.map((arm) =>
      runBlock(arm, engines[arm], sample, repeats, expected, deadline),
    );
    const arms = {
      production: summarizeArm(blocks, "production"),
      currentHeap: summarizeArm(blocks, "currentHeap"),
      packedHeap: summarizeArm(blocks, "packedHeap"),
    };
    const packedVsProductionPct =
      (arms.packedHeap.nps / arms.production.nps - 1) * 100;
    const packedVsCurrentHeapPct =
      (arms.packedHeap.nps / arms.currentHeap.nps - 1) * 100;
    const packedVsProductionWallRegressionPct =
      (arms.packedHeap.elapsedMs / arms.production.elapsedMs - 1) * 100;
    timingRows.push({
      id: sample.id,
      category: sample.category,
      workPerSearch: expected.nodes + expected.leaves,
      repeatsPerBlock: repeats,
      blocks,
      arms,
      packedVsProductionPct,
      packedVsCurrentHeapPct,
      packedVsProductionWallRegressionPct,
    });
    console.log(
      `[timing ${String(index + 1).padStart(2)}/64] ${sample.id}: ` +
        `K/P=${packedVsProductionPct.toFixed(2)}%, ` +
        `K/H=${packedVsCurrentHeapPct.toFixed(2)}%`,
    );
  }

  const packedVsProductionAggregatePct = aggregatePair(
    timingRows,
    "production",
    "packedHeap",
  );
  const packedVsCurrentHeapAggregatePct = aggregatePair(
    timingRows,
    "currentHeap",
    "packedHeap",
  );
  const packedVsProductionMedianPct = median(
    timingRows.map((row) => row.packedVsProductionPct),
  );
  const packedVsCurrentHeapMedianPct = median(
    timingRows.map((row) => row.packedVsCurrentHeapPct),
  );
  const packedVsProductionP90WallRegressionPct = percentile(
    timingRows.map((row) => row.packedVsProductionWallRegressionPct),
    0.9,
  );
  const categoryResults = Object.fromEntries(
    categories.map((category) => {
      const rows = timingRows.filter((row) => row.category === category);
      return [
        category,
        {
          cases: rows.length,
          packedVsProductionPct: aggregatePair(
            rows,
            "production",
            "packedHeap",
          ),
          packedVsCurrentHeapPct: aggregatePair(
            rows,
            "currentHeap",
            "packedHeap",
          ),
          packedActivations: fixedPackedActivations[category],
        },
      ];
    }),
  ) as Record<
    Category,
    {
      cases: number;
      packedVsProductionPct: number;
      packedVsCurrentHeapPct: number;
      packedActivations: number;
    }
  >;

  const gates = {
    exact64: mismatches === 0 && fixedRows.length === 64,
    nonVacuousEveryCategory: categories.every(
      (category) => fixedPackedActivations[category] > 0,
    ),
    packedVsProductionAggregate: packedVsProductionAggregatePct >= 8.5,
    packedVsProductionMedian: packedVsProductionMedianPct >= 5.5,
    packedVsProductionP90Wall: packedVsProductionP90WallRegressionPct <= 2,
    packedVsProductionCategories: categories.every(
      (category) => categoryResults[category].packedVsProductionPct >= 0,
    ),
    packedVsCurrentHeapAggregate: packedVsCurrentHeapAggregatePct >= 1.5,
    packedVsCurrentHeapMedian: packedVsCurrentHeapMedianPct >= 0,
    packedVsCurrentHeapCategories: categories.every(
      (category) => categoryResults[category].packedVsCurrentHeapPct >= -0.5,
    ),
    technicalFaultsZero: true,
  };
  const passed = Object.values(gates).every(Boolean);
  const report = {
    schemaVersion: 1,
    gate: "packed-key-heap-real-search-tuning-v1",
    status: passed ? "pass" : "fail",
    generatedAt: new Date().toISOString(),
    claimBoundary: {
      tuningOnly: true,
      formalEvidenceEligible: false,
      formalV2HoldoutReused: false,
      strengthClaim: false,
      fixedTimeMatchAuthorized: false,
      productionChangeAuthorized: false,
    },
    config: {
      ...CONFIG,
      timed: false,
      sharedTt: false,
      liveNnueScaleK: 600,
      liveNnueOutputScale: [1, 1],
    },
    runtime: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      logicalCpus: cpus().length,
      cpuModel: cpus()[0]?.model ?? null,
      elapsedMs: performance.now() - startedAt,
    },
    identities: {
      production: { path: paths.production, ...identity(bytes.production) },
      currentHeap: { path: paths.currentHeap, ...identity(bytes.currentHeap) },
      packedHeap: { path: paths.packedHeap, ...identity(bytes.packedHeap) },
      liveWeights: { path: paths.weights, ...identity(bytes.weights) },
      fixture: { path: paths.fixture, ...identity(bytes.fixture) },
    },
    fixture: {
      schemaVersion: fixture.schemaVersion,
      name: fixture.name,
      status: fixture.status ?? "tuning",
      cases: fixture.cases.length,
      counts: fixture.counts,
    },
    fixedDepth: {
      cases: fixedRows.length,
      mismatches,
      packedActivationsByCategory: fixedPackedActivations,
      rows: fixedRows,
    },
    throughput: {
      method:
        "three-arm fixed-depth fixed-work; clear TT; P,H,K,K,H,P,K,P,H,H,P,K",
      packedVsProductionAggregatePct,
      packedVsProductionMedianPct,
      packedVsProductionP90WallRegressionPct,
      packedVsCurrentHeapAggregatePct,
      packedVsCurrentHeapMedianPct,
      categoryResults,
      rows: timingRows,
    },
    gates,
    decision: passed
      ? "authorize-only-a-fresh-v3-plan-and-unused-holdout"
      : "reject-packed-key-candidate-no-v3-no-match-no-production-change",
    technicalFaults: 0,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`report: ${outputPath}`);
  console.log(
    `decision=${report.decision} K/P=${packedVsProductionAggregatePct.toFixed(
      3,
    )}% K/H=${packedVsCurrentHeapAggregatePct.toFixed(3)}%`,
  );
}

main();
