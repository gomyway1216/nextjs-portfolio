import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS,
  withFloodgateStableWasmDeadlineReadOnlyAssetsCoreForTests,
} from "../../../ml/floodgate-stable-wasm-deadline-read-only-assets";
import { captureFloodgateStableWasmDeadlineRegistryApplicationSourceCoreForTests } from "../../../ml/floodgate-stable-wasm-deadline-read-only-application-source";
import {
  FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES,
  claimFloodgateStableWasmDeadlineConsumerPostflightCoreForTests,
  claimFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests,
  withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests,
} from "../../../ml/floodgate-stable-wasm-deadline-read-only-consumer";
import {
  FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME,
  FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS,
  FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
  claimFloodgateStableWasmDeadlineReadOnlyRegistryCoreForTests,
  loadFloodgateStableWasmDeadlineReadOnlyRegistryCoreForTests,
  type FloodgateStableWasmDeadlineReadOnlyConsumerOptions,
} from "../../../ml/floodgate-stable-wasm-deadline-read-only-registry";
import {
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
  assertFloodgateStableWasmDeadlineDiagnosticEntrypointContextCoreForTests,
  captureFloodgateStableWasmDeadlineDiagnosticSourceProvenanceCoreForTests,
  resolveFloodgateStableWasmDeadlineDiagnosticSourceRootCoreForTests,
} from "../../../ml/floodgate-stable-wasm-deadline-diagnostic-source-provenance";
import {
  FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
  parseAuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingRawIdentity,
} from "../../../ml/floodgate-training-row-validation";
import { parseAuthenticatedFloodgateTrainingRowsCoreForTests } from "../../../ml/floodgate-training-row-consumer";
import { floodgateCanonicalUrlGameId } from "../../../ml/floodgate-raw-lock";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import { childSfenAfterUsi } from "../../../ml/shogi-sfen";
import { compareBytewise, positionKeyFromSfen } from "../../../ml/sibling-data";

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const VERIFIER_REVISION = "b".repeat(40);
const PRODUCER_REVISION = "a".repeat(40);
const temporaryRoots: string[] = [];

interface RawRow {
  readonly game_id: string;
  readonly game_sha256: string;
  readonly parent_id: string;
  readonly parent_sfen: string;
  readonly played_move: string;
  readonly ply: number;
  readonly position_id: string;
  readonly schema_version: 1;
  readonly source: "floodgate";
  readonly source_url: string;
}

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

function sourceUrl(index: number): string {
  const timestamp = String(index).padStart(6, "0");
  return `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+deadline-a+deadline-b+20260101${timestamp}.csa`;
}

function gameRows(
  index: number,
  moves: readonly [string, string, string, string],
): RawRow[] {
  const url = sourceUrl(index);
  const gameId = floodgateCanonicalUrlGameId(url);
  const gameSha256 = sha256(`synthetic deadline fixture ${index}`);
  let parentSfen = START_SFEN;
  const rows: RawRow[] = [];
  for (let ply = 0; ply < moves.length; ply += 1) {
    const move = moves[ply];
    if (ply >= 2) {
      rows.push({
        game_id: gameId,
        game_sha256: gameSha256,
        parent_id: `sha256:${sha256(
          `parent-occurrence-v1\0${gameId}\0${ply}`,
        )}`,
        parent_sfen: parentSfen,
        played_move: move,
        ply,
        position_id: positionKeyFromSfen(parentSfen),
        schema_version: 1,
        source: "floodgate",
        source_url: url,
      });
    }
    parentSfen = childSfenAfterUsi(parentSfen, move);
  }
  return rows;
}

function fixtureRows(): readonly RawRow[] {
  return [
    ...gameRows(1, ["7g7f", "3c3d", "2g2f", "8c8d"]),
    ...gameRows(2, ["2g2f", "8c8d", "7g7f", "3c3d"]),
  ].sort((left, right) => compareBytewise(left.parent_id, right.parent_id));
}

function rawBytes(rows: readonly RawRow[]): Buffer {
  return Buffer.from(`${rows.map((row) => canonicalJson(row)).join("\n")}\n`);
}

function rawIdentity(
  rows: readonly RawRow[],
  bytes: Uint8Array,
): Readonly<FloodgateTrainingRawIdentity> {
  const gameIds = new Set(rows.map((row) => row.game_id));
  const parentIds = new Set(rows.map((row) => row.parent_id));
  const positionIds = new Set(rows.map((row) => row.position_id));
  return Object.freeze({
    bytes: bytes.byteLength,
    format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
    game_ids_sha256: floodgateIdentifierDigest(gameIds),
    games: gameIds.size,
    parent_ids_sha256: floodgateIdentifierDigest(parentIds),
    path: "training.raw.jsonl" as const,
    position_ids_count: positionIds.size,
    position_ids_sha256: floodgateIdentifierDigest(positionIds),
    records: rows.length,
    sha256: sha256(bytes),
  });
}

async function temporaryRoot(prefix: string): Promise<string> {
  const created = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  await fs.promises.chmod(root, 0o700);
  return root;
}

async function mkdirPrivate(directory: string): Promise<void> {
  const temporaryDirectory = await fs.promises.realpath(os.tmpdir());
  const relativeDirectory = path.relative(temporaryDirectory, directory);
  if (
    relativeDirectory.length === 0 ||
    relativeDirectory === ".." ||
    relativeDirectory.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeDirectory)
  ) {
    throw new Error(
      "private fixture directory must be below the system temp root",
    );
  }
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  let current = temporaryDirectory;
  for (const component of relativeDirectory.split(path.sep)) {
    if (component.length === 0) continue;
    current = path.join(current, component);
    await fs.promises.chmod(current, 0o700);
  }
}

async function writePrivate(
  filename: string,
  bytes: Uint8Array | string,
): Promise<void> {
  await fs.promises.writeFile(filename, bytes, { mode: 0o600 });
  await fs.promises.chmod(filename, 0o600);
}

interface ConsumerFixture {
  readonly dependencies: Parameters<
    typeof withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests
  >[2];
  readonly manifestPath: string;
  readonly options: FloodgateStableWasmDeadlineReadOnlyConsumerOptions;
  readonly outputRoot: string;
  readonly receiptPath: string;
  readonly rows: readonly RawRow[];
  readonly trainingPath: string;
  readonly verifyCalls: string[];
}

async function consumerFixture(): Promise<ConsumerFixture> {
  const root = await temporaryRoot("deadline-read-only-consumer-");
  const outputRoot = path.join(root, "bundle");
  const repositoryRoot = path.join(root, "repository");
  await mkdirPrivate(outputRoot);
  await mkdirPrivate(path.join(repositoryRoot, "ml", "protocols"));
  const rows = fixtureRows();
  const trainingBytes = rawBytes(rows);
  const identity = rawIdentity(rows, trainingBytes);
  const contents = new Map<string, Buffer>(
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.filter(
      (filename) => filename !== "manifest.json",
    ).map((filename) => [
      filename,
      filename === "training.raw.jsonl"
        ? trainingBytes
        : Buffer.from(`synthetic-${filename}\n`),
    ]),
  );
  const baseIdentity = (filename: string) => {
    const bytes = contents.get(filename);
    if (bytes === undefined) throw new Error("missing synthetic role file");
    return {
      bytes: bytes.byteLength,
      path: filename,
      sha256: sha256(bytes),
    };
  };
  const protectedIdentity = (filename: string) => ({
    ...baseIdentity(filename),
    count: 1,
    format: "sorted-unique-sha256-position-id-utf8-lf-v1",
    identifiers_sha256: sha256(`identifiers:${filename}`),
  });
  const syntheticRawIdentity = (filename: string) => ({
    ...baseIdentity(filename),
    format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
    game_ids_sha256: "1".repeat(64),
    games: 1,
    parent_ids_sha256: "2".repeat(64),
    position_ids_count: 1,
    position_ids_sha256: "3".repeat(64),
    records: 1,
  });
  const manifest = {
    contract: {},
    isolation: {},
    pipeline: {
      source_revision: PRODUCER_REVISION,
      tracked_tree_clean: true,
    },
    provenance: {},
    replay_exclusion: {
      identifiers: protectedIdentity("replay-excluded-position-ids.txt"),
      receipt: baseIdentity("replay-exclusion-receipt.json"),
      summary: {},
    },
    roles: {
      fresh_final_holdout: {
        protected_position_ids: protectedIdentity(
          "fresh-final-holdout.protected-position-ids.txt",
        ),
        raw_parents: syntheticRawIdentity("fresh-final-holdout.raw.jsonl"),
      },
      fresh_selection: {
        protected_position_ids: protectedIdentity(
          "fresh-selection.protected-position-ids.txt",
        ),
        raw_parents: syntheticRawIdentity("fresh-selection.raw.jsonl"),
      },
      training: {
        protected_position_ids: protectedIdentity(
          "training.protected-position-ids.txt",
        ),
        raw_parents: identity,
      },
    },
    schema: "shogi-floodgate-label-free-role-bundle-v2",
    sources: {},
    status: "complete-label-free-role-bundle",
  };
  const manifestBytes = Buffer.from(`${canonicalJson(manifest)}\n`);
  const manifestIdentity = Object.freeze({
    bytes: manifestBytes.byteLength,
    path: "manifest.json" as const,
    sha256: sha256(manifestBytes),
  });
  const receipt = {
    claim_boundary: "integrity-only-not-playing-strength-evidence",
    execution: {},
    manifest: {
      identity: manifestIdentity,
      value: manifest,
    },
    post_run_audit: {},
    schema: "shogi-floodgate-role-bundle-result-v1",
    status: "complete-label-free-role-bundle",
  };
  const receiptBytes = Buffer.from(`${canonicalJson(receipt)}\n`);
  const receiptIdentity = Object.freeze({
    bytes: receiptBytes.byteLength,
    path: "ml/protocols/floodgate-q1-2026-role-bundle-result.json" as const,
    sha256: sha256(receiptBytes),
  });
  for (const filename of FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES) {
    const bytes =
      filename === "manifest.json" ? manifestBytes : contents.get(filename);
    if (bytes === undefined) throw new Error("missing role fixture bytes");
    await writePrivate(path.join(outputRoot, filename), bytes);
  }
  await writePrivate(
    path.join(repositoryRoot, ...receiptIdentity.path.split("/")),
    receiptBytes,
  );
  const verifyCalls: string[] = [];
  return {
    dependencies: {
      assertExactCleanRevision: async (capturedRoot, revision) => {
        expect(capturedRoot).toBe(repositoryRoot);
        expect(revision).toBe(VERIFIER_REVISION);
        verifyCalls.push(revision);
      },
      effectiveUserId:
        typeof process.getuid === "function" ? process.getuid() : 501,
      expectedManifestIdentity: manifestIdentity,
      expectedReceiptIdentity: receiptIdentity,
    },
    manifestPath: path.join(outputRoot, "manifest.json"),
    options: {
      legacyProtectedPositionIdsPath: path.join(root, "legacy.txt"),
      outputRoot,
      rawLockRoot: path.join(root, "raw-lock"),
      repositoryRoot,
      roleLockRoot: path.join(root, "role-lock"),
      verifierRevision: VERIFIER_REVISION,
    },
    outputRoot,
    receiptPath: path.join(repositoryRoot, ...receiptIdentity.path.split("/")),
    rows,
    trainingPath: path.join(outputRoot, "training.raw.jsonl"),
    verifyCalls,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("private stable-WASM deadline fixtures", () => {
  it("never changes the shared system temp-root permissions", async () => {
    const root = await temporaryRoot("deadline-private-fixture-");
    const sharedTemporaryRoot = await fs.promises.realpath(os.tmpdir());
    const chmod = fs.promises.chmod.bind(fs.promises);
    const chmodSpy = vi
      .spyOn(fs.promises, "chmod")
      .mockImplementation(async (target, mode) => {
        if (path.resolve(String(target)) === sharedTemporaryRoot) {
          throw new Error("shared temp root must not be chmodded");
        }
        await chmod(target, mode);
      });
    const nested = path.join(root, "one");
    const leaf = path.join(nested, "two");

    await expect(mkdirPrivate(leaf)).resolves.toBeUndefined();
    expect(
      chmodSpy.mock.calls.some(
        ([target]) => path.resolve(String(target)) === sharedTemporaryRoot,
      ),
    ).toBe(false);
    for (const directory of [root, nested, leaf]) {
      expect((await fs.promises.stat(directory)).mode & 0o777).toBe(0o700);
    }
  });
});

describe("stable-WASM deadline pure training-row validation", () => {
  it("keeps the production export and narrow verifier byte-for-byte equivalent", () => {
    const rows = fixtureRows();
    const bytes = rawBytes(rows);
    const identity = rawIdentity(rows, bytes);
    expect(parseAuthenticatedFloodgateTrainingRows(bytes, identity)).toEqual(
      parseAuthenticatedFloodgateTrainingRowsCoreForTests(bytes, identity),
    );
  });

  it("rejects row order, semantic identifiers, SFEN, and legal-move drift", () => {
    const rows = fixtureRows();
    const variants = [
      [...rows].reverse(),
      rows.map((row, index) =>
        index === 0 ? { ...row, parent_id: `sha256:${"0".repeat(64)}` } : row,
      ),
      rows.map((row, index) =>
        index === 0 ? { ...row, parent_sfen: `${row.parent_sfen} ` } : row,
      ),
      rows.map((row, index) =>
        index === 0 ? { ...row, played_move: "9a9i" } : row,
      ),
    ];
    for (const variant of variants) {
      const bytes = rawBytes(variant);
      const identity = rawIdentity(variant, bytes);
      expect(() =>
        parseAuthenticatedFloodgateTrainingRows(bytes, identity),
      ).toThrow();
    }
  });
});

describe("stable-WASM deadline held-file consumer", () => {
  it("holds all nine files, requires the synchronous exact claim, and issues one postflight claim", async () => {
    const fixture = await consumerFixture();
    let capturedRows = 0;
    const postflight =
      await withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
        fixture.options,
        (input) => {
          capturedRows = input.rows.length;
          claimFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(input);
          return Promise.resolve();
        },
        fixture.dependencies,
      );
    expect(capturedRows).toBe(fixture.rows.length);
    expect(fixture.verifyCalls).toEqual([VERIFIER_REVISION, VERIFIER_REVISION]);
    expect(() =>
      claimFloodgateStableWasmDeadlineConsumerPostflightCoreForTests(
        postflight,
      ),
    ).not.toThrow();
    expect(() =>
      claimFloodgateStableWasmDeadlineConsumerPostflightCoreForTests(
        postflight,
      ),
    ).toThrow();
  });

  it("fails without the synchronous input claim", async () => {
    const fixture = await consumerFixture();
    await expect(
      withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
        fixture.options,
        async () => undefined,
        fixture.dependencies,
      ),
    ).rejects.toThrow();
  });

  it("fails postflight when any held role file changes during the callback", async () => {
    const fixture = await consumerFixture();
    await expect(
      withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
        fixture.options,
        async (input) => {
          claimFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(input);
          await fs.promises.writeFile(
            fixture.trainingPath,
            "changed-after-authentication\n",
          );
        },
        fixture.dependencies,
      ),
    ).rejects.toThrow();
  });

  it("rejects a hard-linked role file before invoking the callback", async () => {
    const fixture = await consumerFixture();
    await fs.promises.link(
      fixture.trainingPath,
      path.join(fixture.outputRoot, "training-hard-link"),
    );
    let entered = false;
    await expect(
      withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
        fixture.options,
        async () => {
          entered = true;
        },
        fixture.dependencies,
      ),
    ).rejects.toThrow();
    expect(entered).toBe(false);
  });

  it("rejects a missing role file and swapped initial role bytes", async () => {
    const missing = await consumerFixture();
    await fs.promises.rm(
      path.join(
        missing.outputRoot,
        "fresh-selection.protected-position-ids.txt",
      ),
    );
    await expect(
      withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
        missing.options,
        async () => undefined,
        missing.dependencies,
      ),
    ).rejects.toThrow();

    const swapped = await consumerFixture();
    const left = path.join(swapped.outputRoot, "fresh-final-holdout.raw.jsonl");
    const right = path.join(swapped.outputRoot, "fresh-selection.raw.jsonl");
    const [leftBytes, rightBytes] = await Promise.all([
      fs.promises.readFile(left),
      fs.promises.readFile(right),
    ]);
    await Promise.all([
      writePrivate(left, rightBytes),
      writePrivate(right, leftBytes),
    ]);
    await expect(
      withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
        swapped.options,
        async () => undefined,
        swapped.dependencies,
      ),
    ).rejects.toThrow();
  });

  it.each(
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.filter(
      (filename) => filename !== "manifest.json",
    ),
  )(
    "rejects a one-byte initial tamper of manifest-authenticated path %s",
    async (filename) => {
      const fixture = await consumerFixture();
      const targetPath = path.join(fixture.outputRoot, filename);
      const tampered = await fs.promises.readFile(targetPath);
      expect(tampered.byteLength).toBeGreaterThan(0);
      tampered[0] ^= 1;
      await writePrivate(targetPath, tampered);
      let entered = false;
      await expect(
        withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
          fixture.options,
          async () => {
            entered = true;
          },
          fixture.dependencies,
        ),
      ).rejects.toThrow();
      expect(entered).toBe(false);
    },
  );

  it("rejects an extra manifest identity field even under test-injected replacement pins", async () => {
    const fixture = await consumerFixture();
    const manifest = JSON.parse(
      await fs.promises.readFile(fixture.manifestPath, "utf8"),
    ) as Record<string, unknown> & {
      roles: {
        training: Record<string, unknown>;
      };
    };
    manifest.roles.training.unexpected_identity = {
      bytes: 1,
      path: "unexpected",
      sha256: "0".repeat(64),
    };
    const manifestBytes = Buffer.from(`${canonicalJson(manifest)}\n`);
    const manifestIdentity = Object.freeze({
      bytes: manifestBytes.byteLength,
      path: "manifest.json" as const,
      sha256: sha256(manifestBytes),
    });
    const receipt = JSON.parse(
      await fs.promises.readFile(fixture.receiptPath, "utf8"),
    ) as Record<string, unknown> & {
      manifest: {
        identity: unknown;
        value: unknown;
      };
    };
    receipt.manifest.identity = manifestIdentity;
    receipt.manifest.value = manifest;
    const receiptBytes = Buffer.from(`${canonicalJson(receipt)}\n`);
    const receiptIdentity = Object.freeze({
      bytes: receiptBytes.byteLength,
      path: "ml/protocols/floodgate-q1-2026-role-bundle-result.json" as const,
      sha256: sha256(receiptBytes),
    });
    await Promise.all([
      writePrivate(fixture.manifestPath, manifestBytes),
      writePrivate(fixture.receiptPath, receiptBytes),
    ]);
    await expect(
      withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
        fixture.options,
        async () => undefined,
        {
          ...fixture.dependencies,
          expectedManifestIdentity: manifestIdentity,
          expectedReceiptIdentity: receiptIdentity,
        },
      ),
    ).rejects.toThrow();
  });
});

describe("stable-WASM deadline narrow registry", () => {
  async function registryFixture() {
    const home = await temporaryRoot("deadline-read-only-registry-");
    const registryRoot = path.join(
      home,
      ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS,
    );
    await mkdirPrivate(path.join(registryRoot, "runs"));
    const consumer = {
      legacyProtectedPositionIdsPath: path.join(home, "legacy.txt"),
      outputRoot: path.join(home, "bundle"),
      rawLockRoot: path.join(home, "raw-lock"),
      repositoryRoot: path.join(home, "repository"),
      roleLockRoot: path.join(home, "role-lock"),
      verifierRevision: VERIFIER_REVISION,
    };
    const record = {
      contract: "shogi-floodgate-v7-production-connector-registry-record-v2",
      status: "fixed-private-production-connector-run-registry",
      layout: "fixed-current-euid-userinfo-home-v1",
      run_id: "1".repeat(64),
      approved_key_binding: {
        record_bytes: 123,
        record_sha256: "2".repeat(64),
        key_instance_id: "3".repeat(64),
      },
      verifier_revision: consumer.verifierRevision,
      application_source_binding: {
        layout: FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
        revision: "4".repeat(40),
      },
      repository_root: consumer.repositoryRoot,
      raw_lock_root: consumer.rawLockRoot,
      role_lock_root: consumer.roleLockRoot,
      role_bundle_root: consumer.outputRoot,
      legacy_protected_position_ids_path:
        consumer.legacyProtectedPositionIdsPath,
      engine_args: ["--threads"],
    };
    const recordPath = path.join(
      registryRoot,
      FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME,
    );
    await writePrivate(recordPath, `${JSON.stringify(record)}\n`);
    return { consumer, home, recordPath };
  }

  it("returns an opaque capability and discloses consumer paths only on one exact claim", async () => {
    const fixture = await registryFixture();
    const capability =
      await loadFloodgateStableWasmDeadlineReadOnlyRegistryCoreForTests({
        effectiveUserId:
          typeof process.getuid === "function" ? process.getuid() : 501,
        homeDirectory: fixture.home,
      });
    expect(JSON.stringify(capability)).not.toContain(fixture.home);
    const claim =
      claimFloodgateStableWasmDeadlineReadOnlyRegistryCoreForTests(capability);
    expect(claim.consumer).toEqual(fixture.consumer);
    expect(() =>
      claimFloodgateStableWasmDeadlineReadOnlyRegistryCoreForTests(capability),
    ).toThrow();
  });

  it("issues no capability when the held record changes before revalidation", async () => {
    const fixture = await registryFixture();
    await expect(
      loadFloodgateStableWasmDeadlineReadOnlyRegistryCoreForTests({
        beforeFinalRevalidationForTests: async () => {
          await fs.promises.writeFile(fixture.recordPath, "{}\n");
        },
        effectiveUserId:
          typeof process.getuid === "function" ? process.getuid() : 501,
        homeDirectory: fixture.home,
      }),
    ).rejects.toThrow();
  });
});

describe("stable-WASM deadline narrow stable-asset authority", () => {
  async function assetFixture() {
    const home = await temporaryRoot("deadline-read-only-assets-");
    const assetRoot = path.join(
      home,
      ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS,
      "stable",
    );
    await mkdirPrivate(assetRoot);
    const wasm = await fs.promises.readFile(
      path.join(
        process.cwd(),
        "src/components/game/ShogiImproved/wasm/shogi.wasm",
      ),
    );
    const weights = await fs.promises.readFile(
      path.join(process.cwd(), "public/shogi-nnue-weights.bin"),
    );
    const wasmPath = path.join(assetRoot, "shogi.wasm");
    const weightsPath = path.join(assetRoot, "shogi-nnue-weights.bin");
    await writePrivate(wasmPath, wasm);
    await writePrivate(weightsPath, weights);
    return { home, wasmPath };
  }

  it("hands out exact ephemeral copies and zeroes them after callback settlement", async () => {
    const fixture = await assetFixture();
    let capturedWasm: Uint8Array | undefined;
    let capturedWeights: Uint8Array | undefined;
    await withFloodgateStableWasmDeadlineReadOnlyAssetsCoreForTests(
      fixture.home,
      typeof process.getuid === "function" ? process.getuid() : 501,
      async (assets) => {
        capturedWasm = assets.bytes.wasm;
        capturedWeights = assets.bytes.weights;
        expect(assets.bytes.wasm.byteLength).toBe(36_545);
        expect(assets.bytes.weights.byteLength).toBe(1_185_988);
      },
    );
    expect(capturedWasm?.every((byte) => byte === 0)).toBe(true);
    expect(capturedWeights?.every((byte) => byte === 0)).toBe(true);
  });

  it("fails when a held stable asset changes during the callback", async () => {
    const fixture = await assetFixture();
    await expect(
      withFloodgateStableWasmDeadlineReadOnlyAssetsCoreForTests(
        fixture.home,
        typeof process.getuid === "function" ? process.getuid() : 501,
        async () => {
          await fs.promises.writeFile(fixture.wasmPath, "changed\n");
        },
      ),
    ).rejects.toThrow();
  });
});

describe("stable-WASM deadline fixed source closures", () => {
  it("binds only the dedicated exact-clean checkout and preload-free CJS context", async () => {
    const home = await temporaryRoot("deadline-source-closure-");
    const diagnosticRoot = path.join(
      home,
      ".codex",
      "worktrees",
      "shogi-floodgate-stable-deadline-diagnostic-application",
    );
    await mkdirPrivate(path.join(diagnosticRoot, "ml"));
    const entrypoint = path.join(
      diagnosticRoot,
      "ml",
      "run-floodgate-stable-wasm-deadline-diagnostic.cjs",
    );
    await writePrivate(entrypoint, "process.exitCode=0;\n");
    expect(
      resolveFloodgateStableWasmDeadlineDiagnosticSourceRootCoreForTests(home),
    ).toBe(diagnosticRoot);
    const captured =
      await captureFloodgateStableWasmDeadlineDiagnosticSourceProvenanceCoreForTests(
        {
          captureExactCleanRevision: async (repositoryRoot) => {
            expect(repositoryRoot).toBe(diagnosticRoot);
            return "c".repeat(40);
          },
          homeDirectory: home,
        },
      );
    expect(captured).toEqual({
      layout: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
      revision: "c".repeat(40),
    });
    expect(() =>
      assertFloodgateStableWasmDeadlineDiagnosticEntrypointContextCoreForTests(
        "ml/run-floodgate-stable-wasm-deadline-diagnostic.cjs",
        {
          argv: ["/fixed/node", entrypoint],
          cwd: diagnosticRoot,
          execArgv: [],
          homeDirectory: home,
          mainFilename: entrypoint,
        },
      ),
    ).not.toThrow();
    expect(() =>
      assertFloodgateStableWasmDeadlineDiagnosticEntrypointContextCoreForTests(
        "ml/run-floodgate-stable-wasm-deadline-diagnostic.cjs",
        {
          argv: ["/fixed/node", entrypoint],
          cwd: diagnosticRoot,
          execArgv: ["-r", "unexpected"],
          homeDirectory: home,
          mainFilename: entrypoint,
        },
      ),
    ).toThrow();
  });

  it("captures the separate registry application root without making it diagnostic execution authority", async () => {
    const home = await temporaryRoot("deadline-registry-source-");
    const applicationRoot = path.join(
      home,
      ".codex",
      "worktrees",
      "shogi-floodgate-v7-production-application",
    );
    await mkdirPrivate(applicationRoot);
    const captured =
      await captureFloodgateStableWasmDeadlineRegistryApplicationSourceCoreForTests(
        home,
        async (repositoryRoot) => {
          expect(repositoryRoot).toBe(applicationRoot);
          return "d".repeat(40);
        },
      );
    expect(captured).toEqual({
      layout: FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
      revision: "d".repeat(40),
    });
    expect(applicationRoot).not.toContain(
      "shogi-floodgate-stable-deadline-diagnostic-application",
    );
  });
});
