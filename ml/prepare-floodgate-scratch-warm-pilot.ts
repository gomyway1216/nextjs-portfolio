/**
 * Prepare and label a small scratch-vs-warm experiment from the locked
 * Floodgate corpus. The split is decided before teacher evaluation and uses
 * both a game assignment and a semantic-position assignment. A position is
 * retained only when those assignments agree, making cross-split semantic
 * overlap impossible while preserving game-level isolation.
 *
 * Preparation (fast; no teacher is started):
 *   node -r tsx/cjs ml/prepare-floodgate-scratch-warm-pilot.ts prepare \
 *     --raw-lock ~/.codex/shogi-data/floodgate-q1-2026-raw-lock \
 *     --out-dir ~/.codex/shogi-runs/scratch-warm-pilot-10k --target 10000
 *
 * Teacher labels (explicit second step; resumable):
 *   node -r tsx/cjs ml/prepare-floodgate-scratch-warm-pilot.ts label \
 *     --input-dir ~/.codex/shogi-runs/scratch-warm-pilot-10k \
 *     --engine ~/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou \
 *     --eval-dir ~/.codex/shogi-data/floodgate-teacher-assets-v1/eval/eval \
 *     --depth 12 --engines 12
 * By default only train and val are labeled. Test remains blind unless the
 * caller explicitly adds `--splits train,val,test`.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  buildParentOccurrences,
  parseCsaGame,
  sha256,
  type ParsedCsaGame,
  type RawParentOccurrence,
} from "./import-csa-games";
import { UsiEngine } from "./generate-teacher";

export type ScratchWarmSplit = "train" | "val" | "test";

const SPLITS: readonly ScratchWarmSplit[] = ["train", "val", "test"];
const RAW_SCHEMA = "shogi-floodgate-scratch-warm-parent-v1";
const TEACHER_SCHEMA = "shogi-floodgate-scratch-warm-teacher-v1";
const SHA256_RE = /^[0-9a-f]{64}$/;

interface RawIndexEntry {
  bytes: number;
  game_id: string;
  object: string;
  sha256: string;
  url: string;
}

export interface PilotParentRow {
  schema: typeof RAW_SCHEMA;
  split: ScratchWarmSplit;
  game_id: string;
  game_sha256: string;
  position_id: string;
  sfen: string;
  ply: number;
  played_move: string;
  ratings: { sente: number; gote: number };
}

type TeacherRow = Omit<PilotParentRow, "schema"> & {
  schema: typeof TEACHER_SCHEMA;
  cp: number;
  bestmove: string;
  depth: number;
  mate?: number;
};

interface FileIdentity {
  path: string;
  bytes: number;
  sha256: string;
}

interface LabelManifest {
  schema: "shogi-floodgate-scratch-warm-label-manifest-v1";
  input: FileIdentity;
  engine: FileIdentity;
  eval: FileIdentity;
  depth: number;
  output: string;
}

interface PrepareOptions {
  rawLock: string;
  outDir: string;
  targets: Record<ScratchWarmSplit, number>;
  seed: string;
  minRating: number;
  minPly: number;
  maxPly: number;
  maxPerGame: number;
}

function digestUnit(domain: string, seed: string, value: string): number {
  const digest = sha256(`${domain}\0${seed}\0${value}`);
  return Number.parseInt(digest.slice(0, 12), 16) / 0x1_0000_0000_0000;
}

/** Deterministic 90/5/5 assignment. */
export function splitForId(
  value: string,
  seed = "scratch-warm-v1",
  domain = "game",
): ScratchWarmSplit {
  const unit = digestUnit(`scratch-warm-split-v1:${domain}`, seed, value);
  if (unit < 0.9) return "train";
  if (unit < 0.95) return "val";
  return "test";
}

function positionKey(sfen: string): string {
  return sfen.trim().split(/\s+/).slice(0, 3).join(" ");
}

function phase(ply: number): 0 | 1 | 2 {
  if (ply < 40) return 0;
  if (ply < 80) return 1;
  return 2;
}

/**
 * Choose a bounded, phase-balanced set from one already game-assigned game.
 * Semantic assignment concordance guarantees append-stable split isolation.
 */
export function selectParentsFromGame(
  game: ParsedCsaGame,
  split: ScratchWarmSplit,
  options: Pick<PrepareOptions, "seed" | "minPly" | "maxPly" | "maxPerGame">,
): PilotParentRow[] {
  const perPhase = [
    Math.ceil(options.maxPerGame / 3),
    Math.floor((options.maxPerGame + 1) / 3),
    Math.floor(options.maxPerGame / 3),
  ];
  const byPhase: PilotParentRow[][] = [[], [], []];
  for (const parent of buildParentOccurrences(game)) {
    if (parent.ply < options.minPly || parent.ply > options.maxPly) continue;
    const key = positionKey(parent.parent_sfen);
    if (splitForId(key, options.seed, "position") !== split) continue;
    byPhase[phase(parent.ply)].push(toPilotRow(parent, split));
  }
  for (const rows of byPhase) {
    rows.sort((left, right) => {
      const a = sha256(
        `scratch-warm-parent-order-v1\0${options.seed}\0${left.position_id}`,
      );
      const b = sha256(
        `scratch-warm-parent-order-v1\0${options.seed}\0${right.position_id}`,
      );
      return a < b ? -1 : a > b ? 1 : left.ply - right.ply;
    });
  }
  return byPhase.flatMap((rows, index) => rows.slice(0, perPhase[index]));
}

function toPilotRow(
  parent: RawParentOccurrence,
  split: ScratchWarmSplit,
): PilotParentRow {
  if (parent.ratings.sente === null || parent.ratings.gote === null) {
    throw new Error("pilot row requires both player ratings");
  }
  return {
    schema: RAW_SCHEMA,
    split,
    game_id: parent.game_id,
    game_sha256: parent.game_sha256,
    position_id: parent.position_id,
    sfen: parent.parent_sfen,
    ply: parent.ply,
    played_move: parent.played_move,
    ratings: { sente: parent.ratings.sente, gote: parent.ratings.gote },
  };
}

/** Throw if a semantic position occurs in more than one split. */
export function assertNoCrossSplitOverlap(
  rowsBySplit: Readonly<Record<ScratchWarmSplit, readonly PilotParentRow[]>>,
): void {
  const owners = new Map<string, ScratchWarmSplit>();
  for (const split of SPLITS) {
    for (const row of rowsBySplit[split]) {
      const key = positionKey(row.sfen);
      const owner = owners.get(key);
      if (owner && owner !== split) {
        throw new Error(
          `semantic cross-split overlap: ${owner}/${split} ${row.position_id}`,
        );
      }
      owners.set(key, split);
    }
  }
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function parseFiniteNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite`);
  return parsed;
}

function cliValue(
  argv: readonly string[],
  name: string,
  fallback?: string,
): string {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  if (index + 1 >= argv.length || argv[index + 1].startsWith("--"))
    throw new Error(`missing value for --${name}`);
  return argv[index + 1];
}

function quotas(target: number): Record<ScratchWarmSplit, number> {
  const val = Math.floor(target * 0.05);
  const test = Math.floor(target * 0.05);
  return { train: target - val - test, val, test };
}

/** Resolve either the bounded pilot total or explicit large-run split sizes. */
export function parsePrepareTargets(
  argv: readonly string[],
): Record<ScratchWarmSplit, number> {
  const explicitNames = ["train-target", "val-target", "test-target"] as const;
  const present = explicitNames.filter((name) => argv.includes(`--${name}`));
  if (present.length > 0) {
    if (argv.includes("--target"))
      throw new Error("--target cannot be combined with explicit split targets");
    if (present.length !== explicitNames.length)
      throw new Error(
        "--train-target, --val-target, and --test-target must be provided together",
      );
    return {
      train: parsePositiveInteger(
        cliValue(argv, "train-target"),
        "--train-target",
      ),
      val: parsePositiveInteger(cliValue(argv, "val-target"), "--val-target"),
      test: parsePositiveInteger(
        cliValue(argv, "test-target"),
        "--test-target",
      ),
    };
  }
  return quotas(
    parsePositiveInteger(cliValue(argv, "target", "10000"), "--target"),
  );
}

function canonicalJsonl(rows: readonly unknown[]): string {
  return rows.length === 0
    ? ""
    : `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

async function atomicWrite(file: string, data: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.promises.writeFile(temporary, data, { flag: "wx" });
    await fs.promises.rename(temporary, file);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

function fileIdentity(file: string): FileIdentity {
  const absolute = path.resolve(file);
  const bytes = fs.readFileSync(absolute);
  return { path: absolute, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

/**
 * Bind a resumable label output to its exact parents, teacher and depth.
 * Changing any preparation condition requires a new output instead of
 * silently treating stale position ids as completed.
 */
export async function ensureLabelManifest(
  manifestPath: string,
  outputPath: string,
  expected: LabelManifest,
): Promise<void> {
  const outputExists =
    fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
  if (!fs.existsSync(manifestPath)) {
    if (outputExists) {
      throw new Error(
        "teacher output exists without its input/teacher manifest; use a new run directory",
      );
    }
    await atomicWrite(manifestPath, `${JSON.stringify(expected, null, 2)}\n`);
    return;
  }
  const observed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(
      "teacher label manifest mismatch; preparation or teacher changed, so use a new run directory",
    );
  }
}

function validateIndexEntry(value: unknown, rawLock: string): RawIndexEntry {
  if (!value || typeof value !== "object")
    throw new Error("raw-lock csa_index row must be an object");
  const row = value as Partial<RawIndexEntry>;
  if (!Number.isSafeInteger(row.bytes) || (row.bytes as number) <= 0)
    throw new Error("invalid object byte count");
  if (typeof row.sha256 !== "string" || !SHA256_RE.test(row.sha256))
    throw new Error("invalid object SHA-256");
  if (
    typeof row.game_id !== "string" ||
    typeof row.url !== "string" ||
    typeof row.object !== "string"
  ) {
    throw new Error("incomplete csa_index row");
  }
  const absolute = path.resolve(rawLock, row.object);
  const expectedRoot = `${path.resolve(rawLock)}${path.sep}`;
  if (!absolute.startsWith(expectedRoot))
    throw new Error("raw-lock object escapes root");
  return row as RawIndexEntry;
}

async function prepare(options: PrepareOptions): Promise<void> {
  const manifestPath = path.join(options.rawLock, "manifest.json");
  const manifest = JSON.parse(
    await fs.promises.readFile(manifestPath, "utf8"),
  ) as { csa_index?: unknown[] };
  if (!Array.isArray(manifest.csa_index))
    throw new Error("raw-lock manifest has no csa_index");
  const entries = manifest.csa_index.map((row) =>
    validateIndexEntry(row, options.rawLock),
  );
  entries.sort((left, right) => {
    const a = sha256(
      `scratch-warm-game-order-v1\0${options.seed}\0${left.game_id}`,
    );
    const b = sha256(
      `scratch-warm-game-order-v1\0${options.seed}\0${right.game_id}`,
    );
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const wanted = options.targets;
  const rows: Record<ScratchWarmSplit, PilotParentRow[]> = {
    train: [],
    val: [],
    test: [],
  };
  const seen = new Set<string>();
  let scannedGames = 0;
  let strongGames = 0;
  let rejectedGames = 0;
  let duplicatePositions = 0;
  for (const entry of entries) {
    if (SPLITS.every((split) => rows[split].length >= wanted[split])) break;
    scannedGames++;
    const file = path.resolve(options.rawLock, entry.object);
    const bytes = await fs.promises.readFile(file);
    if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`raw-lock object identity mismatch: ${entry.object}`);
    }
    let game: ParsedCsaGame;
    try {
      game = parseCsaGame(bytes, {
        source: "floodgate",
        sourceUrl: entry.url,
        recordPath: entry.object,
        encoding: "utf-8",
      });
    } catch {
      rejectedGames++;
      continue;
    }
    const ratings = game.ratings;
    if (
      ratings.sente === null ||
      ratings.gote === null ||
      ratings.sente < options.minRating ||
      ratings.gote < options.minRating
    )
      continue;
    strongGames++;
    const split = splitForId(game.gameSha256, options.seed, "game");
    if (rows[split].length >= wanted[split]) continue;
    for (const row of selectParentsFromGame(game, split, options)) {
      const key = positionKey(row.sfen);
      if (seen.has(key)) {
        duplicatePositions++;
        continue;
      }
      seen.add(key);
      rows[split].push(row);
      if (rows[split].length >= wanted[split]) break;
    }
  }

  for (const split of SPLITS) {
    if (rows[split].length !== wanted[split]) {
      throw new Error(
        `insufficient ${split} rows: ${rows[split].length}/${wanted[split]}`,
      );
    }
  }
  assertNoCrossSplitOverlap(rows);
  const gameSets = Object.fromEntries(
    SPLITS.map((split) => [
      split,
      new Set(rows[split].map((row) => row.game_id)),
    ]),
  ) as Record<ScratchWarmSplit, Set<string>>;
  for (let i = 0; i < SPLITS.length; i++) {
    for (let j = i + 1; j < SPLITS.length; j++) {
      for (const id of gameSets[SPLITS[i]]) {
        if (gameSets[SPLITS[j]].has(id))
          throw new Error(`game cross-split overlap: ${id}`);
      }
    }
  }

  for (const split of SPLITS) {
    await atomicWrite(
      path.join(options.outDir, `${split}.parents.jsonl`),
      canonicalJsonl(rows[split]),
    );
  }
  const report = {
    schema: "shogi-floodgate-scratch-warm-preparation-report-v1",
    seed: options.seed,
    source_manifest: manifestPath,
    source_manifest_sha256: sha256(await fs.promises.readFile(manifestPath)),
    target: SPLITS.reduce((sum, split) => sum + wanted[split], 0),
    split_targets: wanted,
    split_rows: Object.fromEntries(
      SPLITS.map((split) => [split, rows[split].length]),
    ),
    split_games: Object.fromEntries(
      SPLITS.map((split) => [split, gameSets[split].size]),
    ),
    scanned_games: scannedGames,
    strong_games: strongGames,
    rejected_games: rejectedGames,
    duplicate_positions_discarded: duplicatePositions,
    semantic_cross_split_overlap: 0,
    game_cross_split_overlap: 0,
    filters: {
      minimum_rating_both_players: options.minRating,
      minimum_ply: options.minPly,
      maximum_ply: options.maxPly,
      maximum_parents_per_game: options.maxPerGame,
    },
    labels_generated: false,
  };
  await atomicWrite(
    path.join(options.outDir, "preparation-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function readJsonl(file: string): PilotParentRow[] {
  const text = fs.readFileSync(file, "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const row = JSON.parse(line) as PilotParentRow;
      if (row.schema !== RAW_SCHEMA)
        throw new Error(`${file}:${index + 1}: wrong schema`);
      return row;
    });
}

function validateTeacherRow(
  value: unknown,
  line: number,
  inputByPosition: ReadonlyMap<string, PilotParentRow>,
  depth: number,
): TeacherRow {
  if (!value || typeof value !== "object")
    throw new Error(`teacher output line ${line}: row must be an object`);
  const row = value as Partial<TeacherRow>;
  if (row.schema !== TEACHER_SCHEMA)
    throw new Error(`teacher output line ${line}: wrong schema`);
  if (typeof row.position_id !== "string")
    throw new Error(`teacher output line ${line}: missing position_id`);
  const parent = inputByPosition.get(row.position_id);
  if (!parent)
    throw new Error(
      `teacher output line ${line}: position is absent from bound input`,
    );
  for (const field of [
    "split",
    "game_id",
    "game_sha256",
    "sfen",
    "ply",
    "played_move",
  ] as const) {
    if (row[field] !== parent[field])
      throw new Error(
        `teacher output line ${line}: ${field} differs from bound input`,
      );
  }
  if (JSON.stringify(row.ratings) !== JSON.stringify(parent.ratings))
    throw new Error(
      `teacher output line ${line}: ratings differ from bound input`,
    );
  if (!Number.isInteger(row.cp))
    throw new Error(`teacher output line ${line}: cp must be an integer`);
  if (typeof row.bestmove !== "string" || row.bestmove.length === 0)
    throw new Error(`teacher output line ${line}: bestmove is missing`);
  if (row.depth !== depth)
    throw new Error(
      `teacher output line ${line}: depth differs from bound manifest`,
    );
  if (row.mate !== undefined && !Number.isInteger(row.mate))
    throw new Error(`teacher output line ${line}: mate must be an integer`);
  return row as TeacherRow;
}

function isIncompleteJsonObject(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{")) return false;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const character of trimmed) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack.pop() !== expected) return false;
    }
  }
  return inString || stack.length > 0;
}

/**
 * Recover only an unterminated, syntactically incomplete final JSON fragment.
 * Invalid terminated lines and syntactically complete but invalid rows fail
 * closed. A complete final row missing only its LF is preserved and delimited.
 */
export function recoverAndReadTeacherRows(
  output: string,
  input: readonly PilotParentRow[],
  depth: number,
): TeacherRow[] {
  if (!fs.existsSync(output)) return [];
  let bytes = fs.readFileSync(output);
  if (bytes.byteLength === 0) return [];
  if (bytes[bytes.byteLength - 1] !== 0x0a) {
    const lastLf = bytes.lastIndexOf(0x0a);
    const tail = bytes.subarray(lastLf + 1).toString("utf8");
    try {
      JSON.parse(tail);
      fs.appendFileSync(output, "\n");
      bytes = Buffer.concat([bytes, Buffer.from("\n")]);
    } catch {
      if (!isIncompleteJsonObject(tail))
        throw new Error(
          "teacher output final row is complete but invalid JSON",
        );
      const completeBytes = lastLf + 1;
      fs.truncateSync(output, completeBytes);
      bytes = bytes.subarray(0, completeBytes);
    }
  }

  const inputByPosition = new Map<string, PilotParentRow>();
  for (const row of input) {
    if (inputByPosition.has(row.position_id))
      throw new Error(`bound input repeats position_id ${row.position_id}`);
    inputByPosition.set(row.position_id, row);
  }
  const lines = bytes.toString("utf8").split("\n");
  lines.pop();
  const result: TeacherRow[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].length === 0)
      throw new Error(`teacher output line ${index + 1}: blank row`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]);
    } catch {
      throw new Error(`teacher output line ${index + 1}: invalid JSON`);
    }
    const row = validateTeacherRow(parsed, index + 1, inputByPosition, depth);
    if (seen.has(row.position_id))
      throw new Error(
        `teacher output line ${index + 1}: duplicate position_id`,
      );
    seen.add(row.position_id);
    result.push(row);
  }
  return result;
}

async function labelSplit(options: {
  input: string;
  output: string;
  engineBin: string;
  evalDir: string;
  depth: number;
  engines: number;
  engineIdentity: FileIdentity;
  evalIdentity: FileIdentity;
}): Promise<void> {
  const inputIdentity = fileIdentity(options.input);
  const labelManifest: LabelManifest = {
    schema: "shogi-floodgate-scratch-warm-label-manifest-v1",
    input: inputIdentity,
    engine: options.engineIdentity,
    eval: options.evalIdentity,
    depth: options.depth,
    output: path.resolve(options.output),
  };
  await ensureLabelManifest(
    `${options.output}.manifest.json`,
    options.output,
    labelManifest,
  );
  const input = readJsonl(options.input);
  const existing = recoverAndReadTeacherRows(
    options.output,
    input,
    options.depth,
  );
  const completed = new Set(existing.map((row) => row.position_id));
  const pending = input.filter((row) => !completed.has(row.position_id));
  if (pending.length === 0) return;
  await fs.promises.mkdir(path.dirname(options.output), { recursive: true });
  const pool = Array.from(
    { length: options.engines },
    () =>
      new UsiEngine({ engineBin: options.engineBin, evalDir: options.evalDir }),
  );
  await Promise.all(pool.map((engine) => engine.init()));
  const fd = fs.openSync(options.output, "a");
  try {
    // A one-position-per-engine Promise.all makes every engine wait for the
    // slowest position in each tiny batch. Use a larger deterministic window
    // with a shared cursor so idle engines immediately take the next position;
    // write only after the whole window completes to preserve input order.
    const windowSize = options.engines * 16;
    for (let offset = 0; offset < pending.length; offset += windowSize) {
      const chunk = pending.slice(offset, offset + windowSize);
      const results: Array<{
        row: PilotParentRow;
        result: Awaited<ReturnType<UsiEngine["evaluate"]>>;
      }> = new Array(chunk.length);
      let cursor = 0;
      await Promise.all(
        pool.map(async (engine) => {
          for (;;) {
            const index = cursor++;
            if (index >= chunk.length) return;
            const row = chunk[index];
            try {
              results[index] = {
                row,
                result: await engine.evaluate(row.sfen, options.depth),
              };
            } catch {
              await engine.restart();
              results[index] = {
                row,
                result: await engine.evaluate(row.sfen, options.depth),
              };
            }
          }
        }),
      );
      const output: TeacherRow[] = [];
      for (const { row, result } of results) {
        if (
          !result ||
          result.bestmove === "resign" ||
          result.bestmove === "win"
        )
          continue;
        output.push({
          ...row,
          schema: TEACHER_SCHEMA,
          cp: result.cp,
          bestmove: result.bestmove,
          depth: options.depth,
          ...(result.mate === undefined ? {} : { mate: result.mate }),
        });
      }
      if (output.length > 0) {
        fs.writeSync(fd, canonicalJsonl(output));
        fs.fsyncSync(fd);
      }
      process.stdout.write(
        `[label] ${path.basename(options.input)} ${Math.min(offset + chunk.length, pending.length)}/${pending.length}\n`,
      );
    }
  } finally {
    fs.closeSync(fd);
    pool.forEach((engine) => engine.quit());
  }
}

export function parseLabelSplits(value = "train,val"): ScratchWarmSplit[] {
  const parts = value.split(",");
  if (parts.length === 0 || parts.some((part) => part.length === 0))
    throw new Error("--splits must be a comma-separated non-empty split list");
  const seen = new Set<string>();
  const result: ScratchWarmSplit[] = [];
  for (const part of parts) {
    if (!SPLITS.includes(part as ScratchWarmSplit))
      throw new Error(`unsupported --splits name: ${part}`);
    if (seen.has(part)) throw new Error(`duplicate --splits name: ${part}`);
    seen.add(part);
    result.push(part as ScratchWarmSplit);
  }
  return result;
}

async function label(argv: readonly string[]): Promise<void> {
  const selectedSplits = parseLabelSplits(
    cliValue(argv, "splits", "train,val"),
  );
  const inputDir = path.resolve(cliValue(argv, "input-dir"));
  const homeAssets = path.join(
    os.homedir(),
    ".codex",
    "shogi-data",
    "floodgate-teacher-assets-v1",
  );
  const engineBin = path.resolve(
    cliValue(argv, "engine", path.join(homeAssets, "bin", "yaneuraou")),
  );
  const evalDir = path.resolve(
    cliValue(argv, "eval-dir", path.join(homeAssets, "eval", "eval")),
  );
  const depth = parsePositiveInteger(cliValue(argv, "depth", "12"), "--depth");
  const engines = parsePositiveInteger(
    cliValue(argv, "engines", "12"),
    "--engines",
  );
  if (!fs.statSync(engineBin).isFile())
    throw new Error(`engine is not a file: ${engineBin}`);
  if (!fs.statSync(evalDir).isDirectory())
    throw new Error(`eval dir is not a directory: ${evalDir}`);
  const evalFile = path.join(evalDir, "nn.bin");
  if (!fs.statSync(evalFile).isFile())
    throw new Error(`teacher eval is not a file: ${evalFile}`);
  const engineIdentity = fileIdentity(engineBin);
  const evalIdentity = fileIdentity(evalFile);
  for (const split of selectedSplits) {
    await labelSplit({
      input: path.join(inputDir, `${split}.parents.jsonl`),
      output: path.join(inputDir, `${split}.teacher.jsonl`),
      engineBin,
      evalDir,
      depth,
      engines,
      engineIdentity,
      evalIdentity,
    });
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const command = argv[0];
  if (command === "prepare") {
    const targets = parsePrepareTargets(argv);
    const totalTarget = SPLITS.reduce((sum, split) => sum + targets[split], 0);
    if (!Number.isSafeInteger(totalTarget))
      throw new Error("combined split target exceeds the safe integer range");
    if (totalTarget > 10_000 && !argv.includes("--allow-large")) {
      throw new Error("target above 10000 requires explicit --allow-large");
    }
    const minPly = parsePositiveInteger(
      cliValue(argv, "min-ply", "12"),
      "--min-ply",
    );
    const maxPly = parsePositiveInteger(
      cliValue(argv, "max-ply", "120"),
      "--max-ply",
    );
    if (maxPly < minPly) throw new Error("--max-ply must be >= --min-ply");
    await prepare({
      rawLock: path.resolve(cliValue(argv, "raw-lock")),
      outDir: path.resolve(cliValue(argv, "out-dir")),
      targets,
      seed: cliValue(argv, "seed", "scratch-warm-v1"),
      minRating: parseFiniteNumber(
        cliValue(argv, "min-rating", "3000"),
        "--min-rating",
      ),
      minPly,
      maxPly,
      maxPerGame: parsePositiveInteger(
        cliValue(argv, "max-per-game", "40"),
        "--max-per-game",
      ),
    });
    return;
  }
  if (command === "label") {
    await label(argv);
    return;
  }
  throw new Error(
    "usage: prepare-floodgate-scratch-warm-pilot.ts <prepare|label> [options]",
  );
}

const isDirectCli =
  require.main === module ||
  (process.argv[1] !== undefined &&
    path.resolve(process.argv[1]) === path.resolve(__filename));
if (isDirectCli) {
  main().catch((error) => {
    process.stderr.write(`${(error as Error).stack ?? error}\n`);
    process.exitCode = 1;
  });
}
