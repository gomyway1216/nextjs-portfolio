/**
 * Research-only paired match runner for one candidate search WASM against the
 * production search WASM with the exact same NNUE weights.
 *
 * The only public CLI is plan driven:
 *
 *   node -r tsx/cjs wasm-spike/match-search-wasm-vs-production.ts \
 *     --plan /absolute/plan.json --plan-sha <sha256> \
 *     --output-dir ~/.codex/shogi-runs/<one-run-name>
 *
 * A private worker mode runs one color-swapped pair in a child process. The
 * coordinator persists only complete authenticated pairs. It has no live
 * weight writer and never edits either WASM or the shared weights.
 */

import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
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

import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import {
  EMPTY,
  FU,
  GOTE,
  OU,
  SENTE,
  Te,
  getKomashu,
} from "../src/components/game/ShogiImproved/types";
import { bucketsForByteLength } from "./nnue-ref";
import {
  loadShogiWasm,
  syncWasm,
  teFromWasmKey,
  type ShogiSearchWasm,
} from "./search-driver";

export const SEARCH_WASM_PLAN_SCHEMA =
  "shogi-search-wasm-vs-production-plan-v1" as const;
export const SEARCH_WASM_PAIR_SCHEMA =
  "shogi-search-wasm-vs-production-pair-v1" as const;
export const SEARCH_WASM_RESULT_SCHEMA =
  "shogi-search-wasm-vs-production-result-v1" as const;
export const SEARCH_WASM_FAULT_SCHEMA =
  "shogi-search-wasm-vs-production-fault-v1" as const;
export const SEARCH_WASM_WALL_STOP_SCHEMA =
  "shogi-search-wasm-vs-production-wall-stop-v1" as const;
export const SEARCH_WASM_RUN_SCHEMA =
  "shogi-search-wasm-vs-production-run-v1" as const;
export const SEARCH_WASM_RUNNER_PATH =
  "wasm-spike/match-search-wasm-vs-production.ts" as const;
export const SEARCH_WASM_PAIRS = 28 as const;
export const SEARCH_WASM_GAMES = 56 as const;
export const SEARCH_WASM_PAIR_WORKERS = 12 as const;
export const SEARCH_WASM_MOVE_MS = 1_500 as const;
export const SEARCH_WASM_PASS_HALFPOINTS = 62 as const;
export const SEARCH_WASM_DENOMINATOR_HALFPOINTS = 112 as const;
export const SEARCH_WASM_WALL_SECONDS = 7_200 as const;
export const SEARCH_WASM_OPENING_PLIES = 6 as const;
export const SEARCH_WASM_MAX_PLIES = 256 as const;
export const SEARCH_WASM_SEARCH_DEPTH = 32 as const;
export const SEARCH_WASM_QUIESCENCE_DEPTH = 10 as const;
export const SEARCH_WASM_TT_POLICY =
  "clear-before-each-game-retain-within-game" as const;

const SHA256_RE = /^[0-9a-f]{64}$/u;
const PAIR_FILE_RE = /^pair-([0-9]{4})\.json$/u;
const OUTER_PLAN_SCHEMA = "shogi-bounded-quiet-history-malus-plan-v1";
const EXISTING_OPENINGS_SCHEMA =
  "shogi-bounded-quiet-history-existing-openings-v1";
const EXISTING_OPENINGS_PATH =
  "ml/protocols/bounded-quiet-history-existing-openings-v1.json";
const OUTER_PLAN_PATH = "ml/protocols/bounded-quiet-history-malus-v1-plan.json";
const OPENING_DIGEST_DOMAIN = "shogi-nnue-fixed-time-opening-v1\0";
const OPENING_SET_DIGEST_DOMAIN =
  "shogi-search-wasm-vs-production-opening-set-v1\0";
const PAIR_DIGEST_DOMAIN = "shogi-search-wasm-vs-production-pair-v1\0";
const RESULT_DIGEST_DOMAIN = "shogi-search-wasm-vs-production-result-v1\0";
const RESEARCH_OUTPUT_ROOT_COMPONENTS = [".codex", "shogi-runs"] as const;

type JsonRecord = Record<string, unknown>;
type CandidateResult = "win" | "draw" | "loss";
type StopReason = "none" | "wall-clock" | "technical-fault";

export interface SearchWasmAsset {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface SearchWasmWeightsAsset extends SearchWasmAsset {
  readonly buckets: number;
}

export interface SearchWasmPlan {
  readonly schema: typeof SEARCH_WASM_PLAN_SCHEMA;
  readonly experiment_id: string;
  readonly assets: Readonly<{
    readonly runner: Readonly<SearchWasmAsset>;
    readonly candidate_wasm: Readonly<SearchWasmAsset>;
    readonly production_wasm: Readonly<SearchWasmAsset>;
    readonly weights: Readonly<SearchWasmWeightsAsset>;
  }>;
  readonly match: Readonly<{
    readonly pairs: typeof SEARCH_WASM_PAIRS;
    readonly games: typeof SEARCH_WASM_GAMES;
    readonly pair_workers: typeof SEARCH_WASM_PAIR_WORKERS;
    readonly milliseconds_per_move: typeof SEARCH_WASM_MOVE_MS;
    readonly opening_plies: typeof SEARCH_WASM_OPENING_PLIES;
    readonly max_plies: typeof SEARCH_WASM_MAX_PLIES;
    readonly search_depth: typeof SEARCH_WASM_SEARCH_DEPTH;
    readonly quiescence_depth: typeof SEARCH_WASM_QUIESCENCE_DEPTH;
    readonly scale_k: 600;
    readonly scale_numer: 1;
    readonly scale_denom: 1;
    readonly color_order: readonly ["candidate-sente", "candidate-gote"];
    readonly tt_policy: typeof SEARCH_WASM_TT_POLICY;
    readonly book: false;
    readonly mate_solver: false;
    readonly fallback: false;
    readonly pair_seeds: readonly number[];
    readonly opening_set_sha256: string;
    readonly pass_halfpoints: typeof SEARCH_WASM_PASS_HALFPOINTS;
    readonly score_denominator_halfpoints: typeof SEARCH_WASM_DENOMINATOR_HALFPOINTS;
    readonly early_stop: "mathematical-futility-only";
    readonly wall_clock_limit_seconds: typeof SEARCH_WASM_WALL_SECONDS;
    readonly wall_clock_expiry: "STOP-no-conclusion";
  }>;
  readonly safety: Readonly<{
    readonly research_only: true;
    readonly local_only: true;
    readonly network: false;
    readonly live_weight_write: false;
  }>;
}

export interface SearchWasmGameReceipt {
  readonly game_index: 0 | 1;
  readonly candidate_color: "sente" | "gote";
  readonly candidate_result: CandidateResult;
  readonly termination:
    "no-legal-moves" | "fourfold-repetition" | "perpetual-check" | "max-plies";
  readonly plies: number;
  readonly legal_moves_checked: number;
}

export interface SearchWasmPairReceipt {
  readonly schema: typeof SEARCH_WASM_PAIR_SCHEMA;
  readonly plan_sha256: string;
  readonly pair_index: number;
  readonly seed: number;
  readonly opening_fingerprint: string;
  readonly games: readonly [
    Readonly<SearchWasmGameReceipt>,
    Readonly<SearchWasmGameReceipt>,
  ];
  readonly candidate_halfpoints: number;
  readonly technical_fault: false;
  readonly receipt_sha256: string;
}

export interface SearchWasmScreenResult {
  readonly schema: typeof SEARCH_WASM_RESULT_SCHEMA;
  readonly plan_sha256: string;
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
  readonly score_denominator_halfpoints: typeof SEARCH_WASM_DENOMINATOR_HALFPOINTS;
  readonly pass_halfpoints: typeof SEARCH_WASM_PASS_HALFPOINTS;
  readonly maximum_possible_final_halfpoints: number;
  readonly all_observed_openings_unique: boolean;
  readonly all_observed_moves_legal: boolean;
  readonly technical_fault_count: number;
  readonly wall_clock_expired: boolean;
  readonly promotion_authorized: false;
  readonly live_weight_write_authorized: false;
  readonly result_sha256: string;
}

export interface SearchWasmRunReceipt {
  readonly schema: typeof SEARCH_WASM_RUN_SCHEMA;
  readonly plan_sha256: string;
  readonly started_at_ms: number;
  readonly wall_clock_limit_seconds: typeof SEARCH_WASM_WALL_SECONDS;
  readonly deadline_at_ms: number;
}

interface NnueSearchWasm extends ShogiSearchWasm {
  readonly memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(value: number): void;
  setNnueScaleK(value: number): void;
  setNnueOutputScale(numer: number, denom: number): void;
  setNnueEnabled(flag: number): void;
  setResearchQuietHistoryMalus?: (flag: number) => void;
  getResearchQuietHistoryMalusEnabled?: () => number;
}

export interface SearchWasmResearchToggleExports {
  setResearchQuietHistoryMalus?: (flag: number) => void;
  getResearchQuietHistoryMalusEnabled?: () => number;
}

interface Opening {
  readonly moves: readonly Te[];
  readonly fingerprint: string;
}

interface ExistingOpeningEvidence {
  readonly asset: Readonly<SearchWasmAsset>;
  readonly count: number;
  readonly canonicalListSha256: string;
  readonly fingerprints: ReadonlySet<string>;
  readonly selectionRule: string;
  readonly selectedSeeds: readonly number[];
  readonly selectedFingerprints: readonly string[];
  readonly skippedSeeds: readonly Readonly<{
    readonly seed: number;
    readonly reason: "fingerprint-already-enrolled" | "fingerprint-repeats";
    readonly fingerprint: string;
  }>[];
}

export interface SearchWasmMoveTrace {
  readonly mover: typeof SENTE | typeof GOTE;
  readonly gave_check: boolean;
}

interface WorkerHandle {
  readonly pairIndex: number;
  readonly child: ChildProcessByStdio<null, Readable, Readable>;
  readonly promise: Promise<Readonly<SearchWasmPairReceipt>>;
}

export class SearchWasmVsProductionError extends Error {
  readonly strength_conclusion_allowed = false;
  readonly live_weight_write_authorized = false;

  constructor(message: string, options?: ErrorOptions) {
    super(`search WASM research match failed: ${message}`, options);
    this.name = "SearchWasmVsProductionError";
  }
}

export function configureSearchWasmResearchToggle(
  runtime: SearchWasmResearchToggleExports,
  role: "candidate" | "production",
): void {
  if (role === "candidate") {
    if (
      typeof runtime.setResearchQuietHistoryMalus !== "function" ||
      typeof runtime.getResearchQuietHistoryMalusEnabled !== "function"
    ) {
      fail("candidate WASM lacks the preregistered quiet-history toggle");
    }
    runtime.setResearchQuietHistoryMalus(1);
    if (runtime.getResearchQuietHistoryMalusEnabled() !== 1) {
      fail("candidate WASM quiet-history toggle did not activate");
    }
  } else if (
    typeof runtime.setResearchQuietHistoryMalus === "function" ||
    typeof runtime.getResearchQuietHistoryMalusEnabled === "function"
  ) {
    fail("production WASM unexpectedly exposes the research toggle");
  }
}

export function verifySearchWasmResearchToggle(
  candidate: SearchWasmResearchToggleExports,
  production: SearchWasmResearchToggleExports,
): void {
  if (
    candidate.getResearchQuietHistoryMalusEnabled?.() !== 1 ||
    typeof production.setResearchQuietHistoryMalus === "function" ||
    typeof production.getResearchQuietHistoryMalusEnabled === "function"
  ) {
    fail("research toggle binding drifted during the pair");
  }
}

function fail(message: string): never {
  throw new SearchWasmVsProductionError(message);
}

export function searchWasmCanonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || Object.is(value, -0))
    ) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(searchWasmCanonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as JsonRecord;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${searchWasmCanonicalJson(record[key])}`,
      )
      .join(",")}}`;
  }
  fail(`canonical JSON rejects ${typeof value}`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function digest(domain: string, value: unknown): string {
  return sha256(`${domain}${searchWasmCanonicalJson(value)}`);
}

function exactRecord(
  value: unknown,
  fields: readonly string[],
  label: string,
): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const record = value as JsonRecord;
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    fail(`${label} fields differ`);
  }
  return record;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    fail(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function captureAsset(
  value: unknown,
  label: string,
  withBuckets: boolean,
): Readonly<SearchWasmAsset | SearchWasmWeightsAsset> {
  const fields = withBuckets
    ? ["buckets", "bytes", "path", "sha256"]
    : ["bytes", "path", "sha256"];
  const asset = exactRecord(value, fields, label);
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
    typeof asset.sha256 !== "string" ||
    !SHA256_RE.test(asset.sha256)
  ) {
    fail(`${label} identity is invalid`);
  }
  const captured = {
    path: asset.path,
    bytes: positiveInteger(asset.bytes, `${label}.bytes`),
    sha256: asset.sha256,
  };
  if (!withBuckets) return Object.freeze(captured);
  const buckets = positiveInteger(asset.buckets, `${label}.buckets`);
  if (buckets > 65_535) fail(`${label}.buckets is too large`);
  return Object.freeze({ ...captured, buckets });
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickQuietOpeningMove(
  position: KyokumenImproved,
  legalMoves: readonly Te[],
  random: () => number,
): Te {
  const quiet = legalMoves.filter(
    (move) => move.from !== 0 && move.capture === EMPTY && !move.promote,
  );
  const pawnStartDan = position.teban === SENTE ? 7 : 3;
  const pawnNextDan = position.teban === SENTE ? 6 : 4;
  const pawnPushes = quiet.filter(
    (move) =>
      getKomashu(move.koma) === FU &&
      (move.from & 0x0f) === pawnStartDan &&
      (move.to & 0x0f) === pawnNextDan,
  );
  const candidates =
    pawnPushes.length > 0
      ? pawnPushes
      : quiet.filter((move) => getKomashu(move.koma) !== OU);
  const pool = candidates.length > 0 ? candidates : quiet;
  const finalPool = pool.length > 0 ? pool : legalMoves;
  return finalPool[Math.floor(random() * finalPool.length)];
}

export function buildSearchWasmOpening(seed: number): Readonly<Opening> {
  positiveInteger(seed, "opening seed");
  const position = new KyokumenImproved();
  position.initHirate();
  const random = mulberry32(seed);
  const moves: Te[] = [];
  for (let ply = 0; ply < SEARCH_WASM_OPENING_PLIES; ply += 1) {
    const legalMoves = GenerateMovesImproved.generateLegalMoves(position);
    if (legalMoves.length === 0)
      fail("opening generator reached terminal state");
    const selected = pickQuietOpeningMove(position, legalMoves, random).clone();
    selected.capture = position.get(selected.to);
    moves.push(selected.clone());
    position.move(selected);
    position.toggleTeban();
  }
  const canonical = moves.map((move) => [
    move.koma,
    move.from,
    move.to,
    move.promote ? 1 : 0,
  ]);
  return Object.freeze({
    moves: Object.freeze(moves),
    fingerprint: digest(OPENING_DIGEST_DOMAIN, canonical),
  });
}

export function searchWasmOpeningSetSha256(
  pairSeeds: readonly number[],
): string {
  return digest(
    OPENING_SET_DIGEST_DOMAIN,
    pairSeeds.map((seed) => buildSearchWasmOpening(seed).fingerprint),
  );
}

export function validateSearchWasmPlan(
  value: unknown,
): Readonly<SearchWasmPlan> {
  const plan = exactRecord(
    value,
    ["assets", "experiment_id", "match", "safety", "schema"],
    "research match plan",
  );
  if (
    plan.schema !== SEARCH_WASM_PLAN_SCHEMA ||
    typeof plan.experiment_id !== "string" ||
    plan.experiment_id.length === 0 ||
    plan.experiment_id.includes("\0")
  ) {
    fail("research match plan header is invalid");
  }
  const assets = exactRecord(
    plan.assets,
    ["candidate_wasm", "production_wasm", "runner", "weights"],
    "research match assets",
  );
  const runner = captureAsset(
    assets.runner,
    "runner",
    false,
  ) as SearchWasmAsset;
  const candidateWasm = captureAsset(
    assets.candidate_wasm,
    "candidate WASM",
    false,
  ) as SearchWasmAsset;
  const productionWasm = captureAsset(
    assets.production_wasm,
    "production WASM",
    false,
  ) as SearchWasmAsset;
  const weights = captureAsset(
    assets.weights,
    "shared weights",
    true,
  ) as SearchWasmWeightsAsset;
  if (runner.path !== SEARCH_WASM_RUNNER_PATH) {
    fail("runner path differs from the fixed research runner");
  }
  if (
    candidateWasm.path === productionWasm.path ||
    candidateWasm.sha256 === productionWasm.sha256
  ) {
    fail("candidate and production WASM identities must differ");
  }
  const match = exactRecord(
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
    "research match contract",
  );
  if (
    match.pairs !== SEARCH_WASM_PAIRS ||
    match.games !== SEARCH_WASM_GAMES ||
    match.pair_workers !== SEARCH_WASM_PAIR_WORKERS ||
    match.milliseconds_per_move !== SEARCH_WASM_MOVE_MS ||
    match.opening_plies !== SEARCH_WASM_OPENING_PLIES ||
    match.max_plies !== SEARCH_WASM_MAX_PLIES ||
    match.search_depth !== SEARCH_WASM_SEARCH_DEPTH ||
    match.quiescence_depth !== SEARCH_WASM_QUIESCENCE_DEPTH ||
    match.scale_k !== 600 ||
    match.scale_numer !== 1 ||
    match.scale_denom !== 1 ||
    !Array.isArray(match.color_order) ||
    searchWasmCanonicalJson(match.color_order) !==
      searchWasmCanonicalJson(["candidate-sente", "candidate-gote"]) ||
    match.tt_policy !== SEARCH_WASM_TT_POLICY ||
    match.book !== false ||
    match.mate_solver !== false ||
    match.fallback !== false ||
    match.pass_halfpoints !== SEARCH_WASM_PASS_HALFPOINTS ||
    match.score_denominator_halfpoints !== SEARCH_WASM_DENOMINATOR_HALFPOINTS ||
    match.early_stop !== "mathematical-futility-only" ||
    match.wall_clock_limit_seconds !== SEARCH_WASM_WALL_SECONDS ||
    match.wall_clock_expiry !== "STOP-no-conclusion"
  ) {
    fail("research match contract differs from the fixed screen");
  }
  if (
    !Array.isArray(match.pair_seeds) ||
    match.pair_seeds.length !== SEARCH_WASM_PAIRS
  ) {
    fail("research match requires exactly 28 pair seeds");
  }
  const pairSeeds = match.pair_seeds.map((seed, index) =>
    positiveInteger(seed, `pair seed ${index}`),
  );
  if (new Set(pairSeeds).size !== pairSeeds.length) {
    fail("pair seeds repeat");
  }
  const fingerprints = pairSeeds.map(
    (seed) => buildSearchWasmOpening(seed).fingerprint,
  );
  if (new Set(fingerprints).size !== fingerprints.length) {
    fail("fresh paired opening fingerprints repeat");
  }
  if (
    typeof match.opening_set_sha256 !== "string" ||
    !SHA256_RE.test(match.opening_set_sha256) ||
    match.opening_set_sha256 !== searchWasmOpeningSetSha256(pairSeeds)
  ) {
    fail("opening set digest does not bind the fresh paired openings");
  }
  const safety = exactRecord(
    plan.safety,
    ["live_weight_write", "local_only", "network", "research_only"],
    "research safety boundary",
  );
  if (
    safety.research_only !== true ||
    safety.local_only !== true ||
    safety.network !== false ||
    safety.live_weight_write !== false
  ) {
    fail("research safety boundary differs");
  }
  return Object.freeze({
    schema: SEARCH_WASM_PLAN_SCHEMA,
    experiment_id: plan.experiment_id,
    assets: Object.freeze({
      runner,
      candidate_wasm: candidateWasm,
      production_wasm: productionWasm,
      weights,
    }),
    match: Object.freeze({
      pairs: SEARCH_WASM_PAIRS,
      games: SEARCH_WASM_GAMES,
      pair_workers: SEARCH_WASM_PAIR_WORKERS,
      milliseconds_per_move: SEARCH_WASM_MOVE_MS,
      opening_plies: SEARCH_WASM_OPENING_PLIES,
      max_plies: SEARCH_WASM_MAX_PLIES,
      search_depth: SEARCH_WASM_SEARCH_DEPTH,
      quiescence_depth: SEARCH_WASM_QUIESCENCE_DEPTH,
      scale_k: 600,
      scale_numer: 1,
      scale_denom: 1,
      color_order: Object.freeze(["candidate-sente", "candidate-gote"]),
      tt_policy: SEARCH_WASM_TT_POLICY,
      book: false,
      mate_solver: false,
      fallback: false,
      pair_seeds: Object.freeze(pairSeeds),
      opening_set_sha256: match.opening_set_sha256,
      pass_halfpoints: SEARCH_WASM_PASS_HALFPOINTS,
      score_denominator_halfpoints: SEARCH_WASM_DENOMINATOR_HALFPOINTS,
      early_stop: "mathematical-futility-only",
      wall_clock_limit_seconds: SEARCH_WASM_WALL_SECONDS,
      wall_clock_expiry: "STOP-no-conclusion",
    }),
    safety: Object.freeze({
      research_only: true,
      local_only: true,
      network: false,
      live_weight_write: false,
    }),
  }) as Readonly<SearchWasmPlan>;
}

function repositoryRoot(): string {
  const root = realpathSync(process.cwd());
  if (
    !existsSync(resolve(root, "package.json")) ||
    !existsSync(resolve(root, ".git")) ||
    !existsSync(resolve(root, SEARCH_WASM_RUNNER_PATH))
  ) {
    fail("current directory is not the anchored repository root");
  }
  return root;
}

function assetPath(path: string): string {
  const root = repositoryRoot();
  const authenticatedPath = realpathSync(resolve(root, path));
  if (!isStrictDescendant(root, authenticatedPath)) {
    fail("planned asset resolves outside the verified repository root");
  }
  return authenticatedPath;
}

function authenticateAsset(
  asset: Readonly<SearchWasmAsset>,
  label: string,
): string {
  const path = assetPath(asset.path);
  const stat = statSync(path);
  if (!stat.isFile() || stat.size !== asset.bytes) {
    fail(`${label} file identity differs`);
  }
  const bytes = readFileSync(path);
  if (sha256(bytes) !== asset.sha256) {
    fail(`${label} SHA-256 differs`);
  }
  return path;
}

function sortedUniqueShaList(
  value: unknown,
  expectedCount: number,
  label: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length !== expectedCount ||
    value.some(
      (fingerprint) =>
        typeof fingerprint !== "string" || !SHA256_RE.test(fingerprint),
    )
  ) {
    fail(`${label} is invalid`);
  }
  const fingerprints = value as string[];
  if (
    new Set(fingerprints).size !== fingerprints.length ||
    fingerprints.some(
      (fingerprint, index) =>
        index > 0 && fingerprints[index - 1] >= fingerprint,
    )
  ) {
    fail(`${label} must be strictly sorted and unique`);
  }
  return Object.freeze([...fingerprints]);
}

function reproduceFreshOpeningSelection(
  enrolled: ReadonlySet<string>,
): Readonly<{
  readonly selectedSeeds: readonly number[];
  readonly selectedFingerprints: readonly string[];
  readonly skippedSeeds: readonly Readonly<{
    readonly seed: number;
    readonly reason: "fingerprint-already-enrolled" | "fingerprint-repeats";
    readonly fingerprint: string;
  }>[];
}> {
  const selectedSeeds: number[] = [];
  const selectedFingerprints: string[] = [];
  const selectedSet = new Set<string>();
  const skippedSeeds: {
    seed: number;
    reason: "fingerprint-already-enrolled" | "fingerprint-repeats";
    fingerprint: string;
  }[] = [];
  for (
    let seed = 970_001;
    selectedSeeds.length < SEARCH_WASM_PAIRS;
    seed += 1
  ) {
    if (seed > 1_970_001) {
      fail("fresh opening selection exceeded its bounded scan");
    }
    const fingerprint = buildSearchWasmOpening(seed).fingerprint;
    if (enrolled.has(fingerprint)) {
      skippedSeeds.push({
        seed,
        reason: "fingerprint-already-enrolled",
        fingerprint,
      });
      continue;
    }
    if (selectedSet.has(fingerprint)) {
      skippedSeeds.push({
        seed,
        reason: "fingerprint-repeats",
        fingerprint,
      });
      continue;
    }
    selectedSeeds.push(seed);
    selectedFingerprints.push(fingerprint);
    selectedSet.add(fingerprint);
  }
  return Object.freeze({
    selectedSeeds: Object.freeze(selectedSeeds),
    selectedFingerprints: Object.freeze(selectedFingerprints),
    skippedSeeds: Object.freeze(
      skippedSeeds.map((entry) => Object.freeze(entry)),
    ),
  });
}

function validateExistingOpeningEvidence(
  outer: JsonRecord,
  plan: Readonly<SearchWasmPlan>,
): Readonly<ExistingOpeningEvidence> {
  const pinnedInputs =
    outer.pinned_inputs !== null &&
    typeof outer.pinned_inputs === "object" &&
    !Array.isArray(outer.pinned_inputs)
      ? (outer.pinned_inputs as JsonRecord)
      : fail("outer pinned_inputs is invalid");
  const asset = captureAsset(
    pinnedInputs.existing_opening_evidence,
    "existing opening evidence",
    false,
  ) as SearchWasmAsset;
  if (asset.path !== EXISTING_OPENINGS_PATH) {
    fail("existing opening evidence path differs");
  }
  const evidencePath = authenticateAsset(asset, "existing opening evidence");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch (cause) {
    throw new SearchWasmVsProductionError(
      "existing opening evidence JSON is invalid",
      { cause },
    );
  }
  const evidence = exactRecord(
    parsed,
    [
      "canonical_list_raw_sha256",
      "duplicate_occurrences",
      "fingerprint_domain",
      "full_enrolled_canonical_list_raw_sha256",
      "full_enrolled_sorted_unique_count",
      "full_enrolled_sorted_unique_fingerprints",
      "malformed",
      "malformed_manifests",
      "malformed_receipts",
      "manifest_canonical_list_raw_sha256",
      "manifest_duplicate_pair_seed_occurrences",
      "manifest_pair_seed_maximum",
      "manifest_pair_seed_minimum",
      "manifest_pair_seed_occurrences",
      "manifest_sorted_unique_fingerprint_count",
      "manifest_unique_pair_seed_count",
      "new_opening_selection",
      "receipt_fingerprints_missing_from_manifest_count",
      "recorded_at_date",
      "schema",
      "sorted_unique_count",
      "sorted_unique_fingerprints",
      "source_manifest_files",
      "source_manifest_schema",
      "source_receipt_files",
      "source_receipt_schema",
      "source_root",
    ],
    "existing opening evidence",
  );
  if (
    evidence.schema !== EXISTING_OPENINGS_SCHEMA ||
    evidence.fingerprint_domain !== OPENING_DIGEST_DOMAIN ||
    evidence.full_enrolled_sorted_unique_count !== 3_198 ||
    evidence.full_enrolled_canonical_list_raw_sha256 !==
      "0dde79f19d21dbf671de9525dc87bd4e9c8a617e1a06e3a61f704f1dcbaed291"
  ) {
    fail("existing opening evidence header differs");
  }
  const full = sortedUniqueShaList(
    evidence.full_enrolled_sorted_unique_fingerprints,
    3_198,
    "full enrolled opening fingerprints",
  );
  const fullDigest = sha256(searchWasmCanonicalJson(full));
  if (fullDigest !== evidence.full_enrolled_canonical_list_raw_sha256) {
    fail("full enrolled opening fingerprint digest differs");
  }
  const selection = exactRecord(
    evidence.new_opening_selection,
    [
      "full_enrolled_fingerprint_intersection_count",
      "generator_seed_rule",
      "rule",
      "seed_start",
      "selected_opening_fingerprints",
      "selected_pair_seed_manifest_intersection_count",
      "selected_pair_seeds",
      "selected_sorted_unique_fingerprint_count",
      "selected_sorted_unique_fingerprints_canonical_list_raw_sha256",
      "skipped_seeds",
      "target_count",
      "within_selection_duplicate_fingerprint_count",
    ],
    "new opening selection evidence",
  );
  const fullSet = new Set(full);
  const reproduced = reproduceFreshOpeningSelection(fullSet);
  const expectedFingerprints = reproduced.selectedFingerprints;
  const selectedSorted = [...expectedFingerprints].sort();
  if (
    selection.rule !==
      "Starting at seed 970001, scan upward; skip fingerprints already in the full enrolled set or already selected; accept the first 28 fresh unique fingerprints." ||
    selection.generator_seed_rule !== "mulberry32(seed)" ||
    selection.seed_start !== 970_001 ||
    selection.target_count !== SEARCH_WASM_PAIRS ||
    searchWasmCanonicalJson(selection.selected_pair_seeds) !==
      searchWasmCanonicalJson(reproduced.selectedSeeds) ||
    searchWasmCanonicalJson(plan.match.pair_seeds) !==
      searchWasmCanonicalJson(reproduced.selectedSeeds) ||
    searchWasmCanonicalJson(selection.selected_opening_fingerprints) !==
      searchWasmCanonicalJson(expectedFingerprints) ||
    selection.selected_sorted_unique_fingerprint_count !== SEARCH_WASM_PAIRS ||
    selection.selected_sorted_unique_fingerprints_canonical_list_raw_sha256 !==
      sha256(searchWasmCanonicalJson(selectedSorted)) ||
    selection.selected_pair_seed_manifest_intersection_count !== 0 ||
    selection.full_enrolled_fingerprint_intersection_count !== 0 ||
    selection.within_selection_duplicate_fingerprint_count !== 0 ||
    expectedFingerprints.some((fingerprint) => fullSet.has(fingerprint))
  ) {
    fail("new opening selection differs from fresh generated openings");
  }
  if (!Array.isArray(selection.skipped_seeds)) {
    fail("skipped opening collision evidence differs");
  }
  const capturedSkips = selection.skipped_seeds.map((value, index) => {
    const skipped = exactRecord(
      value,
      ["collides_with_manifest_pair_seeds", "fingerprint", "reason", "seed"],
      `skipped opening collision ${index}`,
    );
    if (
      !Number.isSafeInteger(skipped.seed) ||
      !["fingerprint-already-enrolled", "fingerprint-repeats"].includes(
        skipped.reason as string,
      ) ||
      typeof skipped.fingerprint !== "string" ||
      !SHA256_RE.test(skipped.fingerprint) ||
      !Array.isArray(skipped.collides_with_manifest_pair_seeds)
    ) {
      fail(`skipped opening collision ${index} is invalid`);
    }
    return Object.freeze({
      seed: skipped.seed as number,
      reason: skipped.reason as
        "fingerprint-already-enrolled" | "fingerprint-repeats",
      fingerprint: skipped.fingerprint,
    });
  });
  if (
    searchWasmCanonicalJson(capturedSkips) !==
    searchWasmCanonicalJson(reproduced.skippedSeeds)
  ) {
    fail("skipped opening evidence differs from the reproduced scan");
  }
  const firstSkip = exactRecord(
    selection.skipped_seeds[0],
    ["collides_with_manifest_pair_seeds", "fingerprint", "reason", "seed"],
    "first skipped opening collision",
  );
  if (
    searchWasmCanonicalJson(firstSkip.collides_with_manifest_pair_seeds) !==
    searchWasmCanonicalJson([810_127])
  ) {
    fail("skipped opening source-seed evidence differs");
  }
  return Object.freeze({
    asset,
    count: full.length,
    canonicalListSha256: fullDigest,
    fingerprints: fullSet,
    selectionRule: selection.rule as string,
    selectedSeeds: reproduced.selectedSeeds,
    selectedFingerprints: Object.freeze(expectedFingerprints),
    skippedSeeds: reproduced.skippedSeeds,
  });
}

function sameAssetIdentity(
  outerAsset: Readonly<SearchWasmAsset>,
  innerAsset: Readonly<SearchWasmAsset>,
): boolean {
  return (
    outerAsset.path === innerAsset.path &&
    outerAsset.bytes === innerAsset.bytes &&
    outerAsset.sha256 === innerAsset.sha256
  );
}

function validateOuterAssetBindings(
  outer: JsonRecord,
  plan: Readonly<SearchWasmPlan>,
): void {
  const planned =
    outer.planned_research_artifacts !== null &&
    typeof outer.planned_research_artifacts === "object" &&
    !Array.isArray(outer.planned_research_artifacts)
      ? (outer.planned_research_artifacts as JsonRecord)
      : fail("outer planned_research_artifacts is invalid");
  const pinned =
    outer.pinned_inputs !== null &&
    typeof outer.pinned_inputs === "object" &&
    !Array.isArray(outer.pinned_inputs)
      ? (outer.pinned_inputs as JsonRecord)
      : fail("outer pinned_inputs is invalid");
  const outerRunner = captureAsset(
    planned.match_runner,
    "outer match runner",
    false,
  ) as SearchWasmAsset;
  const outerCandidate = captureAsset(
    planned.research_wasm,
    "outer research WASM",
    false,
  ) as SearchWasmAsset;
  const outerProduction = captureAsset(
    pinned.production_wasm,
    "outer production WASM",
    false,
  ) as SearchWasmAsset;
  const outerWeights = exactRecord(
    pinned.immutable_live_weights,
    ["buckets", "bytes", "output_scale", "path", "scale_k", "sha256"],
    "outer immutable live weights",
  );
  const capturedWeights = captureAsset(
    {
      path: outerWeights.path,
      bytes: outerWeights.bytes,
      sha256: outerWeights.sha256,
      buckets: outerWeights.buckets,
    },
    "outer immutable live weights identity",
    true,
  ) as SearchWasmWeightsAsset;
  if (
    !sameAssetIdentity(outerRunner, plan.assets.runner) ||
    !sameAssetIdentity(outerCandidate, plan.assets.candidate_wasm) ||
    !sameAssetIdentity(outerProduction, plan.assets.production_wasm) ||
    !sameAssetIdentity(capturedWeights, plan.assets.weights) ||
    capturedWeights.buckets !== plan.assets.weights.buckets ||
    outerWeights.scale_k !== plan.match.scale_k ||
    searchWasmCanonicalJson(outerWeights.output_scale) !==
      searchWasmCanonicalJson([plan.match.scale_numer, plan.match.scale_denom])
  ) {
    fail("outer and executable asset identities differ");
  }
}

export function loadSearchWasmPlan(
  planPathValue: string,
  expectedSha256: string,
): {
  readonly path: string;
  readonly sha256: string;
  readonly plan: Readonly<SearchWasmPlan>;
  readonly evidenceAsset: Readonly<SearchWasmAsset>;
} {
  if (!SHA256_RE.test(expectedSha256)) fail("--plan-sha is invalid");
  const path = realpathSync(resolve(planPathValue));
  if (path !== realpathSync(resolve(repositoryRoot(), OUTER_PLAN_PATH))) {
    fail("--plan must identify the fixed tracked outer preregistration");
  }
  const bytes = readFileSync(path);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256) fail("plan SHA-256 differs");
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (cause) {
    throw new SearchWasmVsProductionError("plan JSON is invalid", { cause });
  }
  const outer = value as JsonRecord;
  if (
    outer === null ||
    typeof outer !== "object" ||
    Array.isArray(outer) ||
    outer.schema !== OUTER_PLAN_SCHEMA ||
    typeof outer.plan_id !== "string" ||
    outer.plan_id.length === 0
  ) {
    fail("outer preregistration plan header is invalid");
  }
  const plan = validateSearchWasmPlan(outer.execution_manifest);
  if (plan.experiment_id !== outer.plan_id) {
    fail("execution manifest experiment_id differs from outer plan_id");
  }
  validateOuterAssetBindings(outer, plan);
  const evidence = validateExistingOpeningEvidence(outer, plan);
  validateOuterOpeningPreflight(outer, plan, evidence);
  authenticateAsset(plan.assets.runner, "runner");
  authenticateAsset(plan.assets.candidate_wasm, "candidate WASM");
  authenticateAsset(plan.assets.production_wasm, "production WASM");
  authenticateAsset(plan.assets.weights, "shared weights");
  return Object.freeze({
    path,
    sha256: actualSha256,
    plan,
    evidenceAsset: evidence.asset,
  });
}

function authenticateLoadedPlan(
  loaded: ReturnType<typeof loadSearchWasmPlan>,
  label: string,
): void {
  const path = realpathSync(loaded.path);
  if (
    path !== realpathSync(resolve(repositoryRoot(), OUTER_PLAN_PATH)) ||
    sha256(readFileSync(path)) !== loaded.sha256
  ) {
    fail(`${label} identity differs`);
  }
}

function validateOuterOpeningPreflight(
  outer: JsonRecord,
  plan: Readonly<SearchWasmPlan>,
  evidence: Readonly<ExistingOpeningEvidence>,
): void {
  const gate = exactRecord(
    outer.direct_play_gate,
    [
      "any_fault_effect",
      "baseline_runtime",
      "candidate_runtime",
      "color_order",
      "early_stop",
      "early_stop_expression",
      "games",
      "games_per_pair",
      "heavy_concurrent_work_allowed",
      "mate_solver",
      "opening_book",
      "opening_pairs",
      "opening_policy",
      "pair_workers",
      "pass_expression",
      "pass_threshold",
      "promotion_effect",
      "required_integrity",
      "score_unit",
      "time_limit_ms_per_move",
      "transposition_table",
      "wall_clock",
      "weights_for_both_arms",
    ],
    "outer direct-play gate",
  );
  const openingPolicy = gate.opening_policy as JsonRecord;
  const wallClock = exactRecord(
    gate.wall_clock,
    ["deadline_effect", "maximum_elapsed_ms", "target"],
    "outer wall-clock gate",
  );
  const integrity = exactRecord(
    gate.required_integrity,
    [
      "baseline_runtime_identity_matches",
      "both_weight_identities_match",
      "candidate_research_toggle_enabled",
      "candidate_runtime_identity_matches",
      "complete_color_swapped_pairs",
      "every_played_move_revalidated_legal",
      "illegal_move_count",
      "original_two_hour_deadline_survives_restart",
      "perpetual_check_adjudicated_as_checker_loss",
      "production_research_toggle_absent",
      "technical_fault_and_wall_stop_are_durable",
      "technical_fault_count",
      "unique_openings",
    ],
    "outer direct-play integrity gate",
  );
  if (
    gate.candidate_runtime !==
      "planned_research_artifacts.research_wasm with the sole candidate enabled" ||
    gate.baseline_runtime !== "pinned_inputs.production_wasm" ||
    gate.weights_for_both_arms !== "pinned_inputs.immutable_live_weights" ||
    gate.games !== SEARCH_WASM_GAMES ||
    gate.opening_pairs !== SEARCH_WASM_PAIRS ||
    gate.games_per_pair !== 2 ||
    searchWasmCanonicalJson(gate.color_order) !==
      searchWasmCanonicalJson(plan.match.color_order) ||
    gate.time_limit_ms_per_move !== SEARCH_WASM_MOVE_MS ||
    gate.pair_workers !== SEARCH_WASM_PAIR_WORKERS ||
    gate.opening_book !== false ||
    gate.mate_solver !== false ||
    gate.transposition_table !==
      "clear before every game and retain only within that game" ||
    gate.heavy_concurrent_work_allowed !== false ||
    wallClock.target !== "complete within two hours" ||
    wallClock.maximum_elapsed_ms !== SEARCH_WASM_WALL_SECONDS * 1_000 ||
    wallClock.deadline_effect !==
      "STOP with no strength conclusion; partial results cannot pass or authorize selective continuation" ||
    gate.score_unit !== "candidate halfpoints out of 112" ||
    gate.pass_threshold !== SEARCH_WASM_PASS_HALFPOINTS ||
    gate.pass_expression !== "candidate_halfpoints >= 62" ||
    gate.early_stop !== "mathematical-futility-only" ||
    gate.early_stop_expression !==
      "stop only when candidate_halfpoints + 2 * remaining_games < 62" ||
    gate.any_fault_effect !==
      "The complete pilot is invalid and yields no playing-strength conclusion." ||
    gate.promotion_effect !== "none" ||
    integrity.technical_fault_count !== 0 ||
    integrity.illegal_move_count !== 0 ||
    integrity.unique_openings !== SEARCH_WASM_PAIRS ||
    integrity.complete_color_swapped_pairs !== SEARCH_WASM_PAIRS ||
    integrity.candidate_runtime_identity_matches !== true ||
    integrity.baseline_runtime_identity_matches !== true ||
    integrity.both_weight_identities_match !== true ||
    integrity.candidate_research_toggle_enabled !== true ||
    integrity.production_research_toggle_absent !== true ||
    integrity.every_played_move_revalidated_legal !== true ||
    integrity.perpetual_check_adjudicated_as_checker_loss !== true ||
    integrity.original_two_hour_deadline_survives_restart !== true ||
    integrity.technical_fault_and_wall_stop_are_durable !== true
  ) {
    fail("outer direct-play gate differs from the executable contract");
  }
  if (
    openingPolicy === null ||
    typeof openingPolicy !== "object" ||
    Array.isArray(openingPolicy) ||
    !Array.isArray(openingPolicy.opening_fingerprints) ||
    !Array.isArray(
      openingPolicy.intersection_with_existing_opening_fingerprints,
    ) ||
    openingPolicy.intersection_with_existing_opening_fingerprints.length !==
      0 ||
    openingPolicy.existing_opening_fingerprint_count !== evidence.count ||
    openingPolicy.existing_opening_fingerprints_sha256 !==
      evidence.canonicalListSha256 ||
    openingPolicy.seed_start !== 970_001 ||
    openingPolicy.selection_rule !== evidence.selectionRule ||
    openingPolicy.evidence !== "pinned_inputs.existing_opening_evidence" ||
    !Array.isArray(openingPolicy.skipped_seeds)
  ) {
    fail("outer opening preflight is incomplete");
  }
  const outerSkipped = openingPolicy.skipped_seeds.map(
    (value: unknown, index: number) => {
      const skipped = exactRecord(
        value,
        ["collides_with_manifest_pair_seeds", "fingerprint", "reason", "seed"],
        `outer skipped opening ${index}`,
      );
      return {
        seed: skipped.seed,
        reason: skipped.reason,
        fingerprint: skipped.fingerprint,
      };
    },
  );
  const expected = plan.match.pair_seeds.map(
    (seed) => buildSearchWasmOpening(seed).fingerprint,
  );
  if (
    searchWasmCanonicalJson(openingPolicy.pair_seeds) !==
      searchWasmCanonicalJson(plan.match.pair_seeds) ||
    searchWasmCanonicalJson(evidence.selectedSeeds) !==
      searchWasmCanonicalJson(plan.match.pair_seeds) ||
    searchWasmCanonicalJson(openingPolicy.opening_fingerprints) !==
      searchWasmCanonicalJson(expected) ||
    searchWasmCanonicalJson(evidence.selectedFingerprints) !==
      searchWasmCanonicalJson(expected) ||
    searchWasmCanonicalJson(outerSkipped) !==
      searchWasmCanonicalJson(evidence.skippedSeeds) ||
    expected.some((fingerprint) => evidence.fingerprints.has(fingerprint))
  ) {
    fail("outer opening preflight differs from generated paired openings");
  }
}

function resultHalfpoints(result: CandidateResult): number {
  if (result === "win") return 2;
  if (result === "draw") return 1;
  return 0;
}

function pairBody(
  planSha256: string,
  pairIndex: number,
  seed: number,
  openingFingerprint: string,
  games: readonly [SearchWasmGameReceipt, SearchWasmGameReceipt],
): Omit<SearchWasmPairReceipt, "receipt_sha256"> {
  return {
    schema: SEARCH_WASM_PAIR_SCHEMA,
    plan_sha256: planSha256,
    pair_index: pairIndex,
    seed,
    opening_fingerprint: openingFingerprint,
    games,
    candidate_halfpoints:
      resultHalfpoints(games[0].candidate_result) +
      resultHalfpoints(games[1].candidate_result),
    technical_fault: false,
  };
}

function sealPair(
  planSha256: string,
  pairIndex: number,
  seed: number,
  openingFingerprint: string,
  games: readonly [SearchWasmGameReceipt, SearchWasmGameReceipt],
): Readonly<SearchWasmPairReceipt> {
  const body = pairBody(planSha256, pairIndex, seed, openingFingerprint, games);
  return Object.freeze({
    ...body,
    receipt_sha256: digest(PAIR_DIGEST_DOMAIN, body),
  });
}

function captureGame(value: unknown, gameIndex: 0 | 1): SearchWasmGameReceipt {
  const game = exactRecord(
    value,
    [
      "candidate_color",
      "candidate_result",
      "game_index",
      "legal_moves_checked",
      "plies",
      "termination",
    ],
    `pair game ${gameIndex}`,
  );
  const expectedColor = gameIndex === 0 ? "sente" : "gote";
  if (
    game.game_index !== gameIndex ||
    game.candidate_color !== expectedColor ||
    !["win", "draw", "loss"].includes(game.candidate_result as string) ||
    ![
      "no-legal-moves",
      "fourfold-repetition",
      "perpetual-check",
      "max-plies",
    ].includes(game.termination as string) ||
    !Number.isSafeInteger(game.plies) ||
    (game.plies as number) < SEARCH_WASM_OPENING_PLIES ||
    (game.plies as number) > SEARCH_WASM_MAX_PLIES ||
    !Number.isSafeInteger(game.legal_moves_checked) ||
    game.legal_moves_checked !==
      (game.plies as number) - SEARCH_WASM_OPENING_PLIES
  ) {
    fail(`pair game ${gameIndex} is invalid`);
  }
  return Object.freeze({
    game_index: gameIndex,
    candidate_color: expectedColor,
    candidate_result: game.candidate_result as CandidateResult,
    termination: game.termination as SearchWasmGameReceipt["termination"],
    plies: game.plies as number,
    legal_moves_checked: game.legal_moves_checked as number,
  });
}

function capturePair(
  value: unknown,
  plan: Readonly<SearchWasmPlan>,
  planSha256: string,
): Readonly<SearchWasmPairReceipt> {
  const pair = exactRecord(
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
    pair.schema !== SEARCH_WASM_PAIR_SCHEMA ||
    pair.plan_sha256 !== planSha256 ||
    !Number.isSafeInteger(pair.pair_index) ||
    (pair.pair_index as number) < 0 ||
    (pair.pair_index as number) >= SEARCH_WASM_PAIRS ||
    pair.technical_fault !== false ||
    typeof pair.receipt_sha256 !== "string" ||
    !SHA256_RE.test(pair.receipt_sha256)
  ) {
    fail("pair receipt header is invalid");
  }
  const pairIndex = pair.pair_index as number;
  const seed = plan.match.pair_seeds[pairIndex];
  const openingFingerprint = buildSearchWasmOpening(seed).fingerprint;
  if (
    pair.seed !== seed ||
    pair.opening_fingerprint !== openingFingerprint ||
    !Array.isArray(pair.games) ||
    pair.games.length !== 2
  ) {
    fail("pair receipt binding differs from the plan");
  }
  const games = Object.freeze([
    captureGame(pair.games[0], 0),
    captureGame(pair.games[1], 1),
  ]) as SearchWasmPairReceipt["games"];
  const body = pairBody(planSha256, pairIndex, seed, openingFingerprint, games);
  if (
    pair.candidate_halfpoints !== body.candidate_halfpoints ||
    pair.receipt_sha256 !== digest(PAIR_DIGEST_DOMAIN, body)
  ) {
    fail("pair receipt digest differs");
  }
  return Object.freeze({ ...body, receipt_sha256: pair.receipt_sha256 });
}

export function analyzeSearchWasmScreen(
  plan: Readonly<SearchWasmPlan>,
  planSha256: string,
  pairValues: readonly unknown[],
  options: Readonly<{
    readonly stop_reason?: StopReason;
    readonly technical_fault_count?: number;
  }> = {},
): Readonly<SearchWasmScreenResult> {
  const pairs = pairValues
    .map((value) => capturePair(value, plan, planSha256))
    .sort((a, b) => a.pair_index - b.pair_index);
  if (new Set(pairs.map((pair) => pair.pair_index)).size !== pairs.length) {
    fail("pair indices repeat");
  }
  const openingUnique =
    new Set(pairs.map((pair) => pair.opening_fingerprint)).size ===
    pairs.length;
  if (!openingUnique) fail("observed opening fingerprints repeat");
  const completed = new Set(pairs.map((pair) => pair.pair_index));
  const missing = Array.from(
    { length: SEARCH_WASM_PAIRS },
    (_, index) => index,
  ).filter((index) => !completed.has(index));
  const games = pairs.flatMap((pair) => pair.games);
  const wins = games.filter((game) => game.candidate_result === "win").length;
  const draws = games.filter((game) => game.candidate_result === "draw").length;
  const losses = games.length - wins - draws;
  const halfpoints = pairs.reduce(
    (sum, pair) => sum + pair.candidate_halfpoints,
    0,
  );
  const maximum = halfpoints + missing.length * 4;
  const technicalFaults = options.technical_fault_count ?? 0;
  if (!Number.isSafeInteger(technicalFaults) || technicalFaults < 0) {
    fail("technical fault count is invalid");
  }
  const stopReason = options.stop_reason ?? "none";
  let status: SearchWasmScreenResult["status"];
  let decision: SearchWasmScreenResult["decision"] = "no-conclusion";
  let conclusion = false;
  if (technicalFaults > 0 || stopReason === "technical-fault") {
    status = "FAIL-closed-technical-fault";
  } else if (stopReason === "wall-clock") {
    status = "STOP-wall-clock-no-conclusion";
  } else if (missing.length === 0) {
    status =
      halfpoints >= SEARCH_WASM_PASS_HALFPOINTS ? "PASS" : "REJECTED-complete";
    decision = status === "PASS" ? "pass" : "reject";
    conclusion = true;
  } else if (maximum < SEARCH_WASM_PASS_HALFPOINTS) {
    status = "REJECTED-futility";
    decision = "reject";
    conclusion = true;
  } else {
    status = "FAIL-closed-incomplete";
  }
  const body = {
    schema: SEARCH_WASM_RESULT_SCHEMA,
    plan_sha256: planSha256,
    experiment_id: plan.experiment_id,
    status,
    decision,
    strength_conclusion_allowed: conclusion,
    completed_pairs: pairs.length,
    completed_games: games.length,
    missing_pairs: Object.freeze(missing),
    candidate_wins: wins,
    candidate_draws: draws,
    candidate_losses: losses,
    candidate_halfpoints: halfpoints,
    score_denominator_halfpoints: SEARCH_WASM_DENOMINATOR_HALFPOINTS,
    pass_halfpoints: SEARCH_WASM_PASS_HALFPOINTS,
    maximum_possible_final_halfpoints: maximum,
    all_observed_openings_unique: openingUnique,
    all_observed_moves_legal: pairs.every((pair) =>
      pair.games.every((game) => game.legal_moves_checked >= 0),
    ),
    technical_fault_count: technicalFaults,
    wall_clock_expired: stopReason === "wall-clock",
    promotion_authorized: false as const,
    live_weight_write_authorized: false as const,
  };
  return Object.freeze({
    ...body,
    result_sha256: digest(RESULT_DIGEST_DOMAIN, body),
  });
}

function configureRuntime(
  wasmPath: string,
  weightsPath: string,
  plan: Readonly<SearchWasmPlan>,
  role: "candidate" | "production",
): NnueSearchWasm {
  const wasm = loadShogiWasm(wasmPath) as NnueSearchWasm;
  const weights = readFileSync(weightsPath);
  const detectedBuckets = bucketsForByteLength(weights.byteLength);
  if (detectedBuckets !== plan.assets.weights.buckets) {
    fail("shared weights bucket count differs from the plan");
  }
  wasm.setNnueBuckets(detectedBuckets);
  if (wasm.getNnueWeightsSize() !== weights.byteLength) {
    fail("WASM NNUE memory size differs from the shared weights");
  }
  new Uint8Array(
    wasm.memory.buffer,
    wasm.getNnueWeightsPtr(),
    weights.byteLength,
  ).set(weights);
  wasm.setNnueScaleK(plan.match.scale_k);
  wasm.setNnueOutputScale(plan.match.scale_numer, plan.match.scale_denom);
  wasm.setNnueEnabled(1);
  configureSearchWasmResearchToggle(wasm, role);
  return wasm;
}

function candidatePerspectiveResult(
  winner: number | null,
  candidateIsSente: boolean,
): CandidateResult {
  if (winner === null) return "draw";
  const candidateSide = candidateIsSente ? SENTE : GOTE;
  return winner === candidateSide ? "win" : "loss";
}

export function searchWasmRepetitionOutcome(
  occurrenceIndices: readonly number[],
  traces: readonly Readonly<SearchWasmMoveTrace>[],
): Readonly<{
  readonly termination: "fourfold-repetition" | "perpetual-check";
  readonly loser: typeof SENTE | typeof GOTE | null;
}> | null {
  if (occurrenceIndices.length < 4) return null;
  const start = occurrenceIndices[occurrenceIndices.length - 4];
  const end = occurrenceIndices[occurrenceIndices.length - 1];
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > traces.length
  ) {
    fail("repetition trace indices are invalid");
  }
  const interval = traces.slice(start, end);
  const perpetual = ([SENTE, GOTE] as const).filter((color) => {
    const moves = interval.filter((trace) => trace.mover === color);
    return moves.length > 0 && moves.every((trace) => trace.gave_check);
  });
  if (perpetual.length === 1) {
    return Object.freeze({
      termination: "perpetual-check" as const,
      loser: perpetual[0],
    });
  }
  return Object.freeze({
    termination: "fourfold-repetition" as const,
    loser: null,
  });
}

function playGame(
  candidate: NnueSearchWasm,
  production: NnueSearchWasm,
  candidateIsSente: boolean,
  opening: Readonly<Opening>,
  gameIndex: 0 | 1,
): Readonly<SearchWasmGameReceipt> {
  candidate.clearTT();
  production.clearTT();
  const position = new KyokumenImproved();
  position.initHirate();
  position.setTeban(SENTE);
  for (const stored of opening.moves) {
    const move = stored.clone();
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
  }
  const traces: SearchWasmMoveTrace[] = [];
  const repetition = new Map<string, number[]>();
  repetition.set(`${position.HashVal}:${position.teban}`, [0]);
  let legalMovesChecked = 0;
  for (
    let ply = SEARCH_WASM_OPENING_PLIES;
    ply < SEARCH_WASM_MAX_PLIES;
    ply += 1
  ) {
    const legalMoves = GenerateMovesImproved.generateLegalMoves(position);
    if (legalMoves.length === 0) {
      return Object.freeze({
        game_index: gameIndex,
        candidate_color: candidateIsSente ? "sente" : "gote",
        candidate_result: candidatePerspectiveResult(
          position.teban === SENTE ? GOTE : SENTE,
          candidateIsSente,
        ),
        termination: "no-legal-moves",
        plies: ply,
        legal_moves_checked: legalMovesChecked,
      });
    }
    const candidateToMove = candidateIsSente
      ? position.teban === SENTE
      : position.teban === GOTE;
    const mover = position.teban;
    const player = candidateToMove ? candidate : production;
    syncWasm(player, position);
    player.setRootTesu(ply);
    const key = player.searchBestMove(
      SEARCH_WASM_MOVE_MS,
      SEARCH_WASM_SEARCH_DEPTH,
      SEARCH_WASM_QUIESCENCE_DEPTH,
    );
    if (key === 0) {
      fail(
        `${candidateToMove ? "candidate" : "production"} returned no move with legal moves available`,
      );
    }
    const move = teFromWasmKey(key, position);
    const legal = legalMoves.some(
      (candidateMove) =>
        candidateMove.koma === move.koma &&
        candidateMove.from === move.from &&
        candidateMove.to === move.to &&
        candidateMove.promote === move.promote,
    );
    if (!legal) {
      fail(
        `${candidateToMove ? "candidate" : "production"} returned an illegal move at ply ${ply}`,
      );
    }
    legalMovesChecked += 1;
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
    const repetitionKey = `${position.HashVal}:${position.teban}`;
    const occurrenceIndices = repetition.get(repetitionKey) ?? [];
    occurrenceIndices.push(traces.length);
    repetition.set(repetitionKey, occurrenceIndices);
    const repetitionResult = searchWasmRepetitionOutcome(
      occurrenceIndices,
      traces,
    );
    if (repetitionResult !== null) {
      const winner =
        repetitionResult.loser === null
          ? null
          : repetitionResult.loser === SENTE
            ? GOTE
            : SENTE;
      return Object.freeze({
        game_index: gameIndex,
        candidate_color: candidateIsSente ? "sente" : "gote",
        candidate_result: candidatePerspectiveResult(winner, candidateIsSente),
        termination: repetitionResult.termination,
        plies: ply + 1,
        legal_moves_checked: legalMovesChecked,
      });
    }
  }
  return Object.freeze({
    game_index: gameIndex,
    candidate_color: candidateIsSente ? "sente" : "gote",
    candidate_result: "draw",
    termination: "max-plies",
    plies: SEARCH_WASM_MAX_PLIES,
    legal_moves_checked: legalMovesChecked,
  });
}

function runPairWorker(
  loaded: ReturnType<typeof loadSearchWasmPlan>,
  pairIndex: number,
): Readonly<SearchWasmPairReceipt> {
  if (
    !Number.isSafeInteger(pairIndex) ||
    pairIndex < 0 ||
    pairIndex >= SEARCH_WASM_PAIRS
  ) {
    fail("worker pair index is invalid");
  }
  const candidatePath = authenticateAsset(
    loaded.plan.assets.candidate_wasm,
    "candidate WASM",
  );
  const productionPath = authenticateAsset(
    loaded.plan.assets.production_wasm,
    "production WASM",
  );
  const weightsPath = authenticateAsset(
    loaded.plan.assets.weights,
    "shared weights",
  );
  const candidate = configureRuntime(
    candidatePath,
    weightsPath,
    loaded.plan,
    "candidate",
  );
  const production = configureRuntime(
    productionPath,
    weightsPath,
    loaded.plan,
    "production",
  );
  const seed = loaded.plan.match.pair_seeds[pairIndex];
  const opening = buildSearchWasmOpening(seed);
  const games = Object.freeze([
    playGame(candidate, production, true, opening, 0),
    playGame(candidate, production, false, opening, 1),
  ]) as SearchWasmPairReceipt["games"];
  verifySearchWasmResearchToggle(candidate, production);
  authenticateAsset(
    loaded.plan.assets.candidate_wasm,
    "candidate WASM postflight",
  );
  authenticateAsset(
    loaded.plan.assets.production_wasm,
    "production WASM postflight",
  );
  authenticateAsset(loaded.plan.assets.weights, "shared weights postflight");
  authenticateAsset(loaded.evidenceAsset, "opening evidence postflight");
  authenticateLoadedPlan(loaded, "outer plan postflight");
  return sealPair(loaded.sha256, pairIndex, seed, opening.fingerprint, games);
}

function atomicWrite(path: string, value: unknown): void {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${searchWasmCanonicalJson(value)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function atomicCreate(path: string, value: unknown): void {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${searchWasmCanonicalJson(value)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    linkSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function writeOnce(path: string, value: unknown, label: string): void {
  if (!existsSync(path)) {
    atomicCreate(path, value);
    return;
  }
  let existing: unknown;
  try {
    existing = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new SearchWasmVsProductionError(`${label} JSON is invalid`, {
      cause,
    });
  }
  if (searchWasmCanonicalJson(existing) !== searchWasmCanonicalJson(value)) {
    fail(`${label} is immutable and differs`);
  }
}

function isStrictDescendant(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path.length > 0 &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

export function validateSearchWasmOutputDir(
  outputDirValue: string,
  assets: Readonly<SearchWasmPlan["assets"]>,
): string {
  if (!isAbsolute(outputDirValue) || outputDirValue.includes("\0")) {
    fail("--output-dir must be an absolute research-only path");
  }
  const researchRootValue = resolve(
    homedir(),
    ...RESEARCH_OUTPUT_ROOT_COMPONENTS,
  );
  mkdirSync(researchRootValue, { recursive: true });
  const researchRoot = realpathSync(researchRootValue);
  const repoRoot = repositoryRoot();
  if (
    researchRoot === repoRoot ||
    isStrictDescendant(repoRoot, researchRoot) ||
    isStrictDescendant(researchRoot, repoRoot)
  ) {
    fail("fixed research-only output root collides with the repository");
  }
  const requested = resolve(outputDirValue);
  const relativeName = relative(researchRoot, requested);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(relativeName) ||
    relativeName.includes(sep)
  ) {
    fail(
      "--output-dir must be one named run directly below ~/.codex/shogi-runs",
    );
  }
  mkdirSync(requested, { recursive: true });
  const outputDir = realpathSync(requested);
  if (
    !isStrictDescendant(researchRoot, outputDir) ||
    relative(researchRoot, outputDir).includes(sep)
  ) {
    fail("--output-dir escaped the fixed research-only root");
  }
  for (const asset of [
    assets.runner,
    assets.candidate_wasm,
    assets.production_wasm,
    assets.weights,
  ]) {
    const authenticatedPath = assetPath(asset.path);
    if (
      outputDir === authenticatedPath ||
      isStrictDescendant(outputDir, authenticatedPath) ||
      isStrictDescendant(authenticatedPath, outputDir)
    ) {
      fail("--output-dir collides with a planned immutable asset");
    }
  }
  return outputDir;
}

function captureRunReceipt(
  value: unknown,
  planSha256: string,
): Readonly<SearchWasmRunReceipt> {
  const run = exactRecord(
    value,
    [
      "deadline_at_ms",
      "plan_sha256",
      "schema",
      "started_at_ms",
      "wall_clock_limit_seconds",
    ],
    "durable run receipt",
  );
  if (
    run.schema !== SEARCH_WASM_RUN_SCHEMA ||
    run.plan_sha256 !== planSha256 ||
    !Number.isSafeInteger(run.started_at_ms) ||
    (run.started_at_ms as number) < 0 ||
    run.wall_clock_limit_seconds !== SEARCH_WASM_WALL_SECONDS ||
    !Number.isSafeInteger(run.deadline_at_ms) ||
    run.deadline_at_ms !==
      (run.started_at_ms as number) + SEARCH_WASM_WALL_SECONDS * 1_000
  ) {
    fail("durable run receipt is invalid");
  }
  return Object.freeze({
    schema: SEARCH_WASM_RUN_SCHEMA,
    plan_sha256: planSha256,
    started_at_ms: run.started_at_ms as number,
    wall_clock_limit_seconds: SEARCH_WASM_WALL_SECONDS,
    deadline_at_ms: run.deadline_at_ms as number,
  });
}

export function initializeSearchWasmRun(
  outputDir: string,
  planSha256: string,
  nowMs: number = Date.now(),
): Readonly<SearchWasmRunReceipt> {
  if (!SHA256_RE.test(planSha256)) fail("run plan SHA-256 is invalid");
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    fail("run start time is invalid");
  }
  const path = resolve(outputDir, "run.json");
  if (existsSync(path)) {
    return captureRunReceipt(
      JSON.parse(readFileSync(path, "utf8")),
      planSha256,
    );
  }
  const body: SearchWasmRunReceipt = {
    schema: SEARCH_WASM_RUN_SCHEMA,
    plan_sha256: planSha256,
    started_at_ms: nowMs,
    wall_clock_limit_seconds: SEARCH_WASM_WALL_SECONDS,
    deadline_at_ms: nowMs + SEARCH_WASM_WALL_SECONDS * 1_000,
  };
  if (!Number.isSafeInteger(body.deadline_at_ms)) {
    fail("run deadline is invalid");
  }
  atomicCreate(path, body);
  return captureRunReceipt(JSON.parse(readFileSync(path, "utf8")), planSha256);
}

function readDurablePairs(
  outputDir: string,
  plan: Readonly<SearchWasmPlan>,
  planSha256: string,
): Map<number, Readonly<SearchWasmPairReceipt>> {
  const pairsDir = resolve(outputDir, "pairs");
  mkdirSync(pairsDir, { recursive: true });
  const results = new Map<number, Readonly<SearchWasmPairReceipt>>();
  for (const name of readdirSync(pairsDir).sort()) {
    const match = PAIR_FILE_RE.exec(name);
    if (!match) fail(`unexpected durable pair namespace entry: ${name}`);
    const value = JSON.parse(readFileSync(resolve(pairsDir, name), "utf8"));
    const pair = capturePair(value, plan, planSha256);
    if (name !== `pair-${String(pair.pair_index).padStart(4, "0")}.json`) {
      fail("durable pair filename differs from its receipt");
    }
    if (results.has(pair.pair_index)) fail("durable pair index repeats");
    results.set(pair.pair_index, pair);
  }
  return results;
}

function spawnPairWorker(
  planPath: string,
  planSha256: string,
  pairIndex: number,
): WorkerHandle {
  const child = spawn(
    process.execPath,
    [
      "-r",
      require.resolve("tsx/cjs"),
      __filename,
      "--worker",
      "--plan",
      planPath,
      "--plan-sha",
      planSha256,
      "--pair-index",
      String(pairIndex),
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "" },
    },
  );
  const promise = new Promise<Readonly<SearchWasmPairReceipt>>(
    (resolvePromise, rejectPromise) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", rejectPromise);
      child.once("close", (code, signal) => {
        if (code !== 0 || signal !== null || stderr.length > 0) {
          rejectPromise(
            new SearchWasmVsProductionError(
              `pair ${pairIndex} worker faulted: code=${String(code)} signal=${String(signal)} stderr=${Buffer.concat(stderr).toString("utf8")}`,
            ),
          );
          return;
        }
        try {
          const value = JSON.parse(Buffer.concat(stdout).toString("utf8"));
          resolvePromise(value as SearchWasmPairReceipt);
        } catch (cause) {
          rejectPromise(
            new SearchWasmVsProductionError(
              `pair ${pairIndex} worker output is invalid`,
              { cause },
            ),
          );
        }
      });
    },
  );
  return { pairIndex, child, promise };
}

async function stopWorkers(
  running: ReadonlyMap<number, WorkerHandle>,
): Promise<void> {
  for (const worker of running.values()) worker.child.kill("SIGTERM");
  await Promise.allSettled(
    [...running.values()].map((worker) => worker.promise),
  );
}

const FAULT_KINDS = [
  "asset-postflight",
  "coordinator-runtime",
  "duplicate-opening",
  "pair-receipt",
  "worker-process",
] as const;

type FaultKind = (typeof FAULT_KINDS)[number];

function faultEvidenceSha256(error: unknown): string {
  const description =
    error instanceof Error
      ? `${error.name}\0${error.message}`
      : `${typeof error}\0${String(error)}`;
  return sha256(
    `shogi-search-wasm-vs-production-fault-evidence-v1\0${description}`,
  );
}

function writeDurableFault(
  path: string,
  planSha256: string,
  pairIndex: number | null,
  errorKind: FaultKind,
  error: unknown,
): void {
  writeOnce(
    path,
    {
      schema: SEARCH_WASM_FAULT_SCHEMA,
      plan_sha256: planSha256,
      pair_index: pairIndex,
      error_kind: errorKind,
      error_sha256: faultEvidenceSha256(error),
      technical_fault_count: 1,
      strength_conclusion_allowed: false,
      selective_continuation_authorized: false,
    },
    "durable fault receipt",
  );
}

function validateDurableFault(path: string, planSha256: string): void {
  const fault = exactRecord(
    JSON.parse(readFileSync(path, "utf8")),
    [
      "error_kind",
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
  const pairIndexValid =
    fault.pair_index === null ||
    (Number.isSafeInteger(fault.pair_index) &&
      (fault.pair_index as number) >= 0 &&
      (fault.pair_index as number) < SEARCH_WASM_PAIRS);
  if (
    fault.schema !== SEARCH_WASM_FAULT_SCHEMA ||
    fault.plan_sha256 !== planSha256 ||
    !pairIndexValid ||
    !FAULT_KINDS.includes(fault.error_kind as FaultKind) ||
    typeof fault.error_sha256 !== "string" ||
    !SHA256_RE.test(fault.error_sha256) ||
    fault.technical_fault_count !== 1 ||
    fault.strength_conclusion_allowed !== false ||
    fault.selective_continuation_authorized !== false
  ) {
    fail("durable fault receipt is invalid");
  }
}

function validateDurableWallStop(
  path: string,
  planSha256: string,
  run: Readonly<SearchWasmRunReceipt>,
): void {
  const wallStop = exactRecord(
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
    wallStop.schema !== SEARCH_WASM_WALL_STOP_SCHEMA ||
    wallStop.plan_sha256 !== planSha256 ||
    wallStop.run_started_at_ms !== run.started_at_ms ||
    wallStop.deadline_at_ms !== run.deadline_at_ms ||
    !Number.isSafeInteger(wallStop.observed_at_ms) ||
    (wallStop.observed_at_ms as number) < run.deadline_at_ms ||
    wallStop.wall_clock_expired !== true ||
    wallStop.strength_conclusion_allowed !== false ||
    wallStop.selective_continuation_authorized !== false
  ) {
    fail("durable wall-stop receipt is invalid");
  }
}

export async function runSearchWasmCoordinator(
  loaded: ReturnType<typeof loadSearchWasmPlan>,
  outputDirValue: string,
): Promise<Readonly<SearchWasmScreenResult>> {
  const outputDir = validateSearchWasmOutputDir(
    outputDirValue,
    loaded.plan.assets,
  );
  const run = initializeSearchWasmRun(outputDir, loaded.sha256);
  const faultPath = resolve(outputDir, "fault.json");
  const wallStopPath = resolve(outputDir, "wall-stop.json");
  const resultPath = resolve(outputDir, "result.json");
  const results = readDurablePairs(outputDir, loaded.plan, loaded.sha256);
  if (existsSync(faultPath)) {
    validateDurableFault(faultPath, loaded.sha256);
    const stopped = analyzeSearchWasmScreen(
      loaded.plan,
      loaded.sha256,
      [...results.values()],
      { stop_reason: "technical-fault", technical_fault_count: 1 },
    );
    writeOnce(resultPath, stopped, "terminal result");
    return stopped;
  }
  if (existsSync(wallStopPath)) {
    validateDurableWallStop(wallStopPath, loaded.sha256, run);
    const stopped = analyzeSearchWasmScreen(
      loaded.plan,
      loaded.sha256,
      [...results.values()],
      { stop_reason: "wall-clock" },
    );
    writeOnce(resultPath, stopped, "terminal result");
    return stopped;
  }
  let analysis = analyzeSearchWasmScreen(loaded.plan, loaded.sha256, [
    ...results.values(),
  ]);
  if (
    analysis.status === "PASS" ||
    analysis.status === "REJECTED-complete" ||
    analysis.status === "REJECTED-futility"
  ) {
    writeOnce(resultPath, analysis, "terminal result");
    return analysis;
  }
  if (existsSync(resultPath)) {
    fail("terminal result exists without matching terminal evidence");
  }
  const pending = analysis.missing_pairs.slice();
  const running = new Map<number, WorkerHandle>();
  let technicalFaults = 0;
  let wallExpired = Date.now() >= run.deadline_at_ms;
  let futility = false;
  const deadline = run.deadline_at_ms;
  let activePairIndex: number | null = null;

  const fill = (): void => {
    while (
      !wallExpired &&
      technicalFaults === 0 &&
      !futility &&
      running.size < SEARCH_WASM_PAIR_WORKERS &&
      pending.length > 0
    ) {
      const pairIndex = pending.shift();
      if (pairIndex === undefined) break;
      running.set(
        pairIndex,
        spawnPairWorker(loaded.path, loaded.sha256, pairIndex),
      );
    }
  };

  try {
    fill();
    while (running.size > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        wallExpired = true;
        break;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const wall = new Promise<{ readonly kind: "wall" }>((resolvePromise) => {
        timer = setTimeout(() => resolvePromise({ kind: "wall" }), remaining);
      });
      const completed = [...running.values()].map((worker) =>
        worker.promise.then(
          (pair) => ({ kind: "pair" as const, worker, pair }),
          (error: unknown) => ({
            kind: "fault" as const,
            worker,
            error,
          }),
        ),
      );
      const outcome = await Promise.race([...completed, wall]);
      if (timer !== undefined) clearTimeout(timer);
      if (outcome.kind === "wall") {
        wallExpired = true;
        break;
      }
      activePairIndex = outcome.worker.pairIndex;
      running.delete(outcome.worker.pairIndex);
      if (outcome.kind === "fault") {
        technicalFaults += 1;
        writeDurableFault(
          faultPath,
          loaded.sha256,
          outcome.worker.pairIndex,
          "worker-process",
          outcome.error,
        );
        break;
      }
      let pair: Readonly<SearchWasmPairReceipt>;
      try {
        pair = capturePair(outcome.pair, loaded.plan, loaded.sha256);
      } catch (error) {
        technicalFaults += 1;
        writeDurableFault(
          faultPath,
          loaded.sha256,
          outcome.worker.pairIndex,
          "pair-receipt",
          error,
        );
        break;
      }
      if (
        [...results.values()].some(
          (prior) => prior.opening_fingerprint === pair.opening_fingerprint,
        )
      ) {
        technicalFaults += 1;
        writeDurableFault(
          faultPath,
          loaded.sha256,
          pair.pair_index,
          "duplicate-opening",
          "observed opening fingerprint repeats",
        );
        break;
      }
      atomicWrite(
        resolve(
          outputDir,
          "pairs",
          `pair-${String(pair.pair_index).padStart(4, "0")}.json`,
        ),
        pair,
      );
      results.set(pair.pair_index, pair);
      analysis = analyzeSearchWasmScreen(loaded.plan, loaded.sha256, [
        ...results.values(),
      ]);
      futility = analysis.status === "REJECTED-futility";
      activePairIndex = null;
      if (futility) break;
      fill();
    }
  } catch (error) {
    technicalFaults = 1;
    writeDurableFault(
      faultPath,
      loaded.sha256,
      activePairIndex,
      "coordinator-runtime",
      error,
    );
  } finally {
    if (running.size > 0) await stopWorkers(running);
  }
  if (wallExpired && technicalFaults === 0) {
    const observedAtMs = Math.max(Date.now(), run.deadline_at_ms);
    writeOnce(
      wallStopPath,
      {
        schema: SEARCH_WASM_WALL_STOP_SCHEMA,
        plan_sha256: loaded.sha256,
        run_started_at_ms: run.started_at_ms,
        deadline_at_ms: run.deadline_at_ms,
        observed_at_ms: observedAtMs,
        wall_clock_expired: true,
        strength_conclusion_allowed: false,
        selective_continuation_authorized: false,
      },
      "durable wall-stop receipt",
    );
  }
  const stopReason: StopReason =
    technicalFaults > 0
      ? "technical-fault"
      : wallExpired
        ? "wall-clock"
        : "none";
  analysis = analyzeSearchWasmScreen(
    loaded.plan,
    loaded.sha256,
    [...results.values()],
    { stop_reason: stopReason, technical_fault_count: technicalFaults },
  );
  try {
    authenticateLoadedPlan(loaded, "outer plan postflight");
    authenticateAsset(loaded.plan.assets.runner, "runner postflight");
    authenticateAsset(
      loaded.plan.assets.candidate_wasm,
      "candidate WASM postflight",
    );
    authenticateAsset(
      loaded.plan.assets.production_wasm,
      "production WASM postflight",
    );
    authenticateAsset(loaded.plan.assets.weights, "shared weights postflight");
    authenticateAsset(loaded.evidenceAsset, "opening evidence postflight");
  } catch (error) {
    writeDurableFault(
      faultPath,
      loaded.sha256,
      null,
      "asset-postflight",
      error,
    );
    analysis = analyzeSearchWasmScreen(
      loaded.plan,
      loaded.sha256,
      [...results.values()],
      { stop_reason: "technical-fault", technical_fault_count: 1 },
    );
  }
  if (analysis.status === "FAIL-closed-incomplete") {
    fail("coordinator stopped without terminal evidence");
  }
  writeOnce(resultPath, analysis, "terminal result");
  return analysis;
}

interface Cli {
  readonly worker: boolean;
  readonly plan: string;
  readonly planSha256: string;
  readonly outputDir: string | null;
  readonly pairIndex: number | null;
}

export function parseSearchWasmCli(argv: readonly string[]): Readonly<Cli> {
  const values = new Map<string, string>();
  let worker = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--worker") {
      if (worker) fail("--worker repeats");
      worker = true;
      continue;
    }
    if (
      !["--plan", "--plan-sha", "--output-dir", "--pair-index"].includes(
        argument,
      )
    ) {
      fail(`unknown CLI argument: ${argument}`);
    }
    if (values.has(argument)) fail(`${argument} repeats`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`${argument} requires a value`);
    }
    values.set(argument, value);
    index += 1;
  }
  const plan = values.get("--plan");
  const planSha256 = values.get("--plan-sha");
  if (plan === undefined || planSha256 === undefined) {
    fail("--plan and --plan-sha are required");
  }
  if (!worker) {
    if (values.has("--pair-index") || !values.has("--output-dir")) {
      fail("coordinator requires --output-dir and forbids --pair-index");
    }
  } else if (values.has("--output-dir") || !values.has("--pair-index")) {
    fail("worker requires --pair-index and forbids --output-dir");
  }
  const pairIndexText = values.get("--pair-index");
  const pairIndex =
    pairIndexText === undefined || !/^(?:0|[1-9]\d*)$/u.test(pairIndexText)
      ? null
      : Number(pairIndexText);
  if (worker && pairIndex === null) fail("--pair-index is invalid");
  return Object.freeze({
    worker,
    plan,
    planSha256,
    outputDir: values.get("--output-dir") ?? null,
    pairIndex,
  });
}

export async function searchWasmVsProductionMain(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const cli = parseSearchWasmCli(argv);
  const loaded = loadSearchWasmPlan(cli.plan, cli.planSha256);
  if (cli.worker) {
    const pair = runPairWorker(loaded, cli.pairIndex as number);
    process.stdout.write(`${searchWasmCanonicalJson(pair)}\n`);
    return;
  }
  const result = await runSearchWasmCoordinator(
    loaded,
    cli.outputDir as string,
  );
  process.stdout.write(`${searchWasmCanonicalJson(result)}\n`);
  if (
    result.status === "FAIL-closed-technical-fault" ||
    result.status === "FAIL-closed-incomplete"
  ) {
    process.exitCode = 1;
  } else if (result.status === "STOP-wall-clock-no-conclusion") {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  void searchWasmVsProductionMain().catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
