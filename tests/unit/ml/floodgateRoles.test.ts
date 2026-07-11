import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
  DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
  DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
  FLOODGATE_ALLOCATION_SEED,
  FLOODGATE_FILL_PARENT_RANK_DOMAIN,
  FLOODGATE_PARENTS_PER_GAME,
  FLOODGATE_PHASE_PARENT_RANK_DOMAIN,
  FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS,
  FLOODGATE_PLANNED_ALLOCATION,
  FLOODGATE_PURE_ALLOCATION_SCHEMA,
  FLOODGATE_PURE_INPUT_SCHEMA,
  FLOODGATE_ROLE_PRIORITY,
  FloodgateProductionEvidenceUnavailableError,
  allocateFloodgateRolesFromLockedEvidence,
  allocateFloodgateRolesPure,
  protectedSemanticPositionIds,
  type FloodgatePureGameInput,
  type FloodgateRole,
} from "../../../ml/floodgate-roles";
import { positionKeyFromSfen } from "../../../ml/sibling-data";
import { childSfenAfterUsi } from "../../../ml/shogi-sfen";

const EMPTY_COUNTS: Readonly<Record<FloodgateRole, number>> = {
  fresh_final_holdout: 0,
  fresh_selection: 0,
  training: 0,
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function shaId(value: string): string {
  return `sha256:${sha256(value)}`;
}

function identity(value: string): string {
  return `${value}+${sha256(`identity:${value}`).slice(0, 32)}`;
}

function parentId(gameId: string, ply: number): string {
  return shaId(`parent-occurrence-v1\0${gameId}\0${ply}`);
}

/**
 * Encode a fixture tag in Gote's hand. Sente has only a corner king, so each
 * parent stays cheap to enumerate while its complete protected group is unique.
 */
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

function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function makeGame(
  index: number,
  options: {
    plies?: readonly number[];
    identities?: readonly [string, string];
    tagBase?: number;
  } = {},
): FloodgatePureGameInput {
  const gameId = shaId(`fixture-game-${index}`);
  const plies = options.plies ?? range(16, 39);
  const tagBase = options.tagBase ?? index * 1000;
  return {
    game_id: gameId,
    player_identities: options.identities ?? [
      identity(`p${index}a`),
      identity(`p${index}b`),
    ],
    parents: plies.map((ply, parentIndex) => ({
      parent_id: parentId(gameId, ply),
      parent_sfen: fixtureSfen(tagBase + parentIndex, ply),
      ply,
    })),
  };
}

function options(
  counts: Partial<Readonly<Record<FloodgateRole, number>>>,
  legacyProtectedPositionIds: readonly string[] = [],
) {
  return {
    seed: "fixture-seed-v1",
    legacyProtectedPositionIds,
    roleGameCounts: { ...EMPTY_COUNTS, ...counts },
  };
}

function allProtectedIds(game: {
  parents: readonly { protected_position_ids: readonly string[] }[];
}): string[] {
  return game.parents.flatMap((parent) => [...parent.protected_position_ids]);
}

describe("provenance-neutral Floodgate parent sampling", () => {
  it("pins the preregistered algorithm but keeps production fail-closed", () => {
    expect(FLOODGATE_ALLOCATION_SEED).toBe("floodgate-q1-2026-role-seed-v1");
    expect(FLOODGATE_ROLE_PRIORITY).toEqual([
      "fresh_final_holdout",
      "fresh_selection",
      "training",
    ]);
    expect(DEFAULT_FLOODGATE_ROLE_GAME_COUNTS).toEqual({
      fresh_final_holdout: 200,
      fresh_selection: 200,
      training: 1000,
    });
    expect(DEFAULT_FLOODGATE_GAME_RANK_DOMAINS).toEqual({
      fresh_final_holdout: "floodgate-q1-2026-final-game-v1",
      fresh_selection: "floodgate-q1-2026-selection-game-v1",
      training: "floodgate-q1-2026-training-game-v1",
    });
    expect(FLOODGATE_PHASE_PARENT_RANK_DOMAIN).toBe(
      "floodgate-q1-2026-parent-phase-v1",
    );
    expect(FLOODGATE_FILL_PARENT_RANK_DOMAIN).toBe(
      "floodgate-q1-2026-parent-fill-v1",
    );
    expect(DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS).toEqual({
      phase: "floodgate-q1-2026-parent-phase-v1",
      fill: "floodgate-q1-2026-parent-fill-v1",
    });
    expect(FLOODGATE_PLANNED_ALLOCATION).toEqual({
      seed: FLOODGATE_ALLOCATION_SEED,
      roleGameCounts: DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
      gameRankDomains: DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
      parentRankDomains: DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
      legacyProtectedPositionIds:
        FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS,
    });
    expect(Object.isFrozen(FLOODGATE_PLANNED_ALLOCATION)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FLOODGATE_ROLE_GAME_COUNTS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FLOODGATE_GAME_RANK_DOMAINS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS)).toBe(true);
    expect(Object.isFrozen(FLOODGATE_ROLE_PRIORITY)).toBe(true);
    expect(
      Object.isFrozen(FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS),
    ).toBe(true);
    expect(FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS).toEqual({
      count: 8678,
      identifiersSha256:
        "f9d9560452554b7e40ed0183c95f9d42cc8b8787f63200b453a511dd44fac5c5",
    });
    expect(() =>
      allocateFloodgateRolesFromLockedEvidence({
        forged_games: [makeGame(999)],
        forged_identity: identity("forged"),
      }),
    ).toThrow(FloodgateProductionEvidenceUnavailableError);
  });

  it("is input-order invariant and deterministic down to canonical bytes", () => {
    const games = Array.from({ length: 7 }, (_, index) => makeGame(index));
    const allocationOptions = options({
      fresh_final_holdout: 1,
      fresh_selection: 1,
      training: 1,
    });

    const forward = allocateFloodgateRolesPure(games, allocationOptions);
    const reversed = allocateFloodgateRolesPure(
      [...games].reverse(),
      allocationOptions,
    );
    const repeated = allocateFloodgateRolesPure(games, allocationOptions);

    expect(reversed).toEqual(forward);
    expect(repeated).toEqual(forward);
    expect(forward.output.schema).toBe(FLOODGATE_PURE_ALLOCATION_SCHEMA);
    expect(forward.output.provenance).toEqual({
      status: "unverified-pure-core",
      production_eligible: false,
      raw_source_evidence_revalidated: false,
      teacher_or_candidate_scores_consumed: false,
    });
    expect(forward.output.input_binding.format).toBe(
      FLOODGATE_PURE_INPUT_SCHEMA,
    );
    expect(forward.output.seed).toBe("fixture-seed-v1");
    expect(forward.output.game_rank_domains).toEqual(
      DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
    );
    expect(Buffer.byteLength(forward.input_canonical_json, "utf8")).toBe(
      forward.input_canonical_json_bytes,
    );
    expect(sha256(forward.input_canonical_json)).toBe(
      forward.input_canonical_json_sha256,
    );
    expect(Buffer.byteLength(forward.canonical_json, "utf8")).toBe(
      forward.canonical_json_bytes,
    );
    expect(sha256(forward.canonical_json)).toBe(forward.canonical_json_sha256);
    expect(JSON.parse(forward.canonical_json)).toEqual(forward.output);
  });

  it("takes 6/12/6 when available, then hash-fills phase shortfalls to exactly 24", () => {
    const balanced = makeGame(10, { plies: range(16, 119) });
    const balancedResult = allocateFloodgateRolesPure(
      [balanced],
      options({ fresh_final_holdout: 1 }),
    ).output.roles.fresh_final_holdout[0];
    expect(balancedResult.parents).toHaveLength(FLOODGATE_PARENTS_PER_GAME);
    expect(
      Object.fromEntries(
        ["opening", "middle", "endgame"].map((phase) => [
          phase,
          balancedResult.parents.filter((parent) => parent.phase === phase)
            .length,
        ]),
      ),
    ).toEqual({ opening: 6, middle: 12, endgame: 6 });
    expect(
      balancedResult.parents.every(
        (parent) => parent.sampling_stage === "phase",
      ),
    ).toBe(true);

    const short = makeGame(11, {
      plies: [...range(16, 19), ...range(32, 47), ...range(80, 83)],
    });
    const shortResult = allocateFloodgateRolesPure(
      [short],
      options({ fresh_final_holdout: 1 }),
    ).output.roles.fresh_final_holdout[0];
    expect(shortResult.parents).toHaveLength(24);
    expect(
      shortResult.parents.filter((parent) => parent.phase === "opening"),
    ).toHaveLength(4);
    expect(
      shortResult.parents.filter((parent) => parent.phase === "middle"),
    ).toHaveLength(16);
    expect(
      shortResult.parents.filter((parent) => parent.phase === "endgame"),
    ).toHaveLength(4);
    expect(
      shortResult.parents.filter((parent) => parent.sampling_stage === "fill"),
    ).toHaveLength(4);
  });

  it("protects parents, every legal child, and child transpositions", () => {
    const start =
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
    const playedChild = childSfenAfterUsi(start, "7g7f");
    expect(protectedSemanticPositionIds(start)).toContain(
      positionKeyFromSfen(playedChild),
    );

    const rookFromEight = "4k4/9/9/9/9/9/9/4R4/K8 b - 1";
    const rookFromSix = "4k4/9/9/9/9/4R4/9/9/K8 b - 1";
    const transpositionA = childSfenAfterUsi(rookFromEight, "5h5g");
    const transpositionB = childSfenAfterUsi(rookFromSix, "5f5g");
    expect(positionKeyFromSfen(transpositionA)).toBe(
      positionKeyFromSfen(transpositionB),
    );

    const firstProtected = new Set(protectedSemanticPositionIds(rookFromEight));
    const common = protectedSemanticPositionIds(rookFromSix).filter((id) =>
      firstProtected.has(id),
    );
    expect(common).toContain(positionKeyFromSfen(transpositionA));
  });

  it("protects both promoted and declined bishop/rook child positions", () => {
    const cases = [
      {
        parent: "4k4/9/9/9/4B4/9/9/9/K8 b - 1",
        promoted: "4k4/9/6+B2/9/9/9/9/9/K8 w - 2",
        declined: "4k4/9/6B2/9/9/9/9/9/K8 w - 2",
      },
      {
        parent: "k8/9/9/9/4R4/9/9/9/K8 b - 1",
        promoted: "k8/9/4+R4/9/9/9/9/9/K8 w - 2",
        declined: "k8/9/4R4/9/9/9/9/9/K8 w - 2",
      },
    ] as const;

    for (const fixture of cases) {
      const protectedIds = protectedSemanticPositionIds(fixture.parent);
      const promotedId = positionKeyFromSfen(fixture.promoted);
      const declinedId = positionKeyFromSfen(fixture.declined);
      expect(promotedId).not.toBe(declinedId);
      expect(protectedIds).toContain(promotedId);
      expect(protectedIds).toContain(declinedId);
    }
  });

  it("skips and fills actual parent-to-child and child-transposition collisions", () => {
    const game = makeGame(12, { plies: range(16, 41) });
    const start =
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 17";
    const playedChild = `${childSfenAfterUsi(start, "7g7f").split(" ").slice(0, 3).join(" ")} 18`;
    const rookFromEight = "4k4/9/9/9/9/9/9/4R4/K8 b - 19";
    const rookFromSix = "4k4/9/9/9/9/4R4/9/9/K8 b - 20";
    const collisionSfens = [start, playedChild, rookFromEight, rookFromSix];
    const withCollisions: FloodgatePureGameInput = {
      ...game,
      parents: game.parents.map((parent, index) =>
        index < collisionSfens.length
          ? { ...parent, parent_sfen: collisionSfens[index] }
          : parent,
      ),
    };

    const selected = allocateFloodgateRolesPure(
      [withCollisions],
      options({ fresh_final_holdout: 1 }),
    ).output.roles.fresh_final_holdout[0];
    const selectedIds = new Set(
      selected.parents.map((parent) => parent.parent_id),
    );

    expect(selected.parents).toHaveLength(24);
    expect(
      [game.parents[0], game.parents[1]].filter((parent) =>
        selectedIds.has(parent.parent_id),
      ),
    ).toHaveLength(1);
    expect(
      [game.parents[2], game.parents[3]].filter((parent) =>
        selectedIds.has(parent.parent_id),
      ),
    ).toHaveLength(1);
    const protectedIds = allProtectedIds(selected);
    expect(new Set(protectedIds).size).toBe(protectedIds.length);
  });
});

describe("whole-game Floodgate role isolation", () => {
  it("rejects identical identities and any score-like or unknown input key", () => {
    const same = identity("self-play");
    expect(() =>
      allocateFloodgateRolesPure(
        [makeGame(13, { identities: [same, same] })],
        options({}),
      ),
    ).toThrow(/repeats the same full player identity/);

    const clean = makeGame(14);
    const gameWithScore = {
      ...clean,
      cp: 100,
    } as unknown as FloodgatePureGameInput;
    expect(() =>
      allocateFloodgateRolesPure([gameWithScore], options({})),
    ).toThrow(/pure core games\[0\] must contain exactly keys.*cp/);

    const parentWithScore = {
      ...clean,
      parents: [
        { ...clean.parents[0], teacher_score: 42 },
        ...clean.parents.slice(1),
      ],
    } as unknown as FloodgatePureGameInput;
    expect(() =>
      allocateFloodgateRolesPure([parentWithScore], options({})),
    ).toThrow(/parents\[0\] must contain exactly keys.*teacher_score/);
  });

  it("rejects a forged caller hash and binds exact normalized input bytes itself", () => {
    const forgedOptions = {
      ...options({}),
      inputManifestSha256: "0".repeat(64),
    };
    expect(() => allocateFloodgateRolesPure([], forgedOptions)).toThrow(
      /pure core options has unknown keys inputManifestSha256/,
    );

    const first = allocateFloodgateRolesPure([makeGame(15)], options({}));
    const second = allocateFloodgateRolesPure([makeGame(16)], options({}));
    expect(first.input_canonical_json_sha256).toBe(
      sha256(first.input_canonical_json),
    );
    expect(first.output.input_binding.canonical_json_sha256).toBe(
      first.input_canonical_json_sha256,
    );
    expect(first.input_canonical_json_sha256).not.toBe(
      second.input_canonical_json_sha256,
    );
  });

  it("validates every SFEN before hashing, including zero-quota and late-unused games", () => {
    const zeroQuota = makeGame(160, { plies: [0] });
    const injectedText: FloodgatePureGameInput = {
      ...zeroQuota,
      parents: [
        {
          ...zeroQuota.parents[0],
          parent_sfen: "teacher_score: 9000",
        },
      ],
    };
    expect(() =>
      allocateFloodgateRolesPure([injectedText], options({})),
    ).toThrow(/invalid SFEN header/);

    const valid = makeGame(161);
    const lateUnused = makeGame(162);
    const wrongMoveNumber: FloodgatePureGameInput = {
      ...lateUnused,
      parents: lateUnused.parents.map((parent, index) =>
        index === 0
          ? {
              ...parent,
              parent_sfen: `${parent.parent_sfen.split(" ").slice(0, 3).join(" ")} ${parent.ply + 2}`,
            }
          : parent,
      ),
    };
    expect(() =>
      allocateFloodgateRolesPure(
        [valid, wrongMoveNumber],
        options({ fresh_final_holdout: 1 }),
      ),
    ).toThrow(/parent_sfen move number does not match ply/);
  });

  it("rejects colon identities and unpaired UTF-16 surrogates", () => {
    const colonIdentity = `bad:name+${"a".repeat(32)}`;
    expect(() =>
      allocateFloodgateRolesPure(
        [makeGame(163, { identities: [colonIdentity, identity("opponent")] })],
        options({}),
      ),
    ).toThrow(/noncanonical full player identity/);

    const unpaired = `bad\ud800+${"b".repeat(32)}`;
    expect(() =>
      allocateFloodgateRolesPure(
        [makeGame(164, { identities: [unpaired, identity("opponent-2")] })],
        options({}),
      ),
    ).toThrow(/well-formed Unicode/);
  });

  it("rejects accessors, symbols, non-enumerables, and custom prototypes", () => {
    let accessorReads = 0;
    const accessorGame = { ...makeGame(17) } as Record<string, unknown>;
    Object.defineProperty(accessorGame, "game_id", {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return makeGame(17).game_id;
      },
    });
    expect(() =>
      allocateFloodgateRolesPure([accessorGame], options({})),
    ).toThrow(/game_id must be a data property, not an accessor/);
    expect(accessorReads).toBe(0);

    const symbolGame = makeGame(18) as FloodgatePureGameInput &
      Record<symbol, unknown>;
    symbolGame[Symbol("teacher_score")] = 1;
    expect(() => allocateFloodgateRolesPure([symbolGame], options({}))).toThrow(
      /must not contain symbol keys/,
    );

    const hiddenGame = { ...makeGame(19) };
    Object.defineProperty(hiddenGame, "cp", { value: 1, enumerable: false });
    expect(() => allocateFloodgateRolesPure([hiddenGame], options({}))).toThrow(
      /cp must not be non-enumerable/,
    );

    const inherited = Object.assign(
      Object.create({ forged: true }),
      makeGame(20),
    );
    expect(() => allocateFloodgateRolesPure([inherited], options({}))).toThrow(
      /must be a plain object with Object\.prototype/,
    );
  });

  it("rejects proxies at game, parent, array, and options boundaries without reading traps", () => {
    let trapReads = 0;
    const proxied = <T extends object>(target: T): T =>
      new Proxy(target, {
        get(object, property, receiver) {
          trapReads += 1;
          return Reflect.get(object, property, receiver);
        },
      });

    const rootGamesProxy = proxied([makeGame(165)]);
    expect(() =>
      allocateFloodgateRolesPure(rootGamesProxy, options({})),
    ).toThrow(/pure core games must not be a Proxy/);

    const gameProxy = proxied(makeGame(166));
    expect(() => allocateFloodgateRolesPure([gameProxy], options({}))).toThrow(
      /pure core games\[0\] must not be a Proxy/,
    );

    const parentBase = makeGame(167);
    const parentProxy: FloodgatePureGameInput = {
      ...parentBase,
      parents: [proxied(parentBase.parents[0]), ...parentBase.parents.slice(1)],
    };
    expect(() =>
      allocateFloodgateRolesPure([parentProxy], options({})),
    ).toThrow(/parents\[0\] must not be a Proxy/);

    const identitiesBase = makeGame(168);
    const identityArrayProxy = {
      ...identitiesBase,
      player_identities: proxied([...identitiesBase.player_identities]),
    };
    expect(() =>
      allocateFloodgateRolesPure([identityArrayProxy], options({})),
    ).toThrow(/player_identities must not be a Proxy/);

    const optionsProxy = proxied(options({}));
    expect(() => allocateFloodgateRolesPure([], optionsProxy)).toThrow(
      /pure core options must not be a Proxy/,
    );
    expect(trapReads).toBe(0);
  });

  it("deep-copies caller data and deep-freezes every returned layer", () => {
    const callerGame = makeGame(21) as unknown as {
      game_id: string;
      player_identities: string[];
      parents: { parent_id: string; parent_sfen: string; ply: number }[];
    };
    const callerOptions = options({ fresh_final_holdout: 1 }) as {
      seed: string;
      legacyProtectedPositionIds: string[];
      roleGameCounts: Record<FloodgateRole, number>;
    };
    const artifact = allocateFloodgateRolesPure([callerGame], callerOptions);
    const selected = artifact.output.roles.fresh_final_holdout[0];
    const originalIdentity = selected.player_identities[0];
    const originalParentSfen = selected.parents[0].parent_sfen;
    const canonicalBefore = artifact.canonical_json;

    callerGame.player_identities[0] = identity("mutated-caller");
    callerGame.parents[0].parent_sfen = fixtureSfen(999_999, 16);
    callerOptions.seed = "mutated-seed";
    callerOptions.roleGameCounts.fresh_final_holdout = 0;
    callerOptions.legacyProtectedPositionIds.push(shaId("mutated-legacy"));
    expect(selected.player_identities[0]).toBe(originalIdentity);
    expect(selected.parents[0].parent_sfen).toBe(originalParentSfen);
    expect(artifact.canonical_json).toBe(canonicalBefore);
    expect(artifact.output.seed).toBe("fixture-seed-v1");
    expect(
      artifact.output.role_summaries.fresh_final_holdout.requested_games,
    ).toBe(1);
    expect(artifact.output.legacy_protected_position_ids_count).toBe(0);

    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.output)).toBe(true);
    expect(Object.isFrozen(artifact.output.roles)).toBe(true);
    expect(Object.isFrozen(artifact.output.roles.fresh_final_holdout)).toBe(
      true,
    );
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected.player_identities)).toBe(true);
    expect(Object.isFrozen(selected.parents)).toBe(true);
    expect(Object.isFrozen(selected.parents[0])).toBe(true);
    expect(Object.isFrozen(selected.parents[0].protected_position_ids)).toBe(
      true,
    );
    expect(
      Object.isFrozen(
        artifact.output.role_summaries.fresh_final_holdout.game_parent_ids,
      ),
    ).toBe(true);

    expect(() => {
      (artifact as unknown as { canonical_json: string }).canonical_json =
        "forged";
    }).toThrow();
    expect(() => {
      (
        artifact.output.roles
          .fresh_final_holdout as unknown as FloodgatePureGameInput[]
      ).push(makeGame(22));
    }).toThrow();
    expect(() => {
      (selected.parents[0].protected_position_ids as unknown as string[]).push(
        shaId("forged-protected-id"),
      );
    }).toThrow();
  });

  it("keeps games and complete semantic groups disjoint within and across roles", () => {
    const result = allocateFloodgateRolesPure(
      Array.from({ length: 8 }, (_, index) => makeGame(20 + index)),
      options({ fresh_final_holdout: 1, fresh_selection: 1, training: 1 }),
    );
    const games = Object.values(result.output.roles).flat();
    expect(new Set(games.map((game) => game.game_id)).size).toBe(3);
    expect(games.every((game) => game.parents.length === 24)).toBe(true);

    const protectedGroups = games.map((game) => allProtectedIds(game));
    const flattened = protectedGroups.flat();
    expect(new Set(flattened).size).toBe(flattened.length);
    expect(result.output.all_protected_position_ids_count).toBe(
      flattened.length,
    );
  });

  it("excludes a legacy parent or child ID and fills from remaining parents", () => {
    const game = makeGame(30, { plies: range(16, 40) });
    const legacyParentId = positionKeyFromSfen(game.parents[0].parent_sfen);
    const result = allocateFloodgateRolesPure(
      [game],
      options({ fresh_final_holdout: 1 }, [legacyParentId]),
    );
    const selected = result.output.roles.fresh_final_holdout[0];

    expect(selected.parents).toHaveLength(24);
    expect(allProtectedIds(selected)).not.toContain(legacyParentId);
    expect(result.output.legacy_protected_position_ids_count).toBe(1);
  });

  it("uses a replacement game when semantic exclusion leaves only 23 parents", () => {
    const candidates = [makeGame(40), makeGame(41)];
    const seed = "fixture-seed-v1";
    const domain = DEFAULT_FLOODGATE_GAME_RANK_DOMAINS.fresh_final_holdout;
    const ordered = [...candidates].sort((left, right) => {
      const leftRank = createHash("sha256")
        .update(`${domain}\0${seed}\0${left.game_id}`, "utf8")
        .digest();
      const rightRank = createHash("sha256")
        .update(`${domain}\0${seed}\0${right.game_id}`, "utf8")
        .digest();
      return (
        Buffer.compare(leftRank, rightRank) ||
        Buffer.compare(Buffer.from(left.game_id), Buffer.from(right.game_id))
      );
    });
    const rejected = ordered[0];
    const replacement = ordered[1];
    const blocked = positionKeyFromSfen(rejected.parents[0].parent_sfen);

    const result = allocateFloodgateRolesPure(
      candidates,
      options({ fresh_final_holdout: 1 }, [blocked]),
    );
    expect(
      result.output.roles.fresh_final_holdout.map((game) => game.game_id),
    ).toEqual([replacement.game_id]);
  });

  it("enforces both the 10% identity cap and 2% unordered-pair cap", () => {
    const shared = identity("shared-player");
    const exactPair: readonly [string, string] = [
      identity("pair-a"),
      identity("pair-b"),
    ];
    const uniqueGames = Array.from({ length: 88 }, (_, index) =>
      makeGame(100 + index),
    );
    const sharedGames = Array.from({ length: 15 }, (_, index) =>
      makeGame(200 + index, {
        identities: [shared, identity(`shared-opponent-${index}`)],
      }),
    );
    const repeatedPairGames = Array.from({ length: 5 }, (_, index) =>
      makeGame(300 + index, { identities: exactPair }),
    );
    const result = allocateFloodgateRolesPure(
      [...sharedGames, ...repeatedPairGames, ...uniqueGames].reverse(),
      options({ fresh_final_holdout: 100 }),
    );
    const summary = result.output.role_summaries.fresh_final_holdout;
    const sharedCount = summary.identity_game_counts.find(
      (row) => row.identity === shared,
    )?.games;
    const pairCount = summary.unordered_identity_pair_game_counts.find(
      (row) =>
        row.identities.includes(exactPair[0]) &&
        row.identities.includes(exactPair[1]),
    )?.games;

    expect(result.output.roles.fresh_final_holdout).toHaveLength(100);
    expect(summary.identity_game_cap).toBe(10);
    expect(summary.unordered_identity_pair_game_cap).toBe(2);
    expect(sharedCount).toBe(10);
    expect(pairCount).toBe(2);
    expect(summary.identity_game_counts.every((row) => row.games <= 10)).toBe(
      true,
    );
    expect(
      summary.unordered_identity_pair_game_counts.every(
        (row) => row.games <= 2,
      ),
    ).toBe(true);
  }, 30_000);

  it("fails closed instead of relaxing a game or parent quota", () => {
    const tooShort = makeGame(500, { plies: range(16, 38) });
    expect(() =>
      allocateFloodgateRolesPure(
        [tooShort],
        options({ fresh_final_holdout: 1 }),
      ),
    ).toThrow(
      /cannot allocate exact fresh_final_holdout quota: selected 0 of 1 games/,
    );

    expect(() =>
      allocateFloodgateRolesPure(
        [makeGame(501)],
        options({ fresh_final_holdout: 1, fresh_selection: 1 }),
      ),
    ).toThrow(
      /cannot allocate exact fresh_selection quota: selected 0 of 1 games/,
    );
  });
});
