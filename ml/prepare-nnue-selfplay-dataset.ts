/**
 * Verify self-play generator shards and publish one deterministic NNUE dataset.
 *
 * Cycle zero creates the immutable 5% game holdout. Later cycles re-read that
 * exact holdout, exclude it from every current/past source, and compose training
 * data from current self-play plus accepted earlier cycles. A shard manifest is
 * its commit marker; an output manifest is likewise written last.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { TextDecoder } from "node:util";

import { compareBytewise, positionKeyFromSfen } from "./sibling-data";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";

export const NNUE_SELFPLAY_POSITION_SCHEMA =
  "shogi-nnue-selfplay-position-v1" as const;
export const NNUE_SELFPLAY_SHARD_MANIFEST_SCHEMA =
  "shogi-nnue-selfplay-shard-manifest-v1" as const;
export const NNUE_SELFPLAY_DATASET_MANIFEST_SCHEMA =
  "shogi-nnue-selfplay-dataset-manifest-v1" as const;
export const NNUE_SELFPLAY_ACCEPTANCE_SCHEMA =
  "shogi-nnue-selfplay-acceptance-v1" as const;
export const NNUE_SELFPLAY_DATASET_STATUS =
  "research-data-only-not-deployment-authorization" as const;
export const NNUE_SELFPLAY_SPLIT_ALGORITHM =
  "sha256-source-game-assignment-cycle0-fixed-holdout-v1" as const;
export const NNUE_SELFPLAY_DEDUPE_POLICY =
  "position-id-validation-then-current-then-deterministic-priority-v1" as const;
export const NNUE_SELFPLAY_REPLAY_POLICY =
  "deterministic-position-sample-current-past-accepted-v1" as const;

const UTF8 = new TextDecoder("utf-8", { fatal: true });
const SHA256_RE = /^[0-9a-f]{64}$/;
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;
const ROW_KEYS = [
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
] as const;
const SEARCH_KEYS = [
  "depth",
  "label_depth",
  "leaves",
  "nodes",
  "play_depth",
] as const;
const RESULT_KEYS = ["reason", "winner"] as const;
const SELFPLAY_TERMINAL_REASONS = [
  "checkmate",
  "no-legal-move",
  "repetition",
  "max-plies",
] as const;
const PUBLISHED_ROW_KEYS = [...ROW_KEYS, "split"] as const;

export interface SelfplaySearchEvidence {
  readonly play_depth: number;
  readonly label_depth: number;
  readonly depth: number;
  readonly nodes: number;
  readonly leaves: number;
}

export interface SelfplayResult {
  readonly winner: "b" | "w" | null;
  readonly reason: string;
}

export interface NnueSelfplayPosition {
  readonly schema: typeof NNUE_SELFPLAY_POSITION_SCHEMA;
  readonly game_id: string;
  readonly source_game_id: string;
  readonly position_id: string;
  readonly sfen: string;
  readonly cp: number;
  readonly outcome: 0 | 0.5 | 1;
  readonly ply: number;
  readonly move: string;
  readonly actor_weights_sha256: string;
  readonly opening_id: string;
  readonly search: SelfplaySearchEvidence;
  readonly result: SelfplayResult;
}

export type PublishedNnueSelfplayPosition = NnueSelfplayPosition & {
  readonly split: "train" | "val";
};

export interface PrepareNnueSelfplayDatasetOptions {
  readonly currentShardDirs: readonly string[];
  readonly cycle: number;
  readonly splitSeed: string;
  readonly outDir: string;
  readonly balanceSideToMove?: boolean;
  readonly valRatio?: number;
  readonly currentRatio?: number;
  readonly pastAcceptedRatio?: number;
  readonly trainRecords?: number;
  readonly cycle0HoldoutDir?: string;
  readonly pastAcceptedDirs?: readonly string[];
}

interface FileIdentity {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface StableFile extends FileIdentity {
  readonly absolutePath: string;
  readonly bytesValue: Buffer;
}

interface TaggedRow {
  readonly row: NnueSelfplayPosition;
  readonly origin: "current" | "past" | "validation";
  readonly source: string;
}

interface GenerationEvidence {
  readonly requested_games: number;
  readonly completed_games: number;
  readonly sampled_games: number;
  readonly zero_sample_games: number;
  readonly terminal_reasons: Readonly<Record<string, number>>;
}

interface VerifiedShard {
  readonly rows: readonly TaggedRow[];
  readonly evidence: Readonly<{
    directory: string;
    index: number;
    total: number;
    run_fingerprint: string;
    generation: GenerationEvidence;
    positions: FileIdentity & {
      records: number;
      games: number;
      unique_positions: number;
    };
    manifest: FileIdentity;
  }>;
}

interface AcceptedInput {
  readonly rows: readonly TaggedRow[];
  readonly evidence: Readonly<{
    directory: string;
    cycle: number;
    train: FileIdentity & { records: number };
    acceptance: FileIdentity;
  }>;
}

type FreshPublisher = (source: string, destination: string) => Promise<void>;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function exactObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareBytewise);
  const expected = [...keys].sort(compareBytewise);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} keys must be exactly ${expected.join(",")}`);
  }
}

function text(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label} must be non-empty canonical text`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function sha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
  return value;
}

function assertPlainDirectory(directoryValue: string, label: string): string {
  const directory = path.resolve(text(directoryValue, label));
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a non-symlink directory`);
  }
  return directory;
}

function sameStat(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.nlink === right.nlink
  );
}

function readStableFile(fileValue: string, label: string): StableFile {
  const absolutePath = path.resolve(fileValue);
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") throw new Error("O_NOFOLLOW is required");
  const descriptor = fs.openSync(
    absolutePath,
    fs.constants.O_RDONLY | noFollow,
  );
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    const pathBefore = fs.lstatSync(absolutePath, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== BigInt(1)
    ) {
      throw new Error(`${label} must be one regular non-symlink file`);
    }
    if (!sameStat(before, pathBefore))
      throw new Error(`${label} path identity changed`);
    const bytesValue = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const pathAfter = fs.lstatSync(absolutePath, { bigint: true });
    if (
      !sameStat(before, after) ||
      !sameStat(after, pathAfter) ||
      BigInt(bytesValue.byteLength) !== after.size
    ) {
      throw new Error(`${label} changed while it was read`);
    }
    return {
      absolutePath,
      file: path.basename(absolutePath),
      bytes: bytesValue.byteLength,
      sha256: sha256(bytesValue),
      bytesValue,
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function decodeUtf8(file: StableFile, label: string): string {
  try {
    return UTF8.decode(file.bytesValue);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
}

function parseCanonicalJsonFile(
  file: StableFile,
  label: string,
): Record<string, unknown> {
  const raw = decodeUtf8(file, label);
  if (
    !raw.endsWith("\n") ||
    raw.slice(0, -1).includes("\n") ||
    raw.length <= 1
  ) {
    throw new Error(
      `${label} must be exactly one canonical JSON line ending in LF`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(0, -1));
  } catch {
    throw new Error(`${label} is not JSON`);
  }
  if (`${canonicalJson(parsed)}\n` !== raw)
    throw new Error(`${label} is not canonical JSON`);
  return exactObject(parsed, label);
}

function parseCanonicalJsonl(file: StableFile, label: string): unknown[] {
  const raw = decodeUtf8(file, label);
  if (!raw.endsWith("\n") || raw.length <= 1 || raw.includes("\r")) {
    throw new Error(`${label} must be non-empty LF-terminated JSONL`);
  }
  return raw
    .slice(0, -1)
    .split("\n")
    .map((line, index) => {
      if (line.length === 0)
        throw new Error(`${label} line ${index + 1} is empty`);
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`${label} line ${index + 1} is not JSON`);
      }
      if (canonicalJson(value) !== line) {
        throw new Error(`${label} line ${index + 1} is not canonical JSON`);
      }
      return value;
    });
}

function expectedOutcome(sfen: string, result: SelfplayResult): 0 | 0.5 | 1 {
  if (result.winner === null) return 0.5;
  const side = sfen.trim().split(/\s+/)[1];
  if (side !== "b" && side !== "w")
    throw new Error("sfen side-to-move must be b or w");
  return side === result.winner ? 1 : 0;
}

export function validateNnueSelfplayPosition(
  value: unknown,
  label = "selfplay position",
): NnueSelfplayPosition {
  const record = exactObject(value, label);
  exactKeys(record, ROW_KEYS, label);
  if (record.schema !== NNUE_SELFPLAY_POSITION_SCHEMA) {
    throw new Error(`${label}.schema is not ${NNUE_SELFPLAY_POSITION_SCHEMA}`);
  }
  const gameId = text(record.game_id, `${label}.game_id`);
  const sourceGameId = text(record.source_game_id, `${label}.source_game_id`);
  const sfen = text(record.sfen, `${label}.sfen`);
  const positionId = text(record.position_id, `${label}.position_id`);
  if (
    !POSITION_ID_RE.test(positionId) ||
    positionId !== positionKeyFromSfen(sfen)
  ) {
    throw new Error(`${label}.position_id does not match sfen`);
  }
  const parsed = positionFromSfen(sfen);
  const ply = integer(record.ply, `${label}.ply`);
  if (ply !== parsed.moveNumber - 1)
    throw new Error(`${label}.ply does not match sfen move number`);
  const move = text(record.move, `${label}.move`);
  if (
    !rulesCompleteLegalMoves(parsed.position).some(
      (candidate) => candidate.usi === move,
    )
  ) {
    throw new Error(`${label}.move is not legal in sfen`);
  }
  // Replay once as an independent legality/canonical-child check.
  childSfenAfterUsi(sfen, move);
  const cp = integer(
    Math.abs(record.cp as number),
    `${label}.cp absolute value`,
  );
  if (
    !Number.isSafeInteger(record.cp) ||
    Math.abs(record.cp as number) !== cp
  ) {
    throw new Error(`${label}.cp must be a safe integer`);
  }
  if (record.outcome !== 0 && record.outcome !== 0.5 && record.outcome !== 1) {
    throw new Error(`${label}.outcome must be 0, 0.5, or 1`);
  }
  const search = exactObject(record.search, `${label}.search`);
  exactKeys(search, SEARCH_KEYS, `${label}.search`);
  const playDepth = integer(search.play_depth, `${label}.search.play_depth`, 1);
  const labelDepth = integer(
    search.label_depth,
    `${label}.search.label_depth`,
    1,
  );
  const depth = integer(search.depth, `${label}.search.depth`, 1);
  const nodes = integer(search.nodes, `${label}.search.nodes`, 1);
  const leaves = integer(search.leaves, `${label}.search.leaves`, 1);
  if (labelDepth <= playDepth)
    throw new Error(`${label}.search.label_depth must exceed play_depth`);
  if (depth > labelDepth)
    throw new Error(`${label}.search.depth cannot exceed label_depth`);
  if (leaves > nodes)
    throw new Error(`${label}.search.leaves cannot exceed nodes`);
  const resultValue = exactObject(record.result, `${label}.result`);
  exactKeys(resultValue, RESULT_KEYS, `${label}.result`);
  if (
    resultValue.winner !== null &&
    resultValue.winner !== "b" &&
    resultValue.winner !== "w"
  ) {
    throw new Error(`${label}.result.winner must be b, w, or null`);
  }
  const result: SelfplayResult = {
    winner: resultValue.winner as "b" | "w" | null,
    reason: text(resultValue.reason, `${label}.result.reason`),
  };
  if (
    !SELFPLAY_TERMINAL_REASONS.includes(
      result.reason as (typeof SELFPLAY_TERMINAL_REASONS)[number],
    )
  ) {
    throw new Error(`${label}.result.reason is not a selfplay terminal reason`);
  }
  if (record.outcome !== expectedOutcome(sfen, result)) {
    throw new Error(
      `${label}.outcome contradicts side-to-move and game result`,
    );
  }
  return {
    schema: NNUE_SELFPLAY_POSITION_SCHEMA,
    game_id: gameId,
    source_game_id: sourceGameId,
    position_id: positionId,
    sfen,
    cp: record.cp as number,
    outcome: record.outcome,
    ply,
    move,
    actor_weights_sha256: sha(
      record.actor_weights_sha256,
      `${label}.actor_weights_sha256`,
    ),
    opening_id: text(record.opening_id, `${label}.opening_id`),
    search: {
      play_depth: playDepth,
      label_depth: labelDepth,
      depth,
      nodes,
      leaves,
    },
    result,
  };
}

export function validatePublishedNnueSelfplayPosition(
  value: unknown,
  expectedSplit: "train" | "val",
  label = "published selfplay position",
): PublishedNnueSelfplayPosition {
  const record = exactObject(value, label);
  exactKeys(record, PUBLISHED_ROW_KEYS, label);
  if (record.split !== expectedSplit) {
    throw new Error(`${label}.split must be ${expectedSplit}`);
  }
  const { split: _split, ...generatorFields } = record;
  return {
    ...validateNnueSelfplayPosition(generatorFields, label),
    split: expectedSplit,
  };
}

function validateGames(
  rows: readonly NnueSelfplayPosition[],
  label: string,
): void {
  const games = new Map<
    string,
    {
      result: string;
      opening: string;
      sourceGame: string;
      actor: string;
      plies: Set<number>;
    }
  >();
  for (const row of rows) {
    const signature = canonicalJson(row.result);
    const found = games.get(row.game_id);
    if (!found) {
      games.set(row.game_id, {
        result: signature,
        opening: row.opening_id,
        sourceGame: row.source_game_id,
        actor: row.actor_weights_sha256,
        plies: new Set([row.ply]),
      });
      continue;
    }
    if (found.result !== signature)
      throw new Error(`${label} game ${row.game_id} has mixed results`);
    if (found.opening !== row.opening_id) {
      throw new Error(
        `${label} game ${row.game_id} has mixed opening_id values`,
      );
    }
    if (found.sourceGame !== row.source_game_id) {
      throw new Error(
        `${label} game ${row.game_id} has mixed source_game_id values`,
      );
    }
    if (found.actor !== row.actor_weights_sha256) {
      throw new Error(`${label} game ${row.game_id} has mixed actor weights`);
    }
    if (found.plies.has(row.ply))
      throw new Error(`${label} game ${row.game_id} repeats ply ${row.ply}`);
    found.plies.add(row.ply);
  }
}

function identityObject(file: StableFile): FileIdentity {
  return { file: file.file, bytes: file.bytes, sha256: file.sha256 };
}

function verifyIdentity(
  value: unknown,
  actual: StableFile,
  label: string,
  expectedFile: string,
): Record<string, unknown> {
  const record = exactObject(value, label);
  if (record.file !== expectedFile)
    throw new Error(`${label}.file must be ${expectedFile}`);
  if (integer(record.bytes, `${label}.bytes`) !== actual.bytes) {
    throw new Error(`${label}.bytes does not match`);
  }
  if (sha(record.sha256, `${label}.sha256`) !== actual.sha256) {
    throw new Error(`${label}.sha256 does not match`);
  }
  return record;
}

function validateGenerationEvidence(
  value: unknown,
  outputGames: number,
  label: string,
): GenerationEvidence {
  const record = exactObject(value, label);
  exactKeys(
    record,
    [
      "completed_games",
      "requested_games",
      "sampled_games",
      "terminal_reasons",
      "zero_sample_games",
    ],
    label,
  );
  const requested = integer(record.requested_games, `${label}.requested_games`);
  const completed = integer(record.completed_games, `${label}.completed_games`);
  const sampled = integer(record.sampled_games, `${label}.sampled_games`);
  const zeroSample = integer(
    record.zero_sample_games,
    `${label}.zero_sample_games`,
  );
  if (requested !== completed) {
    throw new Error(`${label} requested_games must equal completed_games`);
  }
  if (sampled + zeroSample !== completed) {
    throw new Error(
      `${label} sampled_games plus zero_sample_games must equal completed_games`,
    );
  }
  if (outputGames !== sampled) {
    throw new Error(`${label} sampled_games must equal output.games`);
  }
  const reasonValue = exactObject(
    record.terminal_reasons,
    `${label}.terminal_reasons`,
  );
  exactKeys(
    reasonValue,
    SELFPLAY_TERMINAL_REASONS,
    `${label}.terminal_reasons`,
  );
  const reasonKeys = [...SELFPLAY_TERMINAL_REASONS].sort(compareBytewise);
  const terminalReasons: Record<string, number> = {};
  let terminalTotal = 0;
  for (const reason of reasonKeys) {
    text(reason, `${label}.terminal_reasons key`);
    const count = integer(
      reasonValue[reason],
      `${label}.terminal_reasons.${reason}`,
    );
    terminalReasons[reason] = count;
    terminalTotal += count;
  }
  if (!Number.isSafeInteger(terminalTotal) || terminalTotal !== completed) {
    throw new Error(
      `${label}.terminal_reasons counts must sum to completed_games`,
    );
  }
  return {
    requested_games: requested,
    completed_games: completed,
    sampled_games: sampled,
    zero_sample_games: zeroSample,
    terminal_reasons: terminalReasons,
  };
}

function aggregateGenerationEvidence(
  shards: readonly VerifiedShard[],
): GenerationEvidence {
  const terminalReasons: Record<string, number> = {};
  let requested = 0;
  let completed = 0;
  let sampled = 0;
  let zeroSample = 0;
  for (const shard of shards) {
    const generation = shard.evidence.generation;
    requested += generation.requested_games;
    completed += generation.completed_games;
    sampled += generation.sampled_games;
    zeroSample += generation.zero_sample_games;
    for (const [reason, count] of Object.entries(generation.terminal_reasons)) {
      terminalReasons[reason] = (terminalReasons[reason] ?? 0) + count;
    }
  }
  for (const [label, value] of Object.entries({
    requested,
    completed,
    sampled,
    zeroSample,
  })) {
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `aggregate generation ${label} exceeds safe integer range`,
      );
    }
  }
  return {
    requested_games: requested,
    completed_games: completed,
    sampled_games: sampled,
    zero_sample_games: zeroSample,
    terminal_reasons: Object.fromEntries(
      Object.entries(terminalReasons).sort(([left], [right]) =>
        compareBytewise(left, right),
      ),
    ),
  };
}

function verifyShard(
  directoryValue: string,
  expectedIndex: number,
  expectedTotal: number,
  expectedCycle: number,
): VerifiedShard {
  const directory = assertPlainDirectory(
    directoryValue,
    `currentShardDirs[${expectedIndex}]`,
  );
  const entries = fs.readdirSync(directory).sort(compareBytewise);
  if (
    canonicalJson(entries) !==
    canonicalJson(["manifest.json", "positions.jsonl"])
  ) {
    throw new Error(
      `shard ${expectedIndex} must contain only manifest.json and positions.jsonl`,
    );
  }
  const positions = readStableFile(
    path.join(directory, "positions.jsonl"),
    `shard ${expectedIndex} data`,
  );
  const manifestFile = readStableFile(
    path.join(directory, "manifest.json"),
    `shard ${expectedIndex} manifest`,
  );
  const manifest = parseCanonicalJsonFile(
    manifestFile,
    `shard ${expectedIndex} manifest`,
  );
  exactKeys(
    manifest,
    [
      "complete",
      "cycle",
      "generation",
      "output",
      "run_fingerprint",
      "schema",
      "shard_index",
      "shard_total",
      "training_eligible",
    ],
    `shard ${expectedIndex} manifest`,
  );
  if (
    manifest.schema !== NNUE_SELFPLAY_SHARD_MANIFEST_SCHEMA ||
    manifest.complete !== true ||
    manifest.training_eligible !== true
  ) {
    throw new Error(
      `shard ${expectedIndex} manifest is not a complete training-eligible selfplay shard`,
    );
  }
  const runFingerprint = sha(
    manifest.run_fingerprint,
    `shard ${expectedIndex}.run_fingerprint`,
  );
  if (
    integer(manifest.cycle, `shard ${expectedIndex}.cycle`) !== expectedCycle
  ) {
    throw new Error(`shard ${expectedIndex} cycle differs`);
  }
  if (
    integer(manifest.shard_index, `shard ${expectedIndex}.shard_index`) !==
      expectedIndex ||
    integer(manifest.shard_total, `shard ${expectedIndex}.shard_total`, 1) !==
      expectedTotal
  ) {
    throw new Error(`shard ${expectedIndex} index/total differs`);
  }
  const output = verifyIdentity(
    manifest.output,
    positions,
    `shard ${expectedIndex}.output`,
    "positions.jsonl",
  );
  exactKeys(
    output,
    ["bytes", "file", "games", "records", "sha256", "unique_positions"],
    `shard ${expectedIndex}.output`,
  );
  const outputGames = integer(
    output.games,
    `shard ${expectedIndex}.output.games`,
  );
  const generation = validateGenerationEvidence(
    manifest.generation,
    outputGames,
    `shard ${expectedIndex}.generation`,
  );
  const values = parseCanonicalJsonl(positions, `shard ${expectedIndex} data`);
  const rows = values.map((value, index) =>
    validateNnueSelfplayPosition(
      value,
      `shard ${expectedIndex} row ${index + 1}`,
    ),
  );
  validateGames(rows, `shard ${expectedIndex}`);
  const sampledGameReasons = new Map(
    rows.map((row) => [row.game_id, row.result.reason] as const),
  );
  const sampledReasonCounts: Record<string, number> = {};
  for (const reason of sampledGameReasons.values()) {
    sampledReasonCounts[reason] = (sampledReasonCounts[reason] ?? 0) + 1;
  }
  if (
    SELFPLAY_TERMINAL_REASONS.some(
      (reason) =>
        (sampledReasonCounts[reason] ?? 0) >
        generation.terminal_reasons[reason],
    )
  ) {
    throw new Error(
      `shard ${expectedIndex} sampled terminal reasons exceed generation accounting`,
    );
  }
  if (
    integer(output.records, `shard ${expectedIndex}.output.records`) !==
    rows.length
  ) {
    throw new Error(`shard ${expectedIndex} record accounting differs`);
  }
  if (outputGames !== new Set(rows.map((row) => row.game_id)).size) {
    throw new Error(`shard ${expectedIndex} game accounting differs`);
  }
  if (
    integer(
      output.unique_positions,
      `shard ${expectedIndex}.output.unique_positions`,
    ) !== new Set(rows.map((row) => row.position_id)).size
  ) {
    throw new Error(`shard ${expectedIndex} position accounting differs`);
  }
  return {
    rows: rows.map((row, index) => ({
      row,
      origin: "current",
      source: `${directory}\0${String(index).padStart(12, "0")}`,
    })),
    evidence: {
      directory,
      index: expectedIndex,
      total: expectedTotal,
      run_fingerprint: runFingerprint,
      generation,
      positions: {
        ...identityObject(positions),
        records: rows.length,
        games: new Set(rows.map((row) => row.game_id)).size,
        unique_positions: new Set(rows.map((row) => row.position_id)).size,
      },
      manifest: identityObject(manifestFile),
    },
  };
}

/** Stable append-safe source-game assignment. Cycle zero alone creates validation. */
export function assignSelfplayGameSplit(
  sourceGameId: string,
  splitSeed: string,
  valRatio = 0.05,
): "train" | "val" {
  const id = text(sourceGameId, "sourceGameId");
  const seed = text(splitSeed, "splitSeed");
  if (!Number.isFinite(valRatio) || !(valRatio > 0 && valRatio < 1)) {
    throw new Error("valRatio must be finite and between zero and one");
  }
  const digest = createHash("sha256").update(`${seed}\0${id}`, "utf8").digest();
  return digest.readUIntBE(0, 6) / 2 ** 48 < valRatio ? "val" : "train";
}

function stableTaggedOrder(left: TaggedRow, right: TaggedRow): number {
  return (
    compareBytewise(left.row.game_id, right.row.game_id) ||
    left.row.ply - right.row.ply ||
    compareBytewise(left.row.position_id, right.row.position_id) ||
    compareBytewise(left.source, right.source)
  );
}

function deterministicPickOrder(
  seed: string,
  domain: string,
  tagged: TaggedRow,
): string {
  return sha256(
    `${NNUE_SELFPLAY_REPLAY_POLICY}\0${seed}\0${domain}\0${tagged.row.position_id}\0${tagged.row.game_id}\0${tagged.row.ply}\0${tagged.source}`,
  );
}

function holdoutSetIdentity(
  domain: "source_game_id" | "game_id" | "position_id" | "opening_id",
  values: Iterable<string>,
): Readonly<{ count: number; sha256: string }> {
  const identifiers = [...new Set(values)].sort(compareBytewise);
  return {
    count: identifiers.length,
    sha256: sha256(
      `shogi-nnue-selfplay-holdout-set-v1\0${domain}\0${identifiers.join("\n")}`,
    ),
  };
}

interface HoldoutIdentitySets {
  readonly source_game_ids: readonly string[];
  readonly game_ids: readonly string[];
  readonly position_ids: readonly string[];
  readonly opening_ids: readonly string[];
}

function collectHoldoutIdentitySets(
  rows: readonly TaggedRow[],
): HoldoutIdentitySets {
  const sortedUnique = (values: Iterable<string>): string[] =>
    [...new Set(values)].sort(compareBytewise);
  return {
    source_game_ids: sortedUnique(
      rows.map((tagged) => tagged.row.source_game_id),
    ),
    game_ids: sortedUnique(rows.map((tagged) => tagged.row.game_id)),
    position_ids: sortedUnique(rows.map((tagged) => tagged.row.position_id)),
    opening_ids: sortedUnique(rows.map((tagged) => tagged.row.opening_id)),
  };
}

function holdoutEvidence(identitySets: HoldoutIdentitySets): Readonly<{
  source_game_ids: Readonly<{
    values: readonly string[];
    count: number;
    sha256: string;
  }>;
  game_ids: Readonly<{
    values: readonly string[];
    count: number;
    sha256: string;
  }>;
  position_ids: Readonly<{
    values: readonly string[];
    count: number;
    sha256: string;
  }>;
  opening_ids: Readonly<{
    values: readonly string[];
    count: number;
    sha256: string;
  }>;
}> {
  const entry = (
    domain: "source_game_id" | "game_id" | "position_id" | "opening_id",
    values: readonly string[],
  ) => ({ values, ...holdoutSetIdentity(domain, values) });
  return {
    source_game_ids: entry("source_game_id", identitySets.source_game_ids),
    game_ids: entry("game_id", identitySets.game_ids),
    position_ids: entry("position_id", identitySets.position_ids),
    opening_ids: entry("opening_id", identitySets.opening_ids),
  };
}

function dedupeRole(
  candidates: readonly TaggedRow[],
  seed: string,
  domain: string,
): { rows: TaggedRow[]; removed: number } {
  const groups = new Map<string, TaggedRow[]>();
  for (const candidate of candidates) {
    const peers = groups.get(candidate.row.position_id) ?? [];
    peers.push(candidate);
    groups.set(candidate.row.position_id, peers);
  }
  const rows = [...groups.values()].map(
    (peers) =>
      [...peers].sort((left, right) => {
        const a = deterministicPickOrder(seed, domain, left);
        const b = deterministicPickOrder(seed, domain, right);
        return compareBytewise(a, b) || stableTaggedOrder(left, right);
      })[0],
  );
  rows.sort(stableTaggedOrder);
  return { rows, removed: candidates.length - rows.length };
}

function readDatasetValidation(
  directoryValue: string,
  splitSeed: string,
  valRatio: number,
): {
  rows: TaggedRow[];
  holdoutIdentitySets: HoldoutIdentitySets;
  identity: FileIdentity;
  manifestIdentity: FileIdentity;
} {
  const directory = assertPlainDirectory(directoryValue, "cycle0HoldoutDir");
  const manifestFile = readStableFile(
    path.join(directory, "manifest.json"),
    "cycle0 manifest",
  );
  const manifest = parseCanonicalJsonFile(manifestFile, "cycle0 manifest");
  if (
    manifest.schema !== NNUE_SELFPLAY_DATASET_MANIFEST_SCHEMA ||
    manifest.cycle !== 0
  ) {
    throw new Error(
      "cycle0 holdout manifest must be a cycle-zero selfplay dataset",
    );
  }
  const policy = exactObject(manifest.policy, "cycle0 manifest.policy");
  if (policy.split_seed !== splitSeed || policy.validation_ratio !== valRatio) {
    throw new Error("cycle0 holdout split policy differs from this cycle");
  }
  const output = exactObject(manifest.output, "cycle0 manifest.output");
  const validation = readStableFile(
    path.join(directory, "val.jsonl"),
    "cycle0 val",
  );
  const declared = verifyIdentity(
    output.validation,
    validation,
    "cycle0 output.validation",
    "val.jsonl",
  );
  const values = parseCanonicalJsonl(validation, "cycle0 val");
  const rows = values.map((value, index) =>
    validatePublishedNnueSelfplayPosition(
      value,
      "val",
      `cycle0 val row ${index + 1}`,
    ),
  );
  validateGames(rows, "cycle0 val");
  if (
    integer(declared.records, "cycle0 output.validation.records") !==
    rows.length
  ) {
    throw new Error("cycle0 validation record accounting differs");
  }
  const taggedRows: TaggedRow[] = rows.map((row, index) => ({
    row,
    origin: "validation",
    source: `cycle0\0${index}`,
  }));
  const declaredHoldout = exactObject(
    manifest.holdout,
    "cycle0 manifest.holdout",
  );
  exactKeys(
    declaredHoldout,
    ["game_ids", "opening_ids", "position_ids", "source_game_ids"],
    "cycle0 manifest.holdout",
  );
  const valuesFor = (key: keyof HoldoutIdentitySets): readonly string[] => {
    const label = `cycle0 manifest.holdout.${key}`;
    const entry = exactObject(declaredHoldout[key], label);
    exactKeys(entry, ["count", "sha256", "values"], label);
    if (!Array.isArray(entry.values)) {
      throw new Error(`${label}.values must be an array`);
    }
    const values = entry.values.map((value, index) =>
      text(value, `${label}.values[${index}]`),
    );
    const canonicalValues = [...new Set(values)].sort(compareBytewise);
    if (canonicalJson(values) !== canonicalJson(canonicalValues)) {
      throw new Error(`${label}.values must be sorted and unique`);
    }
    return values;
  };
  const holdoutIdentitySets: HoldoutIdentitySets = {
    source_game_ids: valuesFor("source_game_ids"),
    game_ids: valuesFor("game_ids"),
    position_ids: valuesFor("position_ids"),
    opening_ids: valuesFor("opening_ids"),
  };
  if (
    canonicalJson(declaredHoldout) !==
    canonicalJson(holdoutEvidence(holdoutIdentitySets))
  ) {
    throw new Error(
      "cycle0 holdout source/game/position/opening identity differs",
    );
  }
  const visibleSets = collectHoldoutIdentitySets(taggedRows);
  for (const key of Object.keys(visibleSets) as Array<
    keyof HoldoutIdentitySets
  >) {
    const declaredSet = new Set(holdoutIdentitySets[key]);
    if (visibleSets[key].some((value) => !declaredSet.has(value))) {
      throw new Error(`cycle0 holdout ${key} omits a published validation ID`);
    }
  }
  return {
    rows: taggedRows,
    holdoutIdentitySets,
    identity: identityObject(validation),
    manifestIdentity: identityObject(manifestFile),
  };
}

function readAcceptedTrain(
  directoryValue: string,
  currentCycle: number,
): AcceptedInput {
  const directory = assertPlainDirectory(directoryValue, "pastAcceptedDir");
  const train = readStableFile(
    path.join(directory, "train.jsonl"),
    "past accepted train",
  );
  const acceptanceFile = readStableFile(
    path.join(directory, "acceptance.json"),
    "past acceptance",
  );
  const acceptance = parseCanonicalJsonFile(acceptanceFile, "past acceptance");
  exactKeys(
    acceptance,
    ["accepted", "cycle", "dataset", "schema"],
    "past acceptance",
  );
  if (
    acceptance.schema !== NNUE_SELFPLAY_ACCEPTANCE_SCHEMA ||
    acceptance.accepted !== true
  ) {
    throw new Error("past acceptance must explicitly accept the dataset");
  }
  const cycle = integer(acceptance.cycle, "past acceptance.cycle");
  if (cycle >= currentCycle)
    throw new Error("past accepted cycle must precede current cycle");
  const declared = verifyIdentity(
    acceptance.dataset,
    train,
    "past acceptance.dataset",
    "train.jsonl",
  );
  exactKeys(
    declared,
    ["bytes", "file", "records", "sha256"],
    "past acceptance.dataset",
  );
  const rows = parseCanonicalJsonl(train, "past accepted train").map(
    (value, index) =>
      validatePublishedNnueSelfplayPosition(
        value,
        "train",
        `past accepted row ${index + 1}`,
      ),
  );
  validateGames(rows, "past accepted train");
  if (
    integer(declared.records, "past acceptance.dataset.records") !== rows.length
  ) {
    throw new Error("past accepted record accounting differs");
  }
  return {
    rows: rows.map((row, index) => ({
      row,
      origin: "past",
      source: `${directory}\0${String(index).padStart(12, "0")}`,
    })),
    evidence: {
      directory,
      cycle,
      train: { ...identityObject(train), records: rows.length },
      acceptance: identityObject(acceptanceFile),
    },
  };
}

function requestedAllocation(
  currentAvailable: number,
  pastAvailable: number,
  currentRatio: number,
  requestedTotal?: number,
): { total: number; current: number; past: number } {
  const scale = 1_000_000;
  const scaledCurrent = Math.round(currentRatio * scale);
  if (Math.abs(scaledCurrent / scale - currentRatio) > 1e-12) {
    throw new Error("replay ratios may use at most six decimal places");
  }
  function gcd(left: number, right: number): number {
    while (right !== 0) [left, right] = [right, left % right];
    return left;
  }
  const divisor = gcd(scaledCurrent, scale);
  const currentUnit = scaledCurrent / divisor;
  const totalUnit = scale / divisor;
  const pastUnit = totalUnit - currentUnit;
  if (requestedTotal !== undefined) {
    integer(requestedTotal, "trainRecords", 1);
    if (requestedTotal % totalUnit !== 0) {
      throw new Error(
        `trainRecords must be divisible by ${totalUnit} for the exact replay ratio`,
      );
    }
    const units = requestedTotal / totalUnit;
    const current = units * currentUnit;
    const past = units * pastUnit;
    if (current <= currentAvailable && past <= pastAvailable) {
      return { total: requestedTotal, current, past };
    }
  } else {
    const units = Math.min(
      Math.floor(currentAvailable / currentUnit),
      Math.floor(pastAvailable / pastUnit),
    );
    if (units > 0) {
      return {
        total: units * totalUnit,
        current: units * currentUnit,
        past: units * pastUnit,
      };
    }
  }
  throw new Error(
    `insufficient replay rows for exact current/past mix: current ${currentAvailable}, past ${pastAvailable}`,
  );
}

function pickRows(
  rows: readonly TaggedRow[],
  count: number,
  seed: string,
  domain: string,
): TaggedRow[] {
  return [...rows]
    .sort((left, right) => {
      const a = deterministicPickOrder(seed, domain, left);
      const b = deterministicPickOrder(seed, domain, right);
      return compareBytewise(a, b) || stableTaggedOrder(left, right);
    })
    .slice(0, count);
}

type SideToMove = "b" | "w";

interface SideBalanceAccounting {
  readonly available: Readonly<Record<SideToMove, number>>;
  readonly selected: Readonly<Record<SideToMove, number>>;
  readonly removed: Readonly<Record<SideToMove, number>>;
}

function rowSideToMove(tagged: TaggedRow): SideToMove {
  const side = tagged.row.sfen.trim().split(/\s+/)[1];
  if (side !== "b" && side !== "w") {
    throw new Error("validated sfen side-to-move must be b or w");
  }
  return side;
}

function requirePublishedSideBalance(
  rows: readonly TaggedRow[],
  role: "train" | "validation",
  expected: SideBalanceAccounting,
): Readonly<Record<SideToMove, number>> {
  const counts: Record<SideToMove, number> = { b: 0, w: 0 };
  for (const tagged of rows) counts[rowSideToMove(tagged)] += 1;
  if (counts.b <= 0 || counts.b !== counts.w) {
    throw new Error(
      `published ${role} side-to-move balance requires b = w > 0`,
    );
  }
  if (counts.b !== expected.selected.b || counts.w !== expected.selected.w) {
    throw new Error(
      `published ${role} side-to-move counts differ from balance accounting`,
    );
  }
  return counts;
}

function balanceRowsBySideToMove(
  rows: readonly TaggedRow[],
  seed: string,
  role: "train" | "validation",
  requestedTotal?: number,
): { rows: TaggedRow[]; accounting: SideBalanceAccounting } {
  const bySide: Record<SideToMove, TaggedRow[]> = { b: [], w: [] };
  for (const tagged of rows) bySide[rowSideToMove(tagged)].push(tagged);
  if (bySide.b.length === 0 || bySide.w.length === 0) {
    throw new Error(
      `cycle-zero ${role} side-to-move balance requires both b and w rows`,
    );
  }
  if (requestedTotal !== undefined && requestedTotal % 2 !== 0) {
    throw new Error(
      `cycle-zero ${role} side-to-move balance requires an even record count`,
    );
  }
  const selectedPerSide =
    requestedTotal === undefined
      ? Math.min(bySide.b.length, bySide.w.length)
      : requestedTotal / 2;
  if (bySide.b.length < selectedPerSide || bySide.w.length < selectedPerSide) {
    throw new Error(
      `cycle-zero ${role} side-to-move balance has insufficient rows per side`,
    );
  }
  const selected = {
    b: pickRows(
      bySide.b,
      selectedPerSide,
      seed,
      `cycle0-side-to-move-balance-${role}-b`,
    ),
    w: pickRows(
      bySide.w,
      selectedPerSide,
      seed,
      `cycle0-side-to-move-balance-${role}-w`,
    ),
  };
  return {
    rows: [...selected.b, ...selected.w].sort(stableTaggedOrder),
    accounting: {
      available: { b: bySide.b.length, w: bySide.w.length },
      selected: { b: selected.b.length, w: selected.w.length },
      removed: {
        b: bySide.b.length - selected.b.length,
        w: bySide.w.length - selected.w.length,
      },
    },
  };
}

function outputIdentity(
  finalFile: string,
  tempFile: string,
  records: number,
): FileIdentity & {
  records: number;
  games: number;
  unique_positions: number;
  row_schema: typeof NNUE_SELFPLAY_POSITION_SCHEMA;
} {
  const bytes = fs.readFileSync(tempFile);
  const rows = bytes
    .toString("utf8")
    .slice(0, -1)
    .split("\n")
    .map((line) => JSON.parse(line) as NnueSelfplayPosition);
  return {
    file: path.basename(finalFile),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    records,
    row_schema: NNUE_SELFPLAY_POSITION_SCHEMA,
    games: new Set(rows.map((row) => row.game_id)).size,
    unique_positions: new Set(rows.map((row) => row.position_id)).size,
  };
}

function writeExclusive(file: string, payload: string): void {
  fs.writeFileSync(file, payload, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

async function freshDirectoryRename(
  source: string,
  destination: string,
): Promise<void> {
  try {
    fs.lstatSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      fs.renameSync(source, destination);
      return;
    }
    throw error;
  }
  throw new Error(`output directory already exists: ${destination}`);
}

async function prepareCore(
  options: PrepareNnueSelfplayDatasetOptions,
  publisher: FreshPublisher,
  publicationPolicy: string,
): Promise<Record<string, unknown>> {
  const cycle = integer(options.cycle, "cycle");
  if (
    options.balanceSideToMove !== undefined &&
    typeof options.balanceSideToMove !== "boolean"
  ) {
    throw new Error("balanceSideToMove must be a boolean");
  }
  const balanceSideToMove = options.balanceSideToMove === true;
  if (balanceSideToMove && cycle > 0) {
    throw new Error("balanceSideToMove is supported only for cycle zero");
  }
  if (
    !Array.isArray(options.currentShardDirs) ||
    options.currentShardDirs.length === 0
  ) {
    throw new Error("currentShardDirs must contain at least one shard");
  }
  const splitSeed = text(options.splitSeed, "splitSeed");
  const valRatio = options.valRatio ?? 0.05;
  if (!Number.isFinite(valRatio) || !(valRatio > 0 && valRatio < 1)) {
    throw new Error("valRatio must be finite and between zero and one");
  }
  const currentRatio = options.currentRatio ?? 0.75;
  const pastAcceptedRatio = options.pastAcceptedRatio ?? 0.25;
  if (
    !Number.isFinite(currentRatio) ||
    !Number.isFinite(pastAcceptedRatio) ||
    currentRatio <= 0 ||
    pastAcceptedRatio <= 0 ||
    Math.abs(currentRatio + pastAcceptedRatio - 1) > Number.EPSILON * 8
  ) {
    throw new Error(
      "currentRatio and pastAcceptedRatio must be positive and sum to one",
    );
  }
  if (options.trainRecords !== undefined)
    integer(options.trainRecords, "trainRecords", 1);
  if (
    balanceSideToMove &&
    options.trainRecords !== undefined &&
    options.trainRecords % 2 !== 0
  ) {
    throw new Error(
      "cycle-zero train side-to-move balance requires an even record count",
    );
  }
  const pastDirs = options.pastAcceptedDirs ?? [];
  if (
    cycle === 0 &&
    (options.cycle0HoldoutDir !== undefined || pastDirs.length > 0)
  ) {
    throw new Error(
      "cycle zero cannot consume a holdout or past accepted datasets",
    );
  }
  if (cycle > 0 && (!options.cycle0HoldoutDir || pastDirs.length === 0)) {
    throw new Error(
      "later cycles require cycle0HoldoutDir and pastAcceptedDirs",
    );
  }

  const verifiedShards = options.currentShardDirs.map((directory, index) =>
    verifyShard(directory, index, options.currentShardDirs.length, cycle),
  );
  const runFingerprints = new Set(
    verifiedShards.map((shard) => shard.evidence.run_fingerprint),
  );
  if (runFingerprints.size !== 1) {
    throw new Error("current shards have different run_fingerprint values");
  }
  const currentRunFingerprint = [...runFingerprints][0];
  const currentGeneration = aggregateGenerationEvidence(verifiedShards);
  const current = verifiedShards.flatMap((shard) => shard.rows);
  validateGames(
    current.map((tagged) => tagged.row),
    "current shards",
  );
  const currentGames = new Map<string, string>();
  for (const tagged of current) {
    const owner = currentGames.get(tagged.row.game_id);
    if (owner && owner !== tagged.source.split("\0")[0]) {
      throw new Error(`current game ${tagged.row.game_id} spans shards`);
    }
    currentGames.set(tagged.row.game_id, tagged.source.split("\0")[0]);
  }

  let validationCandidates: TaggedRow[];
  let trainCurrentCandidates: TaggedRow[];
  let fixedHoldoutIdentitySets: HoldoutIdentitySets | null = null;
  let fixedHoldoutInput: unknown = null;
  if (cycle === 0) {
    validationCandidates = current.filter(
      (tagged) =>
        assignSelfplayGameSplit(
          tagged.row.source_game_id,
          splitSeed,
          valRatio,
        ) === "val",
    );
    trainCurrentCandidates = current.filter(
      (tagged) =>
        assignSelfplayGameSplit(
          tagged.row.source_game_id,
          splitSeed,
          valRatio,
        ) === "train",
    );
  } else {
    const fixed = readDatasetValidation(
      options.cycle0HoldoutDir as string,
      splitSeed,
      valRatio,
    );
    validationCandidates = fixed.rows;
    fixedHoldoutIdentitySets = fixed.holdoutIdentitySets;
    trainCurrentCandidates = current;
    fixedHoldoutInput = {
      directory: path.resolve(options.cycle0HoldoutDir as string),
      manifest: fixed.manifestIdentity,
      validation: fixed.identity,
    };
  }
  const validationDedup = dedupeRole(
    validationCandidates,
    splitSeed,
    "validation",
  );
  if (validationDedup.rows.length === 0)
    throw new Error("validation holdout is empty");
  const holdoutIdentitySets =
    fixedHoldoutIdentitySets ??
    collectHoldoutIdentitySets(validationCandidates);
  const validationPositions = new Set(holdoutIdentitySets.position_ids);
  const validationGames = new Set(holdoutIdentitySets.game_ids);
  const validationSourceGames = new Set(holdoutIdentitySets.source_game_ids);
  const validationOpenings = new Set(holdoutIdentitySets.opening_ids);

  const acceptedInputs = pastDirs.map((directory) =>
    readAcceptedTrain(directory, cycle),
  );
  const pastRaw = acceptedInputs.flatMap((input) => input.rows);
  const sourceFilteredCurrent = trainCurrentCandidates.filter(
    (tagged) => !validationSourceGames.has(tagged.row.source_game_id),
  );
  const sourceFilteredPast = pastRaw.filter(
    (tagged) => !validationSourceGames.has(tagged.row.source_game_id),
  );
  const gameFilteredCurrent = sourceFilteredCurrent.filter(
    (tagged) => !validationGames.has(tagged.row.game_id),
  );
  const gameFilteredPast = sourceFilteredPast.filter(
    (tagged) => !validationGames.has(tagged.row.game_id),
  );
  const openingFilteredCurrent = gameFilteredCurrent.filter(
    (tagged) => !validationOpenings.has(tagged.row.opening_id),
  );
  const openingFilteredPast = gameFilteredPast.filter(
    (tagged) => !validationOpenings.has(tagged.row.opening_id),
  );
  const holdoutFilteredCurrent = openingFilteredCurrent.filter(
    (tagged) => !validationPositions.has(tagged.row.position_id),
  );
  const holdoutFilteredPast = openingFilteredPast.filter(
    (tagged) => !validationPositions.has(tagged.row.position_id),
  );
  const currentDedup = dedupeRole(holdoutFilteredCurrent, splitSeed, "current");
  const currentPositions = new Set(
    currentDedup.rows.map((tagged) => tagged.row.position_id),
  );
  const pastAfterCurrentPriority = holdoutFilteredPast.filter(
    (tagged) => !currentPositions.has(tagged.row.position_id),
  );
  const pastDedup = dedupeRole(pastAfterCurrentPriority, splitSeed, "past");

  let selectedCurrent: TaggedRow[];
  let selectedPast: TaggedRow[];
  let requestedMix: { total: number; current: number; past: number };
  if (cycle === 0) {
    if (
      options.trainRecords !== undefined &&
      options.trainRecords > currentDedup.rows.length
    ) {
      throw new Error("cycle-zero trainRecords exceeds available current rows");
    }
    const count = options.trainRecords ?? currentDedup.rows.length;
    selectedCurrent = balanceSideToMove
      ? currentDedup.rows
      : pickRows(currentDedup.rows, count, splitSeed, "cycle0-current");
    selectedPast = [];
    requestedMix = { total: count, current: count, past: 0 };
  } else {
    requestedMix = requestedAllocation(
      currentDedup.rows.length,
      pastDedup.rows.length,
      currentRatio,
      options.trainRecords,
    );
    selectedCurrent = pickRows(
      currentDedup.rows,
      requestedMix.current,
      splitSeed,
      `cycle${cycle}-current`,
    );
    selectedPast = pickRows(
      pastDedup.rows,
      requestedMix.past,
      splitSeed,
      `cycle${cycle}-past`,
    );
  }
  const selectedTrainRows = [...selectedCurrent, ...selectedPast].sort(
    stableTaggedOrder,
  );
  const selectedValRows = [...validationDedup.rows].sort(stableTaggedOrder);
  const trainBalance = balanceSideToMove
    ? balanceRowsBySideToMove(
        selectedTrainRows,
        splitSeed,
        "train",
        options.trainRecords,
      )
    : null;
  const validationBalance = balanceSideToMove
    ? balanceRowsBySideToMove(selectedValRows, splitSeed, "validation")
    : null;
  const trainRows = trainBalance?.rows ?? selectedTrainRows;
  const valRows = validationBalance?.rows ?? selectedValRows;
  if (trainRows.length === 0) throw new Error("training output is empty");
  let publishedSideBalance: {
    readonly train: SideBalanceAccounting;
    readonly validation: SideBalanceAccounting;
  } | null = null;
  if (balanceSideToMove) {
    if (!trainBalance || !validationBalance) {
      throw new Error("cycle-zero side-to-move balance was not applied");
    }
    publishedSideBalance = {
      train: {
        ...trainBalance.accounting,
        selected: requirePublishedSideBalance(
          trainRows,
          "train",
          trainBalance.accounting,
        ),
      },
      validation: {
        ...validationBalance.accounting,
        selected: requirePublishedSideBalance(
          valRows,
          "validation",
          validationBalance.accounting,
        ),
      },
    };
  }
  const trainGames = new Set(trainRows.map((tagged) => tagged.row.game_id));
  const trainSourceGames = new Set(
    trainRows.map((tagged) => tagged.row.source_game_id),
  );
  const trainPositions = new Set(
    trainRows.map((tagged) => tagged.row.position_id),
  );
  const trainOpenings = new Set(
    trainRows.map((tagged) => tagged.row.opening_id),
  );
  const gameOverlap = [...trainGames].filter((game) =>
    validationGames.has(game),
  );
  const sourceGameOverlap = [...trainSourceGames].filter((game) =>
    validationSourceGames.has(game),
  );
  const positionOverlap = [...trainPositions].filter((position) =>
    validationPositions.has(position),
  );
  const openingOverlap = [...trainOpenings].filter((opening) =>
    validationOpenings.has(opening),
  );
  if (
    sourceGameOverlap.length > 0 ||
    gameOverlap.length > 0 ||
    positionOverlap.length > 0 ||
    openingOverlap.length > 0
  ) {
    throw new Error("train/validation isolation failed");
  }
  validateGames(
    trainRows.map((tagged) => tagged.row),
    "published train",
  );
  validateGames(
    valRows.map((tagged) => tagged.row),
    "published validation",
  );

  const outDir = path.resolve(text(options.outDir, "outDir"));
  const parent = path.dirname(outDir);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertPlainDirectory(parent, "output parent");
  const tempDir = fs.mkdtempSync(
    path.join(parent, `.${path.basename(outDir)}.tmp-`),
  );
  fs.chmodSync(tempDir, 0o700);
  try {
    const tempTrain = path.join(tempDir, "train.jsonl");
    const tempVal = path.join(tempDir, "val.jsonl");
    writeExclusive(
      tempTrain,
      `${trainRows.map((tagged) => canonicalJson({ ...tagged.row, split: "train" })).join("\n")}\n`,
    );
    writeExclusive(
      tempVal,
      `${valRows.map((tagged) => canonicalJson({ ...tagged.row, split: "val" })).join("\n")}\n`,
    );
    const output = {
      train: outputIdentity(
        path.join(outDir, "train.jsonl"),
        tempTrain,
        trainRows.length,
      ),
      validation: outputIdentity(
        path.join(outDir, "val.jsonl"),
        tempVal,
        valRows.length,
      ),
    };
    const manifest: Record<string, unknown> = {
      schema: NNUE_SELFPLAY_DATASET_MANIFEST_SCHEMA,
      status: NNUE_SELFPLAY_DATASET_STATUS,
      live_weight_write_authorized: false,
      cycle,
      policy: {
        split_algorithm: NNUE_SELFPLAY_SPLIT_ALGORITHM,
        split_seed: splitSeed,
        validation_ratio: valRatio,
        holdout:
          cycle === 0
            ? "created-once-from-cycle0-games"
            : "exact-cycle0-bytes-reused",
        future_cycle_holdout_exclusion:
          "drop-source-game-id-then-game-id-then-opening-id-then-position-id-before-replay",
        deduplication: NNUE_SELFPLAY_DEDUPE_POLICY,
        deduplication_priority: ["validation", "current", "past-accepted"],
        replay: NNUE_SELFPLAY_REPLAY_POLICY,
        requested_current_ratio: currentRatio,
        requested_past_accepted_ratio: pastAcceptedRatio,
        ...(balanceSideToMove
          ? {
              side_to_move_balance:
                "cycle0-deterministic-majority-downsample-per-split-v1",
            }
          : {}),
        publication: publicationPolicy,
        output_manifest_written_last: true,
      },
      holdout: holdoutEvidence(holdoutIdentitySets),
      input: {
        current_run_fingerprint: currentRunFingerprint,
        current_generation: currentGeneration,
        current_shards: verifiedShards.map((shard) => shard.evidence),
        past_accepted_datasets: acceptedInputs.map((input) => input.evidence),
        fixed_cycle0_holdout: fixedHoldoutInput,
      },
      accounting: {
        current_input_records: current.length,
        past_accepted_input_records: pastRaw.length,
        validation_input_records: validationCandidates.length,
        validation_duplicate_positions_removed: validationDedup.removed,
        validation_source_game_priority_current_records_removed:
          trainCurrentCandidates.length - sourceFilteredCurrent.length,
        validation_source_game_priority_past_records_removed:
          pastRaw.length - sourceFilteredPast.length,
        validation_game_conflict_current_records_removed:
          sourceFilteredCurrent.length - gameFilteredCurrent.length,
        validation_game_conflict_past_records_removed:
          sourceFilteredPast.length - gameFilteredPast.length,
        validation_opening_priority_current_records_removed:
          gameFilteredCurrent.length - openingFilteredCurrent.length,
        validation_opening_priority_past_records_removed:
          gameFilteredPast.length - openingFilteredPast.length,
        validation_position_priority_current_records_removed:
          openingFilteredCurrent.length - holdoutFilteredCurrent.length,
        validation_position_priority_past_records_removed:
          openingFilteredPast.length - holdoutFilteredPast.length,
        current_duplicate_positions_removed: currentDedup.removed,
        current_position_priority_past_records_removed:
          holdoutFilteredPast.length - pastAfterCurrentPriority.length,
        past_duplicate_positions_removed: pastDedup.removed,
        replay_available_current_records: currentDedup.rows.length,
        replay_available_past_accepted_records: pastDedup.rows.length,
        replay_selected_current_records: balanceSideToMove
          ? trainRows.length
          : selectedCurrent.length,
        replay_selected_past_accepted_records: balanceSideToMove
          ? 0
          : selectedPast.length,
        replay_selected_total_records: balanceSideToMove
          ? trainRows.length
          : requestedMix.total,
        actual_current_ratio: balanceSideToMove
          ? 1
          : selectedCurrent.length / trainRows.length,
        actual_past_accepted_ratio: balanceSideToMove
          ? 0
          : selectedPast.length / trainRows.length,
        ...(balanceSideToMove
          ? {
              side_to_move_balance: publishedSideBalance,
            }
          : {}),
        current_run_fingerprint_count: runFingerprints.size,
        generation_requested_games: currentGeneration.requested_games,
        generation_completed_games: currentGeneration.completed_games,
        generation_sampled_games: currentGeneration.sampled_games,
        generation_zero_sample_games: currentGeneration.zero_sample_games,
        generation_terminal_reasons: currentGeneration.terminal_reasons,
        train_validation_source_game_overlap: sourceGameOverlap.length,
        train_validation_game_overlap: gameOverlap.length,
        train_validation_position_overlap: positionOverlap.length,
        train_validation_opening_overlap: openingOverlap.length,
      },
      output,
    };
    // The manifest is deliberately the last file: it is the commit marker.
    writeExclusive(
      path.join(tempDir, "manifest.json"),
      `${canonicalJson(manifest)}\n`,
    );
    await publisher(tempDir, outDir);
    return manifest;
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export function prepareNnueSelfplayDataset(
  options: PrepareNnueSelfplayDatasetOptions,
): Promise<Record<string, unknown>> {
  return prepareCore(
    options,
    freshDirectoryRename,
    "atomic-fresh-directory-rename-single-writer-v1",
  );
}

/** Test-only publication seam; production callers cannot replace the publisher. */
export function prepareNnueSelfplayDatasetCoreForTests(
  options: PrepareNnueSelfplayDatasetOptions,
  publisher: FreshPublisher,
): Promise<Record<string, unknown>> {
  return prepareCore(
    options,
    publisher,
    "test-only-injected-fresh-directory-publisher",
  );
}

function cliMap(argv: readonly string[]): Map<string, string> {
  const allowed = new Set([
    "cycle",
    "shard-root",
    "shards",
    "split-seed",
    "val-ratio",
    "out-dir",
    "cycle0-holdout-dir",
    "past-accepted-dirs",
    "current-ratio",
    "past-accepted-ratio",
    "train-records",
  ]);
  const booleanFlags = new Set(["balance-side-to-move"]);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; ) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error("CLI arguments must be --name value pairs");
    }
    const name = token.slice(2);
    if (!allowed.has(name) && !booleanFlags.has(name)) {
      throw new Error(`unknown argument --${name}`);
    }
    if (values.has(name)) throw new Error(`duplicate argument --${name}`);
    if (booleanFlags.has(name)) {
      values.set(name, "true");
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("CLI arguments must be --name value pairs");
    }
    values.set(name, value);
    index += 2;
  }
  return values;
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

function cliInteger(
  values: Map<string, string>,
  name: string,
  fallback?: number,
): number {
  const raw = values.get(name);
  if (raw === undefined && fallback !== undefined) return fallback;
  return integer(Number(raw), `--${name}`, 0);
}

export async function runCli(
  argv = process.argv.slice(2),
): Promise<Record<string, unknown>> {
  const values = cliMap(argv);
  const shards = cliInteger(values, "shards");
  if (shards < 1) throw new Error("--shards must be at least one");
  const shardRoot = path.resolve(required(values, "shard-root"));
  const cycle = cliInteger(values, "cycle");
  const trainRecordsRaw = values.get("train-records");
  return prepareNnueSelfplayDataset({
    currentShardDirs: Array.from({ length: shards }, (_unused, index) =>
      path.join(shardRoot, `shard-${String(index).padStart(3, "0")}`),
    ),
    cycle,
    splitSeed: required(values, "split-seed"),
    outDir: required(values, "out-dir"),
    balanceSideToMove: values.has("balance-side-to-move"),
    valRatio: Number(values.get("val-ratio") ?? "0.05"),
    currentRatio: Number(values.get("current-ratio") ?? "0.75"),
    pastAcceptedRatio: Number(values.get("past-accepted-ratio") ?? "0.25"),
    trainRecords:
      trainRecordsRaw === undefined
        ? undefined
        : integer(Number(trainRecordsRaw), "--train-records", 1),
    cycle0HoldoutDir: values.get("cycle0-holdout-dir"),
    pastAcceptedDirs: values
      .get("past-accepted-dirs")
      ?.split(",")
      .filter(Boolean),
  });
}

if (require.main === module) {
  runCli()
    .then((manifest) => process.stdout.write(`${canonicalJson(manifest)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
