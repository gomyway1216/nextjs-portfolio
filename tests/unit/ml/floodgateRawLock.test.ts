import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_RAW_LOCK_GAME_ID_DOMAIN,
  FLOODGATE_RAW_LOCK_MAXIMUM_PARALLEL_REQUESTS,
  FLOODGATE_RAW_LOCK_MINIMUM_REQUEST_START_INTERVAL_MS,
  FLOODGATE_RAW_LOCK_PLAN_IDENTITY,
  FLOODGATE_RAW_LOCK_SCHEMA,
  FLOODGATE_RAW_LOCK_USER_AGENT,
  FLOODGATE_RAW_RECEIPT_SCHEMA,
  durableCreateNoClobber,
  floodgateCanonicalUrlGameId,
  floodgateRawObjectPath,
  floodgateRawReceiptPath,
  floodgateRawSortedIndexSha256,
  floodgateRawUrlSha256,
  parseFloodgateRawReceipt,
  parseFloodgateRawLockManifest,
  serializeFloodgateRawLockManifest,
  serializeFloodgateRawReceipt,
  storeFloodgateRawObject,
  verifyExistingFloodgateRawObject,
  readExistingFloodgateRawLockManifestFile,
  verifyExistingFloodgateRawReceipt,
  validateFloodgateRawLockManifest,
  type FloodgateDurableCreatePhase,
  type FloodgateRawReceipt,
  type FloodgateRawReceiptKind,
} from "../../../ml/floodgate-raw-lock";

const LISTING_URL = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/";
const CSA_URL =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+Alpha+Beta+20260101010203.csa";
const LISTING_IDENTITIES_PATH = path.resolve(
  "ml/protocols/floodgate-q1-2026-listing-identities.tsv",
);
const temporaryRoots: string[] = [];

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function temporaryRoot(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-raw-lock-test-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  return root;
}

async function mkdirFor(root: string, relativeFile: string): Promise<string> {
  const absolute = path.join(root, ...relativeFile.split("/"));
  await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
  return absolute;
}

function validReceipt(
  overrides: Partial<FloodgateRawReceipt> = {},
): FloodgateRawReceipt {
  const body = new TextEncoder().encode("listing body");
  const digest = sha256(body);
  return {
    schema: FLOODGATE_RAW_RECEIPT_SCHEMA,
    kind: "daily_listing",
    url: LISTING_URL,
    url_sha256: floodgateRawUrlSha256(LISTING_URL),
    request: {
      accept_encoding: "identity",
      redirect: "manual",
      user_agent: FLOODGATE_RAW_LOCK_USER_AGENT,
    },
    response: {
      url: LISTING_URL,
      status: 200,
      content_encoding: null,
      bytes: body.byteLength,
      sha256: digest,
    },
    object: floodgateRawObjectPath(digest),
    ...overrides,
  };
}

function q1Dates(): string[] {
  const dates: string[] = [];
  for (
    let instant = Date.parse("2026-01-01T00:00:00Z");
    instant <= Date.parse("2026-03-31T00:00:00Z");
    instant += 86_400_000
  ) {
    dates.push(new Date(instant).toISOString().slice(0, 10));
  }
  return dates;
}

function syntheticDigest(prefix: string, index: number): string {
  return `${prefix}${index.toString(16).padStart(63, "0")}`;
}

function preregisteredListingIdentities(): Array<{
  url: string;
  bytes: number;
  sha256: string;
}> {
  const text = fs.readFileSync(LISTING_IDENTITIES_PATH, "utf8");
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    throw new Error("listing identity fixture must have exactly one final LF");
  }
  return text
    .slice(0, -1)
    .split("\n")
    .map((line) => {
      const [url, bytes, sha256] = line.split("\t");
      return { url, bytes: Number(bytes), sha256 };
    });
}

let cachedValidManifest: Record<string, unknown> | undefined;

function validManifest(): Record<string, unknown> {
  if (cachedValidManifest) return cachedValidManifest;
  const dates = q1Dates();
  const emptyIndexDigest = floodgateRawSortedIndexSha256([]);
  const listings = preregisteredListingIdentities().map(
    ({ url, bytes, sha256: digest }, index) => {
      return {
        url,
        receipt: floodgateRawReceiptPath(url),
        status: 200,
        bytes,
        sha256: digest,
        object: floodgateRawObjectPath(digest),
        all_official_csa_urls: index === 0 ? 36_419 : 0,
        all_official_csa_urls_sha256:
          index === 0
            ? sha256("synthetic all official CSA URLs")
            : emptyIndexDigest,
        target_csa_urls: index === 0 ? 36_168 : 0,
        target_csa_urls_sha256: emptyIndexDigest,
      };
    },
  );
  const dailyRatings = dates.map((date, index) => {
    const url = `https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-${date.replaceAll("-", "")}.html`;
    const digest = syntheticDigest("b", index);
    return {
      url,
      receipt: floodgateRawReceiptPath(url),
      status: 200,
      bytes: 1,
      sha256: digest,
      object: floodgateRawObjectPath(digest),
    };
  });
  const csaIndex = Array.from({ length: 36_168 }, (_, index) => {
    const player = `A${String(index).padStart(5, "0")}`;
    const url = `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+${player}+B+20260101010203.csa`;
    const digest = syntheticDigest("c", index);
    return {
      url,
      receipt: floodgateRawReceiptPath(url),
      status: 200,
      bytes: 1,
      sha256: digest,
      object: floodgateRawObjectPath(digest),
      canonical_url: url,
      game_id: floodgateCanonicalUrlGameId(url),
    };
  });
  listings[0].target_csa_urls_sha256 = floodgateRawSortedIndexSha256(
    csaIndex.map((entry) => entry.url),
  );
  const periodDigest =
    "17bd9969ba31a2b9a723be4b7defb7b3045816b19e325de19e8b65158fbac5b4";
  const periodUrl =
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260401.html";
  cachedValidManifest = {
    schema: FLOODGATE_RAW_LOCK_SCHEMA,
    plan: { ...FLOODGATE_RAW_LOCK_PLAN_IDENTITY },
    source: {
      revision: "f3023a7284eea2a64f45908cf458611c85344dde",
      tracked_tree_clean: true,
    },
    acquisition_policy: {
      origin: "https://wdoor.c.u-tokyo.ac.jp",
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
    },
    summary: {
      listing_responses: 90,
      listing_bytes: 10_098_337,
      listing_urls_sha256: floodgateRawSortedIndexSha256(
        listings.map((entry) => entry.url),
      ),
      all_official_csa_urls: 36_419,
      target_csa_urls: 36_168,
      daily_rating_responses: 90,
      daily_rating_http_200: 90,
      daily_rating_http_404: 0,
      rating_urls_sha256: floodgateRawSortedIndexSha256(
        dailyRatings.map((entry) => entry.url),
      ),
      period_inventory_responses: 1,
      csa_responses: 36_168,
      csa_urls_sha256: floodgateRawSortedIndexSha256(
        csaIndex.map((entry) => entry.url),
      ),
      canonical_games: 36_168,
      canonical_game_ids_sha256: floodgateRawSortedIndexSha256(
        csaIndex.map((entry) => entry.game_id),
      ),
      duplicate_csa_groups: 0,
      duplicate_csa_urls: 0,
    },
    listing_identity_manifest: {
      bytes: 10_963,
      sha256:
        "05d353413f310087316e16cfc1ec29800967886db43f090aee59f713c4bfc822",
    },
    listings,
    daily_ratings: dailyRatings,
    period_inventory: {
      url: periodUrl,
      receipt: floodgateRawReceiptPath(periodUrl),
      status: 200,
      bytes: 332_094,
      sha256: periodDigest,
      object: floodgateRawObjectPath(periodDigest),
      last_modified_at: "2026-03-31 23:54:26 +0900",
      counts: {
        rating_rows: 316,
        group_zero_identities: 316,
        identities_at_least_3600_and_30_games: 152,
      },
    },
    csa_index: csaIndex,
    duplicate_groups: [],
    object_counts: {
      unique_total: 36_349,
      unique_listings: 90,
      unique_daily_ratings: 90,
      unique_period_inventory: 1,
      unique_csa: 36_168,
    },
  };
  return cachedValidManifest;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate raw lock receipt codec", () => {
  it("uses exact canonical key order and one final LF", () => {
    const receipt = validReceipt();
    const serialized = serializeFloodgateRawReceipt(receipt);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
    expect(serialized.includes("\r")).toBe(false);
    expect(serialized.indexOf('"kind"')).toBeLessThan(
      serialized.indexOf('"object"'),
    );
    expect(serialized.indexOf('"object"')).toBeLessThan(
      serialized.indexOf('"request"'),
    );
    expect(parseFloodgateRawReceipt(serialized)).toEqual(receipt);
    expect(Object.isFrozen(parseFloodgateRawReceipt(serialized))).toBe(true);

    expect(() => parseFloodgateRawReceipt(serialized.slice(0, -1))).toThrow(
      /exactly one final LF/,
    );
    expect(() => parseFloodgateRawReceipt(`${serialized}\n`)).toThrow(
      /exactly one final LF/,
    );
    expect(() =>
      parseFloodgateRawReceipt(`${JSON.stringify(receipt, null, 2)}\n`),
    ).toThrow(/canonical key order or framing/);
  });

  it("rejects unknown keys, proxies, accessors, symbols, and path forgery", () => {
    expect(() =>
      serializeFloodgateRawReceipt({ ...validReceipt(), score: 1 }),
    ).toThrow(/forbidden/);
    expect(() =>
      serializeFloodgateRawReceipt(new Proxy(validReceipt(), {})),
    ).toThrow(/Proxy/);

    const accessor = { ...validReceipt() } as Record<string, unknown>;
    Object.defineProperty(accessor, "url", {
      enumerable: true,
      get: () => LISTING_URL,
    });
    expect(() => serializeFloodgateRawReceipt(accessor)).toThrow(/accessor/);

    const symbol = { ...validReceipt(), [Symbol("hidden")]: true };
    expect(() => serializeFloodgateRawReceipt(symbol)).toThrow(/symbol keys/);
    expect(() =>
      serializeFloodgateRawReceipt({
        ...validReceipt(),
        object: "objects/sha256/../escape",
      }),
    ).toThrow(/not content-addressed/);
  });

  it("binds kind, canonical URL, status, headers, body, and URL hash", () => {
    expect(() =>
      serializeFloodgateRawReceipt({
        ...validReceipt(),
        url_sha256: "0".repeat(64),
      }),
    ).toThrow(/URL hash/);
    expect(() =>
      serializeFloodgateRawReceipt({
        ...validReceipt(),
        response: { ...validReceipt().response, status: 404 },
      }),
    ).toThrow(/forbidden for daily_listing/);
    expect(() =>
      serializeFloodgateRawReceipt({
        ...validReceipt(),
        request: { ...validReceipt().request, accept_encoding: "gzip" },
      }),
    ).toThrow(/network policy/);
    expect(() =>
      serializeFloodgateRawReceipt({
        ...validReceipt(),
        url: LISTING_URL.replace(".ac.jp/", ".ac.jp:443/"),
      }),
    ).toThrow(/canonical URL spelling/);
  });

  it("derives receipt paths and body-independent game IDs from canonical URLs", async () => {
    const urlDigest = sha256(
      `floodgate-q1-2026-raw-lock-url-v1\0${LISTING_URL}`,
    );
    expect(floodgateRawReceiptPath(LISTING_URL)).toBe(
      `receipts/sha256/${urlDigest.slice(0, 2)}/${urlDigest}.json`,
    );
    const expectedGameId = sha256(
      `${FLOODGATE_RAW_LOCK_GAME_ID_DOMAIN}\0${CSA_URL}`,
    );
    expect(floodgateCanonicalUrlGameId(CSA_URL)).toBe(
      `sha256:${expectedGameId}`,
    );
    expect(FLOODGATE_RAW_LOCK_GAME_ID_DOMAIN).toBe(
      "floodgate-q1-2026-game-id-v1",
    );
    expect(() =>
      floodgateCanonicalUrlGameId(CSA_URL.replace(".ac.jp/", ".ac.jp:443/")),
    ).toThrow(/canonical URL spelling/);
    expect(() =>
      floodgateRawReceiptPath("https://evil.example/game.csa"),
    ).toThrow(/exact canonical Floodgate HTTPS origin/);
    expect(FLOODGATE_RAW_LOCK_PLAN_IDENTITY).toEqual({
      path: "ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json",
      bytes: 10_890,
      sha256:
        "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af",
      schema: "shogi-floodgate-fresh-sibling-plan-v1",
    });
    const planBytes = await fs.promises.readFile(
      path.resolve(FLOODGATE_RAW_LOCK_PLAN_IDENTITY.path),
    );
    expect(planBytes.byteLength).toBe(FLOODGATE_RAW_LOCK_PLAN_IDENTITY.bytes);
    expect(sha256(planBytes)).toBe(FLOODGATE_RAW_LOCK_PLAN_IDENTITY.sha256);
  });
});

describe("Floodgate final raw-lock manifest codec", () => {
  it(
    "round-trips the full fixed summary with canonical order and one final LF",
    { timeout: 120_000 },
    async () => {
      const serialized = serializeFloodgateRawLockManifest(validManifest());
      expect(serialized.endsWith("\n")).toBe(true);
      expect(serialized.endsWith("\n\n")).toBe(false);
      expect(serialized.includes("\r")).toBe(false);
      expect(serialized.indexOf('"acquisition_policy"')).toBeLessThan(
        serialized.indexOf('"csa_index"'),
      );

      const decoded = parseFloodgateRawLockManifest(serialized);
      expect(decoded.summary).toMatchObject({
        listing_responses: 90,
        listing_bytes: 10_098_337,
        all_official_csa_urls: 36_419,
        target_csa_urls: 36_168,
        csa_responses: 36_168,
      });
      expect(decoded.csa_index).toHaveLength(36_168);
      expect(Object.isFrozen(decoded)).toBe(true);
      expect(Object.isFrozen(decoded.csa_index)).toBe(true);

      const root = await temporaryRoot();
      const finalPath = path.join(root, "manifest.json");
      await durableCreateNoClobber(finalPath, serialized);
      const read = await readExistingFloodgateRawLockManifestFile(root);
      expect(read.summary).toEqual(decoded.summary);
      await expect(
        durableCreateNoClobber(finalPath, serialized),
      ).rejects.toThrow(/no-clobber/);
    },
  );

  it("rejects plan/source/summary drift before blessing any indexes", () => {
    const manifest = validManifest();
    expect(() =>
      validateFloodgateRawLockManifest({
        ...manifest,
        plan: { ...FLOODGATE_RAW_LOCK_PLAN_IDENTITY, bytes: 10_889 },
      }),
    ).toThrow(/plan binding bytes/);
    expect(() =>
      validateFloodgateRawLockManifest({
        ...manifest,
        source: {
          revision: "f3023a7284eea2a64f45908cf458611c85344dde",
          tracked_tree_clean: false,
        },
      }),
    ).toThrow(/clean tracked tree/);
    expect(() =>
      validateFloodgateRawLockManifest({
        ...manifest,
        summary: {
          ...(manifest.summary as Record<string, unknown>),
          target_csa_urls: 36_167,
        },
      }),
    ).toThrow(/preregistered inventory/);

    const listings = manifest.listings as Record<string, unknown>[];
    const driftedSha256 = "0".repeat(64);
    expect(() =>
      validateFloodgateRawLockManifest({
        ...manifest,
        listings: [
          {
            ...listings[0],
            sha256: driftedSha256,
            object: floodgateRawObjectPath(driftedSha256),
          },
          ...listings.slice(1),
        ],
      }),
    ).toThrow(/preregistered identity/);
  });

  it("rejects forbidden/unknown fields, Proxy, accessor, symbol, and index paths", () => {
    const manifest = validManifest();
    expect(() =>
      validateFloodgateRawLockManifest({ ...manifest, winner: "sente" }),
    ).toThrow(/forbidden/);
    expect(() =>
      validateFloodgateRawLockManifest(new Proxy(manifest, {})),
    ).toThrow(/Proxy/);

    const accessor = { ...manifest };
    Object.defineProperty(accessor, "summary", {
      enumerable: true,
      get: () => manifest.summary,
    });
    expect(() => validateFloodgateRawLockManifest(accessor)).toThrow(
      /accessor/,
    );
    expect(() =>
      validateFloodgateRawLockManifest({
        ...manifest,
        [Symbol("hidden")]: true,
      }),
    ).toThrow(/symbol keys/);

    const csa = manifest.csa_index as Record<string, unknown>[];
    expect(() =>
      validateFloodgateRawLockManifest({
        ...manifest,
        csa_index: [{ ...csa[0], receipt: "../receipt.json" }, ...csa.slice(1)],
      }),
    ).toThrow(/traversal-free|URL hash/);
  });

  it(
    "rejects non-bytewise index order and canonical URL/game-ID drift",
    { timeout: 120_000 },
    () => {
      const manifest = validManifest();
      const csa = manifest.csa_index as Record<string, unknown>[];
      expect(() =>
        validateFloodgateRawLockManifest({
          ...manifest,
          csa_index: [csa[1], csa[0], ...csa.slice(2)],
        }),
      ).toThrow(/UTF-8-bytewise URL sorted/);
      expect(() =>
        validateFloodgateRawLockManifest({
          ...manifest,
          csa_index: [
            { ...csa[0], canonical_url: csa[1].url },
            ...csa.slice(1),
          ],
        }),
      ).toThrow(/canonical URL\/game ID|game_id/);
      expect(() =>
        validateFloodgateRawLockManifest({
          ...manifest,
          summary: {
            ...(manifest.summary as Record<string, unknown>),
            csa_urls_sha256: "0".repeat(64),
          },
        }),
      ).toThrow(/CSA URL digest/);
    },
  );

  it(
    "counts duplicate CSA aliases as dropped noncanonical URLs",
    { timeout: 120_000 },
    () => {
      const manifest = validManifest();
      const original = manifest.csa_index as Record<string, unknown>[];
      const first = original[0];
      const second: Record<string, unknown> = {
        ...original[1],
        bytes: first.bytes,
        sha256: first.sha256,
        object: first.object,
        canonical_url: first.url,
        game_id: first.game_id,
      };
      const csaIndex = [first, second, ...original.slice(2)];
      const duplicate = {
        sha256: first.sha256,
        bytes: first.bytes,
        canonical_url: first.url,
        urls: [first.url, second.url],
      };
      const canonicalGameIds = [
        first.game_id as string,
        ...original.slice(2).map((entry) => entry.game_id as string),
      ];
      const decoded = validateFloodgateRawLockManifest({
        ...manifest,
        summary: {
          ...(manifest.summary as Record<string, unknown>),
          canonical_game_ids_sha256:
            floodgateRawSortedIndexSha256(canonicalGameIds),
          canonical_games: 36_167,
          duplicate_csa_groups: 1,
          duplicate_csa_urls: 1,
        },
        csa_index: csaIndex,
        duplicate_groups: [duplicate],
        object_counts: {
          ...(manifest.object_counts as Record<string, unknown>),
          unique_csa: 36_167,
          unique_total: 36_348,
        },
      });
      expect(decoded.summary.duplicate_csa_groups).toBe(1);
      expect(decoded.summary.duplicate_csa_urls).toBe(1);
      expect(decoded.summary.canonical_games).toBe(36_167);
      expect(decoded.summary.canonical_game_ids_sha256).toBe(
        floodgateRawSortedIndexSha256(canonicalGameIds),
      );
      expect(decoded.csa_index[1].game_id).toBe(decoded.csa_index[0].game_id);
    },
  );
});

describe("durable no-clobber publication", () => {
  it("publishes a 0600 regular file and removes its same-directory temp", async () => {
    const root = await temporaryRoot();
    const target = path.join(root, "objects", "value");
    await fs.promises.mkdir(path.dirname(target), { recursive: true });

    await durableCreateNoClobber(target, "exact bytes");

    expect(await fs.promises.readFile(target, "utf8")).toBe("exact bytes");
    const stat = await fs.promises.lstat(target);
    expect(stat.isFile()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.mode & 0o777).toBe(0o600);
    expect(await fs.promises.readdir(path.dirname(target))).toEqual(["value"]);
  });

  it("never overwrites an existing regular, symlink, or nonregular target", async () => {
    const root = await temporaryRoot();
    const directory = path.join(root, "store");
    await fs.promises.mkdir(directory);
    const same = path.join(directory, "same");
    await fs.promises.writeFile(same, "locked", { mode: 0o600 });
    await expect(durableCreateNoClobber(same, "locked")).rejects.toThrow(
      /no-clobber/,
    );
    await expect(durableCreateNoClobber(same, "changed")).rejects.toThrow(
      /conflicting bytes/,
    );
    expect(await fs.promises.readFile(same, "utf8")).toBe("locked");

    const symlink = path.join(directory, "symlink");
    await fs.promises.symlink(same, symlink);
    await expect(durableCreateNoClobber(symlink, "locked")).rejects.toThrow(
      /symbolic link/,
    );
    expect(await fs.promises.readlink(symlink)).toBe(same);

    const nonregular = path.join(directory, "nonregular");
    await fs.promises.mkdir(nonregular);
    await expect(durableCreateNoClobber(nonregular, "locked")).rejects.toThrow(
      /not a regular file/,
    );
  });

  it("rejects Proxy/SharedArrayBuffer input and ignores typed-array copy hooks", async () => {
    const root = await temporaryRoot();
    const directory = path.join(root, "bytes");
    await fs.promises.mkdir(directory);
    const source = new TextEncoder().encode("plain snapshot");
    await expect(
      durableCreateNoClobber(
        path.join(directory, "proxy"),
        new Proxy(source, {}),
      ),
    ).rejects.toThrow(/must not be a Proxy/);
    await expect(
      durableCreateNoClobber(
        path.join(directory, "shared"),
        new Uint8Array(new SharedArrayBuffer(16)),
      ),
    ).rejects.toThrow(/SharedArrayBuffer/);

    const touched: string[] = [];
    class HostileUint8Array extends Uint8Array {
      static get [Symbol.species]() {
        touched.push("species");
        throw new Error("species must not run");
      }
    }
    const hostile = new HostileUint8Array(source.byteLength);
    Uint8Array.prototype.set.call(hostile, source);
    Object.defineProperties(hostile, {
      buffer: {
        get: () => {
          touched.push("buffer");
          throw new Error("buffer getter must not run");
        },
      },
      byteLength: {
        get: () => {
          touched.push("byteLength");
          throw new Error("byteLength getter must not run");
        },
      },
      byteOffset: {
        get: () => {
          touched.push("byteOffset");
          throw new Error("byteOffset getter must not run");
        },
      },
      [Symbol.iterator]: {
        value: () => {
          touched.push("iterator");
          throw new Error("iterator must not run");
        },
      },
    });
    const target = path.join(directory, "hostile");
    await durableCreateNoClobber(target, hostile);
    expect(await fs.promises.readFile(target)).toEqual(Buffer.from(source));
    expect(touched).toEqual([]);
  });

  it("rejects noncanonical paths and symlinked parent components", async () => {
    const root = await temporaryRoot();
    const real = path.join(root, "real");
    const alias = path.join(root, "alias");
    await fs.promises.mkdir(real);
    await fs.promises.symlink(real, alias);

    await expect(
      durableCreateNoClobber(path.join(alias, "value"), "bytes"),
    ).rejects.toThrow(/parent path component.*symbolic link/);
    await expect(
      durableCreateNoClobber(`${root}/real/../escape`, "x"),
    ).rejects.toThrow(/canonical absolute file path/);
    await expect(durableCreateNoClobber("relative/path", "x")).rejects.toThrow(
      /canonical absolute file path/,
    );
  });

  it("leaves no final before link and a valid immutable final after link failpoints", async () => {
    const beforeLink: FloodgateDurableCreatePhase[] = [
      "after-temp-open",
      "after-temp-write",
      "after-temp-sync",
    ];
    const afterLink: FloodgateDurableCreatePhase[] = [
      "after-link",
      "after-directory-sync",
      "after-temp-unlink",
    ];
    for (const phase of [...beforeLink, ...afterLink]) {
      const root = await temporaryRoot();
      const target = path.join(root, "store", phase);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await expect(
        durableCreateNoClobber(target, "durable", {
          failpoint: (current) => {
            if (current === phase) throw new Error(`crash:${phase}`);
          },
        }),
      ).rejects.toThrow(`crash:${phase}`);

      const exists = await fs.promises
        .lstat(target)
        .then(() => true)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
      expect(exists).toBe(afterLink.includes(phase));
      if (exists) {
        expect(await fs.promises.readFile(target, "utf8")).toBe("durable");
      }
      expect(
        (await fs.promises.readdir(path.dirname(target))).some((entry) =>
          entry.endsWith(".tmp"),
        ),
      ).toBe(false);
    }
  });
});

describe("strict existing object and receipt verification", () => {
  async function materializeReceipt(
    root: string,
    receipt = validReceipt(),
    body = new TextEncoder().encode("listing body"),
  ): Promise<void> {
    const objectPath = await mkdirFor(root, receipt.object);
    await durableCreateNoClobber(objectPath, body);
    const receiptPath = await mkdirFor(
      root,
      floodgateRawReceiptPath(receipt.url),
    );
    await durableCreateNoClobber(
      receiptPath,
      serializeFloodgateRawReceipt(receipt),
    );
  }

  it("revalidates exact receipt shape, URL key, object bytes, and digest", async () => {
    const root = await temporaryRoot();
    const receipt = validReceipt();
    await materializeReceipt(root, receipt);

    const verified = await verifyExistingFloodgateRawReceipt(
      root,
      LISTING_URL,
      "daily_listing",
    );
    expect(verified.receipt).toEqual(receipt);
    expect(new TextDecoder().decode(verified.bytes)).toBe("listing body");
    expect(Object.isFrozen(verified)).toBe(true);
    expect(
      await verifyExistingFloodgateRawObject(root, {
        bytes: receipt.response.bytes,
        sha256: receipt.response.sha256,
        object: receipt.object,
      }),
    ).toEqual(verified.bytes);

    await expect(
      verifyExistingFloodgateRawReceipt(
        root,
        LISTING_URL,
        "daily_rating" as FloodgateRawReceiptKind,
      ),
    ).rejects.toThrow();
  });

  it("reuses an exact CAS object after verification but rejects corruption", async () => {
    const root = await temporaryRoot();
    const body = new TextEncoder().encode("same duplicate body");
    const object = floodgateRawObjectPath(sha256(body));
    await mkdirFor(root, object);

    const [first, second] = await Promise.all([
      storeFloodgateRawObject(root, body),
      storeFloodgateRawObject(root, body),
    ]);
    expect(second).toEqual(first);
    expect(
      await fs.promises.readFile(path.join(root, ...object.split("/")), "utf8"),
    ).toBe("same duplicate body");

    await fs.promises.writeFile(
      path.join(root, ...object.split("/")),
      "corrupt duplicate",
    );
    await expect(storeFloodgateRawObject(root, body)).rejects.toThrow(
      /byte count|digest/,
    );
  });

  it("never mistakes post-link durability failures for an idempotent CAS race", async () => {
    const phases: FloodgateDurableCreatePhase[] = [
      "after-link",
      "after-directory-sync",
    ];
    for (const phase of phases) {
      const root = await temporaryRoot();
      const body = new TextEncoder().encode(`durability failure ${phase}`);
      await mkdirFor(root, floodgateRawObjectPath(sha256(body)));

      await expect(
        storeFloodgateRawObject(root, body, {
          failpoint: (current) => {
            if (current === phase) throw new Error(`injected:${phase}`);
          },
        }),
      ).rejects.toThrow(`injected:${phase}`);

      await expect(storeFloodgateRawObject(root, body)).resolves.toMatchObject({
        bytes: body.byteLength,
        sha256: sha256(body),
      });
    }
  });

  it("rejects corrupt objects and receipts instead of repairing them", async () => {
    const objectRoot = await temporaryRoot();
    const receipt = validReceipt();
    await materializeReceipt(objectRoot, receipt);
    const objectPath = path.join(objectRoot, ...receipt.object.split("/"));
    await fs.promises.writeFile(objectPath, "corrupt");
    await expect(
      verifyExistingFloodgateRawReceipt(
        objectRoot,
        LISTING_URL,
        "daily_listing",
      ),
    ).rejects.toThrow(/byte count|digest/);

    const receiptRoot = await temporaryRoot();
    await materializeReceipt(receiptRoot, receipt);
    const receiptPath = path.join(
      receiptRoot,
      ...floodgateRawReceiptPath(LISTING_URL).split("/"),
    );
    await fs.promises.writeFile(
      receiptPath,
      `${JSON.stringify({ ...receipt, extra: true })}\n`,
    );
    await expect(
      verifyExistingFloodgateRawReceipt(
        receiptRoot,
        LISTING_URL,
        "daily_listing",
      ),
    ).rejects.toThrow(/exactly keys|canonical/);
  });

  it("rejects symlinked objects, receipts, and path-forged identities", async () => {
    const root = await temporaryRoot();
    const receipt = validReceipt();
    const real = path.join(root, "real");
    await fs.promises.writeFile(real, "listing body");
    const objectPath = await mkdirFor(root, receipt.object);
    await fs.promises.symlink(real, objectPath);
    await expect(
      verifyExistingFloodgateRawObject(root, {
        bytes: receipt.response.bytes,
        sha256: receipt.response.sha256,
        object: receipt.object,
      }),
    ).rejects.toThrow(/symbolic link|ELOOP/);

    await expect(
      verifyExistingFloodgateRawObject(root, {
        bytes: 1,
        sha256: "0".repeat(64),
        object: "../escape",
      }),
    ).rejects.toThrow(/traversal-free|does not match/);
  });
});
