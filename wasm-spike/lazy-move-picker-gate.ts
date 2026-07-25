/**
 * Fixed-depth correctness and speed gate for a research-only lazy move picker.
 *
 * The gate compares the byte-pinned production WASM with an explicitly chosen
 * research artifact. Both runtimes receive the exact live 1-bucket weights.
 * Every timed search is fixed-depth and must reproduce best move, score, depth,
 * nodes, and leaves exactly.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/lazy-move-picker-gate.ts \
 *     --candidate wasm-spike/artifacts/shogi-lazy-move-picker-research.wasm \
 *     --json /tmp/lazy-move-picker-result.json
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";

import { positionFromSfen, rulesCompleteLegalMoves } from "../ml/shogi-sfen";
import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import type { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import { loadShogiWasm, syncWasm, type ShogiSearchWasm } from "./search-driver";

const EXPECTED = {
  productionWasm: {
    bytes: 35_597,
    sha256: "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
  },
  liveWeights: {
    bytes: 1_185_988,
    sha256: "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
  },
  fixture: {
    bytes: 29_380,
    sha256: "59c1a68bb5515447211ad57ec9cf1a27c8933b95656d78c8e7e8f213a130bdfc",
  },
  formalFixture: {
    bytes: 35_586,
    sha256: "d942aee3de2449a9e811862cf88eef3981e2b49bad5122c71e529630b905786f",
  },
  researchWasm: {
    bytes: 36_358,
    sha256: "49b66b2466c654232a6bccc5e3d7a72d69ec71d46977aa17f8644cc84361d311",
  },
} as const;

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
  setResearchLazyMovePicker?: (flag: number, minMoves: number) => void;
  getResearchLazyMovePickerEnabled?: () => number;
  getResearchLazyMovePickerMinMoves?: () => number;
  getResearchLazyMovePickerNodes?: () => number;
}

type Category = "opening" | "middlegame" | "dropHeavy" | "checkEvasion";

interface FixtureCase {
  id: string;
  category: Category;
  sfen: string;
  tesu: number;
  source: string;
  handCount: number;
  legalMoves: number;
  legalDrops: number;
  inCheck: boolean;
  sourceGame?: string | null;
  sourceRole?: "openingHoldout" | "browserTrain" | "browserValidation";
  selectionSha256?: string;
}

interface Fixture {
  schemaVersion: number;
  name: string;
  status?: string;
  counts: Record<Category, number>;
  cases: FixtureCase[];
  selection?: {
    domain: string;
    formula: string;
  };
}

interface PositionCase extends FixtureCase {
  position: KyokumenImproved;
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
  arm: "baseline" | "candidate";
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
  baselineElapsedMs: number;
  candidateElapsedMs: number;
  baselineNps: number;
  candidateNps: number;
  npsDeltaPct: number;
  wallRegressionPct: number;
  candidateLazyNodes: number;
}

function valueArg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} requires a value`);
  return value;
}

function integerArg(
  flag: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(valueArg(flag, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${flag} must be an integer in ${minimum}..${maximum}`);
  }
  return value;
}

function numberArg(flag: string, fallback: number, minimum: number): number {
  const value = Number(valueArg(flag, String(fallback)));
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${flag} must be a finite number >= ${minimum}`);
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

function installLiveWeights(wasm: NnueWasm, weights: Uint8Array): void {
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

function loadFixture(path: string): {
  fixture: Fixture;
  positions: PositionCase[];
} {
  const bytes = readFileSync(path);
  const fixtureIdentity = identity(bytes);
  const allowedFixtureIdentities = [EXPECTED.fixture, EXPECTED.formalFixture];
  if (
    !allowedFixtureIdentities.some(
      (expected) =>
        expected.bytes === fixtureIdentity.bytes &&
        expected.sha256 === fixtureIdentity.sha256,
    )
  ) {
    throw new Error(
      `fixture identity is not an allowed tuning/formal fixture: ` +
        `${fixtureIdentity.bytes}/${fixtureIdentity.sha256}`,
    );
  }
  const fixture = JSON.parse(bytes.toString("utf8")) as Fixture;
  const categories: Category[] = [
    "opening",
    "middlegame",
    "dropHeavy",
    "checkEvasion",
  ];
  if (
    (fixture.schemaVersion !== 1 && fixture.schemaVersion !== 2) ||
    fixture.cases.length !== 64 ||
    categories.some(
      (category) =>
        fixture.counts[category] !== 16 ||
        fixture.cases.filter((entry) => entry.category === category).length !==
          16,
    )
  ) {
    throw new Error(
      "fixture must contain exactly 16 cases in each of four categories",
    );
  }
  const ids = new Set(fixture.cases.map((entry) => entry.id));
  const sfens = new Set(fixture.cases.map((entry) => entry.sfen));
  if (ids.size !== 64 || sfens.size !== 64)
    throw new Error("fixture ids and SFENs must be unique");
  if (fixture.schemaVersion === 2) {
    if (
      fixture.status !== "formal-holdout-not-for-tuning" ||
      fixture.selection?.domain !== "lazy-move-picker-formal-fixture-v2"
    ) {
      throw new Error("formal fixture status or selection domain differs");
    }
    const checkGames = new Set<string>();
    for (const entry of fixture.cases) {
      const parsed = positionFromSfen(entry.sfen);
      const legal = rulesCompleteLegalMoves(parsed.position);
      const handCount = parsed.position.hand.reduce(
        (sum, count) => sum + count,
        0,
      );
      const inCheck = GenerateMovesImproved.isKingInCheck(
        parsed.position,
        parsed.position.teban,
      );
      const legalDrops = legal.filter((move) => move.move.from === 0).length;
      const selectionSha256 = createHash("sha256")
        .update(
          `${fixture.selection.domain}\0${entry.category}\0${entry.sfen}\0${
            entry.sourceGame ?? "-"
          }`,
          "utf8",
        )
        .digest("hex");
      if (
        entry.tesu !== parsed.moveNumber - 1 ||
        entry.handCount !== handCount ||
        entry.legalMoves !== legal.length ||
        entry.legalDrops !== legalDrops ||
        entry.inCheck !== inCheck ||
        entry.selectionSha256 !== selectionSha256
      ) {
        throw new Error(`formal fixture metadata differs for ${entry.id}`);
      }
      if (entry.category === "checkEvasion") {
        if (
          !entry.sourceGame ||
          checkGames.has(entry.sourceGame) ||
          entry.sourceRole === "openingHoldout" ||
          !inCheck
        ) {
          throw new Error(
            `formal check-evasion contract differs for ${entry.id}`,
          );
        }
        checkGames.add(entry.sourceGame);
      }
    }
    if (checkGames.size !== 16) {
      throw new Error(
        "formal check-evasion cases must use 16 distinct source games",
      );
    }
  }
  return {
    fixture,
    positions: fixture.cases.map((entry) => ({
      ...entry,
      position: positionFromSfen(entry.sfen).position,
    })),
  };
}

function search(
  wasm: NnueWasm,
  sample: PositionCase,
  depth: number,
  qDepth: number,
): SearchResult {
  wasm.clearTT();
  syncWasm(wasm, sample.position);
  wasm.setRootTesu(sample.tesu);
  const started = performance.now();
  const key = wasm.searchBestMove(0, depth, qDepth);
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
  arm: "baseline" | "candidate",
  wasm: NnueWasm,
  sample: PositionCase,
  depth: number,
  qDepth: number,
  repeats: number,
  expected: SearchResult,
): TimingBlock {
  let elapsedMs = 0;
  let lazyNodes = 0;
  for (let repeat = 0; repeat < repeats; repeat++) {
    const result = search(wasm, sample, depth, qDepth);
    if (!sameTree(expected, result)) {
      throw new Error(
        `${sample.id} ${arm} timing search changed the fixed tree: ` +
          `${JSON.stringify({ expected, result })}`,
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
    nps: (work * 1000) / elapsedMs,
    lazyNodes,
  };
}

function writeReport(path: string, report: object): void {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`report: ${absolute}`);
}

function main(): void {
  const root = resolve(__dirname, "..");
  const baselinePath = resolve(
    valueArg(
      "--baseline",
      resolve(
        root,
        "src",
        "components",
        "game",
        "ShogiImproved",
        "wasm",
        "shogi.wasm",
      ),
    ),
  );
  const candidatePath = resolve(
    valueArg(
      "--candidate",
      resolve(
        root,
        "wasm-spike",
        "artifacts",
        "shogi-lazy-move-picker-research.wasm",
      ),
    ),
  );
  const weightsPath = resolve(
    valueArg("--weights", resolve(root, "public", "shogi-nnue-weights.bin")),
  );
  const fixturePath = resolve(
    valueArg(
      "--fixture",
      resolve(root, "wasm-spike", "lazy-move-picker-fixture-v1.json"),
    ),
  );
  const jsonPath = valueArg("--json", "/tmp/lazy-move-picker-result.json");
  const depth = integerArg("--depth", 5, 1, 8);
  const qDepth = integerArg("--q-depth", 8, 0, 16);
  const minMoves = integerArg("--min-moves", 64, 2, 640);
  const minimumBlockMs = numberArg("--min-block-ms", 100, 10);
  const maximumRepeats = integerArg("--max-repeats", 2_000, 1, 100_000);

  const baselineBytes = readFileSync(baselinePath);
  const candidateBytes = readFileSync(candidatePath);
  const weights = readFileSync(weightsPath);
  requireIdentity("production WASM", baselineBytes, EXPECTED.productionWasm);
  requireIdentity("research WASM", candidateBytes, EXPECTED.researchWasm);
  requireIdentity("live weights", weights, EXPECTED.liveWeights);
  const { fixture, positions } = loadFixture(fixturePath);

  const baseline = loadShogiWasm(baselinePath) as NnueWasm;
  const candidate = loadShogiWasm(candidatePath) as NnueWasm;
  if (baseline.setResearchLazyMovePicker !== undefined) {
    throw new Error("production WASM unexpectedly exposes the research picker");
  }
  if (
    candidate.setResearchLazyMovePicker === undefined ||
    candidate.getResearchLazyMovePickerEnabled === undefined ||
    candidate.getResearchLazyMovePickerNodes === undefined
  ) {
    throw new Error(
      "candidate does not expose the research picker controls and counter",
    );
  }
  installLiveWeights(baseline, weights);
  installLiveWeights(candidate, weights);
  candidate.setResearchLazyMovePicker(1, minMoves);
  if (
    candidate.getResearchLazyMovePickerEnabled() !== 1 ||
    candidate.getResearchLazyMovePickerMinMoves?.() !== minMoves
  ) {
    throw new Error(
      "candidate did not accept the requested picker configuration",
    );
  }

  const fixedRows: object[] = [];
  const expectedById = new Map<string, SearchResult>();
  let fixedMismatches = 0;
  let fixedLazyNodes = 0;
  for (const sample of positions) {
    const expected = search(baseline, sample, depth, qDepth);
    const result = search(candidate, sample, depth, qDepth);
    const exact = sameTree(expected, result);
    if (!exact) fixedMismatches++;
    fixedLazyNodes += result.lazyNodes;
    expectedById.set(sample.id, expected);
    fixedRows.push({
      id: sample.id,
      category: sample.category,
      exact,
      baseline: expected,
      candidate: result,
    });
  }
  if (fixedMismatches !== 0) {
    throw new Error(
      `fixed-depth tree gate failed with ${fixedMismatches} mismatches`,
    );
  }
  if (fixedLazyNodes === 0)
    throw new Error("fixed-depth gate did not activate the candidate");

  const timingRows: TimingRow[] = [];
  const timingOrder: Array<"baseline" | "candidate"> = [
    "baseline",
    "candidate",
    "candidate",
    "baseline",
    "candidate",
    "baseline",
    "baseline",
    "candidate",
  ];
  for (const [index, sample] of positions.entries()) {
    const expected = expectedById.get(sample.id);
    if (!expected) throw new Error(`missing fixed result for ${sample.id}`);

    const baselineWarm = search(baseline, sample, depth, qDepth);
    const candidateWarm = search(candidate, sample, depth, qDepth);
    if (
      !sameTree(expected, baselineWarm) ||
      !sameTree(expected, candidateWarm)
    ) {
      throw new Error(`${sample.id} warmup changed the fixed search tree`);
    }
    const warmMs = Math.max(
      0.01,
      baselineWarm.elapsedMs,
      candidateWarm.elapsedMs,
    );
    const repeats = Math.min(
      maximumRepeats,
      Math.max(1, Math.ceil(minimumBlockMs / warmMs)),
    );
    const blocks = timingOrder.map((arm) =>
      runBlock(
        arm,
        arm === "baseline" ? baseline : candidate,
        sample,
        depth,
        qDepth,
        repeats,
        expected,
      ),
    );
    const baselineBlocks = blocks.filter((block) => block.arm === "baseline");
    const candidateBlocks = blocks.filter((block) => block.arm === "candidate");
    const baselineElapsedMs = baselineBlocks.reduce(
      (sum, block) => sum + block.elapsedMs,
      0,
    );
    const candidateElapsedMs = candidateBlocks.reduce(
      (sum, block) => sum + block.elapsedMs,
      0,
    );
    const workPerArm = baselineBlocks.reduce(
      (sum, block) => sum + block.work,
      0,
    );
    const baselineNps = (workPerArm * 1000) / baselineElapsedMs;
    const candidateNps = (workPerArm * 1000) / candidateElapsedMs;
    const candidateLazyNodes = candidateBlocks.reduce(
      (sum, block) => sum + block.lazyNodes,
      0,
    );
    timingRows.push({
      id: sample.id,
      category: sample.category,
      workPerSearch: expected.nodes + expected.leaves,
      repeatsPerBlock: repeats,
      blocks,
      baselineElapsedMs,
      candidateElapsedMs,
      baselineNps,
      candidateNps,
      npsDeltaPct: (candidateNps / baselineNps - 1) * 100,
      wallRegressionPct: (candidateElapsedMs / baselineElapsedMs - 1) * 100,
      candidateLazyNodes,
    });
    console.log(
      `${String(index + 1).padStart(2)}/64 ${sample.id}: ` +
        `${((candidateNps / baselineNps - 1) * 100).toFixed(2)}%, ` +
        `lazy=${candidateLazyNodes}`,
    );
  }

  const totalBaselineWork = timingRows.reduce(
    (sum, row) =>
      sum +
      row.blocks
        .filter((block) => block.arm === "baseline")
        .reduce((blockSum, block) => blockSum + block.work, 0),
    0,
  );
  const totalCandidateWork = timingRows.reduce(
    (sum, row) =>
      sum +
      row.blocks
        .filter((block) => block.arm === "candidate")
        .reduce((blockSum, block) => blockSum + block.work, 0),
    0,
  );
  const totalBaselineMs = timingRows.reduce(
    (sum, row) => sum + row.baselineElapsedMs,
    0,
  );
  const totalCandidateMs = timingRows.reduce(
    (sum, row) => sum + row.candidateElapsedMs,
    0,
  );
  const baselineAggregateNps = (totalBaselineWork * 1000) / totalBaselineMs;
  const candidateAggregateNps = (totalCandidateWork * 1000) / totalCandidateMs;
  const aggregateDeltaPct =
    (candidateAggregateNps / baselineAggregateNps - 1) * 100;
  const medianDeltaPct = median(timingRows.map((row) => row.npsDeltaPct));
  const p90WallRegressionPct = percentile(
    timingRows.map((row) => row.wallRegressionPct),
    0.9,
  );
  const categories: Category[] = [
    "opening",
    "middlegame",
    "dropHeavy",
    "checkEvasion",
  ];
  const categoryRows = Object.fromEntries(
    categories.map((category) => {
      const rows = timingRows.filter((row) => row.category === category);
      const baselineMs = rows.reduce(
        (sum, row) => sum + row.baselineElapsedMs,
        0,
      );
      const candidateMs = rows.reduce(
        (sum, row) => sum + row.candidateElapsedMs,
        0,
      );
      const baselineWork = rows.reduce(
        (sum, row) =>
          sum +
          row.blocks
            .filter((block) => block.arm === "baseline")
            .reduce((blockSum, block) => blockSum + block.work, 0),
        0,
      );
      const candidateWork = rows.reduce(
        (sum, row) =>
          sum +
          row.blocks
            .filter((block) => block.arm === "candidate")
            .reduce((blockSum, block) => blockSum + block.work, 0),
        0,
      );
      const baselineNps = (baselineWork * 1000) / baselineMs;
      const candidateNps = (candidateWork * 1000) / candidateMs;
      return [
        category,
        {
          cases: rows.length,
          baselineNps,
          candidateNps,
          deltaPct: (candidateNps / baselineNps - 1) * 100,
        },
      ];
    }),
  ) as Record<
    Category,
    {
      cases: number;
      baselineNps: number;
      candidateNps: number;
      deltaPct: number;
    }
  >;
  const activationByCategory = Object.fromEntries(
    categories.map((category) => [
      category,
      timingRows
        .filter((row) => row.category === category)
        .reduce((sum, row) => sum + row.candidateLazyNodes, 0),
    ]),
  ) as Record<Category, number>;
  const nonVacuous =
    fixedLazyNodes > 0 &&
    (fixture.schemaVersion === 2
      ? categories.every((category) => activationByCategory[category] > 0)
      : timingRows.every((row) => row.candidateLazyNodes > 0));
  const gates = {
    exact64: fixedMismatches === 0 && fixedRows.length === 64,
    nonVacuous,
    aggregateAtLeast8Pct: aggregateDeltaPct >= 8,
    medianAtLeast5Pct: medianDeltaPct >= 5,
    p90WallRegressionAtMost2Pct: p90WallRegressionPct <= 2,
    categoryAggregatesNonnegative: categories.every(
      (category) => categoryRows[category].deltaPct >= 0,
    ),
    technicalFaultsZero: true,
  };
  const passed = Object.values(gates).every(Boolean);
  const report = {
    schemaVersion: 2,
    gate:
      fixture.schemaVersion === 2
        ? "stable-heap-move-picker-formal-holdout-g2"
        : "stable-heap-move-picker-tuning-g1",
    status: passed ? "pass" : "fail",
    generatedAt: new Date().toISOString(),
    config: {
      depth,
      qDepth,
      minMoves,
      minimumBlockMs,
      maximumRepeats,
      timingOrder,
      liveNnueScaleK: 600,
      liveNnueOutputScale: [1, 1],
      sharedTt: false,
      timed: false,
      nonVacuousPolicy:
        fixture.schemaVersion === 2
          ? "at-least-one-activation-in-each-category"
          : "at-least-one-activation-in-every-row",
      thresholds: {
        aggregateDeltaPctAtLeast: 8,
        medianDeltaPctAtLeast: 5,
        p90WallRegressionPctAtMost: 2,
        categoryAggregateDeltaPctAtLeast: 0,
      },
    },
    runtime: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      logicalCpus: cpus().length,
      cpuModel: cpus()[0]?.model ?? null,
    },
    identities: {
      baseline: { path: baselinePath, ...identity(baselineBytes) },
      candidate: { path: candidatePath, ...identity(candidateBytes) },
      liveWeights: { path: weightsPath, ...identity(weights) },
      fixture: { path: fixturePath, ...identity(readFileSync(fixturePath)) },
    },
    fixture: {
      schemaVersion: fixture.schemaVersion,
      name: fixture.name,
      status: fixture.status ?? "tuning",
      counts: fixture.counts,
      cases: positions.length,
    },
    fixedDepth: {
      cases: fixedRows.length,
      mismatches: fixedMismatches,
      candidateLazyNodes: fixedLazyNodes,
      rows: fixedRows,
    },
    throughput: {
      method:
        "fixed-depth fixed-work, clear TT before every search, ABBA then BAAB equal-repeat blocks",
      rows: timingRows,
      baselineAggregateNps,
      candidateAggregateNps,
      aggregateDeltaPct,
      medianDeltaPct,
      p90WallRegressionPct,
      categories: categoryRows,
      activationByCategory,
    },
    gates,
    passed,
    productionChanged: false,
  };
  writeReport(jsonPath, report);
  console.log(
    `fixed=${fixedRows.length - fixedMismatches}/${fixedRows.length}, ` +
      `aggregate=${aggregateDeltaPct.toFixed(2)}%, median=${medianDeltaPct.toFixed(2)}%, ` +
      `p90 wall regression=${p90WallRegressionPct.toFixed(2)}%, ` +
      `G1=${passed ? "PASS" : "FAIL"}`,
  );
  if (!passed) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 2;
}
