/** Equal-output runtime-only benchmark for HalfKP64+RKI16. */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

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
  getDpaHalfkp64Rki16WeightsPtr?(): number;
  getDpaHalfkp64Rki16WeightsSize?(): number;
  setDpaHalfkp64Rki16RuntimeEnabled?(flag: number): number;
  nnueEvaluateFast(): number;
  nnueAccMismatch(): number;
}

type Arm = "production-zero" | "halfkp64-rki16-zero";
const FIXTURE = "wasm-spike/lazy-move-picker-fixture-v1.json";
const EXPECTED = {
  production: [38_288, "1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6"],
  candidate: [45_751, "0c07a50793470b354bd57072565476a9a87dc9189271aa43c9ef15a0105bc7e3"],
  zeroPayload: [23_665_376, "e96b53d4538f423f6f6dc95f5b24e8743f7479714a092b86e2d0e3e8fcf33c9f"],
  fixture: [29_380, "59c1a68bb5515447211ad57ec9cf1a27c8933b95656d78c8e7e8f213a130bdfc"],
} as const;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

function optionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function identity(bytes: Uint8Array): readonly [number, string] {
  return [bytes.byteLength, createHash("sha256").update(bytes).digest("hex")];
}

function requireIdentity(label: string, bytes: Uint8Array, expected: readonly [number, string]): void {
  const actual = identity(bytes);
  if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
    throw new Error(`${label} identity mismatch: expected ${expected.join("/")}, got ${actual.join("/")}`);
  }
}

const candidatePath = argument("--wasm");
const payloadPath = argument("--weights");
// The shipped path now contains the promoted candidate. Require the caller to
// identify the preserved baseline explicitly so a candidate-vs-candidate run
// cannot masquerade as a runtime comparison.
const productionPath = argument("--production-wasm");
const productionBytes = readFileSync(productionPath);
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
if (fixture.caseCount !== 64 || fixture.cases.length !== 64) throw new Error("fixture shape differs");
const samples = fixture.cases.map((entry) => ({
  id: entry.id,
  tesu: entry.tesu,
  position: positionFromSfen(entry.sfen).position,
}));
const engines: Record<Arm, RuntimeWasm> = {
  "production-zero": loadShogiWasm(productionPath) as RuntimeWasm,
  "halfkp64-rki16-zero": loadShogiWasm(candidatePath) as RuntimeWasm,
};

function assertZeroRegion(memory: WebAssembly.Memory, pointer: number, bytes: number): void {
  const region = new Uint8Array(memory.buffer, pointer, bytes);
  for (let index = 0; index < region.length; index += 4096) {
    if (region[index] !== 0) throw new Error("production zero region is not zero");
  }
  if (region[region.length - 1] !== 0) throw new Error("production zero region tail is not zero");
}

function installProduction(wasm: RuntimeWasm): void {
  wasm.setSharedTtEnabled(0);
  wasm.setNnueBuckets(81);
  assertZeroRegion(wasm.memory, wasm.getNnueWeightsPtr(), wasm.getNnueWeightsSize());
  wasm.setNnueScaleK(600);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  wasm.setNnueEnabled(1);
}

function installRki(wasm: RuntimeWasm): void {
  wasm.setSharedTtEnabled(0);
  if (!wasm.getDpaHalfkp64Rki16WeightsPtr || !wasm.getDpaHalfkp64Rki16WeightsSize || !wasm.setDpaHalfkp64Rki16RuntimeEnabled) {
    throw new Error("HalfKP64+RKI16 candidate exports are missing");
  }
  if (wasm.getDpaHalfkp64Rki16WeightsSize() !== zeroPayload.byteLength) throw new Error("payload length differs");
  const pointer = wasm.getDpaHalfkp64Rki16WeightsPtr();
  new Uint8Array(wasm.memory.buffer, pointer, zeroPayload.byteLength).set(zeroPayload);
  wasm.setNnueScaleK(600);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  if (wasm.setDpaHalfkp64Rki16RuntimeEnabled(1) !== 1) throw new Error("RKI runtime enable failed");
}

installProduction(engines["production-zero"]);
installRki(engines["halfkp64-rki16-zero"]);

function search(arm: Arm, sample: (typeof samples)[number], ms: number, depth: number) {
  const wasm = engines[arm];
  wasm.clearTT();
  syncWasm(wasm, sample.position);
  wasm.setRootTesu(sample.tesu);
  const started = performance.now();
  const key = wasm.searchBestMove(ms, depth, 8);
  const result = {
    key,
    score: wasm.getSearchScore(),
    depth: wasm.getSearchDepth(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
    elapsedMs: performance.now() - started,
  };
  if (wasm.nnueAccMismatch() !== 0) throw new Error(`${arm} accumulator mismatch on ${sample.id}`);
  if (wasm.nnueEvaluateFast() !== 0) throw new Error(`${arm} violated zero-output contract`);
  return result;
}

const parity = samples.map((sample) => {
  const production = search("production-zero", sample, 0, 4);
  const candidate = search("halfkp64-rki16-zero", sample, 0, 4);
  const exact = production.key === candidate.key && production.score === candidate.score &&
    production.depth === candidate.depth && production.nodes === candidate.nodes &&
    production.leaves === candidate.leaves;
  if (!exact) throw new Error(`fixed-work parity failed on ${sample.id}`);
  return sample.id;
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

fixedPass("production-zero");
fixedPass("halfkp64-rki16-zero");
const fixedBlocks: ReturnType<typeof fixedPass>[] = [];
for (let block = 0; block < 3; block += 1) {
  const order: Arm[] = block % 2 === 0
    ? ["production-zero", "halfkp64-rki16-zero"]
    : ["halfkp64-rki16-zero", "production-zero"];
  for (const arm of order) fixedBlocks.push(fixedPass(arm));
}

const timedSamples = [0, 8, 16, 24, 32, 40, 48, 56].map((index) => samples[index]);
const timed = timedSamples.flatMap((sample, index) => {
  const order: Arm[] = index % 2 === 0
    ? ["production-zero", "halfkp64-rki16-zero"]
    : ["halfkp64-rki16-zero", "production-zero"];
  return order.map((arm) => ({ sample: sample.id, arm, ...search(arm, sample, 500, 32) }));
});

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
const productionBlocks = fixedBlocks.filter((entry) => entry.arm === "production-zero");
const candidateBlocks = fixedBlocks.filter((entry) => entry.arm === "halfkp64-rki16-zero");
const fixedSlowdown = mean(candidateBlocks.map((entry) => entry.elapsedMs)) /
  mean(productionBlocks.map((entry) => entry.elapsedMs)) - 1;
const productionWork = timed.filter((entry) => entry.arm === "production-zero")
  .map((entry) => entry.nodes + entry.leaves);
const candidateWork = timed.filter((entry) => entry.arm === "halfkp64-rki16-zero")
  .map((entry) => entry.nodes + entry.leaves);
const timedWorkRatio = mean(candidateWork) / mean(productionWork);

const report = {
  status: "complete",
  interpretation: "runtime-cost-only-zero-output-not-strength",
  fixedWork: {
    positions: 64,
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
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = optionalArgument("--out");
if (outputPath) writeFileSync(outputPath, serialized, { flag: "wx" });
console.log(serialized.trimEnd());
