import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
  loadFloodgateStrengthFirstFastTrainingInputCoreForTests,
  type FloodgateStrengthFirstFastTrainingInputContractForTests,
} from "../../../ml/floodgate-strength-first-fast-training-input";
import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  type FloodgateRoleBundleRawIdentity,
  type FloodgateRoleBundleRawParent,
} from "../../../ml/floodgate-role-bundle";
import { floodgateCanonicalUrlGameId } from "../../../ml/floodgate-raw-lock";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import { childSfenAfterUsi } from "../../../ml/shogi-sfen";
import { compareBytewise, positionKeyFromSfen } from "../../../ml/sibling-data";

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const roots: string[] = [];

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("fixture is not JSON");
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

function parentId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function gameRows(
  index: number,
  moves: readonly [string, string, string, string],
): FloodgateRoleBundleRawParent[] {
  const stamp = String(index).padStart(6, "0");
  const sourceUrl =
    `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/` +
    `wdoor+floodgate-300-10F+fixture-a+fixture-b+20260101${stamp}.csa`;
  const gameId = floodgateCanonicalUrlGameId(sourceUrl);
  const gameSha256 = sha256(`fixture CSA ${index}`);
  const rows: FloodgateRoleBundleRawParent[] = [];
  let parentSfen = START_SFEN;
  for (let ply = 0; ply < moves.length; ply += 1) {
    const move = moves[ply];
    if (ply >= 2) {
      rows.push({
        schema_version: 1,
        source: "floodgate",
        source_url: sourceUrl,
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

function fixtureRows(): readonly FloodgateRoleBundleRawParent[] {
  return [
    ...gameRows(1, ["7g7f", "3c3d", "2g2f", "8c8d"]),
    ...gameRows(2, ["2g2f", "8c8d", "7g7f", "3c3d"]),
  ].sort((left, right) => compareBytewise(left.parent_id, right.parent_id));
}

function rawBytes(rows: readonly FloodgateRoleBundleRawParent[]): Buffer {
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
    path: "training.raw.jsonl",
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

async function privateFile(filePath: string, bytes: Uint8Array): Promise<void> {
  await fs.promises.writeFile(filePath, bytes, { mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

async function fixture(
  mutateManifest?: (
    value: Record<string, unknown>,
    identity: FloodgateRoleBundleRawIdentity,
  ) => void,
): Promise<
  Readonly<{
    home: string;
    root: string;
    rawPath: string;
    contract: FloodgateStrengthFirstFastTrainingInputContractForTests;
  }>
> {
  const home = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "fast-training-input-"),
  );
  roots.push(home);
  const root = path.join(home, "bundle");
  await fs.promises.mkdir(root, { mode: 0o700 });
  const rows = fixtureRows();
  const bytes = rawBytes(rows);
  const identity = rawIdentity(rows, bytes);
  const manifest: Record<string, unknown> = {
    roles: { training: { raw_parents: identity } },
  };
  mutateManifest?.(manifest, identity);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  const manifestPath = path.join(root, "manifest.json");
  const rawPath = path.join(root, identity.path);
  await privateFile(manifestPath, manifestBytes);
  await privateFile(rawPath, bytes);
  return Object.freeze({
    home,
    root,
    rawPath,
    contract: Object.freeze({
      bundleRelativeComponents: Object.freeze(["bundle"]),
      manifest: Object.freeze({
        path: "manifest.json",
        bytes: manifestBytes.byteLength,
        sha256: sha256(manifestBytes),
      }),
      training: Object.freeze(identity),
    }),
  });
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("strength-first fast training input", () => {
  it("opens only the pinned manifest and training file and validates all rows", async () => {
    const input = await fixture();
    const opened: string[] = [];
    const result =
      await loadFloodgateStrengthFirstFastTrainingInputCoreForTests(
        input.home,
        input.contract,
        {
          effectiveUserId: process.getuid!(),
          open: async (filePath, flags) => {
            opened.push(filePath);
            return fs.promises.open(filePath, flags);
          },
        },
      );

    expect(opened).toEqual([
      path.join(input.root, "manifest.json"),
      path.join(input.root, "training.raw.jsonl"),
    ]);
    expect(result).toMatchObject({
      schema: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
      role: "training",
      policy: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
      manifest: input.contract.manifest,
      source: input.contract.training,
    });
    expect(result.rows).toHaveLength(4);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(result.rows.every((row) => Object.isFrozen(row))).toBe(true);
  });

  it("rejects a manifest that does not bind the exact training role before opening raw data", async () => {
    const input = await fixture((manifest) => {
      manifest.roles = { fresh_selection: {} };
    });
    const opened: string[] = [];
    await expect(
      loadFloodgateStrengthFirstFastTrainingInputCoreForTests(
        input.home,
        input.contract,
        {
          effectiveUserId: process.getuid!(),
          open: async (filePath, flags) => {
            opened.push(filePath);
            return fs.promises.open(filePath, flags);
          },
        },
      ),
    ).rejects.toThrow("manifest training role differs");
    expect(opened).toEqual([path.join(input.root, "manifest.json")]);
  });

  it("rejects training bytes that differ from the manifest identity", async () => {
    const input = await fixture();
    await fs.promises.appendFile(input.rawPath, Buffer.from(" "));
    await expect(
      loadFloodgateStrengthFirstFastTrainingInputCoreForTests(
        input.home,
        input.contract,
        {
          effectiveUserId: process.getuid!(),
          open: (filePath, flags) => fs.promises.open(filePath, flags),
        },
      ),
    ).rejects.toThrow("training is not the expected private regular file");
  });

  it("detects a held-file mutation after semantic validation", async () => {
    const input = await fixture();
    await expect(
      loadFloodgateStrengthFirstFastTrainingInputCoreForTests(
        input.home,
        input.contract,
        {
          effectiveUserId: process.getuid!(),
          open: (filePath, flags) => fs.promises.open(filePath, flags),
          afterReadBeforePostflight: () =>
            fs.promises.appendFile(input.rawPath, Buffer.from("x")),
        },
      ),
    ).rejects.toThrow("training is not the expected private regular file");
  });
});
