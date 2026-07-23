/**
 * Deterministic HalfKP81 self-play generator.
 *
 * Production generation requires an immutable opening corpus. Each canonical
 * JSONL row has one of these exact required schemas (additional canonical
 * metadata is allowed and remains covered by the corpus SHA-256):
 *
 *   {"game_id":"...","opening_id":"...","sfen":"..."}
 *   {"game_id":"...","parent_sfen":"...","position_id":"sha256:..."}
 *
 * The second form directly accepts the authenticated Floodgate
 * training.raw.jsonl rows. The ordinary opening form is ply 6..10; the
 * Floodgate parent form is a legal strong-game starting position at ply
 * 6..119. Cycle zero uses one distinct row per game. Color-exchange pairing
 * belongs to a later actor-vs-actor evaluation lane, not deterministic
 * self-self generation.
 *
 * Self-play uses a shallow fixed-depth search. Only after the game finishes,
 * every retained sample is re-searched from an empty TT by a second instance
 * of the same pinned model at a deeper fixed depth. No wall-clock deadline,
 * opening book, random in-game move, or fallback move is used.
 *
 * Twenty-game wiring smoke (test-only openings, never training-eligible):
 *
 *   node -r tsx/cjs ml/generate-nnue-selfplay.ts \
 *     --weights /absolute/path/to/weights.bin --weights-sha <sha256> \
 *     --wasm wasm-spike/artifacts/shogi-halfkp81-research.wasm \
 *     --wasm-sha <sha256> --expected-buckets 81 \
 *     --out-dir /tmp/shogi-nnue-selfplay-smoke-v1 \
 *     --cycle 0 --game-start 0 --games 20 --workers 2 --seed 100000 \
 *     --play-depth 2 --label-depth 4 --allow-test-curated-openings
 */

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { TextDecoder } from "node:util";

import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { InitialPositionImproved } from "../src/components/game/ShogiImproved/InitialPositionImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import {
  EMPTY,
  FU,
  GOTE,
  KA,
  KE,
  KI,
  KY,
  GI,
  HI,
  OU,
  SENTE,
  Te,
  getKomashu,
} from "../src/components/game/ShogiImproved/types";
import {
  canonicalPositionSfen,
  compareBytewise,
  positionKeyFromSfen,
} from "./sibling-data";
import { positionFromSfen, teToUsi } from "./shogi-sfen";
import { toSfen } from "./shogi-sfen-codec";
import {
  NNUE_HALFKP_BUCKETS,
  bucketsForByteLength,
  mulberry32,
} from "../wasm-spike/nnue-ref";
import {
  syncWasm,
  teFromWasmKey,
  type ShogiSearchWasm,
} from "../wasm-spike/search-driver";

export const NNUE_SELFPLAY_GAME_SCHEMA = "shogi-nnue-selfplay-game-v1" as const;
export const NNUE_SELFPLAY_POSITION_SCHEMA =
  "shogi-nnue-selfplay-position-v1" as const;
export const NNUE_SELFPLAY_SHARD_MANIFEST_SCHEMA =
  "shogi-nnue-selfplay-shard-manifest-v1" as const;
export const NNUE_SELFPLAY_RUN_MANIFEST_SCHEMA =
  "shogi-nnue-selfplay-run-manifest-v1" as const;
export const NNUE_SELFPLAY_OPENING_REQUIRED_FIELDS = Object.freeze([
  "game_id",
  "opening_id",
  "sfen",
] as const);
export const NNUE_SELFPLAY_FLOODGATE_PARENT_REQUIRED_FIELDS = Object.freeze([
  "game_id",
  "parent_sfen",
  "position_id",
] as const);
export const NNUE_SELFPLAY_OPENING_CORPUS_SCHEMAS = Object.freeze({
  opening_v1: Object.freeze({
    required_fields: NNUE_SELFPLAY_OPENING_REQUIRED_FIELDS,
    sfen_field: "sfen",
    id_field: "opening_id",
    minimum_ply: 6,
    maximum_ply: 10,
  }),
  floodgate_parent_v1: Object.freeze({
    required_fields: NNUE_SELFPLAY_FLOODGATE_PARENT_REQUIRED_FIELDS,
    sfen_field: "parent_sfen",
    id_field: "position_id",
    minimum_ply: 6,
    maximum_ply: 119,
  }),
} as const);

const SHA256_RE = /^[0-9a-f]{64}$/;
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;
const WINNING_MATE_BAND = 89_990_000;
const MAX_SEARCH_SCORE = 90_000_000;
const QUIESCENCE_DEPTH = 10;
const DEFAULT_MIN_PLY = 12;
const DEFAULT_MAX_SAMPLE_PLY = 180;
const DEFAULT_SAMPLE_EVERY = 4;
const DEFAULT_MAX_SAMPLES_PER_GAME = 24;
const DEFAULT_MAX_PLIES = 256;
const TEST_OPENING_PLIES = 6;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

export interface SelfplayArgs {
  readonly weights: string;
  readonly weightsSha256: string;
  readonly wasm: string;
  readonly wasmSha256: string;
  readonly expectedBuckets: number;
  readonly openings: string | null;
  readonly openingsSha256: string | null;
  readonly allowTestCuratedOpenings: boolean;
  readonly outDir: string;
  readonly cycle: number;
  readonly gameStart: number;
  readonly games: number;
  readonly workers: number;
  readonly seed: number;
  readonly playDepth: number;
  readonly labelDepth: number;
  readonly minPly: number;
  readonly maxSamplePly: number;
  readonly sampleEvery: number;
  readonly maxSamplesPerGame: number;
  readonly maxPlies: number;
  readonly workerIndex: number | null;
}

export interface FileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface NnueSelfplayOpeningRow {
  readonly game_id: string;
  readonly opening_id: string;
  readonly sfen: string;
  readonly [key: string]: unknown;
}

export interface SelfplayOpening {
  readonly source: "pinned-corpus" | "pinned-floodgate-parent" | "test-curated";
  readonly sourceGameId: string;
  readonly openingId: string;
  readonly sfen: string;
  readonly ply: number;
}

export interface FixedDepthSearchStats {
  readonly score: number;
  readonly completedDepth: number;
  readonly nodes: number;
  readonly leaves: number;
}

export interface FixedDepthSearchResult extends FixedDepthSearchStats {
  readonly move: Te;
  readonly moveUsi: string;
}

export interface FixedDepthActor {
  clearTT(): void;
  search(
    position: KyokumenImproved,
    ply: number,
    depth: number,
  ): FixedDepthSearchResult;
}

export interface SelfplayGameConfig {
  readonly cycle: number;
  readonly globalGameIndex: number;
  readonly seed: number;
  readonly runFingerprint: string;
  readonly actorWeightsSha256: string;
  readonly playDepth: number;
  readonly labelDepth: number;
  readonly minPly: number;
  readonly maxSamplePly: number;
  readonly sampleEvery: number;
  readonly maxSamplesPerGame: number;
  readonly maxPlies: number;
  readonly opening: SelfplayOpening;
}

export interface SelfplaySampleRecord {
  readonly schema: typeof NNUE_SELFPLAY_POSITION_SCHEMA;
  readonly game_id: string;
  readonly source_game_id: string;
  readonly position_id: string;
  readonly sfen: string;
  readonly ply: number;
  readonly move: string;
  readonly cp: number;
  readonly outcome: 0 | 0.5 | 1;
  readonly actor_weights_sha256: string;
  readonly opening_id: string;
  readonly search: Readonly<{
    play_depth: number;
    label_depth: number;
    depth: number;
    nodes: number;
    leaves: number;
  }>;
  readonly result: Readonly<{
    winner: "b" | "w" | null;
    reason: SelfplayTerminalReason;
  }>;
}

export type SelfplayTerminalReason =
  "checkmate" | "no-legal-move" | "repetition" | "max-plies";

const NNUE_SELFPLAY_POSITION_FIELDS = Object.freeze([
  "actor_weights_sha256",
  "cp",
  "game_id",
  "move",
  "opening_id",
  "outcome",
  "ply",
  "position_id",
  "result",
  "schema",
  "search",
  "sfen",
  "source_game_id",
] as const);

export interface SelfplayGameEnvelope {
  readonly schema: typeof NNUE_SELFPLAY_GAME_SCHEMA;
  readonly run_fingerprint: string;
  readonly cycle: number;
  readonly game_index: number;
  readonly game_id: string;
  readonly actor_weights_sha256: string;
  readonly play_depth: number;
  readonly label_depth: number;
  readonly opening: Readonly<{
    source: SelfplayOpening["source"];
    source_game_id: string;
    opening_id: string;
    sfen: string;
    ply: number;
  }>;
  readonly result: Readonly<{
    winner: "b" | "w" | null;
    reason: SelfplayTerminalReason;
    plies: number;
  }>;
  readonly legal_moves_checked: number;
  readonly samples: readonly SelfplaySampleRecord[];
}

interface PendingSample {
  readonly sfen: string;
  readonly ply: number;
  readonly side: number;
  readonly playedMove: string;
  readonly play: FixedDepthSearchStats;
}

interface TerminalResult {
  readonly winner: number | null;
  readonly reason: SelfplayTerminalReason;
  readonly plies: number;
}

export interface NnueSelfplayWasm extends ShogiSearchWasm {
  readonly memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  getNnueBuckets(): number;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numerator: number, denominator: number): void;
  setNnueEnabled(flag: number): void;
  setNnueForceFull(flag: number): void;
}

interface RunInputs {
  readonly weightsBytes: Uint8Array;
  readonly weightsIdentity: FileIdentity;
  readonly wasmBytes: Uint8Array;
  readonly wasmIdentity: FileIdentity;
  readonly openings: readonly SelfplayOpening[] | null;
  readonly openingsIdentity: FileIdentity | null;
  readonly runFingerprint: string;
}

interface StrictCliDefinition {
  readonly values: ReadonlySet<string>;
  readonly booleans: ReadonlySet<string>;
}

const CLI_DEFINITION: StrictCliDefinition = {
  values: new Set([
    "weights",
    "weights-sha",
    "wasm",
    "wasm-sha",
    "expected-buckets",
    "openings",
    "openings-sha",
    "out-dir",
    "cycle",
    "game-start",
    "games",
    "workers",
    "seed",
    "play-depth",
    "label-depth",
    "min-ply",
    "max-sample-ply",
    "sample-every",
    "max-samples-per-game",
    "max-plies",
    "worker-index",
  ]),
  booleans: new Set(["allow-test-curated-openings"]),
};

function requireCanonicalText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} must be non-empty canonical text`);
  }
  return value;
}

function requireSha256(value: string, label: string): string {
  if (!SHA256_RE.test(value))
    throw new Error(`${label} must be a lowercase SHA-256`);
  return value;
}

function strictInteger(
  raw: string,
  flag: string,
  minimum: number,
  maximum: number,
): number {
  if (!/^(0|[1-9][0-9]*)$/.test(raw))
    throw new Error(`--${flag} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`--${flag} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

/** Strict, duplicate-rejecting CLI parser shared by the coordinator and workers. */
export function parseSelfplayArgs(argv: readonly string[]): SelfplayArgs {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--"))
      throw new Error(`unexpected positional argument: ${token}`);
    const name = token.slice(2);
    if (CLI_DEFINITION.booleans.has(name)) {
      if (booleans.has(name)) throw new Error(`duplicate option: --${name}`);
      booleans.add(name);
      continue;
    }
    if (!CLI_DEFINITION.values.has(name))
      throw new Error(`unknown option: --${name}`);
    if (values.has(name)) throw new Error(`duplicate option: --${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`--${name} requires a value`);
    }
    values.set(name, value);
    index += 1;
  }

  const required = (name: string): string => {
    const value = values.get(name);
    if (value === undefined) throw new Error(`--${name} is required`);
    return value;
  };
  const optionalInteger = (
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number =>
    strictInteger(values.get(name) ?? String(fallback), name, minimum, maximum);

  const allowTestCuratedOpenings = booleans.has("allow-test-curated-openings");
  const openings = values.get("openings") ?? null;
  const openingsSha256 = values.get("openings-sha") ?? null;
  if (allowTestCuratedOpenings) {
    if (openings !== null || openingsSha256 !== null) {
      throw new Error(
        "--allow-test-curated-openings cannot be combined with --openings/--openings-sha",
      );
    }
  } else if (openings === null || openingsSha256 === null) {
    throw new Error(
      "production generation requires both --openings and --openings-sha",
    );
  }

  const args: SelfplayArgs = {
    weights: path.resolve(required("weights")),
    weightsSha256: requireSha256(required("weights-sha"), "--weights-sha"),
    wasm: path.resolve(required("wasm")),
    wasmSha256: requireSha256(required("wasm-sha"), "--wasm-sha"),
    expectedBuckets: optionalInteger(
      "expected-buckets",
      NNUE_HALFKP_BUCKETS,
      1,
      65_535,
    ),
    openings: openings === null ? null : path.resolve(openings),
    openingsSha256:
      openingsSha256 === null
        ? null
        : requireSha256(openingsSha256, "--openings-sha"),
    allowTestCuratedOpenings,
    outDir: path.resolve(required("out-dir")),
    cycle: optionalInteger("cycle", 0, 0, 1_000_000),
    gameStart: optionalInteger("game-start", 0, 0, Number.MAX_SAFE_INTEGER),
    games: optionalInteger("games", 20, 1, 10_000_000),
    workers: optionalInteger("workers", 1, 1, 256),
    seed: optionalInteger("seed", 100_000, 0, 0xffff_ffff),
    playDepth: optionalInteger("play-depth", 2, 1, 32),
    labelDepth: optionalInteger("label-depth", 4, 2, 32),
    minPly: optionalInteger("min-ply", DEFAULT_MIN_PLY, 0, 255),
    maxSamplePly: optionalInteger(
      "max-sample-ply",
      DEFAULT_MAX_SAMPLE_PLY,
      1,
      DEFAULT_MAX_PLIES,
    ),
    sampleEvery: optionalInteger("sample-every", DEFAULT_SAMPLE_EVERY, 1, 256),
    maxSamplesPerGame: optionalInteger(
      "max-samples-per-game",
      DEFAULT_MAX_SAMPLES_PER_GAME,
      1,
      256,
    ),
    maxPlies: optionalInteger("max-plies", DEFAULT_MAX_PLIES, 16, 1_024),
    workerIndex:
      values.get("worker-index") === undefined
        ? null
        : strictInteger(
            values.get("worker-index") as string,
            "worker-index",
            0,
            255,
          ),
  };

  if (args.expectedBuckets !== NNUE_HALFKP_BUCKETS) {
    throw new Error(
      `--expected-buckets must be ${NNUE_HALFKP_BUCKETS} for this lane`,
    );
  }
  if (args.labelDepth <= args.playDepth) {
    throw new Error("--label-depth must be greater than --play-depth");
  }
  if (args.workers > args.games)
    throw new Error("--workers cannot exceed --games");
  if (args.workerIndex !== null && args.workerIndex >= args.workers) {
    throw new Error("--worker-index must be less than --workers");
  }
  if (args.minPly > args.maxSamplePly || args.maxSamplePly >= args.maxPlies) {
    throw new Error(
      "sampling plies must satisfy min-ply <= max-sample-ply < max-plies",
    );
  }
  return Object.freeze(args);
}

/** Locale-independent canonical JSON used for append verification and manifests. */
export function canonicalSelfplayJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("canonical JSON cannot encode a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalSelfplayJson(entry)).join(",")}]`;
  }
  if (typeof value !== "object")
    throw new Error(`canonical JSON cannot encode ${typeof value}`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort(compareBytewise);
  return `{${keys
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalSelfplayJson(record[key])}`,
    )
    .join(",")}}`;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function semanticId(
  domain: string,
  fields: readonly (string | number)[],
): string {
  return `sha256:${sha256(`${domain}\0${fields.join("\0")}`)}`;
}

function readPinnedFile(
  file: string,
  expectedSha256: string,
  label: string,
): {
  readonly bytes: Uint8Array;
  readonly identity: FileIdentity;
} {
  const resolved = path.resolve(file);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file: ${resolved}`);
  }
  const bytes = fs.readFileSync(resolved);
  const digest = sha256(bytes);
  if (digest !== expectedSha256) {
    throw new Error(
      `${label} SHA-256 mismatch: expected ${expectedSha256}, got ${digest}`,
    );
  }
  if (bytes.byteLength !== stat.size)
    throw new Error(`${label} changed while being read`);
  return {
    bytes,
    identity: Object.freeze({
      path: resolved,
      bytes: bytes.byteLength,
      sha256: digest,
    }),
  };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function decodeCanonicalJsonl(bytes: Uint8Array, label: string): unknown[] {
  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${String(error)}`);
  }
  if (!text.endsWith("\n") || text === "\n") {
    throw new Error(`${label} must be non-empty LF-terminated JSONL`);
  }
  return text
    .slice(0, -1)
    .split("\n")
    .map((line, index) => {
      if (line.length === 0)
        throw new Error(`${label} line ${index + 1} is blank`);
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        throw new Error(
          `${label} line ${index + 1} is invalid JSON: ${String(error)}`,
        );
      }
      if (canonicalSelfplayJson(value) !== line) {
        throw new Error(`${label} line ${index + 1} is not canonical JSON`);
      }
      return value;
    });
}

export interface PositionInvariantResult {
  readonly ok: boolean;
  readonly reason?: string;
}

const EXPECTED_NON_KING_COUNTS: Readonly<Record<number, number>> =
  Object.freeze({
    [FU]: 18,
    [KY]: 4,
    [KE]: 4,
    [GI]: 4,
    [KI]: 4,
    [KA]: 2,
    [HI]: 2,
  });

/** Physical material conservation check, kept local so workers never load the production WASM module. */
export function validateSelfplayPositionInvariant(
  position: Pick<KyokumenImproved, "ban" | "hand">,
): PositionInvariantResult {
  const counts = new Map<number, number>();
  let senteKings = 0;
  let goteKings = 0;
  for (let file = 1; file <= 9; file += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      const piece = position.ban[(file << 4) + rank];
      if (piece === EMPTY) continue;
      const owner = piece & (SENTE | GOTE);
      if (owner !== SENTE && owner !== GOTE) {
        return { ok: false, reason: `invalid owner at ${file}${rank}` };
      }
      const kind = getKomashu(piece);
      if (kind === OU) {
        if (owner === SENTE) senteKings += 1;
        else goteKings += 1;
        continue;
      }
      const baseKind = kind & 0x07;
      if (!(baseKind in EXPECTED_NON_KING_COUNTS)) {
        return { ok: false, reason: `invalid piece kind at ${file}${rank}` };
      }
      counts.set(baseKind, (counts.get(baseKind) ?? 0) + 1);
    }
  }
  if (senteKings !== 1 || goteKings !== 1) {
    return {
      ok: false,
      reason: `expected one king per side, got ${senteKings}/${goteKings}`,
    };
  }
  for (const kind of Object.keys(EXPECTED_NON_KING_COUNTS).map(Number)) {
    for (const owner of [SENTE, GOTE]) {
      const count = position.hand[owner + kind] ?? 0;
      if (!Number.isInteger(count) || count < 0) {
        return { ok: false, reason: `invalid hand count for ${owner + kind}` };
      }
      counts.set(kind, (counts.get(kind) ?? 0) + count);
    }
    if ((counts.get(kind) ?? 0) !== EXPECTED_NON_KING_COUNTS[kind]) {
      return {
        ok: false,
        reason: `piece ${kind} count mismatch: expected ${EXPECTED_NON_KING_COUNTS[kind]}, got ${
          counts.get(kind) ?? 0
        }`,
      };
    }
  }
  return { ok: true };
}

function validateOpeningSfen(
  sfen: string,
  label: string,
  minimumPly: number,
  maximumPly: number,
): number {
  const parsed = positionFromSfen(sfen);
  if (toSfen(parsed.position, parsed.moveNumber) !== sfen) {
    throw new Error(`${label}.sfen must be canonical`);
  }
  const ply = parsed.moveNumber - 1;
  if (ply < minimumPly || ply > maximumPly) {
    throw new Error(
      `${label}.sfen ply must be between ${minimumPly} and ${maximumPly}`,
    );
  }
  const invariant = validateSelfplayPositionInvariant(parsed.position);
  if (!invariant.ok)
    throw new Error(
      `${label}.sfen violates material invariant: ${invariant.reason}`,
    );
  if (GenerateMovesImproved.generateLegalMoves(parsed.position).length === 0) {
    throw new Error(`${label}.sfen is terminal`);
  }
  return ply;
}

/** Parse and validate the exact production opening-corpus contract. */
function rejectDuplicateTopLevelJsonKeys(line: string, label: string): void {
  let index = 0;
  const skipWhitespace = (): void => {
    while (/\s/.test(line[index] ?? "")) index += 1;
  };
  const scanString = (): string => {
    if (line[index] !== '"')
      throw new Error(`${label} object key is not a JSON string`);
    const start = index;
    index += 1;
    let escaped = false;
    while (index < line.length) {
      const character = line[index];
      index += 1;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"')
        return JSON.parse(line.slice(start, index)) as string;
    }
    throw new Error(`${label} contains an unterminated JSON string`);
  };
  skipWhitespace();
  if (line[index] !== "{") throw new Error(`${label} must be a JSON object`);
  index += 1;
  const keys = new Set<string>();
  for (;;) {
    skipWhitespace();
    if (line[index] === "}") return;
    const key = scanString();
    if (keys.has(key)) throw new Error(`${label} repeats JSON key ${key}`);
    keys.add(key);
    skipWhitespace();
    if (line[index] !== ":")
      throw new Error(`${label} has no colon after key ${key}`);
    index += 1;
    let objectDepth = 0;
    let arrayDepth = 0;
    let inString = false;
    let escaped = false;
    for (; index < line.length; index += 1) {
      const character = line[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") objectDepth += 1;
      else if (character === "[") arrayDepth += 1;
      else if (character === "}") {
        if (objectDepth === 0 && arrayDepth === 0) return;
        objectDepth -= 1;
      } else if (character === "]") arrayDepth -= 1;
      else if (character === "," && objectDepth === 0 && arrayDepth === 0) {
        index += 1;
        break;
      }
    }
  }
}

function decodeOpeningJsonl(bytes: Uint8Array): unknown[] {
  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch (error) {
    throw new Error(`opening corpus is not valid UTF-8: ${String(error)}`);
  }
  if (!text.endsWith("\n") || text === "\n") {
    throw new Error("opening corpus must be non-empty LF-terminated JSONL");
  }
  return text
    .slice(0, -1)
    .split("\n")
    .map((line, index) => {
      const label = `opening corpus line ${index + 1}`;
      if (line.length === 0) throw new Error(`${label} is blank`);
      rejectDuplicateTopLevelJsonKeys(line, label);
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        throw new Error(`${label} is invalid JSON: ${String(error)}`);
      }
      const row = requireObject(value, label);
      const isFloodgateParent =
        row.parent_sfen !== undefined || row.position_id !== undefined;
      if (!isFloodgateParent && canonicalSelfplayJson(value) !== line) {
        throw new Error(`${label} is not canonical JSON`);
      }
      return value;
    });
}

export function parsePinnedOpeningCorpus(
  bytes: Uint8Array,
): readonly SelfplayOpening[] {
  const values = decodeOpeningJsonl(bytes);
  const openingIds = new Set<string>();
  const semanticPositions = new Set<string>();
  let corpusSource: SelfplayOpening["source"] | null = null;
  return Object.freeze(
    values.map((value, index) => {
      const row = requireObject(value, `opening corpus line ${index + 1}`);
      const sourceGameId = requireCanonicalText(
        row.game_id,
        `opening corpus line ${index + 1}.game_id`,
      );
      const hasOpeningTriple =
        row.opening_id !== undefined || row.sfen !== undefined;
      const hasFloodgateParent =
        row.position_id !== undefined || row.parent_sfen !== undefined;
      if (hasOpeningTriple === hasFloodgateParent) {
        throw new Error(
          `opening corpus line ${index + 1} must use exactly one supported required-field schema`,
        );
      }
      const source = hasOpeningTriple
        ? "pinned-corpus"
        : "pinned-floodgate-parent";
      if (corpusSource !== null && corpusSource !== source) {
        throw new Error(
          "opening corpus cannot mix opening and Floodgate-parent row schemas",
        );
      }
      corpusSource = source;
      const openingId = requireCanonicalText(
        hasOpeningTriple ? row.opening_id : row.position_id,
        `opening corpus line ${index + 1}.${hasOpeningTriple ? "opening_id" : "position_id"}`,
      );
      const sfen = requireCanonicalText(
        hasOpeningTriple ? row.sfen : row.parent_sfen,
        `opening corpus line ${index + 1}.${hasOpeningTriple ? "sfen" : "parent_sfen"}`,
      );
      if (!hasOpeningTriple) {
        if (
          !POSITION_ID_RE.test(openingId) ||
          openingId !== positionKeyFromSfen(sfen)
        ) {
          throw new Error(
            `opening corpus line ${index + 1}.position_id does not match parent_sfen`,
          );
        }
      }
      if (openingIds.has(openingId))
        throw new Error(`opening_id repeats: ${openingId}`);
      openingIds.add(openingId);
      const semantic = canonicalPositionSfen(sfen);
      if (semanticPositions.has(semantic))
        throw new Error(`opening SFEN repeats: ${openingId}`);
      semanticPositions.add(semantic);
      const schema = hasOpeningTriple
        ? NNUE_SELFPLAY_OPENING_CORPUS_SCHEMAS.opening_v1
        : NNUE_SELFPLAY_OPENING_CORPUS_SCHEMAS.floodgate_parent_v1;
      const ply = validateOpeningSfen(
        sfen,
        `opening corpus line ${index + 1}`,
        schema.minimum_ply,
        schema.maximum_ply,
      );
      return Object.freeze({
        source,
        sourceGameId,
        openingId,
        sfen,
        ply,
      });
    }),
  );
}

function pickTestCuratedMove(
  position: KyokumenImproved,
  moves: readonly Te[],
  random: () => number,
): Te {
  const quiet = moves.filter(
    (move) => move.from !== 0 && move.capture === EMPTY && !move.promote,
  );
  const pawnStartRank = position.teban === SENTE ? 7 : 3;
  const pawnNextRank = position.teban === SENTE ? 6 : 4;
  const pawnPushes = quiet.filter(
    (move) =>
      getKomashu(move.koma) === FU &&
      (move.from & 0x0f) === pawnStartRank &&
      (move.to & 0x0f) === pawnNextRank,
  );
  const developments = quiet.filter((move) => getKomashu(move.koma) !== OU);
  const pool =
    pawnPushes.length > 0
      ? pawnPushes
      : developments.length > 0
        ? developments
        : quiet.length > 0
          ? quiet
          : moves;
  return pool[Math.floor(random() * pool.length)];
}

/** Explicit smoke-only opening seam. Production manifests never use this source. */
export function buildTestCuratedOpening(
  gameIndex: number,
  seedBase: number,
): SelfplayOpening {
  if (!Number.isSafeInteger(gameIndex) || gameIndex < 0)
    throw new Error("gameIndex must be non-negative");
  const random = mulberry32(
    (0x5eed00 + seedBase * 15_485_863 + gameIndex * 104_729) >>> 0,
  );
  const position = InitialPositionImproved.createInitialPosition();
  for (let ply = 0; ply < TEST_OPENING_PLIES; ply += 1) {
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    if (legal.length === 0)
      throw new Error("test curated opening unexpectedly reached a terminal");
    const selected = pickTestCuratedMove(position, legal, random);
    const canonical = legal.find((move) => move.equals(selected));
    if (!canonical)
      throw new Error("test curated opening selected a stale move");
    canonical.capture = position.get(canonical.to);
    position.move(canonical);
    position.toggleTeban();
    const invariant = validateSelfplayPositionInvariant(position);
    if (!invariant.ok)
      throw new Error(
        `test opening corrupted the position: ${invariant.reason}`,
      );
  }
  const sfen = toSfen(position, TEST_OPENING_PLIES + 1);
  return Object.freeze({
    source: "test-curated",
    sourceGameId: `test-curated:${gameIndex}`,
    openingId: semanticId("shogi-nnue-selfplay-test-opening-v1", [
      seedBase,
      gameIndex,
      sfen,
    ]),
    sfen,
    ply: TEST_OPENING_PLIES,
  });
}

export function openingForGame(
  globalGameIndex: number,
  seed: number,
  pinnedOpenings: readonly SelfplayOpening[] | null,
): SelfplayOpening {
  if (pinnedOpenings === null)
    return buildTestCuratedOpening(globalGameIndex, seed);
  if (globalGameIndex >= pinnedOpenings.length) {
    throw new Error(
      `opening corpus has ${pinnedOpenings.length} rows but game ${globalGameIndex} is required`,
    );
  }
  return pinnedOpenings[globalGameIndex];
}

function assertRequiredWasmExports(
  value: unknown,
): asserts value is NnueSelfplayWasm {
  const wasm = value as Partial<NnueSelfplayWasm>;
  if (!(wasm.memory instanceof WebAssembly.Memory))
    throw new Error("research WASM does not export memory");
  for (const name of [
    "clearBoard",
    "setSquare",
    "setHand",
    "setSideToMove",
    "finalizePosition",
    "clearTT",
    "setRootTesu",
    "searchBestMove",
    "getSearchScore",
    "getSearchDepth",
    "getSearchNodes",
    "getSearchLeaves",
    "getNnueWeightsPtr",
    "getNnueWeightsSize",
    "setNnueBuckets",
    "getNnueBuckets",
    "setNnueScaleK",
    "setNnueOutputScale",
    "setNnueEnabled",
    "setNnueForceFull",
  ] as const) {
    if (typeof wasm[name] !== "function")
      throw new Error(`research WASM does not export ${name}`);
  }
}

export function instantiatePinnedResearchWasm(
  bytes: Uint8Array,
): NnueSelfplayWasm {
  const ownedBytes = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  ownedBytes.set(bytes);
  const wasmModule = new WebAssembly.Module(ownedBytes);
  const instance = new WebAssembly.Instance(wasmModule, {
    env: {
      abort(_message: number, _file: number, line: number, column: number) {
        throw new Error(`WASM abort at ${line}:${column}`);
      },
      now: () => 0,
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  });
  assertRequiredWasmExports(instance.exports);
  return instance.exports;
}

/** Install one exact 81-bucket model and verify the copied bytes. */
export function installPinnedNnueModel(
  wasm: NnueSelfplayWasm,
  weights: Uint8Array,
  expectedBuckets = NNUE_HALFKP_BUCKETS,
): void {
  const detectedBuckets = bucketsForByteLength(weights.byteLength);
  if (
    detectedBuckets !== expectedBuckets ||
    expectedBuckets !== NNUE_HALFKP_BUCKETS
  ) {
    throw new Error(
      `weights format is ${detectedBuckets}; expected HalfKP${expectedBuckets}`,
    );
  }
  wasm.setNnueBuckets(expectedBuckets);
  if (
    wasm.getNnueBuckets() !== expectedBuckets ||
    wasm.getNnueWeightsSize() !== weights.byteLength
  ) {
    throw new Error(
      `research WASM layout mismatch: buckets=${wasm.getNnueBuckets()} bytes=${wasm.getNnueWeightsSize()}`,
    );
  }
  const pointer = wasm.getNnueWeightsPtr();
  if (
    !Number.isSafeInteger(pointer) ||
    pointer < 0 ||
    pointer + weights.byteLength > wasm.memory.buffer.byteLength
  ) {
    throw new Error("NNUE weight region is outside WASM memory");
  }
  new Uint8Array(wasm.memory.buffer, pointer, weights.byteLength).set(weights);
  const copied = new Uint8Array(
    wasm.memory.buffer,
    pointer,
    weights.byteLength,
  );
  if (sha256(copied) !== sha256(weights))
    throw new Error("NNUE weights did not copy exactly");
  wasm.setNnueScaleK(600);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  wasm.setNnueEnabled(1);
  wasm.clearTT();
}

function canonicalLegalMove(selected: Te, legal: readonly Te[]): Te | null {
  return legal.find((move) => move.equals(selected)) ?? null;
}

function readWasmU32Counter(label: string, value: number): number {
  // WebAssembly exposes AssemblyScript i32 exports to JavaScript as signed
  // numbers. Search counters are non-negative bit counters, so values above
  // INT32_MAX arrive as negative numbers and must be reinterpreted as u32.
  if (
    !Number.isSafeInteger(value) ||
    value < -0x8000_0000 ||
    value > 0x7fff_ffff
  ) {
    throw new Error(`invalid ${label}: ${value}`);
  }
  return value >>> 0;
}

/** Run one deterministic fixed-depth root search. There is deliberately no fallback move. */
export function searchPinnedFixedDepth(
  wasm: NnueSelfplayWasm,
  position: KyokumenImproved,
  ply: number,
  depth: number,
): FixedDepthSearchResult {
  const legal = GenerateMovesImproved.generateLegalMoves(position);
  if (legal.length === 0)
    throw new Error("fixed-depth search requires a non-terminal position");
  const beforeHash = position.HashVal;
  const beforeSfen = toSfen(position, ply + 1);
  const runSearch = () => {
    syncWasm(wasm, position);
    wasm.setRootTesu(ply);
    const key = wasm.searchBestMove(0, depth, QUIESCENCE_DEPTH);
    return Object.freeze({
      key,
      score: wasm.getSearchScore(),
      completedDepth: wasm.getSearchDepth(),
      nodes: readWasmU32Counter("nodes", wasm.getSearchNodes()),
      leaves: readWasmU32Counter("leaves", wasm.getSearchLeaves()),
    });
  };
  const validateSearch = (result: ReturnType<typeof runSearch>): void => {
    if (
      position.HashVal !== beforeHash ||
      toSfen(position, ply + 1) !== beforeSfen
    ) {
      throw new Error("fixed-depth search mutated the JS position");
    }
    for (const [label, value, minimum, maximum] of [
      ["score", result.score, -MAX_SEARCH_SCORE, MAX_SEARCH_SCORE],
      ["completed depth", result.completedDepth, 1, depth],
      ["nodes", result.nodes, 0, 0xffff_ffff],
      ["leaves", result.leaves, 0, 0xffff_ffff],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`invalid ${label}: ${value}`);
      }
    }
    if (result.nodes + result.leaves <= 0)
      throw new Error("fixed-depth search returned empty counters");
    if (
      result.completedDepth !== depth &&
      !(result.completedDepth < depth && result.score >= WINNING_MATE_BAND)
    ) {
      throw new Error(
        `fixed-depth search stopped at depth ${result.completedDepth}/${depth} without winning mate`,
      );
    }
  };
  let raw = runSearch();
  validateSearch(raw);
  let decoded = raw.key === 0 ? null : teFromWasmKey(raw.key, position);
  let move = decoded === null ? null : canonicalLegalMove(decoded, legal);
  const firstInvalidMove =
    raw.key === 0 ? "no move" : (decoded?.toString() ?? "undecodable move");
  if (move === null) {
    // A cross-ply collision in the WASM engine's effective 30-bit TT key can
    // expose a stale packed root move. Re-search the exact same position once
    // from an empty TT; never substitute a JS or random fallback move.
    console.warn(
      `[selfplay] clean-TT retry ply=${ply} invalid=${firstInvalidMove}`,
    );
    wasm.clearTT();
    raw = runSearch();
    validateSearch(raw);
    decoded = raw.key === 0 ? null : teFromWasmKey(raw.key, position);
    move = decoded === null ? null : canonicalLegalMove(decoded, legal);
  }
  const { key, score, completedDepth, nodes, leaves } = raw;
  if (key === 0)
    throw new Error(
      `WASM returned no move while legal moves exist after clean-TT retry (first: ${firstInvalidMove})`,
    );
  if (!move)
    throw new Error(
      `WASM returned illegal move after clean-TT retry: ${decoded?.toString() ?? "unknown"} ` +
        `(first: ${firstInvalidMove})`,
    );
  return Object.freeze({
    score,
    completedDepth,
    nodes,
    leaves,
    move,
    moveUsi: teToUsi(move),
  });
}

export class PinnedNnueFixedDepthActor implements FixedDepthActor {
  constructor(private readonly wasm: NnueSelfplayWasm) {}

  clearTT(): void {
    this.wasm.clearTT();
  }

  search(
    position: KyokumenImproved,
    ply: number,
    depth: number,
  ): FixedDepthSearchResult {
    return searchPinnedFixedDepth(this.wasm, position, ply, depth);
  }
}

export function shouldSampleSelfplayPly(
  ply: number,
  inCheck: boolean,
  currentSamples: number,
  config: Pick<
    SelfplayGameConfig,
    "minPly" | "maxSamplePly" | "sampleEvery" | "maxSamplesPerGame"
  >,
): boolean {
  return (
    !inCheck &&
    ply >= config.minPly &&
    ply <= config.maxSamplePly &&
    (ply - config.minPly) % config.sampleEvery === 0 &&
    currentSamples < config.maxSamplesPerGame
  );
}

export function outcomeForSelfplaySide(
  winner: number | null,
  side: number,
): 0 | 0.5 | 1 {
  if (side !== SENTE && side !== GOTE) throw new Error(`invalid side: ${side}`);
  if (winner === null) return 0.5;
  if (winner !== SENTE && winner !== GOTE)
    throw new Error(`invalid winner: ${winner}`);
  return winner === side ? 1 : 0;
}

function sideName(side: number | null): "b" | "w" | null {
  if (side === null) return null;
  if (side === SENTE) return "b";
  if (side === GOTE) return "w";
  throw new Error(`invalid side: ${side}`);
}

/** Repetition identity includes the full board, hands, and side to move, but not move number. */
export function selfplayRepetitionKey(
  position: KyokumenImproved,
  ply: number,
): string {
  if (!Number.isSafeInteger(ply) || ply < 0)
    throw new Error(`invalid repetition ply: ${ply}`);
  return canonicalPositionSfen(toSfen(position, ply + 1));
}

/** Shogi has no drawn stalemate: a side with no legal move loses, whether checked or not. */
export function terminalForNoLegalMoves(
  side: number,
  inCheck: boolean,
  plies: number,
): TerminalResult {
  if (side !== SENTE && side !== GOTE)
    throw new Error(`invalid terminal side: ${side}`);
  if (!Number.isSafeInteger(plies) || plies < 0)
    throw new Error(`invalid terminal ply: ${plies}`);
  return Object.freeze({
    winner: side === SENTE ? GOTE : SENTE,
    reason: inCheck ? "checkmate" : "no-legal-move",
    plies,
  });
}

export function buildSelfplayGameId(config: SelfplayGameConfig): string {
  return semanticId("shogi-nnue-selfplay-game-v1", [
    config.runFingerprint,
    config.cycle,
    config.globalGameIndex,
    config.actorWeightsSha256,
    config.opening.openingId,
    config.opening.sfen,
  ]);
}

/** Play and then deeply label one game. Samples are returned only after a clean terminal. */
export function playAndLabelSelfplayGame(
  config: SelfplayGameConfig,
  playActor: FixedDepthActor,
  labelActor: FixedDepthActor,
): SelfplayGameEnvelope {
  if (!SHA256_RE.test(config.runFingerprint))
    throw new Error("runFingerprint is invalid");
  if (!SHA256_RE.test(config.actorWeightsSha256))
    throw new Error("actorWeightsSha256 is invalid");
  const parsedOpening = positionFromSfen(config.opening.sfen);
  const position = parsedOpening.position;
  let ply = parsedOpening.moveNumber - 1;
  if (ply !== config.opening.ply)
    throw new Error("opening ply does not match SFEN");
  const invariant = validateSelfplayPositionInvariant(position);
  if (!invariant.ok)
    throw new Error(`opening violates material invariant: ${invariant.reason}`);

  playActor.clearTT();
  const repetition = new Map<string, number>();
  const pending: PendingSample[] = [];
  let legalMovesChecked = 0;
  let terminal: TerminalResult | null = null;

  for (; ply < config.maxPlies; ply += 1) {
    const repetitionKey = selfplayRepetitionKey(position, ply);
    repetition.set(repetitionKey, (repetition.get(repetitionKey) ?? 0) + 1);
    if ((repetition.get(repetitionKey) ?? 0) >= 4) {
      terminal = { winner: null, reason: "repetition", plies: ply };
      break;
    }
    const side = position.teban;
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    if (legal.length === 0) {
      const inCheck = GenerateMovesImproved.isKingInCheck(position, side);
      terminal = terminalForNoLegalMoves(side, inCheck, ply);
      break;
    }

    const inCheck = GenerateMovesImproved.isKingInCheck(position, side);
    const retain = shouldSampleSelfplayPly(
      ply,
      inCheck,
      pending.length,
      config,
    );
    const sfen = retain ? toSfen(position, ply + 1) : "";
    const search = playActor.search(position, ply, config.playDepth);
    const move = canonicalLegalMove(search.move, legal);
    if (!move)
      throw new Error(
        `play actor returned illegal move at ply ${ply}: ${search.moveUsi}`,
      );
    legalMovesChecked += 1;
    if (retain) {
      pending.push({
        sfen,
        ply,
        side,
        playedMove: teToUsi(move),
        play: {
          score: search.score,
          completedDepth: search.completedDepth,
          nodes: search.nodes,
          leaves: search.leaves,
        },
      });
    }
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
    const after = validateSelfplayPositionInvariant(position);
    if (!after.ok)
      throw new Error(`move at ply ${ply} corrupted position: ${after.reason}`);
  }
  if (terminal === null)
    terminal = { winner: null, reason: "max-plies", plies: config.maxPlies };

  const gameId = buildSelfplayGameId(config);
  const samples = pending.map((sample): SelfplaySampleRecord => {
    const parsed = positionFromSfen(sample.sfen);
    if (
      parsed.moveNumber - 1 !== sample.ply ||
      parsed.position.teban !== sample.side
    ) {
      throw new Error("retained sample SFEN changed before labeling");
    }
    labelActor.clearTT();
    const label = labelActor.search(
      parsed.position,
      sample.ply,
      config.labelDepth,
    );
    const positionId = positionKeyFromSfen(sample.sfen);
    if (!POSITION_ID_RE.test(positionId))
      throw new Error("position ID derivation failed");
    return Object.freeze({
      schema: NNUE_SELFPLAY_POSITION_SCHEMA,
      game_id: gameId,
      source_game_id: config.opening.sourceGameId,
      position_id: positionId,
      sfen: sample.sfen,
      ply: sample.ply,
      move: sample.playedMove,
      cp: label.score,
      outcome: outcomeForSelfplaySide(terminal?.winner ?? null, sample.side),
      actor_weights_sha256: config.actorWeightsSha256,
      opening_id: config.opening.openingId,
      search: Object.freeze({
        play_depth: config.playDepth,
        label_depth: config.labelDepth,
        depth: label.completedDepth,
        // The WASM exposes internal nodes and leaves separately. The dataset
        // contract uses nodes as total visited nodes so leaves <= nodes.
        nodes: label.nodes + label.leaves,
        leaves: label.leaves,
      }),
      result: Object.freeze({
        winner: sideName(terminal?.winner ?? null),
        reason: terminal?.reason ?? "max-plies",
      }),
    });
  });

  return Object.freeze({
    schema: NNUE_SELFPLAY_GAME_SCHEMA,
    run_fingerprint: config.runFingerprint,
    cycle: config.cycle,
    game_index: config.globalGameIndex,
    game_id: gameId,
    actor_weights_sha256: config.actorWeightsSha256,
    play_depth: config.playDepth,
    label_depth: config.labelDepth,
    opening: Object.freeze({
      source: config.opening.source,
      source_game_id: config.opening.sourceGameId,
      opening_id: config.opening.openingId,
      sfen: config.opening.sfen,
      ply: config.opening.ply,
    }),
    result: Object.freeze({
      winner: sideName(terminal.winner),
      reason: terminal.reason,
      plies: terminal.plies,
    }),
    legal_moves_checked: legalMovesChecked,
    samples: Object.freeze(samples),
  });
}

function semanticRunBinding(
  args: SelfplayArgs,
  inputs: Omit<RunInputs, "runFingerprint">,
): object {
  return {
    schema: NNUE_SELFPLAY_RUN_MANIFEST_SCHEMA,
    cycle: args.cycle,
    game_start: args.gameStart,
    games: args.games,
    workers: args.workers,
    seed: args.seed,
    actor: {
      weights: {
        bytes: inputs.weightsIdentity.bytes,
        sha256: inputs.weightsIdentity.sha256,
        buckets: args.expectedBuckets,
      },
      wasm: {
        bytes: inputs.wasmIdentity.bytes,
        sha256: inputs.wasmIdentity.sha256,
      },
    },
    openings:
      inputs.openingsIdentity === null
        ? {
            mode: "test-curated",
            training_eligible: false,
            plies: TEST_OPENING_PLIES,
          }
        : {
            mode: "pinned-corpus",
            training_eligible: true,
            bytes: inputs.openingsIdentity.bytes,
            sha256: inputs.openingsIdentity.sha256,
            rows: inputs.openings?.length,
            row_schema:
              inputs.openings?.[0]?.source === "pinned-floodgate-parent"
                ? "floodgate_parent_v1"
                : "opening_v1",
            required_fields:
              inputs.openings?.[0]?.source === "pinned-floodgate-parent"
                ? NNUE_SELFPLAY_FLOODGATE_PARENT_REQUIRED_FIELDS
                : NNUE_SELFPLAY_OPENING_REQUIRED_FIELDS,
          },
    search: {
      play_depth: args.playDepth,
      label_depth: args.labelDepth,
      quiescence_depth: QUIESCENCE_DEPTH,
      wall_clock_deadline: false,
      random_fallback: false,
    },
    sampling: {
      min_ply: args.minPly,
      max_sample_ply: args.maxSamplePly,
      every: args.sampleEvery,
      max_per_game: args.maxSamplesPerGame,
      max_game_plies: args.maxPlies,
      exclude_in_check: true,
    },
  };
}

/** Domain-separated identity for every strength-relevant generator binding. */
export function selfplayRunFingerprintForBinding(binding: unknown): string {
  return sha256(
    `shogi-nnue-selfplay-run-fingerprint-v1\0${canonicalSelfplayJson(binding)}`,
  );
}

function loadRunInputs(args: SelfplayArgs): RunInputs {
  const weights = readPinnedFile(args.weights, args.weightsSha256, "weights");
  const wasm = readPinnedFile(args.wasm, args.wasmSha256, "research WASM");
  if (bucketsForByteLength(weights.bytes.byteLength) !== args.expectedBuckets) {
    throw new Error("weights byte length does not match expected buckets");
  }
  let openings: readonly SelfplayOpening[] | null = null;
  let openingsIdentity: FileIdentity | null = null;
  if (!args.allowTestCuratedOpenings) {
    const pinned = readPinnedFile(
      args.openings as string,
      args.openingsSha256 as string,
      "opening corpus",
    );
    openings = parsePinnedOpeningCorpus(pinned.bytes);
    openingsIdentity = pinned.identity;
    const lastGame = args.gameStart + args.games - 1;
    if (openings.length <= lastGame) {
      throw new Error(
        `opening corpus has ${openings.length} rows but game ${lastGame} is required`,
      );
    }
  }
  const incomplete = {
    weightsBytes: weights.bytes,
    weightsIdentity: weights.identity,
    wasmBytes: wasm.bytes,
    wasmIdentity: wasm.identity,
    openings,
    openingsIdentity,
  };
  const runFingerprint = selfplayRunFingerprintForBinding(
    semanticRunBinding(args, incomplete),
  );
  return Object.freeze({ ...incomplete, runFingerprint });
}

function shardStem(workerIndex: number): string {
  return `shard-${String(workerIndex).padStart(3, "0")}`;
}

function expectedGameIndices(
  args: SelfplayArgs,
  workerIndex: number,
): number[] {
  const indices: number[] = [];
  for (let local = workerIndex; local < args.games; local += args.workers) {
    indices.push(args.gameStart + local);
  }
  return indices;
}

function fileIdentity(file: string): FileIdentity {
  const resolved = path.resolve(file);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error(`not a regular file: ${resolved}`);
  const bytes = fs.readFileSync(resolved);
  if (bytes.byteLength !== stat.size)
    throw new Error(`file changed while hashing: ${resolved}`);
  return { path: resolved, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

export interface CanonicalExclusiveWriteTestHooks {
  readonly writeBytes?: (descriptor: number, bytes: Uint8Array) => void;
  readonly beforePublish?: (temporaryPath: string) => void;
}

function unlinkTemporaryNoThrow(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // Cleanup is best effort here so it cannot hide the original durability
      // failure. Fresh randomized names prevent a leftover from being reused.
    }
  }
}

/**
 * Durably publish canonical JSON without ever exposing a partial final file.
 *
 * The hard link is the exclusive commit point: it cannot replace an existing
 * final path and only runs after the same-directory temporary inode is synced.
 */
export function writeCanonicalExclusive(
  file: string,
  value: unknown,
  testHooks: CanonicalExclusiveWriteTestHooks = {},
): void {
  const resolved = path.resolve(file);
  const directory = path.dirname(resolved);
  const bytes = Buffer.from(`${canonicalSelfplayJson(value)}\n`, "utf8");
  let temporaryPath: string | null = null;
  let descriptor: number | null = null;

  try {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const candidate = path.join(
        directory,
        `.${path.basename(resolved)}.${process.pid}.${randomBytes(12).toString("hex")}.tmp`,
      );
      try {
        descriptor = fs.openSync(candidate, "wx", 0o600);
        temporaryPath = candidate;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if (descriptor === null || temporaryPath === null) {
      throw new Error(
        `could not allocate a fresh manifest temporary file in ${directory}`,
      );
    }

    (testHooks.writeBytes ?? appendAll)(descriptor, bytes);
    if (fs.fstatSync(descriptor).size !== bytes.byteLength) {
      throw new Error("manifest temporary write length mismatch");
    }
    fs.fchmodSync(descriptor, 0o600);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;

    testHooks.beforePublish?.(temporaryPath);
    fs.linkSync(temporaryPath, resolved);
    fs.unlinkSync(temporaryPath);
    temporaryPath = null;

    const directoryDescriptor = fs.openSync(directory, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } finally {
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The descriptor may already have been closed by a failed close call.
      }
    }
    if (temporaryPath !== null) unlinkTemporaryNoThrow(temporaryPath);
  }
}

export interface WorkerProgressRecord {
  readonly schema: "shogi-nnue-selfplay-worker-progress-v1";
  readonly run_fingerprint: string;
  readonly game_index: number;
  readonly game_id: string;
  readonly source_game_id: string;
  readonly opening_id: string;
  readonly result: Readonly<{
    readonly reason: SelfplayTerminalReason;
    readonly winner: "b" | "w" | null;
  }>;
  readonly samples: number;
  readonly positions_bytes: number;
  readonly records: number;
}

export interface SelfplayGenerationSummary {
  readonly requested_games: number;
  readonly completed_games: number;
  readonly sampled_games: number;
  readonly zero_sample_games: number;
  readonly terminal_reasons: Readonly<Record<SelfplayTerminalReason, number>>;
}

const TERMINAL_REASONS: readonly SelfplayTerminalReason[] = Object.freeze([
  "checkmate",
  "no-legal-move",
  "repetition",
  "max-plies",
]);

function hasExactFields(
  record: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return (
    Object.keys(record).length === fields.length &&
    fields.every((field) => Object.prototype.hasOwnProperty.call(record, field))
  );
}

function requireNonNegativeCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function isTerminalReason(value: unknown): value is SelfplayTerminalReason {
  return (
    typeof value === "string" &&
    TERMINAL_REASONS.includes(value as SelfplayTerminalReason)
  );
}

export function summarizeSelfplayGeneration(
  requestedGames: number,
  progress: readonly WorkerProgressRecord[],
): SelfplayGenerationSummary {
  if (!Number.isSafeInteger(requestedGames) || requestedGames < 0) {
    throw new Error("requestedGames must be a non-negative safe integer");
  }
  const terminalReasons: Record<SelfplayTerminalReason, number> = {
    checkmate: 0,
    "no-legal-move": 0,
    repetition: 0,
    "max-plies": 0,
  };
  let sampledGames = 0;
  for (const game of progress) {
    if (!isTerminalReason(game.result.reason)) {
      throw new Error(`invalid terminal reason in game ${game.game_index}`);
    }
    requireNonNegativeCount(game.samples, `game ${game.game_index}.samples`);
    if (game.samples > 0) sampledGames += 1;
    terminalReasons[game.result.reason] += 1;
  }
  return Object.freeze({
    requested_games: requestedGames,
    completed_games: progress.length,
    sampled_games: sampledGames,
    zero_sample_games: progress.length - sampledGames,
    terminal_reasons: Object.freeze(terminalReasons),
  });
}

function appendAll(descriptor: number, bytes: Uint8Array): void {
  let written = 0;
  while (written < bytes.byteLength) {
    const count = fs.writeSync(
      descriptor,
      bytes,
      written,
      bytes.byteLength - written,
    );
    if (count <= 0) throw new Error("append made no progress");
    written += count;
  }
}

export function recoverSelfplayWorkerProgress(
  progressPath: string,
  positionsPath: string,
  expectedIndices: readonly number[],
  runFingerprint: string,
): WorkerProgressRecord[] {
  if (!fs.existsSync(positionsPath))
    fs.writeFileSync(positionsPath, "", { flag: "wx", mode: 0o600 });
  if (!fs.existsSync(progressPath)) {
    fs.truncateSync(positionsPath, 0);
    return [];
  }
  let progressBytes = fs.readFileSync(progressPath);
  const lastLf = progressBytes.lastIndexOf(0x0a);
  const completeBytes = lastLf < 0 ? 0 : lastLf + 1;
  if (completeBytes !== progressBytes.byteLength) {
    fs.truncateSync(progressPath, completeBytes);
    progressBytes = progressBytes.subarray(0, completeBytes);
  }
  const values =
    progressBytes.byteLength === 0
      ? []
      : decodeCanonicalJsonl(progressBytes, "worker progress");
  if (values.length > expectedIndices.length)
    throw new Error("worker progress contains too many games");
  let previousBytes = 0;
  let previousRecords = 0;
  const progress = values.map((value, index): WorkerProgressRecord => {
    const record = requireObject(value, `worker progress line ${index + 1}`);
    if (
      !hasExactFields(record, [
        "schema",
        "run_fingerprint",
        "game_index",
        "game_id",
        "source_game_id",
        "opening_id",
        "result",
        "samples",
        "positions_bytes",
        "records",
      ]) ||
      record.schema !== "shogi-nnue-selfplay-worker-progress-v1" ||
      record.run_fingerprint !== runFingerprint ||
      record.game_index !== expectedIndices[index] ||
      typeof record.game_id !== "string" ||
      !POSITION_ID_RE.test(record.game_id) ||
      typeof record.source_game_id !== "string" ||
      record.source_game_id.length === 0 ||
      typeof record.opening_id !== "string" ||
      record.opening_id.length === 0 ||
      !Number.isSafeInteger(record.samples) ||
      (record.samples as number) < 0 ||
      !Number.isSafeInteger(record.positions_bytes) ||
      (record.positions_bytes as number) < previousBytes ||
      !Number.isSafeInteger(record.records) ||
      (record.records as number) < previousRecords
    ) {
      throw new Error(
        `worker progress line ${index + 1} is not the deterministic prefix`,
      );
    }
    const result = requireObject(
      record.result,
      `worker progress line ${index + 1}.result`,
    );
    if (
      !hasExactFields(result, ["reason", "winner"]) ||
      !isTerminalReason(result.reason) ||
      (result.winner !== null && result.winner !== "b" && result.winner !== "w")
    ) {
      throw new Error(`worker progress line ${index + 1}.result is invalid`);
    }
    if ((record.records as number) - previousRecords !== record.samples) {
      throw new Error(
        `worker progress line ${index + 1}.samples does not match records delta`,
      );
    }
    previousBytes = record.positions_bytes as number;
    previousRecords = record.records as number;
    return record as unknown as WorkerProgressRecord;
  });
  const positionsSize = fs.statSync(positionsPath).size;
  if (positionsSize < previousBytes)
    throw new Error("positions file is shorter than committed progress");
  fs.truncateSync(positionsPath, previousBytes);
  return progress;
}

interface SampledGameAccounting {
  readonly sourceGameId: string;
  readonly openingId: string;
  readonly reason: SelfplayTerminalReason;
  readonly winner: "b" | "w" | null;
  samples: number;
}

function parseCompletedPositionRows(file: string): SelfplaySampleRecord[] {
  const bytes = fs.readFileSync(file);
  if (bytes.byteLength === 0) return [];
  const games = new Map<string, SampledGameAccounting>();
  return decodeCanonicalJsonl(bytes, "completed positions").map(
    (value, index) => {
      const record = requireObject(value, `completed position ${index + 1}`);
      const search = requireObject(
        record.search,
        `completed position ${index + 1}.search`,
      );
      const result = requireObject(
        record.result,
        `completed position ${index + 1}.result`,
      );
      if (
        !hasExactFields(record, NNUE_SELFPLAY_POSITION_FIELDS) ||
        record.schema !== NNUE_SELFPLAY_POSITION_SCHEMA ||
        typeof record.game_id !== "string" ||
        !POSITION_ID_RE.test(record.game_id) ||
        typeof record.source_game_id !== "string" ||
        record.source_game_id.length === 0 ||
        record.source_game_id.trim() !== record.source_game_id ||
        typeof record.opening_id !== "string" ||
        record.opening_id.length === 0 ||
        record.opening_id.trim() !== record.opening_id ||
        typeof record.position_id !== "string" ||
        !POSITION_ID_RE.test(record.position_id) ||
        typeof record.sfen !== "string" ||
        record.sfen.length === 0 ||
        typeof record.move !== "string" ||
        record.move.length === 0 ||
        !Number.isSafeInteger(record.ply) ||
        !Number.isSafeInteger(record.cp) ||
        (record.outcome !== 0 &&
          record.outcome !== 0.5 &&
          record.outcome !== 1) ||
        typeof record.actor_weights_sha256 !== "string" ||
        !SHA256_RE.test(record.actor_weights_sha256) ||
        !hasExactFields(search, [
          "play_depth",
          "label_depth",
          "depth",
          "nodes",
          "leaves",
        ]) ||
        !Number.isSafeInteger(search.play_depth) ||
        !Number.isSafeInteger(search.label_depth) ||
        !Number.isSafeInteger(search.depth) ||
        !Number.isSafeInteger(search.nodes) ||
        !Number.isSafeInteger(search.leaves) ||
        !hasExactFields(result, ["winner", "reason"]) ||
        !isTerminalReason(result.reason) ||
        (result.winner !== null &&
          result.winner !== "b" &&
          result.winner !== "w")
      ) {
        throw new Error(`completed position ${index + 1} is invalid`);
      }
      const ply = record.ply as number;
      const parsed = positionFromSfen(record.sfen);
      if (
        parsed.moveNumber - 1 !== ply ||
        positionKeyFromSfen(record.sfen) !== record.position_id
      ) {
        throw new Error(
          `completed position ${index + 1} SFEN identity mismatch`,
        );
      }
      const gameId = record.game_id;
      const previous = games.get(gameId);
      if (previous === undefined) {
        games.set(gameId, {
          sourceGameId: record.source_game_id,
          openingId: record.opening_id,
          reason: result.reason,
          winner: result.winner as "b" | "w" | null,
          samples: 1,
        });
      } else if (
        previous.sourceGameId !== record.source_game_id ||
        previous.openingId !== record.opening_id ||
        previous.reason !== result.reason ||
        previous.winner !== result.winner
      ) {
        throw new Error(
          `completed game ${gameId} changes source, opening, or result between rows`,
        );
      } else {
        previous.samples += 1;
      }
      return value as SelfplaySampleRecord;
    },
  );
}

function sampledGameAccounting(
  rows: readonly SelfplaySampleRecord[],
): Map<string, SampledGameAccounting> {
  const games = new Map<string, SampledGameAccounting>();
  for (const row of rows) {
    const current = games.get(row.game_id);
    if (current === undefined) {
      games.set(row.game_id, {
        sourceGameId: row.source_game_id,
        openingId: row.opening_id,
        reason: row.result.reason,
        winner: row.result.winner,
        samples: 1,
      });
    } else {
      current.samples += 1;
    }
  }
  return games;
}

function validateRowsAgainstProgress(
  rows: readonly SelfplaySampleRecord[],
  progress: readonly WorkerProgressRecord[],
): void {
  const sampled = sampledGameAccounting(rows);
  for (const game of progress) {
    const rowGame = sampled.get(game.game_id);
    if (game.samples === 0) {
      if (rowGame !== undefined)
        throw new Error(
          `zero-sample game ${game.game_index} has position rows`,
        );
      continue;
    }
    if (
      rowGame === undefined ||
      rowGame.samples !== game.samples ||
      rowGame.sourceGameId !== game.source_game_id ||
      rowGame.openingId !== game.opening_id ||
      rowGame.reason !== game.result.reason ||
      rowGame.winner !== game.result.winner
    ) {
      throw new Error(
        `sample rows do not match progress for game ${game.game_index}`,
      );
    }
    sampled.delete(game.game_id);
  }
  if (sampled.size !== 0)
    throw new Error("sample rows contain games absent from worker progress");
}

function validateGenerationSummary(
  value: unknown,
  requestedGames: number,
  rows: readonly SelfplaySampleRecord[],
): SelfplayGenerationSummary {
  const generation = requireObject(value, "shard manifest generation");
  const terminalReasons = requireObject(
    generation.terminal_reasons,
    "shard manifest generation.terminal_reasons",
  );
  if (
    !hasExactFields(generation, [
      "requested_games",
      "completed_games",
      "sampled_games",
      "zero_sample_games",
      "terminal_reasons",
    ]) ||
    !hasExactFields(terminalReasons, TERMINAL_REASONS)
  ) {
    throw new Error("shard manifest generation fields are invalid");
  }
  const requested = requireNonNegativeCount(
    generation.requested_games,
    "generation.requested_games",
  );
  const completed = requireNonNegativeCount(
    generation.completed_games,
    "generation.completed_games",
  );
  const sampled = requireNonNegativeCount(
    generation.sampled_games,
    "generation.sampled_games",
  );
  const zeroSample = requireNonNegativeCount(
    generation.zero_sample_games,
    "generation.zero_sample_games",
  );
  const reasons: Record<SelfplayTerminalReason, number> = {
    checkmate: requireNonNegativeCount(
      terminalReasons.checkmate,
      "terminal_reasons.checkmate",
    ),
    "no-legal-move": requireNonNegativeCount(
      terminalReasons["no-legal-move"],
      "terminal_reasons.no-legal-move",
    ),
    repetition: requireNonNegativeCount(
      terminalReasons.repetition,
      "terminal_reasons.repetition",
    ),
    "max-plies": requireNonNegativeCount(
      terminalReasons["max-plies"],
      "terminal_reasons.max-plies",
    ),
  };
  const sampledGames = sampledGameAccounting(rows);
  const sampledReasons: Record<SelfplayTerminalReason, number> = {
    checkmate: 0,
    "no-legal-move": 0,
    repetition: 0,
    "max-plies": 0,
  };
  for (const game of sampledGames.values()) sampledReasons[game.reason] += 1;
  if (
    requested !== requestedGames ||
    completed !== requested ||
    sampled + zeroSample !== completed ||
    sampled !== sampledGames.size ||
    TERMINAL_REASONS.reduce((sum, reason) => sum + reasons[reason], 0) !==
      completed ||
    TERMINAL_REASONS.some((reason) => sampledReasons[reason] > reasons[reason])
  ) {
    throw new Error("shard manifest generation accounting is invalid");
  }
  return Object.freeze({
    requested_games: requested,
    completed_games: completed,
    sampled_games: sampled,
    zero_sample_games: zeroSample,
    terminal_reasons: Object.freeze(reasons),
  });
}

export function verifyCompletedSelfplayShard(
  shardDirectory: string,
  args: SelfplayArgs,
  workerIndex: number,
  runFingerprint: string,
): void {
  const entries = fs.readdirSync(shardDirectory).sort(compareBytewise);
  const allowedWithProgress = [
    "manifest.json",
    "positions.jsonl",
    "progress.jsonl",
  ];
  if (
    canonicalSelfplayJson(entries) !==
      canonicalSelfplayJson(["manifest.json", "positions.jsonl"]) &&
    canonicalSelfplayJson(entries) !==
      canonicalSelfplayJson(allowedWithProgress)
  ) {
    throw new Error(
      `${shardStem(workerIndex)} completed directory has unexpected entries`,
    );
  }
  const positionsPath = path.join(shardDirectory, "positions.jsonl");
  const expectedIndices = expectedGameIndices(args, workerIndex);
  const progressPath = path.join(shardDirectory, "progress.jsonl");
  const progress = fs.existsSync(progressPath)
    ? recoverSelfplayWorkerProgress(
        progressPath,
        positionsPath,
        expectedIndices,
        runFingerprint,
      )
    : null;
  if (progress !== null && progress.length !== expectedIndices.length) {
    throw new Error(
      `${shardStem(workerIndex)} completed progress is incomplete`,
    );
  }
  const rows = parseCompletedPositionRows(positionsPath);
  if (progress !== null) validateRowsAgainstProgress(rows, progress);
  const positions = fileIdentity(positionsPath);
  const manifestPath = path.join(shardDirectory, "manifest.json");
  const values = decodeCanonicalJsonl(
    fs.readFileSync(manifestPath),
    "shard manifest",
  );
  if (values.length !== 1)
    throw new Error("shard manifest must contain exactly one row");
  const manifest = requireObject(values[0], "shard manifest");
  const generation = validateGenerationSummary(
    manifest.generation,
    expectedIndices.length,
    rows,
  );
  if (
    progress !== null &&
    canonicalSelfplayJson(generation) !==
      canonicalSelfplayJson(
        summarizeSelfplayGeneration(expectedIndices.length, progress),
      )
  ) {
    throw new Error(
      `${shardStem(workerIndex)} generation summary does not match progress`,
    );
  }
  const expectedOutput = {
    file: "positions.jsonl",
    bytes: positions.bytes,
    sha256: positions.sha256,
    records: rows.length,
    games: new Set(rows.map((row) => row.game_id)).size,
    unique_positions: new Set(rows.map((row) => row.position_id)).size,
  };
  if (
    !hasExactFields(manifest, [
      "schema",
      "complete",
      "training_eligible",
      "run_fingerprint",
      "cycle",
      "shard_index",
      "shard_total",
      "generation",
      "output",
    ]) ||
    manifest.schema !== NNUE_SELFPLAY_SHARD_MANIFEST_SCHEMA ||
    manifest.complete !== !args.allowTestCuratedOpenings ||
    manifest.cycle !== args.cycle ||
    manifest.shard_index !== workerIndex ||
    manifest.shard_total !== args.workers ||
    manifest.training_eligible !== !args.allowTestCuratedOpenings ||
    manifest.run_fingerprint !== runFingerprint ||
    canonicalSelfplayJson(manifest.output) !==
      canonicalSelfplayJson(expectedOutput)
  ) {
    throw new Error(`${shardStem(workerIndex)} existing manifest is invalid`);
  }
  if (fs.existsSync(progressPath)) {
    fs.unlinkSync(progressPath);
  }
}

async function runWorkerShard(
  args: SelfplayArgs,
  workerIndex: number,
): Promise<void> {
  const inputs = loadRunInputs(args);
  fs.mkdirSync(args.outDir, { recursive: true, mode: 0o700 });
  const stem = shardStem(workerIndex);
  const shardDirectory = path.join(args.outDir, stem);
  fs.mkdirSync(shardDirectory, { recursive: true, mode: 0o700 });
  const positionsPath = path.join(shardDirectory, "positions.jsonl");
  const progressPath = path.join(shardDirectory, "progress.jsonl");
  const manifestPath = path.join(shardDirectory, "manifest.json");
  const indices = expectedGameIndices(args, workerIndex);
  if (fs.existsSync(manifestPath)) {
    verifyCompletedSelfplayShard(
      shardDirectory,
      args,
      workerIndex,
      inputs.runFingerprint,
    );
    console.log(`[selfplay] ${stem} already complete`);
    return;
  }
  const completed = recoverSelfplayWorkerProgress(
    progressPath,
    positionsPath,
    indices,
    inputs.runFingerprint,
  );

  const playWasm = instantiatePinnedResearchWasm(inputs.wasmBytes);
  const labelWasm = instantiatePinnedResearchWasm(inputs.wasmBytes);
  installPinnedNnueModel(playWasm, inputs.weightsBytes, args.expectedBuckets);
  installPinnedNnueModel(labelWasm, inputs.weightsBytes, args.expectedBuckets);
  const playActor = new PinnedNnueFixedDepthActor(playWasm);
  const labelActor = new PinnedNnueFixedDepthActor(labelWasm);
  const positionsDescriptor = fs.openSync(positionsPath, "a", 0o600);
  const progressDescriptor = fs.openSync(progressPath, "a", 0o600);
  let positionsBytes = completed.at(-1)?.positions_bytes ?? 0;
  let recordCount = completed.at(-1)?.records ?? 0;
  try {
    for (
      let ordinal = completed.length;
      ordinal < indices.length;
      ordinal += 1
    ) {
      const globalGameIndex = indices[ordinal];
      const opening = openingForGame(
        globalGameIndex,
        args.seed,
        inputs.openings,
      );
      const game = playAndLabelSelfplayGame(
        {
          cycle: args.cycle,
          globalGameIndex,
          seed: args.seed,
          runFingerprint: inputs.runFingerprint,
          actorWeightsSha256: inputs.weightsIdentity.sha256,
          playDepth: args.playDepth,
          labelDepth: args.labelDepth,
          minPly: args.minPly,
          maxSamplePly: args.maxSamplePly,
          sampleEvery: args.sampleEvery,
          maxSamplesPerGame: args.maxSamplesPerGame,
          maxPlies: args.maxPlies,
          opening,
        },
        playActor,
        labelActor,
      );
      if (game.samples.length > 0) {
        const positionBytes = Buffer.from(
          `${game.samples.map((sample) => canonicalSelfplayJson(sample)).join("\n")}\n`,
          "utf8",
        );
        appendAll(positionsDescriptor, positionBytes);
        positionsBytes += positionBytes.byteLength;
        recordCount += game.samples.length;
      }
      fs.fsyncSync(positionsDescriptor);
      const progress: WorkerProgressRecord = {
        schema: "shogi-nnue-selfplay-worker-progress-v1",
        run_fingerprint: inputs.runFingerprint,
        game_index: globalGameIndex,
        game_id: game.game_id,
        source_game_id: game.opening.source_game_id,
        opening_id: game.opening.opening_id,
        result: Object.freeze({
          reason: game.result.reason,
          winner: game.result.winner,
        }),
        samples: game.samples.length,
        positions_bytes: positionsBytes,
        records: recordCount,
      };
      appendAll(
        progressDescriptor,
        Buffer.from(`${canonicalSelfplayJson(progress)}\n`, "utf8"),
      );
      fs.fsyncSync(progressDescriptor);
      completed.push(progress);
      console.log(
        `[selfplay] ${stem} ${ordinal + 1}/${indices.length} game=${globalGameIndex} ` +
          `result=${game.result.winner ?? "draw"} samples=${game.samples.length}`,
      );
    }
  } finally {
    fs.closeSync(positionsDescriptor);
    fs.closeSync(progressDescriptor);
  }
  if (
    completed.length !== indices.length ||
    completed.some((game, ordinal) => game.game_index !== indices[ordinal])
  ) {
    throw new Error(
      `${stem} cannot be marked complete before every expected game finishes`,
    );
  }
  const rows = parseCompletedPositionRows(positionsPath);
  validateRowsAgainstProgress(rows, completed);
  const generation = summarizeSelfplayGeneration(indices.length, completed);
  if (generation.completed_games !== generation.requested_games) {
    throw new Error(`${stem} generation summary is incomplete`);
  }
  const positionsIdentity = fileIdentity(positionsPath);
  const manifest = {
    schema: NNUE_SELFPLAY_SHARD_MANIFEST_SCHEMA,
    // The smoke-only curated opening seam can exercise the full generator but
    // deliberately cannot pass the dataset preparer's complete=true gate.
    complete: !args.allowTestCuratedOpenings,
    training_eligible: !args.allowTestCuratedOpenings,
    run_fingerprint: inputs.runFingerprint,
    cycle: args.cycle,
    shard_index: workerIndex,
    shard_total: args.workers,
    generation,
    output: {
      file: "positions.jsonl",
      bytes: positionsIdentity.bytes,
      sha256: positionsIdentity.sha256,
      records: rows.length,
      games: new Set(rows.map((row) => row.game_id)).size,
      unique_positions: new Set(rows.map((row) => row.position_id)).size,
    },
  };
  writeCanonicalExclusive(manifestPath, manifest);
  fs.unlinkSync(progressPath);
}

function childArguments(
  args: readonly string[],
  workerIndex: number,
): string[] {
  return [...args, "--worker-index", String(workerIndex)];
}

async function runChildren(
  argv: readonly string[],
  workers: number,
): Promise<void> {
  await Promise.all(
    Array.from(
      { length: workers },
      (_, workerIndex) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              ...process.execArgv,
              __filename,
              ...childArguments(argv, workerIndex),
            ],
            { stdio: "inherit", env: process.env },
          );
          child.once("error", reject);
          child.once("exit", (code, signal) => {
            if (code === 0) resolve();
            else
              reject(
                new Error(
                  `selfplay worker ${workerIndex} exited code=${code} signal=${signal}`,
                ),
              );
          });
        }),
    ),
  );
}

function publishRunManifest(args: SelfplayArgs): void {
  const inputs = loadRunInputs(args);
  const shards = Array.from({ length: args.workers }, (_, workerIndex) => {
    const stem = shardStem(workerIndex);
    const shardDirectory = path.join(args.outDir, stem);
    verifyCompletedSelfplayShard(
      shardDirectory,
      args,
      workerIndex,
      inputs.runFingerprint,
    );
    const positions = fileIdentity(
      path.join(shardDirectory, "positions.jsonl"),
    );
    const manifestFile = path.join(shardDirectory, "manifest.json");
    const manifestIdentity = fileIdentity(manifestFile);
    const values = decodeCanonicalJsonl(
      fs.readFileSync(manifestFile),
      `${stem} manifest`,
    );
    const manifest = requireObject(values[0], `${stem} manifest`);
    return {
      worker_index: workerIndex,
      directory: shardDirectory,
      positions,
      manifest: manifestIdentity,
      output: manifest.output,
    };
  });
  const manifest = {
    schema: NNUE_SELFPLAY_RUN_MANIFEST_SCHEMA,
    status: args.allowTestCuratedOpenings
      ? "test-only-smoke-complete"
      : "training-data-complete",
    training_eligible: !args.allowTestCuratedOpenings,
    run_fingerprint: inputs.runFingerprint,
    binding: semanticRunBinding(args, inputs),
    assets: {
      weights: inputs.weightsIdentity,
      wasm: inputs.wasmIdentity,
      openings: inputs.openingsIdentity,
    },
    shards,
  };
  const output = path.join(args.outDir, "manifest.json");
  const expected = `${canonicalSelfplayJson(manifest)}\n`;
  if (fs.existsSync(output)) {
    if (fs.readFileSync(output, "utf8") !== expected)
      throw new Error("existing run manifest differs");
    return;
  }
  writeCanonicalExclusive(output, manifest);
}

export async function runSelfplayCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseSelfplayArgs(argv);
  if (args.workerIndex !== null) {
    await runWorkerShard(args, args.workerIndex);
    return;
  }
  fs.mkdirSync(args.outDir, { recursive: true, mode: 0o700 });
  await runChildren(argv, args.workers);
  publishRunManifest(args);
  console.log(`[selfplay] complete: ${args.games} games in ${args.outDir}`);
}

if (require.main === module) {
  runSelfplayCli().catch((error) => {
    console.error(
      `[selfplay] fatal: ${(error as Error).stack ?? String(error)}`,
    );
    process.exitCode = 1;
  });
}
