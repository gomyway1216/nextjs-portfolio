/**
 * Read-only equal-output runtime benchmark for the candidate-only KingPair
 * skeleton.  Both arms use all-zero dense outputs, so fixed-depth search must
 * visit exactly the same tree.  This measures architecture cost only; it is
 * not a strength result and never writes a production asset.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { positionFromSfen } from "../ml/shogi-sfen";
import { loadShogiWasm, syncWasm, type ShogiSearchWasm } from "./search-driver";

interface RuntimeWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numerator: number, denominator: number): void;
  setNnueForceFull(flag: number): void;
  setNnueEnabled(flag: number): void;
  setSharedTtEnabled(flag: number): void;
  getKingPairWeightsPtr?(): number;
  getKingPairWeightsSize?(): number;
  setKingPairRuntimeEnabled?(flag: number): number;
  nnueEvaluateFast(): number;
  nnueAccMismatch(): number;
}

type Arm = "production-zero" | "kingpair-zero";

const PRODUCTION_WASM =
  "src/components/game/ShogiImproved/wasm/shogi.wasm";
const FIXTURE = "wasm-spike/lazy-move-picker-fixture-v1.json";
const EXPECTED = {
  production: [
    38_288,
    "1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6",
  ],
  candidate: [
    45_805,
    "63cf89850e4fbbdfc5cb9c3042ee36c28f1bb2aac6d731398a46ad6c1c84de64",
  ],
  zeroPayload: [
    47_401_444,
    "b395833c996d95ebe5ff15774e2d4e24d76fdcbaaeeaabb2603d7e66d45da822",
  ],
  fixture: [
    29_380,
    "59c1a68bb5515447211ad57ec9cf1a27c8933b95656d78c8e7e8f213a130bdfc",
  ],
} as const;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

function identity(bytes: Uint8Array): readonly [number, string] {
  return [
    bytes.byteLength,
    createHash("sha256").update(bytes).digest("hex"),
  ];
}

function requireIdentity(
  label: string,
  bytes: Uint8Array,
  expected: readonly [number, string],
): void {
  const actual = identity(bytes);
  if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
    throw new Error(
      `${label} identity mismatch: expected ${expected.join("/")}, got ${actual.join("/")}`,
    );
  }
}

const candidatePath = argument("--wasm");
const payloadPath = argument("--weights");
const productionBytes = readFileSync(PRODUCTION_WASM);
const candidateBytes = readFileSync(candidatePath);
const zeroPayload = readFileSync(payloadPath);
const fixtureBytes = readFileSync(FIXTURE);
requireIdentity("production WASM", productionBytes, EXPECTED.production);
requireIdentity("candidate WASM", candidateBytes, EXPECTED.candidate);
requireIdentity("zero payload", zeroPayload, EXPECTED.zeroPayload);
requireIdentity("fixture", fixtureBytes, EXPECTED.fixture);

const fixture = JSON.parse(fixtureBytes.toString("utf8")) as {
  caseCount: number;
  cases: Array<{ id: string; sfen: string; tesu: number }>;
};
if (fixture.caseCount !== 64 || fixture.cases.length !== 64) {
  throw new Error("fixed-work fixture shape differs");
}
const samples = fixture.cases.map((entry) => ({
  id: entry.id,
  tesu: entry.tesu,
  position: positionFromSfen(entry.sfen).position,
}));

const engines: Record<Arm, RuntimeWasm> = {
  "production-zero": loadShogiWasm(PRODUCTION_WASM) as RuntimeWasm,
  "kingpair-zero": loadShogiWasm(candidatePath) as RuntimeWasm,
};

function installProductionZero(wasm: RuntimeWasm): void {
  wasm.setSharedTtEnabled(0);
  wasm.setNnueBuckets(81);
  // memory.grow returns zeroed pages.  Deliberately do not copy live weights.
  assertZeroRegion(wasm.memory, wasm.getNnueWeightsPtr(), wasm.getNnueWeightsSize());
  wasm.setNnueScaleK(600);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  wasm.setNnueEnabled(1);
}

function installKingPairZero(wasm: RuntimeWasm): void {
  wasm.setSharedTtEnabled(0);
  if (
    !wasm.getKingPairWeightsPtr ||
    !wasm.getKingPairWeightsSize ||
    !wasm.setKingPairRuntimeEnabled
  ) {
    throw new Error("candidate-only KingPair exports are missing");
  }
  if (wasm.getKingPairWeightsSize() !== zeroPayload.byteLength) {
    throw new Error("candidate payload length differs");
  }
  const pointer = wasm.getKingPairWeightsPtr();
  new Uint8Array(wasm.memory.buffer, pointer, zeroPayload.byteLength).set(
    zeroPayload,
  );
  wasm.setNnueScaleK(600);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  if (wasm.setKingPairRuntimeEnabled(1) !== 1) {
    throw new Error("candidate runtime could not be enabled");
  }
}

function assertZeroRegion(
  memory: WebAssembly.Memory,
  pointer: number,
  bytes: number,
): void {
  const region = new Uint8Array(memory.buffer, pointer, bytes);
  for (let index = 0; index < region.length; index += 4096) {
    if (region[index] !== 0) throw new Error("baseline zero region is not zero");
  }
  if (region[region.length - 1] !== 0) {
    throw new Error("baseline zero region tail is not zero");
  }
}

installProductionZero(engines["production-zero"]);
installKingPairZero(engines["kingpair-zero"]);

function search(arm: Arm, sample: (typeof samples)[number], ms: number, depth: number) {
  const wasm = engines[arm];
  wasm.clearTT();
  syncWasm(wasm, sample.position);
  wasm.setRootTesu(sample.tesu);
  const started = performance.now();
  const key = wasm.searchBestMove(ms, depth, 8);
  const elapsedMs = performance.now() - started;
  const result = {
    key,
    score: wasm.getSearchScore(),
    depth: wasm.getSearchDepth(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
    elapsedMs,
  };
  if (wasm.nnueAccMismatch() !== 0) {
    throw new Error(`${arm} accumulator mismatch on ${sample.id}`);
  }
  if (wasm.nnueEvaluateFast() !== 0) {
    throw new Error(`${arm} did not preserve the zero-output contract`);
  }
  return result;
}

const parity = samples.map((sample) => {
  const production = search("production-zero", sample, 0, 4);
  const kingPair = search("kingpair-zero", sample, 0, 4);
  const exact =
    production.key === kingPair.key &&
    production.score === kingPair.score &&
    production.depth === kingPair.depth &&
    production.nodes === kingPair.nodes &&
    production.leaves === kingPair.leaves;
  if (!exact) throw new Error(`fixed-work parity failed on ${sample.id}`);
  return { id: sample.id, production, kingPair };
});

function fixedPass(arm: Arm) {
  const started = performance.now();
  let work = 0;
  for (const sample of samples) {
    const result = search(arm, sample, 0, 4);
    work += result.nodes + result.leaves;
  }
  return { arm, elapsedMs: performance.now() - started, work };
}

// One warmup pair, then three AB/BA blocks.
fixedPass("production-zero");
fixedPass("kingpair-zero");
const fixedBlocks: ReturnType<typeof fixedPass>[] = [];
for (let block = 0; block < 3; block += 1) {
  const order: Arm[] =
    block % 2 === 0
      ? ["production-zero", "kingpair-zero"]
      : ["kingpair-zero", "production-zero"];
  for (const arm of order) fixedBlocks.push(fixedPass(arm));
}

const timedSamples = [0, 8, 16, 24, 32, 40, 48, 56].map(
  (index) => samples[index],
);
const timed = timedSamples.flatMap((sample, index) => {
  const order: Arm[] =
    index % 2 === 0
      ? ["production-zero", "kingpair-zero"]
      : ["kingpair-zero", "production-zero"];
  return order.map((arm) => ({ sample: sample.id, arm, ...search(arm, sample, 500, 32) }));
});

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const fixedProduction = fixedBlocks.filter(
  (entry) => entry.arm === "production-zero",
);
const fixedKingPair = fixedBlocks.filter(
  (entry) => entry.arm === "kingpair-zero",
);
const fixedSlowdown =
  mean(fixedKingPair.map((entry) => entry.elapsedMs)) /
    mean(fixedProduction.map((entry) => entry.elapsedMs)) -
  1;
const timedProductionWork = timed
  .filter((entry) => entry.arm === "production-zero")
  .map((entry) => entry.nodes + entry.leaves);
const timedKingPairWork = timed
  .filter((entry) => entry.arm === "kingpair-zero")
  .map((entry) => entry.nodes + entry.leaves);
const timedWorkRatio = mean(timedKingPairWork) / mean(timedProductionWork);

console.log(
  JSON.stringify(
    {
      status: "complete",
      interpretation: "runtime-cost-only-zero-output-not-strength",
      fixedWork: {
        positions: samples.length,
        depth: 4,
        qDepth: 8,
        exactParity: parity.length,
        blocks: fixedBlocks,
        slowdown: fixedSlowdown,
        passMaximumFivePercent: fixedSlowdown <= 0.05,
      },
      timed500ms: {
        positions: timedSamples.length,
        rows: timed,
        workRatio: timedWorkRatio,
        passMinimumNinetyFivePercent: timedWorkRatio >= 0.95,
      },
      productionAssetsModified: false,
    },
    null,
    2,
  ),
);
