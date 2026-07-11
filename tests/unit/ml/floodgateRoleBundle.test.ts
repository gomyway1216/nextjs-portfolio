import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_ROLE_BUNDLE_CAS_READ_CONCURRENCY,
  FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
  acquireAndReleaseFreshFloodgateRoleBundleRootForTests,
  materializeFloodgateRoleBundleRolesCoreForTests,
  runFreshFloodgateRoleBundleOutputLifecycleCoreForTests,
  runFreshFloodgateRoleBundleRootGuardCoreForTests,
  runFloodgateRoleBundlePublishSequenceCoreForTests,
  type NonProductionFloodgateRoleBundlePublishSequenceFixture,
} from "../../../ml/floodgate-role-bundle";
import {
  floodgateCanonicalUrlGameId,
  floodgateRawObjectPath,
  type FloodgateRawCsaIndexEntry,
} from "../../../ml/floodgate-raw-lock";
import {
  FLOODGATE_ROLE_PRIORITY,
  floodgateIdentifierDigest,
  protectedSemanticPositionIds,
  type FloodgateAllocatedGame,
  type FloodgatePureAllocationArtifact,
  type FloodgateRole,
} from "../../../ml/floodgate-roles";
import { parseFloodgateCsa, sha256 } from "../../../ml/import-csa-games";
import { positionKeyFromSfen } from "../../../ml/sibling-data";

const temporaryRoots: string[] = [];

async function freshOutputRoot(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-role-bundle-"),
  );
  const container = await fs.promises.realpath(created);
  temporaryRoots.push(container);
  return path.join(container, "bundle");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

function csaUrl(index: number): string {
  const stamp = String(index).padStart(6, "0");
  return `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+a+b+20260101${stamp}.csa`;
}

function csa(tag: number): Uint8Array {
  return Buffer.from(
    [
      "V3.0",
      "$EVENT:floodgate-300-10F",
      `'fixture:${tag}`,
      "PI",
      "+",
      "+7776FU",
      "-3334FU",
      "%TORYO",
      "",
    ].join("\n"),
    "utf8",
  );
}

function parentId(gameId: string, ply: number): string {
  return `sha256:${createHash("sha256")
    .update(`parent-occurrence-v1\0${gameId}\0${ply}`, "utf8")
    .digest("hex")}`;
}

interface FixtureGame {
  readonly bytes: Uint8Array;
  readonly entry: FloodgateRawCsaIndexEntry;
  readonly allocated: FloodgateAllocatedGame;
}

function game(index: number): FixtureGame {
  const canonicalUrl = csaUrl(index);
  const bytes = csa(index);
  const digest = sha256(bytes);
  const gameId = floodgateCanonicalUrlGameId(canonicalUrl);
  const parsed = parseFloodgateCsa(bytes, canonicalUrl);
  const move = parsed.moves[0];
  return {
    bytes,
    entry: {
      url: canonicalUrl,
      canonical_url: canonicalUrl,
      game_id: gameId,
      receipt: `receipts/${index}.json`,
      status: 200,
      bytes: bytes.byteLength,
      sha256: digest,
      object: floodgateRawObjectPath(digest),
    },
    allocated: {
      game_id: gameId,
      player_identities: [
        "a+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "b+bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      parents: [
        {
          parent_id: parentId(gameId, 0),
          parent_sfen: move.parentSfen,
          ply: 0,
          position_id: positionKeyFromSfen(move.parentSfen),
          phase: "opening",
          sampling_stage: "phase",
          protected_position_ids: protectedSemanticPositionIds(move.parentSfen),
        },
      ],
    },
  };
}

function summary(games: readonly FloodgateAllocatedGame[]) {
  const gameIds = games.map((entry) => entry.game_id).sort();
  const parents = games.flatMap((entry) => entry.parents);
  const parentIds = parents.map((parent) => parent.parent_id).sort();
  const protectedIds = new Set(
    parents.flatMap((parent) => parent.protected_position_ids),
  );
  return {
    requested_games: games.length,
    selected_games: games.length,
    selected_parents: parents.length,
    identity_game_cap: 1,
    unordered_identity_pair_game_cap: 1,
    game_ids: gameIds,
    game_ids_sha256: floodgateIdentifierDigest(gameIds),
    parent_ids: parentIds,
    parent_ids_sha256: floodgateIdentifierDigest(parentIds),
    game_parent_ids: [],
    protected_position_ids_count: protectedIds.size,
    protected_position_ids_sha256: floodgateIdentifierDigest(protectedIds),
    identity_game_counts: [],
    unordered_identity_pair_game_counts: [],
  };
}

function allocation(
  finalGames: readonly FloodgateAllocatedGame[],
): FloodgatePureAllocationArtifact["output"] {
  const roles: Record<FloodgateRole, FloodgateAllocatedGame[]> = {
    fresh_final_holdout: [...finalGames],
    fresh_selection: [],
    training: [],
  };
  return {
    roles,
    role_summaries: Object.fromEntries(
      FLOODGATE_ROLE_PRIORITY.map((role) => [role, summary(roles[role])]),
    ),
  } as unknown as FloodgatePureAllocationArtifact["output"];
}

function publishFixture(
  overrides: Partial<NonProductionFloodgateRoleBundlePublishSequenceFixture> = {},
): NonProductionFloodgateRoleBundlePublishSequenceFixture {
  return {
    validateCandidate: () => undefined,
    publishDataFiles: async () => undefined,
    verifyDataFiles: async () => undefined,
    revalidateSourceClosure: async () => undefined,
    publishManifest: async () => undefined,
    verifyCompleteBundle: async () => undefined,
    ...overrides,
  };
}

describe("Floodgate label-free role bundle", () => {
  it("preserves the canonical-URL game ID and recovers the played USI move", async () => {
    const fixture = game(1);
    const bodyDerived = parseFloodgateCsa(
      fixture.bytes,
      fixture.entry.canonical_url,
    ).gameId;
    expect(bodyDerived).not.toBe(fixture.entry.game_id);

    const aliasUrl = csaUrl(2);
    const alias = { ...fixture.entry, url: aliasUrl };
    const roles = await materializeFloodgateRoleBundleRolesCoreForTests({
      allocation: allocation([fixture.allocated]),
      csaIndex: [alias, fixture.entry],
      readObject: async (entry) => {
        expect(entry.url).toBe(entry.canonical_url);
        return fixture.bytes;
      },
    });

    expect(roles.fresh_final_holdout.rows).toHaveLength(1);
    expect(roles.fresh_final_holdout.rows[0]).toMatchObject({
      source: "floodgate",
      source_url: fixture.entry.canonical_url,
      game_sha256: fixture.entry.sha256,
      game_id: fixture.entry.game_id,
      parent_id: fixture.allocated.parents[0].parent_id,
      played_move: "7g7f",
    });
    expect(roles.fresh_final_holdout.rawText.endsWith("\n")).toBe(true);
    expect(roles.fresh_final_holdout.rawText).not.toContain("teacher");
    expect(roles.fresh_final_holdout.rawText).not.toContain("score");
  });

  it("rejects duplicate canonical rows and allocated-parent tampering", async () => {
    const fixture = game(3);
    await expect(
      materializeFloodgateRoleBundleRolesCoreForTests({
        allocation: allocation([fixture.allocated]),
        csaIndex: [fixture.entry, { ...fixture.entry }],
        readObject: async () => fixture.bytes,
      }),
    ).rejects.toThrow(/exactly one canonical raw-index row/);

    const tampered = {
      ...fixture.allocated,
      parents: [
        {
          ...fixture.allocated.parents[0],
          parent_id: `sha256:${"0".repeat(64)}`,
        },
      ],
    };
    await expect(
      materializeFloodgateRoleBundleRolesCoreForTests({
        allocation: allocation([tampered]),
        csaIndex: [fixture.entry],
        readObject: async () => fixture.bytes,
      }),
    ).rejects.toThrow(/does not match CSA semantics/);
  });

  it("never exceeds the pinned CAS read concurrency", async () => {
    const fixtures = Array.from({ length: 40 }, (_, index) =>
      game(100 + index),
    );
    let active = 0;
    let maximum = 0;
    await materializeFloodgateRoleBundleRolesCoreForTests({
      allocation: allocation(fixtures.map((entry) => entry.allocated)),
      csaIndex: fixtures.map((entry) => entry.entry),
      readObject: async (entry) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => setImmediate(resolve));
        active -= 1;
        return fixtures.find((fixture) => fixture.entry.url === entry.url)!
          .bytes;
      },
    });
    expect(maximum).toBeLessThanOrEqual(
      FLOODGATE_ROLE_BUNDLE_CAS_READ_CONCURRENCY,
    );
    expect(maximum).toBeGreaterThan(1);
  });

  it("does not publish the manifest after source-closure failure", async () => {
    const events: string[] = [];
    const publishManifest = vi.fn(async () => {
      events.push("manifest");
    });
    await expect(
      runFloodgateRoleBundlePublishSequenceCoreForTests(
        publishFixture({
          validateCandidate: () => events.push("validate"),
          publishDataFiles: async () => {
            events.push("data");
          },
          verifyDataFiles: async () => {
            events.push("verify-data");
          },
          revalidateSourceClosure: async () => {
            events.push("source");
            throw new Error("CAS changed");
          },
          publishManifest,
        }),
      ),
    ).rejects.toThrow(/CAS changed/);
    expect(publishManifest).not.toHaveBeenCalled();
    expect(events).toEqual(["validate", "data", "verify-data", "source"]);
  });

  it("revalidates data after source closure and before manifest publication", async () => {
    const events: string[] = [];
    await runFloodgateRoleBundlePublishSequenceCoreForTests(
      publishFixture({
        validateCandidate: () => events.push("validate"),
        publishDataFiles: async () => {
          events.push("data");
        },
        verifyDataFiles: async () => {
          events.push("verify-data");
        },
        revalidateSourceClosure: async () => {
          events.push("source");
        },
        publishManifest: async () => {
          events.push("manifest");
        },
        verifyCompleteBundle: async () => {
          events.push("verify-complete");
        },
      }),
    );
    expect(events).toEqual([
      "validate",
      "data",
      "verify-data",
      "source",
      "verify-data",
      "validate",
      "manifest",
      "verify-complete",
    ]);
  });

  it("holds one root identity through the real manifest-last lifecycle", async () => {
    const outputRoot = await freshOutputRoot();
    await expect(
      runFreshFloodgateRoleBundleOutputLifecycleCoreForTests(
        outputRoot,
        async () => undefined,
      ),
    ).resolves.toBeUndefined();

    const entries = (await fs.promises.readdir(outputRoot)).sort();
    expect(entries).toEqual([
      "fixture-a.raw.jsonl",
      "fixture-b.protected-position-ids.txt",
      FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
    ]);
    await expect(
      fs.promises.readFile(
        path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
        "utf8",
      ),
    ).resolves.toBe('{"fixture":"manifest"}\n');
  });

  it("keeps the manifest absent after an in-place pre-manifest mutation", async () => {
    const outputRoot = await freshOutputRoot();
    await expect(
      runFreshFloodgateRoleBundleOutputLifecycleCoreForTests(
        outputRoot,
        async (root) => {
          await fs.promises.writeFile(
            path.join(root, "fixture-a.raw.jsonl"),
            '{"fixture":"tampered"}\n',
          );
        },
      ),
    ).rejects.toThrow(/output entry fixture-a\.raw\.jsonl changed/);
    await expect(
      fs.promises.lstat(
        path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects output-root ABA and refuses an existing no-clobber root", async () => {
    const outputRoot = await freshOutputRoot();
    const movedRoot = `${outputRoot}.moved`;
    await expect(
      runFreshFloodgateRoleBundleRootGuardCoreForTests(
        outputRoot,
        async (root) => {
          await fs.promises.rename(root, movedRoot);
          await fs.promises.mkdir(root);
          await fs.promises.rmdir(root);
          await fs.promises.rename(movedRoot, root);
        },
      ),
    ).rejects.toThrow(/output parent changed|output root changed/);

    await expect(
      acquireAndReleaseFreshFloodgateRoleBundleRootForTests(outputRoot),
    ).rejects.toThrow(/must be freshly created/);
  });
});
