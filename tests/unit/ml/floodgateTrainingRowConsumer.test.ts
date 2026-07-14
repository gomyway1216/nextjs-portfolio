import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  FLOODGATE_ROLE_BUNDLE_SCHEMA,
  type FloodgateRoleBundleRawIdentity,
  type FloodgateRoleBundleRawParent,
} from "../../../ml/floodgate-role-bundle";
import {
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
  FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
  type VerifiedPinnedFloodgateRoleBundle,
} from "../../../ml/floodgate-role-bundle-result";
import {
  FLOODGATE_TRAINING_RAW_FILENAME,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  claimActiveVerifiedPinnedFloodgateTrainingRows,
  claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  parseAuthenticatedFloodgateTrainingRowsCoreForTests,
  withVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
  type FloodgateTrainingRowConsumerDependencies,
  type FloodgateTrainingRowConsumerOptions,
} from "../../../ml/floodgate-training-row-consumer";
import { floodgateCanonicalUrlGameId } from "../../../ml/floodgate-raw-lock";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import { childSfenAfterUsi } from "../../../ml/shogi-sfen";
import { compareBytewise, positionKeyFromSfen } from "../../../ml/sibling-data";

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const PRODUCER_REVISION = "a".repeat(40);
const VERIFIER_REVISION = "b".repeat(40);
const temporaryRoots: string[] = [];
const execFile = promisify(execFileCallback);

function deferred(): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}> {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return Object.freeze({ promise, resolve });
}

function sha256Bytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parentId(gameId: string, ply: number): string {
  return `sha256:${sha256Bytes(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function sourceUrl(index: number): string {
  const stamp = String(index).padStart(6, "0");
  return `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+fixture-a+fixture-b+20260101${stamp}.csa`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("fixture is not JSON data");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function canonicalRawBytes(
  rows: readonly FloodgateRoleBundleRawParent[],
): Uint8Array {
  return Buffer.from(`${rows.map((row) => canonicalJson(row)).join("\n")}\n`);
}

function gameRows(
  index: number,
  moves: readonly [string, string, string, string],
): FloodgateRoleBundleRawParent[] {
  const url = sourceUrl(index);
  const gameId = floodgateCanonicalUrlGameId(url);
  const gameSha256 = sha256Bytes(`synthetic authenticated CSA ${index}`);
  const rows: FloodgateRoleBundleRawParent[] = [];
  let parentSfen = START_SFEN;
  for (let ply = 0; ply < moves.length; ply += 1) {
    const move = moves[ply];
    if (ply >= 2) {
      rows.push({
        schema_version: 1,
        source: "floodgate",
        source_url: url,
        game_sha256: gameSha256,
        game_id: gameId,
        parent_id: parentId(gameId, ply),
        position_id: positionKeyFromSfen(parentSfen),
        parent_sfen: parentSfen,
        ply,
        played_move: move,
      });
    }
    parentSfen = childSfenAfterUsi(parentSfen, move);
  }
  return rows;
}

function fixtureRows(): FloodgateRoleBundleRawParent[] {
  return [
    ...gameRows(1, ["7g7f", "3c3d", "2g2f", "8c8d"]),
    ...gameRows(2, ["2g2f", "8c8d", "7g7f", "3c3d"]),
  ].sort((left, right) => compareBytewise(left.parent_id, right.parent_id));
}

function rawIdentity(
  rows: readonly FloodgateRoleBundleRawParent[],
  bytes = canonicalRawBytes(rows),
): FloodgateRoleBundleRawIdentity {
  const gameIds = new Set(rows.map((row) => row.game_id));
  const parentIds = new Set(rows.map((row) => row.parent_id));
  const positionIds = new Set(rows.map((row) => row.position_id));
  return {
    path: FLOODGATE_TRAINING_RAW_FILENAME,
    format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    bytes: bytes.byteLength,
    sha256: sha256Bytes(bytes),
    records: rows.length,
    games: gameIds.size,
    game_ids_sha256: floodgateIdentifierDigest(gameIds),
    parent_ids_sha256: floodgateIdentifierDigest(parentIds),
    position_ids_count: positionIds.size,
    position_ids_sha256: floodgateIdentifierDigest(positionIds),
  };
}

function cloneRows(
  rows: readonly FloodgateRoleBundleRawParent[],
): FloodgateRoleBundleRawParent[] {
  return JSON.parse(JSON.stringify(rows)) as FloodgateRoleBundleRawParent[];
}

function projectedTrainingRows(
  rows: readonly FloodgateRoleBundleRawParent[],
): FloodgateTrainingParent[] {
  return rows.map((row) => ({
    schema_version: row.schema_version,
    game_id: row.game_id,
    parent_id: row.parent_id,
    position_id: row.position_id,
    parent_sfen: row.parent_sfen,
    ply: row.ply,
    played_move: row.played_move,
  }));
}

interface Fixture {
  readonly container: string;
  readonly outputRoot: string;
  readonly trainingPath: string;
  readonly rows: readonly FloodgateRoleBundleRawParent[];
  readonly bytes: Uint8Array;
  readonly identity: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly options: FloodgateTrainingRowConsumerOptions;
}

function structurallyForgedAuthenticatedInput(
  input: Fixture,
): Readonly<AuthenticatedFloodgateTrainingRows> {
  const manifestIdentity = verifiedBundle(input.identity).result.manifest
    .identity;
  return Object.freeze({
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: "training" as const,
    binding: Object.freeze({
      result_receipt_bytes: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
      result_receipt_sha256: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
      bundle_manifest_bytes: manifestIdentity.bytes,
      bundle_manifest_sha256: manifestIdentity.sha256,
      bundle_producer_revision: PRODUCER_REVISION,
      verifier_revision: VERIFIER_REVISION,
      raw_format: input.identity.format,
      raw_bytes: input.identity.bytes,
      raw_sha256: input.identity.sha256,
      records: input.identity.records,
      games: input.identity.games,
      game_ids_sha256: input.identity.game_ids_sha256,
      parent_ids_sha256: input.identity.parent_ids_sha256,
      position_ids_count: input.identity.position_ids_count,
      position_ids_sha256: input.identity.position_ids_sha256,
    }),
    rows: Object.freeze(
      projectedTrainingRows(input.rows).map((row) => Object.freeze(row)),
    ),
  });
}

async function fixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-training-consumer-"),
  );
  const container = await fs.promises.realpath(created);
  temporaryRoots.push(container);
  await fs.promises.chmod(container, 0o700);

  const outputRoot = path.join(container, "bundle");
  await fs.promises.mkdir(outputRoot, { mode: 0o700 });
  await fs.promises.chmod(outputRoot, 0o700);
  const rows = fixtureRows();
  const bytes = canonicalRawBytes(rows);
  const trainingPath = path.join(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME);
  await fs.promises.writeFile(trainingPath, bytes, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(trainingPath, 0o600);

  return {
    container,
    outputRoot,
    trainingPath,
    rows,
    bytes,
    identity: rawIdentity(rows, bytes),
    options: {
      repositoryRoot: path.join(container, "repository"),
      verifierRevision: VERIFIER_REVISION,
      rawLockRoot: path.join(container, "raw-lock"),
      roleLockRoot: path.join(container, "role-lock"),
      legacyProtectedPositionIdsPath: path.join(
        container,
        "legacy-protected-position-ids.txt",
      ),
      outputRoot,
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

function verifiedBundle(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): Readonly<VerifiedPinnedFloodgateRoleBundle> {
  const manifest = {
    schema: FLOODGATE_ROLE_BUNDLE_SCHEMA,
    status: "complete-label-free-role-bundle",
    provenance: {},
    pipeline: {
      source_revision: PRODUCER_REVISION,
      tracked_tree_clean: true,
    },
    sources: {},
    contract: {},
    roles: {
      fresh_final_holdout: {},
      fresh_selection: {},
      training: { protected_position_ids: {}, raw_parents: identity },
    },
    replay_exclusion: {},
    isolation: {},
  };
  const manifestText = `${canonicalJson(manifest)}\n`;
  const manifestIdentity = {
    path: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.path,
    bytes: Buffer.byteLength(manifestText),
    sha256: sha256Bytes(manifestText),
  };
  return {
    manifest,
    manifestText,
    roleLock: {},
    producerRevision: PRODUCER_REVISION,
    verifierRevision: VERIFIER_REVISION,
    result: {
      schema: FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
      status: "complete-label-free-role-bundle",
      claim_boundary: "integrity-only-not-playing-strength-evidence",
      manifest: {
        identity: manifestIdentity,
        value: manifest,
      },
      execution: {},
      post_run_audit: {},
    },
  } as unknown as Readonly<VerifiedPinnedFloodgateRoleBundle>;
}

function dependencies(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): FloodgateTrainingRowConsumerDependencies & {
  readonly verifyBundle: ReturnType<typeof vi.fn>;
} {
  const verifyBundle = vi.fn(
    async (_options: FloodgateTrainingRowConsumerOptions) =>
      verifiedBundle(identity),
  );
  return {
    verifyBundle,
    expectedManifestIdentity: verifiedBundle(identity).result.manifest.identity,
  } as FloodgateTrainingRowConsumerDependencies & {
    readonly verifyBundle: ReturnType<typeof vi.fn>;
  };
}

async function overwriteOneByte(filePath: string): Promise<void> {
  const handle = await fs.promises.open(filePath, "r+");
  try {
    await handle.write(Buffer.from("X"), 0, 1, 12);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceTrainingPath(input: Fixture): Promise<void> {
  await fs.promises.rename(
    input.trainingPath,
    path.join(input.outputRoot, "displaced-training.raw.jsonl"),
  );
  await fs.promises.writeFile(input.trainingPath, input.bytes, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(input.trainingPath, 0o600);
}

describe("authenticated Floodgate training-row parser", () => {
  it("takes the production training identity only from the pinned result receipt", () => {
    const receipt = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH),
        "utf8",
      ),
    ) as {
      manifest: {
        value: {
          roles: { training: { raw_parents: FloodgateRoleBundleRawIdentity } };
        };
      };
    };
    expect(receipt.manifest.value.roles.training.raw_parents).toEqual({
      path: FLOODGATE_TRAINING_RAW_FILENAME,
      format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
      bytes: 15_369_952,
      sha256:
        "c9ee90da69135ead5dbb60cbab6eaa82ad018db791132dd4ec122d6088c37b62",
      records: 24_000,
      games: 1_000,
      game_ids_sha256:
        "97609ce53a9dee1fffd8faadcf408d79bc3e0724c17d52d8a2ac095bc607e3d7",
      parent_ids_sha256:
        "6681bd08bb282be04f47bf3157ea07fbbe2bc6a6864a100ce65902dc9cc3f08f",
      position_ids_count: 24_000,
      position_ids_sha256:
        "a97788b608a6687c078b7fbe2172a5c4068c57a42ed322c3997692f697e73b5c",
    });
  });

  it("accepts canonical legal rows and returns only deeply frozen rows", () => {
    const rows = fixtureRows();
    const bytes = canonicalRawBytes(rows);
    const parsed = parseAuthenticatedFloodgateTrainingRowsCoreForTests(
      bytes,
      rawIdentity(rows, bytes),
    );
    const expected = projectedTrainingRows(rows);

    expect(parsed).toEqual(expected);
    expect(parsed).not.toBe(rows);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.every((row) => Object.isFrozen(row))).toBe(true);
    expect(Reflect.ownKeys(parsed[0]).sort()).toEqual(
      [
        "game_id",
        "parent_id",
        "parent_sfen",
        "played_move",
        "ply",
        "position_id",
        "schema_version",
      ].sort(),
    );
    expect(() =>
      (parsed as unknown as FloodgateTrainingParent[]).push(expected[0]),
    ).toThrow(TypeError);
    expect(() => {
      (parsed[0] as { ply: number }).ply += 1;
    }).toThrow(TypeError);
  });

  it("rejects every non-exact JSONL framing or JSON shape", () => {
    const rows = fixtureRows();
    const canonical = canonicalRawBytes(rows);
    const decoded = Buffer.from(canonical).toString("utf8");
    const withUnknownField = cloneRows(rows) as Array<
      FloodgateRoleBundleRawParent & { unexpected?: boolean }
    >;
    withUnknownField[0].unexpected = true;
    const cases: readonly [string, Uint8Array][] = [
      [
        "UTF-8 BOM",
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonical]),
      ],
      ["CRLF", Buffer.from(decoded.replaceAll("\n", "\r\n"))],
      ["missing final LF", canonical.slice(0, -1)],
      ["double final LF", Buffer.concat([canonical, Buffer.from("\n")])],
      [
        "noncanonical object key order",
        Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`),
      ],
      ["unknown field", canonicalRawBytes(withUnknownField)],
      [
        "NUL",
        Buffer.concat([
          canonical.slice(0, 10),
          Buffer.from([0]),
          canonical.slice(10),
        ]),
      ],
      [
        "invalid UTF-8",
        Buffer.concat([
          canonical.slice(0, 10),
          Buffer.from([0xff]),
          canonical.slice(10),
        ]),
      ],
    ];

    for (const [label, bytes] of cases) {
      expect(
        () =>
          parseAuthenticatedFloodgateTrainingRowsCoreForTests(
            bytes,
            rawIdentity(rows, bytes),
          ),
        label,
      ).toThrow();
    }
  });

  it.each([
    [
      "schema version",
      (rows: FloodgateRoleBundleRawParent[]) => {
        (rows[0] as { schema_version: number }).schema_version = 2;
      },
    ],
    [
      "source discriminator",
      (rows: FloodgateRoleBundleRawParent[]) => {
        (rows[0] as { source: string }).source = "not-floodgate";
      },
    ],
    [
      "position identity",
      (rows: FloodgateRoleBundleRawParent[]) => {
        rows[0] = { ...rows[0], position_id: `sha256:${"0".repeat(64)}` };
      },
    ],
    [
      "ply/SFEN move number",
      (rows: FloodgateRoleBundleRawParent[]) => {
        rows[0] = { ...rows[0], ply: rows[0].ply + 1 };
      },
    ],
    [
      "noncanonical SFEN move number",
      (rows: FloodgateRoleBundleRawParent[]) => {
        const parentSfen = rows[0].parent_sfen.replace(/ (\d+)$/, " 0$1");
        rows[0] = {
          ...rows[0],
          parent_sfen: parentSfen,
          position_id: positionKeyFromSfen(parentSfen),
        };
      },
    ],
    [
      "parent occurrence identity",
      (rows: FloodgateRoleBundleRawParent[]) => {
        rows[0] = { ...rows[0], parent_id: `sha256:${"0".repeat(64)}` };
      },
    ],
    [
      "source URL/game identity",
      (rows: FloodgateRoleBundleRawParent[]) => {
        rows[0] = { ...rows[0], game_id: `sha256:${"0".repeat(64)}` };
      },
    ],
    [
      "illegal played move",
      (rows: FloodgateRoleBundleRawParent[]) => {
        rows[0] = { ...rows[0], played_move: "P*5e" };
      },
    ],
  ] as const)("rejects invalid %s semantics", (_label, mutate) => {
    const rows = cloneRows(fixtureRows());
    mutate(rows);
    rows.sort((left, right) =>
      compareBytewise(left.parent_id, right.parent_id),
    );
    const bytes = canonicalRawBytes(rows);
    expect(() =>
      parseAuthenticatedFloodgateTrainingRowsCoreForTests(
        bytes,
        rawIdentity(rows, bytes),
      ),
    ).toThrow();
  });

  it("rejects duplicate and non-bytewise-sorted parent rows", () => {
    const canonical = fixtureRows();
    const duplicate = [...cloneRows(canonical), { ...canonical[0] }].sort(
      (left, right) => compareBytewise(left.parent_id, right.parent_id),
    );
    const duplicateBytes = canonicalRawBytes(duplicate);
    expect(() =>
      parseAuthenticatedFloodgateTrainingRowsCoreForTests(
        duplicateBytes,
        rawIdentity(duplicate, duplicateBytes),
      ),
    ).toThrow();

    const unsorted = cloneRows(canonical).reverse();
    const unsortedBytes = canonicalRawBytes(unsorted);
    expect(() =>
      parseAuthenticatedFloodgateTrainingRowsCoreForTests(
        unsortedBytes,
        rawIdentity(unsorted, unsortedBytes),
      ),
    ).toThrow();
  });

  it("rejects every expected raw-identity mismatch", () => {
    const rows = fixtureRows();
    const bytes = canonicalRawBytes(rows);
    const identity = rawIdentity(rows, bytes);
    const mismatches: readonly [string, Record<string, unknown>][] = [
      ["path", { ...identity, path: "other.raw.jsonl" }],
      ["format", { ...identity, format: "other-format" }],
      ["bytes", { ...identity, bytes: identity.bytes + 1 }],
      ["sha256", { ...identity, sha256: "0".repeat(64) }],
      ["records", { ...identity, records: identity.records + 1 }],
      ["games", { ...identity, games: identity.games + 1 }],
      ["game IDs", { ...identity, game_ids_sha256: "0".repeat(64) }],
      ["parent IDs", { ...identity, parent_ids_sha256: "0".repeat(64) }],
      [
        "position count",
        { ...identity, position_ids_count: identity.position_ids_count + 1 },
      ],
      ["position IDs", { ...identity, position_ids_sha256: "0".repeat(64) }],
    ];
    for (const [label, expected] of mismatches) {
      expect(
        () =>
          parseAuthenticatedFloodgateTrainingRowsCoreForTests(
            bytes,
            expected as unknown as FloodgateRoleBundleRawIdentity,
          ),
        label,
      ).toThrow();
    }
  });
});

describe("FD-held verified Floodgate training-row consumer", () => {
  it("passes only a frozen, receipt-bound training capability to one callback", async () => {
    const input = await fixture();
    const injected = dependencies(input.identity);
    let consumedRecords = 0;
    const consume = vi.fn(
      async (authenticated: Readonly<AuthenticatedFloodgateTrainingRows>) => {
        consumedRecords = authenticated.rows.length;
      },
    );

    const result = await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      input.options,
      consume,
      injected,
    );

    expect(result).toBeUndefined();
    expect(consumedRecords).toBe(input.rows.length);
    expect(injected.verifyBundle).toHaveBeenCalledTimes(1);
    expect(injected.verifyBundle).toHaveBeenCalledWith(input.options);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]).toHaveLength(1);
    const authenticated = consume.mock.calls[0][0];
    expect(Reflect.ownKeys(authenticated).sort()).toEqual(
      ["binding", "role", "rows", "schema"].sort(),
    );
    expect(authenticated.schema).toBe(FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA);
    expect(authenticated.role).toBe("training");
    expect(authenticated.rows).toEqual(projectedTrainingRows(input.rows));
    const expectedManifestIdentity = verifiedBundle(input.identity).result
      .manifest.identity;
    expect(authenticated.binding).toEqual({
      result_receipt_bytes: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
      result_receipt_sha256: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
      bundle_manifest_bytes: expectedManifestIdentity.bytes,
      bundle_manifest_sha256: expectedManifestIdentity.sha256,
      bundle_producer_revision: PRODUCER_REVISION,
      verifier_revision: VERIFIER_REVISION,
      raw_format: input.identity.format,
      raw_bytes: input.identity.bytes,
      raw_sha256: input.identity.sha256,
      records: input.identity.records,
      games: input.identity.games,
      game_ids_sha256: input.identity.game_ids_sha256,
      parent_ids_sha256: input.identity.parent_ids_sha256,
      position_ids_count: input.identity.position_ids_count,
      position_ids_sha256: input.identity.position_ids_sha256,
    });
    expect(Reflect.ownKeys(authenticated.binding)).not.toContain("path");
    expect(Object.isFrozen(authenticated)).toBe(true);
    expect(Object.isFrozen(authenticated.binding)).toBe(true);
    expect(Object.isFrozen(authenticated.rows)).toBe(true);
    expect(authenticated.rows.every((row) => Object.isFrozen(row))).toBe(true);
  });

  it.runIf(typeof process.getuid === "function")(
    "captures getuid without calling it at import and refreshes it exactly once per snapshot",
    async () => {
      const first = await fixture();
      const second = await fixture();
      const getuidDescriptor = Object.getOwnPropertyDescriptor(
        process,
        "getuid",
      );
      if (
        getuidDescriptor === undefined ||
        !("value" in getuidDescriptor) ||
        typeof getuidDescriptor.value !== "function"
      ) {
        throw new Error("process.getuid data descriptor is unavailable");
      }
      const originalGetuid = getuidDescriptor.value as () => number;
      const consumerModule = "../../../ml/floodgate-training-row-consumer";
      let capturedCalls = 0;
      let wrongThisCalls = 0;
      let replacementCalls = 0;

      Object.defineProperty(process, "getuid", {
        ...getuidDescriptor,
        value: function capturedGetuid(this: unknown): number {
          capturedCalls += 1;
          if (this !== process) {
            wrongThisCalls += 1;
            throw new Error("captured process.getuid received the wrong this");
          }
          return Reflect.apply(originalGetuid, this, []) as number;
        },
      });
      vi.doUnmock(consumerModule);
      vi.resetModules();

      try {
        const freshConsumer = await import(consumerModule);
        expect(capturedCalls).toBe(0);

        Object.defineProperty(process, "getuid", {
          ...getuidDescriptor,
          value: function replacementGetuid(): never {
            replacementCalls += 1;
            throw new Error("replacement process.getuid must not be called");
          },
        });

        await freshConsumer.withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          first.options,
          async () => undefined,
          dependencies(first.identity),
        );
        expect(capturedCalls).toBe(1);
        expect(wrongThisCalls).toBe(0);
        expect(replacementCalls).toBe(0);

        await freshConsumer.withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          second.options,
          async () => undefined,
          dependencies(second.identity),
        );
        expect(capturedCalls).toBe(2);
        expect(wrongThisCalls).toBe(0);
        expect(replacementCalls).toBe(0);
      } finally {
        Object.defineProperty(process, "getuid", getuidDescriptor);
        vi.doUnmock(consumerModule);
        vi.resetModules();
      }
    },
  );

  it("rejects structural forgeries, active clones, and active proxies by exact identity", async () => {
    const input = await fixture();
    const forged = structurallyForgedAuthenticatedInput(input);
    const forgedProxy = new Proxy(forged, {});

    for (const candidate of [forged, forgedProxy]) {
      expect(() =>
        claimActiveVerifiedPinnedFloodgateTrainingRows(candidate),
      ).toThrow(
        /production runtime claim requires the exact active unclaimed input/,
      );
      expect(() =>
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(candidate),
      ).toThrow(
        /test-only runtime claim requires the exact active unclaimed input/,
      );
    }

    await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      input.options,
      async (authenticated) => {
        const clone = Object.freeze({
          ...authenticated,
          binding: Object.freeze({ ...authenticated.binding }),
          rows: Object.freeze(
            authenticated.rows.map((row) => Object.freeze({ ...row })),
          ),
        });
        const activeProxy = new Proxy(authenticated, {});
        const prototypeChild = Object.create(
          authenticated,
        ) as Readonly<AuthenticatedFloodgateTrainingRows>;
        const invalidIdentities: readonly unknown[] = [
          clone,
          activeProxy,
          prototypeChild,
          authenticated.binding,
          authenticated.rows,
          null,
          undefined,
          false,
          0,
          "training",
        ];
        for (const candidate of invalidIdentities) {
          expect(() =>
            claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
              candidate as Readonly<AuthenticatedFloodgateTrainingRows>,
            ),
          ).toThrow(
            /test-only runtime claim requires the exact active unclaimed input/,
          );
        }
        expect(
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          ),
        ).toBeUndefined();
      },
      dependencies(input.identity),
    );
  });

  it("keeps dependency-injected claims isolated from production and single-use", async () => {
    const input = await fixture();
    let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;

    await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      input.options,
      async (authenticated) => {
        captured = authenticated;
        expect(() =>
          claimActiveVerifiedPinnedFloodgateTrainingRows(authenticated),
        ).toThrow(
          /production runtime claim requires the exact active unclaimed input/,
        );
        expect(
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          ),
        ).toBeUndefined();
        expect(() =>
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          ),
        ).toThrow(
          /test-only runtime claim requires the exact active unclaimed input/,
        );
        expect(() =>
          claimActiveVerifiedPinnedFloodgateTrainingRows(authenticated),
        ).toThrow(
          /production runtime claim requires the exact active unclaimed input/,
        );
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        expect(() =>
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          ),
        ).toThrow(
          /test-only runtime claim requires the exact active unclaimed input/,
        );
      },
      dependencies(input.identity),
    );

    const expired = captured as Readonly<AuthenticatedFloodgateTrainingRows>;
    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(expired),
    ).toThrow(
      /test-only runtime claim requires the exact active unclaimed input/,
    );
    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRows(expired),
    ).toThrow(
      /production runtime claim requires the exact active unclaimed input/,
    );
  });

  it("arms only the production registry through the production wrapper", async () => {
    const input = await fixture();
    const syntheticBundle = verifiedBundle(input.identity);
    const verifyBundle = vi.fn(async () => syntheticBundle);
    const roleBundleResultModule = "../../../ml/floodgate-role-bundle-result";

    vi.resetModules();
    vi.doMock(roleBundleResultModule, async () => {
      const actual = (await vi.importActual(roleBundleResultModule)) as Record<
        string,
        unknown
      >;
      return {
        ...actual,
        FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY:
          syntheticBundle.result.manifest.identity,
        verifyPinnedFloodgateRoleBundleReceipt: verifyBundle,
      };
    });

    try {
      const productionModule =
        await import("../../../ml/floodgate-training-row-consumer");
      let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;

      await productionModule.withVerifiedPinnedFloodgateTrainingRows(
        input.options,
        async (authenticated) => {
          captured = authenticated;
          expect(() =>
            productionModule.claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
              authenticated,
            ),
          ).toThrow(
            /test-only runtime claim requires the exact active unclaimed input/,
          );
          expect(
            productionModule.claimActiveVerifiedPinnedFloodgateTrainingRows(
              authenticated,
            ),
          ).toBeUndefined();
          expect(() =>
            productionModule.claimActiveVerifiedPinnedFloodgateTrainingRows(
              authenticated,
            ),
          ).toThrow(
            /production runtime claim requires the exact active unclaimed input/,
          );
        },
      );

      expect(verifyBundle).toHaveBeenCalledTimes(1);
      expect(() =>
        productionModule.claimActiveVerifiedPinnedFloodgateTrainingRows(
          captured as Readonly<AuthenticatedFloodgateTrainingRows>,
        ),
      ).toThrow(
        /production runtime claim requires the exact active unclaimed input/,
      );
    } finally {
      vi.doUnmock(roleBundleResultModule);
      vi.resetModules();
    }
  });

  it("uses captured native WeakSet methods for activation, claim, and cleanup", async () => {
    const input = await fixture();
    const addDescriptor = Object.getOwnPropertyDescriptor(
      WeakSet.prototype,
      "add",
    );
    const deleteDescriptor = Object.getOwnPropertyDescriptor(
      WeakSet.prototype,
      "delete",
    );
    if (addDescriptor === undefined || deleteDescriptor === undefined) {
      throw new Error("WeakSet prototype methods are unavailable");
    }
    let poisonCalls = 0;
    let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;
    let operationFailure: unknown;

    Object.defineProperty(WeakSet.prototype, "add", {
      ...addDescriptor,
      value: () => {
        poisonCalls += 1;
        throw new Error("poisoned WeakSet.prototype.add");
      },
    });
    Object.defineProperty(WeakSet.prototype, "delete", {
      ...deleteDescriptor,
      value: () => {
        poisonCalls += 1;
        throw new Error("poisoned WeakSet.prototype.delete");
      },
    });
    try {
      await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        async (authenticated) => {
          captured = authenticated;
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          );
        },
        dependencies(input.identity),
      );
    } catch (error) {
      operationFailure = error;
    } finally {
      Object.defineProperty(WeakSet.prototype, "add", addDescriptor);
      Object.defineProperty(WeakSet.prototype, "delete", deleteDescriptor);
    }

    expect(operationFailure).toBeUndefined();
    expect(poisonCalls).toBe(0);
    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        captured as Readonly<AuthenticatedFloodgateTrainingRows>,
      ),
    ).toThrow(
      /test-only runtime claim requires the exact active unclaimed input/,
    );
  });

  it.each(["resolve", "reject"] as const)(
    "revokes an unclaimed test identity when a callback returns a Promise that will %s",
    async (outcome) => {
      const input = await fixture();
      const failure = new Error("callback rejected after receiving input");
      let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;
      const operation = withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        (authenticated) => {
          captured = authenticated;
          return outcome === "resolve"
            ? Promise.resolve(undefined)
            : Promise.reject(failure);
        },
        dependencies(input.identity),
      );

      if (outcome === "resolve") {
        await expect(operation).resolves.toBeUndefined();
      } else {
        await expect(operation).rejects.toBe(failure);
      }
      const expired = captured as Readonly<AuthenticatedFloodgateTrainingRows>;
      expect(() =>
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(expired),
      ).toThrow(
        /test-only runtime claim requires the exact active unclaimed input/,
      );
    },
  );

  it("revokes an unclaimed identity before its callback Promise settles", async () => {
    const input = await fixture();
    const callbackEntered = deferred();
    const releaseCallback = deferred();
    let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;
    const operation = withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      input.options,
      async (authenticated) => {
        captured = authenticated;
        callbackEntered.resolve();
        await releaseCallback.promise;
      },
      dependencies(input.identity),
    );

    await callbackEntered.promise;
    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        captured as Readonly<AuthenticatedFloodgateTrainingRows>,
      ),
    ).toThrow(
      /test-only runtime claim requires the exact active unclaimed input/,
    );

    releaseCallback.resolve();
    await expect(operation).resolves.toBeUndefined();
  });

  it.each(["queueMicrotask", "settled Promise reaction"] as const)(
    "rejects a claim scheduled by the callback through %s",
    async (schedule) => {
      const input = await fixture();
      const attempted = deferred();
      let lateClaimError: unknown;

      await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        (authenticated) => {
          const attemptClaim = () => {
            try {
              claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
                authenticated,
              );
            } catch (error) {
              lateClaimError = error;
            } finally {
              attempted.resolve();
            }
          };
          const settled = Promise.resolve();
          if (schedule === "queueMicrotask") {
            queueMicrotask(attemptClaim);
          } else {
            void settled.then(attemptClaim);
          }
          return settled;
        },
        dependencies(input.identity),
      );

      await attempted.promise;
      expect(lateClaimError).toBeInstanceOf(Error);
      expect((lateClaimError as Error).message).toMatch(
        /test-only runtime claim requires the exact active unclaimed input/,
      );
    },
  );

  it("revokes a claimed identity after a synchronous callback throw", async () => {
    const input = await fixture();
    const failure = new Error("callback threw after claiming input");
    let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;

    await expect(
      withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        (authenticated) => {
          captured = authenticated;
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          );
          throw failure;
        },
        dependencies(input.identity),
      ),
    ).rejects.toBe(failure);

    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        captured as Readonly<AuthenticatedFloodgateTrainingRows>,
      ),
    ).toThrow(
      /test-only runtime claim requires the exact active unclaimed input/,
    );
  });

  it("keeps concurrent synchronous claims isolated after callbacks suspend", async () => {
    const first = await fixture();
    const second = await fixture();
    const firstStarted = deferred();
    const secondStarted = deferred();
    const releaseFirst = deferred();
    const releaseSecond = deferred();
    let firstAuthenticated:
      Readonly<AuthenticatedFloodgateTrainingRows> | undefined;
    let secondAuthenticated:
      Readonly<AuthenticatedFloodgateTrainingRows> | undefined;

    const firstOperation = withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      first.options,
      async (authenticated) => {
        firstAuthenticated = authenticated;
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          authenticated,
        );
        firstStarted.resolve();
        await releaseFirst.promise;
      },
      dependencies(first.identity),
    );
    await firstStarted.promise;
    const secondOperation = withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      second.options,
      async (authenticated) => {
        secondAuthenticated = authenticated;
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          authenticated,
        );
        secondStarted.resolve();
        await releaseSecond.promise;
      },
      dependencies(second.identity),
    );
    await secondStarted.promise;

    const firstActive =
      firstAuthenticated as Readonly<AuthenticatedFloodgateTrainingRows>;
    const secondActive =
      secondAuthenticated as Readonly<AuthenticatedFloodgateTrainingRows>;
    expect(firstActive).not.toBe(secondActive);
    try {
      expect(() =>
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(firstActive),
      ).toThrow(
        /test-only runtime claim requires the exact active unclaimed input/,
      );
      expect(() =>
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          secondActive,
        ),
      ).toThrow(
        /test-only runtime claim requires the exact active unclaimed input/,
      );

      releaseFirst.resolve();
      await expect(firstOperation).resolves.toBeUndefined();
      expect(() =>
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(firstActive),
      ).toThrow(
        /test-only runtime claim requires the exact active unclaimed input/,
      );
      expect(() =>
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          secondActive,
        ),
      ).toThrow(
        /test-only runtime claim requires the exact active unclaimed input/,
      );
    } finally {
      releaseFirst.resolve();
      releaseSecond.resolve();
      await Promise.allSettled([firstOperation, secondOperation]);
    }
    await expect(secondOperation).resolves.toBeUndefined();
    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(secondActive),
    ).toThrow(
      /test-only runtime claim requires the exact active unclaimed input/,
    );
  });

  it("keeps nested synchronous claims isolated", async () => {
    const outer = await fixture();
    const inner = await fixture();
    let innerAuthenticated:
      Readonly<AuthenticatedFloodgateTrainingRows> | undefined;
    let outerAuthenticated:
      Readonly<AuthenticatedFloodgateTrainingRows> | undefined;

    await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      outer.options,
      async (authenticatedOuter) => {
        outerAuthenticated = authenticatedOuter;
        expect(
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticatedOuter,
          ),
        ).toBeUndefined();
        await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          inner.options,
          async (authenticatedInner) => {
            innerAuthenticated = authenticatedInner;
            expect(
              claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
                authenticatedInner,
              ),
            ).toBeUndefined();
          },
          dependencies(inner.identity),
        );
        expect(() =>
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            innerAuthenticated as Readonly<AuthenticatedFloodgateTrainingRows>,
          ),
        ).toThrow(
          /test-only runtime claim requires the exact active unclaimed input/,
        );
        expect(() =>
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticatedOuter,
          ),
        ).toThrow(
          /test-only runtime claim requires the exact active unclaimed input/,
        );
      },
      dependencies(outer.identity),
    );

    for (const expired of [innerAuthenticated, outerAuthenticated]) {
      expect(() =>
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          expired as Readonly<AuthenticatedFloodgateTrainingRows>,
        ),
      ).toThrow(
        /test-only runtime claim requires the exact active unclaimed input/,
      );
    }
  });

  it("revokes a claimed identity before a failing postflight completes", async () => {
    const input = await fixture();
    let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;

    await expect(
      withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        async (authenticated) => {
          captured = authenticated;
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          );
          await overwriteOneByte(input.trainingPath);
        },
        dependencies(input.identity),
      ),
    ).rejects.toThrow(/changed across the callback boundary/);

    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        captured as Readonly<AuthenticatedFloodgateTrainingRows>,
      ),
    ).toThrow(
      /test-only runtime claim requires the exact active unclaimed input/,
    );
  });

  it("captures options before I/O and ignores later caller mutation", async () => {
    const input = await fixture();
    const originalOutputRoot = input.options.outputRoot;
    const mutable = { ...input.options };
    const injected = dependencies(input.identity);
    let consumed = false;
    const pending = withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      mutable,
      async () => {
        consumed = true;
      },
      injected,
    );
    mutable.outputRoot = path.join(input.container, "attacker-replacement");

    await expect(pending).resolves.toBeUndefined();
    expect(consumed).toBe(true);
    expect(injected.verifyBundle).toHaveBeenCalledWith(
      expect.objectContaining({ outputRoot: originalOutputRoot }),
    );
    expect(Object.isFrozen(injected.verifyBundle.mock.calls[0][0])).toBe(true);
  });

  it("keeps postflight checks alive when a callback poisons public stat methods", async () => {
    const input = await fixture();
    const probeHandle = await fs.promises.open(input.trainingPath, "r");
    const fileHandlePrototype = Object.getPrototypeOf(probeHandle) as object;
    await probeHandle.close();
    const defineProperty = Object.defineProperty;
    const targets: readonly (readonly [object, PropertyKey])[] = [
      [fs.promises, "lstat"],
      [fileHandlePrototype, "stat"],
    ];
    const descriptors = targets.map((entry) =>
      Object.getOwnPropertyDescriptor(entry[0], entry[1]),
    );
    let consumed = false;
    try {
      await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        async () => {
          for (let index = 0; index < targets.length; index += 1) {
            const target = targets[index][0];
            const key = targets[index][1];
            defineProperty(target, key, {
              configurable: true,
              writable: true,
              value: () => {
                throw new Error("poisoned public stat method");
              },
            });
          }
          consumed = true;
        },
        dependencies(input.identity),
      );
    } finally {
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index][0];
        const key = targets[index][1];
        const descriptor = descriptors[index];
        if (descriptor !== undefined) defineProperty(target, key, descriptor);
      }
    }
    expect(consumed).toBe(true);
  });

  it("boxes fulfilled objects against hostile then assimilation in isolation", async () => {
    const script = String.raw`
const {
  guardFloodgateTrainingNativePromiseCoreForTests: guard,
} = require("./ml/floodgate-training-row-consumer.ts");

const originalObjectThen = Object.getOwnPropertyDescriptor(Object.prototype, "then");
const originalArrayThen = Object.getOwnPropertyDescriptor(Array.prototype, "then");
const originalConstructor = Object.getOwnPropertyDescriptor(Promise.prototype, "constructor");
const originalPromiseThen = Object.getOwnPropertyDescriptor(Promise.prototype, "then");
const define = Object.defineProperty;
const original = { dev: 2n };
const errors = [new Error("close failed")];
const settledObject = Promise.resolve(original);
const settledArray = Promise.resolve(errors);

(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  define(Object.prototype, "then", {
    configurable: true,
    value(resolve) { resolve(Object.assign(Object.create(null), { dev: 1n })); },
  });
  define(Array.prototype, "then", {
    configurable: true,
    value(resolve) { resolve([]); },
  });
  define(Promise.prototype, "constructor", {
    configurable: true,
    value: function EvilSpecies(executor) {
      executor(() => undefined, () => undefined);
      return Object.create(null);
    },
  });
  define(Promise.prototype, "then", {
    configurable: true,
    value(resolve) { if (typeof resolve === "function") resolve("forged"); },
  });
  try {
    const objectBox = await guard(settledObject, "object stat");
    if (objectBox.value !== original || objectBox.value.dev !== 2n) {
      throw new Error("object fulfillment was re-assimilated");
    }
    const arrayBox = await guard(settledArray, "close errors");
    if (arrayBox.value !== errors || arrayBox.value.length !== 1) {
      throw new Error("array fulfillment was re-assimilated");
    }
  } finally {
    if (originalObjectThen) define(Object.prototype, "then", originalObjectThen);
    else delete Object.prototype.then;
    if (originalArrayThen) define(Array.prototype, "then", originalArrayThen);
    else delete Array.prototype.then;
    if (originalConstructor) define(Promise.prototype, "constructor", originalConstructor);
    if (originalPromiseThen) define(Promise.prototype, "then", originalPromiseThen);
  }
  process.stdout.write("boxed-pass");
})().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error));
  process.exitCode = 1;
});
`;
    const { stdout, stderr } = await execFile(
      process.execPath,
      ["-r", "tsx/cjs", "-e", script],
      {
        cwd: process.cwd(),
        timeout: 10_000,
        maxBuffer: 1_048_576,
      },
    );
    expect(stderr).toBe("");
    expect(stdout).toBe("boxed-pass");
  });

  it("never invokes the callback when pinned bundle verification fails", async () => {
    const input = await fixture();
    const failure = new Error("independent pinned verification failed");
    const consume = vi.fn(() => Promise.resolve(undefined));
    const verifyBundle = vi.fn(() => Promise.reject(failure));

    await expect(
      withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        consume,
        {
          verifyBundle,
          expectedManifestIdentity: verifiedBundle(input.identity).result
            .manifest.identity,
        },
      ),
    ).rejects.toBe(failure);
    expect(verifyBundle).toHaveBeenCalledTimes(1);
    expect(consume).not.toHaveBeenCalled();
  });

  it("rejects hostile verified-object capabilities and binding mismatches", async () => {
    const input = await fixture();
    const base = verifiedBundle(input.identity) as unknown as Record<
      string,
      unknown
    >;
    const baseResult = base.result as Record<string, unknown>;
    const baseResultManifest = baseResult.manifest as Record<string, unknown>;
    const receiptManifest = baseResultManifest.value as Record<string, unknown>;
    const receiptRoles = receiptManifest.roles as Record<string, unknown>;
    const receiptTraining = receiptRoles.training as Record<string, unknown>;
    const cases: readonly [string, Record<string, unknown>][] = [
      [
        "capability-valued producer revision",
        {
          ...base,
          producerRevision: {
            path: input.trainingPath,
            rawBytes: input.bytes,
          },
        },
      ],
      [
        "Proxy manifest",
        { ...base, manifest: new Proxy(base.manifest as object, {}) },
      ],
      [
        "unrequested verifier revision",
        { ...base, verifierRevision: "c".repeat(40) },
      ],
      [
        "result/current raw mismatch",
        {
          ...base,
          result: {
            ...baseResult,
            manifest: {
              ...baseResultManifest,
              value: {
                ...receiptManifest,
                roles: {
                  ...receiptRoles,
                  training: {
                    ...receiptTraining,
                    raw_parents: {
                      ...input.identity,
                      sha256: "0".repeat(64),
                    },
                  },
                },
              },
            },
          },
        },
      ],
      [
        "coordinated non-training manifest substitution",
        (() => {
          const changedManifest = {
            ...receiptManifest,
            roles: {
              ...receiptRoles,
              fresh_selection: { path: input.trainingPath },
            },
          };
          return {
            ...base,
            manifest: changedManifest,
            result: {
              ...baseResult,
              manifest: {
                ...baseResultManifest,
                value: changedManifest,
              },
            },
          };
        })(),
      ],
    ];

    for (const [label, candidate] of cases) {
      const consume = vi.fn(() => Promise.resolve(undefined));
      await expect(
        withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          input.options,
          consume,
          {
            verifyBundle: async () =>
              candidate as unknown as Readonly<VerifiedPinnedFloodgateRoleBundle>,
            expectedManifestIdentity: verifiedBundle(input.identity).result
              .manifest.identity,
          },
        ),
        label,
      ).rejects.toThrow();
      expect(consume, label).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["synchronous value", (): undefined => undefined],
    [
      "plain thenable",
      (): { readonly then: () => undefined } => ({ then: () => undefined }),
    ],
  ] as const)("rejects a callback returning a %s", async (_label, callback) => {
    const input = await fixture();
    let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;
    await expect(
      withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        ((authenticated: Readonly<AuthenticatedFloodgateTrainingRows>) => {
          captured = authenticated;
          return callback();
        }) as unknown as (
          authenticated: Readonly<AuthenticatedFloodgateTrainingRows>,
        ) => Promise<void>,
        dependencies(input.identity),
      ),
    ).rejects.toThrow(/native Promise/);
    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        captured as Readonly<AuthenticatedFloodgateTrainingRows>,
      ),
    ).toThrow(
      /test-only runtime claim requires the exact active unclaimed input/,
    );
  });

  it("rejects a native callback Promise that resolves with a value", async () => {
    const input = await fixture();
    let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;
    await expect(
      withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        ((authenticated: Readonly<AuthenticatedFloodgateTrainingRows>) => {
          captured = authenticated;
          return Promise.resolve("must stay in private staging");
        }) as unknown as (
          authenticated: Readonly<AuthenticatedFloodgateTrainingRows>,
        ) => Promise<void>,
        dependencies(input.identity),
      ),
    ).rejects.toThrow(/without a return value/);
    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        captured as Readonly<AuthenticatedFloodgateTrainingRows>,
      ),
    ).toThrow(
      /test-only runtime claim requires the exact active unclaimed input/,
    );
  });

  it("waits for the original native Promise despite a hostile species", async () => {
    const input = await fixture();
    let resolveOriginal: (() => void) | undefined;
    let callbackStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      callbackStarted = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      resolveOriginal = () => resolve();
    });
    const EarlySpecies = function (
      executor: (
        resolve: (value?: unknown) => void,
        reject: (reason?: unknown) => void,
      ) => void,
    ): object {
      executor(
        () => undefined,
        () => undefined,
      );
      return Object.create(null);
    };
    Object.defineProperty(pending, "constructor", {
      configurable: true,
      value: { [Symbol.species]: EarlySpecies },
    });

    let settled = false;
    const operation = withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      input.options,
      () => {
        callbackStarted?.();
        return pending;
      },
      dependencies(input.identity),
    );
    operation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await started;
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(settled).toBe(false);

    resolveOriginal?.();
    await expect(operation).resolves.toBeUndefined();
  });

  it("propagates a synchronous callback throw and an asynchronous rejection", async () => {
    const input = await fixture();
    const thrown = new Error("callback threw synchronously");
    await expect(
      withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        () => {
          throw thrown;
        },
        dependencies(input.identity),
      ),
    ).rejects.toBe(thrown);

    const rejected = new Error("callback rejected asynchronously");
    await expect(
      withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        () => Promise.reject(rejected),
        dependencies(input.identity),
      ),
    ).rejects.toBe(rejected);
  });

  it("does not confuse a rejected undefined reason with success", async () => {
    const input = await fixture();
    let rejected = false;
    try {
      await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        () => Promise.reject(undefined),
        dependencies(input.identity),
      );
    } catch (error) {
      rejected = true;
      expect(error).toBeUndefined();
    }
    expect(rejected).toBe(true);
  });

  it.each(["symlink", "directory", "hardlink"] as const)(
    "rejects a %s training path before verification",
    async (kind) => {
      const input = await fixture();
      if (kind === "symlink") {
        const target = path.join(input.outputRoot, "symlink-target.raw.jsonl");
        await fs.promises.rename(input.trainingPath, target);
        await fs.promises.symlink(target, input.trainingPath);
      } else if (kind === "directory") {
        await fs.promises.unlink(input.trainingPath);
        await fs.promises.mkdir(input.trainingPath, { mode: 0o700 });
      } else {
        await fs.promises.link(
          input.trainingPath,
          path.join(input.outputRoot, "second-hardlink.raw.jsonl"),
        );
      }
      const injected = dependencies(input.identity);

      await expect(
        withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          input.options,
          () => Promise.resolve(undefined),
          injected,
        ),
      ).rejects.toThrow();
      expect(injected.verifyBundle).not.toHaveBeenCalled();
    },
  );

  it.each(["rename", "in-place write"] as const)(
    "rejects a training-file %s during bundle verification and skips consumption",
    async (kind) => {
      const input = await fixture();
      const consume = vi.fn(() => Promise.resolve(undefined));
      const verifyBundle = vi.fn(async () => {
        if (kind === "rename") await replaceTrainingPath(input);
        else await overwriteOneByte(input.trainingPath);
        return verifiedBundle(input.identity);
      });

      await expect(
        withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          input.options,
          consume,
          {
            verifyBundle,
            expectedManifestIdentity: verifiedBundle(input.identity).result
              .manifest.identity,
          },
        ),
      ).rejects.toThrow();
      expect(verifyBundle).toHaveBeenCalledTimes(1);
      expect(consume).not.toHaveBeenCalled();
    },
  );

  it.each(["rename", "in-place write"] as const)(
    "rejects a training-file %s during the callback",
    async (kind) => {
      const input = await fixture();
      const consume = vi.fn(async () => {
        if (kind === "rename") await replaceTrainingPath(input);
        else await overwriteOneByte(input.trainingPath);
      });

      await expect(
        withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          input.options,
          consume,
          dependencies(input.identity),
        ),
      ).rejects.toThrow();
      expect(consume).toHaveBeenCalledTimes(1);
    },
  );
});

describe("Floodgate training-row consumer article parity", () => {
  it("keeps the pinned identity, test evidence, and claim boundary bilingual", () => {
    const japanese = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/blog-shogi-floodgate-training-row-consumer.md",
      ),
      "utf8",
    );
    const english = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/blog-shogi-floodgate-training-row-consumer.en.md",
      ),
      "utf8",
    );
    const sharedFacts = [
      "15,369,952",
      "24,000",
      "1,000",
      "c9ee90da69135ead5dbb60cbab6eaa82ad018db791132dd4ec122d6088c37b62",
      "33/33",
      "Promise<void>",
      "input-integrity-only",
      "384",
      "768",
      "45%",
      "50%",
    ];
    for (const fact of sharedFacts) {
      expect(japanese).toContain(fact);
      expect(english).toContain(fact);
    }
  });
});

describe("Floodgate consumer runtime-claim article parity", () => {
  it("keeps the ephemeral provenance boundary bilingual", () => {
    const japanese = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/blog-shogi-floodgate-consumer-runtime-claim.md",
      ),
      "utf8",
    );
    const english = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/blog-shogi-floodgate-consumer-runtime-claim.en.md",
      ),
      "utf8",
    );
    const sharedFacts = [
      "PRODUCTION_RUNTIME_CLAIMS",
      "TEST_RUNTIME_CLAIMS",
      "WeakSet.delete",
      "single-use",
      "AsyncLocalStorage",
      "CoreForTests",
      "void",
      "47/47",
      "final holdout",
    ];
    for (const fact of sharedFacts) {
      expect(japanese).toContain(fact);
      expect(english).toContain(fact);
    }
  });
});
