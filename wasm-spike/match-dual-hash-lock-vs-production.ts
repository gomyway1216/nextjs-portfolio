/**
 * Research-only 96-game direct screen for the dual-hash-lock candidate.
 * It accepts only an authenticated absolute preregistration and writes receipts
 * under ~/.codex/shogi-runs.  It never writes a shipped asset or live weights.
 */
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Readable } from "node:stream";

import { toSfen } from "../ml/shogi-sfen-codec";
import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import {
  EMPTY,
  GOTE,
  SENTE,
  type Te,
} from "../src/components/game/ShogiImproved/types";
import { bucketsForByteLength } from "./nnue-ref";
import {
  loadShogiWasm,
  syncWasm,
  teFromWasmKey,
  type ShogiSearchWasm,
} from "./search-driver";
import {
  buildSearchWasmOpening,
  searchWasmCanonicalJson,
  searchWasmOpeningSetSha256,
  searchWasmRepetitionOutcome,
  type SearchWasmMoveTrace,
} from "./match-search-wasm-vs-production";

export const DUAL_HASH_LOCK_PLAN_SCHEMA =
  "shogi-dual-hash-lock-plan-v1" as const;
export const DUAL_HASH_LOCK_MANIFEST_SCHEMA =
  "shogi-dual-hash-lock-execution-manifest-v1" as const;
export const DUAL_HASH_LOCK_PAIR_SCHEMA =
  "shogi-dual-hash-lock-pair-v1" as const;
export const DUAL_HASH_LOCK_RESULT_SCHEMA =
  "shogi-dual-hash-lock-result-v1" as const;
export const DUAL_HASH_LOCK_RUN_SCHEMA = "shogi-dual-hash-lock-run-v1" as const;
export const DUAL_HASH_LOCK_FAULT_SCHEMA =
  "shogi-dual-hash-lock-fault-v1" as const;
export const DUAL_HASH_LOCK_WALL_STOP_SCHEMA =
  "shogi-dual-hash-lock-wall-stop-v1" as const;
export const DUAL_HASH_LOCK_RUNNER_PATH =
  "wasm-spike/match-dual-hash-lock-vs-production.ts" as const;
export const DUAL_HASH_LOCK_PAIRS = 48 as const;
export const DUAL_HASH_LOCK_GAMES = 96 as const;
export const DUAL_HASH_LOCK_PAIR_WORKERS = 12 as const;
export const DUAL_HASH_LOCK_MOVE_MS = 1_500 as const;
export const DUAL_HASH_LOCK_PASS_HALFPOINTS = 82 as const;
export const DUAL_HASH_LOCK_DENOMINATOR_HALFPOINTS = 192 as const;
export const DUAL_HASH_LOCK_WALL_SECONDS = 7_200 as const;
export const DUAL_HASH_LOCK_OPENING_PLIES = 6 as const;
export const DUAL_HASH_LOCK_MAX_PLIES = 256 as const;
export const DUAL_HASH_LOCK_SEARCH_DEPTH = 32 as const;
export const DUAL_HASH_LOCK_QUIESCENCE_DEPTH = 10 as const;
export const DUAL_HASH_LOCK_TT_POLICY =
  "clear-before-each-game-retain-within-game" as const;
export const DUAL_HASH_LOCK_CORRECTNESS_GATES = Object.freeze([
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
] as const);

const SHA256_RE = /^[0-9a-f]{64}$/u;
const PAIR_FILE_RE = /^pair-([0-9]{4})\.json$/u;
const PAIR_DOMAIN = "shogi-dual-hash-lock-pair-v1\0";
const RESULT_DOMAIN = "shogi-dual-hash-lock-result-v1\0";
const RUN_ROOT = [".codex", "shogi-runs"] as const;
const EXISTING_OPENING_EVIDENCE_PATH =
  "ml/protocols/bounded-quiet-history-existing-openings-v1.json";
const PREDECESSOR_OPENING_PLAN_PATH =
  "ml/protocols/bounded-quiet-history-malus-v1-plan.json";
const EXISTING_OPENING_COUNT = 3_198;
const PREDECESSOR_OPENING_COUNT = 28;
const FRESH_OPENING_UNION_COUNT = 3_226;
const FRESH_OPENING_UNION_SHA256 =
  "443b84303c4891b35b36b576c93a4f21c1cd7eb481699117facf3819700d124a";
type RecordValue = Record<string, unknown>;
type CandidateResult = "win" | "draw" | "loss";
type StopReason = "none" | "wall-clock" | "technical-fault";

export class DualHashLockMatchError extends Error {
  readonly strength_conclusion_allowed = false;
  readonly live_weight_write_authorized = false;
  constructor(message: string, options?: ErrorOptions) {
    super(`dual-hash-lock direct match failed: ${message}`, options);
    this.name = "DualHashLockMatchError";
  }
}
function fail(message: string): never {
  throw new DualHashLockMatchError(message);
}
function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function digest(domain: string, value: unknown): string {
  return sha256(`${domain}${searchWasmCanonicalJson(value)}`);
}
function exact(
  value: unknown,
  fields: readonly string[],
  label: string,
): RecordValue {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  const actual = Object.keys(value as RecordValue).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, i) => field !== expected[i])
  )
    fail(`${label} fields differ`);
  return value as RecordValue;
}
function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail(`${label} must be a positive safe integer`);
  return value as number;
}
function descendant(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path.length > 0 &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}
function root(): string {
  const value = realpathSync(process.cwd());
  if (
    !existsSync(resolve(value, "package.json")) ||
    !existsSync(resolve(value, ".git")) ||
    !existsSync(resolve(value, DUAL_HASH_LOCK_RUNNER_PATH))
  )
    fail("current directory is not the anchored repository root");
  return value;
}

export interface DualHashAsset {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface DualHashWeights extends DualHashAsset {
  readonly buckets: number;
}
export interface DualHashPlan {
  readonly schema: typeof DUAL_HASH_LOCK_MANIFEST_SCHEMA;
  readonly experiment_id: string;
  readonly assets: Readonly<{
    runner: DualHashAsset;
    candidate_wasm: DualHashAsset;
    production_wasm: DualHashAsset;
    weights: DualHashWeights;
  }>;
  readonly match: Readonly<{
    pairs: 48;
    games: 96;
    pair_workers: 12;
    milliseconds_per_move: 1500;
    opening_plies: 6;
    max_plies: 256;
    search_depth: 32;
    quiescence_depth: 10;
    scale_k: 600;
    scale_numer: 1;
    scale_denom: 1;
    color_order: readonly ["candidate-sente", "candidate-gote"];
    tt_policy: typeof DUAL_HASH_LOCK_TT_POLICY;
    book: false;
    mate_solver: false;
    fallback: false;
    pair_seeds: readonly number[];
    opening_set_sha256: string;
    pass_halfpoints: 82;
    score_denominator_halfpoints: 192;
    early_stop: "mathematical-futility-only";
    wall_clock_limit_seconds: 7200;
    wall_clock_expiry: "STOP-no-conclusion";
  }>;
  readonly safety: Readonly<{
    research_only: true;
    local_only: true;
    network: false;
    live_weight_write: false;
  }>;
}
export interface DualHashGameReceipt {
  readonly game_index: 0 | 1;
  readonly candidate_color: "sente" | "gote";
  readonly candidate_result: CandidateResult;
  readonly termination:
    "no-legal-moves" | "fourfold-repetition" | "perpetual-check" | "max-plies";
  readonly plies: number;
  readonly legal_moves_checked: number;
}
export interface DualHashPairReceipt {
  readonly schema: typeof DUAL_HASH_LOCK_PAIR_SCHEMA;
  readonly plan_sha256: string;
  readonly pair_index: number;
  readonly seed: number;
  readonly opening_fingerprint: string;
  readonly games: readonly [DualHashGameReceipt, DualHashGameReceipt];
  readonly candidate_halfpoints: number;
  readonly technical_fault: false;
  readonly receipt_sha256: string;
}
export interface DualHashResult {
  readonly schema: typeof DUAL_HASH_LOCK_RESULT_SCHEMA;
  readonly plan_sha256: string;
  readonly correctness_result_sha256: string;
  readonly experiment_id: string;
  readonly status:
    | "PASS"
    | "REJECTED-complete"
    | "REJECTED-futility"
    | "STOP-wall-clock-no-conclusion"
    | "FAIL-closed-technical-fault"
    | "FAIL-closed-incomplete";
  readonly decision: "pass" | "reject" | "no-conclusion";
  readonly strength_conclusion_allowed: boolean;
  readonly completed_pairs: number;
  readonly completed_games: number;
  readonly missing_pairs: readonly number[];
  readonly candidate_wins: number;
  readonly candidate_draws: number;
  readonly candidate_losses: number;
  readonly candidate_halfpoints: number;
  readonly score_denominator_halfpoints: 192;
  readonly pass_halfpoints: 82;
  readonly maximum_possible_final_halfpoints: number;
  readonly all_observed_openings_unique: boolean;
  readonly all_observed_moves_legal: boolean;
  readonly technical_fault_count: number;
  readonly wall_clock_expired: boolean;
  readonly promotion_authorized: false;
  readonly live_weight_write_authorized: false;
  readonly result_sha256: string;
}
export interface DualHashRun {
  readonly schema: typeof DUAL_HASH_LOCK_RUN_SCHEMA;
  readonly plan_sha256: string;
  readonly correctness_result_sha256: string;
  readonly started_at_ms: number;
  readonly wall_clock_limit_seconds: 7200;
  readonly deadline_at_ms: number;
}
export interface DualHashCorrectnessAuthorization {
  readonly path: string;
  readonly sha256: string;
  readonly planSha256: string;
}

function asset(
  value: unknown,
  label: string,
  weights = false,
): DualHashAsset | DualHashWeights {
  const item = exact(
    value,
    weights
      ? ["buckets", "bytes", "path", "sha256"]
      : ["bytes", "path", "sha256"],
    label,
  );
  if (
    typeof item.path !== "string" ||
    !/^(?!.*(?:^|\/)\.\.?\/)[^\\\0]+$/u.test(item.path) ||
    isAbsolute(item.path) ||
    typeof item.sha256 !== "string" ||
    !SHA256_RE.test(item.sha256)
  )
    fail(`${label} identity is invalid`);
  const base = {
    path: item.path,
    bytes: integer(item.bytes, `${label}.bytes`),
    sha256: item.sha256,
  };
  if (!weights) return Object.freeze(base);
  const buckets = integer(item.buckets, `${label}.buckets`);
  if (buckets > 65_535) fail(`${label}.buckets is too large`);
  return Object.freeze({ ...base, buckets });
}
function identityAsset(value: unknown, label: string): DualHashAsset {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  const item = value as RecordValue;
  return asset(
    { path: item.path, bytes: item.bytes, sha256: item.sha256 },
    label,
  ) as DualHashAsset;
}
function assetPath(path: string): string {
  const base = root();
  const resolved = realpathSync(resolve(base, path));
  if (!descendant(base, resolved))
    fail("planned asset resolves outside the verified repository root");
  return resolved;
}
function authenticate(item: DualHashAsset, label: string): string {
  const path = assetPath(item.path);
  const info = statSync(path);
  if (
    !info.isFile() ||
    info.size !== item.bytes ||
    sha256(readFileSync(path)) !== item.sha256
  )
    fail(`${label} identity differs`);
  return path;
}
function sameAsset(left: DualHashAsset, right: DualHashAsset): boolean {
  return (
    left.path === right.path &&
    left.bytes === right.bytes &&
    left.sha256 === right.sha256
  );
}

export function validateDualHashPlan(value: unknown): Readonly<DualHashPlan> {
  const plan = exact(
    value,
    ["assets", "experiment_id", "match", "safety", "schema"],
    "execution manifest",
  );
  if (
    plan.schema !== DUAL_HASH_LOCK_MANIFEST_SCHEMA ||
    typeof plan.experiment_id !== "string" ||
    plan.experiment_id.length === 0 ||
    plan.experiment_id.includes("\0")
  )
    fail("execution manifest header is invalid");
  const assets = exact(
    plan.assets,
    ["candidate_wasm", "production_wasm", "runner", "weights"],
    "execution assets",
  );
  const runner = asset(assets.runner, "runner") as DualHashAsset;
  const candidate_wasm = asset(
    assets.candidate_wasm,
    "candidate WASM",
  ) as DualHashAsset;
  const production_wasm = asset(
    assets.production_wasm,
    "production WASM",
  ) as DualHashAsset;
  const weights = asset(
    assets.weights,
    "shared weights",
    true,
  ) as DualHashWeights;
  if (
    runner.path !== DUAL_HASH_LOCK_RUNNER_PATH ||
    candidate_wasm.path === production_wasm.path ||
    candidate_wasm.sha256 === production_wasm.sha256
  )
    fail("execution asset identities differ from the direct screen");
  const match = exact(
    plan.match,
    [
      "book",
      "color_order",
      "early_stop",
      "fallback",
      "games",
      "mate_solver",
      "max_plies",
      "milliseconds_per_move",
      "opening_plies",
      "opening_set_sha256",
      "pair_seeds",
      "pair_workers",
      "pairs",
      "pass_halfpoints",
      "quiescence_depth",
      "scale_denom",
      "scale_k",
      "scale_numer",
      "score_denominator_halfpoints",
      "search_depth",
      "tt_policy",
      "wall_clock_expiry",
      "wall_clock_limit_seconds",
    ],
    "direct match contract",
  );
  if (
    match.pairs !== 48 ||
    match.games !== 96 ||
    match.pair_workers !== 12 ||
    match.milliseconds_per_move !== 1500 ||
    match.opening_plies !== 6 ||
    match.max_plies !== 256 ||
    match.search_depth !== 32 ||
    match.quiescence_depth !== 10 ||
    match.scale_k !== 600 ||
    match.scale_numer !== 1 ||
    match.scale_denom !== 1 ||
    searchWasmCanonicalJson(match.color_order) !==
      searchWasmCanonicalJson(["candidate-sente", "candidate-gote"]) ||
    match.tt_policy !== DUAL_HASH_LOCK_TT_POLICY ||
    match.book !== false ||
    match.mate_solver !== false ||
    match.fallback !== false ||
    match.pass_halfpoints !== 82 ||
    match.score_denominator_halfpoints !== 192 ||
    match.early_stop !== "mathematical-futility-only" ||
    match.wall_clock_limit_seconds !== 7200 ||
    match.wall_clock_expiry !== "STOP-no-conclusion"
  )
    fail("direct match contract differs from the fixed screen");
  if (!Array.isArray(match.pair_seeds) || match.pair_seeds.length !== 48)
    fail("direct match requires exactly 48 pair seeds");
  const pair_seeds = match.pair_seeds.map((seed, index) =>
    integer(seed, `pair seed ${index}`),
  );
  if (
    searchWasmCanonicalJson(pair_seeds) !==
      searchWasmCanonicalJson(
        Array.from(
          { length: DUAL_HASH_LOCK_PAIRS },
          (_, index) => 980_001 + index,
        ),
      ) ||
    new Set(pair_seeds).size !== 48 ||
    new Set(pair_seeds.map((seed) => buildSearchWasmOpening(seed).fingerprint))
      .size !== 48 ||
    typeof match.opening_set_sha256 !== "string" ||
    !SHA256_RE.test(match.opening_set_sha256) ||
    match.opening_set_sha256 !== searchWasmOpeningSetSha256(pair_seeds)
  )
    fail("direct match openings differ from the fixed fresh screen");
  const safety = exact(
    plan.safety,
    ["live_weight_write", "local_only", "network", "research_only"],
    "research safety boundary",
  );
  if (
    safety.research_only !== true ||
    safety.local_only !== true ||
    safety.network !== false ||
    safety.live_weight_write !== false
  )
    fail("research safety boundary differs");
  return Object.freeze({
    schema: DUAL_HASH_LOCK_MANIFEST_SCHEMA,
    experiment_id: plan.experiment_id,
    assets: Object.freeze({ runner, candidate_wasm, production_wasm, weights }),
    match: Object.freeze({
      pairs: 48,
      games: 96,
      pair_workers: 12,
      milliseconds_per_move: 1500,
      opening_plies: 6,
      max_plies: 256,
      search_depth: 32,
      quiescence_depth: 10,
      scale_k: 600,
      scale_numer: 1,
      scale_denom: 1,
      color_order: Object.freeze(["candidate-sente", "candidate-gote"]),
      tt_policy: DUAL_HASH_LOCK_TT_POLICY,
      book: false,
      mate_solver: false,
      fallback: false,
      pair_seeds: Object.freeze(pair_seeds),
      opening_set_sha256: match.opening_set_sha256,
      pass_halfpoints: 82,
      score_denominator_halfpoints: 192,
      early_stop: "mathematical-futility-only",
      wall_clock_limit_seconds: 7200,
      wall_clock_expiry: "STOP-no-conclusion",
    }),
    safety: Object.freeze({
      research_only: true,
      local_only: true,
      network: false,
      live_weight_write: false,
    }),
  });
}

interface FreshOpeningInputs {
  readonly union: ReadonlySet<string>;
  readonly unionSha256: string;
}

function shaList(
  value: unknown,
  count: number,
  label: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length !== count ||
    value.some((entry) => typeof entry !== "string" || !SHA256_RE.test(entry))
  )
    fail(`${label} is invalid`);
  const values = value as string[];
  if (new Set(values).size !== count) fail(`${label} repeats`);
  return Object.freeze([...values]);
}

function validatePinnedInputBindings(
  value: unknown,
  plan: Readonly<DualHashPlan>,
): Readonly<FreshOpeningInputs> {
  const pinned = exact(
    value,
    [
      "collision_preflight",
      "correctness_fixture",
      "existing_opening_evidence",
      "immutable_live_weights",
      "js_reference",
      "predecessor_opening_plan",
      "production_base64",
      "production_search_source",
      "production_wasm",
    ],
    "pinned inputs",
  );
  const all = Object.fromEntries(
    Object.entries(pinned).map(([key, entry]) => [
      key,
      identityAsset(entry, `pinned ${key}`),
    ]),
  ) as Record<string, DualHashAsset>;
  if (
    all.existing_opening_evidence.path !== EXISTING_OPENING_EVIDENCE_PATH ||
    all.predecessor_opening_plan.path !== PREDECESSOR_OPENING_PLAN_PATH ||
    !sameAsset(all.production_wasm, plan.assets.production_wasm) ||
    !sameAsset(all.immutable_live_weights, plan.assets.weights)
  )
    fail(
      "pinned runtime or fresh-opening input differs from execution manifest",
    );
  for (const [key, item] of Object.entries(all))
    authenticate(item, `pinned ${key}`);

  const existing = JSON.parse(
    readFileSync(assetPath(all.existing_opening_evidence.path), "utf8"),
  ) as RecordValue;
  if (
    existing === null ||
    typeof existing !== "object" ||
    Array.isArray(existing) ||
    existing.full_enrolled_sorted_unique_count !== EXISTING_OPENING_COUNT ||
    existing.full_enrolled_canonical_list_raw_sha256 !==
      "0dde79f19d21dbf671de9525dc87bd4e9c8a617e1a06e3a61f704f1dcbaed291"
  )
    fail("pinned existing opening evidence differs");
  const enrolled = shaList(
    existing.full_enrolled_sorted_unique_fingerprints,
    EXISTING_OPENING_COUNT,
    "full enrolled opening fingerprints",
  );
  if (
    sha256(searchWasmCanonicalJson(enrolled)) !==
    existing.full_enrolled_canonical_list_raw_sha256
  )
    fail("pinned existing opening fingerprint digest differs");

  const predecessor = JSON.parse(
    readFileSync(assetPath(all.predecessor_opening_plan.path), "utf8"),
  ) as RecordValue;
  if (
    predecessor === null ||
    typeof predecessor !== "object" ||
    Array.isArray(predecessor) ||
    typeof predecessor.direct_play_gate !== "object" ||
    predecessor.direct_play_gate === null ||
    Array.isArray(predecessor.direct_play_gate)
  )
    fail("pinned predecessor opening plan differs");
  const predecessorGate = predecessor.direct_play_gate as RecordValue;
  if (
    typeof predecessorGate.opening_policy !== "object" ||
    predecessorGate.opening_policy === null ||
    Array.isArray(predecessorGate.opening_policy)
  )
    fail("pinned predecessor opening policy differs");
  const predecessorPolicy = predecessorGate.opening_policy as RecordValue;
  const predecessorFingerprints = shaList(
    predecessorPolicy.opening_fingerprints,
    PREDECESSOR_OPENING_COUNT,
    "predecessor opening fingerprints",
  );
  const union = [...new Set([...enrolled, ...predecessorFingerprints])].sort();
  const unionSha256 = sha256(searchWasmCanonicalJson(union));
  if (
    union.length !== FRESH_OPENING_UNION_COUNT ||
    unionSha256 !== FRESH_OPENING_UNION_SHA256
  )
    fail("pinned predecessor-and-existing opening union differs");
  return Object.freeze({ union: new Set(union), unionSha256 });
}

function validateFreshOpeningGate(
  value: unknown,
  plan: Readonly<DualHashPlan>,
  freshness: Readonly<FreshOpeningInputs>,
): void {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail("direct play gate is invalid");
  const gate = value as RecordValue;
  if (
    gate.opening_policy === null ||
    typeof gate.opening_policy !== "object" ||
    Array.isArray(gate.opening_policy)
  )
    fail("direct play opening policy is invalid");
  const policy = gate.opening_policy as RecordValue;
  const expectedFingerprints = plan.match.pair_seeds.map(
    (seed) => buildSearchWasmOpening(seed).fingerprint,
  );
  const declaredFingerprints = shaList(
    policy.opening_fingerprints,
    DUAL_HASH_LOCK_PAIRS,
    "direct play opening fingerprints",
  );
  if (
    searchWasmCanonicalJson(policy.pair_seeds) !==
      searchWasmCanonicalJson(plan.match.pair_seeds) ||
    searchWasmCanonicalJson(declaredFingerprints) !==
      searchWasmCanonicalJson(expectedFingerprints) ||
    policy.existing_opening_fingerprint_count !== EXISTING_OPENING_COUNT ||
    policy.predecessor_opening_fingerprint_count !==
      PREDECESSOR_OPENING_COUNT ||
    policy.predecessor_and_existing_union_count !== FRESH_OPENING_UNION_COUNT ||
    policy.predecessor_and_existing_union_sha256 !== freshness.unionSha256 ||
    policy.intersection_with_predecessor_and_existing_count !== 0 ||
    declaredFingerprints.some((fingerprint) => freshness.union.has(fingerprint))
  )
    fail("direct play fresh-opening gate differs from pinned evidence");
}

export function loadDualHashPlan(
  planValue: string,
  expectedSha256: string,
): Readonly<{ path: string; sha256: string; plan: Readonly<DualHashPlan> }> {
  if (!isAbsolute(planValue) || !SHA256_RE.test(expectedSha256))
    fail("--plan must be absolute and --plan-sha must be valid");
  const base = root();
  const path = realpathSync(planValue);
  if (!descendant(base, path))
    fail("--plan must remain under the anchored repository root");
  const bytes = readFileSync(path);
  if (sha256(bytes) !== expectedSha256) fail("plan SHA-256 differs");
  let outer: RecordValue;
  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      fail("dual-hash-lock plan must be an object");
    outer = parsed as RecordValue;
  } catch (cause) {
    if (cause instanceof DualHashLockMatchError) throw cause;
    throw new DualHashLockMatchError("plan JSON is invalid", { cause });
  }
  if (
    outer.schema !== DUAL_HASH_LOCK_PLAN_SCHEMA ||
    typeof outer.plan_id !== "string" ||
    outer.plan_id.length === 0 ||
    outer.execution_manifest === undefined ||
    outer.planned_research_artifacts === undefined ||
    outer.pinned_inputs === undefined ||
    outer.direct_play_gate === undefined
  )
    fail("dual-hash-lock plan header is invalid");
  const planned = exact(
    outer.planned_research_artifacts,
    [
      "builder",
      "correctness_runner",
      "match_runner",
      "research_patch",
      "research_wasm",
    ],
    "planned research artifacts",
  );
  const declaredRunner = asset(
    planned.match_runner,
    "planned match runner",
  ) as DualHashAsset;
  const declaredResearchWasm = asset(
    planned.research_wasm,
    "planned research WASM",
  ) as DualHashAsset;
  const plan = validateDualHashPlan(outer.execution_manifest);
  if (
    plan.experiment_id !== outer.plan_id ||
    !sameAsset(declaredRunner, plan.assets.runner) ||
    !sameAsset(declaredResearchWasm, plan.assets.candidate_wasm)
  )
    fail("outer research artifact binding differs from execution manifest");
  const freshness = validatePinnedInputBindings(outer.pinned_inputs, plan);
  validateFreshOpeningGate(outer.direct_play_gate, plan, freshness);
  authenticate(plan.assets.runner, "runner");
  authenticate(plan.assets.candidate_wasm, "candidate WASM");
  authenticate(plan.assets.production_wasm, "production WASM");
  authenticate(plan.assets.weights, "shared weights");
  return Object.freeze({ path, sha256: expectedSha256, plan });
}

function halfpoints(result: CandidateResult): number {
  return result === "win" ? 2 : result === "draw" ? 1 : 0;
}
function pairBody(
  planSha: string,
  index: number,
  seed: number,
  fingerprint: string,
  games: readonly [DualHashGameReceipt, DualHashGameReceipt],
) {
  return {
    schema: DUAL_HASH_LOCK_PAIR_SCHEMA,
    plan_sha256: planSha,
    pair_index: index,
    seed,
    opening_fingerprint: fingerprint,
    games,
    candidate_halfpoints:
      halfpoints(games[0].candidate_result) +
      halfpoints(games[1].candidate_result),
    technical_fault: false as const,
  };
}
function sealPair(
  planSha: string,
  index: number,
  seed: number,
  fingerprint: string,
  games: readonly [DualHashGameReceipt, DualHashGameReceipt],
): Readonly<DualHashPairReceipt> {
  const body = pairBody(planSha, index, seed, fingerprint, games);
  return Object.freeze({ ...body, receipt_sha256: digest(PAIR_DOMAIN, body) });
}
function captureGame(value: unknown, index: 0 | 1): DualHashGameReceipt {
  const game = exact(
    value,
    [
      "candidate_color",
      "candidate_result",
      "game_index",
      "legal_moves_checked",
      "plies",
      "termination",
    ],
    `pair game ${index}`,
  );
  if (
    game.game_index !== index ||
    game.candidate_color !== (index === 0 ? "sente" : "gote") ||
    !["win", "draw", "loss"].includes(game.candidate_result as string) ||
    ![
      "no-legal-moves",
      "fourfold-repetition",
      "perpetual-check",
      "max-plies",
    ].includes(game.termination as string) ||
    !Number.isSafeInteger(game.plies) ||
    (game.plies as number) < 6 ||
    (game.plies as number) > 256 ||
    !Number.isSafeInteger(game.legal_moves_checked) ||
    game.legal_moves_checked !== (game.plies as number) - 6
  )
    fail(`pair game ${index} is invalid`);
  return Object.freeze({
    game_index: index,
    candidate_color: game.candidate_color as "sente" | "gote",
    candidate_result: game.candidate_result as CandidateResult,
    termination: game.termination as DualHashGameReceipt["termination"],
    plies: game.plies as number,
    legal_moves_checked: game.legal_moves_checked as number,
  });
}
function capturePair(
  value: unknown,
  plan: Readonly<DualHashPlan>,
  planSha: string,
): Readonly<DualHashPairReceipt> {
  const pair = exact(
    value,
    [
      "candidate_halfpoints",
      "games",
      "opening_fingerprint",
      "pair_index",
      "plan_sha256",
      "receipt_sha256",
      "schema",
      "seed",
      "technical_fault",
    ],
    "pair receipt",
  );
  if (
    pair.schema !== DUAL_HASH_LOCK_PAIR_SCHEMA ||
    pair.plan_sha256 !== planSha ||
    !Number.isSafeInteger(pair.pair_index) ||
    (pair.pair_index as number) < 0 ||
    (pair.pair_index as number) >= 48 ||
    pair.technical_fault !== false ||
    typeof pair.receipt_sha256 !== "string" ||
    !SHA256_RE.test(pair.receipt_sha256) ||
    !Array.isArray(pair.games) ||
    pair.games.length !== 2
  )
    fail("pair receipt header is invalid");
  const index = pair.pair_index as number;
  const seed = plan.match.pair_seeds[index];
  const fingerprint = buildSearchWasmOpening(seed).fingerprint;
  if (pair.seed !== seed || pair.opening_fingerprint !== fingerprint)
    fail("pair receipt binding differs from the plan");
  const games = Object.freeze([
    captureGame(pair.games[0], 0),
    captureGame(pair.games[1], 1),
  ]) as DualHashPairReceipt["games"];
  const body = pairBody(planSha, index, seed, fingerprint, games);
  if (
    pair.candidate_halfpoints !== body.candidate_halfpoints ||
    pair.receipt_sha256 !== digest(PAIR_DOMAIN, body)
  )
    fail("pair receipt digest differs");
  return Object.freeze({ ...body, receipt_sha256: pair.receipt_sha256 });
}

export function analyzeDualHashScreen(
  plan: Readonly<DualHashPlan>,
  planSha: string,
  correctnessSha: string,
  values: readonly unknown[],
  options: Readonly<{
    stop_reason?: StopReason;
    technical_fault_count?: number;
  }> = {},
): Readonly<DualHashResult> {
  if (!SHA256_RE.test(correctnessSha))
    fail("correctness result identity is invalid");
  const pairs = values
    .map((value) => capturePair(value, plan, planSha))
    .sort((a, b) => a.pair_index - b.pair_index);
  if (new Set(pairs.map((pair) => pair.pair_index)).size !== pairs.length)
    fail("pair indices repeat");
  if (
    new Set(pairs.map((pair) => pair.opening_fingerprint)).size !== pairs.length
  )
    fail("observed opening fingerprints repeat");
  const complete = new Set(pairs.map((pair) => pair.pair_index));
  const missing = Array.from({ length: 48 }, (_, index) => index).filter(
    (index) => !complete.has(index),
  );
  const games = pairs.flatMap((pair) => pair.games);
  const wins = games.filter((game) => game.candidate_result === "win").length;
  const draws = games.filter((game) => game.candidate_result === "draw").length;
  const points = pairs.reduce(
    (sum, pair) => sum + pair.candidate_halfpoints,
    0,
  );
  const maximum = points + 4 * missing.length;
  const stop = options.stop_reason ?? "none";
  const technical = options.technical_fault_count ?? 0;
  let status: DualHashResult["status"] = "FAIL-closed-incomplete";
  let decision: DualHashResult["decision"] = "no-conclusion";
  let conclusion = false;
  if (technical > 0 || stop === "technical-fault")
    status = "FAIL-closed-technical-fault";
  else if (stop === "wall-clock") status = "STOP-wall-clock-no-conclusion";
  else if (missing.length === 0) {
    status = points >= 82 ? "PASS" : "REJECTED-complete";
    decision = status === "PASS" ? "pass" : "reject";
    conclusion = true;
  } else if (maximum < 82) {
    status = "REJECTED-futility";
    decision = "reject";
    conclusion = true;
  }
  const body = {
    schema: DUAL_HASH_LOCK_RESULT_SCHEMA,
    plan_sha256: planSha,
    correctness_result_sha256: correctnessSha,
    experiment_id: plan.experiment_id,
    status,
    decision,
    strength_conclusion_allowed: conclusion,
    completed_pairs: pairs.length,
    completed_games: games.length,
    missing_pairs: Object.freeze(missing),
    candidate_wins: wins,
    candidate_draws: draws,
    candidate_losses: games.length - wins - draws,
    candidate_halfpoints: points,
    score_denominator_halfpoints: 192 as const,
    pass_halfpoints: 82 as const,
    maximum_possible_final_halfpoints: maximum,
    all_observed_openings_unique: true,
    all_observed_moves_legal: pairs.every((pair) =>
      pair.games.every((game) => game.legal_moves_checked === game.plies - 6),
    ),
    technical_fault_count: technical,
    wall_clock_expired: stop === "wall-clock",
    promotion_authorized: false as const,
    live_weight_write_authorized: false as const,
  };
  return Object.freeze({ ...body, result_sha256: digest(RESULT_DOMAIN, body) });
}

interface Runtime extends ShogiSearchWasm {
  readonly memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(value: number): void;
  setNnueScaleK(value: number): void;
  setNnueOutputScale(numer: number, denom: number): void;
  setNnueEnabled(flag: number): void;
  setResearchDualHashLock?: (flag: number) => void;
  getResearchDualHashLockEnabled?: () => number;
}
export function configureDualHashToggle(
  runtime: Pick<
    Runtime,
    "setResearchDualHashLock" | "getResearchDualHashLockEnabled"
  >,
  role: "candidate" | "production",
): void {
  if (role === "candidate") {
    if (
      typeof runtime.setResearchDualHashLock !== "function" ||
      typeof runtime.getResearchDualHashLockEnabled !== "function"
    )
      fail("candidate WASM lacks the preregistered dual-hash-lock toggle");
    runtime.setResearchDualHashLock(1);
    if (runtime.getResearchDualHashLockEnabled() !== 1)
      fail("candidate dual-hash-lock toggle did not activate");
  } else if (
    typeof runtime.setResearchDualHashLock === "function" ||
    typeof runtime.getResearchDualHashLockEnabled === "function"
  )
    fail("production WASM unexpectedly exposes the research toggle");
}
function verifyToggle(candidate: Runtime, production: Runtime): void {
  if (
    candidate.getResearchDualHashLockEnabled?.() !== 1 ||
    typeof production.setResearchDualHashLock === "function" ||
    typeof production.getResearchDualHashLockEnabled === "function"
  )
    fail("dual-hash-lock toggle binding drifted during pair");
}
function runtime(
  wasmPath: string,
  weightsPath: string,
  plan: Readonly<DualHashPlan>,
  role: "candidate" | "production",
): Runtime {
  const wasm = loadShogiWasm(wasmPath) as Runtime;
  const weights = readFileSync(weightsPath);
  const buckets = bucketsForByteLength(weights.byteLength);
  if (buckets !== plan.assets.weights.buckets)
    fail("shared weights bucket count differs from the plan");
  wasm.setNnueBuckets(buckets);
  if (wasm.getNnueWeightsSize() !== weights.byteLength)
    fail("WASM NNUE memory size differs from shared weights");
  new Uint8Array(
    wasm.memory.buffer,
    wasm.getNnueWeightsPtr(),
    weights.byteLength,
  ).set(weights);
  wasm.setNnueScaleK(600);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueEnabled(1);
  configureDualHashToggle(wasm, role);
  return wasm;
}
function candidateResult(
  winner: number | null,
  candidateSente: boolean,
): CandidateResult {
  if (winner === null) return "draw";
  return winner === (candidateSente ? SENTE : GOTE) ? "win" : "loss";
}
export function dualHashRepetitionKey(position: KyokumenImproved): string {
  // The production 30-bit primary hash has a recorded real collision. Match
  // adjudication therefore uses the complete semantic position, independent
  // from both engines under comparison. The constant move number deliberately
  // excludes game history from the fourfold-position identity.
  return toSfen(position, 1);
}
function play(
  candidate: Runtime,
  production: Runtime,
  candidateSente: boolean,
  seed: number,
  index: 0 | 1,
): DualHashGameReceipt {
  candidate.clearTT();
  production.clearTT();
  const position = new KyokumenImproved();
  position.initHirate();
  position.setTeban(SENTE);
  const opening = buildSearchWasmOpening(seed);
  for (const stored of opening.moves) {
    const move = stored.clone();
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
  }
  const traces: SearchWasmMoveTrace[] = [];
  const repetitions = new Map<string, number[]>();
  repetitions.set(dualHashRepetitionKey(position), [0]);
  let checked = 0;
  for (let ply = 6; ply < 256; ply += 1) {
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    if (legal.length === 0)
      return Object.freeze({
        game_index: index,
        candidate_color: candidateSente ? "sente" : "gote",
        candidate_result: candidateResult(
          position.teban === SENTE ? GOTE : SENTE,
          candidateSente,
        ),
        termination: "no-legal-moves",
        plies: ply,
        legal_moves_checked: checked,
      });
    const candidateTurn = candidateSente
      ? position.teban === SENTE
      : position.teban === GOTE;
    const player = candidateTurn ? candidate : production;
    const mover = position.teban;
    syncWasm(player, position);
    player.setRootTesu(ply);
    const key = player.searchBestMove(1500, 32, 10);
    if (key === 0)
      fail(
        `${candidateTurn ? "candidate" : "production"} returned no move with legal moves available`,
      );
    const move = teFromWasmKey(key, position) as Te;
    if (
      !legal.some(
        (option) =>
          option.koma === move.koma &&
          option.from === move.from &&
          option.to === move.to &&
          option.promote === move.promote,
      )
    )
      fail(
        `${candidateTurn ? "candidate" : "production"} returned an illegal move at ply ${ply}`,
      );
    checked += 1;
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
    traces.push(
      Object.freeze({
        mover,
        gave_check: GenerateMovesImproved.isKingInCheck(
          position,
          position.teban,
        ),
      }),
    );
    const keyAfter = dualHashRepetitionKey(position);
    const occurrences = repetitions.get(keyAfter) ?? [];
    occurrences.push(traces.length);
    repetitions.set(keyAfter, occurrences);
    const repeated = searchWasmRepetitionOutcome(occurrences, traces);
    if (repeated !== null) {
      const winner =
        repeated.loser === null
          ? null
          : repeated.loser === SENTE
            ? GOTE
            : SENTE;
      return Object.freeze({
        game_index: index,
        candidate_color: candidateSente ? "sente" : "gote",
        candidate_result: candidateResult(winner, candidateSente),
        termination: repeated.termination,
        plies: ply + 1,
        legal_moves_checked: checked,
      });
    }
  }
  return Object.freeze({
    game_index: index,
    candidate_color: candidateSente ? "sente" : "gote",
    candidate_result: "draw",
    termination: "max-plies",
    plies: 256,
    legal_moves_checked: checked,
  });
}
function runPair(
  loaded: ReturnType<typeof loadDualHashPlan>,
  index: number,
): Readonly<DualHashPairReceipt> {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 48)
    fail("worker pair index is invalid");
  const candidatePath = authenticate(
    loaded.plan.assets.candidate_wasm,
    "candidate WASM",
  );
  const productionPath = authenticate(
    loaded.plan.assets.production_wasm,
    "production WASM",
  );
  const weightsPath = authenticate(
    loaded.plan.assets.weights,
    "shared weights",
  );
  const candidate = runtime(
    candidatePath,
    weightsPath,
    loaded.plan,
    "candidate",
  );
  const production = runtime(
    productionPath,
    weightsPath,
    loaded.plan,
    "production",
  );
  const seed = loaded.plan.match.pair_seeds[index];
  const games = Object.freeze([
    play(candidate, production, true, seed, 0),
    play(candidate, production, false, seed, 1),
  ]) as DualHashPairReceipt["games"];
  verifyToggle(candidate, production);
  authenticate(loaded.plan.assets.candidate_wasm, "candidate WASM postflight");
  authenticate(
    loaded.plan.assets.production_wasm,
    "production WASM postflight",
  );
  authenticate(loaded.plan.assets.weights, "shared weights postflight");
  authenticate(loaded.plan.assets.runner, "runner postflight");
  if (sha256(readFileSync(loaded.path)) !== loaded.sha256)
    fail("plan identity drifted during pair");
  return sealPair(
    loaded.sha256,
    index,
    seed,
    buildSearchWasmOpening(seed).fingerprint,
    games,
  );
}

function atomicCreate(path: string, value: unknown): void {
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temp, `${searchWasmCanonicalJson(value)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    linkSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}
function atomicWrite(path: string, value: unknown): void {
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temp, `${searchWasmCanonicalJson(value)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}
function writeOnce(path: string, value: unknown, label: string): void {
  if (!existsSync(path)) return atomicCreate(path, value);
  let prior: unknown;
  try {
    prior = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new DualHashLockMatchError(`${label} JSON is invalid`, { cause });
  }
  if (searchWasmCanonicalJson(prior) !== searchWasmCanonicalJson(value))
    fail(`${label} is immutable and differs`);
}
export function validateDualHashOutputDir(
  value: string,
  assets: Readonly<DualHashPlan["assets"]>,
): string {
  if (!isAbsolute(value) || value.includes("\0"))
    fail("--output-dir must be an absolute research-only path");
  const rootValue = resolve(homedir(), ...RUN_ROOT);
  mkdirSync(rootValue, { recursive: true });
  const researchRoot = realpathSync(rootValue);
  const requested = resolve(value);
  const name = relative(researchRoot, requested);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(name) || name.includes(sep))
    fail(
      "--output-dir must be one named run directly below ~/.codex/shogi-runs",
    );
  mkdirSync(requested, { recursive: true });
  const output = realpathSync(requested);
  if (
    !descendant(researchRoot, output) ||
    relative(researchRoot, output).includes(sep)
  )
    fail("--output-dir escaped the fixed research-only root");
  for (const item of [
    assets.runner,
    assets.candidate_wasm,
    assets.production_wasm,
    assets.weights,
  ]) {
    const path = assetPath(item.path);
    if (output === path || descendant(output, path) || descendant(path, output))
      fail("--output-dir collides with immutable asset");
  }
  return output;
}
export function validateDualHashCorrectnessAuthorization(
  value: string,
  expectedSha256: string,
  planSha256: string,
): Readonly<DualHashCorrectnessAuthorization> {
  if (
    !isAbsolute(value) ||
    value.includes("\0") ||
    !SHA256_RE.test(expectedSha256) ||
    !SHA256_RE.test(planSha256)
  )
    fail("correctness authorization identity is invalid");
  const rootValue = resolve(homedir(), ...RUN_ROOT);
  mkdirSync(rootValue, { recursive: true });
  const researchRoot = realpathSync(rootValue);
  const requested = resolve(value);
  const path = realpathSync(requested);
  const parts = relative(researchRoot, path).split(sep);
  if (
    path !== requested ||
    lstatSync(requested).isSymbolicLink() ||
    parts.length !== 2 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(parts[0]) ||
    parts[1] !== "correctness.json" ||
    !statSync(path).isFile()
  )
    fail(
      "correctness authorization must be a regular correctness.json in one research run",
    );
  const bytes = readFileSync(path);
  if (sha256(bytes) !== expectedSha256)
    fail("correctness authorization SHA-256 differs");
  const result = exact(
    JSON.parse(bytes.toString("utf8")),
    [
      "all_gates_passed",
      "collision",
      "direct_play_authorized",
      "gates",
      "incremental",
      "legality",
      "live_change_authorized",
      "performance",
      "plan_sha256",
      "schema",
      "strength_metric",
    ],
    "correctness authorization",
  );
  if (
    result.schema !== "shogi-dual-hash-lock-correctness-result-v1" ||
    result.plan_sha256 !== planSha256 ||
    result.strength_metric !== false ||
    result.live_change_authorized !== false ||
    result.direct_play_authorized !== true ||
    result.all_gates_passed !== true ||
    result.gates === null ||
    typeof result.gates !== "object" ||
    Array.isArray(result.gates)
  )
    fail("correctness authorization did not pass the fixed plan");
  const gates = exact(
    result.gates,
    DUAL_HASH_LOCK_CORRECTNESS_GATES,
    "correctness authorization gates",
  );
  if (Object.values(gates).some((gate) => gate !== true))
    fail("correctness authorization contains a failed or invalid gate");
  return Object.freeze({ path, sha256: expectedSha256, planSha256 });
}
function captureRun(
  value: unknown,
  planSha: string,
  correctnessSha: string,
): DualHashRun {
  const run = exact(
    value,
    [
      "correctness_result_sha256",
      "deadline_at_ms",
      "plan_sha256",
      "schema",
      "started_at_ms",
      "wall_clock_limit_seconds",
    ],
    "durable run receipt",
  );
  if (
    run.schema !== DUAL_HASH_LOCK_RUN_SCHEMA ||
    run.plan_sha256 !== planSha ||
    run.correctness_result_sha256 !== correctnessSha ||
    !Number.isSafeInteger(run.started_at_ms) ||
    (run.started_at_ms as number) < 0 ||
    run.wall_clock_limit_seconds !== 7200 ||
    !Number.isSafeInteger(run.deadline_at_ms) ||
    run.deadline_at_ms !== (run.started_at_ms as number) + 7_200_000
  )
    fail("durable run receipt is invalid");
  return Object.freeze({
    schema: DUAL_HASH_LOCK_RUN_SCHEMA,
    plan_sha256: planSha,
    correctness_result_sha256: correctnessSha,
    started_at_ms: run.started_at_ms as number,
    wall_clock_limit_seconds: 7200,
    deadline_at_ms: run.deadline_at_ms as number,
  });
}
export function initializeDualHashRun(
  output: string,
  planSha: string,
  correctnessSha: string,
  now = Date.now(),
): DualHashRun {
  if (
    !SHA256_RE.test(planSha) ||
    !SHA256_RE.test(correctnessSha) ||
    !Number.isSafeInteger(now) ||
    now < 0
  )
    fail("run identity is invalid");
  const path = resolve(output, "run.json");
  if (existsSync(path))
    return captureRun(
      JSON.parse(readFileSync(path, "utf8")),
      planSha,
      correctnessSha,
    );
  const run: DualHashRun = {
    schema: DUAL_HASH_LOCK_RUN_SCHEMA,
    plan_sha256: planSha,
    correctness_result_sha256: correctnessSha,
    started_at_ms: now,
    wall_clock_limit_seconds: 7200,
    deadline_at_ms: now + 7_200_000,
  };
  atomicCreate(path, run);
  return captureRun(
    JSON.parse(readFileSync(path, "utf8")),
    planSha,
    correctnessSha,
  );
}
function readPairs(
  output: string,
  plan: Readonly<DualHashPlan>,
  sha: string,
): Map<number, Readonly<DualHashPairReceipt>> {
  const directory = validateDualHashPairDirectory(output);
  const pairs = new Map<number, Readonly<DualHashPairReceipt>>();
  for (const name of readdirSync(directory).sort()) {
    if (!PAIR_FILE_RE.test(name))
      fail("unexpected durable pair namespace entry");
    const pair = capturePair(
      JSON.parse(readFileSync(resolve(directory, name), "utf8")),
      plan,
      sha,
    );
    if (
      name !== `pair-${String(pair.pair_index).padStart(4, "0")}.json` ||
      pairs.has(pair.pair_index)
    )
      fail("durable pair identity differs");
    pairs.set(pair.pair_index, pair);
  }
  return pairs;
}
export function validateDualHashPairDirectory(output: string): string {
  const directory = resolve(output, "pairs");
  mkdirSync(directory, { recursive: true });
  if (
    realpathSync(directory) !== directory ||
    lstatSync(directory).isSymbolicLink() ||
    !statSync(directory).isDirectory()
  )
    fail("durable pair directory must be a direct non-symlink directory");
  return directory;
}
interface Worker {
  readonly index: number;
  readonly child: ChildProcessByStdio<null, Readable, Readable>;
  readonly promise: Promise<Readonly<DualHashPairReceipt>>;
}
function spawnWorker(plan: string, sha: string, index: number): Worker {
  const child = spawn(
    process.execPath,
    [
      "-r",
      require.resolve("tsx/cjs"),
      __filename,
      "--worker",
      "--plan",
      plan,
      "--plan-sha",
      sha,
      "--pair-index",
      String(index),
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "" },
    },
  );
  const promise = new Promise<Readonly<DualHashPairReceipt>>(
    (resolvePromise, reject) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (code !== 0 || signal !== null || stderr.length > 0)
          return reject(
            new DualHashLockMatchError(`pair ${index} worker faulted`),
          );
        try {
          resolvePromise(
            JSON.parse(
              Buffer.concat(stdout).toString("utf8"),
            ) as DualHashPairReceipt,
          );
        } catch (cause) {
          reject(
            new DualHashLockMatchError(
              `pair ${index} worker output is invalid`,
              { cause },
            ),
          );
        }
      });
    },
  );
  return { index, child, promise };
}
async function stopWorkers(
  workers: ReadonlyMap<number, Worker>,
): Promise<void> {
  for (const worker of workers.values()) worker.child.kill("SIGTERM");
  await Promise.allSettled(
    [...workers.values()].map((worker) => worker.promise),
  );
}
function terminalFault(
  path: string,
  sha: string,
  index: number | null,
  error: unknown,
): void {
  const description =
    error instanceof Error ? `${error.name}\0${error.message}` : String(error);
  writeOnce(
    path,
    {
      schema: DUAL_HASH_LOCK_FAULT_SCHEMA,
      plan_sha256: sha,
      pair_index: index,
      error_sha256: sha256(`shogi-dual-hash-lock-fault-v1\0${description}`),
      technical_fault_count: 1,
      strength_conclusion_allowed: false,
      selective_continuation_authorized: false,
    },
    "durable fault receipt",
  );
}
function isFault(path: string, sha: string): boolean {
  if (!existsSync(path)) return false;
  const fault = exact(
    JSON.parse(readFileSync(path, "utf8")),
    [
      "error_sha256",
      "pair_index",
      "plan_sha256",
      "schema",
      "selective_continuation_authorized",
      "strength_conclusion_allowed",
      "technical_fault_count",
    ],
    "durable fault",
  );
  if (
    fault.schema !== DUAL_HASH_LOCK_FAULT_SCHEMA ||
    fault.plan_sha256 !== sha ||
    typeof fault.error_sha256 !== "string" ||
    !SHA256_RE.test(fault.error_sha256) ||
    fault.technical_fault_count !== 1 ||
    fault.strength_conclusion_allowed !== false ||
    fault.selective_continuation_authorized !== false ||
    !(
      fault.pair_index === null ||
      (Number.isSafeInteger(fault.pair_index) &&
        (fault.pair_index as number) >= 0 &&
        (fault.pair_index as number) < 48)
    )
  )
    fail("durable fault receipt is invalid");
  return true;
}
function wallStop(path: string, sha: string, run: DualHashRun): boolean {
  if (!existsSync(path)) return false;
  const wall = exact(
    JSON.parse(readFileSync(path, "utf8")),
    [
      "deadline_at_ms",
      "observed_at_ms",
      "plan_sha256",
      "run_started_at_ms",
      "schema",
      "selective_continuation_authorized",
      "strength_conclusion_allowed",
      "wall_clock_expired",
    ],
    "durable wall stop",
  );
  if (
    wall.schema !== DUAL_HASH_LOCK_WALL_STOP_SCHEMA ||
    wall.plan_sha256 !== sha ||
    wall.run_started_at_ms !== run.started_at_ms ||
    wall.deadline_at_ms !== run.deadline_at_ms ||
    !Number.isSafeInteger(wall.observed_at_ms) ||
    (wall.observed_at_ms as number) < run.deadline_at_ms ||
    wall.wall_clock_expired !== true ||
    wall.strength_conclusion_allowed !== false ||
    wall.selective_continuation_authorized !== false
  )
    fail("durable wall-stop receipt is invalid");
  return true;
}

export async function runDualHashCoordinator(
  loaded: ReturnType<typeof loadDualHashPlan>,
  outputValue: string,
  correctness: Readonly<DualHashCorrectnessAuthorization>,
): Promise<Readonly<DualHashResult>> {
  validateDualHashCorrectnessAuthorization(
    correctness.path,
    correctness.sha256,
    loaded.sha256,
  );
  const output = validateDualHashOutputDir(outputValue, loaded.plan.assets);
  const run = initializeDualHashRun(output, loaded.sha256, correctness.sha256);
  const fault = resolve(output, "fault.json");
  const wall = resolve(output, "wall-stop.json");
  const resultPath = resolve(output, "result.json");
  const results = readPairs(output, loaded.plan, loaded.sha256);
  const conclude = (
    reason: StopReason,
    technical = 0,
  ): Readonly<DualHashResult> =>
    analyzeDualHashScreen(
      loaded.plan,
      loaded.sha256,
      correctness.sha256,
      [...results.values()],
      {
        stop_reason: reason,
        technical_fault_count: technical,
      },
    );
  if (isFault(fault, loaded.sha256)) {
    const result = conclude("technical-fault", 1);
    writeOnce(resultPath, result, "terminal result");
    return result;
  }
  if (wallStop(wall, loaded.sha256, run)) {
    const result = conclude("wall-clock");
    writeOnce(resultPath, result, "terminal result");
    return result;
  }
  let analysis = conclude("none");
  if (analysis.status !== "FAIL-closed-incomplete") {
    writeOnce(resultPath, analysis, "terminal result");
    return analysis;
  }
  if (existsSync(resultPath))
    fail("terminal result exists without matching terminal evidence");
  const pending = analysis.missing_pairs.slice();
  const workers = new Map<number, Worker>();
  let technical = 0;
  let expired = Date.now() >= run.deadline_at_ms;
  let active: number | null = null;
  const fill = (): void => {
    while (
      !expired &&
      technical === 0 &&
      workers.size < 12 &&
      pending.length > 0
    ) {
      const index = pending.shift();
      if (index !== undefined)
        workers.set(index, spawnWorker(loaded.path, loaded.sha256, index));
    }
  };
  try {
    fill();
    while (workers.size > 0) {
      const wait = run.deadline_at_ms - Date.now();
      if (wait <= 0) {
        expired = true;
        break;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<{ kind: "wall" }>((resolvePromise) => {
        timer = setTimeout(() => resolvePromise({ kind: "wall" }), wait);
      });
      const completed = [...workers.values()].map((worker) =>
        worker.promise.then(
          (pair) => ({ kind: "pair" as const, worker, pair }),
          (error: unknown) => ({ kind: "fault" as const, worker, error }),
        ),
      );
      const outcome = await Promise.race([...completed, timeout]);
      if (timer !== undefined) clearTimeout(timer);
      if (outcome.kind === "wall") {
        expired = true;
        break;
      }
      active = outcome.worker.index;
      workers.delete(active);
      if (outcome.kind === "fault") {
        technical = 1;
        terminalFault(fault, loaded.sha256, active, outcome.error);
        break;
      }
      let pair: Readonly<DualHashPairReceipt>;
      try {
        pair = capturePair(outcome.pair, loaded.plan, loaded.sha256);
      } catch (error) {
        technical = 1;
        terminalFault(fault, loaded.sha256, active, error);
        break;
      }
      if (
        [...results.values()].some(
          (prior) => prior.opening_fingerprint === pair.opening_fingerprint,
        )
      ) {
        technical = 1;
        terminalFault(fault, loaded.sha256, active, "duplicate opening");
        break;
      }
      atomicWrite(
        resolve(
          output,
          "pairs",
          `pair-${String(pair.pair_index).padStart(4, "0")}.json`,
        ),
        pair,
      );
      results.set(pair.pair_index, pair);
      active = null;
      analysis = conclude("none");
      if (analysis.status === "REJECTED-futility") break;
      fill();
    }
  } catch (error) {
    technical = 1;
    terminalFault(fault, loaded.sha256, active, error);
  } finally {
    if (workers.size > 0) await stopWorkers(workers);
  }
  if (expired && technical === 0)
    writeOnce(
      wall,
      {
        schema: DUAL_HASH_LOCK_WALL_STOP_SCHEMA,
        plan_sha256: loaded.sha256,
        run_started_at_ms: run.started_at_ms,
        deadline_at_ms: run.deadline_at_ms,
        observed_at_ms: Math.max(Date.now(), run.deadline_at_ms),
        wall_clock_expired: true,
        strength_conclusion_allowed: false,
        selective_continuation_authorized: false,
      },
      "durable wall-stop receipt",
    );
  let result = conclude(
    technical ? "technical-fault" : expired ? "wall-clock" : "none",
    technical,
  );
  try {
    authenticate(loaded.plan.assets.runner, "runner postflight");
    authenticate(
      loaded.plan.assets.candidate_wasm,
      "candidate WASM postflight",
    );
    authenticate(
      loaded.plan.assets.production_wasm,
      "production WASM postflight",
    );
    authenticate(loaded.plan.assets.weights, "shared weights postflight");
    validateDualHashCorrectnessAuthorization(
      correctness.path,
      correctness.sha256,
      loaded.sha256,
    );
    if (sha256(readFileSync(loaded.path)) !== loaded.sha256)
      fail("plan identity drifted during match");
  } catch (error) {
    terminalFault(fault, loaded.sha256, null, error);
    result = conclude("technical-fault", 1);
  }
  if (result.status === "FAIL-closed-incomplete")
    fail("coordinator stopped without terminal evidence");
  writeOnce(resultPath, result, "terminal result");
  return result;
}

interface Cli {
  readonly worker: boolean;
  readonly plan: string;
  readonly planSha256: string;
  readonly correctnessResult: string | null;
  readonly correctnessResultSha256: string | null;
  readonly outputDir: string | null;
  readonly pairIndex: number | null;
}
export function parseDualHashCli(argv: readonly string[]): Readonly<Cli> {
  const values = new Map<string, string>();
  let worker = false;
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    if (argument === "--worker") {
      if (worker) fail("--worker repeats");
      worker = true;
      continue;
    }
    if (
      ![
        "--plan",
        "--plan-sha",
        "--correctness-result",
        "--correctness-result-sha",
        "--output-dir",
        "--pair-index",
      ].includes(argument)
    )
      fail(`unknown CLI argument: ${argument}`);
    if (values.has(argument)) fail(`${argument} repeats`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--"))
      fail(`${argument} requires a value`);
    values.set(argument, value);
    i += 1;
  }
  const plan = values.get("--plan");
  const planSha256 = values.get("--plan-sha");
  if (plan === undefined || planSha256 === undefined)
    fail("--plan and --plan-sha are required");
  if (
    !worker &&
    (values.has("--pair-index") ||
      !values.has("--output-dir") ||
      !values.has("--correctness-result") ||
      !values.has("--correctness-result-sha"))
  )
    fail(
      "coordinator requires --output-dir and correctness authorization, and forbids --pair-index",
    );
  if (
    worker &&
    (values.has("--output-dir") ||
      values.has("--correctness-result") ||
      values.has("--correctness-result-sha") ||
      !values.has("--pair-index"))
  )
    fail("worker requires --pair-index and forbids coordinator-only arguments");
  const text = values.get("--pair-index");
  const pairIndex =
    text === undefined || !/^(?:0|[1-9]\d*)$/u.test(text) ? null : Number(text);
  if (worker && pairIndex === null) fail("--pair-index is invalid");
  return Object.freeze({
    worker,
    plan,
    planSha256,
    correctnessResult: values.get("--correctness-result") ?? null,
    correctnessResultSha256: values.get("--correctness-result-sha") ?? null,
    outputDir: values.get("--output-dir") ?? null,
    pairIndex,
  });
}
export async function dualHashLockMain(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const cli = parseDualHashCli(argv);
  const loaded = loadDualHashPlan(cli.plan, cli.planSha256);
  if (cli.worker) {
    process.stdout.write(
      `${searchWasmCanonicalJson(runPair(loaded, cli.pairIndex as number))}\n`,
    );
    return;
  }
  const correctness = validateDualHashCorrectnessAuthorization(
    cli.correctnessResult as string,
    cli.correctnessResultSha256 as string,
    loaded.sha256,
  );
  process.stdout.write(
    `${searchWasmCanonicalJson(
      await runDualHashCoordinator(
        loaded,
        cli.outputDir as string,
        correctness,
      ),
    )}\n`,
  );
}
if (require.main === module) {
  dualHashLockMain().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
