/**
 * Pure validation for authenticated Floodgate role rows.
 *
 * The production consumer and the deadline diagnostic share this module so
 * row ordering, identifiers, SFEN canonicalization, and legal-move checks
 * cannot drift. It has no filesystem, process, network, or mutation API.
 */

import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import { toSfen } from "./shogi-sfen-codec";
import { positionFromSfen, rulesCompleteLegalMoves } from "./shogi-sfen";

export const FLOODGATE_TRAINING_RAW_PARENT_FORMAT =
  "shogi-floodgate-label-free-raw-parent-jsonl-v1" as const;
export const FLOODGATE_TRAINING_RAW_MAX_BYTES = 64 * 1024 * 1024;

export interface FloodgateTrainingRawIdentity {
  readonly bytes: number;
  readonly format: typeof FLOODGATE_TRAINING_RAW_PARENT_FORMAT;
  readonly game_ids_sha256: string;
  readonly games: number;
  readonly parent_ids_sha256: string;
  readonly path: "training.raw.jsonl";
  readonly position_ids_count: number;
  readonly position_ids_sha256: string;
  readonly records: number;
  readonly sha256: string;
}

export interface FloodgateFreshSelectionRawIdentity
  extends Omit<FloodgateTrainingRawIdentity, "path"> {
  readonly path: "fresh-selection.raw.jsonl";
}

export interface FloodgateFreshFinalRawIdentity
  extends Omit<FloodgateTrainingRawIdentity, "path"> {
  readonly path: "fresh-final-holdout.raw.jsonl";
}

export interface FloodgateTrainingParent {
  readonly schema_version: 1;
  readonly game_id: string;
  readonly parent_id: string;
  readonly position_id: string;
  readonly parent_sfen: string;
  readonly ply: number;
  readonly played_move: string;
}

const FLOODGATE_ORIGIN = "https://wdoor.c.u-tokyo.ac.jp";
const FLOODGATE_EVENT = "floodgate-300-10F";
const FLOODGATE_GAME_ID_DOMAIN = "floodgate-q1-2026-game-id-v1";
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const ENCODED_STRUCTURAL_RE = /%(?:2e|2f|5c|25)/iu;
const RAW_PARENT_KEYS = Object.freeze([
  "game_id",
  "game_sha256",
  "parent_id",
  "parent_sfen",
  "played_move",
  "ply",
  "position_id",
  "schema_version",
  "source",
  "source_url",
] as const);
const RAW_IDENTITY_KEYS = Object.freeze([
  "bytes",
  "format",
  "game_ids_sha256",
  "games",
  "parent_ids_sha256",
  "path",
  "position_ids_count",
  "position_ids_sha256",
  "records",
  "sha256",
] as const);

function fail(message: string): never {
  throw new Error(`invalid Floodgate authenticated rows: ${message}`);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail(`${label} must be a non-Proxy plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.length !== expectedKeys.length ||
    (ownKeys as string[]).some((key) => !expectedKeys.includes(key))
  ) {
    fail(`${label} keys are not exact`);
  }
  const captured = Object.create(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable data property`);
    }
    Object.defineProperty(captured, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value,
    });
  }
  return Object.freeze(captured);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (
      nodeUtilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      fail("canonical JSON rejects exotic arrays");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
      fail("canonical JSON rejects sparse or decorated arrays");
    }
    return `[${Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        fail("canonical JSON rejects array accessors");
      }
      return canonicalJson(descriptor.value);
    }).join(",")}]`;
  }
  if (typeof value === "object") {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      nodeUtilTypes.isProxy(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null) ||
      Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")
    ) {
      fail("canonical JSON rejects exotic records");
    }
    const keys = Object.keys(descriptors).sort(compareBytewise);
    return `{${keys
      .map((key) => {
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true
        ) {
          fail("canonical JSON rejects accessors and hidden fields");
        }
        return `${JSON.stringify(key)}:${canonicalJson(descriptor.value)}`;
      })
      .join(",")}}`;
  }
  return fail(`canonical JSON rejects ${typeof value}`);
}

function hasRawDotSegment(value: string): boolean {
  try {
    const pathStart = value.indexOf("/", value.indexOf("://") + 3);
    const pathValue = pathStart < 0 ? "" : value.slice(pathStart);
    return pathValue
      .split(/[?#]/u, 1)[0]
      .split("/")
      .some((component) => component === "." || component === "..");
  } catch {
    return true;
  }
}

function validateQ1Date(
  yearRaw: string,
  monthRaw: string,
  dayRaw: string,
): void {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = `${yearRaw}-${monthRaw}-${dayRaw}`;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day ||
    date < "2026-01-01" ||
    date > "2026-03-31"
  ) {
    fail("source URL date is outside 2026 Q1");
  }
}

function decodeFilenamePart(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fail("source URL player token has invalid percent encoding");
  }
  if (
    decoded.length === 0 ||
    decoded !== decoded.trim() ||
    CONTROL_RE.test(decoded) ||
    /[+\\/?#]/u.test(decoded)
  ) {
    fail("source URL player token is not canonical");
  }
  return decoded;
}

function canonicalFloodgateCsaUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    CONTROL_RE.test(value) ||
    value.includes("\\") ||
    hasRawDotSegment(value) ||
    ENCODED_STRUCTURAL_RE.test(value)
  ) {
    fail("source URL is not canonical text");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("source URL is not absolute");
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== FLOODGATE_ORIGIN ||
    url.hostname !== "wdoor.c.u-tokyo.ac.jp" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.href !== value
  ) {
    fail("source URL does not use the exact Floodgate HTTPS origin");
  }
  const pathMatch =
    /^\/shogi\/x\/(2026)\/(\d{2})\/(\d{2})\/([^/]+\.csa)$/u.exec(url.pathname);
  if (pathMatch === null) {
    fail("source URL is not an official 2026 daily CSA path");
  }
  validateQ1Date(pathMatch[1], pathMatch[2], pathMatch[3]);
  const filename = pathMatch[4];
  const fileMatch = /^wdoor\+([^+]+)\+([^+]+)\+([^+]+)\+(\d{14})\.csa$/u.exec(
    filename,
  );
  if (
    fileMatch === null ||
    fileMatch[1] !== FLOODGATE_EVENT ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(fileMatch[1])
  ) {
    fail("source URL filename does not bind the Floodgate event");
  }
  decodeFilenamePart(fileMatch[2]);
  decodeFilenamePart(fileMatch[3]);
  const timestamp = fileMatch[4];
  if (
    !timestamp.startsWith(`${pathMatch[1]}${pathMatch[2]}${pathMatch[3]}`) ||
    Number(timestamp.slice(8, 10)) > 23 ||
    Number(timestamp.slice(10, 12)) > 59 ||
    Number(timestamp.slice(12, 14)) > 59
  ) {
    fail("source URL timestamp is invalid");
  }
  return url.href;
}

function gameIdForUrl(sourceUrl: string): string {
  const canonical = canonicalFloodgateCsaUrl(sourceUrl);
  return `sha256:${sha256(`${FLOODGATE_GAME_ID_DOMAIN}\0${canonical}`)}`;
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function positionIdForSfen(sfen: string): string {
  const parts = sfen.trim().split(/\s+/u);
  if (parts.length < 3) fail("parent SFEN is invalid");
  return `sha256:${sha256(`sfen-v1\0${parts.slice(0, 3).join(" ")}`)}`;
}

function identifierDigest(values: Iterable<string>): string {
  return sha256([...new Set(values)].sort(compareBytewise).join("\n"));
}

function requiredString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    fail(`${label} must be non-empty canonical text`);
  }
  return value;
}

function captureFloodgateRawIdentity<Path extends
  | "training.raw.jsonl"
  | "fresh-selection.raw.jsonl"
  | "fresh-final-holdout.raw.jsonl">(
  value: unknown,
  expectedPath: Path,
): Readonly<Omit<FloodgateTrainingRawIdentity, "path"> & { readonly path: Path }> {
  const identity = exactDataRecord(
    value,
    RAW_IDENTITY_KEYS,
    "Floodgate raw identity",
  );
  if (
    identity.path !== expectedPath ||
    identity.format !== FLOODGATE_TRAINING_RAW_PARENT_FORMAT
  ) {
    fail("raw path or format is not fixed");
  }
  for (const key of [
    "bytes",
    "records",
    "games",
    "position_ids_count",
  ] as const) {
    if (
      !Number.isSafeInteger(identity[key]) ||
      (identity[key] as number) <= 0
    ) {
      fail(`raw ${key} is not a positive safe integer`);
    }
  }
  if ((identity.bytes as number) > FLOODGATE_TRAINING_RAW_MAX_BYTES) {
    fail("raw identity exceeds the fixed size bound");
  }
  for (const key of [
    "sha256",
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
  ] as const) {
    if (typeof identity[key] !== "string" || !SHA256_RE.test(identity[key])) {
      fail(`raw ${key} is not a SHA-256 digest`);
    }
  }
  return Object.freeze({
    bytes: identity.bytes as number,
    format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
    game_ids_sha256: identity.game_ids_sha256 as string,
    games: identity.games as number,
    parent_ids_sha256: identity.parent_ids_sha256 as string,
    path: expectedPath,
    position_ids_count: identity.position_ids_count as number,
    position_ids_sha256: identity.position_ids_sha256 as string,
    records: identity.records as number,
    sha256: identity.sha256 as string,
  });
}

export function captureFloodgateTrainingRawIdentity(
  value: unknown,
): Readonly<FloodgateTrainingRawIdentity> {
  return captureFloodgateRawIdentity(value, "training.raw.jsonl");
}

export function captureFloodgateFreshSelectionRawIdentity(
  value: unknown,
): Readonly<FloodgateFreshSelectionRawIdentity> {
  return captureFloodgateRawIdentity(value, "fresh-selection.raw.jsonl");
}

export function captureFloodgateFreshFinalRawIdentity(
  value: unknown,
): Readonly<FloodgateFreshFinalRawIdentity> {
  return captureFloodgateRawIdentity(value, "fresh-final-holdout.raw.jsonl");
}

function parseRawParent(
  value: unknown,
  canonicalLine: string,
  lineNumber: number,
): Readonly<{
  readonly gameSha256: string;
  readonly parent: Readonly<FloodgateTrainingParent>;
  readonly sourceUrl: string;
}> {
  const raw = exactDataRecord(
    value,
    RAW_PARENT_KEYS,
    `authenticated row ${lineNumber}`,
  );
  if (canonicalJson(value) !== canonicalLine) {
    fail(`authenticated row ${lineNumber} is not canonical JSON`);
  }
  if (raw.schema_version !== 1 || raw.source !== "floodgate") {
    fail(`authenticated row ${lineNumber} source schema is invalid`);
  }
  const sourceUrl = canonicalFloodgateCsaUrl(raw.source_url);
  const gameSha256 = requiredString(
    raw.game_sha256,
    `authenticated row ${lineNumber} game_sha256`,
  );
  if (!SHA256_RE.test(gameSha256)) {
    fail(`authenticated row ${lineNumber} game_sha256 is invalid`);
  }
  const gameId = requiredString(
    raw.game_id,
    `authenticated row ${lineNumber} game_id`,
  );
  const parentId = requiredString(
    raw.parent_id,
    `authenticated row ${lineNumber} parent_id`,
  );
  const positionId = requiredString(
    raw.position_id,
    `authenticated row ${lineNumber} position_id`,
  );
  if (
    !POSITION_ID_RE.test(gameId) ||
    !POSITION_ID_RE.test(parentId) ||
    !POSITION_ID_RE.test(positionId) ||
    gameId !== gameIdForUrl(sourceUrl)
  ) {
    fail(`authenticated row ${lineNumber} semantic identifiers are invalid`);
  }
  if (!Number.isSafeInteger(raw.ply) || (raw.ply as number) < 0) {
    fail(`authenticated row ${lineNumber} ply is invalid`);
  }
  const ply = raw.ply as number;
  if (parentId !== parentOccurrenceId(gameId, ply)) {
    fail(`authenticated row ${lineNumber} parent_id does not match game and ply`);
  }
  const parentSfen = requiredString(
    raw.parent_sfen,
    `authenticated row ${lineNumber} parent_sfen`,
  );
  if (parentSfen.split(/\s+/u).join(" ") !== parentSfen) {
    fail(`authenticated row ${lineNumber} parent_sfen is not normalized`);
  }
  const playedMove = requiredString(
    raw.played_move,
    `authenticated row ${lineNumber} played_move`,
  );
  try {
    const parsed = positionFromSfen(parentSfen);
    if (
      toSfen(parsed.position, parsed.moveNumber) !== parentSfen ||
      parsed.moveNumber !== ply + 1
    ) {
      fail(`authenticated row ${lineNumber} SFEN is not canonical for its ply`);
    }
    if (
      !rulesCompleteLegalMoves(parsed.position).some(
        (move) => move.usi === playedMove,
      )
    ) {
      fail(`authenticated row ${lineNumber} played_move is illegal`);
    }
  } catch {
    fail(`authenticated row ${lineNumber} SFEN or played_move is invalid`);
  }
  if (positionIdForSfen(parentSfen) !== positionId) {
    fail(`authenticated row ${lineNumber} position_id does not match SFEN`);
  }
  return Object.freeze({
    gameSha256,
    parent: Object.freeze({
      game_id: gameId,
      parent_id: parentId,
      parent_sfen: parentSfen,
      played_move: playedMove,
      ply,
      position_id: positionId,
      schema_version: 1 as const,
    }),
    sourceUrl,
  });
}

function parseAuthenticatedFloodgateRows(
  bytes: Uint8Array,
  expectedIdentityInput: unknown,
  expectedPath:
    | "training.raw.jsonl"
    | "fresh-selection.raw.jsonl"
    | "fresh-final-holdout.raw.jsonl",
): readonly Readonly<FloodgateTrainingParent>[] {
  if (!(bytes instanceof Uint8Array) || nodeUtilTypes.isProxy(bytes)) {
    fail("authenticated raw snapshot must be a non-Proxy Uint8Array");
  }
  const expectedIdentity = captureFloodgateRawIdentity(
    expectedIdentityInput,
    expectedPath,
  );
  if (
    bytes.byteLength !== expectedIdentity.bytes ||
    sha256(bytes) !== expectedIdentity.sha256
  ) {
    fail("authenticated raw bytes do not match its identity");
  }
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    fail("authenticated raw snapshot contains a UTF-8 BOM");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("authenticated raw snapshot is not fatal-valid UTF-8");
  }
  if (
    text.startsWith("\uFEFF") ||
    text.includes("\0") ||
    text.includes("\r") ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n")
  ) {
    fail("authenticated raw JSONL framing is not canonical");
  }
  const lines = text.slice(0, -1).split("\n");
  if (
    lines.length !== expectedIdentity.records ||
    lines.some((line) => line.length === 0)
  ) {
    fail("authenticated raw record count or blank-line framing differs");
  }

  const rows: Readonly<FloodgateTrainingParent>[] = [];
  const gameIds = new Set<string>();
  const parentIds = new Set<string>();
  const positionIds = new Set<string>();
  const gameSources = new Map<string, string>();
  let previousParentId: string | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]) as unknown;
    } catch {
      return fail(`authenticated row ${index + 1} is not valid JSON`);
    }
    const parsedRow = parseRawParent(parsed, lines[index], index + 1);
    const row = parsedRow.parent;
    if (
      previousParentId !== undefined &&
      compareBytewise(previousParentId, row.parent_id) >= 0
    ) {
      fail("authenticated parent_id order is not strict UTF-8 byte order");
    }
    previousParentId = row.parent_id;
    if (parentIds.has(row.parent_id)) fail("authenticated parent_id is duplicated");
    if (positionIds.has(row.position_id)) {
      fail("authenticated semantic position is duplicated");
    }
    const sourceIdentity = `${parsedRow.sourceUrl}\0${parsedRow.gameSha256}`;
    const existingSource = gameSources.get(row.game_id);
    if (existingSource !== undefined && existingSource !== sourceIdentity) {
      fail("authenticated game source identity is inconsistent");
    }
    gameSources.set(row.game_id, sourceIdentity);
    gameIds.add(row.game_id);
    parentIds.add(row.parent_id);
    positionIds.add(row.position_id);
    rows.push(row);
  }
  if (
    gameIds.size !== expectedIdentity.games ||
    parentIds.size !== expectedIdentity.records ||
    positionIds.size !== expectedIdentity.position_ids_count ||
    identifierDigest(gameIds) !== expectedIdentity.game_ids_sha256 ||
    identifierDigest(parentIds) !== expectedIdentity.parent_ids_sha256 ||
    identifierDigest(positionIds) !== expectedIdentity.position_ids_sha256
  ) {
    fail("authenticated aggregate identity does not match the manifest");
  }
  return Object.freeze(rows);
}

export function parseAuthenticatedFloodgateTrainingRows(
  bytes: Uint8Array,
  expectedIdentityInput: unknown,
): readonly Readonly<FloodgateTrainingParent>[] {
  return parseAuthenticatedFloodgateRows(
    bytes,
    expectedIdentityInput,
    "training.raw.jsonl",
  );
}

export function parseAuthenticatedFloodgateFreshSelectionRows(
  bytes: Uint8Array,
  expectedIdentityInput: unknown,
): readonly Readonly<FloodgateTrainingParent>[] {
  return parseAuthenticatedFloodgateRows(
    bytes,
    expectedIdentityInput,
    "fresh-selection.raw.jsonl",
  );
}

export function parseAuthenticatedFloodgateFreshFinalRows(
  bytes: Uint8Array,
  expectedIdentityInput: unknown,
): readonly Readonly<FloodgateTrainingParent>[] {
  return parseAuthenticatedFloodgateRows(
    bytes,
    expectedIdentityInput,
    "fresh-final-holdout.raw.jsonl",
  );
}
