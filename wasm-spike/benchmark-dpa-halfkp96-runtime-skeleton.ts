/** Equal-output runtime-only benchmark for DPA-HalfKP96. */

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
  getDpaHalfkp96WeightsPtr?(): number;
  getDpaHalfkp96WeightsSize?(): number;
  setDpaHalfkp96RuntimeEnabled?(flag: number): number;
  nnueEvaluateFast(): number;
  nnueAccMismatch(): number;
}

type Arm = "production-zero" | "dpa-halfkp96-zero";
const PRODUCTION_WASM = "src/components/game/ShogiImproved/wasm/shogi.wasm";
const FIXTURE = "wasm-spike/lazy-move-picker-fixture-v1.json";
const EXPECTED = {
  production: [38_288, "1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6"],
  candidate: [45_391, "e3e14d0836ed11d4432ff11478c98b1c808a504ff5ee99da714aa0bde4c8c606"],
  zeroPayload: [35_490_240, "00025a3b7bbe5cd28565676ed76c8f04110fdad3e9159384629d268fcc382f32"],
  fixture: [29_380, "59c1a68bb5515447211ad57ec9cf1a27c8933b95656d78c8e7e8f213a130bdfc"],
} as const;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
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
if (fixture.caseCount !== 64 || fixture.cases.length !== 64) throw new Error("fixture shape differs");
const samples = fixture.cases.map((entry) => ({
  id: entry.id,
  tesu: entry.tesu,
  position: positionFromSfen(entry.sfen).position,
}));
const engines: Record<Arm, RuntimeWasm> = {
  "production-zero": loadShogiWasm(PRODUCTION_WASM) as RuntimeWasm,
  "dpa-halfkp96-zero": loadShogiWasm(candidatePath) as RuntimeWasm,
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

function installDpa(wasm: RuntimeWasm): void {
  wasm.setSharedTtEnabled(0);
  if (!wasm.getDpaHalfkp96WeightsPtr || !wasm.getDpaHalfkp96WeightsSize || !wasm.setDpaHalfkp96RuntimeEnabled) {
    throw new Error("DPA-HalfKP96 candidate exports are missing");
  }
  if (wasm.getDpaHalfkp96WeightsSize() !== zeroPayload.byteLength) throw new Error("payload length differs");
  const pointer = wasm.getDpaHalfkp96WeightsPtr();
  new Uint8Array(wasm.memory.buffer, pointer, zeroPayload.byteLength).set(zeroPayload);
  wasm.setNnueScaleK(600);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  if (wasm.setDpaHalfkp96RuntimeEnabled(1) !== 1) throw new Error("DPA runtime enable failed");
}

installProduction(engines["production-zero"]);
installDpa(engines["dpa-halfkp96-zero"]);

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
  const candidate = search("dpa-halfkp96-zero", sample, 0, 4);
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
fixedPass("dpa-halfkp96-zero");
const fixedBlocks: ReturnType<typeof fixedPass>[] = [];
for (let block = 0; block < 3; block += 1) {
  const order: Arm[] = block % 2 === 0
    ? ["production-zero", "dpa-halfkp96-zero"]
    : ["dpa-halfkp96-zero", "production-zero"];
  for (const arm of order) fixedBlocks.push(fixedPass(arm));
}

const timedSamples = [0, 8, 16, 24, 32, 40, 48, 56].map((index) => samples[index]);
const timed = timedSamples.flatMap((sample, index) => {
  const order: Arm[] = index % 2 === 0
    ? ["production-zero", "dpa-halfkp96-zero"]
    : ["dpa-halfkp96-zero", "production-zero"];
  return order.map((arm) => ({ sample: sample.id, arm, ...search(arm, sample, 500, 32) }));
});

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
const productionBlocks = fixedBlocks.filter((entry) => entry.arm === "production-zero");
const candidateBlocks = fixedBlocks.filter((entry) => entry.arm === "dpa-halfkp96-zero");
const fixedSlowdown = mean(candidateBlocks.map((entry) => entry.elapsedMs)) /
  mean(productionBlocks.map((entry) => entry.elapsedMs)) - 1;
const productionWork = timed.filter((entry) => entry.arm === "production-zero")
  .map((entry) => entry.nodes + entry.leaves);
const candidateWork = timed.filter((entry) => entry.arm === "dpa-halfkp96-zero")
  .map((entry) => entry.nodes + entry.leaves);
const timedWorkRatio = mean(candidateWork) / mean(productionWork);

console.log(JSON.stringify({
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
}, null, 2));
