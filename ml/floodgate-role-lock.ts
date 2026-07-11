/**
 * Label-blind production role lock for the preregistered Floodgate 2026-Q1
 * sibling corpus.
 *
 * The production entrypoint consumes only indexes from a fully verified raw
 * manifest. It never walks the raw storage tree, performs network requests,
 * reads teacher/candidate scores, or opens an existing final holdout. Exact
 * CSA duplicates are grouped by body digest and only the UTF-8-bytewise lowest
 * URL is allowed to become a game candidate.
 */

import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  isDeepStrictEqual,
  promisify,
  types as nodeUtilTypes,
} from "node:util";

import {
  FLOODGATE_RAW_LOCK_SCHEMA,
  durableCreateNoClobber,
  floodgateCanonicalUrlGameId,
  floodgateRawObjectPath,
  readExistingFloodgateRawLockManifestFile,
  serializeFloodgateRawLockManifest,
  verifyExistingFloodgateRawObject,
  type FloodgateRawCsaIndexEntry,
  type FloodgateRawLockManifest,
  type FloodgateRawReceiptIndexEntry,
} from "./floodgate-raw-lock";
import { verifyFloodgateRawLockCandidate } from "./floodgate-raw-lock-verifier";
import {
  DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
  DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
  DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
  FLOODGATE_ALLOCATION_SEED,
  FLOODGATE_PARENT_PLY_MAX,
  FLOODGATE_PARENT_PLY_MIN,
  FLOODGATE_PARENTS_PER_GAME,
  FLOODGATE_PHASE_QUOTAS,
  FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS,
  FLOODGATE_ROLE_PRIORITY,
  allocateFloodgateRolesPure,
  floodgateIdentifierDigest,
  type FloodgatePureAllocationArtifact,
  type FloodgatePureGameInput,
  type FloodgateRole,
} from "./floodgate-roles";
import { FLOODGATE_PINNED_LEGACY_REPLAY_EXCLUSION } from "./floodgate-replay-exclusion";
import {
  FLOODGATE_EVENT,
  FLOODGATE_MINIMUM_CUMULATIVE_GAMES,
  FLOODGATE_MINIMUM_EMBEDDED_GAME_RATING,
  assertDistinctFloodgatePlayerIdentities,
  compareUtf8Bytes,
  createFloodgateDailyRatingContextCache,
  decideFloodgateCsaRatingEligibility,
  parseFloodgateCsaUrl,
  parseFloodgateDailyRatingUrl,
  type FloodgateEligibleCsaRatingDecision,
} from "./floodgate-source";
import { parseFloodgateCsa } from "./import-csa-games";

export const FLOODGATE_ROLE_LOCK_SCHEMA =
  "shogi-floodgate-role-lock-v1" as const;
export const FLOODGATE_ROLE_LOCK_MANIFEST_FILENAME = "manifest.json" as const;
export const FLOODGATE_ROLE_LOCK_MATERIALIZED_INPUT_FILENAME =
  "materialized-input.json" as const;
export const FLOODGATE_ROLE_LOCK_ALLOCATION_FILENAME =
  "allocation.json" as const;

/** These ratios are copied verbatim from the immutable preregistration. */
export const FLOODGATE_ROLE_IDENTITY_GAME_CAP_RATIO = 0.1 as const;
export const FLOODGATE_ROLE_UNORDERED_PAIR_GAME_CAP_RATIO = 0.02 as const;

const SHA256_RE = /^[0-9a-f]{64}$/;
const REVISION_RE = /^[0-9a-f]{40}$/;
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;
const FORBIDDEN_LABEL_FIELD_RE =
  /(?:winner|opening|teacher|candidate.*score|played.*quality|post.*result)/i;
const EMPTY_ROLE_COUNTS: Readonly<Record<FloodgateRole, number>> =
  Object.freeze({
    fresh_final_holdout: 0,
    fresh_selection: 0,
    training: 0,
  });
const OFFLINE_METADATA_READ_CONCURRENCY = 16;
const execFile = promisify(execFileCallback);

export interface FloodgateRoleLockIndexedGame {
  readonly url: string;
  readonly canonical_url: string;
  readonly game_id: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly object: string;
}

export interface FloodgateRoleLockInspectedGame extends FloodgateRoleLockIndexedGame {
  readonly player_identities: readonly [string, string];
}

export interface FloodgateRoleLockCoreAccounting {
  readonly indexed_csa_rows: number;
  readonly canonical_games: number;
  readonly duplicate_alias_rows_excluded: number;
  readonly source_metadata_eligible_games: number;
  readonly source_metadata_ineligible_games: number;
  readonly lazy_materialization_attempts: number;
  readonly fully_materialized_games: number;
  readonly full_source_or_legality_rejections: number;
  readonly semantic_or_parent_quota_rejections: number;
  readonly identity_cap_role_checks_skipped_before_materialization: number;
  readonly unordered_pair_cap_role_checks_skipped_before_materialization: number;
}

export interface FloodgateRoleLockCoreResult {
  readonly artifact: FloodgatePureAllocationArtifact;
  readonly accounting: Readonly<FloodgateRoleLockCoreAccounting>;
}

interface FloodgateRoleLockCoreInput {
  readonly csaIndex: unknown;
  readonly legacyProtectedPositionIds: readonly string[];
  readonly roleGameCounts: Readonly<Record<FloodgateRole, number>>;
  readonly inspect: (
    game: Readonly<FloodgateRoleLockIndexedGame>,
  ) => Promise<readonly [string, string] | null>;
  readonly materialize: (
    game: Readonly<FloodgateRoleLockInspectedGame>,
  ) => Promise<unknown | null>;
}

/** Explicitly non-production seam for small, deterministic fixtures. */
export interface NonProductionFloodgateRoleLockFixtureInput {
  readonly csaIndex: unknown;
  readonly legacyProtectedPositionIds: readonly string[];
  readonly roleGameCounts: Readonly<Record<FloodgateRole, number>>;
  readonly inspect: FloodgateRoleLockCoreInput["inspect"];
  readonly materialize: FloodgateRoleLockCoreInput["materialize"];
}

export type FloodgateRoleLockOutputCheckpoint =
  | "before-materialized-input-write"
  | "after-materialized-input-write"
  | "before-allocation-write"
  | "after-allocation-write"
  | "before-materialized-input-read"
  | "after-materialized-input-read"
  | "before-allocation-read"
  | "after-allocation-read"
  | "before-source-closure"
  | "after-source-closure"
  | "before-final-materialized-input-read"
  | "after-final-materialized-input-read"
  | "before-final-allocation-read"
  | "after-final-allocation-read"
  | "before-manifest-write"
  | "after-manifest-write"
  | "before-manifest-read"
  | "after-manifest-read";

export interface NonProductionFloodgateRoleLockPublishSequenceFixture {
  readonly validateCandidate: () => void;
  readonly assertOutputRoot: (
    checkpoint: FloodgateRoleLockOutputCheckpoint,
  ) => Promise<void>;
  readonly publishMaterializedInput: () => Promise<void>;
  readonly publishAllocation: () => Promise<void>;
  readonly verifyMaterializedInput: () => Promise<void>;
  readonly verifyAllocation: () => Promise<void>;
  readonly revalidateSourceClosure: () => Promise<void>;
  readonly publishManifest: () => Promise<void>;
  readonly verifyManifest: () => Promise<void>;
}

export interface FloodgateRoleLockArtifactIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateRoleLockManifest {
  readonly schema: typeof FLOODGATE_ROLE_LOCK_SCHEMA;
  readonly status: "complete-label-blind-role-lock";
  readonly provenance: {
    readonly raw_referential_closure_verified: true;
    readonly raw_storage_tree_scanned: false;
    readonly network_requests: 0;
    readonly teacher_or_candidate_scores_read: false;
    readonly existing_final_holdout_opened: false;
  };
  readonly pipeline: {
    readonly source_revision: string;
    readonly tracked_tree_clean: true;
  };
  readonly raw_lock: {
    readonly schema: typeof FLOODGATE_RAW_LOCK_SCHEMA;
    readonly manifest: FloodgateRoleLockArtifactIdentity;
    readonly source_revision: string;
    readonly canonical_games: number;
    readonly duplicate_groups: number;
    readonly duplicate_aliases: number;
  };
  readonly source_filter: {
    readonly event: typeof FLOODGATE_EVENT;
    readonly rating_group: 0;
    readonly minimum_cumulative_games: typeof FLOODGATE_MINIMUM_CUMULATIVE_GAMES;
    readonly minimum_embedded_game_time_rating: typeof FLOODGATE_MINIMUM_EMBEDDED_GAME_RATING;
    readonly distinct_full_identities: true;
    readonly initial_position: "hirate";
    readonly initial_side: "sente";
    readonly terminal_allowlist: readonly ["TORYO"];
    readonly duplicate_exact_csa_bytes: "keep-lowest-utf8-bytewise-url-only";
    readonly winner_opening_quality_or_score_filtering: false;
  };
  readonly allocation_contract: {
    readonly seed: typeof FLOODGATE_ALLOCATION_SEED;
    readonly role_priority: typeof FLOODGATE_ROLE_PRIORITY;
    readonly role_game_counts: typeof DEFAULT_FLOODGATE_ROLE_GAME_COUNTS;
    readonly game_rank_domains: typeof DEFAULT_FLOODGATE_GAME_RANK_DOMAINS;
    readonly parent_rank_domains: typeof DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS;
    readonly parent_ply_inclusive: readonly [number, number];
    readonly parents_per_game: typeof FLOODGATE_PARENTS_PER_GAME;
    readonly preferred_phase_quotas: typeof FLOODGATE_PHASE_QUOTAS;
    readonly identity_game_cap_ratio: typeof FLOODGATE_ROLE_IDENTITY_GAME_CAP_RATIO;
    readonly unordered_identity_pair_game_cap_ratio: typeof FLOODGATE_ROLE_UNORDERED_PAIR_GAME_CAP_RATIO;
    readonly cap_rounding: "floor-with-minimum-one";
  };
  readonly legacy_protected_position_ids: FloodgateRoleLockArtifactIdentity & {
    readonly count: number;
    readonly identifiers_sha256: string;
  };
  readonly accounting: Readonly<FloodgateRoleLockCoreAccounting>;
  readonly artifacts: {
    readonly materialized_input: FloodgateRoleLockArtifactIdentity;
    readonly allocation: FloodgateRoleLockArtifactIdentity;
  };
  readonly role_summaries: FloodgatePureAllocationArtifact["output"]["role_summaries"];
  readonly all_selected_game_ids_sha256: string;
  readonly all_selected_parent_ids_sha256: string;
  readonly all_protected_position_ids_count: number;
  readonly all_protected_position_ids_sha256: string;
}

export interface CreateFloodgateRoleLockOptions {
  readonly repositoryRoot: string;
  readonly pipelineRevision: string;
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
  readonly legacyProtectedPositionIdsPath: string;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate role lock: ${message}`);
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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
    fail(`${label} must not have symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_LABEL_FIELD_RE.test(key)) {
      fail(`${label}.${key} is forbidden in a label-blind role lock`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`${label}.${key} must be an enumerable data property`);
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
    fail(`${label} must not have symbol keys`);
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
    fail(`${label} must be dense and have no hidden properties`);
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

function assertCanonicalAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    path.resolve(value) !== value
  ) {
    fail(`${label} must be a canonical absolute path`);
  }
  return value;
}

function assertRevision(value: unknown): string {
  if (typeof value !== "string" || !REVISION_RE.test(value)) {
    fail("pipeline revision must be a lowercase 40-hex commit");
  }
  return value;
}

function pathIsInsideOrEqual(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function assertSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function assertNonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail(
        "canonical JSON only accepts finite numbers other than negative zero",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index))
        fail("canonical JSON rejects sparse arrays");
    }
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
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

function validateRoleCounts(
  input: unknown,
): Readonly<Record<FloodgateRole, number>> {
  const value = assertStrictPlainObject(input, "role game counts");
  assertExactKeys(value, FLOODGATE_ROLE_PRIORITY, "role game counts");
  const counts = {} as Record<FloodgateRole, number>;
  for (const role of FLOODGATE_ROLE_PRIORITY) {
    counts[role] = assertNonnegativeInteger(value[role], `${role} game count`);
  }
  return Object.freeze(counts);
}

function fixedAllocationOptions(
  roleGameCounts: Readonly<Record<FloodgateRole, number>>,
  legacyProtectedPositionIds: readonly string[],
) {
  return {
    seed: FLOODGATE_ALLOCATION_SEED,
    legacyProtectedPositionIds,
    roleGameCounts,
    gameRankDomains: DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
    parentRankDomains: DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
  };
}

function decodeLegacyPositionIds(input: unknown): string[] {
  const raw = assertStrictArray(input, "legacy protected position IDs");
  const decoded = raw.map((value, index) => {
    if (typeof value !== "string" || !POSITION_ID_RE.test(value)) {
      fail(
        `legacy protected position IDs[${index}] must be a canonical position ID`,
      );
    }
    return value;
  });
  const sorted = [...decoded].sort(compareUtf8Bytes);
  if (sorted.some((value, index) => index > 0 && value === sorted[index - 1])) {
    fail("legacy protected position IDs must be unique");
  }
  return sorted;
}

function decodeIndexedGames(input: unknown): Readonly<{
  indexed: readonly Readonly<FloodgateRoleLockIndexedGame>[];
  canonical: readonly Readonly<FloodgateRoleLockIndexedGame>[];
}> {
  const raw = assertStrictArray(input, "verified raw CSA index");
  const urls = new Set<string>();
  const decoded = raw.map((rawEntry, index) => {
    const label = `verified raw CSA index[${index}]`;
    const value = assertStrictPlainObject(rawEntry, label);
    assertExactKeys(
      value,
      ["bytes", "canonical_url", "game_id", "object", "sha256", "url"],
      label,
    );
    if (
      typeof value.url !== "string" ||
      typeof value.canonical_url !== "string" ||
      typeof value.game_id !== "string" ||
      typeof value.object !== "string"
    ) {
      fail(`${label} string fields must be primitive strings`);
    }
    const location = parseFloodgateCsaUrl(value.url);
    const canonicalLocation = parseFloodgateCsaUrl(value.canonical_url);
    if (
      location.url !== value.url ||
      canonicalLocation.url !== value.canonical_url
    ) {
      fail(`${label} URLs must use canonical spelling`);
    }
    const sha256 = assertSha256(value.sha256, `${label}.sha256`);
    const bytes = assertNonnegativeInteger(value.bytes, `${label}.bytes`);
    if (bytes === 0) fail(`${label}.bytes must be positive`);
    if (value.object !== floodgateRawObjectPath(sha256)) {
      fail(`${label}.object must be the content-addressed path for sha256`);
    }
    if (value.game_id !== floodgateCanonicalUrlGameId(value.canonical_url)) {
      fail(`${label}.game_id must derive from canonical_url`);
    }
    if (urls.has(value.url)) fail(`${label}.url is duplicated`);
    urls.add(value.url);
    return Object.freeze({
      url: value.url,
      canonical_url: value.canonical_url,
      game_id: value.game_id,
      bytes,
      sha256,
      object: value.object,
    });
  });

  const byDigest = new Map<string, Readonly<FloodgateRoleLockIndexedGame>[]>();
  for (const entry of decoded) {
    const group = byDigest.get(entry.sha256) ?? [];
    byDigest.set(entry.sha256, [...group, entry]);
  }
  const canonical: Readonly<FloodgateRoleLockIndexedGame>[] = [];
  const gameIds = new Set<string>();
  for (const [digest, group] of byDigest) {
    const sorted = [...group].sort((left, right) =>
      compareUtf8Bytes(left.url, right.url),
    );
    const canonicalUrl = sorted[0].url;
    const expectedGameId = floodgateCanonicalUrlGameId(canonicalUrl);
    if (
      sorted.some(
        (entry) =>
          entry.sha256 !== digest ||
          entry.bytes !== sorted[0].bytes ||
          entry.object !== sorted[0].object ||
          entry.canonical_url !== canonicalUrl ||
          entry.game_id !== expectedGameId,
      )
    ) {
      fail(`CSA digest group ${digest} has inconsistent canonical binding`);
    }
    if (sorted.filter((entry) => entry.url === canonicalUrl).length !== 1) {
      fail(`CSA digest group ${digest} must contain one canonical URL row`);
    }
    if (gameIds.has(expectedGameId)) {
      fail(`canonical game ID ${expectedGameId} is duplicated`);
    }
    gameIds.add(expectedGameId);
    canonical.push(sorted[0]);
  }
  canonical.sort((left, right) => compareUtf8Bytes(left.url, right.url));
  return Object.freeze({
    indexed: Object.freeze(decoded),
    canonical: Object.freeze(canonical),
  });
}

function decodeInspectedIdentities(
  input: unknown,
  label: string,
): readonly [string, string] {
  const raw = assertStrictArray(input, label);
  if (
    raw.length !== 2 ||
    raw.some((identity) => typeof identity !== "string")
  ) {
    fail(`${label} must contain exactly two primitive strings`);
  }
  return assertDistinctFloodgatePlayerIdentities([
    raw[0] as string,
    raw[1] as string,
  ]);
}

async function mapWithLimit<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, values.length)) },
    async () => {
      while (true) {
        const index = next;
        next += 1;
        if (index >= values.length) return;
        results[index] = await operation(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function domainRank(
  domain: string,
  gameId: string,
): Readonly<{ digest: Buffer; gameId: string }> {
  return Object.freeze({
    digest: createHash("sha256")
      .update([domain, FLOODGATE_ALLOCATION_SEED, gameId].join("\0"), "utf8")
      .digest(),
    gameId,
  });
}

function rankGamesForRole(
  games: readonly Readonly<FloodgateRoleLockInspectedGame>[],
  role: FloodgateRole,
): Readonly<FloodgateRoleLockInspectedGame>[] {
  return [...games]
    .map((game) => ({
      game,
      rank: domainRank(DEFAULT_FLOODGATE_GAME_RANK_DOMAINS[role], game.game_id),
    }))
    .sort(
      (left, right) =>
        Buffer.compare(left.rank.digest, right.rank.digest) ||
        compareUtf8Bytes(left.rank.gameId, right.rank.gameId),
    )
    .map(({ game }) => game);
}

function sortedIdentityPair(
  identities: readonly [string, string],
): readonly [string, string] {
  return compareUtf8Bytes(identities[0], identities[1]) <= 0
    ? identities
    : [identities[1], identities[0]];
}

function normalizeMaterializedGame(
  input: unknown,
  inspected: Readonly<FloodgateRoleLockInspectedGame>,
): FloodgatePureGameInput {
  const value = assertStrictPlainObject(input, "materialized game");
  assertExactKeys(
    value,
    ["game_id", "parents", "player_identities"],
    "materialized game",
  );
  if (value.game_id !== inspected.game_id) {
    fail("materialized game_id does not match its canonical URL-derived ID");
  }
  const identities = decodeInspectedIdentities(
    value.player_identities,
    "materialized game player_identities",
  );
  if (
    identities[0] !== inspected.player_identities[0] ||
    identities[1] !== inspected.player_identities[1]
  ) {
    fail("materialized player identities do not match source inspection");
  }
  const validation = allocateFloodgateRolesPure(
    [input],
    fixedAllocationOptions(EMPTY_ROLE_COUNTS, []),
  );
  const canonicalInput = JSON.parse(validation.input_canonical_json) as {
    games: FloodgatePureGameInput[];
  };
  if (canonicalInput.games.length !== 1) {
    fail("materialized game normalization lost its one-game input");
  }
  return canonicalInput.games[0];
}

async function allocateFloodgateRoleLockCore(
  input: FloodgateRoleLockCoreInput,
): Promise<Readonly<FloodgateRoleLockCoreResult>> {
  if (
    typeof input.inspect !== "function" ||
    typeof input.materialize !== "function"
  ) {
    fail("role-lock callbacks must be functions");
  }
  const counts = validateRoleCounts(input.roleGameCounts);
  const legacy = decodeLegacyPositionIds(input.legacyProtectedPositionIds);
  const { indexed, canonical } = decodeIndexedGames(input.csaIndex);

  const inspectedResults = await mapWithLimit(
    canonical,
    OFFLINE_METADATA_READ_CONCURRENCY,
    async (entry) => {
      const rawIdentities = await input.inspect(entry);
      if (rawIdentities === null) return null;
      const identities = decodeInspectedIdentities(
        rawIdentities,
        `source inspection for ${entry.url}`,
      );
      return Object.freeze({ ...entry, player_identities: identities });
    },
  );
  const inspected = inspectedResults.filter(
    (game): game is Readonly<FloodgateRoleLockInspectedGame> => game !== null,
  );

  const materialized = new Map<string, FloodgatePureGameInput | null>();
  const semanticRejected = new Set<string>();
  const selectedGameIds = new Set<string>();
  const reservedProtectedIds = new Set(legacy);
  const manuallySelected = new Map<FloodgateRole, string[]>();
  let materializationAttempts = 0;
  let fullMaterializationRejections = 0;
  let identityCapSkips = 0;
  let pairCapSkips = 0;

  for (const role of FLOODGATE_ROLE_PRIORITY) {
    const requested = counts[role];
    const identityCap = Math.max(
      1,
      Math.floor(requested * FLOODGATE_ROLE_IDENTITY_GAME_CAP_RATIO),
    );
    const pairCap = Math.max(
      1,
      Math.floor(requested * FLOODGATE_ROLE_UNORDERED_PAIR_GAME_CAP_RATIO),
    );
    const identityCounts = new Map<string, number>();
    const pairCounts = new Map<string, number>();
    const selectedForRole: string[] = [];
    manuallySelected.set(role, selectedForRole);

    for (const game of rankGamesForRole(inspected, role)) {
      if (selectedForRole.length >= requested) break;
      if (
        selectedGameIds.has(game.game_id) ||
        semanticRejected.has(game.game_id)
      ) {
        continue;
      }
      if (
        game.player_identities.some(
          (identity) => (identityCounts.get(identity) ?? 0) >= identityCap,
        )
      ) {
        identityCapSkips += 1;
        continue;
      }
      const pair = sortedIdentityPair(game.player_identities);
      const pairKey = pair.join("\0");
      if ((pairCounts.get(pairKey) ?? 0) >= pairCap) {
        pairCapSkips += 1;
        continue;
      }

      let pureGame = materialized.get(game.game_id);
      if (pureGame === undefined) {
        materializationAttempts += 1;
        const rawGame = await input.materialize(game);
        if (rawGame === null) {
          materialized.set(game.game_id, null);
          fullMaterializationRejections += 1;
          continue;
        }
        pureGame = normalizeMaterializedGame(rawGame, game);
        materialized.set(game.game_id, pureGame);
      }
      if (pureGame === null) continue;

      const oneGameCounts = { ...EMPTY_ROLE_COUNTS, [role]: 1 };
      let selected;
      try {
        const probe = allocateFloodgateRolesPure(
          [pureGame],
          fixedAllocationOptions(oneGameCounts, [...reservedProtectedIds]),
        );
        selected = probe.output.roles[role][0];
      } catch {
        semanticRejected.add(game.game_id);
        continue;
      }
      if (!selected) fail("one-game semantic probe returned no selected game");

      selectedForRole.push(game.game_id);
      selectedGameIds.add(game.game_id);
      for (const identity of game.player_identities) {
        identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
      }
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
      for (const parent of selected.parents) {
        for (const id of parent.protected_position_ids) {
          reservedProtectedIds.add(id);
        }
      }
    }

    if (selectedForRole.length !== requested) {
      fail(
        `cannot allocate exact ${role} quota: selected ${selectedForRole.length} of ${requested} games`,
      );
    }
  }

  const materializedGames = [...materialized.values()].filter(
    (game): game is FloodgatePureGameInput => game !== null,
  );
  const artifact = allocateFloodgateRolesPure(
    materializedGames,
    fixedAllocationOptions(counts, legacy),
  );
  for (const role of FLOODGATE_ROLE_PRIORITY) {
    const manual = manuallySelected.get(role) ?? [];
    const reproduced = artifact.output.roles[role].map((game) => game.game_id);
    if (!isDeepStrictEqual(manual, reproduced)) {
      fail(
        `${role} lazy allocation order did not reproduce in the final pure-core run`,
      );
    }
  }

  const accounting: FloodgateRoleLockCoreAccounting = Object.freeze({
    indexed_csa_rows: indexed.length,
    canonical_games: canonical.length,
    duplicate_alias_rows_excluded: indexed.length - canonical.length,
    source_metadata_eligible_games: inspected.length,
    source_metadata_ineligible_games: canonical.length - inspected.length,
    lazy_materialization_attempts: materializationAttempts,
    fully_materialized_games: materializedGames.length,
    full_source_or_legality_rejections: fullMaterializationRejections,
    semantic_or_parent_quota_rejections: semanticRejected.size,
    identity_cap_role_checks_skipped_before_materialization: identityCapSkips,
    unordered_pair_cap_role_checks_skipped_before_materialization: pairCapSkips,
  });
  return Object.freeze({ artifact, accounting });
}

/**
 * Small-fixture seam. Production callers must use `createFloodgateRoleLock`,
 * which fixes the exact 200/200/1000 quotas and authenticates every raw object.
 */
export async function allocateFloodgateRoleLockCoreForTests(
  input: NonProductionFloodgateRoleLockFixtureInput,
): Promise<Readonly<FloodgateRoleLockCoreResult>> {
  const value = assertStrictPlainObject(
    input,
    "non-production role-lock fixture",
  );
  assertExactKeys(
    value,
    [
      "csaIndex",
      "inspect",
      "legacyProtectedPositionIds",
      "materialize",
      "roleGameCounts",
    ],
    "non-production role-lock fixture",
  );
  return allocateFloodgateRoleLockCore(input);
}

async function runRoleLockPublishSequence(
  fixture: NonProductionFloodgateRoleLockPublishSequenceFixture,
): Promise<void> {
  fixture.validateCandidate();
  await fixture.assertOutputRoot("before-materialized-input-write");
  await fixture.publishMaterializedInput();
  await fixture.assertOutputRoot("after-materialized-input-write");
  await fixture.assertOutputRoot("before-allocation-write");
  await fixture.publishAllocation();
  await fixture.assertOutputRoot("after-allocation-write");
  await fixture.assertOutputRoot("before-materialized-input-read");
  await fixture.verifyMaterializedInput();
  await fixture.assertOutputRoot("after-materialized-input-read");
  await fixture.assertOutputRoot("before-allocation-read");
  await fixture.verifyAllocation();
  await fixture.assertOutputRoot("after-allocation-read");
  await fixture.assertOutputRoot("before-source-closure");
  await fixture.revalidateSourceClosure();
  await fixture.assertOutputRoot("after-source-closure");
  await fixture.assertOutputRoot("before-final-materialized-input-read");
  await fixture.verifyMaterializedInput();
  await fixture.assertOutputRoot("after-final-materialized-input-read");
  await fixture.assertOutputRoot("before-final-allocation-read");
  await fixture.verifyAllocation();
  await fixture.assertOutputRoot("after-final-allocation-read");
  fixture.validateCandidate();
  await fixture.assertOutputRoot("before-manifest-write");
  await fixture.publishManifest();
  await fixture.assertOutputRoot("after-manifest-write");
  await fixture.assertOutputRoot("before-manifest-read");
  await fixture.verifyManifest();
  await fixture.assertOutputRoot("after-manifest-read");
}

/** Explicit non-production seam for crash/TOCTOU publication-order tests. */
export async function runFloodgateRoleLockPublishSequenceCoreForTests(
  input: NonProductionFloodgateRoleLockPublishSequenceFixture,
): Promise<void> {
  const value = assertStrictPlainObject(
    input,
    "non-production role-lock publication fixture",
  );
  assertExactKeys(
    value,
    [
      "assertOutputRoot",
      "publishAllocation",
      "publishManifest",
      "publishMaterializedInput",
      "revalidateSourceClosure",
      "validateCandidate",
      "verifyAllocation",
      "verifyManifest",
      "verifyMaterializedInput",
    ],
    "non-production role-lock publication fixture",
  );
  for (const [name, callback] of Object.entries(value)) {
    if (typeof callback !== "function") {
      fail(
        `non-production role-lock publication fixture.${name} must be a function`,
      );
    }
  }
  await runRoleLockPublishSequence(input);
}

async function readRegularFileNoFollow(filePath: string): Promise<Uint8Array> {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") {
    fail("this production platform must provide O_NOFOLLOW");
  }
  const realPath = await fs.promises.realpath(filePath);
  if (realPath !== filePath)
    fail(`${filePath} must not traverse symbolic links`);
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_RDONLY | noFollow,
  );
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail(`${filePath} must be a regular file`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      bytes.byteLength !== after.size
    ) {
      fail(`${filePath} changed while it was being read`);
    }
    return new Uint8Array(bytes);
  } finally {
    await handle.close();
  }
}

interface FloodgateDirectoryIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

interface FloodgateDirectorySnapshot extends FloodgateDirectoryIdentity {
  readonly ctimeNs: bigint;
}

async function directoryPathSnapshot(
  directory: string,
  label: string,
): Promise<Readonly<FloodgateDirectorySnapshot>> {
  const stat = await fs.promises.lstat(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`${label} must remain a real directory`);
  }
  if ((await fs.promises.realpath(directory)) !== directory) {
    fail(`${label} must not traverse symbolic links`);
  }
  return Object.freeze({ dev: stat.dev, ino: stat.ino, ctimeNs: stat.ctimeNs });
}

function assertSameDirectoryIdentity(
  actual: Readonly<FloodgateDirectoryIdentity>,
  expected: Readonly<FloodgateDirectoryIdentity>,
  label: string,
): void {
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
    fail(`${label} directory identity changed`);
  }
}

async function openDirectoryNoFollow(
  directory: string,
  label: string,
): Promise<{
  readonly handle: fs.promises.FileHandle;
  readonly snapshot: Readonly<FloodgateDirectorySnapshot>;
}> {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") {
    fail("this production platform must provide O_NOFOLLOW");
  }
  const before = await directoryPathSnapshot(directory, label);
  const handle = await fs.promises.open(
    directory,
    fs.constants.O_RDONLY | noFollow,
  );
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isDirectory()) fail(`${label} handle is not a directory`);
    const snapshot = Object.freeze({
      dev: stat.dev,
      ino: stat.ino,
      ctimeNs: stat.ctimeNs,
    });
    assertSameDirectoryIdentity(snapshot, before, label);
    const after = await directoryPathSnapshot(directory, label);
    assertSameDirectoryIdentity(after, snapshot, label);
    return { handle, snapshot };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

type FloodgateRootMutationPolicy = "stable" | "adopt-known-write";

class FloodgateRoleLockOutputRootGuard {
  readonly #root: string;
  readonly #parent: string;
  readonly #rootHandle: fs.promises.FileHandle;
  readonly #parentHandle: fs.promises.FileHandle;
  readonly #rootIdentity: Readonly<FloodgateDirectoryIdentity>;
  readonly #parentIdentity: Readonly<FloodgateDirectoryIdentity>;
  readonly #parentCtimeNs: bigint;
  #rootCtimeNs: bigint;
  #closed = false;

  private constructor(
    root: string,
    parentHandle: fs.promises.FileHandle,
    parentSnapshot: Readonly<FloodgateDirectorySnapshot>,
    rootHandle: fs.promises.FileHandle,
    rootSnapshot: Readonly<FloodgateDirectorySnapshot>,
  ) {
    this.#root = root;
    this.#parent = path.dirname(root);
    this.#rootHandle = rootHandle;
    this.#parentHandle = parentHandle;
    this.#rootIdentity = Object.freeze({
      dev: rootSnapshot.dev,
      ino: rootSnapshot.ino,
    });
    this.#parentIdentity = Object.freeze({
      dev: parentSnapshot.dev,
      ino: parentSnapshot.ino,
    });
    this.#parentCtimeNs = parentSnapshot.ctimeNs;
    this.#rootCtimeNs = rootSnapshot.ctimeNs;
  }

  static async acquireFresh(
    roleLockRoot: string,
  ): Promise<FloodgateRoleLockOutputRootGuard> {
    const parent = path.dirname(roleLockRoot);
    const openedParent = await openDirectoryNoFollow(
      parent,
      "role lock parent",
    );
    let rootHandle: fs.promises.FileHandle | null = null;
    try {
      let createdRootSnapshot: Readonly<FloodgateDirectorySnapshot>;
      try {
        await fs.promises.mkdir(roleLockRoot, { mode: 0o700 });
        createdRootSnapshot = await directoryPathSnapshot(
          roleLockRoot,
          "freshly created role lock root",
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          fail("role lock root must be freshly and exclusively created");
        }
        throw error;
      }
      await openedParent.handle.sync();
      const parentAfterCreate = await directoryPathSnapshot(
        parent,
        "role lock parent",
      );
      const parentHandleAfterCreate = await openedParent.handle.stat({
        bigint: true,
      });
      if (!parentHandleAfterCreate.isDirectory()) {
        fail("role lock parent handle stopped being a directory");
      }
      const durableParentSnapshot = Object.freeze({
        dev: parentHandleAfterCreate.dev,
        ino: parentHandleAfterCreate.ino,
        ctimeNs: parentHandleAfterCreate.ctimeNs,
      });
      assertSameDirectoryIdentity(
        durableParentSnapshot,
        openedParent.snapshot,
        "role lock parent handle",
      );
      assertSameDirectoryIdentity(
        parentAfterCreate,
        durableParentSnapshot,
        "role lock parent path",
      );

      const openedRoot = await openDirectoryNoFollow(
        roleLockRoot,
        "role lock root",
      );
      assertSameDirectoryIdentity(
        openedRoot.snapshot,
        createdRootSnapshot,
        "freshly created role lock root",
      );
      if (openedRoot.snapshot.ctimeNs !== createdRootSnapshot.ctimeNs) {
        fail("freshly created role lock root changed before handle pinning");
      }
      rootHandle = openedRoot.handle;
      const guard = new FloodgateRoleLockOutputRootGuard(
        roleLockRoot,
        openedParent.handle,
        durableParentSnapshot,
        openedRoot.handle,
        openedRoot.snapshot,
      );
      await guard.assertState("fresh root acquisition", [], "stable");
      return guard;
    } catch (error) {
      if (rootHandle) await rootHandle.close().catch(() => undefined);
      await openedParent.handle.close().catch(() => undefined);
      throw error;
    }
  }

  async #snapshot(stage: string): Promise<{
    readonly rootCtimeNs: bigint;
  }> {
    if (this.#closed) fail(`role lock root guard is closed at ${stage}`);
    const parentPath = await directoryPathSnapshot(
      this.#parent,
      `role lock parent at ${stage}`,
    );
    const parentHandle = await this.#parentHandle.stat({ bigint: true });
    if (!parentHandle.isDirectory()) {
      fail(`role lock parent handle stopped being a directory at ${stage}`);
    }
    assertSameDirectoryIdentity(
      parentPath,
      this.#parentIdentity,
      `role lock parent path at ${stage}`,
    );
    assertSameDirectoryIdentity(
      { dev: parentHandle.dev, ino: parentHandle.ino },
      this.#parentIdentity,
      `role lock parent handle at ${stage}`,
    );
    if (
      parentPath.ctimeNs !== this.#parentCtimeNs ||
      parentHandle.ctimeNs !== this.#parentCtimeNs
    ) {
      fail(`role lock parent changed; possible output-root ABA at ${stage}`);
    }

    const rootPath = await directoryPathSnapshot(
      this.#root,
      `role lock root at ${stage}`,
    );
    const rootHandle = await this.#rootHandle.stat({ bigint: true });
    if (!rootHandle.isDirectory()) {
      fail(`role lock root handle stopped being a directory at ${stage}`);
    }
    assertSameDirectoryIdentity(
      rootPath,
      this.#rootIdentity,
      `role lock root path at ${stage}`,
    );
    assertSameDirectoryIdentity(
      { dev: rootHandle.dev, ino: rootHandle.ino },
      this.#rootIdentity,
      `role lock root handle at ${stage}`,
    );
    if (rootPath.ctimeNs !== rootHandle.ctimeNs) {
      fail(`role lock root changed while observed at ${stage}`);
    }
    return { rootCtimeNs: rootHandle.ctimeNs };
  }

  async assertState(
    stage: string,
    expectedEntries: readonly string[],
    mutationPolicy: FloodgateRootMutationPolicy,
  ): Promise<void> {
    const before = await this.#snapshot(stage);
    if (
      mutationPolicy === "stable" &&
      before.rootCtimeNs !== this.#rootCtimeNs
    ) {
      fail(`role lock root changed unexpectedly before ${stage}`);
    }
    const entries = (await fs.promises.readdir(this.#root)).sort(
      compareUtf8Bytes,
    );
    const after = await this.#snapshot(stage);
    if (after.rootCtimeNs !== before.rootCtimeNs) {
      fail(`role lock root changed during ${stage}`);
    }
    const wanted = [...expectedEntries].sort(compareUtf8Bytes);
    if (
      entries.length !== wanted.length ||
      entries.some((entry, index) => entry !== wanted[index])
    ) {
      fail(`role lock root entries do not match publication stage ${stage}`);
    }
    if (mutationPolicy === "adopt-known-write") {
      this.#rootCtimeNs = after.rootCtimeNs;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    let rootFailure: unknown;
    try {
      await this.#rootHandle.close();
    } catch (error) {
      rootFailure = error;
    }
    try {
      await this.#parentHandle.close();
    } catch (error) {
      if (!rootFailure) rootFailure = error;
    }
    if (rootFailure) throw rootFailure;
  }
}

async function assertGitRevision(
  repositoryRoot: string,
  expectedRevision: string,
): Promise<void> {
  const stat = await fs.promises.lstat(repositoryRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail("repository root must be a real directory");
  }
  if ((await fs.promises.realpath(repositoryRoot)) !== repositoryRoot) {
    fail("repository root must not traverse symbolic links");
  }
  const { stdout: topLevel } = await execFile(
    "git",
    ["--no-optional-locks", "rev-parse", "--show-toplevel"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (topLevel.trim() !== repositoryRoot) {
    fail("repository root must be the exact Git worktree root");
  }
  const { stdout: revision } = await execFile(
    "git",
    ["--no-optional-locks", "rev-parse", "HEAD"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (revision.trim() !== expectedRevision) {
    fail("Git revision changed during role locking");
  }
  const { stdout: status } = await execFile(
    "git",
    ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=no"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (status !== "") fail("tracked Git tree must be clean during role locking");
}

/** Explicit non-production seam for CLI-check-to-core-mkdir race tests. */
export async function acquireAndReleaseFreshFloodgateRoleLockRootForTests(
  roleLockRoot: string,
): Promise<void> {
  const root = assertCanonicalAbsolutePath(roleLockRoot, "role lock root");
  const guard = await FloodgateRoleLockOutputRootGuard.acquireFresh(root);
  await guard.close();
}

/** Explicit non-production seam for held-handle rename/ABA tests. */
export async function runFreshFloodgateRoleLockRootGuardCoreForTests(
  roleLockRoot: string,
  mutate: (root: string) => Promise<void>,
): Promise<void> {
  if (typeof mutate !== "function") {
    fail("non-production root-guard mutation must be a function");
  }
  const root = assertCanonicalAbsolutePath(roleLockRoot, "role lock root");
  const guard = await FloodgateRoleLockOutputRootGuard.acquireFresh(root);
  let primaryFailed = false;
  try {
    await mutate(root);
    await guard.assertState("non-production ABA check", [], "stable");
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    try {
      await guard.close();
    } catch (closeError) {
      if (!primaryFailed) throw closeError;
    }
  }
}

interface PinnedLegacyInput {
  readonly identifiers: readonly string[];
  readonly text: string;
  readonly identity: FloodgateRoleLockManifest["legacy_protected_position_ids"];
}

async function readPinnedLegacyPositionIds(
  rawPath: string,
): Promise<Readonly<PinnedLegacyInput>> {
  const filePath = assertCanonicalAbsolutePath(
    rawPath,
    "legacy protected position IDs path",
  );
  const bytes = await readRegularFileNoFollow(filePath);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    return fail("legacy protected position IDs are not fatal-valid UTF-8");
  }
  if (
    text.length === 0 ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n") ||
    text.includes("\r") ||
    text.includes("\0") ||
    text.startsWith("\ufeff")
  ) {
    fail(
      "legacy protected position IDs must use exact single-final-LF framing",
    );
  }
  const identifiers = decodeLegacyPositionIds(text.slice(0, -1).split("\n"));
  if (
    identifiers.some(
      (value, index) => value !== text.slice(0, -1).split("\n")[index],
    )
  ) {
    fail("legacy protected position IDs must be UTF-8-bytewise sorted");
  }
  const identity = Object.freeze({
    path: "ml/data/wcsc36/int16-aware-replay-excluded-position-ids.txt",
    bytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
    count: identifiers.length,
    identifiers_sha256: floodgateIdentifierDigest(identifiers),
  });
  if (
    identity.bytes !== FLOODGATE_PINNED_LEGACY_REPLAY_EXCLUSION.bytes ||
    identity.sha256 !== FLOODGATE_PINNED_LEGACY_REPLAY_EXCLUSION.sha256 ||
    identity.count !== FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS.count ||
    identity.count !== FLOODGATE_PINNED_LEGACY_REPLAY_EXCLUSION.count ||
    identity.identifiers_sha256 !==
      FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS.identifiersSha256 ||
    identity.identifiers_sha256 !==
      FLOODGATE_PINNED_LEGACY_REPLAY_EXCLUSION.identifiers_sha256
  ) {
    fail("legacy protected position IDs do not match preregistration");
  }
  return Object.freeze({
    identifiers: Object.freeze(identifiers),
    text,
    identity,
  });
}

function artifactIdentity(
  artifactPath: string,
  contents: string,
): Readonly<FloodgateRoleLockArtifactIdentity> {
  return Object.freeze({
    path: artifactPath,
    bytes: Buffer.byteLength(contents, "utf8"),
    sha256: sha256Hex(contents),
  });
}

interface ManifestEvidence {
  readonly pipelineRevision: string;
  readonly rawManifest: Readonly<FloodgateRawLockManifest>;
  readonly rawManifestText: string;
  readonly legacy: Readonly<PinnedLegacyInput>;
  readonly core: Readonly<FloodgateRoleLockCoreResult>;
}

function expectedRoleLockManifest(
  evidence: ManifestEvidence,
): Readonly<FloodgateRoleLockManifest> {
  const { rawManifest, rawManifestText, legacy, core } = evidence;
  const materializedInputIdentity = artifactIdentity(
    FLOODGATE_ROLE_LOCK_MATERIALIZED_INPUT_FILENAME,
    core.artifact.input_canonical_json,
  );
  const allocationIdentity = artifactIdentity(
    FLOODGATE_ROLE_LOCK_ALLOCATION_FILENAME,
    core.artifact.canonical_json,
  );
  return Object.freeze({
    schema: FLOODGATE_ROLE_LOCK_SCHEMA,
    status: "complete-label-blind-role-lock",
    provenance: Object.freeze({
      raw_referential_closure_verified: true,
      raw_storage_tree_scanned: false,
      network_requests: 0,
      teacher_or_candidate_scores_read: false,
      existing_final_holdout_opened: false,
    }),
    pipeline: Object.freeze({
      source_revision: evidence.pipelineRevision,
      tracked_tree_clean: true as const,
    }),
    raw_lock: Object.freeze({
      schema: FLOODGATE_RAW_LOCK_SCHEMA,
      manifest: artifactIdentity("manifest.json", rawManifestText),
      source_revision: rawManifest.source.revision,
      canonical_games: rawManifest.summary.canonical_games,
      duplicate_groups: rawManifest.summary.duplicate_csa_groups,
      duplicate_aliases: rawManifest.summary.duplicate_csa_urls,
    }),
    source_filter: Object.freeze({
      event: FLOODGATE_EVENT,
      rating_group: 0 as const,
      minimum_cumulative_games: FLOODGATE_MINIMUM_CUMULATIVE_GAMES,
      minimum_embedded_game_time_rating: FLOODGATE_MINIMUM_EMBEDDED_GAME_RATING,
      distinct_full_identities: true as const,
      initial_position: "hirate" as const,
      initial_side: "sente" as const,
      terminal_allowlist: Object.freeze(["TORYO"] as const),
      duplicate_exact_csa_bytes: "keep-lowest-utf8-bytewise-url-only" as const,
      winner_opening_quality_or_score_filtering: false as const,
    }),
    allocation_contract: Object.freeze({
      seed: FLOODGATE_ALLOCATION_SEED,
      role_priority: FLOODGATE_ROLE_PRIORITY,
      role_game_counts: DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
      game_rank_domains: DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
      parent_rank_domains: DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
      parent_ply_inclusive: Object.freeze([
        FLOODGATE_PARENT_PLY_MIN,
        FLOODGATE_PARENT_PLY_MAX,
      ] as const),
      parents_per_game: FLOODGATE_PARENTS_PER_GAME,
      preferred_phase_quotas: FLOODGATE_PHASE_QUOTAS,
      identity_game_cap_ratio: FLOODGATE_ROLE_IDENTITY_GAME_CAP_RATIO,
      unordered_identity_pair_game_cap_ratio:
        FLOODGATE_ROLE_UNORDERED_PAIR_GAME_CAP_RATIO,
      cap_rounding: "floor-with-minimum-one" as const,
    }),
    legacy_protected_position_ids: legacy.identity,
    accounting: core.accounting,
    artifacts: Object.freeze({
      materialized_input: materializedInputIdentity,
      allocation: allocationIdentity,
    }),
    role_summaries: core.artifact.output.role_summaries,
    all_selected_game_ids_sha256:
      core.artifact.output.all_selected_game_ids_sha256,
    all_selected_parent_ids_sha256:
      core.artifact.output.all_selected_parent_ids_sha256,
    all_protected_position_ids_count:
      core.artifact.output.all_protected_position_ids_count,
    all_protected_position_ids_sha256:
      core.artifact.output.all_protected_position_ids_sha256,
  });
}

function validateRoleLockManifestCandidate(
  candidate: unknown,
  evidence: ManifestEvidence,
): Readonly<FloodgateRoleLockManifest> {
  const expected = expectedRoleLockManifest(evidence);
  if (!isDeepStrictEqual(candidate, expected)) {
    fail("role-lock manifest candidate does not match verified evidence");
  }
  const { rawManifest, core, legacy } = evidence;
  if (
    !REVISION_RE.test(evidence.pipelineRevision) ||
    core.accounting.indexed_csa_rows !== rawManifest.csa_index.length ||
    core.accounting.canonical_games !== rawManifest.summary.canonical_games ||
    core.accounting.duplicate_alias_rows_excluded !==
      rawManifest.summary.duplicate_csa_urls ||
    core.accounting.source_metadata_eligible_games +
      core.accounting.source_metadata_ineligible_games !==
      core.accounting.canonical_games ||
    core.accounting.fully_materialized_games +
      core.accounting.full_source_or_legality_rejections !==
      core.accounting.lazy_materialization_attempts
  ) {
    fail("role-lock accounting does not close over verified raw indexes");
  }
  if (
    legacy.identifiers.length !==
      FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS.count ||
    core.artifact.output.seed !== FLOODGATE_ALLOCATION_SEED ||
    !isDeepStrictEqual(
      core.artifact.output.game_rank_domains,
      DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
    ) ||
    !isDeepStrictEqual(
      core.artifact.output.parent_rank_domains,
      DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
    )
  ) {
    fail("role-lock allocation does not match immutable preregistration");
  }
  for (const role of FLOODGATE_ROLE_PRIORITY) {
    const summary = core.artifact.output.role_summaries[role];
    const requested = DEFAULT_FLOODGATE_ROLE_GAME_COUNTS[role];
    if (
      summary.requested_games !== requested ||
      summary.selected_games !== requested ||
      summary.selected_parents !== requested * FLOODGATE_PARENTS_PER_GAME ||
      summary.identity_game_cap !==
        Math.max(
          1,
          Math.floor(requested * FLOODGATE_ROLE_IDENTITY_GAME_CAP_RATIO),
        ) ||
      summary.unordered_identity_pair_game_cap !==
        Math.max(
          1,
          Math.floor(requested * FLOODGATE_ROLE_UNORDERED_PAIR_GAME_CAP_RATIO),
        )
    ) {
      fail(`${role} summary violates the immutable quota or diversity caps`);
    }
  }
  if (
    Buffer.byteLength(core.artifact.input_canonical_json, "utf8") !==
      core.artifact.input_canonical_json_bytes ||
    sha256Hex(core.artifact.input_canonical_json) !==
      core.artifact.input_canonical_json_sha256 ||
    Buffer.byteLength(core.artifact.canonical_json, "utf8") !==
      core.artifact.canonical_json_bytes ||
    sha256Hex(core.artifact.canonical_json) !==
      core.artifact.canonical_json_sha256 ||
    !isDeepStrictEqual(
      JSON.parse(core.artifact.canonical_json),
      core.artifact.output,
    )
  ) {
    fail("pure allocation artifact identity does not close");
  }
  return expected;
}

async function verifyPublishedText(
  filePath: string,
  expected: string,
): Promise<void> {
  const bytes = await readRegularFileNoFollow(filePath);
  if (
    bytes.byteLength !== Buffer.byteLength(expected, "utf8") ||
    sha256Hex(bytes) !== sha256Hex(expected)
  ) {
    fail(`published artifact does not match candidate: ${filePath}`);
  }
}

async function revalidateProductionSourceClosure(
  repositoryRoot: string,
  pipelineRevision: string,
  rawLockRoot: string,
  expectedRawManifestText: string,
  legacyPath: string,
  expectedLegacy: Readonly<PinnedLegacyInput>,
): Promise<void> {
  await assertGitRevision(repositoryRoot, pipelineRevision);
  const before = await readExistingFloodgateRawLockManifestFile(rawLockRoot);
  if (serializeFloodgateRawLockManifest(before) !== expectedRawManifestText) {
    fail("raw manifest changed during role locking");
  }
  await verifyFloodgateRawLockCandidate(rawLockRoot, before);
  const after = await readExistingFloodgateRawLockManifestFile(rawLockRoot);
  if (serializeFloodgateRawLockManifest(after) !== expectedRawManifestText) {
    fail("raw manifest changed during final referential verification");
  }
  const legacy = await readPinnedLegacyPositionIds(legacyPath);
  if (
    legacy.text !== expectedLegacy.text ||
    !isDeepStrictEqual(legacy.identity, expectedLegacy.identity)
  ) {
    fail("legacy protected IDs changed during role locking");
  }
  await assertGitRevision(repositoryRoot, pipelineRevision);
}

function assertRoleLockOutputCheckpoint(
  guard: FloodgateRoleLockOutputRootGuard,
  checkpoint: FloodgateRoleLockOutputCheckpoint,
): Promise<void> {
  const input = FLOODGATE_ROLE_LOCK_MATERIALIZED_INPUT_FILENAME;
  const allocation = FLOODGATE_ROLE_LOCK_ALLOCATION_FILENAME;
  const manifest = FLOODGATE_ROLE_LOCK_MANIFEST_FILENAME;
  if (checkpoint === "before-materialized-input-write") {
    return guard.assertState(checkpoint, [], "stable");
  }
  if (checkpoint === "after-materialized-input-write") {
    return guard.assertState(checkpoint, [input], "adopt-known-write");
  }
  if (checkpoint === "before-allocation-write") {
    return guard.assertState(checkpoint, [input], "stable");
  }
  if (checkpoint === "after-allocation-write") {
    return guard.assertState(
      checkpoint,
      [input, allocation],
      "adopt-known-write",
    );
  }
  if (checkpoint === "after-manifest-write") {
    return guard.assertState(
      checkpoint,
      [input, allocation, manifest],
      "adopt-known-write",
    );
  }
  if (
    checkpoint === "before-manifest-read" ||
    checkpoint === "after-manifest-read"
  ) {
    return guard.assertState(
      checkpoint,
      [input, allocation, manifest],
      "stable",
    );
  }
  return guard.assertState(checkpoint, [input, allocation], "stable");
}

/**
 * Explicit non-production seam that exercises the real held-handle publisher
 * while allowing one mutation exactly after final artifact verification.
 */
export async function runFreshFloodgateRoleLockOutputLifecycleCoreForTests(
  roleLockRoot: string,
  beforeManifestCheck: (root: string) => Promise<void>,
): Promise<void> {
  if (typeof beforeManifestCheck !== "function") {
    fail("non-production pre-manifest mutation must be a function");
  }
  const root = assertCanonicalAbsolutePath(roleLockRoot, "role lock root");
  const guard = await FloodgateRoleLockOutputRootGuard.acquireFresh(root);
  const inputPath = path.join(
    root,
    FLOODGATE_ROLE_LOCK_MATERIALIZED_INPUT_FILENAME,
  );
  const allocationPath = path.join(
    root,
    FLOODGATE_ROLE_LOCK_ALLOCATION_FILENAME,
  );
  const manifestPath = path.join(root, FLOODGATE_ROLE_LOCK_MANIFEST_FILENAME);
  const input = '{"fixture":"materialized-input"}';
  const allocation = '{"fixture":"allocation"}';
  const manifest = '{"fixture":"manifest"}\n';
  let primaryFailed = false;
  try {
    await runRoleLockPublishSequence({
      validateCandidate: () => undefined,
      assertOutputRoot: async (checkpoint) => {
        if (checkpoint === "before-manifest-write") {
          await beforeManifestCheck(root);
        }
        await assertRoleLockOutputCheckpoint(guard, checkpoint);
      },
      publishMaterializedInput: () => durableCreateNoClobber(inputPath, input),
      publishAllocation: () =>
        durableCreateNoClobber(allocationPath, allocation),
      verifyMaterializedInput: () => verifyPublishedText(inputPath, input),
      verifyAllocation: () => verifyPublishedText(allocationPath, allocation),
      revalidateSourceClosure: async () => undefined,
      publishManifest: () => durableCreateNoClobber(manifestPath, manifest),
      verifyManifest: () => verifyPublishedText(manifestPath, manifest),
    });
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    try {
      await guard.close();
    } catch (closeError) {
      if (!primaryFailed) throw closeError;
    }
  }
}

async function publishRoleLock(
  roleLockRoot: string,
  candidate: Readonly<FloodgateRoleLockManifest>,
  evidence: ManifestEvidence,
  assertPrepublish: () => Promise<void>,
): Promise<void> {
  const rootGuard =
    await FloodgateRoleLockOutputRootGuard.acquireFresh(roleLockRoot);
  const inputPath = path.join(
    roleLockRoot,
    FLOODGATE_ROLE_LOCK_MATERIALIZED_INPUT_FILENAME,
  );
  const allocationPath = path.join(
    roleLockRoot,
    FLOODGATE_ROLE_LOCK_ALLOCATION_FILENAME,
  );
  const manifestPath = path.join(
    roleLockRoot,
    FLOODGATE_ROLE_LOCK_MANIFEST_FILENAME,
  );
  const manifestText = `${canonicalJson(candidate)}\n`;
  let primaryFailed = false;
  try {
    await runRoleLockPublishSequence({
      validateCandidate: () => {
        validateRoleLockManifestCandidate(candidate, evidence);
      },
      assertOutputRoot: (checkpoint) =>
        assertRoleLockOutputCheckpoint(rootGuard, checkpoint),
      publishMaterializedInput: () =>
        durableCreateNoClobber(
          inputPath,
          evidence.core.artifact.input_canonical_json,
        ),
      publishAllocation: () =>
        durableCreateNoClobber(
          allocationPath,
          evidence.core.artifact.canonical_json,
        ),
      verifyMaterializedInput: () =>
        verifyPublishedText(
          inputPath,
          evidence.core.artifact.input_canonical_json,
        ),
      verifyAllocation: () =>
        verifyPublishedText(
          allocationPath,
          evidence.core.artifact.canonical_json,
        ),
      revalidateSourceClosure: assertPrepublish,
      publishManifest: () => durableCreateNoClobber(manifestPath, manifestText),
      verifyManifest: () => verifyPublishedText(manifestPath, manifestText),
    });
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    try {
      await rootGuard.close();
    } catch (closeError) {
      if (!primaryFailed) throw closeError;
    }
  }
}

function indexedGameFromManifestEntry(
  entry: Readonly<FloodgateRawCsaIndexEntry>,
): Readonly<FloodgateRoleLockIndexedGame> {
  return Object.freeze({
    url: entry.url,
    canonical_url: entry.canonical_url,
    game_id: entry.game_id,
    bytes: entry.bytes,
    sha256: entry.sha256,
    object: entry.object,
  });
}

function rawObjectIdentity(
  entry: Readonly<FloodgateRawReceiptIndexEntry>,
): Readonly<{ bytes: number; sha256: string; object: string }> {
  return Object.freeze({
    bytes: entry.bytes,
    sha256: entry.sha256,
    object: entry.object,
  });
}

function assertDisjointRoots(rawLockRoot: string, roleLockRoot: string): void {
  const roleWithinRaw = path.relative(rawLockRoot, roleLockRoot);
  const rawWithinRole = path.relative(roleLockRoot, rawLockRoot);
  const nested = (relative: string): boolean =>
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== "..");
  if (nested(roleWithinRaw) || nested(rawWithinRole)) {
    fail("raw-lock and role-lock roots must be disjoint directory trees");
  }
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256Hex(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

async function buildAuthenticatedRatingContext(
  rawLockRoot: string,
  manifest: Readonly<FloodgateRawLockManifest>,
) {
  const inputs = await mapWithLimit(
    manifest.daily_ratings,
    OFFLINE_METADATA_READ_CONCURRENCY,
    async (entry) => {
      const location = parseFloodgateDailyRatingUrl(entry.url);
      if (location.url !== entry.url) {
        fail("raw manifest daily rating URL is not canonical");
      }
      if (entry.status !== 200 && entry.status !== 404) {
        fail("raw manifest daily rating status is not 200 or 404");
      }
      const bytes = await verifyExistingFloodgateRawObject(
        rawLockRoot,
        rawObjectIdentity(entry),
      );
      return {
        url: entry.url,
        status: entry.status,
        body: Object.freeze({ bytes: entry.bytes, sha256: entry.sha256 }),
        bytes,
      } as const;
    },
  );
  return createFloodgateDailyRatingContextCache({ dailyRatings: inputs });
}

async function buildProductionRoleLockCore(
  rawLockRoot: string,
  rawManifest: Readonly<FloodgateRawLockManifest>,
  legacyProtectedPositionIds: readonly string[],
): Promise<Readonly<FloodgateRoleLockCoreResult>> {
  const ratingContext = await buildAuthenticatedRatingContext(
    rawLockRoot,
    rawManifest,
  );
  const rawEntryByUrl = new Map(
    rawManifest.csa_index.map((entry) => [entry.url, entry] as const),
  );
  if (rawEntryByUrl.size !== rawManifest.csa_index.length) {
    fail("verified raw CSA index repeats a URL");
  }
  const eligibleDecisionByUrl = new Map<
    string,
    FloodgateEligibleCsaRatingDecision
  >();
  const csaIndex = rawManifest.csa_index.map(indexedGameFromManifestEntry);

  return allocateFloodgateRoleLockCore({
    csaIndex,
    legacyProtectedPositionIds,
    roleGameCounts: DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
    inspect: async (game) => {
      const entry = rawEntryByUrl.get(game.url);
      if (!entry)
        fail(`canonical CSA URL is absent from raw index: ${game.url}`);
      const bytes = await verifyExistingFloodgateRawObject(
        rawLockRoot,
        rawObjectIdentity(entry),
      );
      const decision = decideFloodgateCsaRatingEligibility(ratingContext, {
        url: entry.url,
        body: Object.freeze({ bytes: entry.bytes, sha256: entry.sha256 }),
        bytes,
      });
      if (!decision.eligible) return null;
      eligibleDecisionByUrl.set(entry.url, decision);
      return decision.metadata.identities;
    },
    materialize: async (game) => {
      const entry = rawEntryByUrl.get(game.url);
      const decision = eligibleDecisionByUrl.get(game.url);
      if (!entry || !decision) {
        fail("lazy materialization lacks its authenticated source decision");
      }
      const bytes = await verifyExistingFloodgateRawObject(
        rawLockRoot,
        rawObjectIdentity(entry),
      );
      try {
        const parsed = parseFloodgateCsa(bytes, entry.url);
        if (
          parsed.event !== decision.csa.header.event ||
          parsed.startTime !== decision.csa.header.startTime ||
          parsed.players.sente !== decision.metadata.sente.visibleName ||
          parsed.players.gote !== decision.metadata.gote.visibleName ||
          parsed.terminal !== "TORYO"
        ) {
          return null;
        }
        const parents = parsed.moves
          .filter(
            (move) =>
              move.ply >= FLOODGATE_PARENT_PLY_MIN &&
              move.ply <= FLOODGATE_PARENT_PLY_MAX,
          )
          .map((move) => ({
            parent_id: parentOccurrenceId(game.game_id, move.ply),
            parent_sfen: move.parentSfen,
            ply: move.ply,
          }));
        if (parents.length < FLOODGATE_PARENTS_PER_GAME) return null;
        return {
          game_id: game.game_id,
          player_identities: [
            decision.metadata.identities[0],
            decision.metadata.identities[1],
          ] as const,
          parents,
        } satisfies FloodgatePureGameInput;
      } catch {
        return null;
      }
    },
  });
}

/**
 * Verify the raw acquisition lock offline, apply every preregistered source
 * and role rule, and durably publish a label-blind role lock. The final
 * `manifest.json` is written only after both canonical pure-core artifacts are
 * persisted, re-read, and the complete manifest candidate is revalidated.
 */
export async function createFloodgateRoleLock(
  optionsInput: CreateFloodgateRoleLockOptions,
): Promise<Readonly<FloodgateRoleLockManifest>> {
  const options = assertStrictPlainObject(
    optionsInput,
    "create role-lock options",
  );
  assertExactKeys(
    options,
    [
      "legacyProtectedPositionIdsPath",
      "pipelineRevision",
      "rawLockRoot",
      "repositoryRoot",
      "roleLockRoot",
    ],
    "create role-lock options",
  );
  const repositoryRoot = assertCanonicalAbsolutePath(
    options.repositoryRoot,
    "repository root",
  );
  const pipelineRevision = assertRevision(options.pipelineRevision);
  const rawLockRoot = assertCanonicalAbsolutePath(
    options.rawLockRoot,
    "raw lock root",
  );
  const roleLockRoot = assertCanonicalAbsolutePath(
    options.roleLockRoot,
    "role lock root",
  );
  const legacyPath = assertCanonicalAbsolutePath(
    options.legacyProtectedPositionIdsPath,
    "legacy protected position IDs path",
  );
  assertDisjointRoots(rawLockRoot, roleLockRoot);
  if (
    pathIsInsideOrEqual(repositoryRoot, rawLockRoot) ||
    pathIsInsideOrEqual(rawLockRoot, repositoryRoot) ||
    pathIsInsideOrEqual(repositoryRoot, roleLockRoot) ||
    pathIsInsideOrEqual(roleLockRoot, repositoryRoot)
  ) {
    fail("raw-lock and role-lock roots must be disjoint from the Git worktree");
  }
  const expectedLegacyPath = path.join(
    repositoryRoot,
    "ml/data/wcsc36/int16-aware-replay-excluded-position-ids.txt",
  );
  if (legacyPath !== expectedLegacyPath) {
    fail("legacy protected IDs path must be the preregistered repository file");
  }

  await assertGitRevision(repositoryRoot, pipelineRevision);
  const rawManifest =
    await readExistingFloodgateRawLockManifestFile(rawLockRoot);
  await verifyFloodgateRawLockCandidate(rawLockRoot, rawManifest);
  const rawManifestText = serializeFloodgateRawLockManifest(rawManifest);
  const legacy = await readPinnedLegacyPositionIds(legacyPath);
  const core = await buildProductionRoleLockCore(
    rawLockRoot,
    rawManifest,
    legacy.identifiers,
  );
  const evidence: ManifestEvidence = Object.freeze({
    pipelineRevision,
    rawManifest,
    rawManifestText,
    legacy,
    core,
  });
  const candidate = validateRoleLockManifestCandidate(
    expectedRoleLockManifest(evidence),
    evidence,
  );
  await publishRoleLock(roleLockRoot, candidate, evidence, () =>
    revalidateProductionSourceClosure(
      repositoryRoot,
      pipelineRevision,
      rawLockRoot,
      rawManifestText,
      legacyPath,
      legacy,
    ),
  );
  return candidate;
}
