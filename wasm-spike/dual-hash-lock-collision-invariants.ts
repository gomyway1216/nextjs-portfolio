/**
 * Formal correctness and bounded performance screen for the isolated
 * secondary-lock collision candidate.  It authenticates every plan-pinned
 * input before and after the run and writes the sole result to stdout as JSON.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { positionFromSfen } from "../ml/shogi-sfen";
import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import {
  GHI,
  GOTE,
  GRY,
  SFU,
  type Te,
} from "../src/components/game/ShogiImproved/types";
import { syncWasm, type ShogiSearchWasm } from "./search-driver";

const PLAN_PATH = "ml/protocols/dual-hash-lock-v1-plan.json";
const RUNNER_PATH = "wasm-spike/dual-hash-lock-collision-invariants.ts";
const FIXTURE_PATH = "wasm-spike/dual-hash-lock-collision-fixture-v1.json";
const HOLDOUT_PATH = "wasm-spike/lazy-move-picker-fixture-v2.json";
const PREFLIGHT_PATH =
  "ml/protocols/dual-hash-lock-collision-preflight-v1.json";
const PRODUCTION_WASM_PATH =
  "src/components/game/ShogiImproved/wasm/shogi.wasm";
const LIVE_WEIGHTS_PATH = "public/shogi-nnue-weights.bin";
const RESEARCH_WASM_PATH =
  "wasm-spike/artifacts/shogi-dual-hash-lock-research.wasm";
const RESEARCH_PATCH_PATH = "wasm-spike/assembly/dual-hash-lock-research.patch";
const BUILDER_PATH = "wasm-spike/build-dual-hash-lock-research-wasm.mjs";
const MATCH_RUNNER_PATH = "wasm-spike/match-dual-hash-lock-vs-production.ts";
const SHA256_RE = /^[0-9a-f]{64}$/u;
const DEPTH = 5;
const Q_DEPTH = 8;
const MEMORY_DELTA_MAX = 6 * 1024 * 1024;

interface AssetIdentity {
  path: string;
  bytes: number;
  sha256: string;
}
interface CapturedPlan {
  root: string;
  path: string;
  sha256: string;
  productionWasm: AssetIdentity;
  researchWasm: AssetIdentity;
  liveWeights: AssetIdentity;
  collisionFixture: AssetIdentity;
  allAssets: ReadonlyArray<readonly [AssetIdentity, string]>;
  performance: {
    timingOrder: Arm[];
    minBlockMs: number;
    maxRepeats: number;
    maxRuntimeMs: number;
  };
}
type Arm = "production" | "off" | "candidate";
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
  setResearchDualHashLock(flag: number): void;
  getResearchDualHashLockEnabled(): number;
  getResearchSecondaryBanHash(): number;
  getResearchSecondaryHandHash(): number;
  getResearchSecondaryHash(): number;
  getResearchSecondaryHashVal(): number;
  resetResearchDualHashLockCounters(): void;
  getResearchDualHashTtLockRejects(): number;
  getResearchDualHashEvalLockRejects(): number;
  getResearchDualHashRepetitionLockRejects(): number;
  researchDualHashCachedEval(): number;
  researchDualHashUncachedEval(): number;
  researchDualHashResetRepetition(): void;
  researchDualHashPushRepetition(): number;
  researchDualHashClearCaches(): void;
}
interface FixturePosition {
  sfen: string;
  tesu: number;
  primary_hash: number;
  expected_clean_key: number;
  expected_legal_moves: number;
}
interface CollisionFixture {
  schema: string;
  primary_hash: { bits: number; value: number };
  legality_holdout: AssetIdentity & {
    case_count: number;
    categories: Record<string, number>;
  };
  positions: { a: FixturePosition; b: FixturePosition };
}
interface HoldoutCase {
  id: string;
  category: string;
  sfen: string;
  tesu: number;
}
interface Holdout {
  schemaVersion: number;
  status: string;
  caseCount: number;
  counts: Record<string, number>;
  cases: HoldoutCase[];
}
interface Tree {
  key: number;
  score: number;
  depth: number;
  nodes: number;
  leaves: number;
}
interface State {
  ban: number;
  hand: number;
  teban: number;
  hash: number;
  secondaryBan?: number;
  secondaryHand?: number;
  secondaryHash?: number;
  secondaryHashVal?: number;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function u32(value: number): number {
  return value >>> 0;
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function integer(value: unknown, label: string, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min)
    throw new Error(`${label} must be an integer >= ${min}`);
  return value as number;
}
function identity(value: unknown, label: string): AssetIdentity {
  const item = object(value, label);
  if (
    typeof item.path !== "string" ||
    !item.path ||
    isAbsolute(item.path) ||
    item.path.includes("\\") ||
    item.path
      .split("/")
      .some((part) => !part || part === "." || part === "..") ||
    !SHA256_RE.test(String(item.sha256))
  )
    throw new Error(`${label} identity path/hash is invalid`);
  return {
    path: item.path,
    bytes: integer(item.bytes, `${label}.bytes`, 1),
    sha256: item.sha256 as string,
  };
}
function sameIdentity(left: AssetIdentity, right: AssetIdentity): boolean {
  return (
    left.path === right.path &&
    left.bytes === right.bytes &&
    left.sha256 === right.sha256
  );
}
function root(): string {
  const cwd = realpathSync(process.cwd());
  const source = realpathSync(resolve(__dirname, ".."));
  if (
    cwd !== source ||
    !existsSync(resolve(cwd, ".git")) ||
    !existsSync(resolve(cwd, RUNNER_PATH))
  )
    throw new Error("runner must execute from its repository root");
  return cwd;
}
function authenticate(
  rootPath: string,
  item: AssetIdentity,
  label: string,
): string {
  const path = realpathSync(resolve(rootPath, item.path));
  const fromRoot = relative(rootPath, path);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot) ||
    !statSync(path).isFile()
  )
    throw new Error(`${label} resolves outside repository or is not a file`);
  const bytes = readFileSync(path);
  if (bytes.byteLength !== item.bytes || sha256(bytes) !== item.sha256)
    throw new Error(`${label} identity differs`);
  return path;
}
function expected(
  identityValue: AssetIdentity,
  path: string,
  label: string,
): AssetIdentity {
  if (identityValue.path !== path)
    throw new Error(`${label} path differs from preregistered target`);
  return identityValue;
}

export function parseDualHashCorrectnessCli(
  argv: readonly string[],
): Readonly<{ plan: string; planSha256: string }> {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag !== "--plan" && flag !== "--plan-sha")
      throw new Error(`unknown argument: ${flag}`);
    if (values.has(flag)) throw new Error(`${flag} repeats`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${flag} requires a value`);
    values.set(flag, value);
    i += 1;
  }
  const plan = values.get("--plan");
  const planSha256 = values.get("--plan-sha");
  if (!plan || !planSha256)
    throw new Error("--plan and --plan-sha are required");
  if (!isAbsolute(plan) || !SHA256_RE.test(planSha256))
    throw new Error("--plan must be absolute and --plan-sha lowercase SHA-256");
  return Object.freeze({ plan, planSha256 });
}

export function loadDualHashCorrectnessPlan(
  planArgument: string,
  requestedSha: string,
): CapturedPlan {
  const rootPath = root();
  const planPath = realpathSync(planArgument);
  const fixed = realpathSync(resolve(rootPath, PLAN_PATH));
  if (planPath !== fixed || !statSync(planPath).isFile())
    throw new Error(`--plan must resolve to ${PLAN_PATH}`);
  const planBytes = readFileSync(planPath);
  const planSha = sha256(planBytes);
  if (planSha !== requestedSha) throw new Error("plan SHA differs");
  const plan = object(JSON.parse(planBytes.toString("utf8")), "plan");
  if (
    plan.schema !== "shogi-dual-hash-lock-plan-v1" ||
    plan.plan_id !== "dual-hash-lock-v1" ||
    plan.status !== "fixed-before-result"
  )
    throw new Error("plan header differs");
  const inputs = object(plan.pinned_inputs, "pinned_inputs");
  const artifacts = object(
    plan.planned_research_artifacts,
    "planned_research_artifacts",
  );
  const correctness = object(plan.correctness_gate, "correctness_gate");
  const performance = object(plan.performance_gate, "performance_gate");
  const search = object(correctness.search, "correctness_gate.search");
  if (
    search.fixed_depth !== DEPTH ||
    search.quiescence_depth !== Q_DEPTH ||
    search.timed !== false ||
    search.shared_tt !== false
  )
    throw new Error("correctness search contract differs");
  const prodWasm = expected(
    identity(inputs.production_wasm, "production_wasm"),
    PRODUCTION_WASM_PATH,
    "production WASM",
  );
  const researchWasm = expected(
    identity(artifacts.research_wasm, "research_wasm"),
    RESEARCH_WASM_PATH,
    "research WASM",
  );
  const liveWeights = expected(
    identity(inputs.immutable_live_weights, "immutable_live_weights"),
    LIVE_WEIGHTS_PATH,
    "live weights",
  );
  const collisionFixture = expected(
    identity(inputs.correctness_fixture, "correctness_fixture"),
    FIXTURE_PATH,
    "collision fixture",
  );
  const assets: Array<readonly [AssetIdentity, string]> = [
    [
      expected(
        identity(inputs.production_search_source, "production_search_source"),
        "wasm-spike/assembly/index.ts",
        "production search source",
      ),
      "production search source",
    ],
    [prodWasm, "production WASM"],
    [
      expected(
        identity(inputs.production_base64, "production_base64"),
        "src/components/game/ShogiImproved/wasm/shogiWasmBase64.ts",
        "production base64",
      ),
      "production base64",
    ],
    [
      expected(
        identity(inputs.js_reference, "js_reference"),
        "src/components/game/ShogiImproved/ShogiAIImprovedV20.ts",
        "JS reference",
      ),
      "JS reference",
    ],
    [liveWeights, "live weights"],
    [collisionFixture, "collision fixture"],
    [
      expected(
        identity(inputs.collision_preflight, "collision_preflight"),
        PREFLIGHT_PATH,
        "collision preflight",
      ),
      "collision preflight",
    ],
    [
      expected(
        identity(artifacts.research_patch, "research_patch"),
        RESEARCH_PATCH_PATH,
        "research patch",
      ),
      "research patch",
    ],
    [
      expected(identity(artifacts.builder, "builder"), BUILDER_PATH, "builder"),
      "builder",
    ],
    [researchWasm, "research WASM"],
    [
      expected(
        identity(artifacts.correctness_runner, "correctness_runner"),
        RUNNER_PATH,
        "correctness runner",
      ),
      "correctness runner",
    ],
    [
      expected(
        identity(artifacts.match_runner, "match_runner"),
        MATCH_RUNNER_PATH,
        "match runner",
      ),
      "match runner",
    ],
  ];
  if (
    !sameIdentity(
      identity(
        correctness.collision_fixture,
        "correctness_gate.collision_fixture",
      ),
      collisionFixture,
    )
  )
    throw new Error("correctness gate collision fixture differs");
  const order = performance.timing_order;
  const requiredOrder: Arm[] = [
    "production",
    "candidate",
    "off",
    "candidate",
    "production",
    "off",
    "production",
    "candidate",
    "off",
    "candidate",
    "production",
    "off",
  ];
  if (
    !Array.isArray(order) ||
    order.length !== requiredOrder.length ||
    order.some((arm, index) => arm !== requiredOrder[index]) ||
    performance.fixed_depth !== DEPTH ||
    performance.quiescence_depth !== Q_DEPTH ||
    performance.aggregate_candidate_vs_production_at_least !== 0.97 ||
    performance.median_candidate_vs_production_at_least !== 0.95 ||
    performance.p90_wall_regression_at_most !== 0.08 ||
    performance.memory_delta_bytes_at_most !== MEMORY_DELTA_MAX
  )
    throw new Error("performance gate contract differs");
  const minBlockMs = integer(
    performance.min_block_ms,
    "performance.min_block_ms",
    1,
  );
  const maxRepeats = integer(
    performance.max_repeats,
    "performance.max_repeats",
    1,
  );
  const maxRuntimeMs = integer(
    performance.max_runtime_ms,
    "performance.max_runtime_ms",
    1,
  );
  if (minBlockMs !== 25 || maxRepeats !== 64 || maxRuntimeMs !== 600000)
    throw new Error("performance bounds differ");
  for (const [item, label] of assets) authenticate(rootPath, item, label);
  return {
    root: rootPath,
    path: planPath,
    sha256: planSha,
    productionWasm: prodWasm,
    researchWasm,
    liveWeights,
    collisionFixture,
    allAssets: assets,
    performance: {
      timingOrder: requiredOrder,
      minBlockMs,
      maxRepeats,
      maxRuntimeMs,
    },
  };
}

function authenticatePlan(captured: CapturedPlan): void {
  if (sha256(readFileSync(captured.path)) !== captured.sha256)
    throw new Error("plan changed during run");
  for (const [item, label] of captured.allAssets)
    authenticate(captured.root, item, label);
}
function bytes(rootPath: string, item: AssetIdentity, label: string): Buffer {
  return readFileSync(authenticate(rootPath, item, label));
}
function instantiate(raw: Uint8Array): NnueWasm {
  const source = new ArrayBuffer(raw.byteLength);
  new Uint8Array(source).set(raw);
  return new WebAssembly.Instance(new WebAssembly.Module(source), {
    env: {
      abort(_m: number, _f: number, line: number, column: number) {
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
    throw new Error("live weights length differs from runtime allocation");
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
function tree(wasm: NnueWasm): Tree {
  return {
    key: wasm.searchBestMove(0, DEPTH, Q_DEPTH),
    score: wasm.getSearchScore(),
    depth: wasm.getSearchDepth(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
  };
}
function equalTree(a: Tree, b: Tree): boolean {
  return (
    a.key === b.key &&
    a.score === b.score &&
    a.depth === b.depth &&
    a.nodes === b.nodes &&
    a.leaves === b.leaves
  );
}
function equalDecision(a: Tree, b: Tree): boolean {
  return a.key === b.key && a.score === b.score && a.depth === b.depth;
}
function legal(key: number, moves: Te[]): boolean {
  const koma = key & 0x3f,
    from = (key >> 6) & 0xff,
    to = (key >> 14) & 0xff,
    promote = ((key >> 22) & 1) === 1;
  return (
    key !== 0 &&
    moves.some(
      (move) =>
        move.koma === koma &&
        move.from === from &&
        move.to === to &&
        move.promote === promote,
    )
  );
}
function regularState(wasm: NnueWasm): State {
  return {
    ban: u32(wasm.getBanHash()),
    hand: u32(wasm.getHandHash()),
    teban: wasm.getTeban(),
    hash: u32(wasm.getHashVal()),
  };
}
function primaryPositionHash(wasm: NnueWasm): number {
  return u32(wasm.getHashVal());
}
function secondaryState(wasm: ResearchWasm): State {
  return {
    ...regularState(wasm),
    secondaryBan: u32(wasm.getResearchSecondaryBanHash()),
    secondaryHand: u32(wasm.getResearchSecondaryHandHash()),
    secondaryHash: u32(wasm.getResearchSecondaryHash()),
    secondaryHashVal: u32(wasm.getResearchSecondaryHashVal()),
  };
}
function sameState(a: State, b: State): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Exact AS `u32` Mulberry stream used solely by the candidate's second key. */
function secondarySeeds(): {
  board: Uint32Array;
  hand: Uint32Array;
  teban: number;
} {
  let state = 0x8f3e91c5 >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const board = new Uint32Array((GRY + 1) * (16 * 11));
  const hand = new Uint32Array((GHI + 1) * 20);
  for (let i = 0; i < board.length; i += 1) board[i] = next();
  for (let i = 0; i < hand.length; i += 1) hand[i] = next();
  return { board, hand, teban: next() };
}
function independentlyHash(position: KyokumenImproved): {
  ban: number;
  hand: number;
  hash: number;
  hashVal: number;
} {
  const seeds = secondarySeeds();
  let ban = 0,
    hand = 0;
  for (let suji = 1; suji <= 9; suji += 1)
    for (let dan = 1; dan <= 9; dan += 1) {
      const pos = (suji << 4) + dan;
      ban ^= seeds.board[position.ban[pos] * (16 * 11) + pos];
    }
  for (let koma = 0; koma <= GHI; koma += 1)
    for (let count = 0; count <= position.hand[koma]; count += 1)
      hand ^= seeds.hand[koma * 20 + count];
  const hash = u32(ban ^ hand);
  return {
    ban: u32(ban),
    hand: u32(hand),
    hash,
    hashVal: u32(hash ^ (position.teban === GOTE ? seeds.teban : 0)),
  };
}
function matchesIndependentHash(
  wasm: ResearchWasm,
  position: KyokumenImproved,
): boolean {
  const expected = independentlyHash(position);
  const actual = secondaryState(wasm);
  return (
    actual.secondaryBan === expected.ban &&
    actual.secondaryHand === expected.hand &&
    actual.secondaryHash === expected.hash &&
    actual.secondaryHashVal === expected.hashVal
  );
}
function syncAndValidate(
  wasm: ResearchWasm,
  position: KyokumenImproved,
): boolean {
  syncWasm(wasm, position);
  return matchesIndependentHash(wasm, position);
}
function clear(wasm: NnueWasm): void {
  if ("researchDualHashClearCaches" in wasm)
    (wasm as ResearchWasm).researchDualHashClearCaches();
  else wasm.clearTT();
}
function run(
  wasm: NnueWasm,
  position: KyokumenImproved,
  tesu: number,
): { result: Tree; before: State; after: State } {
  syncWasm(wasm, position);
  const before =
    "getResearchSecondaryHash" in wasm
      ? secondaryState(wasm as ResearchWasm)
      : regularState(wasm);
  wasm.setRootTesu(tesu);
  const result = tree(wasm);
  const after =
    "getResearchSecondaryHash" in wasm
      ? secondaryState(wasm as ResearchWasm)
      : regularState(wasm);
  return { result, before, after };
}
function percentile(values: number[], p: number): number {
  if (!values.length) throw new Error("empty percentile");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}
function median(values: number[]): number {
  return percentile(values, 0.5);
}

/** Deterministic legal trajectories independently recomputed after every move. */
function incrementalTransitionReport(wasm: ResearchWasm) {
  let state = 0x4f1bbcdc >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const requiredTransitions = 16_384;
  let transitions = 0;
  let allIncremental = true;
  let restoreFailures = 0;
  while (transitions < requiredTransitions) {
    const position = new KyokumenImproved();
    position.initHirate();
    syncWasm(wasm, position);
    const initial = secondaryState(wasm);
    let plies = 0;
    while (plies < 192 && transitions < requiredTransitions) {
      const moves = GenerateMovesImproved.generateLegalMoves(position);
      if (!moves.length) break;
      const move = moves[next() % moves.length];
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
      wasm.applyMove(move.koma, move.from, move.to, move.promote ? 1 : 0);
      transitions += 1;
      plies += 1;
      allIncremental &&= matchesIndependentHash(wasm, position);
    }
    // The public research ABI intentionally exposes no make/unmake hook. This
    // is a resynchronization check, not an undo claim: a known initial state
    // must reproduce all four hashes after each deterministic trajectory.
    const restored = new KyokumenImproved();
    restored.initHirate();
    syncWasm(wasm, restored);
    if (
      !sameState(initial, secondaryState(wasm)) ||
      !matchesIndependentHash(wasm, restored)
    )
      restoreFailures += 1;
  }
  return {
    transitions,
    all_incremental: allIncremental,
    resync_restore_failures: restoreFailures,
    gate:
      transitions >= requiredTransitions &&
      allIncremental &&
      restoreFailures === 0,
  };
}

function collisionReport(
  production: NnueWasm,
  off: ResearchWasm,
  on: ResearchWasm,
  fixture: CollisionFixture,
) {
  const a = positionFromSfen(fixture.positions.a.sfen).position;
  const b = positionFromSfen(fixture.positions.b.sfen).position;
  const legalA = GenerateMovesImproved.generateLegalMoves(a),
    legalB = GenerateMovesImproved.generateLegalMoves(b);
  const sequence = (
    wasm: NnueWasm,
    first: KyokumenImproved,
    firstTesu: number,
    second: KyokumenImproved,
    secondTesu: number,
  ) => {
    clear(wasm);
    const one = run(wasm, first, firstTesu);
    const two = run(wasm, second, secondTesu);
    clear(wasm);
    const clean = run(wasm, second, secondTesu);
    return { one, two, clean };
  };
  off.setResearchDualHashLock(0);
  on.setResearchDualHashLock(1);
  on.resetResearchDualHashLockCounters();
  const prodAB = sequence(
    production,
    a,
    fixture.positions.a.tesu,
    b,
    fixture.positions.b.tesu,
  );
  const prodBA = sequence(
    production,
    b,
    fixture.positions.b.tesu,
    a,
    fixture.positions.a.tesu,
  );
  const offAB = sequence(
    off,
    a,
    fixture.positions.a.tesu,
    b,
    fixture.positions.b.tesu,
  );
  const offBA = sequence(
    off,
    b,
    fixture.positions.b.tesu,
    a,
    fixture.positions.a.tesu,
  );
  const onAB = sequence(
    on,
    a,
    fixture.positions.a.tesu,
    b,
    fixture.positions.b.tesu,
  );
  const onBA = sequence(
    on,
    b,
    fixture.positions.b.tesu,
    a,
    fixture.positions.a.tesu,
  );
  syncWasm(on, a);
  const secondaryA = u32(on.getResearchSecondaryHashVal());
  syncWasm(on, b);
  const secondaryB = u32(on.getResearchSecondaryHashVal());
  off.researchDualHashClearCaches();
  syncWasm(off, a);
  const offEvalA = off.researchDualHashCachedEval();
  syncWasm(off, b);
  const offEvalBCached = off.researchDualHashCachedEval();
  const offEvalBFull = off.researchDualHashUncachedEval();
  on.researchDualHashClearCaches();
  syncWasm(on, a);
  const evalA = on.researchDualHashCachedEval();
  syncWasm(on, b);
  const evalBCached = on.researchDualHashCachedEval();
  const evalBFull = on.researchDualHashUncachedEval();
  off.researchDualHashResetRepetition();
  syncWasm(off, a);
  const offRepeatA = [
    off.researchDualHashPushRepetition(),
    off.researchDualHashPushRepetition(),
    off.researchDualHashPushRepetition(),
  ];
  syncWasm(off, b);
  const offRepeatB = off.researchDualHashPushRepetition();
  on.researchDualHashResetRepetition();
  syncWasm(on, a);
  const onRepeatA = [
    on.researchDualHashPushRepetition(),
    on.researchDualHashPushRepetition(),
    on.researchDualHashPushRepetition(),
  ];
  syncWasm(on, b);
  const onRepeatB = on.researchDualHashPushRepetition();
  const primaryEqual =
    primaryPositionHash(production) === fixture.primary_hash.value &&
    primaryPositionHash(off) === fixture.primary_hash.value;
  const gates = {
    fixturePrimaryCollision:
      fixture.primary_hash.bits === 30 &&
      fixture.positions.a.sfen !== fixture.positions.b.sfen &&
      fixture.positions.a.primary_hash === fixture.positions.b.primary_hash &&
      primaryEqual,
    productionCollisionReproduced:
      !legal(prodAB.two.result.key, legalB) &&
      legal(prodAB.clean.result.key, legalB) &&
      prodAB.two.result.key === prodAB.one.result.key &&
      prodAB.two.result.key !== prodAB.clean.result.key,
    offExactProductionAB:
      equalTree(prodAB.one.result, offAB.one.result) &&
      equalTree(prodAB.two.result, offAB.two.result) &&
      equalTree(prodAB.clean.result, offAB.clean.result),
    offExactProductionBA:
      equalTree(prodBA.one.result, offBA.one.result) &&
      equalTree(prodBA.two.result, offBA.two.result) &&
      equalTree(prodBA.clean.result, offBA.clean.result),
    onFixesAB:
      legal(onAB.two.result.key, legalB) &&
      equalDecision(onAB.two.result, onAB.clean.result),
    onFixesBA:
      legal(onBA.two.result.key, legalA) &&
      equalDecision(onBA.two.result, onBA.clean.result),
    onCleanMovesLegal:
      legal(onAB.clean.result.key, legalB) &&
      legal(onBA.clean.result.key, legalA),
    stateUnchanged: [prodAB, prodBA, offAB, offBA, onAB, onBA].every(
      (entry) =>
        sameState(entry.one.before, entry.one.after) &&
        sameState(entry.two.before, entry.two.after) &&
        sameState(entry.clean.before, entry.clean.after),
    ),
    secondaryIncrementalHashes:
      syncAndValidate(on, a) && syncAndValidate(on, b),
    secondaryLocksDiffer: secondaryA !== secondaryB,
    evalCacheIsolated:
      Number.isSafeInteger(evalA) &&
      Number.isSafeInteger(offEvalA) &&
      offEvalBCached !== offEvalBFull &&
      evalBCached === evalBFull,
    repetitionIsolated:
      offRepeatA.every((value) => value !== 0) &&
      offRepeatB === 0 &&
      onRepeatA.every((value) => value !== 0) &&
      onRepeatB !== 0,
    ttLockRejected: on.getResearchDualHashTtLockRejects() > 0,
    evalLockRejected: on.getResearchDualHashEvalLockRejects() > 0,
    repetitionLockRejected: on.getResearchDualHashRepetitionLockRejects() > 0,
  };
  return {
    gates,
    tuples: {
      production_ab: prodAB,
      production_ba: prodBA,
      off_ab: offAB,
      off_ba: offBA,
      on_ab: onAB,
      on_ba: onBA,
    },
    eval: {
      off_a: offEvalA,
      off_b_cached: offEvalBCached,
      off_b_uncached: offEvalBFull,
      on_a: evalA,
      on_b_cached: evalBCached,
      on_b_uncached: evalBFull,
    },
    repetition: {
      off_a: offRepeatA,
      off_b_after_three_a: offRepeatB,
      on_a: onRepeatA,
      on_b_after_three_a: onRepeatB,
    },
    lock_rejects: {
      tt: on.getResearchDualHashTtLockRejects(),
      eval: on.getResearchDualHashEvalLockRejects(),
      repetition: on.getResearchDualHashRepetitionLockRejects(),
    },
  };
}

function legalityReport(
  production: NnueWasm,
  off: ResearchWasm,
  onA: ResearchWasm,
  onB: ResearchWasm,
  holdout: Holdout,
) {
  const validShape =
    holdout.schemaVersion === 2 &&
    holdout.status === "formal-holdout-not-for-tuning" &&
    holdout.caseCount === 64 &&
    holdout.cases.length === 64 &&
    ["opening", "middlegame", "dropHeavy", "checkEvasion"].every(
      (category) =>
        holdout.counts[category] === 16 &&
        holdout.cases.filter((entry) => entry.category === category).length ===
          16,
    );
  if (!validShape) throw new Error("64-position holdout shape differs");
  off.setResearchDualHashLock(0);
  onA.setResearchDualHashLock(1);
  onB.setResearchDualHashLock(1);
  const rows = holdout.cases.map((entry) => {
    const position = positionFromSfen(entry.sfen).position;
    const moves = GenerateMovesImproved.generateLegalMoves(position);
    clear(production);
    clear(off);
    clear(onA);
    clear(onB);
    const prod = run(production, position, entry.tesu);
    const disabled = run(off, position, entry.tesu);
    const enabledA = run(onA, position, entry.tesu);
    const enabledB = run(onB, position, entry.tesu);
    return {
      id: entry.id,
      category: entry.category,
      off_exact: equalTree(prod.result, disabled.result),
      on_deterministic: equalTree(enabledA.result, enabledB.result),
      on_legal: legal(enabledA.result.key, moves),
      states_unchanged:
        sameState(prod.before, prod.after) &&
        sameState(disabled.before, disabled.after) &&
        sameState(enabledA.before, enabledA.after) &&
        sameState(enabledB.before, enabledB.after),
      secondary_incremental:
        syncAndValidate(onA, position) && syncAndValidate(onB, position),
    };
  });
  return {
    rows,
    gates: {
      holdout_shape: validShape,
      off_exact_64: rows.every((row) => row.off_exact),
      on_deterministic_64: rows.every((row) => row.on_deterministic),
      on_legal_64: rows.every((row) => row.on_legal),
      states_unchanged_64: rows.every((row) => row.states_unchanged),
      secondary_incremental_64: rows.every((row) => row.secondary_incremental),
    },
  };
}

function benchmark(
  production: NnueWasm,
  off: ResearchWasm,
  candidate: ResearchWasm,
  holdout: Holdout,
  config: CapturedPlan["performance"],
) {
  const engines: Record<Arm, NnueWasm> = { production, off, candidate };
  off.setResearchDualHashLock(0);
  candidate.setResearchDualHashLock(1);
  const samples = holdout.cases.map((entry) => ({
    entry,
    position: positionFromSfen(entry.sfen).position,
  }));
  const deadline = performance.now() + config.maxRuntimeMs;
  const onePass = (arm: Arm): { elapsedMs: number; work: number } => {
    const start = performance.now();
    let work = 0;
    for (const sample of samples) {
      if (performance.now() > deadline)
        throw new Error("performance gate wall-time exceeded");
      const wasm = engines[arm];
      clear(wasm);
      const result = run(wasm, sample.position, sample.entry.tesu).result;
      if (
        !Number.isSafeInteger(result.nodes) ||
        !Number.isSafeInteger(result.leaves)
      )
        throw new Error("invalid search work counter");
      work += result.nodes + result.leaves;
    }
    return { elapsedMs: performance.now() - start, work };
  };
  const warm = (Object.keys(engines) as Arm[]).map((arm) => ({
    arm,
    ...onePass(arm),
  }));
  const slowest = Math.max(...warm.map((item) => item.elapsedMs));
  const repeats = Math.min(
    config.maxRepeats,
    Math.max(1, Math.ceil(config.minBlockMs / Math.max(0.001, slowest))),
  );
  const blocks = config.timingOrder.map((arm, index) => {
    const start = performance.now();
    let work = 0;
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const pass = onePass(arm);
      work += pass.work;
    }
    const elapsedMs = performance.now() - start;
    return {
      index,
      arm,
      repeats,
      work,
      elapsed_ms: elapsedMs,
      throughput: work / elapsedMs,
    };
  });
  const byArm = (arm: Arm) => blocks.filter((block) => block.arm === arm);
  const prod = byArm("production"),
    cand = byArm("candidate"),
    disabled = byArm("off");
  if (prod.length !== cand.length || prod.length !== disabled.length)
    throw new Error("benchmark arms are unbalanced");
  const pairRatios = cand.map(
    (block, i) => block.throughput / prod[i].throughput,
  );
  const wallRegressions = cand.map(
    (block, i) => block.elapsed_ms / prod[i].elapsed_ms - 1,
  );
  const aggregateCandidate =
    cand.reduce((sum, block) => sum + block.work, 0) /
    cand.reduce((sum, block) => sum + block.elapsed_ms, 0);
  const aggregateProd =
    prod.reduce((sum, block) => sum + block.work, 0) /
    prod.reduce((sum, block) => sum + block.elapsed_ms, 0);
  const memoryDelta =
    candidate.memory.buffer.byteLength - production.memory.buffer.byteLength;
  return {
    warmup: warm,
    repeats,
    blocks,
    aggregate_candidate_vs_production: aggregateCandidate / aggregateProd,
    median_candidate_vs_production: median(pairRatios),
    p90_wall_regression: percentile(wallRegressions, 0.9),
    memory_delta_bytes: memoryDelta,
    gates: {
      aggregate_candidate_vs_production_at_least:
        aggregateCandidate / aggregateProd >= 0.97,
      median_candidate_vs_production_at_least: median(pairRatios) >= 0.95,
      p90_wall_regression_at_most: percentile(wallRegressions, 0.9) <= 0.08,
      memory_delta_bytes_at_most: memoryDelta <= MEMORY_DELTA_MAX,
      off_arm_completed: disabled.length === prod.length,
    },
  };
}

export function runDualHashLockInvariants(captured: CapturedPlan) {
  authenticatePlan(captured);
  const rawFixture = bytes(
    captured.root,
    captured.collisionFixture,
    "collision fixture",
  );
  const fixture = JSON.parse(rawFixture.toString("utf8")) as CollisionFixture;
  if (
    fixture.schema !== "shogi-dual-hash-lock-collision-fixture-v1" ||
    fixture.legality_holdout.path !== HOLDOUT_PATH ||
    fixture.legality_holdout.case_count !== 64
  )
    throw new Error("collision fixture contract differs");
  const holdoutPath = authenticate(
    captured.root,
    fixture.legality_holdout,
    "64-position holdout",
  );
  const holdout = JSON.parse(readFileSync(holdoutPath, "utf8")) as Holdout;
  const prodBytes = bytes(
      captured.root,
      captured.productionWasm,
      "production WASM",
    ),
    researchBytes = bytes(
      captured.root,
      captured.researchWasm,
      "research WASM",
    ),
    weights = bytes(captured.root, captured.liveWeights, "live weights");
  const production = instantiate(prodBytes);
  const off = instantiate(researchBytes) as ResearchWasm;
  const on = instantiate(researchBytes) as ResearchWasm;
  const onA = instantiate(researchBytes) as ResearchWasm;
  const onB = instantiate(researchBytes) as ResearchWasm;
  for (const wasm of [production, off, on, onA, onB]) install(wasm, weights);
  if (
    "setResearchDualHashLock" in production ||
    off.getResearchDualHashLockEnabled() !== 0
  )
    throw new Error(
      "production exposes candidate ABI or research default is not off",
    );
  const collision = collisionReport(production, off, on, fixture);
  const incremental = incrementalTransitionReport(on);
  const legality = legalityReport(production, off, onA, onB, holdout);
  const performance = benchmark(
    production,
    off,
    on,
    holdout,
    captured.performance,
  );
  authenticatePlan(captured);
  const gates = {
    ...collision.gates,
    ...legality.gates,
    secondary_incremental_16384: incremental.gate,
    ...performance.gates,
  };
  return {
    schema: "shogi-dual-hash-lock-correctness-result-v1",
    plan_sha256: captured.sha256,
    strength_metric: false,
    live_change_authorized: false,
    direct_play_authorized: Object.values(gates).every(Boolean),
    collision,
    incremental,
    legality,
    performance,
    gates,
    all_gates_passed: Object.values(gates).every(Boolean),
  };
}

export function dualHashCorrectnessMain(
  argv: readonly string[] = process.argv.slice(2),
): void {
  const cli = parseDualHashCorrectnessCli(argv);
  const captured = loadDualHashCorrectnessPlan(cli.plan, cli.planSha256);
  const result = runDualHashLockInvariants(captured);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.all_gates_passed)
    throw new Error("dual-hash-lock correctness/performance gate failed");
}

if (require.main === module) {
  try {
    dualHashCorrectnessMain();
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    process.exitCode = 1;
  }
}
