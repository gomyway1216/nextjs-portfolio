import { createHash } from "node:crypto";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  main,
  modelFloodgatePreFixManifestFromRetryCaps,
  replayFloodgateRoleLockAccounting,
} from "../../../ml/diagnose-floodgate-role-lock-accounting";
import {
  DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
  DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
  FLOODGATE_ALLOCATION_SEED,
  FLOODGATE_ROLE_PRIORITY,
  floodgateIdentifierDigest,
  type FloodgatePureGameInput,
  type FloodgateRole,
} from "../../../ml/floodgate-roles";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareUtf8Bytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function makeGame(index: number): FloodgatePureGameInput {
  return {
    game_id: `sha256:${sha256(`accounting-diagnostic-game-${index}`)}`,
    player_identities: [
      `diagnostic-a-${index}+${sha256(`a-${index}`).slice(0, 32)}`,
      `diagnostic-b-${index}+${sha256(`b-${index}`).slice(0, 32)}`,
    ],
    parents: [],
  };
}

function ranked(
  games: readonly FloodgatePureGameInput[],
  role: FloodgateRole,
): FloodgatePureGameInput[] {
  return [...games]
    .map((game) => ({
      game,
      digest: createHash("sha256")
        .update(
          [
            DEFAULT_FLOODGATE_GAME_RANK_DOMAINS[role],
            FLOODGATE_ALLOCATION_SEED,
            game.game_id,
          ].join("\0"),
        )
        .digest(),
    }))
    .sort(
      (left, right) =>
        Buffer.compare(left.digest, right.digest) ||
        compareUtf8Bytes(left.game.game_id, right.game.game_id),
    )
    .map(({ game }) => game);
}

function allocationExcluding(
  rankings: Readonly<Record<FloodgateRole, readonly FloodgatePureGameInput[]>>,
  excludedGameId: string,
): {
  readonly roles: Record<FloodgateRole, Readonly<{ game_id: string }>[]>;
  readonly excludedEncounters: readonly FloodgateRole[];
  readonly selectedBeforeExcluded: Readonly<Record<FloodgateRole, number>>;
} {
  const selected = new Set<string>();
  const excludedEncounters: FloodgateRole[] = [];
  const selectedBeforeExcluded = {
    fresh_final_holdout: 0,
    fresh_selection: 0,
    training: 0,
  };
  const roles = {
    fresh_final_holdout: [],
    fresh_selection: [],
    training: [],
  } as Record<FloodgateRole, { game_id: string }[]>;
  for (const role of FLOODGATE_ROLE_PRIORITY) {
    for (const game of rankings[role]) {
      if (roles[role].length === DEFAULT_FLOODGATE_ROLE_GAME_COUNTS[role]) {
        break;
      }
      if (selected.has(game.game_id)) continue;
      if (game.game_id === excludedGameId) {
        excludedEncounters.push(role);
        selectedBeforeExcluded[role] = roles[role].length;
      } else {
        roles[role].push({ game_id: game.game_id });
        selected.add(game.game_id);
      }
    }
  }
  return { roles, excludedEncounters, selectedBeforeExcluded };
}

describe("Floodgate role-lock accounting diagnostic", () => {
  it("distinguishes repeated later-role encounters from unique games", () => {
    const games = Array.from({ length: 1401 }, (_, index) => makeGame(index));
    const rankings = Object.fromEntries(
      FLOODGATE_ROLE_PRIORITY.map((role) => [role, ranked(games, role)]),
    ) as Record<FloodgateRole, FloodgatePureGameInput[]>;
    const rejected = rankings.fresh_final_holdout
      .slice(0, DEFAULT_FLOODGATE_ROLE_GAME_COUNTS.fresh_final_holdout)
      .find((candidate) => {
        const { excludedEncounters, selectedBeforeExcluded } =
          allocationExcluding(rankings, candidate.game_id);
        return (
          excludedEncounters.length === FLOODGATE_ROLE_PRIORITY.length &&
          selectedBeforeExcluded.fresh_selection >= 20
        );
      });
    expect(rejected).toBeDefined();

    const { roles } = allocationExcluding(rankings, rejected!.game_id);
    const replay = replayFloodgateRoleLockAccounting(games, roles);
    expect(replay).toMatchObject({
      candidate_attempt_events: 1403,
      final_semantic_rejections: 1,
      previously_rejected_later_role_encounters: 2,
      previously_rejected_later_role_unique_games: 1,
      identity_cap_stop_events: 0,
      pair_cap_stop_events: 0,
      actual_reprobe_events: 2,
      actual_reprobe_unique_games: 1,
      reprobe_rejected_again_events: 2,
      reprobe_rejected_again_unique_games: 1,
    });
    expect(replay.encounter_event_digest).toBe(
      floodgateIdentifierDigest([
        `fresh_selection\0${rejected!.game_id}`,
        `training\0${rejected!.game_id}`,
      ]),
    );

    const selectedBeforeRejected = allocationExcluding(
      rankings,
      rejected!.game_id,
    ).selectedBeforeExcluded.fresh_selection;
    const selectionBeforeIds = new Set(
      roles.fresh_selection
        .slice(0, selectedBeforeRejected)
        .map((game) => game.game_id),
    );
    const sharedA = `diagnostic-shared-a+${sha256("shared-a").slice(0, 32)}`;
    const sharedB = `diagnostic-shared-b+${sha256("shared-b").slice(0, 32)}`;
    const withCapIdentities = (
      selectedCount: number,
      useSharedPair: boolean,
    ): FloodgatePureGameInput[] => {
      const sharedSelectedIds = new Set(
        [...selectionBeforeIds].slice(0, selectedCount),
      );
      return games.map((game) =>
        game.game_id === rejected!.game_id ||
        sharedSelectedIds.has(game.game_id)
          ? {
              ...game,
              player_identities: [
                sharedA,
                useSharedPair ? sharedB : game.player_identities[1],
              ],
            }
          : game,
      );
    };

    const identityCapReplay = replayFloodgateRoleLockAccounting(
      withCapIdentities(20, false),
      roles,
    );
    expect(identityCapReplay).toMatchObject({
      candidate_attempt_events: 1402,
      previously_rejected_later_role_encounters: 2,
      identity_cap_stop_events: 1,
      identity_cap_stop_unique_games: 1,
      pair_cap_stop_events: 0,
      actual_reprobe_events: 1,
      reprobe_rejected_again_events: 1,
    });
    expect(identityCapReplay.by_role.fresh_selection.identity_cap_stops).toBe(
      1,
    );

    const pairCapReplay = replayFloodgateRoleLockAccounting(
      withCapIdentities(4, true),
      roles,
    );
    expect(pairCapReplay).toMatchObject({
      candidate_attempt_events: 1402,
      previously_rejected_later_role_encounters: 2,
      identity_cap_stop_events: 0,
      pair_cap_stop_events: 1,
      pair_cap_stop_unique_games: 1,
      actual_reprobe_events: 1,
      reprobe_rejected_again_events: 1,
    });
    expect(pairCapReplay.by_role.fresh_selection.pair_cap_stops).toBe(1);
  });

  it("models only the historical cap field without claiming an old-code run", () => {
    const historical =
      '{"accounting":{"identity_cap_role_checks_skipped_before_materialization":1924,"semantic_or_parent_quota_rejections":219,"unordered_pair_cap_role_checks_skipped_before_materialization":2},"status":"fixture"}\n';
    const modeled = modelFloodgatePreFixManifestFromRetryCaps(historical, 6, 0);
    expect(modeled.historical_accounting).toEqual({
      identity_cap_role_checks_skipped_before_materialization: 1924,
      unordered_pair_cap_role_checks_skipped_before_materialization: 2,
    });
    expect(modeled.modeled_accounting).toEqual({
      identity_cap_role_checks_skipped_before_materialization: 1930,
      unordered_pair_cap_role_checks_skipped_before_materialization: 2,
    });
    expect(modeled.json_pointer_differences).toEqual([
      {
        pointer:
          "/accounting/identity_cap_role_checks_skipped_before_materialization",
        historical: 1924,
        modeled: 1930,
      },
    ]);
    expect(sha256(modeled.modeled_manifest_text)).toBe(
      "46006e6cea3a0df5ef6a940b208cff49cdaacefbf37c8215c9b3529aea74b04d",
    );
  });

  it("reports malformed manifest and file inputs as diagnostic errors", () => {
    expect(() =>
      modelFloodgatePreFixManifestFromRetryCaps('{"status":"fixture"}\n', 0, 0),
    ).toThrow(
      "invalid Floodgate accounting diagnostic: historical manifest accounting must be a plain JSON object",
    );

    const missing = path.join(
      process.cwd(),
      `.missing-floodgate-accounting-diagnostic-${process.pid}.json`,
    );
    expect(() =>
      main([
        "--materialized-input",
        missing,
        "--allocation",
        missing,
        "--manifest",
        missing,
      ]),
    ).toThrow(
      `invalid Floodgate accounting diagnostic: materialized input does not exist or is inaccessible: ${missing}`,
    );
  });
});
