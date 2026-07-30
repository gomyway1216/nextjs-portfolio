import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { TextDecoder } from "node:util";

import { positionKeyFromSfen } from "./sibling-data";
import { positionFromSfen, rulesCompleteLegalMoves } from "./shogi-sfen";
import { toSfen } from "./shogi-sfen-codec";

export const LEGAL_COUNT_MANIFEST_SCHEMA =
  "shogi-halfkp81-depth18-legal-count-manifest-v1" as const;
export const LEGAL_COUNT_ROW_SCHEMAS = Object.freeze([
  "shogi-floodgate-scratch-warm-teacher-v1",
  "shogi-nnue-selfplay-position-v1",
] as const);
export const LEGAL_COUNT_STATUS =
  "complete-research-data-only-not-deployment-authorization" as const;
export const LEGAL_COUNT_TOOL_RELATIVE_PATH =
  "ml/enrich_halfkp81_depth18_legal_counts.ts" as const;
export const LEGAL_COUNT_RULES_CLOSURE_RELATIVE_PATHS = Object.freeze([
  LEGAL_COUNT_TOOL_RELATIVE_PATH,
  "ml/sibling-data.ts",
  "ml/usi-multipv.ts",
  "ml/shogi-sfen.ts",
  "ml/shogi-sfen-codec.ts",
  "src/components/game/ShogiImproved/GenerateMovesImproved.ts",
  "src/components/game/ShogiImproved/KyokumenImproved.ts",
  "src/components/game/ShogiImproved/PromotionRulesImproved.ts",
  "src/components/game/ShogiImproved/MoveListImproved.ts",
  "src/components/game/ShogiImproved/TTEntryImproved.ts",
  "src/components/game/ShogiImproved/types.ts",
] as const);

const SHA256_RE = /^[0-9a-f]{64}$/;
const PREFIXED_SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const READ_BUFFER_BYTES = 1024 * 1024;
const MAX_LINE_BYTES = 16 * 1024 * 1024;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
type LegalCountRowSchema = (typeof LEGAL_COUNT_ROW_SCHEMAS)[number];

export interface FileIdentity {
  readonly bytes: number;
  readonly sha256: string;
}

export interface HeldSourceIdentity extends FileIdentity {
  readonly path: string;
  readonly relative_path: string;
  readonly held_read_only_descriptor: true;
  readonly stable_double_read: true;
}

export interface EnrichLegalCountsOptions {
  readonly input: string;
  readonly inputBytes: number;
  readonly inputSha256: string;
  readonly inputRows: number;
  readonly output: string;
  readonly manifest: string;
}

export interface LegalCountManifest {
  readonly schema: typeof LEGAL_COUNT_MANIFEST_SCHEMA;
  readonly status: typeof LEGAL_COUNT_STATUS;
  readonly tool: HeldSourceIdentity;
  readonly rules_closure: readonly HeldSourceIdentity[];
  readonly input: Readonly<
    FileIdentity & {
      path: string;
      rows: number;
      row_schema: LegalCountRowSchema;
      held_read_only_descriptor: true;
      stable_double_read: true;
    }
  >;
  readonly output: Readonly<
    FileIdentity & {
      file: string;
      rows: number;
      row_schema: LegalCountRowSchema;
      added_field: "legal_move_count";
      input_order_preserved: true;
    }
  >;
  readonly accounting: Readonly<{
    side_to_move_b: number;
    side_to_move_w: number;
    legal_move_count_at_most_one: number;
    legal_move_count_zero: number;
    legal_move_count_one: number;
  }>;
  readonly validation: Readonly<{
    canonical_jsonl: true;
    canonical_sfen_roundtrip: true;
    ply_matches_move_number_minus_one: true;
    position_id_matches_semantic_sfen: true;
    recorded_moves_legal: true;
    duplicate_position_ids: 0;
    rules_authority: "ml/shogi-sfen.ts#rulesCompleteLegalMoves";
    source_jsonl_contract:
      | "fixed-schema-compact-canonical-v1"
      | "recursive-byte-sorted-canonical-v1";
  }>;
  readonly publication: "create-only-temp-fsync-hardlink-manifest-last-v1";
}

interface HeldSourceClosure {
  readonly identities: readonly HeldSourceIdentity[];
  readonly handles: readonly number[];
}

function fail(message: string): never {
  throw new Error(message);
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Canonical compact JSON used by both the input boundary and published files.
 * Object keys are recursively ordered by UTF-8 bytes; unsupported JSON values,
 * sparse arrays, non-finite numbers, and negative zero fail closed.
 */
export function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      return fail(
        "canonical JSON rejects non-finite numbers and negative zero",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        return fail("canonical JSON rejects sparse arrays");
      }
    }
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (!isPlainObject(value)) {
    return fail(`canonical JSON rejects ${typeof value}`);
  }
  const keys = Object.keys(value).sort(compareBytewise);
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function requiredSafeInteger(
  value: unknown,
  label: string,
  minimum = 0,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    return fail(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return fail(`${label} must be a non-empty string`);
  }
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys or key order differ from the fixed schema`);
  }
}

function requiredInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) fail(`${label} must be a safe integer`);
  return value as number;
}

function fixedWdlTeacherJson(
  value: Record<string, unknown>,
  lineNumber: number,
): string {
  const label = `input line ${lineNumber}`;
  const withMate = Object.prototype.hasOwnProperty.call(value, "mate");
  exactKeys(
    value,
    [
      "schema",
      "split",
      "game_id",
      "game_sha256",
      "position_id",
      "sfen",
      "ply",
      "played_move",
      "ratings",
      "cp",
      "bestmove",
      "depth",
      ...(withMate ? ["mate"] : []),
      "outcome",
    ],
    label,
  );
  if (
    value.schema !== "shogi-floodgate-scratch-warm-teacher-v1" ||
    !["train", "val", "test"].includes(String(value.split))
  ) {
    fail(`${label} fixed WDL schema or split is invalid`);
  }
  const gameId = requiredString(value.game_id, `${label}.game_id`);
  const gameSha256 = requiredString(value.game_sha256, `${label}.game_sha256`);
  const positionId = requiredString(value.position_id, `${label}.position_id`);
  if (
    !PREFIXED_SHA256_RE.test(gameId) ||
    !SHA256_RE.test(gameSha256) ||
    !PREFIXED_SHA256_RE.test(positionId)
  ) {
    fail(`${label} fixed WDL identities are invalid`);
  }
  const ratings = value.ratings;
  if (!isPlainObject(ratings)) fail(`${label}.ratings must be an object`);
  exactKeys(ratings, ["sente", "gote"], `${label}.ratings`);
  const outcome = value.outcome;
  if (outcome !== 0 && outcome !== 0.5 && outcome !== 1) {
    fail(`${label}.outcome must be 0.0, 0.5, or 1.0`);
  }
  const entries: string[] = [
    `"schema":${JSON.stringify(value.schema)}`,
    `"split":${JSON.stringify(value.split)}`,
    `"game_id":${JSON.stringify(gameId)}`,
    `"game_sha256":${JSON.stringify(gameSha256)}`,
    `"position_id":${JSON.stringify(positionId)}`,
    `"sfen":${JSON.stringify(requiredString(value.sfen, `${label}.sfen`))}`,
    `"ply":${requiredSafeInteger(value.ply, `${label}.ply`)}`,
    `"played_move":${JSON.stringify(
      requiredString(value.played_move, `${label}.played_move`),
    )}`,
    `"ratings":{"sente":${requiredInteger(
      ratings.sente,
      `${label}.ratings.sente`,
    )},"gote":${requiredInteger(ratings.gote, `${label}.ratings.gote`)}}`,
    `"cp":${requiredInteger(value.cp, `${label}.cp`)}`,
    `"bestmove":${JSON.stringify(
      requiredString(value.bestmove, `${label}.bestmove`),
    )}`,
    `"depth":${requiredSafeInteger(value.depth, `${label}.depth`, 1)}`,
  ];
  if (withMate) {
    entries.push(`"mate":${requiredInteger(value.mate, `${label}.mate`)}`);
  }
  entries.push(`"outcome":${(outcome as number).toFixed(1)}`);
  return `{${entries.join(",")}}`;
}

function validateSourceCanonicalJson(
  value: Record<string, unknown>,
  text: string,
  lineNumber: number,
): {
  readonly schema: LegalCountRowSchema;
  readonly contract:
    "fixed-schema-compact-canonical-v1" | "recursive-byte-sorted-canonical-v1";
} {
  if (value.schema === "shogi-floodgate-scratch-warm-teacher-v1") {
    if (fixedWdlTeacherJson(value, lineNumber) !== text) {
      fail(`input line ${lineNumber} is not fixed-schema canonical JSON`);
    }
    return {
      schema: value.schema,
      contract: "fixed-schema-compact-canonical-v1",
    };
  }
  if (value.schema === "shogi-nnue-selfplay-position-v1") {
    if (canonicalJson(value) !== text) {
      fail(`input line ${lineNumber} is not canonical JSON`);
    }
    return {
      schema: value.schema,
      contract: "recursive-byte-sorted-canonical-v1",
    };
  }
  return fail(`input line ${lineNumber} row schema mismatch`);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameHeldFile(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function validateInputStat(stat: fs.BigIntStats, expectedBytes: number): void {
  if (!stat.isFile()) fail("input must be a regular file");
  if (stat.size !== BigInt(expectedBytes)) {
    fail("input byte length differs from the authenticated identity");
  }
}

function readHeldDescriptor(descriptor: number, bytes: number): Buffer {
  const output = Buffer.allocUnsafe(bytes);
  let offset = 0;
  while (offset < bytes) {
    const read = fs.readSync(
      descriptor,
      output,
      offset,
      bytes - offset,
      offset,
    );
    if (read === 0) fail("rules-closure source ended during held read");
    offset += read;
  }
  return output;
}

function bindRulesClosure(): HeldSourceClosure {
  const repositoryRoot = path.resolve(__dirname, "..");
  const handles: number[] = [];
  const identities: HeldSourceIdentity[] = [];
  try {
    for (const relativePath of LEGAL_COUNT_RULES_CLOSURE_RELATIVE_PATHS) {
      const absolute = path.resolve(repositoryRoot, relativePath);
      if (
        absolute !== path.join(repositoryRoot, relativePath) ||
        !absolute.startsWith(`${repositoryRoot}${path.sep}`)
      ) {
        fail(`rules-closure path escapes repository: ${relativePath}`);
      }
      const beforePath = fs.lstatSync(absolute, { bigint: true });
      if (!beforePath.isFile() || beforePath.isSymbolicLink()) {
        fail(
          `rules-closure source is not a regular non-symlink: ${relativePath}`,
        );
      }
      const descriptor = fs.openSync(
        absolute,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
      handles.push(descriptor);
      const before = fs.fstatSync(descriptor, { bigint: true });
      if (
        !before.isFile() ||
        before.dev !== beforePath.dev ||
        before.ino !== beforePath.ino ||
        before.size > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        fail(`rules-closure source changed during open: ${relativePath}`);
      }
      const bytes = Number(before.size);
      const first = readHeldDescriptor(descriptor, bytes);
      const second = readHeldDescriptor(descriptor, bytes);
      const after = fs.fstatSync(descriptor, { bigint: true });
      const afterPath = fs.lstatSync(absolute, { bigint: true });
      if (
        !sameHeldFile(before, after) ||
        afterPath.dev !== before.dev ||
        afterPath.ino !== before.ino ||
        !first.equals(second)
      ) {
        fail(
          `rules-closure source changed during stable read: ${relativePath}`,
        );
      }
      identities.push(
        Object.freeze({
          path: absolute,
          relative_path: relativePath,
          bytes,
          sha256: sha256(first),
          held_read_only_descriptor: true as const,
          stable_double_read: true as const,
        }),
      );
    }
    return {
      identities: Object.freeze(identities),
      handles: Object.freeze(handles),
    };
  } catch (error) {
    for (const descriptor of handles) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Preserve the binding error.
      }
    }
    throw error;
  }
}

function closeRulesClosure(closure: HeldSourceClosure): void {
  for (const descriptor of closure.handles) {
    try {
      fs.closeSync(descriptor);
    } catch {
      // Descriptor closure does not change the already authenticated content.
    }
  }
}

async function createTemporary(output: string): Promise<{
  readonly path: string;
  readonly handle: fs.promises.FileHandle;
}> {
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const temporary = path.join(
    path.dirname(output),
    `.${path.basename(output)}.tmp-${process.pid}-${sha256(
      `${output}\0${Date.now()}\0${Math.random()}`,
    )}`,
  );
  const handle = await fs.promises.open(
    temporary,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW,
    0o600,
  );
  return {
    path: temporary,
    handle,
  };
}

async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await fs.promises.open(directory, fs.constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publishTemporary(
  temporary: string,
  handle: fs.promises.FileHandle,
  destination: string,
): Promise<void> {
  await handle.chmod(0o400);
  await handle.sync();
  await handle.close();
  let published = false;
  try {
    await fs.promises.link(temporary, destination);
    published = true;
    await fs.promises.unlink(temporary);
    await fsyncDirectory(path.dirname(destination));
  } catch (error) {
    if (published) {
      await fs.promises.unlink(destination).catch(() => undefined);
      await fsyncDirectory(path.dirname(destination)).catch(() => undefined);
    }
    await fs.promises.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function rollbackPublishedFile(
  destination: string,
  published: fs.BigIntStats,
): Promise<void> {
  const current = await fs.promises.lstat(destination, { bigint: true });
  if (!sameHeldFile(published, current)) {
    fail(`refusing to roll back changed published file: ${destination}`);
  }
  await fs.promises.unlink(destination);
  await fsyncDirectory(path.dirname(destination));
}

async function atomicCreateBytes(
  destination: string,
  bytes: Uint8Array,
): Promise<void> {
  const temporary = await createTemporary(destination);
  let open = true;
  try {
    await temporary.handle.writeFile(bytes);
    await publishTemporary(temporary.path, temporary.handle, destination);
    open = false;
  } catch (error) {
    if (open) await temporary.handle.close().catch(() => undefined);
    await fs.promises.unlink(temporary.path).catch(() => undefined);
    throw error;
  }
}

function validateAndEnrichRow(
  line: Buffer,
  lineNumber: number,
  seenPositionIds: Set<string>,
): {
  readonly bytes: Buffer;
  readonly side: "b" | "w";
  readonly legalMoveCount: number;
  readonly schema: LegalCountRowSchema;
  readonly sourceJsonlContract:
    "fixed-schema-compact-canonical-v1" | "recursive-byte-sorted-canonical-v1";
} {
  let text: string;
  try {
    text = UTF8.decode(line);
  } catch {
    return fail(`input line ${lineNumber} is not valid UTF-8`);
  }
  if (text.length === 0 || text.includes("\r") || text.includes("\0")) {
    return fail(`input line ${lineNumber} has invalid JSONL framing`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail(`input line ${lineNumber} is malformed JSON`);
  }
  if (!isPlainObject(value)) {
    return fail(`input line ${lineNumber} must be a JSON object`);
  }
  if (Object.prototype.hasOwnProperty.call(value, "legal_move_count")) {
    return fail(`input line ${lineNumber} already has legal_move_count`);
  }
  const source = validateSourceCanonicalJson(value, text, lineNumber);

  const sfen = requiredString(value.sfen, `input line ${lineNumber}.sfen`);
  const ply = requiredSafeInteger(value.ply, `input line ${lineNumber}.ply`);
  let parsed: ReturnType<typeof positionFromSfen>;
  try {
    parsed = positionFromSfen(sfen);
  } catch (error) {
    return fail(
      `input line ${lineNumber}.sfen is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (toSfen(parsed.position, parsed.moveNumber) !== sfen) {
    return fail(`input line ${lineNumber}.sfen is not canonical`);
  }
  if (ply !== parsed.moveNumber - 1) {
    return fail(`input line ${lineNumber}.ply does not match SFEN move number`);
  }

  const positionId = requiredString(
    value.position_id,
    `input line ${lineNumber}.position_id`,
  );
  if (positionId !== positionKeyFromSfen(sfen)) {
    return fail(
      `input line ${lineNumber}.position_id does not match canonical SFEN`,
    );
  }
  if (seenPositionIds.has(positionId)) {
    return fail(
      `input line ${lineNumber} duplicates position_id ${positionId}`,
    );
  }
  seenPositionIds.add(positionId);

  let legalMoves: ReturnType<typeof rulesCompleteLegalMoves>;
  try {
    legalMoves = rulesCompleteLegalMoves(parsed.position);
  } catch (error) {
    return fail(
      `input line ${lineNumber} legal enumeration failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const recordedMove = requiredString(
    source.schema === "shogi-floodgate-scratch-warm-teacher-v1"
      ? value.played_move
      : value.move,
    `input line ${lineNumber}.${
      source.schema === "shogi-floodgate-scratch-warm-teacher-v1"
        ? "played_move"
        : "move"
    }`,
  );
  if (!legalMoves.some((move) => move.usi === recordedMove)) {
    return fail(`input line ${lineNumber} recorded move is not legal`);
  }
  const legalMoveCount = legalMoves.length;
  const enriched = { ...value, legal_move_count: legalMoveCount };
  return {
    bytes: Buffer.from(`${canonicalJson(enriched)}\n`, "utf8"),
    side: sfen.split(" ")[1] as "b" | "w",
    legalMoveCount,
    schema: source.schema,
    sourceJsonlContract: source.contract,
  };
}

async function verifySecondRead(
  inputHandle: fs.promises.FileHandle,
  expectedBytes: number,
  expectedSha256: string,
  expectedRows: number,
): Promise<void> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES);
  let offset = 0;
  let rows = 0;
  while (offset < expectedBytes) {
    const length = Math.min(READ_BUFFER_BYTES, expectedBytes - offset);
    const { bytesRead } = await inputHandle.read(buffer, 0, length, offset);
    if (bytesRead === 0) fail("input ended during stable second read");
    const chunk = buffer.subarray(0, bytesRead);
    hash.update(chunk);
    let newline = chunk.indexOf(0x0a);
    while (newline !== -1) {
      rows += 1;
      newline = chunk.indexOf(0x0a, newline + 1);
    }
    offset += bytesRead;
  }
  if (rows !== expectedRows || hash.digest("hex") !== expectedSha256) {
    fail("input differs during stable second bytes/SHA/rows read");
  }
}

/**
 * Authenticate a held, read-only JSONL snapshot while enriching it. Nothing is
 * published until every row, the exact row count, SHA-256, byte length, and
 * before/after descriptor identity have passed.
 */
export async function enrichHalfkp81Depth18LegalCounts(
  options: Readonly<EnrichLegalCountsOptions>,
): Promise<Readonly<LegalCountManifest>> {
  const input = path.resolve(requiredString(options.input, "input"));
  const output = path.resolve(requiredString(options.output, "output"));
  const manifestPath = path.resolve(
    requiredString(options.manifest, "manifest"),
  );
  const expectedBytes = requiredSafeInteger(
    options.inputBytes,
    "inputBytes",
    1,
  );
  const expectedRows = requiredSafeInteger(options.inputRows, "inputRows", 1);
  const expectedSha256 = requiredString(options.inputSha256, "inputSha256");
  if (!SHA256_RE.test(expectedSha256)) {
    fail("inputSha256 must be a lowercase SHA-256 digest");
  }
  if (new Set([input, output, manifestPath]).size !== 3) {
    fail("input, output, and manifest must be distinct paths");
  }
  if (path.dirname(output) !== path.dirname(manifestPath)) {
    fail("output and manifest must share one publication directory");
  }
  for (const target of [output, manifestPath]) {
    if (fs.existsSync(target))
      fail(`create-only output already exists: ${target}`);
  }

  const rulesClosure = bindRulesClosure();
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") {
    closeRulesClosure(rulesClosure);
    fail("O_NOFOLLOW is required");
  }
  let inputHandle: fs.promises.FileHandle;
  let temporary: Awaited<ReturnType<typeof createTemporary>>;
  try {
    inputHandle = await fs.promises.open(
      input,
      fs.constants.O_RDONLY | noFollow,
    );
    temporary = await createTemporary(output);
  } catch (error) {
    closeRulesClosure(rulesClosure);
    throw error;
  }
  let inputOpen = true;
  let temporaryOpen = true;
  let publishedOutput: fs.BigIntStats | undefined;
  try {
    const before = await inputHandle.stat({ bigint: true });
    validateInputStat(before, expectedBytes);

    const inputHash = createHash("sha256");
    const outputHash = createHash("sha256");
    const readBuffer = Buffer.allocUnsafe(READ_BUFFER_BYTES);
    let pending = Buffer.alloc(0);
    let inputOffset = 0;
    let outputBytes = 0;
    let rows = 0;
    let sideB = 0;
    let sideW = 0;
    let zero = 0;
    let one = 0;
    let rowSchema: LegalCountRowSchema | undefined;
    let sourceJsonlContract:
      | "fixed-schema-compact-canonical-v1"
      | "recursive-byte-sorted-canonical-v1"
      | undefined;
    const seenPositionIds = new Set<string>();

    while (inputOffset < expectedBytes) {
      const length = Math.min(READ_BUFFER_BYTES, expectedBytes - inputOffset);
      const { bytesRead } = await inputHandle.read(
        readBuffer,
        0,
        length,
        inputOffset,
      );
      if (bytesRead === 0)
        fail("input ended before the authenticated byte length");
      const chunk = Buffer.from(readBuffer.subarray(0, bytesRead));
      inputHash.update(chunk);
      inputOffset += bytesRead;
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      if (pending.length > MAX_LINE_BYTES && pending.indexOf(0x0a) === -1) {
        fail("input contains an overlong JSONL row");
      }

      let newline = pending.indexOf(0x0a);
      while (newline !== -1) {
        const line = pending.subarray(0, newline);
        if (line.byteLength > MAX_LINE_BYTES) {
          fail("input contains an overlong JSONL row");
        }
        pending = pending.subarray(newline + 1);
        rows += 1;
        const enriched = validateAndEnrichRow(line, rows, seenPositionIds);
        await temporary.handle.write(enriched.bytes);
        outputHash.update(enriched.bytes);
        outputBytes += enriched.bytes.byteLength;
        if (enriched.side === "b") sideB += 1;
        else sideW += 1;
        if (enriched.legalMoveCount === 0) zero += 1;
        if (enriched.legalMoveCount === 1) one += 1;
        if (rowSchema === undefined) {
          rowSchema = enriched.schema;
          sourceJsonlContract = enriched.sourceJsonlContract;
        } else if (
          enriched.schema !== rowSchema ||
          enriched.sourceJsonlContract !== sourceJsonlContract
        ) {
          fail("input mixes row schemas or canonical JSONL contracts");
        }
        newline = pending.indexOf(0x0a);
      }
    }
    if (pending.length !== 0)
      fail("input must end with exactly one LF per row");
    if (rows !== expectedRows) {
      fail(
        `input row count ${rows} differs from authenticated ${expectedRows}`,
      );
    }
    if (inputHash.digest("hex") !== expectedSha256) {
      fail("input SHA-256 differs from the authenticated identity");
    }
    if (rowSchema === undefined || sourceJsonlContract === undefined) {
      fail("input has no rows");
    }
    await verifySecondRead(
      inputHandle,
      expectedBytes,
      expectedSha256,
      expectedRows,
    );
    const after = await inputHandle.stat({ bigint: true });
    if (!sameHeldFile(before, after)) fail("input changed while held open");
    await inputHandle.close();
    inputOpen = false;

    const outputIdentity = Object.freeze({
      bytes: outputBytes,
      sha256: outputHash.digest("hex"),
    });
    await publishTemporary(temporary.path, temporary.handle, output);
    temporaryOpen = false;
    publishedOutput = await fs.promises.lstat(output, { bigint: true });

    const result: LegalCountManifest = Object.freeze({
      schema: LEGAL_COUNT_MANIFEST_SCHEMA,
      status: LEGAL_COUNT_STATUS,
      tool: rulesClosure.identities[0],
      rules_closure: rulesClosure.identities,
      input: Object.freeze({
        path: input,
        bytes: expectedBytes,
        sha256: expectedSha256,
        rows: expectedRows,
        row_schema: rowSchema,
        held_read_only_descriptor: true as const,
        stable_double_read: true as const,
      }),
      output: Object.freeze({
        file: path.basename(output),
        ...outputIdentity,
        rows,
        row_schema: rowSchema,
        added_field: "legal_move_count" as const,
        input_order_preserved: true as const,
      }),
      accounting: Object.freeze({
        side_to_move_b: sideB,
        side_to_move_w: sideW,
        legal_move_count_at_most_one: zero + one,
        legal_move_count_zero: zero,
        legal_move_count_one: one,
      }),
      validation: Object.freeze({
        canonical_jsonl: true as const,
        canonical_sfen_roundtrip: true as const,
        ply_matches_move_number_minus_one: true as const,
        position_id_matches_semantic_sfen: true as const,
        recorded_moves_legal: true as const,
        duplicate_position_ids: 0 as const,
        rules_authority: "ml/shogi-sfen.ts#rulesCompleteLegalMoves" as const,
        source_jsonl_contract: sourceJsonlContract,
      }),
      publication: "create-only-temp-fsync-hardlink-manifest-last-v1" as const,
    });
    await atomicCreateBytes(
      manifestPath,
      Buffer.from(`${canonicalJson(result)}\n`, "utf8"),
    );
    publishedOutput = undefined;
    closeRulesClosure(rulesClosure);
    return result;
  } catch (error) {
    if (inputOpen) await inputHandle.close().catch(() => undefined);
    if (temporaryOpen) await temporary.handle.close().catch(() => undefined);
    await fs.promises.unlink(temporary.path).catch(() => undefined);
    if (publishedOutput !== undefined) {
      try {
        await rollbackPublishedFile(output, publishedOutput);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "enrichment failed and atomic output rollback also failed",
        );
      }
    }
    closeRulesClosure(rulesClosure);
    throw error;
  }
}

function cliArguments(argv: readonly string[]): Map<string, string> {
  const allowed = new Set([
    "input",
    "input-bytes",
    "input-sha256",
    "input-rows",
    "out",
    "manifest",
  ]);
  const values = new Map<string, string>();
  if (argv.length % 2 !== 0) fail("CLI arguments must be --name value pairs");
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (
      !token.startsWith("--") ||
      value.startsWith("--") ||
      value.length === 0
    ) {
      fail("CLI arguments must be --name value pairs");
    }
    const name = token.slice(2);
    if (!allowed.has(name)) fail(`unknown argument --${name}`);
    if (values.has(name)) fail(`duplicate argument --${name}`);
    values.set(name, value);
  }
  return values;
}

function requiredCli(
  values: ReadonlyMap<string, string>,
  name: string,
): string {
  return values.get(name) ?? fail(`missing --${name}`);
}

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
): Promise<Readonly<LegalCountManifest>> {
  const values = cliArguments(argv);
  return enrichHalfkp81Depth18LegalCounts({
    input: requiredCli(values, "input"),
    inputBytes: Number(requiredCli(values, "input-bytes")),
    inputSha256: requiredCli(values, "input-sha256"),
    inputRows: Number(requiredCli(values, "input-rows")),
    output: requiredCli(values, "out"),
    manifest: requiredCli(values, "manifest"),
  });
}

if (require.main === module) {
  runCli()
    .then((manifest) => {
      process.stdout.write(`${canonicalJson(manifest)}\n`);
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
