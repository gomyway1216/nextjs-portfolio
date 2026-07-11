import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
  FLOODGATE_ALLOCATION_SEED,
  type FloodgatePureGameInput,
  type FloodgateRole,
} from "../../../ml/floodgate-roles";
import {
  allocateFloodgateRoleLockCoreForTests,
  runFloodgateRoleLockPublishSequenceCoreForTests,
  type NonProductionFloodgateRoleLockPublishSequenceFixture,
  type FloodgateRoleLockIndexedGame,
  type FloodgateRoleLockInspectedGame,
} from "../../../ml/floodgate-role-lock";
import {
  floodgateCanonicalUrlGameId,
  floodgateRawObjectPath,
} from "../../../ml/floodgate-raw-lock";
import { compareUtf8Bytes } from "../../../ml/floodgate-source";

const EMPTY_COUNTS: Readonly<Record<FloodgateRole, number>> = {
  fresh_final_holdout: 0,
  fresh_selection: 0,
  training: 0,
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function identity(name: string): string {
  return `${name}+${sha256(`identity:${name}`).slice(0, 32)}`;
}

function csaUrl(index: number): string {
  const minute = Math.floor(index / 60)
    .toString()
    .padStart(2, "0");
  const second = (index % 60).toString().padStart(2, "0");
  return `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+p${index}a+p${index}b+2026010100${minute}${second}.csa`;
}

function indexGroup(
  bodyTag: string,
  urls: readonly string[],
): FloodgateRoleLockIndexedGame[] {
  const sha = sha256(`body:${bodyTag}`);
  const canonicalUrl = [...urls].sort(compareUtf8Bytes)[0];
  const gameId = floodgateCanonicalUrlGameId(canonicalUrl);
  return urls.map((url) => ({
    url,
    canonical_url: canonicalUrl,
    game_id: gameId,
    bytes: 100 + bodyTag.length,
    sha256: sha,
    object: floodgateRawObjectPath(sha),
  }));
}

function fixtureHand(tag: number): string {
  let remaining = tag + 1;
  let hand = "";
  for (const piece of ["r", "b", "g", "s", "n", "l", "p"]) {
    const count = remaining % 19;
    remaining = Math.floor(remaining / 19);
    if (count > 0) hand += `${count > 1 ? count : ""}${piece}`;
  }
  if (remaining !== 0) throw new Error("fixture tag exceeds hand encoding");
  return hand || "-";
}

function fixtureSfen(tag: number, ply: number): string {
  return `4k4/9/9/9/9/9/9/9/K8 b ${fixtureHand(tag)} ${ply + 1}`;
}

function materializedGame(
  game: Readonly<FloodgateRoleLockInspectedGame>,
  tag: number,
): FloodgatePureGameInput {
  return {
    game_id: game.game_id,
    player_identities: game.player_identities,
    parents: Array.from({ length: 24 }, (_, index) => {
      const ply = 16 + index;
      return {
        parent_id: `sha256:${sha256(
          `parent-occurrence-v1\0${game.game_id}\0${ply}`,
        )}`,
        parent_sfen: fixtureSfen(tag * 100 + index, ply),
        ply,
      };
    }),
  };
}

function uniqueIdentities(
  game: Readonly<FloodgateRoleLockIndexedGame>,
): readonly [string, string] {
  const suffix = game.game_id.slice(-12);
  return [identity(`a${suffix}`), identity(`b${suffix}`)];
}

function finalRank(gameId: string): Buffer {
  return createHash("sha256")
    .update(
      [
        DEFAULT_FLOODGATE_GAME_RANK_DOMAINS.fresh_final_holdout,
        FLOODGATE_ALLOCATION_SEED,
        gameId,
      ].join("\0"),
      "utf8",
    )
    .digest();
}

function publishSequenceFixture(
  overrides: Partial<NonProductionFloodgateRoleLockPublishSequenceFixture> = {},
): NonProductionFloodgateRoleLockPublishSequenceFixture {
  return {
    validateCandidate: () => undefined,
    assertOutputRoot: async () => undefined,
    publishMaterializedInput: async () => undefined,
    publishAllocation: async () => undefined,
    verifyMaterializedInput: async () => undefined,
    verifyAllocation: async () => undefined,
    revalidateSourceClosure: async () => undefined,
    publishManifest: async () => undefined,
    verifyManifest: async () => undefined,
    ...overrides,
  };
}

describe("Floodgate production role-lock core", () => {
  it("keeps only one canonical URL per exact-body group and materializes lazily by role priority", async () => {
    const firstUrl = csaUrl(1);
    const aliasUrl = csaUrl(2);
    const index = [
      ...indexGroup("duplicate", [aliasUrl, firstUrl]),
      ...indexGroup("second", [csaUrl(3)]),
      ...indexGroup("third", [csaUrl(4)]),
      ...indexGroup("unused", [csaUrl(5)]),
    ];
    const inspect = vi.fn(async (game: FloodgateRoleLockIndexedGame) =>
      uniqueIdentities(game),
    );
    let tag = 1;
    const materialize = vi.fn(async (game: FloodgateRoleLockInspectedGame) =>
      materializedGame(game, tag++),
    );

    const result = await allocateFloodgateRoleLockCoreForTests({
      csaIndex: index,
      legacyProtectedPositionIds: [],
      roleGameCounts: {
        fresh_final_holdout: 1,
        fresh_selection: 1,
        training: 1,
      },
      inspect,
      materialize,
    });

    expect(inspect).toHaveBeenCalledTimes(4);
    expect(materialize).toHaveBeenCalledTimes(3);
    expect(inspect.mock.calls.map(([game]) => game.url)).not.toContain(
      aliasUrl,
    );
    expect(result.accounting).toMatchObject({
      indexed_csa_rows: 5,
      canonical_games: 4,
      duplicate_alias_rows_excluded: 1,
      source_metadata_eligible_games: 4,
      lazy_materialization_attempts: 3,
      fully_materialized_games: 3,
    });
    expect(result.artifact.output.roles.fresh_final_holdout).toHaveLength(1);
    expect(result.artifact.output.roles.fresh_selection).toHaveLength(1);
    expect(result.artifact.output.roles.training).toHaveLength(1);
    expect(
      new Set(
        Object.values(result.artifact.output.roles)
          .flat()
          .map((game) => game.game_id),
      ).size,
    ).toBe(3);
    expect(
      (JSON.parse(result.artifact.input_canonical_json) as { games: unknown[] })
        .games,
    ).toHaveLength(3);
  });

  it("rejects a full-source/legal materialization and deterministically fills with the next game", async () => {
    const index = [
      ...indexGroup("one", [csaUrl(10)]),
      ...indexGroup("two", [csaUrl(11)]),
      ...indexGroup("three", [csaUrl(12)]),
    ];
    let attempts = 0;
    const result = await allocateFloodgateRoleLockCoreForTests({
      csaIndex: index,
      legacyProtectedPositionIds: [],
      roleGameCounts: { ...EMPTY_COUNTS, fresh_final_holdout: 1 },
      inspect: async (game) => uniqueIdentities(game),
      materialize: async (game) => {
        attempts += 1;
        return attempts === 1 ? null : materializedGame(game, attempts);
      },
    });

    expect(result.artifact.output.roles.fresh_final_holdout).toHaveLength(1);
    expect(result.accounting.lazy_materialization_attempts).toBe(2);
    expect(result.accounting.full_source_or_legality_rejections).toBe(1);
    expect(result.accounting.fully_materialized_games).toBe(1);
  });

  it("applies the immutable identity cap before expensive materialization", async () => {
    const index = Array.from(
      { length: 20 },
      (_, offset) => indexGroup(`cap-${offset}`, [csaUrl(100 + offset)])[0],
    );
    const ranked = [...index].sort(
      (left, right) =>
        Buffer.compare(finalRank(left.game_id), finalRank(right.game_id)) ||
        compareUtf8Bytes(left.game_id, right.game_id),
    );
    const sharedIds = [identity("shared-a"), identity("shared-b")] as const;
    const sharedGameIds = new Set(
      ranked.slice(0, 11).map((game) => game.game_id),
    );
    let tag = 500;
    const materialize = vi.fn(async (game: FloodgateRoleLockInspectedGame) =>
      materializedGame(game, tag++),
    );

    const result = await allocateFloodgateRoleLockCoreForTests({
      csaIndex: index,
      legacyProtectedPositionIds: [],
      roleGameCounts: { ...EMPTY_COUNTS, fresh_final_holdout: 10 },
      inspect: async (game) =>
        sharedGameIds.has(game.game_id) ? sharedIds : uniqueIdentities(game),
      materialize,
    });

    expect(result.artifact.output.roles.fresh_final_holdout).toHaveLength(10);
    expect(
      result.accounting.identity_cap_role_checks_skipped_before_materialization,
    ).toBe(10);
    expect(materialize).toHaveBeenCalledTimes(10);
    expect(
      result.artifact.output.role_summaries.fresh_final_holdout
        .identity_game_cap,
    ).toBe(1);
  });

  it("rejects forged duplicate/canonical bindings before either callback runs", async () => {
    const inspect = vi.fn(async () => null);
    const materialize = vi.fn(async () => null);
    const group = indexGroup("forged", [csaUrl(200), csaUrl(201)]);
    const forged = group.map((entry, index) =>
      index === 1 ? { ...entry, canonical_url: entry.url } : entry,
    );

    await expect(
      allocateFloodgateRoleLockCoreForTests({
        csaIndex: forged,
        legacyProtectedPositionIds: [],
        roleGameCounts: EMPTY_COUNTS,
        inspect,
        materialize,
      }),
    ).rejects.toThrow(/canonical_url|canonical binding/);
    expect(inspect).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
  });

  it("treats malformed materializer output as a fatal contract violation", async () => {
    const index = indexGroup("malformed", [csaUrl(220)]);
    await expect(
      allocateFloodgateRoleLockCoreForTests({
        csaIndex: index,
        legacyProtectedPositionIds: [],
        roleGameCounts: { ...EMPTY_COUNTS, fresh_final_holdout: 1 },
        inspect: async (game) => uniqueIdentities(game),
        materialize: async (game) => ({
          ...materializedGame(game, 900),
          game_id: `sha256:${"0".repeat(64)}`,
        }),
      }),
    ).rejects.toThrow(/game_id does not match/);
  });

  it("leaves the final manifest absent when source closure changes after artifact writes", async () => {
    const events: string[] = [];
    await expect(
      runFloodgateRoleLockPublishSequenceCoreForTests(
        publishSequenceFixture({
          validateCandidate: () => {
            events.push("validate");
          },
          publishMaterializedInput: async () => {
            events.push("materialized-input");
          },
          publishAllocation: async () => {
            events.push("allocation");
          },
          verifyMaterializedInput: async () => {
            events.push("verify-input");
          },
          verifyAllocation: async () => {
            events.push("verify-allocation");
          },
          revalidateSourceClosure: async () => {
            events.push("revalidate-source");
            throw new Error("raw manifest changed during role locking");
          },
          publishManifest: async () => {
            events.push("manifest");
          },
        }),
      ),
    ).rejects.toThrow(/raw manifest changed/);
    expect(events).toEqual([
      "validate",
      "materialized-input",
      "allocation",
      "verify-input",
      "verify-allocation",
      "revalidate-source",
    ]);
  });

  it("re-reads published artifacts after the final source-closure verification", async () => {
    const events: string[] = [];
    let inputVerifications = 0;
    await expect(
      runFloodgateRoleLockPublishSequenceCoreForTests(
        publishSequenceFixture({
          validateCandidate: () => {
            events.push("validate");
          },
          publishMaterializedInput: async () => {
            events.push("materialized-input");
          },
          publishAllocation: async () => {
            events.push("allocation");
          },
          verifyMaterializedInput: async () => {
            inputVerifications += 1;
            events.push(`verify-input-${inputVerifications}`);
            if (inputVerifications === 2) {
              throw new Error("published allocation changed");
            }
          },
          verifyAllocation: async () => {
            events.push("verify-allocation");
          },
          revalidateSourceClosure: async () => {
            events.push("revalidate-source");
          },
          publishManifest: async () => {
            events.push("manifest");
          },
        }),
      ),
    ).rejects.toThrow(/published allocation changed/);
    expect(events).toEqual([
      "validate",
      "materialized-input",
      "allocation",
      "verify-input-1",
      "verify-allocation",
      "revalidate-source",
      "verify-input-2",
    ]);
  });

  it("checks the held output-root identity after final artifact verification and before manifest publish", async () => {
    const events: string[] = [];
    let allocationReads = 0;
    let swapped = false;
    await expect(
      runFloodgateRoleLockPublishSequenceCoreForTests(
        publishSequenceFixture({
          assertOutputRoot: async (checkpoint) => {
            events.push(checkpoint);
            if (checkpoint === "before-manifest-write" && swapped) {
              throw new Error("output root directory identity changed");
            }
          },
          verifyAllocation: async () => {
            allocationReads += 1;
            if (allocationReads === 3) swapped = true;
          },
          publishManifest: async () => {
            events.push("manifest-published");
          },
        }),
      ),
    ).rejects.toThrow(/output root directory identity changed/);
    expect(allocationReads).toBe(3);
    expect(events).toContain("before-manifest-write");
    expect(events).not.toContain("manifest-published");
  });

  it("revalidates the manifest and both artifacts after manifest publication", async () => {
    let inputReads = 0;
    let allocationReads = 0;
    let manifestReads = 0;
    await expect(
      runFloodgateRoleLockPublishSequenceCoreForTests(
        publishSequenceFixture({
          verifyMaterializedInput: async () => {
            inputReads += 1;
          },
          verifyAllocation: async () => {
            allocationReads += 1;
          },
          verifyManifest: async () => {
            manifestReads += 1;
          },
        }),
      ),
    ).resolves.toBeUndefined();
    expect(inputReads).toBe(4);
    expect(allocationReads).toBe(4);
    expect(manifestReads).toBe(1);
  });
});
