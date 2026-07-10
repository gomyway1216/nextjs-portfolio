/**
 * Fail-closed, dependency-free parsing for the pinned Floodgate 2026-Q1
 * corpus sources.  Player identities come from the rating snapshot and CSA
 * records; names embedded in directory-listing filenames are only hints.
 */

import * as crypto from "crypto";

export const FLOODGATE_ORIGIN = "https://wdoor.c.u-tokyo.ac.jp";
export const FLOODGATE_EVENT = "floodgate-300-10F";
export const FLOODGATE_PERIOD_END_INVENTORY_SNAPSHOT =
  "players-floodgate-20260401.html";
export const FLOODGATE_Q1_START = "2026-01-01";
export const FLOODGATE_Q1_END = "2026-03-31";
export const FLOODGATE_MINIMUM_CUMULATIVE_GAMES = 30;
export const FLOODGATE_MINIMUM_EMBEDDED_GAME_RATING = 3600;

const PLAYER_PATH = "/shogi/view/show-player.cgi";
const INTEGERISH_RE = /^[+-]?\d+(?:\.0+)?$/;
const IDENTITY_RE = /^([^:\r\n]+)\+([0-9a-f]{32})$/;
const IDENTITY_CAPTURE = "([^:\\r\\n]+\\+[0-9a-f]{32})";
const FINITE_NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const ENCODED_STRUCTURAL_RE = /%(?:2e|2f|5c|25)/i;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

export interface FloodgateRatingRow {
  readonly groupNumber: number;
  readonly visibleName: string;
  readonly identity: string;
  readonly rating: number;
  readonly wins: number;
  readonly losses: number;
}

export interface FloodgateEligibilityOptions {
  minimumGames?: number;
}

export interface FloodgateDailyListing {
  readonly url: string;
  readonly date: string;
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface FloodgateDailyRatingSnapshot extends FloodgateDailyListing {
  readonly filename: string;
}

export interface FloodgateCsaLocation extends FloodgateDailyListing {
  readonly filename: string;
  readonly event: typeof FLOODGATE_EVENT;
  /** Filename hints only. Authoritative identities must be read from CSA. */
  readonly visiblePlayers: readonly [string, string];
  readonly timestamp: string;
}

export interface FloodgateCsaPlayerMetadata {
  readonly visibleName: string;
  readonly identity: string;
  readonly embeddedGameTimeRating: number;
}

export interface FloodgateCsaMetadata {
  readonly sente: FloodgateCsaPlayerMetadata;
  readonly gote: FloodgateCsaPlayerMetadata;
  readonly identities: readonly [string, string];
  readonly embeddedGameTimeRatings: readonly [number, number];
}

export interface FloodgateCsaSourceHeader {
  readonly event: string;
  readonly startTime: string;
}

export interface FloodgateBodyIdentity {
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateDailyListingEvidenceInput {
  readonly listingUrl: string;
  readonly listingBytes: Uint8Array;
}

export interface FloodgateDailyListingEvidence {
  readonly schema: "shogi-floodgate-daily-listing-evidence-v1";
  readonly date: string;
  readonly listing: {
    readonly location: FloodgateDailyListing;
    readonly body: FloodgateBodyIdentity;
  };
  readonly csaLocations: readonly FloodgateCsaLocation[];
}

export interface FloodgateGameSourceEvidenceInput {
  readonly ratingUrl: string;
  readonly ratingBytes: Uint8Array;
  readonly csaUrl: string;
  readonly csaBytes: Uint8Array;
}

export interface FloodgateGameSourceEvidence {
  readonly schema: "shogi-floodgate-game-source-evidence-v1";
  readonly date: string;
  readonly rating: {
    readonly location: FloodgateDailyRatingSnapshot;
    readonly body: FloodgateBodyIdentity;
    readonly lastModifiedAt: string;
    readonly rows: readonly FloodgateRatingRow[];
    readonly eligibleGroupZeroIdentities: readonly string[];
  };
  readonly csa: {
    readonly location: FloodgateCsaLocation;
    readonly body: FloodgateBodyIdentity;
    readonly header: FloodgateCsaSourceHeader;
    readonly metadata: FloodgateCsaMetadata;
  };
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate source: ${message}`);
}

/**
 * Structural HTML is parsed with small, pinned recognizers below. Keep markup
 * hidden inside comments, scripts, or styles from becoming parser input while
 * retaining the rating page's legitimate tooltip JavaScript as metadata text.
 */
function assertNoHiddenStructuralHtml(html: string, label: string): void {
  const structuralPattern =
    /<\s*\/?\s*(?:a|table|tbody|tr|td|caption|span)\b|Last modified at/i;
  let visible = html;
  let cursor = 0;

  // Validate comments first so the official legacy <style><!-- ... --></style>
  // wrapper remains valid, then hide them from the raw-text block scanner.
  while (cursor < visible.length) {
    const opening = visible.indexOf("<!--", cursor);
    const strayClose = visible.indexOf("-->", cursor);
    if (strayClose >= 0 && (opening < 0 || strayClose < opening)) {
      fail(`${label} contains an unmatched HTML comment`);
    }
    if (opening < 0) break;
    const closing = visible.indexOf("-->", opening + 4);
    if (closing < 0) fail(`${label} contains an unclosed comment block`);
    const nested = visible.indexOf("<!--", opening + 4);
    if (nested >= 0 && nested < closing) {
      fail(`${label} contains nested or overlapping hidden HTML blocks`);
    }
    if (structuralPattern.test(visible.slice(opening + 4, closing))) {
      fail(`${label} hides structural markup in a comment block`);
    }
    const end = closing + 3;
    visible = `${visible.slice(0, opening)}${visible
      .slice(opening, end)
      .replace(/[^\r\n]/g, " ")}${visible.slice(end)}`;
    cursor = end;
  }

  const tokenPattern = /<\/?(?:script|style)\b[^>]*>/gi;
  let active:
    { readonly kind: "script" | "style"; readonly start: number } | undefined;

  for (const match of visible.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index;
    const lower = token.toLowerCase();
    if (!active) {
      if (lower.startsWith("</")) {
        fail(
          `${label} contains an unmatched ${lower.slice(2).split(/[\s>]/, 1)[0]} close tag`,
        );
      }
      active = {
        kind: lower.startsWith("<script") ? "script" : "style",
        start: index + token.length,
      };
      continue;
    }

    const isExpectedClose =
      (active.kind === "script" && /^<\/script\s*>$/i.test(token)) ||
      (active.kind === "style" && /^<\/style\s*>$/i.test(token));
    if (!isExpectedClose) {
      fail(`${label} contains nested or overlapping hidden HTML blocks`);
    }
    const hidden = visible.slice(active.start, index);
    if (structuralPattern.test(hidden)) {
      fail(`${label} hides structural markup in a ${active.kind} block`);
    }
    active = undefined;
  }
  if (active) fail(`${label} contains an unclosed ${active.kind} block`);
}

function hasRawDotSegment(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0];
  return path.split("/").some((segment) => segment === "." || segment === "..");
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi,
    (entity, body: string) => {
      const normalized = body.toLowerCase();
      const named: Readonly<Record<string, string>> = {
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        nbsp: "\u00a0",
        quot: '"',
      };
      if (normalized in named) return named[normalized];

      const codePoint = normalized.startsWith("#x")
        ? Number.parseInt(normalized.slice(2), 16)
        : normalized.startsWith("#")
          ? Number.parseInt(normalized.slice(1), 10)
          : Number.NaN;
      if (
        !Number.isInteger(codePoint) ||
        codePoint <= 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return fail(`invalid or unsupported HTML entity ${entity}`);
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function textOnly(fragment: string, label: string): string {
  if (/<[^>]*>/.test(fragment)) fail(`${label} contains unexpected markup`);
  const value = decodeHtmlEntities(fragment).trim();
  if (!value || CONTROL_RE.test(value))
    fail(`${label} is empty or contains controls`);
  return value;
}

function parseQuotedAttributes(
  raw: string,
  label: string,
): Map<string, string> {
  const attributes = new Map<string, string>();
  let cursor = 0;
  const matcher = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/gy;
  while (cursor < raw.length) {
    matcher.lastIndex = cursor;
    const match = matcher.exec(raw);
    if (!match) {
      if (/^\s*$/.test(raw.slice(cursor))) break;
      fail(`${label} has malformed or unquoted attributes`);
    }
    const key = match[1].toLowerCase();
    if (attributes.has(key)) fail(`${label} repeats attribute ${key}`);
    attributes.set(key, decodeHtmlEntities(match[2].slice(1, -1)));
    cursor = matcher.lastIndex;
  }
  return attributes;
}

function exactlyOneMatch(
  value: string,
  expression: RegExp,
  label: string,
): RegExpExecArray {
  const flags = expression.flags.includes("g")
    ? expression.flags
    : `${expression.flags}g`;
  const global = new RegExp(expression.source, flags);
  const matches = [...value.matchAll(global)];
  if (matches.length !== 1) fail(`${label} must occur exactly once`);
  return matches[0];
}

function parseIntegerish(fragment: string, label: string): number {
  const text = textOnly(fragment, label).replace(/\u00a0/g, "");
  if (!INTEGERISH_RE.test(text)) fail(`${label} is not an integer-like number`);
  const value = Number(text);
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    fail(`${label} is not a finite safe integer`);
  }
  return value;
}

function parseJavaScriptString(raw: string, label: string): string {
  try {
    const value: unknown = JSON.parse(`"${raw}"`);
    if (typeof value !== "string" || CONTROL_RE.test(value))
      fail(`${label} is invalid`);
    return value;
  } catch {
    return fail(`${label} is not a valid quoted JavaScript string`);
  }
}

function oneSearchParameter(url: URL, key: string): string {
  const values = url.searchParams.getAll(key);
  if (values.length !== 1 || values[0] === "")
    fail(`player href has ambiguous ${key}`);
  return values[0];
}

function parsePlayerCell(
  fragment: string,
): Pick<FloodgateRatingRow, "visibleName" | "identity"> {
  const anchor = exactlyOneMatch(
    fragment,
    /<a\b([^>]*)>([\s\S]*?)<\/a>/i,
    "player anchor",
  );
  const attributes = parseQuotedAttributes(anchor[1], "player anchor");
  const anchorId = attributes.get("id");
  const href = attributes.get("href");
  if (!anchorId || !href) fail("player anchor requires id and href");
  if (attributes.size !== 2) fail("player anchor has unexpected attributes");

  const visibleName = textOnly(anchor[2], "visible player name");
  if (
    !href ||
    href !== href.trim() ||
    CONTROL_RE.test(href) ||
    href.includes("\\") ||
    hasRawDotSegment(href) ||
    ENCODED_STRUCTURAL_RE.test(href)
  ) {
    fail("player href contains a raw or encoded path alias");
  }
  let playerUrl: URL;
  try {
    playerUrl = new URL(href, FLOODGATE_ORIGIN);
  } catch {
    return fail("player href is not a URL");
  }
  if (
    playerUrl.origin !== FLOODGATE_ORIGIN ||
    playerUrl.pathname !== PLAYER_PATH ||
    playerUrl.hash ||
    playerUrl.username ||
    playerUrl.password
  ) {
    fail("player href is outside the official player endpoint");
  }
  if (playerUrl.searchParams.size !== 4)
    fail("player href has unexpected parameters");
  if (
    oneSearchParameter(playerUrl, "event") !== "LATEST" ||
    oneSearchParameter(playerUrl, "filter") !== "floodgate" ||
    oneSearchParameter(playerUrl, "show_self_play") !== "1"
  ) {
    fail("player href has unexpected fixed parameters");
  }
  const hrefIdentity = oneSearchParameter(playerUrl, "user");

  const context = exactlyOneMatch(
    fragment,
    /\bcontext\s*:\s*"((?:[^"\\]|\\.)*)"/i,
    "tooltip context",
  );
  const tooltip = exactlyOneMatch(
    fragment,
    /\btext\s*:\s*"((?:[^"\\]|\\.)*)"/i,
    "identity tooltip",
  );
  if (parseJavaScriptString(context[1], "tooltip context") !== anchorId) {
    fail("tooltip context does not identify its player anchor");
  }
  const tooltipIdentity = parseJavaScriptString(tooltip[1], "identity tooltip");
  if (tooltipIdentity !== hrefIdentity)
    fail("href and tooltip identities conflict");

  const identityMatch = IDENTITY_RE.exec(hrefIdentity);
  if (!identityMatch || identityMatch[1] !== visibleName) {
    fail(
      "full identity does not match the visible name plus credential digest",
    );
  }
  return { visibleName, identity: hrefIdentity };
}

function parseRatingCells(fragment: string, groupLabel: string) {
  const cells = [...fragment.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
  if (cells.length !== 7)
    fail(`${groupLabel} row must contain exactly seven cells`);
  const classes = cells.map((cell, index) => {
    const attributes = parseQuotedAttributes(
      cell[1],
      `${groupLabel} cell ${index + 1}`,
    );
    if (attributes.size !== 1 || !attributes.has("class")) {
      fail(`${groupLabel} cell ${index + 1} has unexpected attributes`);
    }
    return attributes.get("class");
  });
  const expected = [
    "name",
    "rate",
    "ngames",
    "ngames",
    "win_rate",
    "last_modified",
    "rate",
  ];
  if (classes.some((value, index) => value !== expected[index])) {
    fail(`${groupLabel} row has unexpected cell classes`);
  }
  return cells;
}

function parseRatingRow(
  fragment: string,
  groupNumber: number,
): FloodgateRatingRow {
  const cells = parseRatingCells(fragment, `group ${groupNumber}`);
  const player = parsePlayerCell(cells[0][2]);
  const ratingSpan = exactlyOneMatch(
    cells[1][2],
    /<span\b[^>]*>([\s\S]*?)<\/span>/i,
    "rating span",
  );
  const rating = parseIntegerish(ratingSpan[1], "rating");
  const wins = parseIntegerish(cells[2][2], "wins");
  const losses = parseIntegerish(cells[3][2], "losses");
  if (wins < 0 || losses < 0) fail("wins and losses must be nonnegative");

  return Object.freeze({ groupNumber, ...player, rating, wins, losses });
}

function parseUnratedIdentityRow(
  fragment: string,
): Pick<FloodgateRatingRow, "visibleName" | "identity"> {
  const cells = parseRatingCells(fragment, "not-yet-rated group");
  const player = parsePlayerCell(cells[0][2]);
  const ratingSpan = exactlyOneMatch(
    cells[1][2],
    /<span\b[^>]*>([\s\S]*?)<\/span>/i,
    "unrated rating span",
  );
  if (
    textOnly(ratingSpan[1], "unrated rating") !== "N/A" ||
    textOnly(cells[6][2], "unrated rate24") !== "N/A"
  ) {
    fail("not-yet-rated row unexpectedly contains a numeric rating");
  }
  const wins = parseIntegerish(cells[2][2], "unrated wins");
  const losses = parseIntegerish(cells[3][2], "unrated losses");
  if (wins < 0 || losses < 0) {
    fail("not-yet-rated wins and losses must be nonnegative");
  }
  return player;
}

/** Parse numbered groups and audit identities in the excluded unrated group. */
export function parseFloodgateRatingSnapshot(
  input: string | Uint8Array,
): readonly FloodgateRatingRow[] {
  const html = decodeSourceUtf8(input, "rating snapshot");
  if (html.length === 0 || CONTROL_RE.test(html.replace(/[\t\n\r]/g, ""))) {
    fail("rating snapshot is empty or contains controls");
  }
  assertNoHiddenStructuralHtml(html, "rating snapshot");
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length === 0) fail("rating snapshot contains no tables");

  const rows: FloodgateRatingRow[] = [];
  const groups = new Set<number>();
  const identities = new Set<string>();
  let sawUnrated = false;

  for (const table of tables) {
    const captionMatch = exactlyOneMatch(
      table[1],
      /<caption\b[^>]*>([\s\S]*?)<\/caption>/i,
      "table caption",
    );
    const caption = textOnly(captionMatch[1], "table caption");
    let groupNumber: number | null = null;
    if (caption === "Group: Not-Yet-Rated Players") {
      if (sawUnrated) fail("not-yet-rated group is duplicated");
      sawUnrated = true;
    } else {
      const groupMatch = /^Group:\s*(0|[1-9]\d*)$/.exec(caption);
      if (!groupMatch) fail(`ambiguous table caption ${caption}`);
      groupNumber = Number(groupMatch[1]);
      if (!Number.isSafeInteger(groupNumber) || groups.has(groupNumber)) {
        fail(`group ${groupMatch[1]} is duplicated or invalid`);
      }
      groups.add(groupNumber);
    }

    const tbody = exactlyOneMatch(
      table[1],
      /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i,
      groupNumber === null
        ? "not-yet-rated group body"
        : `group ${groupNumber} body`,
    );
    const rowMatches = [...tbody[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rowMatches.length === 0) fail(`${caption} has no players`);
    for (const rowMatch of rowMatches) {
      if (groupNumber === null) {
        const player = parseUnratedIdentityRow(rowMatch[1]);
        if (identities.has(player.identity)) {
          fail(
            `identity ${player.identity} is duplicated or crosses rating groups`,
          );
        }
        identities.add(player.identity);
      } else {
        const row = parseRatingRow(rowMatch[1], groupNumber);
        if (identities.has(row.identity)) {
          fail(
            `identity ${row.identity} is duplicated or crosses rating groups`,
          );
        }
        identities.add(row.identity);
        rows.push(row);
      }
    }
  }
  if (!groups.has(0))
    fail("rating snapshot does not contain an unambiguous group 0");
  return Object.freeze(rows.slice());
}

/** UTF-8 byte order, independent of locale and process settings. */
export function compareUtf8Bytes(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index])
      return leftBytes[index] - rightBytes[index];
  }
  return leftBytes.length - rightBytes.length;
}

export function sha256Hex(input: string | Uint8Array): string {
  return crypto
    .createHash("sha256")
    .update(typeof input === "string" ? Buffer.from(input, "utf8") : input)
    .digest("hex");
}

/**
 * Return exact group-0 identities with enough cumulative games. Snapshot
 * rating is intentionally not a strength filter: the 3600 threshold belongs
 * to each CSA record's embedded game-time ratings.
 */
export function eligibleGroupZeroIdentities(
  rows: readonly FloodgateRatingRow[],
  options: FloodgateEligibilityOptions = {},
): readonly string[] {
  const minimumGames =
    options.minimumGames ?? FLOODGATE_MINIMUM_CUMULATIVE_GAMES;
  if (!Number.isSafeInteger(minimumGames) || minimumGames < 0) {
    fail("minimumGames must be a nonnegative safe integer");
  }
  const seen = new Set<string>();
  const eligible: string[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      fail("eligibility input contains a malformed rating row");
    }
    if (
      typeof row.identity !== "string" ||
      typeof row.visibleName !== "string"
    ) {
      fail("eligibility input contains a malformed rating identity");
    }
    const identity = IDENTITY_RE.exec(row.identity);
    if (
      !Number.isSafeInteger(row.groupNumber) ||
      row.groupNumber < 0 ||
      !Number.isSafeInteger(row.rating) ||
      !Number.isSafeInteger(row.wins) ||
      row.wins < 0 ||
      !Number.isSafeInteger(row.losses) ||
      row.losses < 0 ||
      !Number.isSafeInteger(row.wins + row.losses) ||
      !identity ||
      identity[1] !== row.visibleName
    ) {
      fail("eligibility input contains a malformed rating row");
    }
    if (seen.has(row.identity))
      fail(`eligibility input repeats identity ${row.identity}`);
    seen.add(row.identity);
    if (row.groupNumber === 0 && row.wins + row.losses >= minimumGames) {
      eligible.push(row.identity);
    }
  }
  return Object.freeze(eligible.sort(compareUtf8Bytes).slice());
}

/** Backward-compatible descriptive alias. */
export const deriveEligibleGroupZeroIdentities = eligibleGroupZeroIdentities;

/** Enforce the plan's no-self-play identity rule after joining CSA identities. */
export function assertDistinctFloodgatePlayerIdentities(
  identities: readonly [string, string],
): readonly [string, string] {
  if (!Array.isArray(identities) || identities.length !== 2) {
    fail("game must provide exactly two full player identities");
  }
  for (const identity of identities) {
    if (typeof identity !== "string" || !IDENTITY_RE.test(identity)) {
      fail("game player identity is not a canonical full identity");
    }
  }
  if (identities[0] === identities[1]) {
    fail("game players must have distinct full identities");
  }
  return Object.freeze([identities[0], identities[1]] as const);
}

function assertScalarUnicode(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail(`${label} contains an unpaired UTF-16 surrogate`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail(`${label} contains an unpaired UTF-16 surrogate`);
    }
  }
}

function decodeSourceUtf8(input: string | Uint8Array, label: string): string {
  let text: string;
  if (typeof input === "string") {
    assertScalarUnicode(input, label);
    text = input;
  } else if (input instanceof Uint8Array) {
    try {
      text = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(input);
    } catch {
      return fail(`${label} bytes are not fatal-valid UTF-8`);
    }
  } else {
    return fail(`${label} input must be a string or Uint8Array`);
  }
  if (!text || text.startsWith("\ufeff") || text.includes("\0")) {
    fail(`${label} text is empty or contains a BOM/NUL`);
  }
  return text;
}

function decodeCsaUtf8(input: string | Uint8Array): string {
  const text = decodeSourceUtf8(input, "CSA");
  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized.includes("\r")) fail("CSA text contains a bare CR");
  return normalized;
}

function exactlyOneCsaLine(lines: readonly string[], prefix: string): string {
  const matches = lines.filter((line) => line.startsWith(prefix));
  if (matches.length !== 1) {
    fail(`CSA metadata ${prefix} must occur exactly once`);
  }
  return matches[0];
}

function parseEmbeddedRating(value: string, label: string): number {
  if (!FINITE_NUMBER_RE.test(value)) {
    fail(`${label} is not a canonical finite numeric rating`);
  }
  const rating = Number(value);
  if (!Number.isFinite(rating)) {
    fail(`${label} is not a finite numeric rating`);
  }
  return rating;
}

function identityVisibleName(identity: string, label: string): string {
  if (typeof identity !== "string") {
    fail(`${label} is not a string`);
  }
  const match = IDENTITY_RE.exec(identity);
  if (!match) fail(`${label} is not a canonical full identity`);
  return match[1];
}

/**
 * Parse only identity/rating metadata from exact raw Floodgate CSA text.
 * Byte input is decoded as fatal UTF-8; duplicate or conflicting metadata is
 * rejected rather than resolved by first/last occurrence.
 */
export function parseFloodgateCsaMetadata(
  input: string | Uint8Array,
): FloodgateCsaMetadata {
  const lines = decodeCsaUtf8(input).split("\n");
  const senteNameLine = exactlyOneCsaLine(lines, "N+");
  const goteNameLine = exactlyOneCsaLine(lines, "N-");
  const senteName = senteNameLine.slice(2);
  const goteName = goteNameLine.slice(2);
  if (
    !senteName ||
    senteName !== senteName.trim() ||
    CONTROL_RE.test(senteName) ||
    !goteName ||
    goteName !== goteName.trim() ||
    CONTROL_RE.test(goteName)
  ) {
    fail("CSA N+/N- visible names must be nonempty trimmed text");
  }

  const ratingLine = exactlyOneCsaLine(lines, "'rating:");
  const ratingMatch = new RegExp(
    `^'rating:${IDENTITY_CAPTURE}:${IDENTITY_CAPTURE}$`,
  ).exec(ratingLine);
  if (!ratingMatch) fail("CSA rating identity pair is malformed");
  const senteIdentity = ratingMatch[1];
  const goteIdentity = ratingMatch[2];

  const blackLine = exactlyOneCsaLine(lines, "'black_rate:");
  const whiteLine = exactlyOneCsaLine(lines, "'white_rate:");
  const blackMatch = new RegExp(`^'black_rate:${IDENTITY_CAPTURE}:(.+)$`).exec(
    blackLine,
  );
  const whiteMatch = new RegExp(`^'white_rate:${IDENTITY_CAPTURE}:(.+)$`).exec(
    whiteLine,
  );
  if (!blackMatch || !whiteMatch) {
    fail("CSA black_rate/white_rate metadata is malformed");
  }
  if (blackMatch[1] !== senteIdentity || whiteMatch[1] !== goteIdentity) {
    fail("CSA rating identities conflict across metadata lines");
  }
  if (
    identityVisibleName(senteIdentity, "sente identity") !== senteName ||
    identityVisibleName(goteIdentity, "gote identity") !== goteName
  ) {
    fail("CSA N+/N- names conflict with full rating identities");
  }

  const senteRating = parseEmbeddedRating(blackMatch[2], "black_rate");
  const goteRating = parseEmbeddedRating(whiteMatch[2], "white_rate");
  const identities = Object.freeze([senteIdentity, goteIdentity] as const);
  const embeddedGameTimeRatings = Object.freeze([
    senteRating,
    goteRating,
  ] as const);
  const sente = Object.freeze({
    visibleName: senteName,
    identity: senteIdentity,
    embeddedGameTimeRating: senteRating,
  });
  const gote = Object.freeze({
    visibleName: goteName,
    identity: goteIdentity,
    embeddedGameTimeRating: goteRating,
  });
  return Object.freeze({
    sente,
    gote,
    identities,
    embeddedGameTimeRatings,
  });
}

/**
 * Parse raw CSA, then enforce the preregistered identity and strength gates.
 * This deliberately accepts raw CSA rather than an arbitrary game object, so
 * it cannot bless unknown or score-bearing object fields as label-blind.
 */
export function parseEligibleFloodgateCsaMetadata(
  input: string | Uint8Array,
  dailyEligibleGroupZeroIdentities: Iterable<string>,
): FloodgateCsaMetadata {
  const metadata = parseFloodgateCsaMetadata(input);
  assertDistinctFloodgatePlayerIdentities(metadata.identities);

  const eligible = new Set<string>();
  for (const identity of dailyEligibleGroupZeroIdentities) {
    if (typeof identity !== "string" || !IDENTITY_RE.test(identity)) {
      fail("daily eligible set contains a noncanonical full identity");
    }
    if (eligible.has(identity)) {
      fail("daily eligible identity set contains a duplicate");
    }
    eligible.add(identity);
  }
  if (!metadata.identities.every((identity) => eligible.has(identity))) {
    fail("both game identities must belong to the daily group-0 30-game set");
  }
  if (
    !metadata.embeddedGameTimeRatings.every(
      (rating) => rating >= FLOODGATE_MINIMUM_EMBEDDED_GAME_RATING,
    )
  ) {
    fail(
      `both embedded game-time ratings must be at least ${FLOODGATE_MINIMUM_EMBEDDED_GAME_RATING}`,
    );
  }
  return metadata;
}

function assertSafeAbsoluteUrl(input: string): URL {
  if (
    typeof input !== "string" ||
    !input ||
    input !== input.trim() ||
    CONTROL_RE.test(input) ||
    input.includes("\\")
  ) {
    fail("URL is empty, not trimmed, or contains controls/backslashes");
  }
  if (hasRawDotSegment(input)) fail("URL contains a raw dot path segment");
  if (ENCODED_STRUCTURAL_RE.test(input))
    fail("URL contains encoded traversal or delimiters");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail("URL is not absolute");
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== FLOODGATE_ORIGIN ||
    url.hostname !== "wdoor.c.u-tokyo.ac.jp" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    fail(
      "URL must use the exact Floodgate HTTPS origin without credentials, port, query, or fragment",
    );
  }
  return url;
}

function validateQ1Date(
  yearRaw: string,
  monthRaw: string,
  dayRaw: string,
): FloodgateDailyListing {
  const date = `${yearRaw}-${monthRaw}-${dayRaw}`;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day ||
    date < FLOODGATE_Q1_START ||
    date > FLOODGATE_Q1_END
  ) {
    fail(`date ${date} is not a calendar day in 2026 Q1`);
  }
  return { url: "", date, year, month, day };
}

export function parseFloodgateDailyListingUrl(
  input: string,
): FloodgateDailyListing {
  const url = assertSafeAbsoluteUrl(input);
  const match = /^\/shogi\/x\/(2026)\/(\d{2})\/(\d{2})\/$/.exec(url.pathname);
  if (!match) fail("daily listing path is not /shogi/x/2026/MM/DD/");
  return Object.freeze({
    ...validateQ1Date(match[1], match[2], match[3]),
    url: url.href,
  });
}

export function parseFloodgateDailyRatingUrl(
  input: string,
): FloodgateDailyRatingSnapshot {
  const url = assertSafeAbsoluteUrl(input);
  const match =
    /^\/shogi\/x\/rating\/(players-floodgate-(2026)(\d{2})(\d{2})\.html)$/.exec(
      url.pathname,
    );
  if (!match) {
    fail(
      "daily rating path is not /shogi/x/rating/players-floodgate-YYYYMMDD.html",
    );
  }
  return Object.freeze({
    ...validateQ1Date(match[2], match[3], match[4]),
    url: url.href,
    filename: match[1],
  });
}

export const parseFloodgateDailyRatingSnapshotUrl =
  parseFloodgateDailyRatingUrl;

function decodeFilenamePart(value: string, label: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fail(`${label} has invalid percent encoding`);
  }
  if (
    !decoded ||
    decoded !== decoded.trim() ||
    CONTROL_RE.test(decoded) ||
    /[+\\/?#]/.test(decoded)
  ) {
    fail(`${label} is empty or contains a structural character`);
  }
  return decoded;
}

interface OfficialCsaLocation extends FloodgateDailyListing {
  readonly filename: string;
  readonly event: string;
  readonly visiblePlayers: readonly [string, string];
  readonly timestamp: string;
}

function parseOfficialCsaUrl(input: string): OfficialCsaLocation {
  const url = assertSafeAbsoluteUrl(input);
  const pathMatch = /^\/shogi\/x\/(2026)\/(\d{2})\/(\d{2})\/([^/]+\.csa)$/.exec(
    url.pathname,
  );
  if (!pathMatch)
    fail("CSA path is not a lowercase .csa file in a 2026 daily directory");
  const date = validateQ1Date(pathMatch[1], pathMatch[2], pathMatch[3]);
  const filename = pathMatch[4];
  const fileMatch = /^wdoor\+([^+]+)\+([^+]+)\+([^+]+)\+(\d{14})\.csa$/.exec(
    filename,
  );
  if (!fileMatch || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileMatch[1])) {
    fail("CSA filename does not have a canonical official event token");
  }
  const firstPlayer = decodeFilenamePart(fileMatch[2], "first filename player");
  const secondPlayer = decodeFilenamePart(
    fileMatch[3],
    "second filename player",
  );
  const timestamp = fileMatch[4];
  if (!timestamp.startsWith(`${pathMatch[1]}${pathMatch[2]}${pathMatch[3]}`)) {
    fail("CSA timestamp does not match its daily directory");
  }
  const hour = Number(timestamp.slice(8, 10));
  const minute = Number(timestamp.slice(10, 12));
  const second = Number(timestamp.slice(12, 14));
  if (hour > 23 || minute > 59 || second > 59)
    fail("CSA timestamp has an invalid time of day");

  return Object.freeze({
    ...date,
    url: url.href,
    filename,
    event: fileMatch[1],
    visiblePlayers: Object.freeze([firstPlayer, secondPlayer] as const),
    timestamp,
  });
}

export function parseFloodgateCsaUrl(input: string): FloodgateCsaLocation {
  const location = parseOfficialCsaUrl(input);
  if (location.event !== FLOODGATE_EVENT) {
    fail(`CSA filename event must be exactly ${FLOODGATE_EVENT}`);
  }
  return Object.freeze({ ...location, event: FLOODGATE_EVENT });
}

function discoverFloodgateCsaUrlsFromHtml(
  html: string,
  listing: FloodgateDailyListing,
): readonly FloodgateCsaLocation[] {
  assertNoHiddenStructuralHtml(html, "daily listing");
  const discovered = new Map<string, FloodgateCsaLocation>();
  for (const anchor of html.matchAll(/<a\b([^>]*)>/gi)) {
    const attributes = parseQuotedAttributes(anchor[1], "daily listing anchor");
    const href = attributes.get("href");
    if (!href) continue;
    if (!/\.csa(?:[?#]|$)/i.test(href)) continue;
    if (
      href !== href.trim() ||
      CONTROL_RE.test(href) ||
      href.includes("\\") ||
      hasRawDotSegment(href) ||
      ENCODED_STRUCTURAL_RE.test(href)
    ) {
      fail("daily listing CSA href contains a raw or encoded path alias");
    }
    let absolute: string;
    try {
      absolute = new URL(href, listing.url).href;
    } catch {
      return fail("daily listing has an invalid CSA href");
    }
    const location = parseOfficialCsaUrl(absolute);
    if (location.date !== listing.date)
      fail("daily listing links to CSA from another date");
    if (location.event !== FLOODGATE_EVENT) continue;
    discovered.set(
      location.url,
      Object.freeze({ ...location, event: FLOODGATE_EVENT }),
    );
  }
  return Object.freeze(
    [...discovered.values()].sort((left, right) =>
      compareUtf8Bytes(left.url, right.url),
    ),
  );
}

/**
 * Bind one daily directory listing to the exact response body used for link
 * discovery. String-only discovery is deliberately not exported: callers
 * must retain byte provenance and pass fatal-valid UTF-8 response bytes.
 */
export function parseFloodgateDailyListingEvidence(
  input: FloodgateDailyListingEvidenceInput,
): FloodgateDailyListingEvidence {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    fail("listing evidence input must be a plain object");
  }
  const keys = Object.keys(input).sort(compareUtf8Bytes);
  const expectedKeys = ["listingBytes", "listingUrl"].sort(compareUtf8Bytes);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail("listing evidence input has unknown or missing fields");
  }
  if (typeof input.listingUrl !== "string") {
    fail("listing evidence URL must be a primitive string");
  }

  const location = parseFloodgateDailyListingUrl(input.listingUrl);
  const listingBytes = copyEvidenceBytes(input.listingBytes, "listingBytes");
  const html = decodeSourceUtf8(listingBytes, "daily listing");
  const csaLocations = discoverFloodgateCsaUrlsFromHtml(html, location);
  const body = Object.freeze({
    bytes: listingBytes.byteLength,
    sha256: sha256Hex(listingBytes),
  });
  return Object.freeze({
    schema: "shogi-floodgate-daily-listing-evidence-v1" as const,
    date: location.date,
    listing: Object.freeze({ location, body }),
    csaLocations,
  });
}

function previousCalendarDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) fail("date is not canonical YYYY-MM-DD");
  const instant = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  instant.setUTCDate(instant.getUTCDate() - 1);
  return instant.toISOString().slice(0, 10);
}

function parseRatingLastModified(html: string, snapshotDate: string): string {
  const markerCount = html.split("Last modified at").length - 1;
  const matches = [
    ...html.matchAll(
      /Last modified at (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) \+0900/g,
    ),
  ];
  if (markerCount !== 1 || matches.length !== 1) {
    fail(
      "rating footer must contain exactly one Last modified at YYYY-MM-DD HH:MM:SS +0900",
    );
  }
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] =
    matches[0];
  const footerDate = `${yearRaw}-${monthRaw}-${dayRaw}`;
  const instant = new Date(
    Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw)),
  );
  if (
    instant.getUTCFullYear() !== Number(yearRaw) ||
    instant.getUTCMonth() + 1 !== Number(monthRaw) ||
    instant.getUTCDate() !== Number(dayRaw) ||
    Number(hourRaw) > 23 ||
    Number(minuteRaw) > 59 ||
    Number(secondRaw) > 59
  ) {
    fail("rating footer has an invalid calendar timestamp");
  }
  if (footerDate !== previousCalendarDate(snapshotDate)) {
    fail("rating footer date must be the previous calendar date");
  }
  return `${footerDate} ${hourRaw}:${minuteRaw}:${secondRaw} +0900`;
}

function parseFloodgateCsaSourceHeader(
  input: Uint8Array,
  location: FloodgateCsaLocation,
): FloodgateCsaSourceHeader {
  const lines = decodeCsaUtf8(input).split("\n");
  const eventLine = exactlyOneCsaLine(lines, "$EVENT:");
  const startLine = exactlyOneCsaLine(lines, "$START_TIME:");
  const event = eventLine.slice("$EVENT:".length);
  const expectedEvent = `wdoor+${FLOODGATE_EVENT}+${location.visiblePlayers[0]}+${location.visiblePlayers[1]}+${location.timestamp}`;
  if (event !== expectedEvent) {
    fail(
      "CSA $EVENT does not match its validated URL event, players, and timestamp",
    );
  }
  const startTime = startLine.slice("$START_TIME:".length);
  const startMatch = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    startTime,
  );
  if (!startMatch) fail("CSA $START_TIME is malformed");
  const startDate = `${startMatch[1]}-${startMatch[2]}-${startMatch[3]}`;
  const instant = new Date(
    Date.UTC(
      Number(startMatch[1]),
      Number(startMatch[2]) - 1,
      Number(startMatch[3]),
    ),
  );
  if (
    instant.getUTCFullYear() !== Number(startMatch[1]) ||
    instant.getUTCMonth() + 1 !== Number(startMatch[2]) ||
    instant.getUTCDate() !== Number(startMatch[3]) ||
    Number(startMatch[4]) > 23 ||
    Number(startMatch[5]) > 59 ||
    Number(startMatch[6]) > 59 ||
    startDate !== location.date
  ) {
    fail("CSA $START_TIME is invalid or does not match its URL date");
  }
  const compactStartMinute = `${startMatch[1]}${startMatch[2]}${startMatch[3]}${startMatch[4]}${startMatch[5]}`;
  const startToEventSeconds =
    Number(location.timestamp.slice(12, 14)) - Number(startMatch[6]);
  if (
    compactStartMinute !== location.timestamp.slice(0, 12) ||
    startToEventSeconds < 0
  ) {
    fail(
      "CSA $START_TIME must share the URL event minute and must not follow it",
    );
  }
  return Object.freeze({ event, startTime });
}

function copyEvidenceBytes(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    fail(`${label} must be an exact Uint8Array body`);
  }
  return Uint8Array.from(value);
}

/**
 * Bind one game to exact rating/CSA response bodies. There is deliberately no
 * adjacent-snapshot fallback: if a daily snapshot is missing (including
 * 2026-03-27/28), the caller emits no evidence for that game.
 */
export function parseFloodgateGameSourceEvidence(
  input: FloodgateGameSourceEvidenceInput,
): FloodgateGameSourceEvidence {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    fail("source evidence input must be a plain object");
  }
  const keys = Object.keys(input).sort(compareUtf8Bytes);
  const expectedKeys = ["csaBytes", "csaUrl", "ratingBytes", "ratingUrl"].sort(
    compareUtf8Bytes,
  );
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail("source evidence input has unknown or missing fields");
  }
  if (typeof input.ratingUrl !== "string" || typeof input.csaUrl !== "string") {
    fail("source evidence URLs must be primitive strings");
  }

  const ratingLocation = parseFloodgateDailyRatingUrl(input.ratingUrl);
  const csaLocation = parseFloodgateCsaUrl(input.csaUrl);
  if (ratingLocation.date !== csaLocation.date) {
    fail(
      "rating and CSA evidence URLs must have the same date; adjacent snapshots are forbidden",
    );
  }
  const ratingBytes = copyEvidenceBytes(input.ratingBytes, "ratingBytes");
  const csaBytes = copyEvidenceBytes(input.csaBytes, "csaBytes");
  const ratingHtml = decodeSourceUtf8(ratingBytes, "rating snapshot");
  const rows = parseFloodgateRatingSnapshot(ratingHtml);
  const eligibleIdentities = eligibleGroupZeroIdentities(rows);
  const lastModifiedAt = parseRatingLastModified(
    ratingHtml,
    ratingLocation.date,
  );
  const header = parseFloodgateCsaSourceHeader(csaBytes, csaLocation);
  const metadata = parseEligibleFloodgateCsaMetadata(
    csaBytes,
    eligibleIdentities,
  );
  if (
    metadata.sente.visibleName !== csaLocation.visiblePlayers[0] ||
    metadata.gote.visibleName !== csaLocation.visiblePlayers[1]
  ) {
    fail("CSA metadata player names do not match its validated URL");
  }

  const ratingBody = Object.freeze({
    bytes: ratingBytes.byteLength,
    sha256: sha256Hex(ratingBytes),
  });
  const csaBody = Object.freeze({
    bytes: csaBytes.byteLength,
    sha256: sha256Hex(csaBytes),
  });
  return Object.freeze({
    schema: "shogi-floodgate-game-source-evidence-v1" as const,
    date: csaLocation.date,
    rating: Object.freeze({
      location: ratingLocation,
      body: ratingBody,
      lastModifiedAt,
      rows,
      eligibleGroupZeroIdentities: eligibleIdentities,
    }),
    csa: Object.freeze({
      location: csaLocation,
      body: csaBody,
      header,
      metadata,
    }),
  });
}
