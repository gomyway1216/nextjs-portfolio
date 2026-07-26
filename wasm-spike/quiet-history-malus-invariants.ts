/**
 * Correctness gate for the isolated bounded quiet-history + malus pilot.
 *
 * The production runtime and default-off research runtime must return the
 * exact same fixed-depth tree. Two enabled research instances must agree with
 * each other while exercising bounded reward and malus updates.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/quiet-history-malus-invariants.ts \
 *     --plan /absolute/preregistration.json --plan-sha <sha256>
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { positionFromSfen } from "../ml/shogi-sfen";
import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import type { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import type { Te } from "../src/components/game/ShogiImproved/types";
import { syncWasm, type ShogiSearchWasm } from "./search-driver";

const HISTORY_MAX = 16_384;
const SEARCHED_QUIET_CAP = 32;
const FIXTURE_IDENTITY = {
  bytes: 35_586,
  sha256: "d942aee3de2449a9e811862cf88eef3981e2b49bad5122c71e529630b905786f",
};
const PLAN_SCHEMA = "shogi-bounded-quiet-history-malus-plan-v1";
const RESULT_SCHEMA =
  "shogi-bounded-quiet-history-correctness-result-v1" as const;
const PLAN_PATH = "ml/protocols/bounded-quiet-history-malus-v1-plan.json";
const RUNNER_PATH = "wasm-spike/quiet-history-malus-invariants.ts";
const FIXTURE_PATH = "wasm-spike/lazy-move-picker-fixture-v2.json";
const SHA256_RE = /^[0-9a-f]{64}$/u;

interface AssetIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface CapturedCorrectnessPlan {
  readonly path: string;
  readonly sha256: string;
  readonly root: string;
  readonly depth: 5;
  readonly qDepth: 8;
  readonly assets: Readonly<{
    readonly productionWasm: Readonly<AssetIdentity>;
    readonly researchWasm: Readonly<AssetIdentity>;
    readonly liveWeights: Readonly<AssetIdentity>;
    readonly fixture: Readonly<AssetIdentity>;
    readonly runner: Readonly<AssetIdentity>;
  }>;
}

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
  getBanHash(): number;
  getHandHash(): number;
  getTeban(): number;
  getHashVal(): number;
}

interface ResearchWasm extends NnueWasm {
  setResearchQuietHistoryMalus(flag: number): void;
  getResearchQuietHistoryMalusEnabled(): number;
  getResearchQuietHistoryMax(): number;
  getResearchQuietHistoryCap(): number;
  getResearchQuietCutoffEvents(): number;
  getResearchQuietRewardMoveEvents(): number;
  getResearchQuietMalusMoveEvents(): number;
  getResearchQuietMainUpdates(): number;
  getResearchQuietContinuationUpdates(): number;
  getResearchQuietStoredPeak(): number;
  getResearchQuietStorageDrops(): number;
  getResearchQuietMaxAbsMain(): number;
  getResearchQuietMaxAbsContinuation(): number;
  getResearchQuietNonQuietUpdateViolations(): number;
  researchQuietHistoryUpdateProbe(current: number, rawBonus: number): number;
}

type Category = "opening" | "middlegame" | "dropHeavy" | "checkEvasion";

interface FixtureCase {
  id: string;
  category: Category;
  sfen: string;
  tesu: number;
}

interface Fixture {
  schemaVersion: number;
  status: string;
  caseCount: number;
  counts: Record<Category, number>;
  cases: FixtureCase[];
}

interface SearchTree {
  key: number;
  score: number;
  depth: number;
  nodes: number;
  leaves: number;
}

interface Counters {
  cutoffs: number;
  rewards: number;
  maluses: number;
  mainUpdates: number;
  continuationUpdates: number;
  storedPeak: number;
  storageDrops: number;
  maxAbsMain: number;
  maxAbsContinuation: number;
  nonQuietViolations: number;
}

interface SearchResult {
  tree: SearchTree;
  counters: Counters | null;
  stateBefore: StateChecksum;
  stateAfter: StateChecksum;
}

interface StateChecksum {
  banHash: number;
  handHash: number;
  teban: number;
  hashVal: number;
}

interface InvariantRow {
  id: string;
  category: Category;
  offExact: boolean;
  onDeterministic: boolean;
  onMoveLegal: boolean;
  stateChecksumsUnchanged: boolean;
  baseline: SearchTree;
  enabled: SearchTree;
  counters: Counters;
}

export interface QuietHistoryInvariantReport {
  schemaVersion: 1;
  depth: number;
  qDepth: number;
  cases: number;
  rows: InvariantRow[];
  totals: Omit<Counters, "storedPeak" | "maxAbsMain" | "maxAbsContinuation"> & {
    storedPeak: number;
    maxAbsMain: number;
    maxAbsContinuation: number;
  };
  activationByCategory: Record<
    Category,
    {
      cutoffs: number;
      rewards: number;
      maluses: number;
      mainUpdates: number;
      continuationUpdates: number;
    }
  >;
  gates: {
    fixtureShape: boolean;
    defaultOff: boolean;
    offExact64: boolean;
    offCountersZero: boolean;
    onDeterministic64: boolean;
    onMovesLegal64: boolean;
    stateChecksumsUnchanged64: boolean;
    rewardActivated: boolean;
    malusActivated: boolean;
    mainHistoryActivated: boolean;
    continuationHistoryActivated: boolean;
    rewardAndMalusActivatedEveryCategory: boolean;
    historyBounded: boolean;
    searchedQuietCapRespected: boolean;
    nonQuietViolationsZero: boolean;
  };
}

type JsonRecord = Record<string, unknown>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function captureIdentity(value: unknown, label: string): AssetIdentity {
  const asset = record(value, label);
  if (
    typeof asset.path !== "string" ||
    asset.path.length === 0 ||
    asset.path.includes("\0") ||
    asset.path.includes("\\") ||
    isAbsolute(asset.path) ||
    asset.path
      .split("/")
      .some(
        (component) =>
          component === "" || component === "." || component === "..",
      ) ||
    !Number.isSafeInteger(asset.bytes) ||
    (asset.bytes as number) < 1 ||
    typeof asset.sha256 !== "string" ||
    !SHA256_RE.test(asset.sha256)
  ) {
    throw new Error(`${label} identity is invalid`);
  }
  return Object.freeze({
    path: asset.path,
    bytes: asset.bytes as number,
    sha256: asset.sha256,
  });
}

function authenticateIdentity(
  root: string,
  identity: Readonly<AssetIdentity>,
  label: string,
): string {
  const path = realpathSync(resolve(root, identity.path));
  const pathFromRoot = relative(root, path);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`${label} resolves outside the repository`);
  }
  if (!statSync(path).isFile()) {
    throw new Error(`${label} is not a regular file`);
  }
  const bytes = readFileSync(path);
  if (
    bytes.byteLength !== identity.bytes ||
    sha256(bytes) !== identity.sha256
  ) {
    throw new Error(`${label} identity differs`);
  }
  return path;
}

function repositoryRoot(): string {
  const root = realpathSync(process.cwd());
  const sourceRoot = realpathSync(resolve(__dirname, ".."));
  if (
    root !== sourceRoot ||
    !existsSync(resolve(root, "package.json")) ||
    !existsSync(resolve(root, ".git")) ||
    !existsSync(resolve(root, RUNNER_PATH))
  ) {
    throw new Error("correctness runner is not anchored in the repository");
  }
  return root;
}

export function loadQuietHistoryCorrectnessPlan(
  planPathValue: string,
  expectedSha256: string,
): Readonly<CapturedCorrectnessPlan> {
  if (!SHA256_RE.test(expectedSha256)) {
    throw new Error("--plan-sha must be a lowercase SHA-256");
  }
  if (!isAbsolute(planPathValue)) {
    throw new Error("--plan must be an absolute path");
  }
  const root = repositoryRoot();
  const path = realpathSync(planPathValue);
  const fixedPlanPath = realpathSync(resolve(root, PLAN_PATH));
  const planFromRoot = relative(root, path);
  if (
    path !== fixedPlanPath ||
    planFromRoot === ".." ||
    planFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(planFromRoot) ||
    !statSync(path).isFile()
  ) {
    throw new Error(`--plan must resolve to ${PLAN_PATH}`);
  }
  const planBytes = readFileSync(path);
  const planSha256 = sha256(planBytes);
  if (planSha256 !== expectedSha256) {
    throw new Error("preregistration plan SHA-256 differs");
  }
  const plan = record(JSON.parse(planBytes.toString("utf8")), "plan");
  if (
    plan.schema !== PLAN_SCHEMA ||
    plan.plan_id !== "bounded-quiet-history-malus-v1"
  ) {
    throw new Error("preregistration plan header differs");
  }
  const pinned = record(plan.pinned_inputs, "pinned inputs");
  const artifacts = record(
    plan.planned_research_artifacts,
    "research artifacts",
  );
  const gate = record(plan.correctness_gate, "correctness gate");
  const search = record(gate.search, "correctness search");
  if (
    search.fixed_depth !== 5 ||
    search.quiescence_depth !== 8 ||
    search.timed !== false ||
    search.shared_tt !== false ||
    search.clear_tt_before_every_search !== true
  ) {
    throw new Error("correctness search contract differs");
  }
  const productionWasm = captureIdentity(
    pinned.production_wasm,
    "production WASM",
  );
  const researchWasm = captureIdentity(
    artifacts.research_wasm,
    "research WASM",
  );
  const liveWeightsPlan = record(pinned.immutable_live_weights, "live weights");
  const liveWeights = captureIdentity(liveWeightsPlan, "live weights");
  const fixture = captureIdentity(
    pinned.correctness_fixture,
    "correctness fixture",
  );
  const runner = captureIdentity(
    artifacts.correctness_runner,
    "correctness runner",
  );
  if (
    productionWasm.path !==
      "src/components/game/ShogiImproved/wasm/shogi.wasm" ||
    researchWasm.path !==
      "wasm-spike/artifacts/shogi-quiet-history-malus-research.wasm" ||
    liveWeights.path !== "public/shogi-nnue-weights.bin" ||
    fixture.path !== FIXTURE_PATH ||
    fixture.bytes !== FIXTURE_IDENTITY.bytes ||
    fixture.sha256 !== FIXTURE_IDENTITY.sha256 ||
    runner.path !== RUNNER_PATH ||
    liveWeightsPlan.buckets !== 1 ||
    liveWeightsPlan.scale_k !== 600 ||
    !Array.isArray(liveWeightsPlan.output_scale) ||
    liveWeightsPlan.output_scale.length !== 2 ||
    liveWeightsPlan.output_scale[0] !== 1 ||
    liveWeightsPlan.output_scale[1] !== 1 ||
    gate.strength_metric !== false ||
    gate.technical_fault_count !== 0
  ) {
    throw new Error(
      "correctness asset path, NNUE configuration, or gate identity differs",
    );
  }
  for (const [identity, label] of [
    [productionWasm, "production WASM"],
    [researchWasm, "research WASM"],
    [liveWeights, "live weights"],
    [fixture, "correctness fixture"],
    [runner, "correctness runner"],
  ] as const) {
    authenticateIdentity(root, identity, label);
  }
  return Object.freeze({
    path,
    sha256: planSha256,
    root,
    depth: 5,
    qDepth: 8,
    assets: Object.freeze({
      productionWasm,
      researchWasm,
      liveWeights,
      fixture,
      runner,
    }),
  });
}

function authenticateCapturedPlan(
  captured: Readonly<CapturedCorrectnessPlan>,
): void {
  const planBytes = readFileSync(captured.path);
  if (sha256(planBytes) !== captured.sha256) {
    throw new Error("preregistration plan changed during correctness run");
  }
  for (const [identity, label] of [
    [captured.assets.productionWasm, "production WASM"],
    [captured.assets.researchWasm, "research WASM"],
    [captured.assets.liveWeights, "live weights"],
    [captured.assets.fixture, "correctness fixture"],
    [captured.assets.runner, "correctness runner"],
  ] as const) {
    authenticateIdentity(captured.root, identity, label);
  }
}

function readAuthenticatedAsset(
  root: string,
  identity: Readonly<AssetIdentity>,
  label: string,
): Buffer {
  const path = authenticateIdentity(root, identity, label);
  const bytes = readFileSync(path);
  if (
    bytes.byteLength !== identity.bytes ||
    sha256(bytes) !== identity.sha256
  ) {
    throw new Error(`${label} changed while being read`);
  }
  return bytes;
}

export function parseQuietHistoryCorrectnessCli(
  argv: readonly string[],
): Readonly<{ plan: string; planSha256: string }> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== "--plan" && flag !== "--plan-sha") {
      throw new Error(`unknown correctness argument: ${flag}`);
    }
    if (values.has(flag)) throw new Error(`${flag} repeats`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    values.set(flag, value);
    index += 1;
  }
  const plan = values.get("--plan");
  const planSha256 = values.get("--plan-sha");
  if (plan === undefined || planSha256 === undefined) {
    throw new Error("--plan and --plan-sha are required");
  }
  return Object.freeze({ plan, planSha256 });
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

function instantiateSearchWasm(bytes: Uint8Array): ShogiSearchWasm {
  const source = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(source).set(bytes);
  const module = new WebAssembly.Module(source);
  const instance = new WebAssembly.Instance(module, {
    env: {
      abort(_message: number, _file: number, line: number, column: number) {
        throw new Error(`WASM abort at ${line}:${column}`);
      },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  });
  return instance.exports as unknown as ShogiSearchWasm;
}

function counters(wasm: ResearchWasm): Counters {
  const value = {
    cutoffs: wasm.getResearchQuietCutoffEvents(),
    rewards: wasm.getResearchQuietRewardMoveEvents(),
    maluses: wasm.getResearchQuietMalusMoveEvents(),
    mainUpdates: wasm.getResearchQuietMainUpdates(),
    continuationUpdates: wasm.getResearchQuietContinuationUpdates(),
    storedPeak: wasm.getResearchQuietStoredPeak(),
    storageDrops: wasm.getResearchQuietStorageDrops(),
    maxAbsMain: wasm.getResearchQuietMaxAbsMain(),
    maxAbsContinuation: wasm.getResearchQuietMaxAbsContinuation(),
    nonQuietViolations: wasm.getResearchQuietNonQuietUpdateViolations(),
  };
  if (
    Object.values(value).some(
      (entry) => !Number.isSafeInteger(entry) || entry < 0,
    )
  ) {
    throw new Error("research runtime returned an invalid counter");
  }
  return value;
}

function stateChecksum(wasm: NnueWasm): StateChecksum {
  return {
    banHash: wasm.getBanHash(),
    handHash: wasm.getHandHash(),
    teban: wasm.getTeban(),
    hashVal: wasm.getHashVal(),
  };
}

function search(
  wasm: NnueWasm,
  position: KyokumenImproved,
  tesu: number,
  depth: number,
  qDepth: number,
): SearchResult {
  syncWasm(wasm, position);
  const stateBefore = stateChecksum(wasm);
  wasm.clearTT();
  wasm.setRootTesu(tesu);
  const key = wasm.searchBestMove(0, depth, qDepth);
  const stateAfter = stateChecksum(wasm);
  return {
    tree: {
      key,
      score: wasm.getSearchScore(),
      depth: wasm.getSearchDepth(),
      nodes: wasm.getSearchNodes(),
      leaves: wasm.getSearchLeaves(),
    },
    counters:
      "getResearchQuietCutoffEvents" in wasm
        ? counters(wasm as ResearchWasm)
        : null,
    stateBefore,
    stateAfter,
  };
}

function sameTree(left: SearchTree, right: SearchTree): boolean {
  return (
    left.key === right.key &&
    left.score === right.score &&
    left.depth === right.depth &&
    left.nodes === right.nodes &&
    left.leaves === right.leaves
  );
}

function isLegalKey(key: number, legal: Te[]): boolean {
  const koma = key & 0x3f;
  const from = (key >> 6) & 0xff;
  const to = (key >> 14) & 0xff;
  const promote = ((key >> 22) & 1) === 1;
  return (
    key !== 0 &&
    legal.some(
      (move) =>
        move.koma === koma &&
        move.from === from &&
        move.to === to &&
        move.promote === promote,
    )
  );
}

function zeroCounters(value: Counters): boolean {
  return Object.values(value).every((entry) => entry === 0);
}

function runQuietHistoryMalusInvariantsForCapturedPlan(
  captured: Readonly<CapturedCorrectnessPlan>,
): QuietHistoryInvariantReport {
  authenticateCapturedPlan(captured);
  const root = captured.root;
  const depth = 5;
  const qDepth = 8;
  const fixtureBytes = readAuthenticatedAsset(
    root,
    captured.assets.fixture,
    "correctness fixture",
  );
  const fixtureIdentity = {
    bytes: fixtureBytes.byteLength,
    sha256: createHash("sha256").update(fixtureBytes).digest("hex"),
  };
  if (
    fixtureIdentity.bytes !== FIXTURE_IDENTITY.bytes ||
    fixtureIdentity.sha256 !== FIXTURE_IDENTITY.sha256
  ) {
    throw new Error(
      `fixture identity differs: ${fixtureIdentity.bytes}/${fixtureIdentity.sha256}`,
    );
  }
  const fixture = JSON.parse(fixtureBytes.toString("utf8")) as Fixture;
  const categories: Category[] = [
    "opening",
    "middlegame",
    "dropHeavy",
    "checkEvasion",
  ];
  const fixtureShape =
    fixture.schemaVersion === 2 &&
    fixture.status === "formal-holdout-not-for-tuning" &&
    fixture.caseCount === 64 &&
    fixture.cases.length === 64 &&
    categories.every(
      (category) =>
        fixture.counts[category] === 16 &&
        fixture.cases.filter((entry) => entry.category === category).length ===
          16,
    );
  if (!fixtureShape) throw new Error("fixture shape differs");

  const productionBytes = readAuthenticatedAsset(
    root,
    captured.assets.productionWasm,
    "production WASM",
  );
  const researchBytes = readAuthenticatedAsset(
    root,
    captured.assets.researchWasm,
    "research WASM",
  );
  const weights = readAuthenticatedAsset(
    root,
    captured.assets.liveWeights,
    "live weights",
  );
  const production = instantiateSearchWasm(productionBytes) as NnueWasm;
  const candidateOff = instantiateSearchWasm(researchBytes) as ResearchWasm;
  const candidateOnA = instantiateSearchWasm(researchBytes) as ResearchWasm;
  const candidateOnB = instantiateSearchWasm(researchBytes) as ResearchWasm;
  for (const wasm of [production, candidateOff, candidateOnA, candidateOnB]) {
    installLiveWeights(wasm, weights);
  }

  if (
    "setResearchQuietHistoryMalus" in production ||
    "getResearchQuietHistoryMalusEnabled" in production
  ) {
    throw new Error("production unexpectedly exposes the research toggle");
  }
  const defaultOff =
    candidateOff.getResearchQuietHistoryMalusEnabled() === 0 &&
    candidateOff.getResearchQuietHistoryMax() === HISTORY_MAX &&
    candidateOff.getResearchQuietHistoryCap() === SEARCHED_QUIET_CAP;
  candidateOff.setResearchQuietHistoryMalus(0);
  candidateOnA.setResearchQuietHistoryMalus(1);
  candidateOnB.setResearchQuietHistoryMalus(1);
  if (
    candidateOff.getResearchQuietHistoryMalusEnabled() !== 0 ||
    candidateOnA.getResearchQuietHistoryMalusEnabled() !== 1 ||
    candidateOnB.getResearchQuietHistoryMalusEnabled() !== 1
  ) {
    throw new Error("research toggle did not retain its required state");
  }

  const rows: InvariantRow[] = [];
  let offCountersZero = true;
  for (const entry of fixture.cases) {
    const position = positionFromSfen(entry.sfen).position;
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    const baseline = search(production, position, entry.tesu, depth, qDepth);
    const off = search(candidateOff, position, entry.tesu, depth, qDepth);
    const onA = search(candidateOnA, position, entry.tesu, depth, qDepth);
    const onB = search(candidateOnB, position, entry.tesu, depth, qDepth);
    if (!off.counters || !onA.counters || !onB.counters) {
      throw new Error("research counters unavailable");
    }
    offCountersZero &&= zeroCounters(off.counters);
    rows.push({
      id: entry.id,
      category: entry.category,
      offExact: sameTree(baseline.tree, off.tree),
      onDeterministic:
        sameTree(onA.tree, onB.tree) &&
        JSON.stringify(onA.counters) === JSON.stringify(onB.counters),
      onMoveLegal: isLegalKey(onA.tree.key, legal),
      stateChecksumsUnchanged:
        JSON.stringify(baseline.stateBefore) ===
          JSON.stringify(off.stateBefore) &&
        JSON.stringify(baseline.stateBefore) ===
          JSON.stringify(onA.stateBefore) &&
        JSON.stringify(baseline.stateBefore) ===
          JSON.stringify(onB.stateBefore) &&
        JSON.stringify(baseline.stateBefore) ===
          JSON.stringify(baseline.stateAfter) &&
        JSON.stringify(off.stateBefore) === JSON.stringify(off.stateAfter) &&
        JSON.stringify(onA.stateBefore) === JSON.stringify(onA.stateAfter) &&
        JSON.stringify(onB.stateBefore) === JSON.stringify(onB.stateAfter),
      baseline: baseline.tree,
      enabled: onA.tree,
      counters: onA.counters,
    });
  }

  const totals = rows.reduce(
    (sum, row) => {
      sum.cutoffs += row.counters.cutoffs;
      sum.rewards += row.counters.rewards;
      sum.maluses += row.counters.maluses;
      sum.mainUpdates += row.counters.mainUpdates;
      sum.continuationUpdates += row.counters.continuationUpdates;
      sum.storageDrops += row.counters.storageDrops;
      sum.nonQuietViolations += row.counters.nonQuietViolations;
      sum.storedPeak = Math.max(sum.storedPeak, row.counters.storedPeak);
      sum.maxAbsMain = Math.max(sum.maxAbsMain, row.counters.maxAbsMain);
      sum.maxAbsContinuation = Math.max(
        sum.maxAbsContinuation,
        row.counters.maxAbsContinuation,
      );
      return sum;
    },
    {
      cutoffs: 0,
      rewards: 0,
      maluses: 0,
      mainUpdates: 0,
      continuationUpdates: 0,
      storedPeak: 0,
      storageDrops: 0,
      maxAbsMain: 0,
      maxAbsContinuation: 0,
      nonQuietViolations: 0,
    },
  );
  const activationByCategory = Object.fromEntries(
    categories.map((category) => {
      const categoryRows = rows.filter((row) => row.category === category);
      return [
        category,
        categoryRows.reduce(
          (sum, row) => {
            sum.cutoffs += row.counters.cutoffs;
            sum.rewards += row.counters.rewards;
            sum.maluses += row.counters.maluses;
            sum.mainUpdates += row.counters.mainUpdates;
            sum.continuationUpdates += row.counters.continuationUpdates;
            return sum;
          },
          {
            cutoffs: 0,
            rewards: 0,
            maluses: 0,
            mainUpdates: 0,
            continuationUpdates: 0,
          },
        ),
      ];
    }),
  ) as QuietHistoryInvariantReport["activationByCategory"];
  const gates = {
    fixtureShape,
    defaultOff,
    offExact64: rows.length === 64 && rows.every((row) => row.offExact),
    offCountersZero,
    onDeterministic64:
      rows.length === 64 && rows.every((row) => row.onDeterministic),
    onMovesLegal64: rows.length === 64 && rows.every((row) => row.onMoveLegal),
    stateChecksumsUnchanged64:
      rows.length === 64 && rows.every((row) => row.stateChecksumsUnchanged),
    rewardActivated: totals.rewards > 0 && totals.cutoffs === totals.rewards,
    malusActivated: totals.maluses > 0,
    mainHistoryActivated: totals.mainUpdates > 0,
    continuationHistoryActivated: totals.continuationUpdates > 0,
    rewardAndMalusActivatedEveryCategory: categories.every(
      (category) =>
        activationByCategory[category].rewards > 0 &&
        activationByCategory[category].maluses > 0,
    ),
    historyBounded:
      totals.maxAbsMain <= HISTORY_MAX &&
      totals.maxAbsContinuation <= HISTORY_MAX,
    searchedQuietCapRespected: totals.storedPeak <= SEARCHED_QUIET_CAP,
    nonQuietViolationsZero: totals.nonQuietViolations === 0,
  };
  authenticateCapturedPlan(captured);
  return {
    schemaVersion: 1,
    depth,
    qDepth,
    cases: rows.length,
    rows,
    totals,
    activationByCategory,
    gates,
  };
}

export function runQuietHistoryMalusInvariants(): QuietHistoryInvariantReport {
  const root = repositoryRoot();
  const planPath = realpathSync(resolve(root, PLAN_PATH));
  const planSha256 = sha256(readFileSync(planPath));
  const captured = loadQuietHistoryCorrectnessPlan(planPath, planSha256);
  return runQuietHistoryMalusInvariantsForCapturedPlan(captured);
}

export function quietHistoryCorrectnessMain(
  argv: readonly string[] = process.argv.slice(2),
): void {
  const cli = parseQuietHistoryCorrectnessCli(argv);
  const captured = loadQuietHistoryCorrectnessPlan(cli.plan, cli.planSha256);
  const report = runQuietHistoryMalusInvariantsForCapturedPlan(captured);
  const passed = Object.values(report.gates).every(Boolean);
  const result = {
    schema: RESULT_SCHEMA,
    plan_sha256: captured.sha256,
    strength_metric: false,
    depth: report.depth,
    quiescence_depth: report.qDepth,
    cases: report.cases,
    assets: captured.assets,
    totals: report.totals,
    activation_by_category: report.activationByCategory,
    gates: report.gates,
    all_gates_passed: passed,
    direct_play_authorized: passed,
    live_change_authorized: false,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!passed) {
    throw new Error("quiet-history + malus invariant gate failed");
  }
}

if (require.main === module) {
  try {
    quietHistoryCorrectnessMain();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
