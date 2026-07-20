"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ml/floodgate-raw-verification-worker.ts
var import_node_worker_threads = require("node:worker_threads");

// ml/floodgate-raw-lock.ts
var import_node_crypto = require("node:crypto");
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));
var import_node_util2 = require("node:util");

// ml/floodgate-source.ts
var crypto = __toESM(require("crypto"));
var import_node_buffer = require("node:buffer");
var import_node_util = require("node:util");
var IntrinsicUint8Array = Uint8Array;
var TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(
  IntrinsicUint8Array.prototype
);
function requireTypedArrayIntrinsicGetter(name) {
  const getter = Object.getOwnPropertyDescriptor(
    TYPED_ARRAY_PROTOTYPE,
    name
  )?.get;
  if (typeof getter !== "function") {
    throw new Error(`missing intrinsic %TypedArray%.prototype.${name} getter`);
  }
  return getter;
}
var TYPED_ARRAY_BUFFER_GETTER = requireTypedArrayIntrinsicGetter("buffer");
var TYPED_ARRAY_BYTE_LENGTH_GETTER = requireTypedArrayIntrinsicGetter("byteLength");
var TYPED_ARRAY_BYTE_OFFSET_GETTER = requireTypedArrayIntrinsicGetter("byteOffset");
var INTRINSIC_UINT8_ARRAY_SET = IntrinsicUint8Array.prototype.set;
var FLOODGATE_ORIGIN = "https://wdoor.c.u-tokyo.ac.jp";
var FLOODGATE_EVENT = "floodgate-300-10F";
var FLOODGATE_PERIOD_END_INVENTORY_SNAPSHOT = "players-floodgate-20260401.html";
var FLOODGATE_PERIOD_END_INVENTORY_URL = `${FLOODGATE_ORIGIN}/shogi/x/rating/${FLOODGATE_PERIOD_END_INVENTORY_SNAPSHOT}`;
var FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_BODY = Object.freeze({
  bytes: 332094,
  sha256: "17bd9969ba31a2b9a723be4b7defb7b3045816b19e325de19e8b65158fbac5b4"
});
var FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_COUNTS = Object.freeze({
  ratingRows: 316,
  groupZeroIdentities: 316,
  identitiesAtLeast3600And30Games: 152
});
var FLOODGATE_Q1_START = "2026-01-01";
var FLOODGATE_Q1_END = "2026-03-31";
var FLOODGATE_Q1_DAILY_LISTING_COUNT = 90;
var FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED = Object.freeze({
  rows: FLOODGATE_Q1_DAILY_LISTING_COUNT,
  bytes: 10963,
  sha256: "05d353413f310087316e16cfc1ec29800967886db43f090aee59f713c4bfc822"
});
var FLOODGATE_MINIMUM_CUMULATIVE_GAMES = 30;
var FLOODGATE_MINIMUM_EMBEDDED_GAME_RATING = 3600;
var PLAYER_PATH = "/shogi/view/show-player.cgi";
var INTEGERISH_RE = /^[+-]?\d+(?:\.0+)?$/;
var IDENTITY_RE = /^([^:\r\n]+)\+([0-9a-f]{32})$/;
var ENCODED_STRUCTURAL_RE = /%(?:2e|2f|5c|25)/i;
var CONTROL_RE = /[\u0000-\u001f\u007f]/;
function fail(message) {
  throw new Error(`invalid Floodgate source: ${message}`);
}
function assertStrictPlainDataObject(value, label) {
  if (import_node_util.types.isProxy(value)) fail(`${label} must not be a Proxy`);
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${label} must be a plain object with Object.prototype`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail(`${label} must not contain symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      fail(`${label}.${key} must be a data property, not an accessor`);
    }
    if (!descriptor.enumerable) {
      fail(`${label}.${key} must not be non-enumerable`);
    }
  }
  return value;
}
function assertExactOwnKeys(value, expected, label) {
  const actual = Object.getOwnPropertyNames(value).sort(compareUtf8Bytes);
  const wanted = [...expected].sort(compareUtf8Bytes);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} must contain exactly keys ${wanted.join(",")}`);
  }
}
function assertNoHiddenStructuralHtml(html, label) {
  const structuralPattern = /<\s*\/?\s*(?:a|table|tbody|tr|td|caption|span)\b|Last modified at/i;
  let visible = html;
  let cursor = 0;
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
    visible = `${visible.slice(0, opening)}${visible.slice(opening, end).replace(/[^\r\n]/g, " ")}${visible.slice(end)}`;
    cursor = end;
  }
  const tokenPattern = /<\/?(?:script|style)\b[^>]*>/gi;
  let active2;
  for (const match of visible.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index;
    const lower = token.toLowerCase();
    if (!active2) {
      if (lower.startsWith("</")) {
        fail(
          `${label} contains an unmatched ${lower.slice(2).split(/[\s>]/, 1)[0]} close tag`
        );
      }
      active2 = {
        kind: lower.startsWith("<script") ? "script" : "style",
        start: index + token.length
      };
      continue;
    }
    const isExpectedClose = active2.kind === "script" && /^<\/script\s*>$/i.test(token) || active2.kind === "style" && /^<\/style\s*>$/i.test(token);
    if (!isExpectedClose) {
      fail(`${label} contains nested or overlapping hidden HTML blocks`);
    }
    const hidden = visible.slice(active2.start, index);
    if (structuralPattern.test(hidden)) {
      fail(`${label} hides structural markup in a ${active2.kind} block`);
    }
    active2 = void 0;
  }
  if (active2) fail(`${label} contains an unclosed ${active2.kind} block`);
}
function hasRawDotSegment(value) {
  const path2 = value.split(/[?#]/, 1)[0];
  return path2.split("/").some((segment) => segment === "." || segment === "..");
}
function decodeHtmlEntities(value) {
  return value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi,
    (entity, body) => {
      const normalized = body.toLowerCase();
      const named = {
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        nbsp: " ",
        quot: '"'
      };
      if (normalized in named) return named[normalized];
      const codePoint = normalized.startsWith("#x") ? Number.parseInt(normalized.slice(2), 16) : normalized.startsWith("#") ? Number.parseInt(normalized.slice(1), 10) : Number.NaN;
      if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 1114111 || codePoint >= 55296 && codePoint <= 57343) {
        return fail(`invalid or unsupported HTML entity ${entity}`);
      }
      return String.fromCodePoint(codePoint);
    }
  );
}
function textOnly(fragment, label) {
  if (/<[^>]*>/.test(fragment)) fail(`${label} contains unexpected markup`);
  const value = decodeHtmlEntities(fragment).trim();
  if (!value || CONTROL_RE.test(value))
    fail(`${label} is empty or contains controls`);
  return value;
}
function parseQuotedAttributes(raw, label) {
  const attributes = /* @__PURE__ */ new Map();
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
function exactlyOneMatch(value, expression, label) {
  const flags = expression.flags.includes("g") ? expression.flags : `${expression.flags}g`;
  const global = new RegExp(expression.source, flags);
  const matches = [...value.matchAll(global)];
  if (matches.length !== 1) fail(`${label} must occur exactly once`);
  return matches[0];
}
function parseIntegerish(fragment, label) {
  const text = textOnly(fragment, label).replace(/\u00a0/g, "");
  if (!INTEGERISH_RE.test(text)) fail(`${label} is not an integer-like number`);
  const value = Number(text);
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    fail(`${label} is not a finite safe integer`);
  }
  return value;
}
function parseJavaScriptString(raw, label) {
  try {
    const value = JSON.parse(`"${raw}"`);
    if (typeof value !== "string" || CONTROL_RE.test(value))
      fail(`${label} is invalid`);
    return value;
  } catch {
    return fail(`${label} is not a valid quoted JavaScript string`);
  }
}
function oneSearchParameter(url, key) {
  const values = url.searchParams.getAll(key);
  if (values.length !== 1 || values[0] === "")
    fail(`player href has ambiguous ${key}`);
  return values[0];
}
function parsePlayerCell(fragment) {
  const anchor = exactlyOneMatch(
    fragment,
    /<a\b([^>]*)>([\s\S]*?)<\/a>/i,
    "player anchor"
  );
  const attributes = parseQuotedAttributes(anchor[1], "player anchor");
  const anchorId = attributes.get("id");
  const href = attributes.get("href");
  if (!anchorId || !href) fail("player anchor requires id and href");
  if (attributes.size !== 2) fail("player anchor has unexpected attributes");
  const visibleName = textOnly(anchor[2], "visible player name");
  if (!href || href !== href.trim() || CONTROL_RE.test(href) || href.includes("\\") || hasRawDotSegment(href) || ENCODED_STRUCTURAL_RE.test(href)) {
    fail("player href contains a raw or encoded path alias");
  }
  let playerUrl;
  try {
    playerUrl = new URL(href, FLOODGATE_ORIGIN);
  } catch {
    return fail("player href is not a URL");
  }
  if (playerUrl.origin !== FLOODGATE_ORIGIN || playerUrl.pathname !== PLAYER_PATH || playerUrl.hash || playerUrl.username || playerUrl.password) {
    fail("player href is outside the official player endpoint");
  }
  if (playerUrl.searchParams.size !== 4)
    fail("player href has unexpected parameters");
  if (oneSearchParameter(playerUrl, "event") !== "LATEST" || oneSearchParameter(playerUrl, "filter") !== "floodgate" || oneSearchParameter(playerUrl, "show_self_play") !== "1") {
    fail("player href has unexpected fixed parameters");
  }
  const hrefIdentity = oneSearchParameter(playerUrl, "user");
  const context = exactlyOneMatch(
    fragment,
    /\bcontext\s*:\s*"((?:[^"\\]|\\.)*)"/i,
    "tooltip context"
  );
  const tooltip = exactlyOneMatch(
    fragment,
    /\btext\s*:\s*"((?:[^"\\]|\\.)*)"/i,
    "identity tooltip"
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
      "full identity does not match the visible name plus credential digest"
    );
  }
  return { visibleName, identity: hrefIdentity };
}
function parseRatingCells(fragment, groupLabel) {
  const cells = [...fragment.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
  if (cells.length !== 7)
    fail(`${groupLabel} row must contain exactly seven cells`);
  const classes = cells.map((cell, index) => {
    const attributes = parseQuotedAttributes(
      cell[1],
      `${groupLabel} cell ${index + 1}`
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
    "rate"
  ];
  if (classes.some((value, index) => value !== expected[index])) {
    fail(`${groupLabel} row has unexpected cell classes`);
  }
  return cells;
}
function parseRatingRow(fragment, groupNumber) {
  const cells = parseRatingCells(fragment, `group ${groupNumber}`);
  const player = parsePlayerCell(cells[0][2]);
  const ratingSpan = exactlyOneMatch(
    cells[1][2],
    /<span\b[^>]*>([\s\S]*?)<\/span>/i,
    "rating span"
  );
  const rating = parseIntegerish(ratingSpan[1], "rating");
  const wins = parseIntegerish(cells[2][2], "wins");
  const losses = parseIntegerish(cells[3][2], "losses");
  if (wins < 0 || losses < 0) fail("wins and losses must be nonnegative");
  return Object.freeze({ groupNumber, ...player, rating, wins, losses });
}
function parseUnratedIdentityRow(fragment) {
  const cells = parseRatingCells(fragment, "not-yet-rated group");
  const player = parsePlayerCell(cells[0][2]);
  const ratingSpan = exactlyOneMatch(
    cells[1][2],
    /<span\b[^>]*>([\s\S]*?)<\/span>/i,
    "unrated rating span"
  );
  if (textOnly(ratingSpan[1], "unrated rating") !== "N/A" || textOnly(cells[6][2], "unrated rate24") !== "N/A") {
    fail("not-yet-rated row unexpectedly contains a numeric rating");
  }
  const wins = parseIntegerish(cells[2][2], "unrated wins");
  const losses = parseIntegerish(cells[3][2], "unrated losses");
  if (wins < 0 || losses < 0) {
    fail("not-yet-rated wins and losses must be nonnegative");
  }
  return player;
}
function parseFloodgateRatingSnapshot(input) {
  const html = decodeSourceUtf8(input, "rating snapshot");
  if (html.length === 0 || CONTROL_RE.test(html.replace(/[\t\n\r]/g, ""))) {
    fail("rating snapshot is empty or contains controls");
  }
  assertNoHiddenStructuralHtml(html, "rating snapshot");
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length === 0) fail("rating snapshot contains no tables");
  const rows = [];
  const groups = /* @__PURE__ */ new Set();
  const identities = /* @__PURE__ */ new Set();
  let sawUnrated = false;
  for (const table of tables) {
    const captionMatch = exactlyOneMatch(
      table[1],
      /<caption\b[^>]*>([\s\S]*?)<\/caption>/i,
      "table caption"
    );
    const caption = textOnly(captionMatch[1], "table caption");
    let groupNumber = null;
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
      groupNumber === null ? "not-yet-rated group body" : `group ${groupNumber} body`
    );
    const rowMatches = [...tbody[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rowMatches.length === 0) fail(`${caption} has no players`);
    for (const rowMatch of rowMatches) {
      if (groupNumber === null) {
        const player = parseUnratedIdentityRow(rowMatch[1]);
        if (identities.has(player.identity)) {
          fail(
            `identity ${player.identity} is duplicated or crosses rating groups`
          );
        }
        identities.add(player.identity);
      } else {
        const row = parseRatingRow(rowMatch[1], groupNumber);
        if (identities.has(row.identity)) {
          fail(
            `identity ${row.identity} is duplicated or crosses rating groups`
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
function compareUtf8Bytes(left, right) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index])
      return leftBytes[index] - rightBytes[index];
  }
  return leftBytes.length - rightBytes.length;
}
function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}
function eligibleGroupZeroIdentities(rows, options = {}) {
  const minimumGames = options.minimumGames ?? FLOODGATE_MINIMUM_CUMULATIVE_GAMES;
  if (!Number.isSafeInteger(minimumGames) || minimumGames < 0) {
    fail("minimumGames must be a nonnegative safe integer");
  }
  const seen = /* @__PURE__ */ new Set();
  const eligible = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      fail("eligibility input contains a malformed rating row");
    }
    if (typeof row.identity !== "string" || typeof row.visibleName !== "string") {
      fail("eligibility input contains a malformed rating identity");
    }
    const identity = IDENTITY_RE.exec(row.identity);
    if (!Number.isSafeInteger(row.groupNumber) || row.groupNumber < 0 || !Number.isSafeInteger(row.rating) || !Number.isSafeInteger(row.wins) || row.wins < 0 || !Number.isSafeInteger(row.losses) || row.losses < 0 || !Number.isSafeInteger(row.wins + row.losses) || !identity || identity[1] !== row.visibleName) {
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
function assertScalarUnicode(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 55296 && codeUnit <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343)) {
        fail(`${label} contains an unpaired UTF-16 surrogate`);
      }
      index += 1;
    } else if (codeUnit >= 56320 && codeUnit <= 57343) {
      fail(`${label} contains an unpaired UTF-16 surrogate`);
    }
  }
}
function decodeSourceUtf8(input, label) {
  let text;
  if (typeof input === "string") {
    assertScalarUnicode(input, label);
    text = input;
  } else if (input instanceof Uint8Array) {
    if (!(0, import_node_buffer.isUtf8)(input)) fail(`${label} bytes are not fatal-valid UTF-8`);
    text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true
    }).decode(input);
  } else {
    return fail(`${label} input must be a string or Uint8Array`);
  }
  if (!text || text.startsWith("\uFEFF") || text.includes("\0")) {
    fail(`${label} text is empty or contains a BOM/NUL`);
  }
  return text;
}
function assertSafeAbsoluteUrl(input) {
  if (typeof input !== "string" || !input || input !== input.trim() || CONTROL_RE.test(input) || input.includes("\\")) {
    fail("URL is empty, not trimmed, or contains controls/backslashes");
  }
  if (hasRawDotSegment(input)) fail("URL contains a raw dot path segment");
  if (ENCODED_STRUCTURAL_RE.test(input))
    fail("URL contains encoded traversal or delimiters");
  let url;
  try {
    url = new URL(input);
  } catch {
    return fail("URL is not absolute");
  }
  if (url.protocol !== "https:" || url.origin !== FLOODGATE_ORIGIN || url.hostname !== "wdoor.c.u-tokyo.ac.jp" || url.port || url.username || url.password || url.search || url.hash) {
    fail(
      "URL must use the exact Floodgate HTTPS origin without credentials, port, query, or fragment"
    );
  }
  return url;
}
function validateQ1Date(yearRaw, monthRaw, dayRaw) {
  const date = `${yearRaw}-${monthRaw}-${dayRaw}`;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day || date < FLOODGATE_Q1_START || date > FLOODGATE_Q1_END) {
    fail(`date ${date} is not a calendar day in 2026 Q1`);
  }
  return { url: "", date, year, month, day };
}
function parseFloodgateDailyListingUrl(input) {
  const url = assertSafeAbsoluteUrl(input);
  const match = /^\/shogi\/x\/(2026)\/(\d{2})\/(\d{2})\/$/.exec(url.pathname);
  if (!match) fail("daily listing path is not /shogi/x/2026/MM/DD/");
  return Object.freeze({
    ...validateQ1Date(match[1], match[2], match[3]),
    url: url.href
  });
}
function parseFloodgateDailyRatingUrl(input) {
  const url = assertSafeAbsoluteUrl(input);
  const match = /^\/shogi\/x\/rating\/(players-floodgate-(2026)(\d{2})(\d{2})\.html)$/.exec(
    url.pathname
  );
  if (!match) {
    fail(
      "daily rating path is not /shogi/x/rating/players-floodgate-YYYYMMDD.html"
    );
  }
  return Object.freeze({
    ...validateQ1Date(match[2], match[3], match[4]),
    url: url.href,
    filename: match[1]
  });
}
function decodeFilenamePart(value, label) {
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fail(`${label} has invalid percent encoding`);
  }
  if (!decoded || decoded !== decoded.trim() || CONTROL_RE.test(decoded) || /[+\\/?#]/.test(decoded)) {
    fail(`${label} is empty or contains a structural character`);
  }
  return decoded;
}
function parseOfficialCsaUrl(input) {
  const url = assertSafeAbsoluteUrl(input);
  const pathMatch = /^\/shogi\/x\/(2026)\/(\d{2})\/(\d{2})\/([^/]+\.csa)$/.exec(
    url.pathname
  );
  if (!pathMatch)
    fail("CSA path is not a lowercase .csa file in a 2026 daily directory");
  const date = validateQ1Date(pathMatch[1], pathMatch[2], pathMatch[3]);
  const filename = pathMatch[4];
  const fileMatch = /^wdoor\+([^+]+)\+([^+]+)\+([^+]+)\+(\d{14})\.csa$/.exec(
    filename
  );
  if (!fileMatch || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileMatch[1])) {
    fail("CSA filename does not have a canonical official event token");
  }
  const firstPlayer = decodeFilenamePart(fileMatch[2], "first filename player");
  const secondPlayer = decodeFilenamePart(
    fileMatch[3],
    "second filename player"
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
    visiblePlayers: Object.freeze([firstPlayer, secondPlayer]),
    timestamp
  });
}
function parseFloodgateCsaUrl(input) {
  const location = parseOfficialCsaUrl(input);
  if (location.event !== FLOODGATE_EVENT) {
    fail(`CSA filename event must be exactly ${FLOODGATE_EVENT}`);
  }
  return Object.freeze({ ...location, event: FLOODGATE_EVENT });
}
function discoverFloodgateCsaUrlsFromHtml(html, listing) {
  assertNoHiddenStructuralHtml(html, "daily listing");
  const allOfficial = /* @__PURE__ */ new Map();
  const target = /* @__PURE__ */ new Map();
  for (const anchor of html.matchAll(/<a\b([^>]*)>/gi)) {
    const attributes = parseQuotedAttributes(anchor[1], "daily listing anchor");
    const href = attributes.get("href");
    if (!href) continue;
    if (!/\.csa(?:[?#]|$)/i.test(href)) continue;
    if (href !== href.trim() || CONTROL_RE.test(href) || href.includes("\\") || hasRawDotSegment(href) || ENCODED_STRUCTURAL_RE.test(href)) {
      fail("daily listing CSA href contains a raw or encoded path alias");
    }
    let absolute;
    try {
      absolute = new URL(href, listing.url).href;
    } catch {
      return fail("daily listing has an invalid CSA href");
    }
    const location = parseOfficialCsaUrl(absolute);
    if (location.date !== listing.date)
      fail("daily listing links to CSA from another date");
    allOfficial.set(location.url, location);
    if (location.event === FLOODGATE_EVENT) {
      target.set(
        location.url,
        Object.freeze({ ...location, event: FLOODGATE_EVENT })
      );
    }
  }
  const allOfficialCsaLocations = Object.freeze(
    [...allOfficial.values()].sort(
      (left, right) => compareUtf8Bytes(left.url, right.url)
    )
  );
  const targetCsaLocations = Object.freeze(
    [...target.values()].sort(
      (left, right) => compareUtf8Bytes(left.url, right.url)
    )
  );
  return Object.freeze({ allOfficialCsaLocations, targetCsaLocations });
}
function parseFloodgateDailyArchiveEvidence(input) {
  const value = assertStrictPlainDataObject(input, "archive evidence input");
  assertExactOwnKeys(
    value,
    ["listingBytes", "listingUrl"],
    "archive evidence input"
  );
  if (typeof value.listingUrl !== "string") {
    fail("archive evidence URL must be a primitive string");
  }
  const location = parseFloodgateDailyListingUrl(value.listingUrl);
  const listingBytes = copyEvidenceBytes(value.listingBytes, "listingBytes");
  const html = decodeSourceUtf8(listingBytes, "daily listing");
  const { allOfficialCsaLocations, targetCsaLocations } = discoverFloodgateCsaUrlsFromHtml(html, location);
  const body = Object.freeze({
    bytes: listingBytes.byteLength,
    sha256: sha256Hex(listingBytes)
  });
  return Object.freeze({
    schema: "shogi-floodgate-daily-archive-evidence-v1",
    date: location.date,
    listing: Object.freeze({ location, body }),
    allOfficialCsaLocations,
    targetCsaLocations
  });
}
function previousCalendarDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) fail("date is not canonical YYYY-MM-DD");
  const instant = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  instant.setUTCDate(instant.getUTCDate() - 1);
  return instant.toISOString().slice(0, 10);
}
function parseRatingLastModified(html, snapshotDate) {
  const markerCount = html.split("Last modified at").length - 1;
  const matches = [
    ...html.matchAll(
      /Last modified at (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) \+0900/g
    )
  ];
  if (markerCount !== 1 || matches.length !== 1) {
    fail(
      "rating footer must contain exactly one Last modified at YYYY-MM-DD HH:MM:SS +0900"
    );
  }
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = matches[0];
  const footerDate = `${yearRaw}-${monthRaw}-${dayRaw}`;
  const instant = new Date(
    Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw))
  );
  if (instant.getUTCFullYear() !== Number(yearRaw) || instant.getUTCMonth() + 1 !== Number(monthRaw) || instant.getUTCDate() !== Number(dayRaw) || Number(hourRaw) > 23 || Number(minuteRaw) > 59 || Number(secondRaw) > 59) {
    fail("rating footer has an invalid calendar timestamp");
  }
  if (footerDate !== previousCalendarDate(snapshotDate)) {
    fail("rating footer date must be the previous calendar date");
  }
  return `${footerDate} ${hourRaw}:${minuteRaw}:${secondRaw} +0900`;
}
function summarizeFloodgatePeriodEndInventoryRows(rows) {
  const minimumGameIdentities = new Set(eligibleGroupZeroIdentities(rows));
  const groupZeroIdentities = rows.filter(
    (row) => row.groupNumber === 0
  ).length;
  const identitiesAtLeast3600And30Games = rows.filter(
    (row) => row.groupNumber === 0 && minimumGameIdentities.has(row.identity) && row.rating >= FLOODGATE_MINIMUM_EMBEDDED_GAME_RATING
  ).length;
  return Object.freeze({
    ratingRows: rows.length,
    groupZeroIdentities,
    identitiesAtLeast3600And30Games
  });
}
function assertFloodgatePeriodEndInventoryExpectedBody(body) {
  if (body.bytes !== FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_BODY.bytes || body.sha256 !== FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_BODY.sha256) {
    fail("period-end inventory body does not match the expected identity");
  }
}
function parseFloodgatePeriodEndInventoryEvidence(input) {
  const value = assertStrictPlainDataObject(
    input,
    "period-end inventory evidence input"
  );
  assertExactOwnKeys(
    value,
    ["ratingBytes", "ratingUrl"],
    "period-end inventory evidence input"
  );
  if (typeof value.ratingUrl !== "string") {
    fail("period-end inventory URL must be a primitive string");
  }
  if (value.ratingUrl !== FLOODGATE_PERIOD_END_INVENTORY_URL) {
    fail("period-end inventory URL must be the exact 2026-04-01 snapshot");
  }
  const ratingBytes = copyEvidenceBytes(value.ratingBytes, "ratingBytes");
  const html = decodeSourceUtf8(ratingBytes, "period-end rating snapshot");
  const body = Object.freeze({
    bytes: ratingBytes.byteLength,
    sha256: sha256Hex(ratingBytes)
  });
  assertFloodgatePeriodEndInventoryExpectedBody(body);
  const rows = parseFloodgateRatingSnapshot(html);
  const lastModifiedAt = parseRatingLastModified(html, "2026-04-01");
  const counts = summarizeFloodgatePeriodEndInventoryRows(rows);
  if (counts.ratingRows !== FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_COUNTS.ratingRows || counts.groupZeroIdentities !== FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_COUNTS.groupZeroIdentities || counts.identitiesAtLeast3600And30Games !== FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_COUNTS.identitiesAtLeast3600And30Games) {
    fail("period-end inventory aggregate counts do not match preregistration");
  }
  return Object.freeze({
    schema: "shogi-floodgate-period-end-inventory-evidence-v1",
    purpose: "period-end-aggregate-inventory-only-not-daily-eligibility",
    dailyEligibilityAllowed: false,
    identityListsExposed: false,
    snapshot: Object.freeze({
      url: FLOODGATE_PERIOD_END_INVENTORY_URL,
      filename: FLOODGATE_PERIOD_END_INVENTORY_SNAPSHOT,
      snapshotDate: "2026-04-01",
      body,
      lastModifiedAt,
      counts
    })
  });
}
function copyEvidenceBytes(value, label) {
  if (import_node_util.types.isProxy(value)) {
    fail(`${label} must not be a Proxy`);
  }
  if (!import_node_util.types.isUint8Array(value)) {
    fail(`${label} must be an exact Uint8Array body`);
  }
  let buffer;
  let byteLength;
  let byteOffset;
  try {
    buffer = Reflect.apply(TYPED_ARRAY_BUFFER_GETTER, value, []);
    byteLength = Reflect.apply(TYPED_ARRAY_BYTE_LENGTH_GETTER, value, []);
    byteOffset = Reflect.apply(TYPED_ARRAY_BYTE_OFFSET_GETTER, value, []);
  } catch {
    return fail(`${label} has inaccessible typed-array storage`);
  }
  if (import_node_util.types.isSharedArrayBuffer(buffer)) {
    fail(`${label} must not be backed by SharedArrayBuffer`);
  }
  if (!import_node_util.types.isArrayBuffer(buffer) || !Number.isSafeInteger(byteLength) || byteLength < 0 || !Number.isSafeInteger(byteOffset) || byteOffset < 0) {
    fail(`${label} has invalid typed-array storage`);
  }
  try {
    const source = new IntrinsicUint8Array(
      buffer,
      byteOffset,
      byteLength
    );
    const copy = new IntrinsicUint8Array(byteLength);
    Reflect.apply(INTRINSIC_UINT8_ARRAY_SET, copy, [source]);
    return copy;
  } catch {
    return fail(`${label} has detached or invalid typed-array storage`);
  }
}

// ml/floodgate-raw-lock.ts
var FLOODGATE_RAW_RECEIPT_SCHEMA = "shogi-floodgate-raw-response-receipt-v1";
var FLOODGATE_RAW_LOCK_PLAN_IDENTITY = Object.freeze({
  path: "ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json",
  bytes: 10890,
  sha256: "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af",
  schema: "shogi-floodgate-fresh-sibling-plan-v1"
});
var FLOODGATE_RAW_LOCK_USER_AGENT = "nextjs-portfolio-floodgate-lock/1.0";
var FLOODGATE_RAW_LOCK_URL_HASH_DOMAIN = "floodgate-q1-2026-raw-lock-url-v1";
var SHA256_RE = /^[0-9a-f]{64}$/;
var FORBIDDEN_FIELD_RE = /(?:teacher|winner|score|selection|holdout)/i;
var IntrinsicUint8Array2 = Uint8Array;
var TYPED_ARRAY_PROTOTYPE2 = Object.getPrototypeOf(
  IntrinsicUint8Array2.prototype
);
var TYPED_ARRAY_BUFFER_GETTER2 = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE2,
  "buffer"
)?.get;
var TYPED_ARRAY_BYTE_LENGTH_GETTER2 = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE2,
  "byteLength"
)?.get;
var TYPED_ARRAY_BYTE_OFFSET_GETTER2 = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE2,
  "byteOffset"
)?.get;
var INTRINSIC_UINT8_ARRAY_SET2 = IntrinsicUint8Array2.prototype.set;
function fail2(message) {
  throw new Error(`invalid Floodgate raw lock: ${message}`);
}
function sha256Hex2(input) {
  return (0, import_node_crypto.createHash)("sha256").update(input).digest("hex");
}
function assertStrictPlainObject(value, label) {
  if (import_node_util2.types.isProxy(value)) fail2(`${label} must not be a Proxy`);
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail2(`${label} must be a plain object with Object.prototype`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail2(`${label} must not contain symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_FIELD_RE.test(key)) {
      fail2(`${label}.${key} is forbidden in a label-blind raw lock`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      fail2(`${label}.${key} must be a data property, not an accessor`);
    }
    if (!descriptor.enumerable) {
      fail2(`${label}.${key} must be enumerable`);
    }
  }
  return value;
}
function assertExactKeys(value, expected, label) {
  const actual = Object.getOwnPropertyNames(value).sort(compareUtf8Bytes);
  const wanted = [...expected].sort(compareUtf8Bytes);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail2(`${label} must contain exactly keys ${wanted.join(",")}`);
  }
}
function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    fail2(`${label} must be nonempty trimmed text without controls`);
  }
  return value;
}
function assertNonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail2(`${label} must be a nonnegative safe integer`);
  }
  return value;
}
function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    fail2(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}
function deepFreeze(value, seen = /* @__PURE__ */ new Set()) {
  if (value !== null && typeof value === "object") {
    const object = value;
    if (!seen.has(object)) {
      seen.add(object);
      for (const key of Reflect.ownKeys(object)) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (descriptor && "value" in descriptor) {
          deepFreeze(descriptor.value, seen);
        }
      }
      Object.freeze(object);
    }
  }
  return value;
}
function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail2("canonical JSON accepts finite numbers other than negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort(compareUtf8Bytes);
    return `{${keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return fail2(`canonical JSON does not support ${typeof value}`);
}
function parseCanonicalJsonFile(text, label) {
  if (typeof text !== "string" || text.startsWith("\uFEFF") || text.includes("\0") || !text.endsWith("\n") || text.endsWith("\n\n") || text.includes("\r")) {
    fail2(`${label} must use canonical UTF-8 JSON with exactly one final LF`);
  }
  try {
    return JSON.parse(text.slice(0, -1));
  } catch {
    return fail2(`${label} is not valid JSON`);
  }
}
function canonicalUrlForKind(value, kind, label) {
  const url = assertString(value, label);
  let canonical;
  if (kind === "daily_listing") {
    canonical = parseFloodgateDailyListingUrl(url).url;
  } else if (kind === "daily_rating") {
    canonical = parseFloodgateDailyRatingUrl(url).url;
  } else if (kind === "period_end_inventory") {
    if (url !== FLOODGATE_PERIOD_END_INVENTORY_URL) {
      fail2(`${label} must be the exact period-end inventory URL`);
    }
    canonical = FLOODGATE_PERIOD_END_INVENTORY_URL;
  } else {
    canonical = parseFloodgateCsaUrl(url).url;
  }
  if (canonical !== url) fail2(`${label} must use its canonical URL spelling`);
  return canonical;
}
function canonicalFloodgateNetworkUrl(value, label) {
  const raw = assertString(value, label);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return fail2(`${label} must be an absolute URL`);
  }
  if (parsed.protocol !== "https:" || parsed.origin !== FLOODGATE_ORIGIN || parsed.username !== "" || parsed.password !== "" || parsed.port !== "" || parsed.search !== "" || parsed.hash !== "" || parsed.href !== raw || !raw.startsWith(`${FLOODGATE_ORIGIN}/`)) {
    fail2(`${label} must use the exact canonical Floodgate HTTPS origin`);
  }
  return raw;
}
function floodgateRawUrlSha256(url) {
  const canonical = canonicalFloodgateNetworkUrl(url, "raw lock URL");
  return sha256Hex2(`${FLOODGATE_RAW_LOCK_URL_HASH_DOMAIN}\0${canonical}`);
}
function floodgateRawObjectPath(sha256) {
  const digest = assertSha256(sha256, "object sha256");
  return `objects/sha256/${digest.slice(0, 2)}/${digest}`;
}
function floodgateRawReceiptPath(url) {
  const digest = floodgateRawUrlSha256(url);
  return `receipts/sha256/${digest.slice(0, 2)}/${digest}.json`;
}
function expectedStatuses(kind) {
  return kind === "daily_rating" ? [200, 404] : [200];
}
function validateFloodgateRawReceipt(input) {
  const value = assertStrictPlainObject(input, "raw response receipt");
  assertExactKeys(
    value,
    ["kind", "object", "request", "response", "schema", "url", "url_sha256"],
    "raw response receipt"
  );
  if (value.schema !== FLOODGATE_RAW_RECEIPT_SCHEMA) {
    fail2("raw response receipt schema is unsupported");
  }
  if (value.kind !== "daily_listing" && value.kind !== "daily_rating" && value.kind !== "period_end_inventory" && value.kind !== "csa") {
    fail2("raw response receipt kind is unsupported");
  }
  const kind = value.kind;
  const url = canonicalUrlForKind(value.url, kind, "raw response receipt URL");
  const urlSha256 = assertSha256(
    value.url_sha256,
    "raw response receipt url_sha256"
  );
  if (urlSha256 !== floodgateRawUrlSha256(url)) {
    fail2("raw response receipt URL hash does not match its canonical URL");
  }
  const request = assertStrictPlainObject(value.request, "receipt request");
  assertExactKeys(
    request,
    ["accept_encoding", "redirect", "user_agent"],
    "receipt request"
  );
  if (request.accept_encoding !== "identity" || request.redirect !== "manual" || request.user_agent !== FLOODGATE_RAW_LOCK_USER_AGENT) {
    fail2(
      "receipt request policy does not match the preregistered network policy"
    );
  }
  const response = assertStrictPlainObject(value.response, "receipt response");
  assertExactKeys(
    response,
    ["bytes", "content_encoding", "sha256", "status", "url"],
    "receipt response"
  );
  if (response.url !== url) {
    fail2("receipt response URL must exactly equal the requested URL");
  }
  const status = assertNonnegativeInteger(response.status, "response status");
  if (!expectedStatuses(kind).includes(status)) {
    fail2(`response status ${status} is forbidden for ${kind}`);
  }
  if (response.content_encoding !== null && response.content_encoding !== "identity") {
    fail2("response content_encoding must be absent or identity");
  }
  const bytes = assertNonnegativeInteger(response.bytes, "response bytes");
  const sha256 = assertSha256(response.sha256, "response sha256");
  const object = assertString(value.object, "receipt object path");
  if (object !== floodgateRawObjectPath(sha256)) {
    fail2("receipt object path is not content-addressed by response sha256");
  }
  return deepFreeze({
    schema: FLOODGATE_RAW_RECEIPT_SCHEMA,
    kind,
    url,
    url_sha256: urlSha256,
    request: {
      accept_encoding: "identity",
      redirect: "manual",
      user_agent: FLOODGATE_RAW_LOCK_USER_AGENT
    },
    response: {
      url,
      status,
      content_encoding: response.content_encoding,
      bytes,
      sha256
    },
    object
  });
}
function serializeFloodgateRawReceipt(input) {
  return `${canonicalJson(validateFloodgateRawReceipt(input))}
`;
}
function parseFloodgateRawReceipt(text) {
  const decoded = validateFloodgateRawReceipt(
    parseCanonicalJsonFile(text, "raw response receipt")
  );
  if (serializeFloodgateRawReceipt(decoded) !== text) {
    fail2("raw response receipt is not in canonical key order or framing");
  }
  return decoded;
}
function assertCanonicalAbsoluteFilePath(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath) || path.normalize(filePath) !== filePath || path.basename(filePath) === "" || filePath.includes("\0")) {
    fail2("durable target must be a canonical absolute file path");
  }
  return filePath;
}
async function lstatMaybe(filePath) {
  try {
    return await fs.promises.lstat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function assertParentChainIsRealDirectories(filePath) {
  const absolute = assertCanonicalAbsoluteFilePath(filePath);
  const parent = path.dirname(absolute);
  const parsed = path.parse(parent);
  let current = parsed.root;
  const relative2 = path.relative(parsed.root, parent);
  const segments = relative2 === "" ? [] : relative2.split(path.sep);
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = await lstatMaybe(current);
    if (!stat) fail2(`parent directory does not exist: ${current}`);
    if (stat.isSymbolicLink()) {
      fail2(`parent path component must not be a symbolic link: ${current}`);
    }
    if (!stat.isDirectory()) {
      fail2(`parent path component is not a directory: ${current}`);
    }
  }
}
async function readRegularFileNoFollow(filePath) {
  await assertParentChainIsRealDirectories(filePath);
  return readRegularFileNoFollowWithVerifiedParents(filePath);
}
async function readRegularFileNoFollowWithVerifiedParents(filePath) {
  assertCanonicalAbsoluteFilePath(filePath);
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number" || noFollow === 0) {
    fail2("secure regular-file verification requires O_NOFOLLOW support");
  }
  const flags = fs.constants.O_RDONLY | noFollow;
  let handle;
  try {
    handle = await fs.promises.open(filePath, flags);
  } catch (error) {
    const code = error.code;
    if (code === "ELOOP") fail2(`path must not be a symbolic link: ${filePath}`);
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail2(`path is not a regular file: ${filePath}`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || bytes.byteLength !== after.size) {
      fail2(`file changed while it was being verified: ${filePath}`);
    }
    return new Uint8Array(bytes);
  } finally {
    await handle.close();
  }
}
function assertSafeRelativeStoragePath(value, label) {
  const relative2 = assertString(value, label);
  if (path.posix.isAbsolute(relative2) || path.posix.normalize(relative2) !== relative2 || relative2.split("/").some((segment) => segment === "." || segment === "..") || relative2.includes("\\")) {
    fail2(`${label} must be a canonical traversal-free POSIX relative path`);
  }
  return relative2;
}
function lockStoragePath(lockRoot, relativePath) {
  const root = path.resolve(assertString(lockRoot, "lock root"));
  if (root !== lockRoot) fail2("lock root must be a canonical absolute path");
  const relative2 = assertSafeRelativeStoragePath(
    relativePath,
    "lock storage path"
  );
  const absolute = path.join(root, ...relative2.split("/"));
  if (path.relative(root, absolute).startsWith("..")) {
    fail2("lock storage path escapes the lock root");
  }
  return absolute;
}
function validateObjectIdentity(input) {
  const value = assertStrictPlainObject(input, "raw object identity");
  assertExactKeys(value, ["bytes", "object", "sha256"], "raw object identity");
  const bytes = assertNonnegativeInteger(value.bytes, "object bytes");
  const sha256 = assertSha256(value.sha256, "object sha256");
  const object = assertSafeRelativeStoragePath(value.object, "object path");
  if (object !== floodgateRawObjectPath(sha256)) {
    fail2("object path does not match its content digest");
  }
  return Object.freeze({ bytes, sha256, object });
}
async function verifyExistingFloodgateRawObject(lockRoot, identityInput) {
  const identity = validateObjectIdentity(identityInput);
  const objectPath = lockStoragePath(lockRoot, identity.object);
  const bytes = await readRegularFileNoFollow(objectPath);
  if (bytes.byteLength !== identity.bytes) {
    fail2(`object byte count does not match ${identity.object}`);
  }
  const digest = sha256Hex2(bytes);
  if (digest !== identity.sha256) {
    fail2(`object digest does not match ${identity.object}`);
  }
  return bytes;
}
function decodeExistingFloodgateRawReceipt(receiptBytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      receiptBytes
    );
  } catch {
    return fail2("raw response receipt is not fatal-valid UTF-8");
  }
  return parseFloodgateRawReceipt(text);
}
async function verifyExistingFloodgateRawReceiptFromFile(lockRoot, url, kind, receiptBytes) {
  const receipt = decodeExistingFloodgateRawReceipt(receiptBytes);
  if (receipt.url !== url || receipt.kind !== kind) {
    fail2("URL-keyed receipt does not match the expected URL and kind");
  }
  const bytes = await verifyExistingFloodgateRawObject(lockRoot, {
    bytes: receipt.response.bytes,
    sha256: receipt.response.sha256,
    object: receipt.object
  });
  return Object.freeze({ receipt, bytes });
}
async function verifyExistingFloodgateRawReceipt(lockRoot, rawUrl, kind) {
  const url = canonicalUrlForKind(rawUrl, kind, "expected receipt URL");
  const receiptBytes = await readRegularFileNoFollow(
    lockStoragePath(lockRoot, floodgateRawReceiptPath(url))
  );
  return verifyExistingFloodgateRawReceiptFromFile(
    lockRoot,
    url,
    kind,
    receiptBytes
  );
}

// ml/floodgate-raw-verification-worker-protocol.ts
var FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA = "shogi-floodgate-raw-verification-worker-task-v1";
var FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA = "shogi-floodgate-raw-verification-worker-result-v1";
var FLOODGATE_RAW_VERIFICATION_WORKER_CONTROL_SCHEMA = "shogi-floodgate-raw-verification-worker-control-v1";
var FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA = "shogi-floodgate-raw-verification-worker-data-v1";

// ml/floodgate-raw-verification-worker.ts
var RECEIPT_KINDS = Object.freeze([
  "daily_listing",
  "daily_rating",
  "period_end_inventory",
  "csa"
]);
function fail3(message) {
  throw new Error(`invalid Floodgate raw verification worker: ${message}`);
}
function isPlainExactRecord(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function captureWorkerData(value) {
  const runtime = value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype ? value.runtime : void 0;
  if (!isPlainExactRecord(value, ["lock_root", "runtime", "schema"]) || value.schema !== FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA || typeof value.lock_root !== "string" || value.lock_root.length === 0 || !isPlainExactRecord(runtime, [
    "architecture",
    "executable_path",
    "modules_abi",
    "node_version",
    "platform",
    "v8_version"
  ]) || runtime.node_version !== process.version || runtime.v8_version !== process.versions.v8 || runtime.modules_abi !== process.versions.modules || runtime.executable_path !== process.execPath || runtime.platform !== process.platform || runtime.architecture !== process.arch) {
    fail3("worker data is invalid");
  }
  return Object.freeze({
    schema: FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA,
    lock_root: value.lock_root,
    runtime: Object.freeze({
      node_version: process.version,
      v8_version: process.versions.v8,
      modules_abi: process.versions.modules,
      executable_path: process.execPath,
      platform: process.platform,
      architecture: process.arch
    })
  });
}
function captureTask(value) {
  if (!isPlainExactRecord(value, ["ordinal", "receipt_kind", "schema", "url"]) || value.schema !== FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA || !Number.isSafeInteger(value.ordinal) || value.ordinal < 0 || !RECEIPT_KINDS.includes(
    value.receipt_kind
  ) || typeof value.url !== "string" || value.url.length === 0) {
    fail3("task is invalid");
  }
  return Object.freeze({
    schema: FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA,
    ordinal: value.ordinal,
    receipt_kind: value.receipt_kind,
    url: value.url
  });
}
function isShutdown(value) {
  return isPlainExactRecord(value, ["operation", "schema"]) && value.schema === FLOODGATE_RAW_VERIFICATION_WORKER_CONTROL_SCHEMA && value.operation === "shutdown";
}
async function verifyTask(lockRoot, task) {
  const verified = await verifyExistingFloodgateRawReceipt(
    lockRoot,
    task.url,
    task.receipt_kind
  );
  if (task.receipt_kind === "daily_listing") {
    const evidence = parseFloodgateDailyArchiveEvidence({
      listingUrl: task.url,
      listingBytes: verified.bytes
    });
    return Object.freeze({
      receipt_kind: "daily_listing",
      receipt: verified.receipt,
      evidence: Object.freeze({
        url: evidence.listing.location.url,
        body: evidence.listing.body,
        all_official_csa_urls: Object.freeze(
          evidence.allOfficialCsaLocations.map((location) => location.url)
        ),
        target_csa_urls: Object.freeze(
          evidence.targetCsaLocations.map((location) => location.url)
        )
      })
    });
  }
  if (task.receipt_kind === "period_end_inventory") {
    const evidence = parseFloodgatePeriodEndInventoryEvidence({
      ratingUrl: task.url,
      ratingBytes: verified.bytes
    });
    return Object.freeze({
      receipt_kind: "period_end_inventory",
      receipt: verified.receipt,
      evidence: Object.freeze({
        url: evidence.snapshot.url,
        body: evidence.snapshot.body,
        last_modified_at: evidence.snapshot.lastModifiedAt,
        counts: evidence.snapshot.counts
      })
    });
  }
  if (task.receipt_kind === "daily_rating") {
    return Object.freeze({
      receipt_kind: "daily_rating",
      receipt: verified.receipt
    });
  }
  return Object.freeze({
    receipt_kind: "csa",
    receipt: verified.receipt
  });
}
function errorFields(error) {
  if (error instanceof Error) {
    return Object.freeze({ name: error.name, message: error.message });
  }
  return Object.freeze({
    name: "Error",
    message: "raw verification worker rejected a non-Error value"
  });
}
var port = import_node_worker_threads.parentPort;
if (import_node_worker_threads.isMainThread || port === null) {
  fail3("module must run inside a worker thread");
}
var capturedWorkerData = captureWorkerData(import_node_worker_threads.workerData);
var active = false;
port.on("message", (message) => {
  if (isShutdown(message)) {
    if (active) fail3("shutdown arrived while a task was active");
    port.close();
    return;
  }
  if (active) fail3("received overlapping tasks");
  const task = captureTask(message);
  active = true;
  void verifyTask(capturedWorkerData.lock_root, task).then(
    (result) => {
      const response = {
        schema: FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA,
        ordinal: task.ordinal,
        status: "success",
        result
      };
      active = false;
      port.postMessage(response);
    },
    (error) => {
      const response = {
        schema: FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA,
        ordinal: task.ordinal,
        status: "failure",
        error: errorFields(error)
      };
      active = false;
      port.postMessage(response);
    }
  );
});
