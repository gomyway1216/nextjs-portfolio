/**
 * Complete offline referential-closure verification for the Floodgate raw
 * acquisition lock. Every manifest reference is re-read and reproduced, but
 * unrelated/unreferenced storage-tree artifacts are deliberately not claimed
 * absent. This module never performs a network request and never interprets
 * game results, eligibility, roles, teacher labels, or holdout data.
 */

import { isDeepStrictEqual } from "node:util";

import {
  FLOODGATE_RAW_LOCK_MAXIMUM_PARALLEL_REQUESTS,
  FLOODGATE_RAW_LOCK_MINIMUM_REQUEST_START_INTERVAL_MS,
  FLOODGATE_RAW_LOCK_PLAN_IDENTITY,
  FLOODGATE_RAW_LOCK_SCHEMA,
  FLOODGATE_RAW_LOCK_USER_AGENT,
  floodgateCanonicalUrlGameId,
  floodgateRawObjectPath,
  floodgateRawReceiptPath,
  floodgateRawSortedIndexSha256,
  readExistingFloodgateRawLockManifestFile,
  serializeFloodgateRawLockManifest,
  validateFloodgateRawLockManifest,
  validateFloodgateRawReceipt,
  verifyExistingFloodgateRawReceipt,
  type FloodgateRawCsaIndexEntry,
  type FloodgateRawDuplicateGroup,
  type FloodgateRawListingIndexEntry,
  type FloodgateRawLockManifest,
  type FloodgateRawPeriodInventoryEntry,
  type FloodgateRawReceipt,
  type FloodgateRawReceiptIndexEntry,
  type FloodgateRawReceiptKind,
} from "./floodgate-raw-lock";
import { verifyFloodgateRawReceiptsWithPinnedOrderedWorkers } from "./floodgate-raw-verification-worker-pool";
import type {
  FloodgateRawVerificationTaskInput,
  FloodgateRawVerificationTaskResult,
} from "./floodgate-raw-verification-worker-protocol";
import {
  FLOODGATE_ORIGIN,
  FLOODGATE_PERIOD_END_INVENTORY_URL,
  compareUtf8Bytes,
  parseFloodgateDailyArchiveEvidence,
  parseFloodgatePeriodEndInventoryEvidence,
  sha256Hex,
  type FloodgateBodyIdentity,
  type FloodgatePeriodEndInventoryCounts,
} from "./floodgate-source";

export const FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA =
  "shogi-floodgate-raw-offline-verification-v1" as const;

export interface FloodgateRawLockReconstructionInput {
  readonly source: FloodgateRawLockManifest["source"];
  readonly listing_urls: readonly string[];
  readonly daily_rating_urls: readonly string[];
  readonly csa_urls: readonly string[];
}

export interface FloodgateRawVerifierListingEvidence {
  readonly url: string;
  readonly body: FloodgateBodyIdentity;
  readonly all_official_csa_urls: readonly string[];
  readonly target_csa_urls: readonly string[];
}

export interface FloodgateRawVerifierPeriodInventoryEvidence {
  readonly url: string;
  readonly body: FloodgateBodyIdentity;
  readonly last_modified_at: string;
  readonly counts: FloodgatePeriodEndInventoryCounts;
}

export interface FloodgateRawOfflineVerificationReport {
  readonly schema: typeof FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA;
  readonly source_revision: string;
  readonly receipts: {
    readonly total: number;
    readonly listings: number;
    readonly daily_ratings: number;
    readonly period_inventory: 1;
    readonly csa: number;
  };
  readonly listing_reproduction: {
    readonly identity_bytes: number;
    readonly identity_sha256: string;
    readonly all_official_csa_urls: number;
    readonly all_official_csa_urls_sha256: string;
    readonly target_csa_urls: number;
    readonly target_csa_urls_sha256: string;
  };
  readonly period_inventory: {
    readonly body: FloodgateBodyIdentity;
    readonly last_modified_at: string;
    readonly counts: FloodgatePeriodEndInventoryCounts;
  };
  readonly csa_reproduction: {
    readonly responses: number;
    readonly canonical_games: number;
    readonly canonical_game_ids_sha256: string;
    readonly duplicate_groups: number;
    readonly duplicate_urls: number;
  };
  readonly object_counts: FloodgateRawLockManifest["object_counts"];
}

interface VerifiedFacts {
  readonly listings: readonly {
    readonly receipt: Readonly<FloodgateRawReceipt>;
    readonly evidence: FloodgateRawVerifierListingEvidence;
  }[];
  readonly dailyRatings: readonly Readonly<FloodgateRawReceipt>[];
  readonly periodInventory: {
    readonly receipt: Readonly<FloodgateRawReceipt>;
    readonly evidence: FloodgateRawVerifierPeriodInventoryEvidence;
  };
  readonly csa: readonly Readonly<FloodgateRawReceipt>[];
}

/**
 * Explicitly non-production fixture seam. Callers must supply receipts whose
 * CAS objects have already been verified. Production code must use one of the
 * filesystem-backed functions exported below.
 */
export interface NonProductionFloodgateRawVerifierFixtureInput {
  readonly candidate: Readonly<FloodgateRawLockManifest>;
  readonly facts: VerifiedFacts;
}

interface ReconstructionResult {
  readonly manifest: Readonly<FloodgateRawLockManifest>;
  readonly report: Readonly<FloodgateRawOfflineVerificationReport>;
}

interface CollectedReconstructionResult extends ReconstructionResult {
  readonly facts: VerifiedFacts;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate raw offline verification: ${message}`);
}

function frozen<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function sortedUnique(values: readonly string[], label: string): string[] {
  const sorted = [...values].sort(compareUtf8Bytes);
  for (let index = 1; index < sorted.length; index += 1) {
    if (compareUtf8Bytes(sorted[index - 1], sorted[index]) >= 0) {
      fail(`${label} must contain unique UTF-8-bytewise values`);
    }
  }
  return sorted;
}

function assertSameStrings(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    fail(`${label} does not match`);
  }
}

function baseIndex(
  receipt: Readonly<FloodgateRawReceipt>,
): FloodgateRawReceiptIndexEntry {
  return {
    url: receipt.url,
    receipt: floodgateRawReceiptPath(receipt.url),
    status: receipt.response.status,
    bytes: receipt.response.bytes,
    sha256: receipt.response.sha256,
    object: receipt.object,
  };
}

function statusPolicy(
  manifest: Readonly<FloodgateRawLockManifest>,
  kind: FloodgateRawReceiptKind,
): readonly number[] {
  if (kind === "daily_listing") {
    return manifest.acquisition_policy.status_policy.listing;
  }
  if (kind === "daily_rating") {
    return manifest.acquisition_policy.status_policy.daily_rating;
  }
  if (kind === "period_end_inventory") {
    return manifest.acquisition_policy.status_policy.period_inventory;
  }
  return manifest.acquisition_policy.status_policy.csa;
}

function assertReceiptPolicy(
  manifest: Readonly<FloodgateRawLockManifest>,
  receiptInput: Readonly<FloodgateRawReceipt>,
): Readonly<FloodgateRawReceipt> {
  const receipt = validateFloodgateRawReceipt(receiptInput);
  const policy = manifest.acquisition_policy;
  if (
    receipt.request.accept_encoding !==
      policy.request_headers.accept_encoding ||
    receipt.request.user_agent !== policy.request_headers.user_agent ||
    receipt.request.redirect !== "manual" ||
    policy.redirects !== "reject" ||
    !statusPolicy(manifest, receipt.kind).includes(receipt.response.status)
  ) {
    fail(
      `receipt request/status policy does not match manifest for ${receipt.url}`,
    );
  }
  const encoding =
    receipt.response.content_encoding === null ? "absent" : "identity";
  if (!policy.response_content_encoding.includes(encoding)) {
    fail(`receipt content encoding does not match manifest for ${receipt.url}`);
  }
  return receipt;
}

function assertEntryMatchesReceipt(
  entry: Readonly<FloodgateRawReceiptIndexEntry>,
  receipt: Readonly<FloodgateRawReceipt>,
  expectedKind: FloodgateRawReceiptKind,
): void {
  if (
    receipt.kind !== expectedKind ||
    receipt.url !== entry.url ||
    receipt.response.url !== entry.url ||
    entry.receipt !== floodgateRawReceiptPath(entry.url) ||
    receipt.response.status !== entry.status ||
    receipt.response.bytes !== entry.bytes ||
    receipt.response.sha256 !== entry.sha256 ||
    receipt.object !== entry.object ||
    entry.object !== floodgateRawObjectPath(entry.sha256)
  ) {
    fail(`manifest entry does not match verified receipt for ${entry.url}`);
  }
}

function assertFactsMatchCandidate(
  candidate: Readonly<FloodgateRawLockManifest>,
  facts: VerifiedFacts,
): void {
  const listings = [...facts.listings].sort((left, right) =>
    compareUtf8Bytes(left.receipt.url, right.receipt.url),
  );
  const dailyRatings = [...facts.dailyRatings].sort((left, right) =>
    compareUtf8Bytes(left.url, right.url),
  );
  const csa = [...facts.csa].sort((left, right) =>
    compareUtf8Bytes(left.url, right.url),
  );
  if (
    listings.length !== candidate.listings.length ||
    dailyRatings.length !== candidate.daily_ratings.length ||
    csa.length !== candidate.csa_index.length
  ) {
    fail("candidate index lengths do not match verified receipt facts");
  }
  for (let index = 0; index < listings.length; index += 1) {
    assertEntryMatchesReceipt(
      candidate.listings[index],
      listings[index].receipt,
      "daily_listing",
    );
  }
  for (let index = 0; index < dailyRatings.length; index += 1) {
    assertEntryMatchesReceipt(
      candidate.daily_ratings[index],
      dailyRatings[index],
      "daily_rating",
    );
  }
  assertEntryMatchesReceipt(
    candidate.period_inventory,
    facts.periodInventory.receipt,
    "period_end_inventory",
  );
  for (let index = 0; index < csa.length; index += 1) {
    assertEntryMatchesReceipt(candidate.csa_index[index], csa[index], "csa");
  }
}

function acquisitionPolicy(): FloodgateRawLockManifest["acquisition_policy"] {
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

function listingIdentity(
  listings: readonly FloodgateRawListingIndexEntry[],
): Readonly<{ bytes: number; sha256: string }> {
  const text = `${listings
    .map((entry) => `${entry.url}\t${entry.bytes}\t${entry.sha256}`)
    .join("\n")}\n`;
  return frozen({
    bytes: new TextEncoder().encode(text).byteLength,
    sha256: sha256Hex(text),
  });
}

function uniqueDigestCount(
  values: readonly { readonly sha256: string }[],
): number {
  return new Set(values.map((value) => value.sha256)).size;
}

function reconstructFromFacts(
  source: FloodgateRawLockManifest["source"],
  factsInput: VerifiedFacts,
): ReconstructionResult {
  const policy = acquisitionPolicy();
  const policyManifest = {
    acquisition_policy: policy,
  } as Readonly<FloodgateRawLockManifest>;

  const listingFacts = [...factsInput.listings].sort((left, right) =>
    compareUtf8Bytes(left.receipt.url, right.receipt.url),
  );
  const dailyRatingReceipts = [...factsInput.dailyRatings].sort((left, right) =>
    compareUtf8Bytes(left.url, right.url),
  );
  const csaReceipts = [...factsInput.csa].sort((left, right) =>
    compareUtf8Bytes(left.url, right.url),
  );

  const listings: FloodgateRawListingIndexEntry[] = [];
  const allOfficialUnion: string[] = [];
  const targetUnion: string[] = [];
  for (const fact of listingFacts) {
    const receipt = assertReceiptPolicy(policyManifest, fact.receipt);
    if (receipt.kind !== "daily_listing") {
      fail(`listing fact has wrong receipt kind for ${receipt.url}`);
    }
    if (
      fact.evidence.url !== receipt.url ||
      fact.evidence.body.bytes !== receipt.response.bytes ||
      fact.evidence.body.sha256 !== receipt.response.sha256
    ) {
      fail(`listing body evidence does not match receipt for ${receipt.url}`);
    }
    const allUrls = sortedUnique(
      fact.evidence.all_official_csa_urls,
      `all official CSA URLs for ${receipt.url}`,
    );
    const targetUrls = sortedUnique(
      fact.evidence.target_csa_urls,
      `target CSA URLs for ${receipt.url}`,
    );
    const allSet = new Set(allUrls);
    if (targetUrls.some((url) => !allSet.has(url))) {
      fail(
        `target CSA URLs are not a subset of all official URLs for ${receipt.url}`,
      );
    }
    allOfficialUnion.push(...allUrls);
    targetUnion.push(...targetUrls);
    listings.push({
      ...baseIndex(receipt),
      all_official_csa_urls: allUrls.length,
      all_official_csa_urls_sha256: floodgateRawSortedIndexSha256(allUrls),
      target_csa_urls: targetUrls.length,
      target_csa_urls_sha256: floodgateRawSortedIndexSha256(targetUrls),
    });
  }
  const sortedAllOfficialUnion = sortedUnique(
    allOfficialUnion,
    "all official CSA URL union",
  );
  const sortedTargetUnion = sortedUnique(targetUnion, "target CSA URL union");

  const dailyRatings = dailyRatingReceipts.map((receiptInput) => {
    const receipt = assertReceiptPolicy(policyManifest, receiptInput);
    if (receipt.kind !== "daily_rating") {
      fail(`daily rating fact has wrong receipt kind for ${receipt.url}`);
    }
    return baseIndex(receipt);
  });

  const periodReceipt = assertReceiptPolicy(
    policyManifest,
    factsInput.periodInventory.receipt,
  );
  const periodEvidence = factsInput.periodInventory.evidence;
  if (
    periodReceipt.kind !== "period_end_inventory" ||
    periodEvidence.url !== periodReceipt.url ||
    periodEvidence.body.bytes !== periodReceipt.response.bytes ||
    periodEvidence.body.sha256 !== periodReceipt.response.sha256
  ) {
    fail("period inventory evidence does not match its verified receipt");
  }
  const periodInventory: FloodgateRawPeriodInventoryEntry = {
    ...baseIndex(periodReceipt),
    last_modified_at: periodEvidence.last_modified_at,
    counts: {
      rating_rows: periodEvidence.counts.ratingRows,
      group_zero_identities: periodEvidence.counts.groupZeroIdentities,
      identities_at_least_3600_and_30_games:
        periodEvidence.counts.identitiesAtLeast3600And30Games,
    },
  };

  const csaBase = csaReceipts.map((receiptInput) => {
    const receipt = assertReceiptPolicy(policyManifest, receiptInput);
    if (receipt.kind !== "csa") {
      fail(`CSA fact has wrong receipt kind for ${receipt.url}`);
    }
    return baseIndex(receipt);
  });
  assertSameStrings(
    csaBase.map((entry) => entry.url),
    sortedTargetUnion,
    "listing-derived target CSA union",
  );

  const byDigest = new Map<string, FloodgateRawReceiptIndexEntry[]>();
  for (const entry of csaBase) {
    const group = byDigest.get(entry.sha256) ?? [];
    if (group.some((candidate) => candidate.bytes !== entry.bytes)) {
      fail("one CSA digest is paired with conflicting byte counts");
    }
    group.push(entry);
    byDigest.set(entry.sha256, group);
  }
  const canonicalByDigest = new Map<
    string,
    Readonly<{ canonicalUrl: string; gameId: string }>
  >();
  const duplicateGroups: FloodgateRawDuplicateGroup[] = [];
  const canonicalGameIds: string[] = [];
  for (const [digest, group] of byDigest) {
    const urls = group.map((entry) => entry.url).sort(compareUtf8Bytes);
    const canonicalUrl = urls[0];
    const gameId = floodgateCanonicalUrlGameId(canonicalUrl);
    canonicalByDigest.set(digest, { canonicalUrl, gameId });
    canonicalGameIds.push(gameId);
    if (urls.length > 1) {
      duplicateGroups.push({
        sha256: digest,
        bytes: group[0].bytes,
        canonical_url: canonicalUrl,
        urls,
      });
    }
  }
  duplicateGroups.sort((left, right) =>
    compareUtf8Bytes(left.canonical_url, right.canonical_url),
  );
  const csaIndex: FloodgateRawCsaIndexEntry[] = csaBase.map((entry) => {
    const canonical = canonicalByDigest.get(entry.sha256);
    if (!canonical) fail(`lost CSA digest group for ${entry.url}`);
    return {
      ...entry,
      canonical_url: canonical.canonicalUrl,
      game_id: canonical.gameId,
    };
  });

  const identity = listingIdentity(listings);
  const allObjects = [
    ...listings,
    ...dailyRatings,
    periodInventory,
    ...csaIndex,
  ];
  const objectCounts: FloodgateRawLockManifest["object_counts"] = {
    unique_total: uniqueDigestCount(allObjects),
    unique_listings: uniqueDigestCount(listings),
    unique_daily_ratings: uniqueDigestCount(dailyRatings),
    unique_period_inventory: 1,
    unique_csa: uniqueDigestCount(csaIndex),
  };
  const duplicateUrls = duplicateGroups.reduce(
    (total, group) => total + group.urls.length - 1,
    0,
  );
  const summary: FloodgateRawLockManifest["summary"] = {
    listing_responses: listings.length,
    listing_bytes: listings.reduce((total, entry) => total + entry.bytes, 0),
    listing_urls_sha256: floodgateRawSortedIndexSha256(
      listings.map((entry) => entry.url),
    ),
    all_official_csa_urls: sortedAllOfficialUnion.length,
    target_csa_urls: sortedTargetUnion.length,
    daily_rating_responses: dailyRatings.length,
    daily_rating_http_200: dailyRatings.filter((entry) => entry.status === 200)
      .length,
    daily_rating_http_404: dailyRatings.filter((entry) => entry.status === 404)
      .length,
    rating_urls_sha256: floodgateRawSortedIndexSha256(
      dailyRatings.map((entry) => entry.url),
    ),
    period_inventory_responses: 1,
    csa_responses: csaIndex.length,
    csa_urls_sha256: floodgateRawSortedIndexSha256(
      csaIndex.map((entry) => entry.url),
    ),
    canonical_games: byDigest.size,
    canonical_game_ids_sha256: floodgateRawSortedIndexSha256(canonicalGameIds),
    duplicate_csa_groups: duplicateGroups.length,
    duplicate_csa_urls: duplicateUrls,
  };

  const manifest: Readonly<FloodgateRawLockManifest> = frozen({
    schema: FLOODGATE_RAW_LOCK_SCHEMA,
    plan: FLOODGATE_RAW_LOCK_PLAN_IDENTITY,
    source,
    acquisition_policy: policy,
    summary,
    listing_identity_manifest: identity,
    listings: frozen(listings),
    daily_ratings: frozen(dailyRatings),
    period_inventory: periodInventory,
    csa_index: frozen(csaIndex),
    duplicate_groups: frozen(duplicateGroups),
    object_counts: objectCounts,
  });
  const report: Readonly<FloodgateRawOfflineVerificationReport> = frozen({
    schema: FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA,
    source_revision: source.revision,
    receipts: frozen({
      total: listings.length + dailyRatings.length + 1 + csaIndex.length,
      listings: listings.length,
      daily_ratings: dailyRatings.length,
      period_inventory: 1 as const,
      csa: csaIndex.length,
    }),
    listing_reproduction: frozen({
      identity_bytes: identity.bytes,
      identity_sha256: identity.sha256,
      all_official_csa_urls: sortedAllOfficialUnion.length,
      all_official_csa_urls_sha256: floodgateRawSortedIndexSha256(
        sortedAllOfficialUnion,
      ),
      target_csa_urls: sortedTargetUnion.length,
      target_csa_urls_sha256: floodgateRawSortedIndexSha256(sortedTargetUnion),
    }),
    period_inventory: frozen({
      body: frozen({ ...periodEvidence.body }),
      last_modified_at: periodEvidence.last_modified_at,
      counts: frozen({ ...periodEvidence.counts }),
    }),
    csa_reproduction: frozen({
      responses: csaIndex.length,
      canonical_games: byDigest.size,
      canonical_game_ids_sha256: summary.canonical_game_ids_sha256,
      duplicate_groups: duplicateGroups.length,
      duplicate_urls: duplicateUrls,
    }),
    object_counts: frozen({ ...objectCounts }),
  });
  return { manifest, report };
}

async function collectVerifiedFacts(
  lockRoot: string,
  input: FloodgateRawLockReconstructionInput,
): Promise<VerifiedFacts> {
  const listingUrls = sortedUnique(input.listing_urls, "listing URLs");
  const dailyRatingUrls = sortedUnique(
    input.daily_rating_urls,
    "daily rating URLs",
  );
  const csaUrls = sortedUnique(input.csa_urls, "CSA URLs");

  const listings: Array<VerifiedFacts["listings"][number]> = [];
  for (const url of listingUrls) {
    const verified = await verifyExistingFloodgateRawReceipt(
      lockRoot,
      url,
      "daily_listing",
    );
    const evidence = parseFloodgateDailyArchiveEvidence({
      listingUrl: url,
      listingBytes: verified.bytes,
    });
    listings.push({
      receipt: verified.receipt,
      evidence: {
        url: evidence.listing.location.url,
        body: evidence.listing.body,
        all_official_csa_urls: evidence.allOfficialCsaLocations.map(
          (location) => location.url,
        ),
        target_csa_urls: evidence.targetCsaLocations.map(
          (location) => location.url,
        ),
      },
    });
  }

  const dailyRatings: Readonly<FloodgateRawReceipt>[] = [];
  for (const url of dailyRatingUrls) {
    const verified = await verifyExistingFloodgateRawReceipt(
      lockRoot,
      url,
      "daily_rating",
    );
    dailyRatings.push(verified.receipt);
  }

  const verifiedPeriod = await verifyExistingFloodgateRawReceipt(
    lockRoot,
    FLOODGATE_PERIOD_END_INVENTORY_URL,
    "period_end_inventory",
  );
  const periodEvidence = parseFloodgatePeriodEndInventoryEvidence({
    ratingUrl: FLOODGATE_PERIOD_END_INVENTORY_URL,
    ratingBytes: verifiedPeriod.bytes,
  });

  const csa: Readonly<FloodgateRawReceipt>[] = [];
  for (const url of csaUrls) {
    const verified = await verifyExistingFloodgateRawReceipt(
      lockRoot,
      url,
      "csa",
    );
    csa.push(verified.receipt);
  }

  return {
    listings,
    dailyRatings,
    periodInventory: {
      receipt: verifiedPeriod.receipt,
      evidence: {
        url: periodEvidence.snapshot.url,
        body: periodEvidence.snapshot.body,
        last_modified_at: periodEvidence.snapshot.lastModifiedAt,
        counts: periodEvidence.snapshot.counts,
      },
    },
    csa,
  };
}

function resultKind<
  K extends FloodgateRawVerificationTaskResult["receipt_kind"],
>(
  result: FloodgateRawVerificationTaskResult,
  expected: K,
  ordinal: number,
): Extract<FloodgateRawVerificationTaskResult, { receipt_kind: K }> {
  if (result.receipt_kind !== expected) {
    fail(`parallel result ${ordinal} has the wrong receipt kind`);
  }
  return result as Extract<
    FloodgateRawVerificationTaskResult,
    { receipt_kind: K }
  >;
}

async function collectVerifiedFactsWithPinnedWorkers(
  lockRoot: string,
  input: FloodgateRawLockReconstructionInput,
): Promise<VerifiedFacts> {
  const listingUrls = sortedUnique(input.listing_urls, "listing URLs");
  const dailyRatingUrls = sortedUnique(
    input.daily_rating_urls,
    "daily rating URLs",
  );
  const csaUrls = sortedUnique(input.csa_urls, "CSA URLs");
  const tasks: FloodgateRawVerificationTaskInput[] = [
    ...listingUrls.map((url) => ({
      receipt_kind: "daily_listing" as const,
      url,
    })),
    ...dailyRatingUrls.map((url) => ({
      receipt_kind: "daily_rating" as const,
      url,
    })),
    {
      receipt_kind: "period_end_inventory" as const,
      url: FLOODGATE_PERIOD_END_INVENTORY_URL,
    },
    ...csaUrls.map((url) => ({ receipt_kind: "csa" as const, url })),
  ];
  const results = await verifyFloodgateRawReceiptsWithPinnedOrderedWorkers(
    lockRoot,
    tasks,
  );
  if (results.length !== tasks.length) {
    fail("parallel raw verification did not return every result");
  }

  let cursor = 0;
  const listings = listingUrls.map(() => {
    const result = resultKind(results[cursor], "daily_listing", cursor);
    cursor += 1;
    return Object.freeze({
      receipt: result.receipt,
      evidence: result.evidence,
    });
  });
  const dailyRatings = dailyRatingUrls.map(() => {
    const result = resultKind(results[cursor], "daily_rating", cursor);
    cursor += 1;
    return result.receipt;
  });
  const period = resultKind(results[cursor], "period_end_inventory", cursor);
  cursor += 1;
  const csa = csaUrls.map(() => {
    const result = resultKind(results[cursor], "csa", cursor);
    cursor += 1;
    return result.receipt;
  });
  if (cursor !== results.length) {
    fail("parallel raw verification returned trailing results");
  }
  return Object.freeze({
    listings: Object.freeze(listings),
    dailyRatings: Object.freeze(dailyRatings),
    periodInventory: Object.freeze({
      receipt: period.receipt,
      evidence: period.evidence,
    }),
    csa: Object.freeze(csa),
  });
}

async function reconstructWithReport(
  lockRoot: string,
  input: FloodgateRawLockReconstructionInput,
): Promise<CollectedReconstructionResult> {
  const facts = await collectVerifiedFacts(lockRoot, input);
  const reconstructed = reconstructFromFacts(input.source, facts);
  const manifest = validateFloodgateRawLockManifest(reconstructed.manifest);
  return { manifest, report: reconstructed.report, facts };
}

async function reconstructWithPinnedWorkerReport(
  lockRoot: string,
  input: FloodgateRawLockReconstructionInput,
): Promise<CollectedReconstructionResult> {
  const facts = await collectVerifiedFactsWithPinnedWorkers(lockRoot, input);
  const reconstructed = reconstructFromFacts(input.source, facts);
  const manifest = validateFloodgateRawLockManifest(reconstructed.manifest);
  return { manifest, report: reconstructed.report, facts };
}

/** Reconstruct the production manifest only from verified offline artifacts. */
export async function reconstructFloodgateRawLockManifest(
  lockRoot: string,
  input: FloodgateRawLockReconstructionInput,
): Promise<Readonly<FloodgateRawLockManifest>> {
  return (await reconstructWithReport(lockRoot, input)).manifest;
}

/** Verify a candidate manifest against every referenced receipt and object. */
export async function verifyFloodgateRawLockCandidate(
  lockRoot: string,
  manifestInput: unknown,
): Promise<Readonly<FloodgateRawOfflineVerificationReport>> {
  const candidate = validateFloodgateRawLockManifest(manifestInput);
  const reconstructed = await reconstructWithReport(lockRoot, {
    source: candidate.source,
    listing_urls: candidate.listings.map((entry) => entry.url),
    daily_rating_urls: candidate.daily_ratings.map((entry) => entry.url),
    csa_urls: candidate.csa_index.map((entry) => entry.url),
  });
  assertFactsMatchCandidate(candidate, reconstructed.facts);
  if (
    serializeFloodgateRawLockManifest(reconstructed.manifest) !==
    serializeFloodgateRawLockManifest(candidate)
  ) {
    fail("candidate manifest does not reproduce verified offline artifacts");
  }
  return reconstructed.report;
}

/**
 * Production authentication route. It is byte- and failure-order-equivalent
 * to `verifyFloodgateRawLockCandidate`, but its independent receipt reads use
 * the fixed twelve-worker source-closed pool.
 */
export async function verifyFloodgateRawLockCandidateWithPinnedWorkers(
  lockRoot: string,
  manifestInput: unknown,
): Promise<Readonly<FloodgateRawOfflineVerificationReport>> {
  const candidate = validateFloodgateRawLockManifest(manifestInput);
  const reconstructed = await reconstructWithPinnedWorkerReport(lockRoot, {
    source: candidate.source,
    listing_urls: candidate.listings.map((entry) => entry.url),
    daily_rating_urls: candidate.daily_ratings.map((entry) => entry.url),
    csa_urls: candidate.csa_index.map((entry) => entry.url),
  });
  assertFactsMatchCandidate(candidate, reconstructed.facts);
  if (
    serializeFloodgateRawLockManifest(reconstructed.manifest) !==
    serializeFloodgateRawLockManifest(candidate)
  ) {
    fail("candidate manifest does not reproduce verified offline artifacts");
  }
  return reconstructed.report;
}

/** Read the final manifest and verify its complete closure without networking. */
export async function verifyExistingFloodgateRawLock(
  lockRoot: string,
): Promise<Readonly<FloodgateRawOfflineVerificationReport>> {
  const manifest = await readExistingFloodgateRawLockManifestFile(lockRoot);
  return verifyFloodgateRawLockCandidate(lockRoot, manifest);
}

/** Pure small-fixture seam; never use as a production verification entrypoint. */
export function verifyFloodgateRawLockCandidateCoreForTests(
  input: NonProductionFloodgateRawVerifierFixtureInput,
): Readonly<FloodgateRawOfflineVerificationReport> {
  assertFactsMatchCandidate(input.candidate, input.facts);
  const reconstructed = reconstructFromFacts(
    input.candidate.source,
    input.facts,
  );
  if (!isDeepStrictEqual(reconstructed.manifest, input.candidate)) {
    fail("non-production candidate does not reproduce supplied fixture facts");
  }
  return reconstructed.report;
}
