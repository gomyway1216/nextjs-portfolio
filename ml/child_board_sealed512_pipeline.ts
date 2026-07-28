/**
 * Label-blind sealed-512 preparation and content-addressed teacher shards.
 *
 * Production callers must first authenticate raw rows with
 * parseAuthenticatedFloodgateFreshFinalRows.  This module then drops complete
 * games on any known-eval parent/child overlap, performs the fixed 4-per-game
 * hash selection, and reuses labelAllLegalMoves for each selected parent.
 * Candidate scores are never accepted or computed here.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  BROWSER_CONFUSION_PARENT_SCHEMA,
  labelAllLegalMoves,
  type FixedMoveTeacher,
  type LabeledConfusionParent,
  type SelectedConfusionParent,
} from "./build-browser-confusion-ranking-teacher";
import {
  parseAuthenticatedFloodgateFreshFinalRows,
  type FloodgateFreshFinalRawIdentity,
  type FloodgateTrainingParent,
} from "./floodgate-training-row-validation";
import {
  compareBytewise,
  positionKeyFromSfen,
  type SiblingRecord,
} from "./sibling-data";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";

export const CLEAN_RECEIPT_SCHEMA =
  "shogi-child-board-strength-candidate-sealed-clean-derivative-receipt-v1" as const;
export const SELECTION_RECEIPT_SCHEMA =
  "shogi-child-board-strength-candidate-sealed-selection-receipt-v1" as const;
export const LABEL_SHARD_SCHEMA =
  "shogi-child-board-strength-candidate-sealed-label-shard-v1" as const;
export const LABEL_SHARD_RECEIPT_SCHEMA =
  "shogi-child-board-strength-candidate-sealed-label-shard-receipt-v1" as const;
export const LABEL_RECEIPT_SCHEMA =
  "shogi-child-board-strength-candidate-sealed-label-receipt-v1" as const;
export const SEALED_HASH_DOMAIN = "capacity-sealed-v1:" as const;
export const FIXED_SEALED_PARENTS = 512;
export const FIXED_SHARDS = 16;
export const FIXED_PARENTS_PER_SHARD = 32;
export const FIXED_TEACHER_DEPTH = 12;

const SHA256_RE = /^[0-9a-f]{64}$/u;

export interface CleanDerivative {
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
  readonly rawLines: readonly Uint8Array[];
  readonly bytes: Uint8Array;
  readonly droppedGameIds: readonly string[];
  readonly receipt: Readonly<Record<string, unknown>>;
}

export interface RegisteredCleanExpected {
  readonly bytes: number;
  readonly sha256: string;
  readonly parents: number;
  readonly games: number;
  readonly game_ids_sha256: string;
  readonly parent_ids_sha256: string;
  readonly position_ids_sha256: string;
  readonly known_eval_semantic_overlap: 0;
}

export interface Selection {
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
  readonly parentIdsBytes: Uint8Array;
  readonly receipt: Readonly<Record<string, unknown>>;
}

export interface PreparationPaths {
  readonly cleanDerivative: string;
  readonly cleanDerivativeReceipt: string;
  readonly selectedParentIds: string;
  readonly selectionReceipt: string;
}

export interface ShardShape {
  readonly parents: number;
  readonly shards: number;
  readonly parentsPerShard: number;
}

export interface FileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ShardBinding {
  readonly parentProtocolSha256: string;
  readonly cleanDerivativeReceiptSha256: string;
  readonly selectionReceiptSha256: string;
  readonly legalEnumerator: FileIdentity;
  readonly teacherReceipt: FileIdentity;
  readonly depth: number;
}

export interface PublishedShard {
  readonly index: number;
  readonly contentAddress: string;
  readonly output: FileIdentity;
  readonly receipt: FileIdentity;
  readonly parents: number;
  readonly records: number;
  readonly recovered: boolean;
}

export interface LabelShardOptions {
  readonly selectedRows: readonly Readonly<FloodgateTrainingParent>[];
  readonly shardIndex: number;
  readonly shape?: ShardShape;
  readonly binding: ShardBinding;
  readonly shardDirectory: string;
  readonly receiptDirectory: string;
  readonly teacher: FixedMoveTeacher;
  /** Synthetic fixtures only; production must retain the default true. */
  readonly verifyBindingFiles?: boolean;
  readonly labeler?: (
    parent: SelectedConfusionParent,
    teacher: FixedMoveTeacher,
    depth: number,
  ) => Promise<Pick<LabeledConfusionParent, "records">>;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactSha256(value: string, label: string): string {
  if (!SHA256_RE.test(value)) throw new Error(`${label} must be lowercase SHA-256`);
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("canonical JSON rejects non-finite or negative-zero numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort(compareBytewise)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(`canonical JSON rejects ${typeof value}`);
}

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

function identity(file: string, bytes: Uint8Array): FileIdentity {
  return Object.freeze({
    path: file,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  });
}

function identifierDigest(values: Iterable<string>): string {
  return sha256([...new Set(values)].sort(compareBytewise).join("\n"));
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
}

function exactShape(shape: ShardShape): ShardShape {
  if (
    !Number.isSafeInteger(shape.parents) ||
    !Number.isSafeInteger(shape.shards) ||
    !Number.isSafeInteger(shape.parentsPerShard) ||
    shape.parents <= 0 ||
    shape.shards <= 0 ||
    shape.parentsPerShard <= 0 ||
    shape.shards * shape.parentsPerShard !== shape.parents
  ) {
    throw new Error("sealed shard shape arithmetic mismatch");
  }
  return shape;
}

function fixedShape(): ShardShape {
  return Object.freeze({
    parents: FIXED_SEALED_PARENTS,
    shards: FIXED_SHARDS,
    parentsPerShard: FIXED_PARENTS_PER_SHARD,
  });
}

function validateRawLines(
  rows: readonly Readonly<FloodgateTrainingParent>[],
  rawLines: readonly Uint8Array[],
): void {
  if (rows.length !== rawLines.length || rows.length === 0) {
    throw new Error("authenticated rows/raw-line cardinality mismatch");
  }
  for (const [index, line] of rawLines.entries()) {
    if (
      !(line instanceof Uint8Array) ||
      line.byteLength < 2 ||
      line[line.byteLength - 1] !== 0x0a ||
      line.includes(0x0d) ||
      line.includes(0)
    ) {
      throw new Error(`authenticated raw line ${index + 1} framing mismatch`);
    }
  }
}

function semanticClosure(
  row: Readonly<FloodgateTrainingParent>,
): readonly string[] {
  const parsed = positionFromSfen(row.parent_sfen);
  const legal = rulesCompleteLegalMoves(parsed.position)
    .map((move) => move.usi)
    .sort(compareBytewise);
  if (legal.length === 0 || new Set(legal).size !== legal.length) {
    throw new Error(`parent ${row.parent_id} has invalid legal-move closure`);
  }
  const children = legal.map((move) =>
    positionKeyFromSfen(childSfenAfterUsi(row.parent_sfen, move)),
  );
  return [row.position_id, ...children];
}

/**
 * Drop an entire game when any parent or rules-complete legal child semantic
 * ID intersects the known-eval union. Surviving lines are preserved by value.
 */
export function buildCleanDerivative(
  rows: readonly Readonly<FloodgateTrainingParent>[],
  rawLines: readonly Uint8Array[],
  knownEvalPositionIds: ReadonlySet<string>,
): CleanDerivative {
  validateRawLines(rows, rawLines);
  if (!(knownEvalPositionIds instanceof Set)) {
    throw new Error("known-eval identifiers must be an immutable-call Set snapshot");
  }
  const droppedGames = new Set<string>();
  const seenParents = new Set<string>();
  for (const row of rows) {
    if (seenParents.has(row.parent_id)) throw new Error("raw parent_id is duplicated");
    seenParents.add(row.parent_id);
    if (semanticClosure(row).some((value) => knownEvalPositionIds.has(value))) {
      droppedGames.add(row.game_id);
    }
  }
  const keptRows: Readonly<FloodgateTrainingParent>[] = [];
  const keptLines: Uint8Array[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (droppedGames.has(rows[index].game_id)) continue;
    keptRows.push(rows[index]);
    keptLines.push(Uint8Array.from(rawLines[index]));
  }
  if (keptRows.length === 0) throw new Error("clean derivative is empty");
  const outputBytes = concatBytes(keptLines);
  const games = new Set(keptRows.map((row) => row.game_id));
  const positions = new Set(keptRows.map((row) => row.position_id));
  const receipt = Object.freeze({
    schema: CLEAN_RECEIPT_SCHEMA,
    status: "complete-label-blind-clean-derivative",
    policy:
      "drop-complete-game-on-known-eval-parent-or-rules-complete-child-overlap",
    input: Object.freeze({
      parents: rows.length,
      games: new Set(rows.map((row) => row.game_id)).size,
    }),
    output: Object.freeze({
      bytes: outputBytes.byteLength,
      sha256: sha256(outputBytes),
      parents: keptRows.length,
      games: games.size,
      game_ids_sha256: identifierDigest(games),
      parent_ids_sha256: identifierDigest(keptRows.map((row) => row.parent_id)),
      position_ids_sha256: identifierDigest(positions),
      known_eval_semantic_overlap: 0,
    }),
    dropped_games: Object.freeze({
      count: droppedGames.size,
      game_ids_sha256: identifierDigest(droppedGames),
    }),
    teacher_labels_opened: false,
    candidate_scores_opened: false,
    live_weights_changed: false,
  });
  return Object.freeze({
    rows: Object.freeze(keptRows),
    rawLines: Object.freeze(keptLines),
    bytes: outputBytes,
    droppedGameIds: Object.freeze([...droppedGames].sort(compareBytewise)),
    receipt,
  });
}

function rawLinesFromSnapshot(bytes: Uint8Array): readonly Uint8Array[] {
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    lines.push(Uint8Array.from(bytes.subarray(start, index + 1)));
    start = index + 1;
  }
  if (start !== bytes.byteLength || lines.length === 0) {
    throw new Error("authenticated snapshot LF framing mismatch");
  }
  return Object.freeze(lines);
}

/** Authenticate the protected raw snapshot before any semantic filtering. */
export function buildCleanDerivativeFromAuthenticatedSnapshot(
  bytes: Uint8Array,
  expectedIdentity: FloodgateFreshFinalRawIdentity,
  knownEvalPositionIds: ReadonlySet<string>,
): CleanDerivative {
  const rows = parseAuthenticatedFloodgateFreshFinalRows(bytes, expectedIdentity);
  return buildCleanDerivative(
    rows,
    rawLinesFromSnapshot(bytes),
    knownEvalPositionIds,
  );
}

/** Require the exact preregistered clean identity before any label generation. */
export function requireRegisteredCleanIdentity(
  clean: CleanDerivative,
  expected: RegisteredCleanExpected,
): void {
  const output = clean.receipt.output as Record<string, unknown>;
  const keys: readonly (keyof RegisteredCleanExpected)[] = [
    "bytes",
    "sha256",
    "parents",
    "games",
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
    "known_eval_semantic_overlap",
  ];
  if (
    keys.some((key) => output[key] !== expected[key]) ||
    clean.bytes.byteLength !== expected.bytes ||
    sha256(clean.bytes) !== expected.sha256
  ) {
    throw new Error("clean derivative differs from preregistered identity");
  }
}

/** Fixed priority selection: hash order, at most four parents per game. */
export function selectSealedParents(
  cleanRows: readonly Readonly<FloodgateTrainingParent>[],
  targetParents = FIXED_SEALED_PARENTS,
  maximumParentsPerGame = 4,
): Selection {
  if (
    !Number.isSafeInteger(targetParents) ||
    targetParents <= 0 ||
    !Number.isSafeInteger(maximumParentsPerGame) ||
    maximumParentsPerGame <= 0
  ) {
    throw new Error("sealed selection counts must be positive safe integers");
  }
  const ordered = [...cleanRows].sort((left, right) => {
    const leftHash = sha256(`${SEALED_HASH_DOMAIN}${left.parent_id}`);
    const rightHash = sha256(`${SEALED_HASH_DOMAIN}${right.parent_id}`);
    return compareBytewise(leftHash, rightHash) || compareBytewise(left.parent_id, right.parent_id);
  });
  const perGame = new Map<string, number>();
  const selected: Readonly<FloodgateTrainingParent>[] = [];
  for (const row of ordered) {
    if ((perGame.get(row.game_id) ?? 0) >= maximumParentsPerGame) continue;
    selected.push(row);
    perGame.set(row.game_id, (perGame.get(row.game_id) ?? 0) + 1);
    if (selected.length === targetParents) break;
  }
  if (selected.length !== targetParents) {
    throw new Error(`sealed selection incomplete: ${selected.length}/${targetParents}`);
  }
  const parentIdsBytes = Buffer.from(
    `${selected.map((row) => row.parent_id).join("\n")}\n`,
    "utf8",
  );
  const receipt = Object.freeze({
    schema: SELECTION_RECEIPT_SCHEMA,
    status: "complete-label-blind-sealed-parent-selection",
    hash_domain: SEALED_HASH_DOMAIN,
    maximum_parents_per_game: maximumParentsPerGame,
    parents: targetParents,
    games: new Set(selected.map((row) => row.game_id)).size,
    selected_parent_ids: Object.freeze({
      bytes: parentIdsBytes.byteLength,
      sha256: sha256(parentIdsBytes),
      identifiers_sha256: identifierDigest(selected.map((row) => row.parent_id)),
    }),
    teacher_labels_opened: false,
    candidate_scores_opened: false,
    live_weights_changed: false,
  });
  return Object.freeze({
    rows: Object.freeze(selected),
    parentIdsBytes,
    receipt,
  });
}

export function shardSlices(
  selected: readonly Readonly<FloodgateTrainingParent>[],
  shape: ShardShape = fixedShape(),
): readonly (readonly Readonly<FloodgateTrainingParent>[])[] {
  exactShape(shape);
  if (
    selected.length !== shape.parents ||
    new Set(selected.map((row) => row.parent_id)).size !== selected.length
  ) {
    throw new Error("selected parents do not match the exact shard membership");
  }
  return Object.freeze(
    Array.from({ length: shape.shards }, (_, index) =>
      Object.freeze(
        selected.slice(
          index * shape.parentsPerShard,
          (index + 1) * shape.parentsPerShard,
        ),
      ),
    ),
  );
}

function validateFileIdentity(value: FileIdentity, label: string): void {
  if (
    typeof value.path !== "string" ||
    value.path.length === 0 ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes <= 0
  ) {
    throw new Error(`${label} file identity is malformed`);
  }
  exactSha256(value.sha256, `${label} SHA-256`);
}

function contentAddressFor(
  index: number,
  total: number,
  members: readonly Readonly<FloodgateTrainingParent>[],
  binding: ShardBinding,
): string {
  exactSha256(binding.parentProtocolSha256, "parent protocol");
  exactSha256(binding.cleanDerivativeReceiptSha256, "clean derivative receipt");
  exactSha256(binding.selectionReceiptSha256, "selection receipt");
  validateFileIdentity(binding.legalEnumerator, "legal enumerator");
  validateFileIdentity(binding.teacherReceipt, "teacher receipt");
  if (!Number.isSafeInteger(binding.depth) || binding.depth <= 0) {
    throw new Error("teacher depth must be a positive safe integer");
  }
  return sha256(
    canonicalJson({
      schema: LABEL_SHARD_SCHEMA,
      shard: { index, total },
      ordered_parent_ids: members.map((row) => row.parent_id),
      parent_protocol_sha256: binding.parentProtocolSha256,
      clean_derivative_receipt_sha256: binding.cleanDerivativeReceiptSha256,
      selection_receipt_sha256: binding.selectionReceiptSha256,
      legal_enumerator: binding.legalEnumerator,
      teacher_receipt: binding.teacherReceipt,
      depth: binding.depth,
    }),
  );
}

function selectedParent(
  row: Readonly<FloodgateTrainingParent>,
  sourceLine: number,
): SelectedConfusionParent {
  const legal = rulesCompleteLegalMoves(positionFromSfen(row.parent_sfen).position)
    .map((move) => move.usi)
    .sort(compareBytewise);
  if (legal.length < 2 || new Set(legal).size !== legal.length) {
    throw new Error(`sealed parent ${row.parent_id} has fewer than two legal moves`);
  }
  return Object.freeze({
    schema: BROWSER_CONFUSION_PARENT_SCHEMA,
    source_line: sourceLine,
    game_id: row.game_id,
    parent_id: row.parent_id,
    position_id: row.position_id,
    parent_sfen: row.parent_sfen,
    parent_ply: row.ply,
    source_teacher: Object.freeze({
      cp: 0,
      bestmove: row.played_move,
      depth: FIXED_TEACHER_DEPTH,
    }),
    browser: Object.freeze({
      bestmove: row.played_move,
      score: 0,
      completed_depth: 0,
      nodes: 0,
      leaves: 0,
    }),
    legal_moves: Object.freeze(legal),
  });
}

async function atomicCreate(file: string, bytes: Uint8Array): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.tmp-${process.pid}-${createHash("sha256")
      .update(`${file}\0${Date.now()}\0${Math.random()}`)
      .digest("hex")}`,
  );
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.promises.link(temporary, file);
    await fs.promises.unlink(temporary);
    const directory = await fs.promises.open(path.dirname(file), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.promises.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function ensureExactPublished(
  file: string,
  bytes: Uint8Array,
): Promise<FileIdentity> {
  if (fs.existsSync(file)) {
    const existing = await readIdentity(file);
    const expected = identity(file, bytes);
    if (
      existing.identity.bytes !== expected.bytes ||
      existing.identity.sha256 !== expected.sha256
    ) {
      throw new Error(`existing create-only output differs: ${file}`);
    }
    return existing.identity;
  }
  await atomicCreate(file, bytes);
  return identity(file, bytes);
}

async function readIdentity(file: string): Promise<Readonly<{ identity: FileIdentity; bytes: Buffer }>> {
  const before = await fs.promises.lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`immutable file is not a regular non-symlink: ${file}`);
  }
  const bytes = await fs.promises.readFile(file);
  const after = await fs.promises.lstat(file);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error(`immutable file changed while reading: ${file}`);
  }
  return Object.freeze({ identity: identity(file, bytes), bytes });
}

async function verifyShardBindingFiles(binding: ShardBinding): Promise<void> {
  for (const [label, registered] of [
    ["legal enumerator", binding.legalEnumerator],
    ["teacher receipt", binding.teacherReceipt],
  ] as const) {
    const actual = await readIdentity(registered.path);
    if (
      actual.identity.bytes !== registered.bytes ||
      actual.identity.sha256 !== registered.sha256
    ) {
      throw new Error(`${label} byte/SHA identity mismatch`);
    }
  }
}

function parseJson(bytes: Uint8Array, label: string): Record<string, unknown> {
  if (
    bytes.byteLength === 0 ||
    bytes[bytes.byteLength - 1] !== 0x0a ||
    Buffer.from(bytes).includes(0x0d) ||
    Buffer.from(bytes).includes(0)
  ) {
    throw new Error(`${label} JSON framing mismatch`);
  }
  let value: unknown;
  const text = Buffer.from(bytes).toString("utf8").slice(0, -1);
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (canonicalJson(value) !== text) {
    throw new Error(`${label} is not canonical duplicate-free JSON`);
  }
  return value as Record<string, unknown>;
}

/**
 * Publish label-blind clean/selection artifacts. Existing exact files are
 * terminalized; any differing create-only file stops before teacher labels.
 */
export async function publishCleanAndSelection(
  clean: CleanDerivative,
  selection: Selection,
  expectedClean: RegisteredCleanExpected,
  paths: PreparationPaths,
): Promise<
  Readonly<{
    cleanDerivative: FileIdentity;
    cleanDerivativeReceipt: FileIdentity;
    selectedParentIds: FileIdentity;
    selectionReceipt: FileIdentity;
  }>
> {
  requireRegisteredCleanIdentity(clean, expectedClean);
  if (
    selection.rows.length === 0 ||
    selection.rows.some(
      (row, index) => row.parent_id !==
        Buffer.from(selection.parentIdsBytes)
          .toString("utf8")
          .trimEnd()
          .split("\n")[index],
    )
  ) {
    throw new Error("selection rows and parent-ID artifact mismatch");
  }
  const cleanIdentity = await ensureExactPublished(
    paths.cleanDerivative,
    clean.bytes,
  );
  const cleanReceipt = Object.freeze({
    ...clean.receipt,
    output: Object.freeze({
      ...(clean.receipt.output as Record<string, unknown>),
      path: cleanIdentity.path,
    }),
  });
  const cleanReceiptBytes = jsonBytes(cleanReceipt);
  const cleanReceiptIdentity = await ensureExactPublished(
    paths.cleanDerivativeReceipt,
    cleanReceiptBytes,
  );
  const selectedIdentity = await ensureExactPublished(
    paths.selectedParentIds,
    selection.parentIdsBytes,
  );
  const selectionReceipt = Object.freeze({
    ...selection.receipt,
    clean_derivative_receipt: cleanReceiptIdentity,
    selected_parent_ids: Object.freeze({
      ...(selection.receipt.selected_parent_ids as Record<string, unknown>),
      path: selectedIdentity.path,
    }),
  });
  const selectionReceiptBytes = jsonBytes(selectionReceipt);
  const selectionReceiptIdentity = await ensureExactPublished(
    paths.selectionReceipt,
    selectionReceiptBytes,
  );
  return Object.freeze({
    cleanDerivative: cleanIdentity,
    cleanDerivativeReceipt: cleanReceiptIdentity,
    selectedParentIds: selectedIdentity,
    selectionReceipt: selectionReceiptIdentity,
  });
}

async function validateExistingShard(
  outputPath: string,
  receiptPath: string,
  contentAddress: string,
  index: number,
  members: readonly Readonly<FloodgateTrainingParent>[],
  binding: ShardBinding,
): Promise<PublishedShard> {
  const output = await readIdentity(outputPath);
  const receiptSnapshot = await readIdentity(receiptPath);
  const receipt = parseJson(receiptSnapshot.bytes, "label shard receipt");
  const registeredOutput = receipt.output as Record<string, unknown> | undefined;
  const registeredShard = receipt.shard as Record<string, unknown> | undefined;
  if (
    receipt.schema !== LABEL_SHARD_RECEIPT_SCHEMA ||
    receipt.status !== "complete-immutable-content-addressed-label-shard" ||
    registeredShard?.index !== index ||
    registeredShard?.parents !== members.length ||
    registeredShard?.content_address !== contentAddress ||
    canonicalJson(receipt.binding) !== canonicalJson(binding) ||
    canonicalJson(receipt.ordered_parent_ids) !==
      canonicalJson(members.map((row) => row.parent_id)) ||
    registeredOutput?.path !== output.identity.path ||
    registeredOutput?.bytes !== output.identity.bytes ||
    registeredOutput?.sha256 !== output.identity.sha256 ||
    receipt.candidate_scores_opened !== false ||
    receipt.live_weights_changed !== false ||
    !Number.isSafeInteger(receipt.records)
  ) {
    throw new Error(`immutable shard ${index} receipt mismatch`);
  }
  return Object.freeze({
    index,
    contentAddress,
    output: output.identity,
    receipt: receiptSnapshot.identity,
    parents: members.length,
    records: receipt.records as number,
    recovered: true,
  });
}

/** Label and create one immutable content-addressed shard, or validate it. */
export async function labelAndPublishShard(
  options: LabelShardOptions,
): Promise<PublishedShard> {
  const shape = exactShape(options.shape ?? fixedShape());
  if (options.shape === undefined && options.binding.depth !== FIXED_TEACHER_DEPTH) {
    throw new Error("production sealed teacher depth must remain 12");
  }
  if (options.verifyBindingFiles !== false) {
    await verifyShardBindingFiles(options.binding);
  }
  if (
    !Number.isSafeInteger(options.shardIndex) ||
    options.shardIndex < 0 ||
    options.shardIndex >= shape.shards
  ) {
    throw new Error("shard index is outside the fixed range");
  }
  const members = shardSlices(options.selectedRows, shape)[options.shardIndex];
  const contentAddress = contentAddressFor(
    options.shardIndex,
    shape.shards,
    members,
    options.binding,
  );
  const basename = `${String(options.shardIndex).padStart(2, "0")}-${contentAddress}`;
  const outputPath = path.join(options.shardDirectory, `${basename}.jsonl`);
  const receiptPath = path.join(options.receiptDirectory, `${basename}.json`);
  const outputExists = fs.existsSync(outputPath);
  const receiptExists = fs.existsSync(receiptPath);
  if (outputExists || receiptExists) {
    if (outputExists && !receiptExists) {
      // No receipt means the shard was never committed. Content-addressed
      // recovery may discard this uncommitted output before candidate scoring.
      await fs.promises.unlink(outputPath);
    } else if (!outputExists || !receiptExists) {
      throw new Error(`partial immutable shard ${options.shardIndex} exists`);
    } else {
      return validateExistingShard(
        outputPath,
        receiptPath,
        contentAddress,
        options.shardIndex,
        members,
        options.binding,
      );
    }
  }

  const labeler = options.labeler ?? labelAllLegalMoves;
  const recordGroups: SiblingRecord[][] = [];
  for (const [memberIndex, member] of members.entries()) {
    const parent = selectedParent(
      member,
      options.shardIndex * shape.parentsPerShard + memberIndex + 1,
    );
    const labeled = await labeler(
      parent,
      options.teacher,
      options.binding.depth,
    );
    const records = [...labeled.records].sort((left, right) =>
      compareBytewise(left.move, right.move),
    );
    if (
      records.length !== parent.legal_moves.length ||
      new Set(records.map((record) => record.move)).size !== records.length ||
      records.some((record, index) => record.move !== parent.legal_moves[index]) ||
      records.some(
        (record) =>
          record.parent_id !== member.parent_id ||
          record.game_id !== member.game_id ||
          record.position_id !== member.position_id,
      )
    ) {
      throw new Error(`labeler output is incomplete for ${member.parent_id}`);
    }
    recordGroups.push(records);
  }
  const outputBytes = Buffer.from(
    recordGroups
      .flat()
      .map((record) => `${canonicalJson(record)}\n`)
      .join(""),
    "utf8",
  );
  if (options.verifyBindingFiles !== false) {
    await verifyShardBindingFiles(options.binding);
  }
  const outputIdentity = identity(outputPath, outputBytes);
  const receipt = Object.freeze({
    schema: LABEL_SHARD_RECEIPT_SCHEMA,
    status: "complete-immutable-content-addressed-label-shard",
    label_schema: LABEL_SHARD_SCHEMA,
    shard: Object.freeze({
      index: options.shardIndex,
      total: shape.shards,
      parents: members.length,
      content_address: contentAddress,
    }),
    ordered_parent_ids: Object.freeze(members.map((row) => row.parent_id)),
    binding: options.binding,
    output: outputIdentity,
    records: recordGroups.reduce((total, records) => total + records.length, 0),
    candidate_scores_opened: false,
    live_weights_changed: false,
  });
  const receiptBytes = jsonBytes(receipt);
  await atomicCreate(outputPath, outputBytes);
  await atomicCreate(receiptPath, receiptBytes);
  return Object.freeze({
    index: options.shardIndex,
    contentAddress,
    output: outputIdentity,
    receipt: identity(receiptPath, receiptBytes),
    parents: members.length,
    records: receipt.records,
    recovered: false,
  });
}

export interface FinalizeOptions {
  readonly shards: readonly PublishedShard[];
  readonly labelsPath: string;
  readonly labelReceiptPath: string;
  readonly expectedParents: number;
  readonly faultAfterLabels?: boolean;
}

/** Concatenate every verified shard and publish the label receipt last. */
export async function finalizeLabelShards(
  options: FinalizeOptions,
): Promise<Readonly<Record<string, unknown>>> {
  if (
    options.shards.length === 0 ||
    options.shards.some((shard, index) => shard.index !== index) ||
    options.shards.reduce((total, shard) => total + shard.parents, 0) !==
      options.expectedParents ||
    new Set(options.shards.map((shard) => shard.contentAddress)).size !==
      options.shards.length
  ) {
    throw new Error("finalization requires every ordered unique shard");
  }
  if (fs.existsSync(options.labelReceiptPath)) {
    if (!fs.existsSync(options.labelsPath)) {
      throw new Error("label receipt exists without labels");
    }
    const receipt = parseJson(
      (await readIdentity(options.labelReceiptPath)).bytes,
      "final label receipt",
    );
    const labels = await readIdentity(options.labelsPath);
    const output = receipt.output as Record<string, unknown> | undefined;
    const ordered = receipt.ordered_shards;
    const expectedOrdered = options.shards.map((shard) => ({
      index: shard.index,
      content_address: shard.contentAddress,
      output: shard.output,
      receipt: shard.receipt,
      records: shard.records,
    }));
    if (
      receipt.schema !== LABEL_RECEIPT_SCHEMA ||
      receipt.status !== "complete-sealed512-labels-candidate-scoring-locked" ||
      receipt.parents !== options.expectedParents ||
      receipt.shards !== options.shards.length ||
      receipt.records !==
        options.shards.reduce((total, shard) => total + shard.records, 0) ||
      canonicalJson(ordered) !== canonicalJson(expectedOrdered) ||
      output?.path !== labels.identity.path ||
      output?.bytes !== labels.identity.bytes ||
      output?.sha256 !== labels.identity.sha256 ||
      receipt.candidate_scores_opened !== false ||
      receipt.live_weights_changed !== false
    ) {
      throw new Error("existing final label receipt mismatch");
    }
    return Object.freeze({ ...receipt, recovery: "validated-existing-terminal-receipt" });
  }

  const shardSnapshots = [];
  for (const shard of options.shards) {
    const output = await readIdentity(shard.output.path);
    const receipt = await readIdentity(shard.receipt.path);
    if (
      output.identity.bytes !== shard.output.bytes ||
      output.identity.sha256 !== shard.output.sha256 ||
      receipt.identity.bytes !== shard.receipt.bytes ||
      receipt.identity.sha256 !== shard.receipt.sha256
    ) {
      throw new Error(`shard ${shard.index} changed before finalization`);
    }
    shardSnapshots.push(output);
  }
  const labelsBytes = concatBytes(shardSnapshots.map((snapshot) => snapshot.bytes));
  const labelsIdentity = identity(options.labelsPath, labelsBytes);
  const receipt = Object.freeze({
    schema: LABEL_RECEIPT_SCHEMA,
    status: "complete-sealed512-labels-candidate-scoring-locked",
    parents: options.expectedParents,
    shards: options.shards.length,
    ordered_shards: Object.freeze(
      options.shards.map((shard) =>
        Object.freeze({
          index: shard.index,
          content_address: shard.contentAddress,
          output: shard.output,
          receipt: shard.receipt,
          records: shard.records,
        }),
      ),
    ),
    output: labelsIdentity,
    records: options.shards.reduce((total, shard) => total + shard.records, 0),
    candidate_scores_opened: false,
    live_weights_changed: false,
  });
  if (fs.existsSync(options.labelsPath)) {
    const existing = await readIdentity(options.labelsPath);
    if (
      existing.identity.bytes !== labelsIdentity.bytes ||
      existing.identity.sha256 !== labelsIdentity.sha256
    ) {
      throw new Error("existing labels differ during terminalize-only recovery");
    }
  } else {
    await atomicCreate(options.labelsPath, labelsBytes);
  }
  if (options.faultAfterLabels) {
    throw new Error("injected fault after complete labels publication");
  }
  await atomicCreate(options.labelReceiptPath, jsonBytes(receipt));
  return Object.freeze({ ...receipt, recovery: "fresh-or-terminalize-only-complete" });
}
