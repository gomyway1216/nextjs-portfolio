import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_RAW_LOCK_MAXIMUM_PARALLEL_REQUESTS,
  FLOODGATE_RAW_LOCK_MINIMUM_REQUEST_START_INTERVAL_MS,
  FLOODGATE_RAW_LOCK_PLAN_IDENTITY,
  FLOODGATE_RAW_LOCK_SCHEMA,
  FLOODGATE_RAW_LOCK_USER_AGENT,
  FLOODGATE_RAW_RECEIPT_SCHEMA,
  floodgateCanonicalUrlGameId,
  floodgateRawObjectPath,
  floodgateRawReceiptPath,
  floodgateRawSortedIndexSha256,
  floodgateRawUrlSha256,
  type FloodgateRawLockManifest,
  type FloodgateRawReceipt,
  type FloodgateRawReceiptKind,
} from "../../../ml/floodgate-raw-lock";
import {
  FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA,
  verifyFloodgateRawLockCandidateCoreForTests,
  type NonProductionFloodgateRawVerifierFixtureInput,
} from "../../../ml/floodgate-raw-lock-verifier";
import {
  FLOODGATE_ORIGIN,
  FLOODGATE_PERIOD_END_INVENTORY_URL,
} from "../../../ml/floodgate-source";

const LISTING_URL = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/";
const RATING_URL =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260101.html";
const CSA_A =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+Alpha+Beta+20260101010203.csa";
const CSA_B =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+Gamma+Delta+20260101010204.csa";
const SOURCE_REVISION = "0123456789abcdef0123456789abcdef01234567";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function receipt(
  kind: FloodgateRawReceiptKind,
  url: string,
  body: string,
  status = 200,
): FloodgateRawReceipt {
  const digest = sha256(body);
  return {
    schema: FLOODGATE_RAW_RECEIPT_SCHEMA,
    kind,
    url,
    url_sha256: floodgateRawUrlSha256(url),
    request: {
      accept_encoding: "identity",
      redirect: "manual",
      user_agent: FLOODGATE_RAW_LOCK_USER_AGENT,
    },
    response: {
      url,
      status,
      content_encoding: null,
      bytes: Buffer.byteLength(body),
      sha256: digest,
    },
    object: floodgateRawObjectPath(digest),
  };
}

function index(received: FloodgateRawReceipt) {
  return {
    url: received.url,
    receipt: floodgateRawReceiptPath(received.url),
    status: received.response.status,
    bytes: received.response.bytes,
    sha256: received.response.sha256,
    object: received.object,
  };
}

function policy(): FloodgateRawLockManifest["acquisition_policy"] {
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

function fixture(): NonProductionFloodgateRawVerifierFixtureInput {
  const listing = receipt("daily_listing", LISTING_URL, "listing fixture");
  const rating = receipt("daily_rating", RATING_URL, "missing", 404);
  const period = receipt(
    "period_end_inventory",
    FLOODGATE_PERIOD_END_INVENTORY_URL,
    "period fixture",
  );
  const csaBody = "same exact CSA bytes";
  const firstCsa = receipt("csa", CSA_A, csaBody);
  const secondCsa = receipt("csa", CSA_B, csaBody);
  const csaUrls = [CSA_A, CSA_B];
  const canonicalUrl = CSA_A;
  const gameId = floodgateCanonicalUrlGameId(canonicalUrl);
  const listingIndex = {
    ...index(listing),
    all_official_csa_urls: 2,
    all_official_csa_urls_sha256: floodgateRawSortedIndexSha256(csaUrls),
    target_csa_urls: 2,
    target_csa_urls_sha256: floodgateRawSortedIndexSha256(csaUrls),
  };
  const ratingIndex = index(rating);
  const periodIndex = {
    ...index(period),
    last_modified_at: "2026-03-31 23:54:26 +0900",
    counts: {
      rating_rows: 2,
      group_zero_identities: 1,
      identities_at_least_3600_and_30_games: 1,
    },
  };
  const csaIndex = [firstCsa, secondCsa].map((value) => ({
    ...index(value),
    canonical_url: canonicalUrl,
    game_id: gameId,
  }));
  const listingIdentityText = `${listing.url}\t${listing.response.bytes}\t${listing.response.sha256}\n`;
  const candidate: FloodgateRawLockManifest = {
    schema: FLOODGATE_RAW_LOCK_SCHEMA,
    plan: FLOODGATE_RAW_LOCK_PLAN_IDENTITY,
    source: {
      revision: SOURCE_REVISION,
      tracked_tree_clean: true,
    },
    acquisition_policy: policy(),
    summary: {
      listing_responses: 1,
      listing_bytes: listing.response.bytes,
      listing_urls_sha256: floodgateRawSortedIndexSha256([LISTING_URL]),
      all_official_csa_urls: 2,
      target_csa_urls: 2,
      daily_rating_responses: 1,
      daily_rating_http_200: 0,
      daily_rating_http_404: 1,
      rating_urls_sha256: floodgateRawSortedIndexSha256([RATING_URL]),
      period_inventory_responses: 1,
      csa_responses: 2,
      csa_urls_sha256: floodgateRawSortedIndexSha256(csaUrls),
      canonical_games: 1,
      canonical_game_ids_sha256: floodgateRawSortedIndexSha256([gameId]),
      duplicate_csa_groups: 1,
      duplicate_csa_urls: 1,
    },
    listing_identity_manifest: {
      bytes: Buffer.byteLength(listingIdentityText),
      sha256: sha256(listingIdentityText),
    },
    listings: [listingIndex],
    daily_ratings: [ratingIndex],
    period_inventory: periodIndex,
    csa_index: csaIndex,
    duplicate_groups: [
      {
        sha256: firstCsa.response.sha256,
        bytes: firstCsa.response.bytes,
        canonical_url: canonicalUrl,
        urls: csaUrls,
      },
    ],
    object_counts: {
      unique_total: 4,
      unique_listings: 1,
      unique_daily_ratings: 1,
      unique_period_inventory: 1,
      unique_csa: 1,
    },
  };
  return {
    candidate,
    facts: {
      listings: [
        {
          receipt: listing,
          evidence: {
            url: LISTING_URL,
            body: {
              bytes: listing.response.bytes,
              sha256: listing.response.sha256,
            },
            all_official_csa_urls: csaUrls,
            target_csa_urls: csaUrls,
          },
        },
      ],
      dailyRatings: [rating],
      periodInventory: {
        receipt: period,
        evidence: {
          url: FLOODGATE_PERIOD_END_INVENTORY_URL,
          body: {
            bytes: period.response.bytes,
            sha256: period.response.sha256,
          },
          last_modified_at: "2026-03-31 23:54:26 +0900",
          counts: {
            ratingRows: 2,
            groupZeroIdentities: 1,
            identitiesAtLeast3600And30Games: 1,
          },
        },
      },
      csa: [firstCsa, secondCsa],
    },
  };
}

describe("Floodgate raw-lock offline verifier core", () => {
  it("reconstructs receipt closure, listing unions, inventory, duplicates, and objects", () => {
    const report = verifyFloodgateRawLockCandidateCoreForTests(fixture());
    expect(report).toEqual({
      schema: FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA,
      source_revision: SOURCE_REVISION,
      receipts: {
        total: 5,
        listings: 1,
        daily_ratings: 1,
        period_inventory: 1,
        csa: 2,
      },
      listing_reproduction: {
        identity_bytes: expect.any(Number),
        identity_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        all_official_csa_urls: 2,
        all_official_csa_urls_sha256: floodgateRawSortedIndexSha256([
          CSA_A,
          CSA_B,
        ]),
        target_csa_urls: 2,
        target_csa_urls_sha256: floodgateRawSortedIndexSha256([CSA_A, CSA_B]),
      },
      period_inventory: {
        body: expect.objectContaining({ sha256: sha256("period fixture") }),
        last_modified_at: "2026-03-31 23:54:26 +0900",
        counts: {
          ratingRows: 2,
          groupZeroIdentities: 1,
          identitiesAtLeast3600And30Games: 1,
        },
      },
      csa_reproduction: {
        responses: 2,
        canonical_games: 1,
        canonical_game_ids_sha256: floodgateRawSortedIndexSha256([
          floodgateCanonicalUrlGameId(CSA_A),
        ]),
        duplicate_groups: 1,
        duplicate_urls: 1,
      },
      object_counts: {
        unique_total: 4,
        unique_listings: 1,
        unique_daily_ratings: 1,
        unique_period_inventory: 1,
        unique_csa: 1,
      },
    });
    expect(Object.isFrozen(report)).toBe(true);
  });

  it("rejects receipt/index, listing-union, period, and duplicate drift", () => {
    const receiptBase = fixture();
    const receiptDrift: NonProductionFloodgateRawVerifierFixtureInput = {
      ...receiptBase,
      candidate: {
        ...receiptBase.candidate,
        daily_ratings: [
          { ...receiptBase.candidate.daily_ratings[0], status: 200 },
        ],
      },
    };
    expect(() =>
      verifyFloodgateRawLockCandidateCoreForTests(receiptDrift),
    ).toThrow(/does not match verified receipt/);

    const listingBase = fixture();
    const listingDrift: NonProductionFloodgateRawVerifierFixtureInput = {
      ...listingBase,
      facts: {
        ...listingBase.facts,
        listings: [
          {
            ...listingBase.facts.listings[0],
            evidence: {
              ...listingBase.facts.listings[0].evidence,
              target_csa_urls: [CSA_A],
            },
          },
        ],
      },
    };
    expect(() =>
      verifyFloodgateRawLockCandidateCoreForTests(listingDrift),
    ).toThrow(/target CSA union/);

    const periodBase = fixture();
    const periodDrift: NonProductionFloodgateRawVerifierFixtureInput = {
      ...periodBase,
      facts: {
        ...periodBase.facts,
        periodInventory: {
          ...periodBase.facts.periodInventory,
          evidence: {
            ...periodBase.facts.periodInventory.evidence,
            counts: {
              ...periodBase.facts.periodInventory.evidence.counts,
              ratingRows: 3,
            },
          },
        },
      },
    };
    expect(() =>
      verifyFloodgateRawLockCandidateCoreForTests(periodDrift),
    ).toThrow(/does not reproduce/);

    const duplicateBase = fixture();
    const duplicateDrift: NonProductionFloodgateRawVerifierFixtureInput = {
      ...duplicateBase,
      candidate: { ...duplicateBase.candidate, duplicate_groups: [] },
    };
    expect(() =>
      verifyFloodgateRawLockCandidateCoreForTests(duplicateDrift),
    ).toThrow(/does not reproduce/);
  });
});
