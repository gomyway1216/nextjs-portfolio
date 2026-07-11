/**
 * Deterministic, label-blind codecs and durable storage primitives for the
 * preregistered Floodgate 2026-Q1 raw acquisition lock.
 *
 * This module deliberately performs no network requests, role allocation,
 * CSA game parsing, teacher evaluation, or label access.
 */

import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_ORIGIN,
  FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_BODY,
  FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_COUNTS,
  FLOODGATE_PERIOD_END_INVENTORY_URL,
  FLOODGATE_Q1_DAILY_LISTING_COUNT,
  FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED,
  assertPreregisteredFloodgateQ1ListingIdentityManifest,
  compareUtf8Bytes,
  parseFloodgateCsaUrl,
  parseFloodgateDailyListingUrl,
  parseFloodgateDailyRatingUrl,
  serializeFloodgateQ1ListingIdentityManifest,
} from "./floodgate-source";

export const FLOODGATE_RAW_RECEIPT_SCHEMA =
  "shogi-floodgate-raw-response-receipt-v1" as const;
export const FLOODGATE_RAW_LOCK_SCHEMA =
  "shogi-floodgate-raw-acquisition-lock-v1" as const;
export const FLOODGATE_RAW_LOCK_PLAN_IDENTITY = Object.freeze({
  path: "ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json",
  bytes: 10_890,
  sha256: "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af",
  schema: "shogi-floodgate-fresh-sibling-plan-v1",
});
export const FLOODGATE_RAW_LOCK_USER_AGENT =
  "nextjs-portfolio-floodgate-lock/1.0" as const;
export const FLOODGATE_RAW_LOCK_URL_HASH_DOMAIN =
  "floodgate-q1-2026-raw-lock-url-v1" as const;
export const FLOODGATE_RAW_LOCK_GAME_ID_DOMAIN =
  "floodgate-q1-2026-game-id-v1" as const;
export const FLOODGATE_RAW_LOCK_MAXIMUM_PARALLEL_REQUESTS = 4 as const;
export const FLOODGATE_RAW_LOCK_MINIMUM_REQUEST_START_INTERVAL_MS =
  100 as const;

const SHA256_RE = /^[0-9a-f]{64}$/;
const REVISION_RE = /^[0-9a-f]{40}$/;
const FORBIDDEN_FIELD_RE = /(?:teacher|winner|score|selection|holdout)/i;
const FINAL_MANIFEST_FILENAME = "manifest.json";
const IntrinsicUint8Array = Uint8Array;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(
  IntrinsicUint8Array.prototype,
) as object;
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "buffer",
)?.get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
)?.get;
const TYPED_ARRAY_BYTE_OFFSET_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteOffset",
)?.get;
const INTRINSIC_UINT8_ARRAY_SET = IntrinsicUint8Array.prototype.set;

export type FloodgateRawReceiptKind =
  "daily_listing" | "daily_rating" | "period_end_inventory" | "csa";

export interface FloodgateRawObjectIdentity {
  readonly bytes: number;
  readonly sha256: string;
  readonly object: string;
}

export interface FloodgateRawReceipt {
  readonly schema: typeof FLOODGATE_RAW_RECEIPT_SCHEMA;
  readonly kind: FloodgateRawReceiptKind;
  readonly url: string;
  readonly url_sha256: string;
  readonly request: {
    readonly accept_encoding: "identity";
    readonly redirect: "manual";
    readonly user_agent: typeof FLOODGATE_RAW_LOCK_USER_AGENT;
  };
  readonly response: {
    readonly url: string;
    readonly status: number;
    readonly content_encoding: null | "identity";
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly object: string;
}

export interface FloodgateRawReceiptIndexEntry extends FloodgateRawObjectIdentity {
  readonly url: string;
  readonly receipt: string;
  readonly status: number;
}

export interface FloodgateRawListingIndexEntry extends FloodgateRawReceiptIndexEntry {
  readonly all_official_csa_urls: number;
  readonly all_official_csa_urls_sha256: string;
  readonly target_csa_urls: number;
  readonly target_csa_urls_sha256: string;
}

export interface FloodgateRawPeriodInventoryEntry extends FloodgateRawReceiptIndexEntry {
  readonly last_modified_at: string;
  readonly counts: {
    readonly rating_rows: number;
    readonly group_zero_identities: number;
    readonly identities_at_least_3600_and_30_games: number;
  };
}

export interface FloodgateRawCsaIndexEntry extends FloodgateRawReceiptIndexEntry {
  readonly canonical_url: string;
  readonly game_id: string;
}

export interface FloodgateRawDuplicateGroup {
  readonly sha256: string;
  readonly bytes: number;
  readonly canonical_url: string;
  readonly urls: readonly string[];
}

export interface FloodgateRawLockManifest {
  readonly schema: typeof FLOODGATE_RAW_LOCK_SCHEMA;
  readonly plan: typeof FLOODGATE_RAW_LOCK_PLAN_IDENTITY;
  readonly source: {
    readonly revision: string;
    readonly tracked_tree_clean: true;
  };
  readonly acquisition_policy: {
    readonly origin: typeof FLOODGATE_ORIGIN;
    readonly https_only: true;
    readonly same_origin_only: true;
    readonly redirects: "reject";
    readonly query_fragment_userinfo_nondefault_port: "reject";
    readonly maximum_parallel_requests: typeof FLOODGATE_RAW_LOCK_MAXIMUM_PARALLEL_REQUESTS;
    readonly minimum_request_start_interval_ms: typeof FLOODGATE_RAW_LOCK_MINIMUM_REQUEST_START_INTERVAL_MS;
    readonly request_headers: {
      readonly accept_encoding: "identity";
      readonly user_agent: typeof FLOODGATE_RAW_LOCK_USER_AGENT;
    };
    readonly response_content_encoding: readonly ["absent", "identity"];
    readonly status_policy: {
      readonly listing: readonly [200];
      readonly daily_rating: readonly [200, 404];
      readonly period_inventory: readonly [200];
      readonly csa: readonly [200];
    };
  };
  readonly summary: {
    readonly listing_responses: number;
    readonly listing_bytes: number;
    readonly listing_urls_sha256: string;
    readonly all_official_csa_urls: number;
    readonly target_csa_urls: number;
    readonly daily_rating_responses: number;
    readonly daily_rating_http_200: number;
    readonly daily_rating_http_404: number;
    readonly rating_urls_sha256: string;
    readonly period_inventory_responses: number;
    readonly csa_responses: number;
    readonly csa_urls_sha256: string;
    readonly canonical_games: number;
    readonly canonical_game_ids_sha256: string;
    readonly duplicate_csa_groups: number;
    readonly duplicate_csa_urls: number;
  };
  readonly listing_identity_manifest: {
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly listings: readonly FloodgateRawListingIndexEntry[];
  readonly daily_ratings: readonly FloodgateRawReceiptIndexEntry[];
  readonly period_inventory: FloodgateRawPeriodInventoryEntry;
  readonly csa_index: readonly FloodgateRawCsaIndexEntry[];
  readonly duplicate_groups: readonly FloodgateRawDuplicateGroup[];
  readonly object_counts: {
    readonly unique_total: number;
    readonly unique_listings: number;
    readonly unique_daily_ratings: number;
    readonly unique_period_inventory: number;
    readonly unique_csa: number;
  };
}

export type FloodgateDurableCreatePhase =
  | "after-temp-open"
  | "after-temp-write"
  | "after-temp-sync"
  | "after-link"
  | "after-directory-sync"
  | "after-temp-unlink";

export interface FloodgateDurableCreateOptions {
  readonly failpoint?: (
    phase: FloodgateDurableCreatePhase,
  ) => void | Promise<void>;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate raw lock: ${message}`);
}

function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function assertStrictPlainObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (nodeUtilTypes.isProxy(value)) fail(`${label} must not be a Proxy`);
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${label} must be a plain object with Object.prototype`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail(`${label} must not contain symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_FIELD_RE.test(key)) {
      fail(`${label}.${key} is forbidden in a label-blind raw lock`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      fail(`${label}.${key} must be a data property, not an accessor`);
    }
    if (!descriptor.enumerable) {
      fail(`${label}.${key} must be enumerable`);
    }
  }
  return value as Record<string, unknown>;
}

function assertStrictArray(value: unknown, label: string): readonly unknown[] {
  if (nodeUtilTypes.isProxy(value)) fail(`${label} must not be a Proxy`);
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    fail(`${label} must be a plain array`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail(`${label} must not contain symbol keys`);
  }
  const names = Object.getOwnPropertyNames(value);
  const expected = new Set<string>(["length"]);
  for (let index = 0; index < value.length; index += 1) {
    expected.add(String(index));
  }
  if (
    names.length !== value.length + 1 ||
    names.some((name) => !expected.has(name))
  ) {
    fail(`${label} must be dense and contain no hidden properties`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`${label}[${index}] must be an enumerable data property`);
    }
  }
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.getOwnPropertyNames(value).sort(compareUtf8Bytes);
  const wanted = [...expected].sort(compareUtf8Bytes);
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} must contain exactly keys ${wanted.join(",")}`);
  }
}

function assertString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail(`${label} must be nonempty trimmed text without controls`);
  }
  return value;
}

function assertNonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function assertSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): Readonly<T> {
  if (value !== null && typeof value === "object") {
    const object = value as object;
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
  return value as Readonly<T>;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON accepts finite numbers other than negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort(compareUtf8Bytes);
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return fail(`canonical JSON does not support ${typeof value}`);
}

function parseCanonicalJsonFile(text: string, label: string): unknown {
  if (
    typeof text !== "string" ||
    text.startsWith("\ufeff") ||
    text.includes("\0") ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n") ||
    text.includes("\r")
  ) {
    fail(`${label} must use canonical UTF-8 JSON with exactly one final LF`);
  }
  try {
    return JSON.parse(text.slice(0, -1)) as unknown;
  } catch {
    return fail(`${label} is not valid JSON`);
  }
}

function canonicalUrlForKind(
  value: unknown,
  kind: FloodgateRawReceiptKind,
  label: string,
): string {
  const url = assertString(value, label);
  let canonical: string;
  if (kind === "daily_listing") {
    canonical = parseFloodgateDailyListingUrl(url).url;
  } else if (kind === "daily_rating") {
    canonical = parseFloodgateDailyRatingUrl(url).url;
  } else if (kind === "period_end_inventory") {
    if (url !== FLOODGATE_PERIOD_END_INVENTORY_URL) {
      fail(`${label} must be the exact period-end inventory URL`);
    }
    canonical = FLOODGATE_PERIOD_END_INVENTORY_URL;
  } else {
    canonical = parseFloodgateCsaUrl(url).url;
  }
  if (canonical !== url) fail(`${label} must use its canonical URL spelling`);
  return canonical;
}

function canonicalFloodgateNetworkUrl(value: unknown, label: string): string {
  const raw = assertString(value, label);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fail(`${label} must be an absolute URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== FLOODGATE_ORIGIN ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.href !== raw ||
    !raw.startsWith(`${FLOODGATE_ORIGIN}/`)
  ) {
    fail(`${label} must use the exact canonical Floodgate HTTPS origin`);
  }
  return raw;
}

export function floodgateRawUrlSha256(url: string): string {
  const canonical = canonicalFloodgateNetworkUrl(url, "raw lock URL");
  return sha256Hex(`${FLOODGATE_RAW_LOCK_URL_HASH_DOMAIN}\0${canonical}`);
}

/** Digest a UTF-8-bytewise sorted index without a trailing LF or de-duplication. */
export function floodgateRawSortedIndexSha256(
  values: Iterable<string>,
): string {
  const decoded: string[] = [];
  for (const value of values) {
    decoded.push(assertString(value, "raw lock index value"));
  }
  return sha256Hex(decoded.sort(compareUtf8Bytes).join("\n"));
}

export function floodgateRawObjectPath(sha256: string): string {
  const digest = assertSha256(sha256, "object sha256");
  return `objects/sha256/${digest.slice(0, 2)}/${digest}`;
}

export function floodgateRawReceiptPath(url: string): string {
  const digest = floodgateRawUrlSha256(url);
  return `receipts/sha256/${digest.slice(0, 2)}/${digest}.json`;
}

export function floodgateRawFinalManifestPath(): string {
  return FINAL_MANIFEST_FILENAME;
}

/** Game identity is bound to the canonical URL, never to mutable body bytes. */
export function floodgateCanonicalUrlGameId(url: string): string {
  const canonical = canonicalUrlForKind(url, "csa", "CSA game URL");
  return `sha256:${sha256Hex(`${FLOODGATE_RAW_LOCK_GAME_ID_DOMAIN}\0${canonical}`)}`;
}

function expectedStatuses(kind: FloodgateRawReceiptKind): readonly number[] {
  return kind === "daily_rating" ? [200, 404] : [200];
}

export function validateFloodgateRawReceipt(
  input: unknown,
): Readonly<FloodgateRawReceipt> {
  const value = assertStrictPlainObject(input, "raw response receipt");
  assertExactKeys(
    value,
    ["kind", "object", "request", "response", "schema", "url", "url_sha256"],
    "raw response receipt",
  );
  if (value.schema !== FLOODGATE_RAW_RECEIPT_SCHEMA) {
    fail("raw response receipt schema is unsupported");
  }
  if (
    value.kind !== "daily_listing" &&
    value.kind !== "daily_rating" &&
    value.kind !== "period_end_inventory" &&
    value.kind !== "csa"
  ) {
    fail("raw response receipt kind is unsupported");
  }
  const kind = value.kind;
  const url = canonicalUrlForKind(value.url, kind, "raw response receipt URL");
  const urlSha256 = assertSha256(
    value.url_sha256,
    "raw response receipt url_sha256",
  );
  if (urlSha256 !== floodgateRawUrlSha256(url)) {
    fail("raw response receipt URL hash does not match its canonical URL");
  }

  const request = assertStrictPlainObject(value.request, "receipt request");
  assertExactKeys(
    request,
    ["accept_encoding", "redirect", "user_agent"],
    "receipt request",
  );
  if (
    request.accept_encoding !== "identity" ||
    request.redirect !== "manual" ||
    request.user_agent !== FLOODGATE_RAW_LOCK_USER_AGENT
  ) {
    fail(
      "receipt request policy does not match the preregistered network policy",
    );
  }

  const response = assertStrictPlainObject(value.response, "receipt response");
  assertExactKeys(
    response,
    ["bytes", "content_encoding", "sha256", "status", "url"],
    "receipt response",
  );
  if (response.url !== url) {
    fail("receipt response URL must exactly equal the requested URL");
  }
  const status = assertNonnegativeInteger(response.status, "response status");
  if (!expectedStatuses(kind).includes(status)) {
    fail(`response status ${status} is forbidden for ${kind}`);
  }
  if (
    response.content_encoding !== null &&
    response.content_encoding !== "identity"
  ) {
    fail("response content_encoding must be absent or identity");
  }
  const bytes = assertNonnegativeInteger(response.bytes, "response bytes");
  const sha256 = assertSha256(response.sha256, "response sha256");
  const object = assertString(value.object, "receipt object path");
  if (object !== floodgateRawObjectPath(sha256)) {
    fail("receipt object path is not content-addressed by response sha256");
  }

  return deepFreeze({
    schema: FLOODGATE_RAW_RECEIPT_SCHEMA,
    kind,
    url,
    url_sha256: urlSha256,
    request: {
      accept_encoding: "identity",
      redirect: "manual",
      user_agent: FLOODGATE_RAW_LOCK_USER_AGENT,
    },
    response: {
      url,
      status,
      content_encoding: response.content_encoding,
      bytes,
      sha256,
    },
    object,
  });
}

export function serializeFloodgateRawReceipt(input: unknown): string {
  return `${canonicalJson(validateFloodgateRawReceipt(input))}\n`;
}

export function parseFloodgateRawReceipt(
  text: string,
): Readonly<FloodgateRawReceipt> {
  const decoded = validateFloodgateRawReceipt(
    parseCanonicalJsonFile(text, "raw response receipt"),
  );
  if (serializeFloodgateRawReceipt(decoded) !== text) {
    fail("raw response receipt is not in canonical key order or framing");
  }
  return decoded;
}

function assertLiteralArray(
  input: unknown,
  expected: readonly unknown[],
  label: string,
): readonly unknown[] {
  const values = assertStrictArray(input, label);
  if (
    values.length !== expected.length ||
    values.some((value, index) => value !== expected[index])
  ) {
    fail(`${label} does not match the preregistered values`);
  }
  return values;
}

function validatePlanBinding(
  input: unknown,
): typeof FLOODGATE_RAW_LOCK_PLAN_IDENTITY {
  const value = assertStrictPlainObject(input, "manifest plan binding");
  assertExactKeys(
    value,
    ["bytes", "path", "schema", "sha256"],
    "manifest plan binding",
  );
  for (const key of ["bytes", "path", "schema", "sha256"] as const) {
    if (value[key] !== FLOODGATE_RAW_LOCK_PLAN_IDENTITY[key]) {
      fail(`manifest plan binding ${key} does not match preregistration`);
    }
  }
  return FLOODGATE_RAW_LOCK_PLAN_IDENTITY;
}

function validateSourceBinding(
  input: unknown,
): FloodgateRawLockManifest["source"] {
  const value = assertStrictPlainObject(input, "manifest source binding");
  assertExactKeys(
    value,
    ["revision", "tracked_tree_clean"],
    "manifest source binding",
  );
  if (typeof value.revision !== "string" || !REVISION_RE.test(value.revision)) {
    fail("manifest source revision must be a lowercase 40-hex Git revision");
  }
  if (value.tracked_tree_clean !== true) {
    fail("manifest source must bind a clean tracked tree");
  }
  return { revision: value.revision, tracked_tree_clean: true };
}

function validateAcquisitionPolicy(
  input: unknown,
): FloodgateRawLockManifest["acquisition_policy"] {
  const value = assertStrictPlainObject(input, "manifest acquisition policy");
  assertExactKeys(
    value,
    [
      "https_only",
      "maximum_parallel_requests",
      "minimum_request_start_interval_ms",
      "origin",
      "query_fragment_userinfo_nondefault_port",
      "redirects",
      "request_headers",
      "response_content_encoding",
      "same_origin_only",
      "status_policy",
    ],
    "manifest acquisition policy",
  );
  if (
    value.origin !== FLOODGATE_ORIGIN ||
    value.https_only !== true ||
    value.same_origin_only !== true ||
    value.redirects !== "reject" ||
    value.query_fragment_userinfo_nondefault_port !== "reject" ||
    value.maximum_parallel_requests !==
      FLOODGATE_RAW_LOCK_MAXIMUM_PARALLEL_REQUESTS ||
    value.minimum_request_start_interval_ms !==
      FLOODGATE_RAW_LOCK_MINIMUM_REQUEST_START_INTERVAL_MS
  ) {
    fail("manifest acquisition policy does not match preregistration");
  }
  const headers = assertStrictPlainObject(
    value.request_headers,
    "manifest request headers",
  );
  assertExactKeys(
    headers,
    ["accept_encoding", "user_agent"],
    "manifest request headers",
  );
  if (
    headers.accept_encoding !== "identity" ||
    headers.user_agent !== FLOODGATE_RAW_LOCK_USER_AGENT
  ) {
    fail("manifest request headers do not match preregistration");
  }
  assertLiteralArray(
    value.response_content_encoding,
    ["absent", "identity"],
    "manifest response content encodings",
  );
  const statuses = assertStrictPlainObject(
    value.status_policy,
    "manifest status policy",
  );
  assertExactKeys(
    statuses,
    ["csa", "daily_rating", "listing", "period_inventory"],
    "manifest status policy",
  );
  assertLiteralArray(statuses.listing, [200], "listing status policy");
  assertLiteralArray(
    statuses.daily_rating,
    [200, 404],
    "daily rating status policy",
  );
  assertLiteralArray(
    statuses.period_inventory,
    [200],
    "period inventory status policy",
  );
  assertLiteralArray(statuses.csa, [200], "CSA status policy");
  return {
    origin: FLOODGATE_ORIGIN,
    https_only: true,
    same_origin_only: true,
    redirects: "reject",
    query_fragment_userinfo_nondefault_port: "reject",
    maximum_parallel_requests: FLOODGATE_RAW_LOCK_MAXIMUM_PARALLEL_REQUESTS,
    minimum_request_start_interval_ms:
      FLOODGATE_RAW_LOCK_MINIMUM_REQUEST_START_INTERVAL_MS,
    request_headers: {
      accept_encoding: "identity",
      user_agent: FLOODGATE_RAW_LOCK_USER_AGENT,
    },
    response_content_encoding: ["absent", "identity"],
    status_policy: {
      listing: [200],
      daily_rating: [200, 404],
      period_inventory: [200],
      csa: [200],
    },
  };
}

function validateReceiptIndexBase(
  value: Record<string, unknown>,
  kind: FloodgateRawReceiptKind,
  label: string,
): FloodgateRawReceiptIndexEntry {
  const url = canonicalUrlForKind(value.url, kind, `${label}.url`);
  const receipt = assertSafeRelativeStoragePath(
    value.receipt,
    `${label}.receipt`,
  );
  if (receipt !== floodgateRawReceiptPath(url)) {
    fail(`${label}.receipt is not keyed by the canonical URL hash`);
  }
  const status = assertNonnegativeInteger(value.status, `${label}.status`);
  if (!expectedStatuses(kind).includes(status)) {
    fail(`${label}.status is forbidden for ${kind}`);
  }
  const bytes = assertNonnegativeInteger(value.bytes, `${label}.bytes`);
  const sha256 = assertSha256(value.sha256, `${label}.sha256`);
  const object = assertSafeRelativeStoragePath(value.object, `${label}.object`);
  if (object !== floodgateRawObjectPath(sha256)) {
    fail(`${label}.object is not content-addressed`);
  }
  return { url, receipt, status, bytes, sha256, object };
}

function validateBasicIndexEntry(
  input: unknown,
  kind: "daily_rating",
  label: string,
): FloodgateRawReceiptIndexEntry {
  const value = assertStrictPlainObject(input, label);
  assertExactKeys(
    value,
    ["bytes", "object", "receipt", "sha256", "status", "url"],
    label,
  );
  return validateReceiptIndexBase(value, kind, label);
}

function assertSortedUniqueUrls(
  entries: readonly { readonly url: string }[],
  label: string,
): void {
  for (let index = 1; index < entries.length; index += 1) {
    if (compareUtf8Bytes(entries[index - 1].url, entries[index].url) >= 0) {
      fail(`${label} must be unique and UTF-8-bytewise URL sorted`);
    }
  }
}

function validateListingEntry(
  input: unknown,
  index: number,
): FloodgateRawListingIndexEntry {
  const label = `manifest listings[${index}]`;
  const value = assertStrictPlainObject(input, label);
  assertExactKeys(
    value,
    [
      "all_official_csa_urls",
      "all_official_csa_urls_sha256",
      "bytes",
      "object",
      "receipt",
      "sha256",
      "status",
      "target_csa_urls",
      "target_csa_urls_sha256",
      "url",
    ],
    label,
  );
  const base = validateReceiptIndexBase(value, "daily_listing", label);
  if (base.status !== 200) fail(`${label}.status must be 200`);
  const allOfficialCsaUrls = assertNonnegativeInteger(
    value.all_official_csa_urls,
    `${label}.all_official_csa_urls`,
  );
  const targetCsaUrls = assertNonnegativeInteger(
    value.target_csa_urls,
    `${label}.target_csa_urls`,
  );
  if (targetCsaUrls > allOfficialCsaUrls) {
    fail(`${label}.target_csa_urls exceeds all official CSA URLs`);
  }
  const allOfficialCsaUrlsSha256 = assertSha256(
    value.all_official_csa_urls_sha256,
    `${label}.all_official_csa_urls_sha256`,
  );
  const targetCsaUrlsSha256 = assertSha256(
    value.target_csa_urls_sha256,
    `${label}.target_csa_urls_sha256`,
  );
  return {
    ...base,
    all_official_csa_urls: allOfficialCsaUrls,
    all_official_csa_urls_sha256: allOfficialCsaUrlsSha256,
    target_csa_urls: targetCsaUrls,
    target_csa_urls_sha256: targetCsaUrlsSha256,
  };
}

function validatePeriodInventoryEntry(
  input: unknown,
): FloodgateRawPeriodInventoryEntry {
  const label = "manifest period_inventory";
  const value = assertStrictPlainObject(input, label);
  assertExactKeys(
    value,
    [
      "bytes",
      "counts",
      "last_modified_at",
      "object",
      "receipt",
      "sha256",
      "status",
      "url",
    ],
    label,
  );
  const base = validateReceiptIndexBase(value, "period_end_inventory", label);
  if (
    base.status !== 200 ||
    base.bytes !== FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_BODY.bytes ||
    base.sha256 !== FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_BODY.sha256
  ) {
    fail("manifest period inventory body does not match preregistration");
  }
  if (value.last_modified_at !== "2026-03-31 23:54:26 +0900") {
    fail("manifest period inventory footer does not match preregistration");
  }
  const counts = assertStrictPlainObject(
    value.counts,
    "manifest period inventory counts",
  );
  assertExactKeys(
    counts,
    [
      "group_zero_identities",
      "identities_at_least_3600_and_30_games",
      "rating_rows",
    ],
    "manifest period inventory counts",
  );
  if (
    counts.rating_rows !==
      FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_COUNTS.ratingRows ||
    counts.group_zero_identities !==
      FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_COUNTS.groupZeroIdentities ||
    counts.identities_at_least_3600_and_30_games !==
      FLOODGATE_PERIOD_END_INVENTORY_EXPECTED_COUNTS.identitiesAtLeast3600And30Games
  ) {
    fail("manifest period inventory counts do not match preregistration");
  }
  return {
    ...base,
    last_modified_at: value.last_modified_at,
    counts: {
      rating_rows: counts.rating_rows,
      group_zero_identities: counts.group_zero_identities,
      identities_at_least_3600_and_30_games:
        counts.identities_at_least_3600_and_30_games,
    },
  } as FloodgateRawPeriodInventoryEntry;
}

function validateCsaEntry(
  input: unknown,
  index: number,
): FloodgateRawCsaIndexEntry {
  const label = `manifest csa_index[${index}]`;
  const value = assertStrictPlainObject(input, label);
  assertExactKeys(
    value,
    [
      "bytes",
      "canonical_url",
      "game_id",
      "object",
      "receipt",
      "sha256",
      "status",
      "url",
    ],
    label,
  );
  const base = validateReceiptIndexBase(value, "csa", label);
  if (base.status !== 200) fail(`${label}.status must be 200`);
  const canonicalUrl = canonicalUrlForKind(
    value.canonical_url,
    "csa",
    `${label}.canonical_url`,
  );
  const gameId = assertString(value.game_id, `${label}.game_id`);
  if (gameId !== floodgateCanonicalUrlGameId(canonicalUrl)) {
    fail(`${label}.game_id is not derived from its canonical URL`);
  }
  return { ...base, canonical_url: canonicalUrl, game_id: gameId };
}

function validateDuplicateGroup(
  input: unknown,
  index: number,
): FloodgateRawDuplicateGroup {
  const label = `manifest duplicate_groups[${index}]`;
  const value = assertStrictPlainObject(input, label);
  assertExactKeys(value, ["bytes", "canonical_url", "sha256", "urls"], label);
  const sha256 = assertSha256(value.sha256, `${label}.sha256`);
  const bytes = assertNonnegativeInteger(value.bytes, `${label}.bytes`);
  const rawUrls = assertStrictArray(value.urls, `${label}.urls`);
  if (rawUrls.length < 2) fail(`${label}.urls must contain a real duplicate`);
  const urls = rawUrls.map((url, urlIndex) =>
    canonicalUrlForKind(url, "csa", `${label}.urls[${urlIndex}]`),
  );
  assertSortedUniqueUrls(
    urls.map((url) => ({ url })),
    `${label}.urls`,
  );
  const canonicalUrl = canonicalUrlForKind(
    value.canonical_url,
    "csa",
    `${label}.canonical_url`,
  );
  if (canonicalUrl !== urls[0]) {
    fail(`${label}.canonical_url must be the lowest UTF-8-bytewise URL`);
  }
  return { sha256, bytes, canonical_url: canonicalUrl, urls };
}

function validateSummary(input: unknown): FloodgateRawLockManifest["summary"] {
  const value = assertStrictPlainObject(input, "manifest summary");
  const numericKeys = [
    "all_official_csa_urls",
    "canonical_games",
    "csa_responses",
    "daily_rating_http_200",
    "daily_rating_http_404",
    "daily_rating_responses",
    "duplicate_csa_groups",
    "duplicate_csa_urls",
    "listing_bytes",
    "listing_responses",
    "period_inventory_responses",
    "target_csa_urls",
  ] as const;
  const digestKeys = [
    "canonical_game_ids_sha256",
    "csa_urls_sha256",
    "listing_urls_sha256",
    "rating_urls_sha256",
  ] as const;
  assertExactKeys(value, [...numericKeys, ...digestKeys], "manifest summary");
  const numeric = Object.fromEntries(
    numericKeys.map((key) => [
      key,
      assertNonnegativeInteger(value[key], `summary.${key}`),
    ]),
  ) as unknown as Omit<
    FloodgateRawLockManifest["summary"],
    (typeof digestKeys)[number]
  >;
  const decoded: FloodgateRawLockManifest["summary"] = {
    ...numeric,
    canonical_game_ids_sha256: assertSha256(
      value.canonical_game_ids_sha256,
      "summary.canonical_game_ids_sha256",
    ),
    csa_urls_sha256: assertSha256(
      value.csa_urls_sha256,
      "summary.csa_urls_sha256",
    ),
    listing_urls_sha256: assertSha256(
      value.listing_urls_sha256,
      "summary.listing_urls_sha256",
    ),
    rating_urls_sha256: assertSha256(
      value.rating_urls_sha256,
      "summary.rating_urls_sha256",
    ),
  };
  if (
    decoded.listing_responses !== FLOODGATE_Q1_DAILY_LISTING_COUNT ||
    decoded.listing_bytes !== 10_098_337 ||
    decoded.all_official_csa_urls !== 36_419 ||
    decoded.target_csa_urls !== 36_168 ||
    decoded.daily_rating_responses !== FLOODGATE_Q1_DAILY_LISTING_COUNT ||
    decoded.daily_rating_http_200 + decoded.daily_rating_http_404 !==
      decoded.daily_rating_responses ||
    decoded.period_inventory_responses !== 1 ||
    decoded.csa_responses !== 36_168
  ) {
    fail("manifest summary does not match the preregistered inventory");
  }
  return decoded;
}

function uniqueDigestCount(
  values: readonly FloodgateRawObjectIdentity[],
): number {
  return new Set(values.map((value) => value.sha256)).size;
}

export function validateFloodgateRawLockManifest(
  input: unknown,
): Readonly<FloodgateRawLockManifest> {
  const value = assertStrictPlainObject(input, "raw lock manifest");
  assertExactKeys(
    value,
    [
      "acquisition_policy",
      "csa_index",
      "daily_ratings",
      "duplicate_groups",
      "listing_identity_manifest",
      "listings",
      "object_counts",
      "period_inventory",
      "plan",
      "schema",
      "source",
      "summary",
    ],
    "raw lock manifest",
  );
  if (value.schema !== FLOODGATE_RAW_LOCK_SCHEMA) {
    fail("raw lock manifest schema is unsupported");
  }
  const plan = validatePlanBinding(value.plan);
  const source = validateSourceBinding(value.source);
  const acquisitionPolicy = validateAcquisitionPolicy(value.acquisition_policy);
  const summary = validateSummary(value.summary);

  const listingIdentity = assertStrictPlainObject(
    value.listing_identity_manifest,
    "manifest listing identity",
  );
  assertExactKeys(
    listingIdentity,
    ["bytes", "sha256"],
    "manifest listing identity",
  );
  if (
    listingIdentity.bytes !==
      FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED.bytes ||
    listingIdentity.sha256 !==
      FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED.sha256
  ) {
    fail("manifest listing identity does not match preregistration");
  }

  const rawListings = assertStrictArray(value.listings, "manifest listings");
  const listings = rawListings.map(validateListingEntry);
  if (listings.length !== summary.listing_responses) {
    fail("manifest listings length does not match summary");
  }
  assertSortedUniqueUrls(listings, "manifest listings");
  const reproducedListingIdentity =
    assertPreregisteredFloodgateQ1ListingIdentityManifest(
      serializeFloodgateQ1ListingIdentityManifest(
        listings.map(({ url, bytes, sha256 }) => ({ url, bytes, sha256 })),
      ),
    );
  if (
    listingIdentity.bytes !== reproducedListingIdentity.bytes ||
    listingIdentity.sha256 !== reproducedListingIdentity.sha256
  ) {
    fail("manifest listing identity does not reproduce its listing index");
  }
  if (
    listings.reduce((total, entry) => total + entry.bytes, 0) !==
      summary.listing_bytes ||
    listings.reduce(
      (total, entry) => total + entry.all_official_csa_urls,
      0,
    ) !== summary.all_official_csa_urls ||
    listings.reduce((total, entry) => total + entry.target_csa_urls, 0) !==
      summary.target_csa_urls
  ) {
    fail("manifest listing aggregates do not match summary");
  }
  if (
    summary.listing_urls_sha256 !==
    floodgateRawSortedIndexSha256(listings.map((entry) => entry.url))
  ) {
    fail("manifest listing URL digest does not reproduce its index");
  }

  const rawRatings = assertStrictArray(
    value.daily_ratings,
    "manifest daily_ratings",
  );
  const dailyRatings = rawRatings.map((entry, index) =>
    validateBasicIndexEntry(
      entry,
      "daily_rating",
      `manifest daily_ratings[${index}]`,
    ),
  );
  if (dailyRatings.length !== summary.daily_rating_responses) {
    fail("manifest daily ratings length does not match summary");
  }
  assertSortedUniqueUrls(dailyRatings, "manifest daily ratings");
  if (
    dailyRatings.filter((entry) => entry.status === 200).length !==
      summary.daily_rating_http_200 ||
    dailyRatings.filter((entry) => entry.status === 404).length !==
      summary.daily_rating_http_404
  ) {
    fail("manifest daily rating statuses do not match summary");
  }
  if (
    summary.rating_urls_sha256 !==
    floodgateRawSortedIndexSha256(dailyRatings.map((entry) => entry.url))
  ) {
    fail("manifest rating URL digest does not reproduce its index");
  }

  const periodInventory = validatePeriodInventoryEntry(value.period_inventory);
  const rawCsaIndex = assertStrictArray(value.csa_index, "manifest csa_index");
  const csaIndex = rawCsaIndex.map(validateCsaEntry);
  if (csaIndex.length !== summary.csa_responses) {
    fail("manifest CSA index length does not match summary");
  }
  assertSortedUniqueUrls(csaIndex, "manifest CSA index");
  if (
    summary.csa_urls_sha256 !==
    floodgateRawSortedIndexSha256(csaIndex.map((entry) => entry.url))
  ) {
    fail("manifest CSA URL digest does not reproduce its index");
  }

  const targetUrlsByListing = new Map<string, string[]>();
  for (const entry of csaIndex) {
    const listingUrl = entry.url.slice(0, entry.url.lastIndexOf("/") + 1);
    const urls = targetUrlsByListing.get(listingUrl) ?? [];
    urls.push(entry.url);
    targetUrlsByListing.set(listingUrl, urls);
  }
  for (const listing of listings) {
    const targetUrls = targetUrlsByListing.get(listing.url) ?? [];
    if (
      targetUrls.length !== listing.target_csa_urls ||
      floodgateRawSortedIndexSha256(targetUrls) !==
        listing.target_csa_urls_sha256
    ) {
      fail(
        `manifest listing target URL binding does not match CSA index for ${listing.url}`,
      );
    }
    if (
      listing.all_official_csa_urls === listing.target_csa_urls &&
      listing.all_official_csa_urls_sha256 !== listing.target_csa_urls_sha256
    ) {
      fail(
        `manifest listing all/target URL digests conflict at equal counts for ${listing.url}`,
      );
    }
  }

  const csaByDigest = new Map<string, FloodgateRawCsaIndexEntry[]>();
  for (const entry of csaIndex) {
    const group = csaByDigest.get(entry.sha256) ?? [];
    if (group.some((candidate) => candidate.bytes !== entry.bytes)) {
      fail("one CSA digest is paired with conflicting byte counts");
    }
    group.push(entry);
    csaByDigest.set(entry.sha256, group);
  }
  const expectedDuplicateGroups: FloodgateRawDuplicateGroup[] = [];
  const canonicalGameIds: string[] = [];
  for (const [sha256, group] of csaByDigest) {
    const urls = group.map((entry) => entry.url).sort(compareUtf8Bytes);
    const canonicalUrl = urls[0];
    const gameId = floodgateCanonicalUrlGameId(canonicalUrl);
    canonicalGameIds.push(gameId);
    for (const entry of group) {
      if (entry.canonical_url !== canonicalUrl || entry.game_id !== gameId) {
        fail("CSA canonical URL/game ID does not match its exact-byte group");
      }
    }
    if (group.length > 1) {
      expectedDuplicateGroups.push({
        sha256,
        bytes: group[0].bytes,
        canonical_url: canonicalUrl,
        urls,
      });
    }
  }
  expectedDuplicateGroups.sort((left, right) =>
    compareUtf8Bytes(left.canonical_url, right.canonical_url),
  );

  const rawDuplicateGroups = assertStrictArray(
    value.duplicate_groups,
    "manifest duplicate_groups",
  );
  const duplicateGroups = rawDuplicateGroups.map(validateDuplicateGroup);
  for (let index = 1; index < duplicateGroups.length; index += 1) {
    if (
      compareUtf8Bytes(
        duplicateGroups[index - 1].canonical_url,
        duplicateGroups[index].canonical_url,
      ) >= 0
    ) {
      fail("manifest duplicate groups must be canonical-URL sorted");
    }
  }
  if (
    canonicalJson(duplicateGroups) !== canonicalJson(expectedDuplicateGroups)
  ) {
    fail("manifest duplicate groups do not reproduce the CSA byte groups");
  }
  const duplicateUrlCount = duplicateGroups.reduce(
    (total, group) => total + group.urls.length - 1,
    0,
  );
  if (
    duplicateGroups.length !== summary.duplicate_csa_groups ||
    duplicateUrlCount !== summary.duplicate_csa_urls ||
    csaByDigest.size !== summary.canonical_games ||
    summary.canonical_games + summary.duplicate_csa_urls !==
      summary.csa_responses
  ) {
    fail("manifest duplicate groups do not match summary");
  }
  if (
    summary.canonical_game_ids_sha256 !==
    floodgateRawSortedIndexSha256(canonicalGameIds)
  ) {
    fail("manifest canonical game-ID digest does not reproduce byte groups");
  }

  const objectCounts = assertStrictPlainObject(
    value.object_counts,
    "manifest object_counts",
  );
  const objectCountKeys = [
    "unique_csa",
    "unique_daily_ratings",
    "unique_listings",
    "unique_period_inventory",
    "unique_total",
  ] as const;
  assertExactKeys(objectCounts, objectCountKeys, "manifest object_counts");
  const decodedObjectCounts = Object.fromEntries(
    objectCountKeys.map((key) => [
      key,
      assertNonnegativeInteger(objectCounts[key], `object_counts.${key}`),
    ]),
  ) as unknown as FloodgateRawLockManifest["object_counts"];
  const allObjects: FloodgateRawObjectIdentity[] = [
    ...listings,
    ...dailyRatings,
    periodInventory,
    ...csaIndex,
  ];
  if (
    decodedObjectCounts.unique_listings !== uniqueDigestCount(listings) ||
    decodedObjectCounts.unique_daily_ratings !==
      uniqueDigestCount(dailyRatings) ||
    decodedObjectCounts.unique_period_inventory !== 1 ||
    decodedObjectCounts.unique_csa !== uniqueDigestCount(csaIndex) ||
    decodedObjectCounts.unique_total !== uniqueDigestCount(allObjects)
  ) {
    fail(
      "manifest object counts do not reproduce its content-addressed indexes",
    );
  }

  return deepFreeze({
    schema: FLOODGATE_RAW_LOCK_SCHEMA,
    plan,
    source,
    acquisition_policy: acquisitionPolicy,
    summary,
    listing_identity_manifest: {
      bytes: FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED.bytes,
      sha256: FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED.sha256,
    },
    listings,
    daily_ratings: dailyRatings,
    period_inventory: periodInventory,
    csa_index: csaIndex,
    duplicate_groups: duplicateGroups,
    object_counts: decodedObjectCounts,
  }) as Readonly<FloodgateRawLockManifest>;
}

export function serializeFloodgateRawLockManifest(input: unknown): string {
  return `${canonicalJson(validateFloodgateRawLockManifest(input))}\n`;
}

export function parseFloodgateRawLockManifest(
  text: string,
): Readonly<FloodgateRawLockManifest> {
  const decoded = validateFloodgateRawLockManifest(
    parseCanonicalJsonFile(text, "raw lock manifest"),
  );
  if (serializeFloodgateRawLockManifest(decoded) !== text) {
    fail("raw lock manifest is not in canonical key order or framing");
  }
  return decoded;
}

function copyDurableInput(data: string | Uint8Array): Uint8Array {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (nodeUtilTypes.isProxy(data)) fail("durable data must not be a Proxy");
  if (!nodeUtilTypes.isUint8Array(data)) {
    fail("durable data must be a string or exact Uint8Array");
  }
  if (
    !TYPED_ARRAY_BUFFER_GETTER ||
    !TYPED_ARRAY_BYTE_LENGTH_GETTER ||
    !TYPED_ARRAY_BYTE_OFFSET_GETTER
  ) {
    fail("typed-array intrinsic getters are unavailable");
  }
  const buffer = Reflect.apply(TYPED_ARRAY_BUFFER_GETTER, data, []);
  const byteLength = Reflect.apply(TYPED_ARRAY_BYTE_LENGTH_GETTER, data, []);
  const byteOffset = Reflect.apply(TYPED_ARRAY_BYTE_OFFSET_GETTER, data, []);
  if (nodeUtilTypes.isSharedArrayBuffer(buffer)) {
    fail("durable data must not use SharedArrayBuffer storage");
  }
  if (
    !nodeUtilTypes.isArrayBuffer(buffer) ||
    !Number.isSafeInteger(byteLength) ||
    (byteLength as number) < 0 ||
    !Number.isSafeInteger(byteOffset) ||
    (byteOffset as number) < 0
  ) {
    fail("durable data has invalid typed-array storage");
  }
  const source = new IntrinsicUint8Array(
    buffer as ArrayBuffer,
    byteOffset as number,
    byteLength as number,
  );
  const copy = new IntrinsicUint8Array(byteLength as number);
  Reflect.apply(INTRINSIC_UINT8_ARRAY_SET, copy, [source]);
  return copy;
}

function assertCanonicalAbsoluteFilePath(filePath: string): string {
  if (
    typeof filePath !== "string" ||
    !path.isAbsolute(filePath) ||
    path.normalize(filePath) !== filePath ||
    path.basename(filePath) === "" ||
    filePath.includes("\0")
  ) {
    fail("durable target must be a canonical absolute file path");
  }
  return filePath;
}

async function lstatMaybe(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function assertParentChainIsRealDirectories(
  filePath: string,
): Promise<void> {
  const absolute = assertCanonicalAbsoluteFilePath(filePath);
  const parent = path.dirname(absolute);
  const parsed = path.parse(parent);
  let current = parsed.root;
  const relative = path.relative(parsed.root, parent);
  const segments = relative === "" ? [] : relative.split(path.sep);
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = await lstatMaybe(current);
    if (!stat) fail(`parent directory does not exist: ${current}`);
    if (stat.isSymbolicLink()) {
      fail(`parent path component must not be a symbolic link: ${current}`);
    }
    if (!stat.isDirectory()) {
      fail(`parent path component is not a directory: ${current}`);
    }
  }
}

async function parentChainExistsAndIsRealDirectories(
  filePath: string,
): Promise<boolean> {
  const absolute = assertCanonicalAbsoluteFilePath(filePath);
  const parent = path.dirname(absolute);
  const parsed = path.parse(parent);
  let current = parsed.root;
  const relative = path.relative(parsed.root, parent);
  const segments = relative === "" ? [] : relative.split(path.sep);
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = await lstatMaybe(current);
    if (!stat) return false;
    if (stat.isSymbolicLink()) {
      fail(`parent path component must not be a symbolic link: ${current}`);
    }
    if (!stat.isDirectory()) {
      fail(`parent path component is not a directory: ${current}`);
    }
  }
  return true;
}

async function syncDirectory(directory: string): Promise<void> {
  // Durability requires the directory entry itself to be synced. Platforms
  // that cannot open/fsync directories must fail closed rather than silently
  // claim a durable publication.
  const handle = await fs.promises.open(directory, fs.constants.O_RDONLY);
  try {
    const stat = await handle.stat();
    if (!stat.isDirectory())
      fail(`fsync target is not a directory: ${directory}`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readRegularFileNoFollow(filePath: string): Promise<Uint8Array> {
  await assertParentChainIsRealDirectories(filePath);
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number" || noFollow === 0) {
    fail("secure regular-file verification requires O_NOFOLLOW support");
  }
  const flags = fs.constants.O_RDONLY | noFollow;
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(filePath, flags);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ELOOP") fail(`path must not be a symbolic link: ${filePath}`);
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail(`path is not a regular file: ${filePath}`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      bytes.byteLength !== after.size
    ) {
      fail(`file changed while it was being verified: ${filePath}`);
    }
    return new Uint8Array(bytes);
  } finally {
    await handle.close();
  }
}

async function explainExistingNoClobberTarget(
  filePath: string,
  intended: Uint8Array,
): Promise<never> {
  const stat = await lstatMaybe(filePath);
  if (!stat) fail(`exclusive publish raced with removal: ${filePath}`);
  if (stat.isSymbolicLink()) {
    fail(`exclusive publish target is a symbolic link: ${filePath}`);
  }
  if (!stat.isFile()) {
    fail(`exclusive publish target is not a regular file: ${filePath}`);
  }
  const existing = await readRegularFileNoFollow(filePath);
  if (
    existing.byteLength !== intended.byteLength ||
    sha256Hex(existing) !== sha256Hex(intended)
  ) {
    fail(
      `exclusive publish target already exists with conflicting bytes: ${filePath}`,
    );
  }
  throw new FloodgateDurableTargetExistsError(filePath);
}

class FloodgateDurableTargetExistsError extends Error {
  constructor(filePath: string) {
    super(
      `invalid Floodgate raw lock: exclusive publish target already exists; no-clobber: ${filePath}`,
    );
    this.name = "FloodgateDurableTargetExistsError";
  }
}

/**
 * Durably publish an immutable file without any overwrite window.
 *
 * Node has no portable RENAME_NOREPLACE binding, so the fsynced same-directory
 * temporary file is hard-linked into place. `link` is atomic and returns
 * EEXIST instead of replacing an existing object. The temporary name is then
 * removed only after the destination directory has been synced.
 */
export async function durableCreateNoClobber(
  rawFilePath: string,
  data: string | Uint8Array,
  options: FloodgateDurableCreateOptions = {},
): Promise<void> {
  const filePath = assertCanonicalAbsoluteFilePath(rawFilePath);
  const optionValue = assertStrictPlainObject(
    options,
    "durable create options",
  );
  if (
    Object.getOwnPropertyNames(optionValue).some((key) => key !== "failpoint")
  ) {
    fail("durable create options only supports failpoint");
  }
  if (
    optionValue.failpoint !== undefined &&
    typeof optionValue.failpoint !== "function"
  ) {
    fail("durable create failpoint must be a function");
  }
  const failpoint = optionValue.failpoint as
    FloodgateDurableCreateOptions["failpoint"] | undefined;
  const bytes = copyDurableInput(data);
  await assertParentChainIsRealDirectories(filePath);
  const directory = path.dirname(filePath);
  const existing = await lstatMaybe(filePath);
  if (existing) await explainExistingNoClobberTarget(filePath, bytes);

  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(16).toString("hex")}.tmp`,
  );
  let handle: fs.promises.FileHandle | null = null;
  let temporaryCreated = false;
  let primaryFailure = false;
  try {
    handle = await fs.promises.open(
      temporary,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      0o600,
    );
    temporaryCreated = true;
    await failpoint?.("after-temp-open");
    await handle.writeFile(bytes);
    await failpoint?.("after-temp-write");
    await handle.sync();
    await failpoint?.("after-temp-sync");
    await handle.close();
    handle = null;

    const temporaryStat = await fs.promises.lstat(temporary);
    if (!temporaryStat.isFile() || temporaryStat.isSymbolicLink()) {
      fail("durable temporary path stopped being a regular file");
    }
    try {
      await fs.promises.link(temporary, filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        await explainExistingNoClobberTarget(filePath, bytes);
      }
      throw error;
    }
    const publishedStat = await fs.promises.lstat(filePath);
    if (
      !publishedStat.isFile() ||
      publishedStat.isSymbolicLink() ||
      publishedStat.dev !== temporaryStat.dev ||
      publishedStat.ino !== temporaryStat.ino
    ) {
      fail("durable publish did not create the expected regular hard link");
    }
    await failpoint?.("after-link");
    await syncDirectory(directory);
    await failpoint?.("after-directory-sync");
    await fs.promises.unlink(temporary);
    temporaryCreated = false;
    await failpoint?.("after-temp-unlink");
    await syncDirectory(directory);
  } catch (error) {
    primaryFailure = true;
    throw error;
  } finally {
    try {
      if (handle) await handle.close();
      if (temporaryCreated) {
        const temporaryStat = await lstatMaybe(temporary);
        if (temporaryStat) {
          if (!temporaryStat.isFile() || temporaryStat.isSymbolicLink()) {
            fail("refusing to clean a replaced durable temporary path");
          }
          await fs.promises.unlink(temporary);
          await syncDirectory(directory);
        }
      }
    } catch (cleanupError) {
      if (!primaryFailure) throw cleanupError;
    }
  }
}

function assertSafeRelativeStoragePath(value: unknown, label: string): string {
  const relative = assertString(value, label);
  if (
    path.posix.isAbsolute(relative) ||
    path.posix.normalize(relative) !== relative ||
    relative
      .split("/")
      .some((segment) => segment === "." || segment === "..") ||
    relative.includes("\\")
  ) {
    fail(`${label} must be a canonical traversal-free POSIX relative path`);
  }
  return relative;
}

function lockStoragePath(lockRoot: string, relativePath: string): string {
  const root = path.resolve(assertString(lockRoot, "lock root"));
  if (root !== lockRoot) fail("lock root must be a canonical absolute path");
  const relative = assertSafeRelativeStoragePath(
    relativePath,
    "lock storage path",
  );
  const absolute = path.join(root, ...relative.split("/"));
  if (path.relative(root, absolute).startsWith("..")) {
    fail("lock storage path escapes the lock root");
  }
  return absolute;
}

function validateObjectIdentity(
  input: unknown,
): Readonly<FloodgateRawObjectIdentity> {
  const value = assertStrictPlainObject(input, "raw object identity");
  assertExactKeys(value, ["bytes", "object", "sha256"], "raw object identity");
  const bytes = assertNonnegativeInteger(value.bytes, "object bytes");
  const sha256 = assertSha256(value.sha256, "object sha256");
  const object = assertSafeRelativeStoragePath(value.object, "object path");
  if (object !== floodgateRawObjectPath(sha256)) {
    fail("object path does not match its content digest");
  }
  return Object.freeze({ bytes, sha256, object });
}

/** Read and verify an existing immutable content-addressed object. */
export async function verifyExistingFloodgateRawObject(
  lockRoot: string,
  identityInput: unknown,
): Promise<Uint8Array> {
  const identity = validateObjectIdentity(identityInput);
  const objectPath = lockStoragePath(lockRoot, identity.object);
  const bytes = await readRegularFileNoFollow(objectPath);
  if (bytes.byteLength !== identity.bytes) {
    fail(`object byte count does not match ${identity.object}`);
  }
  const digest = sha256Hex(bytes);
  if (digest !== identity.sha256) {
    fail(`object digest does not match ${identity.object}`);
  }
  return bytes;
}

/**
 * Idempotent CAS publication for duplicate workers. An existing object is
 * reusable only after its regular-file shape, byte count, and digest have all
 * been revalidated. Receipts and the final manifest intentionally do not use
 * this helper and remain exclusive no-clobber publications.
 */
export async function storeFloodgateRawObject(
  lockRoot: string,
  data: string | Uint8Array,
  options: FloodgateDurableCreateOptions = {},
): Promise<Readonly<FloodgateRawObjectIdentity>> {
  const bytes = copyDurableInput(data);
  const sha256 = sha256Hex(bytes);
  const object = floodgateRawObjectPath(sha256);
  const identity = Object.freeze({ bytes: bytes.byteLength, sha256, object });
  const objectPath = lockStoragePath(lockRoot, object);
  const existing = await lstatMaybe(objectPath);
  if (existing) {
    await verifyExistingFloodgateRawObject(lockRoot, identity);
    return identity;
  }
  try {
    await durableCreateNoClobber(objectPath, bytes, options);
  } catch (error) {
    // Only the typed, exact-byte EEXIST result means another worker won the
    // same-digest race. Durability/failpoint failures must remain failures even
    // when the hard link already exists.
    if (!(error instanceof FloodgateDurableTargetExistsError)) throw error;
    await verifyExistingFloodgateRawObject(lockRoot, identity);
  }
  return identity;
}

export interface VerifiedFloodgateRawReceipt {
  readonly receipt: Readonly<FloodgateRawReceipt>;
  readonly bytes: Uint8Array;
}

function decodeExistingFloodgateRawReceipt(
  receiptBytes: Uint8Array,
): Readonly<FloodgateRawReceipt> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      receiptBytes,
    );
  } catch {
    return fail("raw response receipt is not fatal-valid UTF-8");
  }
  return parseFloodgateRawReceipt(text);
}

async function verifyExistingFloodgateRawReceiptFromFile(
  lockRoot: string,
  url: string,
  kind: FloodgateRawReceiptKind,
  receiptBytes: Uint8Array,
): Promise<VerifiedFloodgateRawReceipt> {
  const receipt = decodeExistingFloodgateRawReceipt(receiptBytes);
  if (receipt.url !== url || receipt.kind !== kind) {
    fail("URL-keyed receipt does not match the expected URL and kind");
  }
  const bytes = await verifyExistingFloodgateRawObject(lockRoot, {
    bytes: receipt.response.bytes,
    sha256: receipt.response.sha256,
    object: receipt.object,
  });
  return Object.freeze({ receipt, bytes });
}

async function readExistingFloodgateRawReceiptFileIfPresent(
  lockRoot: string,
  url: string,
): Promise<Uint8Array | null> {
  const relativeReceipt = floodgateRawReceiptPath(url);
  const receiptPath = lockStoragePath(lockRoot, relativeReceipt);
  if (!(await parentChainExistsAndIsRealDirectories(receiptPath))) return null;
  try {
    return await readRegularFileNoFollow(receiptPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Revalidate both a URL-keyed receipt and its exact CAS object for resume. */
export async function verifyExistingFloodgateRawReceipt(
  lockRoot: string,
  rawUrl: string,
  kind: FloodgateRawReceiptKind,
): Promise<VerifiedFloodgateRawReceipt> {
  const url = canonicalUrlForKind(rawUrl, kind, "expected receipt URL");
  const receiptBytes = await readRegularFileNoFollow(
    lockStoragePath(lockRoot, floodgateRawReceiptPath(url)),
  );
  return verifyExistingFloodgateRawReceiptFromFile(
    lockRoot,
    url,
    kind,
    receiptBytes,
  );
}

/**
 * Resume probe. Only absence of the URL-keyed receipt itself returns `null`.
 * Once a receipt exists, malformed receipt bytes and missing/corrupt CAS
 * objects remain terminal failures and are never repaired by re-acquisition.
 */
export async function readExistingFloodgateRawReceiptIfPresent(
  lockRoot: string,
  rawUrl: string,
  kind: FloodgateRawReceiptKind,
): Promise<VerifiedFloodgateRawReceipt | null> {
  const url = canonicalUrlForKind(rawUrl, kind, "expected receipt URL");
  const receiptBytes = await readExistingFloodgateRawReceiptFileIfPresent(
    lockRoot,
    url,
  );
  if (!receiptBytes) return null;
  return verifyExistingFloodgateRawReceiptFromFile(
    lockRoot,
    url,
    kind,
    receiptBytes,
  );
}

/**
 * Read and validate the canonical manifest file itself.
 *
 * This deliberately does not verify referenced receipts or objects. The
 * acquisition runner's offline verifier must do that before treating a lock as
 * complete.
 */
export async function readExistingFloodgateRawLockManifestFile(
  lockRoot: string,
): Promise<Readonly<FloodgateRawLockManifest>> {
  const manifestPath = lockStoragePath(
    lockRoot,
    floodgateRawFinalManifestPath(),
  );
  const bytes = await readRegularFileNoFollow(manifestPath);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    return fail("raw lock manifest is not fatal-valid UTF-8");
  }
  return parseFloodgateRawLockManifest(text);
}
