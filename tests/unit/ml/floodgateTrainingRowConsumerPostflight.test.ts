import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
  FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
  type VerifiedPinnedFloodgateRoleBundle,
} from "../../../ml/floodgate-role-bundle-result";
import {
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
  FLOODGATE_TRAINING_RAW_FILENAME,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  claimActiveVerifiedPinnedFloodgateTrainingRows,
  claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  claimVerifiedFloodgateTrainingConsumerPostflight,
  claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests,
  withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests,
  withVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingConsumerPostflightReceipt,
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

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
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

function fixtureRows(): readonly FloodgateRoleBundleRawParent[] {
  const url =
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+synthetic-a+synthetic-b+20260101000000.csa";
  const gameId = floodgateCanonicalUrlGameId(url);
  const gameSha256 = sha256("synthetic lifecycle fixture; no real game");
  const moves = ["7g7f", "3c3d", "2g2f", "8c8d"] as const;
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
        parent_id: `sha256:${sha256(
          `parent-occurrence-v1\0${gameId}\0${ply}`,
        )}`,
        position_id: positionKeyFromSfen(parentSfen),
        parent_sfen: parentSfen,
        ply,
        played_move: move,
      });
    }
    parentSfen = childSfenAfterUsi(parentSfen, move);
  }
  return rows.sort((left, right) =>
    compareBytewise(left.parent_id, right.parent_id),
  );
}

function rawBytes(rows: readonly FloodgateRoleBundleRawParent[]): Uint8Array {
  return Buffer.from(`${rows.map((row) => canonicalJson(row)).join("\n")}\n`);
}

function rawIdentity(
  rows: readonly FloodgateRoleBundleRawParent[],
  bytes: Uint8Array,
): FloodgateRoleBundleRawIdentity {
  const gameIds = new Set(rows.map((row) => row.game_id));
  const parentIds = new Set(rows.map((row) => row.parent_id));
  const positionIds = new Set(rows.map((row) => row.position_id));
  return {
    path: FLOODGATE_TRAINING_RAW_FILENAME,
    format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    records: rows.length,
    games: gameIds.size,
    game_ids_sha256: floodgateIdentifierDigest(gameIds),
    parent_ids_sha256: floodgateIdentifierDigest(parentIds),
    position_ids_count: positionIds.size,
    position_ids_sha256: floodgateIdentifierDigest(positionIds),
  };
}

interface Fixture {
  readonly container: string;
  readonly outputRoot: string;
  readonly trainingPath: string;
  readonly identity: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly options: FloodgateTrainingRowConsumerOptions;
}

async function fixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-postflight-"),
  );
  const container = await fs.promises.realpath(created);
  temporaryRoots.push(container);
  await fs.promises.chmod(container, 0o700);
  const outputRoot = path.join(container, "bundle");
  await fs.promises.mkdir(outputRoot, { mode: 0o700 });
  await fs.promises.chmod(outputRoot, 0o700);
  const rows = fixtureRows();
  const bytes = rawBytes(rows);
  const trainingPath = path.join(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME);
  await fs.promises.writeFile(trainingPath, bytes, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(trainingPath, 0o600);
  return {
    container,
    outputRoot,
    trainingPath,
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
  vi.restoreAllMocks();
  vi.doUnmock("node:fs");
  vi.resetModules();
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
    pipeline: { source_revision: PRODUCER_REVISION, tracked_tree_clean: true },
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
    sha256: sha256(manifestText),
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
      manifest: { identity: manifestIdentity, value: manifest },
      execution: {},
      post_run_audit: {},
    },
  } as unknown as Readonly<VerifiedPinnedFloodgateRoleBundle>;
}

function dependencies(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): FloodgateTrainingRowConsumerDependencies {
  const verified = verifiedBundle(identity);
  return {
    verifyBundle: vi.fn(async () => verified),
    expectedManifestIdentity: verified.result.manifest.identity,
  };
}

function forbiddenCapabilityKeys(value: unknown): string[] {
  const forbidden = new Set([
    "fd",
    "path",
    "playing_strength",
    "rawBytes",
    "rows",
    "staged_output",
    "teacher_label",
  ]);
  const found = new Set<string>();
  const visited = new Set<object>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object") return;
    if (visited.has(candidate)) return;
    visited.add(candidate);
    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key === "string" && forbidden.has(key)) found.add(key);
      visit(Reflect.get(candidate, key));
    }
  };
  visit(value);
  return [...found].sort();
}

function deepFrozen(value: unknown, visited = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || visited.has(value)) {
    return true;
  }
  visited.add(value);
  return (
    Object.isFrozen(value) &&
    Reflect.ownKeys(value).every((key) =>
      deepFrozen(Reflect.get(value, key), visited),
    )
  );
}

async function successfulPostflight(
  input: Fixture,
): Promise<Readonly<FloodgateTrainingConsumerPostflightReceipt>> {
  return withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
    input.options,
    async (authenticated) => {
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(authenticated);
    },
    dependencies(input.identity),
  );
}

async function isolatedConsumerWithInstrumentedClose(
  events: string[],
  failTarget?: "raw" | "root",
): Promise<typeof import("../../../ml/floodgate-training-row-consumer")> {
  vi.resetModules();
  vi.doMock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    const originalOpen = actual.promises.open.bind(actual.promises);
    return {
      ...actual,
      promises: {
        ...actual.promises,
        open: async (...args: unknown[]) => {
          const handle = (await Reflect.apply(
            originalOpen,
            actual.promises,
            args,
          )) as fs.promises.FileHandle;
          const artifactPath = String(args[0]);
          const target = artifactPath.endsWith(FLOODGATE_TRAINING_RAW_FILENAME)
            ? "raw"
            : "root";
          const originalClose = handle.close.bind(handle);
          handle.close = async () => {
            events.push(`${target}:close:begin`);
            await originalClose();
            events.push(`${target}:close:end`);
            if (failTarget === target) {
              throw new Error(`${target} descriptor close failed`);
            }
          };
          return handle;
        },
      },
    };
  });
  return import("../../../ml/floodgate-training-row-consumer");
}

describe("Floodgate training consumer postflight capability", () => {
  it("mints one exact frozen receipt only after a claimed successful lifecycle", async () => {
    const input = await fixture();
    const receipt = await successfulPostflight(input);

    expect(Reflect.ownKeys(receipt)).toEqual([
      "schema",
      "status",
      "claim_boundary",
      "execution_boundary",
      "input",
      "runtime_claim",
      "postflight",
    ]);
    expect(receipt).toEqual({
      schema: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
      status: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
      claim_boundary: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
      execution_boundary: "test-only-injected-bundle-verifier",
      input: {
        schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
        role: "training",
        binding: {
          result_receipt_bytes: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
          result_receipt_sha256: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
          bundle_manifest_bytes: verifiedBundle(input.identity).result.manifest
            .identity.bytes,
          bundle_manifest_sha256: verifiedBundle(input.identity).result.manifest
            .identity.sha256,
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
        },
      },
      runtime_claim: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
      postflight: {
        callback_settled_without_value: true,
        filesystem_snapshot_revalidated_after_callback: true,
        input_descriptors_closed: true,
      },
    });
    expect(deepFrozen(receipt)).toBe(true);
    for (const capabilityObject of [
      receipt,
      receipt.input,
      receipt.input.binding,
      receipt.postflight,
    ]) {
      expect(Object.getPrototypeOf(capabilityObject)).toBeNull();
    }
    expect(forbiddenCapabilityKeys(receipt)).toEqual([]);
    expect(receipt.claim_boundary).toContain(
      "not-staged-output-teacher-label-or-playing-strength-evidence",
    );

    expect(
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(receipt),
    ).toBeUndefined();
    expect(() =>
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(receipt),
    ).toThrow(
      /test-only postflight claim requires the exact unclaimed receipt/,
    );
  });

  it("rejects clones, proxies, and the other registry without consuming the exact receipt", async () => {
    const input = await fixture();
    const receipt = await successfulPostflight(input);
    const clone = structuredClone(receipt);
    const proxy = new Proxy(receipt, {});

    for (const candidate of [clone, proxy]) {
      expect(() =>
        claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(candidate),
      ).toThrow(
        /test-only postflight claim requires the exact unclaimed receipt/,
      );
    }
    expect(() =>
      claimVerifiedFloodgateTrainingConsumerPostflight(receipt),
    ).toThrow(
      /production postflight claim requires the exact unclaimed receipt/,
    );
    expect(
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(receipt),
    ).toBeUndefined();
  });

  it("mints and claims production receipts only through the fixed production wrapper", async () => {
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
      const receipt =
        await productionModule.withVerifiedPinnedFloodgateTrainingRowsAndPostflight(
          input.options,
          async (authenticated) => {
            expect(() =>
              productionModule.claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
                authenticated,
              ),
            ).toThrow(/test-only runtime claim requires/);
            productionModule.claimActiveVerifiedPinnedFloodgateTrainingRows(
              authenticated,
            );
          },
        );

      expect(verifyBundle).toHaveBeenCalledOnce();
      expect(receipt.execution_boundary).toBe(
        "production-fixed-pinned-bundle-verifier",
      );
      expect(() =>
        productionModule.claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
          receipt,
        ),
      ).toThrow(/test-only postflight claim requires/);
      expect(
        productionModule.claimVerifiedFloodgateTrainingConsumerPostflight(
          receipt,
        ),
      ).toBeUndefined();
      expect(() =>
        productionModule.claimVerifiedFloodgateTrainingConsumerPostflight(
          receipt,
        ),
      ).toThrow(/production postflight claim requires/);
    } finally {
      vi.doUnmock(roleBundleResultModule);
      vi.resetModules();
    }
  });

  it("requires the callback to synchronously claim the exact input in the matching registry", async () => {
    const input = await fixture();
    let captured: Readonly<AuthenticatedFloodgateTrainingRows> | undefined;
    await expect(
      withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
        input.options,
        async (authenticated) => {
          captured = authenticated;
        },
        dependencies(input.identity),
      ),
    ).rejects.toThrow(/requires the exact input runtime claim/);

    await expect(
      withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
        input.options,
        async (authenticated) => {
          const clone = structuredClone(authenticated);
          expect(() =>
            claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(clone),
          ).toThrow(/exact active unclaimed input/);
          expect(() =>
            claimActiveVerifiedPinnedFloodgateTrainingRows(authenticated),
          ).toThrow(/production runtime claim requires/);
        },
        dependencies(input.identity),
      ),
    ).rejects.toThrow(/requires the exact input runtime claim/);

    expect(() =>
      claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        captured as Readonly<AuthenticatedFloodgateTrainingRows>,
      ),
    ).toThrow(/exact active unclaimed input/);
  });

  it("closes the claim window at synchronous callback return", async () => {
    const input = await fixture();
    let lateError: unknown;
    await expect(
      withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
        input.options,
        (authenticated) => {
          queueMicrotask(() => {
            try {
              claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
                authenticated,
              );
            } catch (error) {
              lateError = error;
            }
          });
          return Promise.resolve(undefined);
        },
        dependencies(input.identity),
      ),
    ).rejects.toThrow(/requires the exact input runtime claim/);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(lateError).toBeInstanceOf(Error);
    expect((lateError as Error).message).toMatch(
      /exact active unclaimed input/,
    );
  });

  it("rejects an unclaimed never-settling callback promptly and closes both descriptors", async () => {
    const input = await fixture();
    const events: string[] = [];
    const isolated = await isolatedConsumerWithInstrumentedClose(events);
    const operation =
      isolated.withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
        input.options,
        () => new Promise<void>(() => undefined),
        dependencies(input.identity),
      );

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await expect(
        Promise.race([
          operation,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error("postflight claim rejection timed out")),
              500,
            );
          }),
        ]),
      ).rejects.toThrow(/requires the exact input runtime claim/);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
    expect(events).toEqual([
      "raw:close:begin",
      "raw:close:end",
      "root:close:begin",
      "root:close:end",
    ]);
  });

  it("preserves the existing void API for callbacks that do not claim", async () => {
    const input = await fixture();
    const callback = vi.fn(async () => undefined);
    await expect(
      withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
        input.options,
        callback,
        dependencies(input.identity),
      ),
    ).resolves.toBeUndefined();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("returns and registers the receipt only after both descriptor closes finish", async () => {
    const input = await fixture();
    const events: string[] = [];
    const isolated = await isolatedConsumerWithInstrumentedClose(events);

    const receipt =
      await isolated.withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
        input.options,
        async (authenticated) => {
          isolated.claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          );
          events.push("callback:settled");
        },
        dependencies(input.identity),
      );
    events.push("receipt:returned");

    expect(events).toEqual([
      "callback:settled",
      "raw:close:begin",
      "raw:close:end",
      "root:close:begin",
      "root:close:end",
      "receipt:returned",
    ]);
    expect(
      isolated.claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
        receipt,
      ),
    ).toBeUndefined();
  });

  it.each(["synchronous throw", "asynchronous rejection"] as const)(
    "does not mint a receipt after a callback %s",
    async (outcome) => {
      const input = await fixture();
      const failure = new Error(outcome);
      const operation =
        withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
          input.options,
          (authenticated) => {
            claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
              authenticated,
            );
            if (outcome === "synchronous throw") throw failure;
            return Promise.reject(failure);
          },
          dependencies(input.identity),
        );
      await expect(operation).rejects.toBe(failure);
    },
  );

  it("does not mint a receipt when the callback resolves with a value", async () => {
    const input = await fixture();
    await expect(
      withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
        input.options,
        ((authenticated: Readonly<AuthenticatedFloodgateTrainingRows>) => {
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          );
          return Promise.resolve("not void");
        }) as unknown as (
          input: Readonly<AuthenticatedFloodgateTrainingRows>,
        ) => Promise<void>,
        dependencies(input.identity),
      ),
    ).rejects.toThrow(/without a return value/);
  });

  it("does not mint after a post-callback snapshot mutation", async () => {
    const input = await fixture();
    await expect(
      withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
        input.options,
        async (authenticated) => {
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
            authenticated,
          );
          const handle = await fs.promises.open(input.trainingPath, "r+");
          try {
            await handle.write(Buffer.from("X"), 0, 1, 8);
            await handle.sync();
          } finally {
            await handle.close();
          }
        },
        dependencies(input.identity),
      ),
    ).rejects.toThrow(/changed across the callback boundary/);
  });

  it.each(["raw", "root"] as const)(
    "does not mint when the %s descriptor close fails",
    async (target) => {
      const input = await fixture();
      const events: string[] = [];
      const isolated = await isolatedConsumerWithInstrumentedClose(
        events,
        target,
      );

      await expect(
        isolated.withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
          input.options,
          async (authenticated) => {
            isolated.claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
              authenticated,
            );
          },
          dependencies(input.identity),
        ),
      ).rejects.toThrow(/failed to close Floodgate training descriptors/);
      expect(events).toEqual([
        "raw:close:begin",
        "raw:close:end",
        "root:close:begin",
        "root:close:end",
      ]);
    },
  );
});
