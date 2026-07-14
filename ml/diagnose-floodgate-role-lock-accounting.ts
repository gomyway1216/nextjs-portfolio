/**
 * Reproduce the accounting-only difference discovered by the optimized
 * Floodgate role-lock verifier. This diagnostic is deliberately non-gating:
 * the production full-bundle verifier remains the adoption authority.
 *
 *   node -r tsx/cjs ml/diagnose-floodgate-role-lock-accounting.ts \
 *     --materialized-input /absolute/materialized-input.json \
 *     --allocation /absolute/allocation.json \
 *     --manifest /absolute/manifest.json
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
  DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
  DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
  FLOODGATE_ALLOCATION_SEED,
  FLOODGATE_ROLE_PRIORITY,
  allocateFloodgateRolesPure,
  floodgateIdentifierDigest,
  type FloodgatePureGameInput,
  type FloodgateRole,
} from "./floodgate-roles";
import {
  FLOODGATE_ROLE_IDENTITY_GAME_CAP_RATIO,
  FLOODGATE_ROLE_UNORDERED_PAIR_GAME_CAP_RATIO,
} from "./floodgate-role-lock";

export const FLOODGATE_ROLE_LOCK_ACCOUNTING_DIAGNOSTIC_SCHEMA =
  "shogi-floodgate-role-lock-accounting-diagnostic-v1" as const;

const REVISION_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

interface DiagnosticArguments {
  readonly materializedInputPath: string;
  readonly allocationPath: string;
  readonly manifestPath: string;
}

interface MaterializedInputCandidate {
  readonly games: readonly FloodgatePureGameInput[];
  readonly legacy_protected_position_ids: readonly string[];
  readonly normalized_options: {
    readonly seed: string;
    readonly role_game_counts: Readonly<Record<FloodgateRole, number>>;
    readonly game_rank_domains: Readonly<Record<FloodgateRole, string>>;
    readonly parent_rank_domains: Readonly<{ phase: string; fill: string }>;
  };
}

interface HistoricalManifestCandidate {
  accounting: {
    identity_cap_role_checks_skipped_before_materialization: number;
    unordered_pair_cap_role_checks_skipped_before_materialization: number;
    semantic_or_parent_quota_rejections: number;
  };
  all_selected_game_ids_sha256: string;
  all_selected_parent_ids_sha256: string;
  all_protected_position_ids_count: number;
  all_protected_position_ids_sha256: string;
  [key: string]: unknown;
}

export interface FloodgateModeledPreFixManifest {
  readonly historical_accounting: Readonly<{
    identity_cap_role_checks_skipped_before_materialization: number;
    unordered_pair_cap_role_checks_skipped_before_materialization: number;
  }>;
  readonly modeled_accounting: Readonly<{
    identity_cap_role_checks_skipped_before_materialization: number;
    unordered_pair_cap_role_checks_skipped_before_materialization: number;
  }>;
  readonly modeled_manifest_text: string;
  readonly json_pointer_differences: readonly Readonly<{
    pointer: string;
    historical: number;
    modeled: number;
  }>[];
}

export interface FloodgateRoleLockAccountingReplay {
  readonly candidate_attempt_events: number;
  readonly final_semantic_rejections: number;
  readonly previously_rejected_later_role_encounters: number;
  readonly previously_rejected_later_role_unique_games: number;
  readonly identity_cap_stop_events: number;
  readonly identity_cap_stop_unique_games: number;
  readonly pair_cap_stop_events: number;
  readonly pair_cap_stop_unique_games: number;
  readonly actual_reprobe_events: number;
  readonly actual_reprobe_unique_games: number;
  readonly reprobe_rejected_again_events: number;
  readonly reprobe_rejected_again_unique_games: number;
  readonly encounter_event_digest: string;
  readonly encounter_unique_game_digest: string;
  readonly identity_cap_stop_event_digest: string;
  readonly identity_cap_stop_unique_game_digest: string;
  readonly pair_cap_stop_event_digest: string;
  readonly pair_cap_stop_unique_game_digest: string;
  readonly actual_reprobe_event_digest: string;
  readonly actual_reprobe_unique_game_digest: string;
  readonly reprobe_rejected_again_event_digest: string;
  readonly reprobe_rejected_again_unique_game_digest: string;
  readonly by_role: Readonly<
    Record<
      FloodgateRole,
      Readonly<{
        later_role_encounters: number;
        identity_cap_stops: number;
        pair_cap_stops: number;
        actual_reprobes: number;
        rejected_again: number;
      }>
    >
  >;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate accounting diagnostic: ${message}`);
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareUtf8Bytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalAbsoluteFile(input: string, label: string): string {
  if (
    input.length === 0 ||
    input !== input.trim() ||
    input.includes("\0") ||
    !path.isAbsolute(input) ||
    path.resolve(input) !== input
  ) {
    fail(`${label} must be a canonical absolute path`);
  }
  const stat = fs.lstatSync(input);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(input) !== input
  ) {
    fail(`${label} must be a real regular file without symlink traversal`);
  }
  return input;
}

function parseArguments(argv: readonly string[]): DiagnosticArguments {
  if (
    argv.length !== 6 ||
    argv[0] !== "--materialized-input" ||
    argv[2] !== "--allocation" ||
    argv[4] !== "--manifest"
  ) {
    fail(
      "usage: --materialized-input /absolute/file --allocation /absolute/file --manifest /absolute/file",
    );
  }
  return Object.freeze({
    materializedInputPath: canonicalAbsoluteFile(argv[1], "materialized input"),
    allocationPath: canonicalAbsoluteFile(argv[3], "allocation"),
    manifestPath: canonicalAbsoluteFile(argv[5], "manifest"),
  });
}

function fileIdentity(filePath: string): {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
} {
  const bytes = fs.readFileSync(filePath);
  return Object.freeze({
    path: filePath,
    bytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
  });
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    fail(`${label} is not JSON`);
  }
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    Object.getPrototypeOf(candidate) !== Object.prototype
  ) {
    fail(`${label} must be a plain JSON object`);
  }
  return candidate as Record<string, unknown>;
}

/** Model historical cap counters without claiming to execute the old code. */
export function modelFloodgatePreFixManifestFromRetryCaps(
  historicalManifestText: string,
  identityCapStopEvents: number,
  pairCapStopEvents: number,
): FloodgateModeledPreFixManifest {
  if (
    !Number.isSafeInteger(identityCapStopEvents) ||
    identityCapStopEvents < 0 ||
    !Number.isSafeInteger(pairCapStopEvents) ||
    pairCapStopEvents < 0
  ) {
    fail("modeled retry-cap deltas must be nonnegative safe integers");
  }
  const historical = parseJsonObject(
    historicalManifestText,
    "historical manifest",
  ) as unknown as HistoricalManifestCandidate;
  const historicalIdentitySkips =
    historical.accounting
      .identity_cap_role_checks_skipped_before_materialization;
  const historicalPairSkips =
    historical.accounting
      .unordered_pair_cap_role_checks_skipped_before_materialization;
  if (
    !Number.isSafeInteger(historicalIdentitySkips) ||
    historicalIdentitySkips < 0 ||
    !Number.isSafeInteger(historicalPairSkips) ||
    historicalPairSkips < 0
  ) {
    fail("historical manifest cap counters are invalid");
  }

  const modeled = structuredClone(historical);
  modeled.accounting.identity_cap_role_checks_skipped_before_materialization =
    historicalIdentitySkips + identityCapStopEvents;
  modeled.accounting.unordered_pair_cap_role_checks_skipped_before_materialization =
    historicalPairSkips + pairCapStopEvents;
  const modeledManifestText = `${JSON.stringify(modeled)}\n`;
  const reverted = structuredClone(modeled);
  reverted.accounting.identity_cap_role_checks_skipped_before_materialization =
    historicalIdentitySkips;
  reverted.accounting.unordered_pair_cap_role_checks_skipped_before_materialization =
    historicalPairSkips;
  if (`${JSON.stringify(reverted)}\n` !== historicalManifestText) {
    fail("modeled manifest changed more than the two cap counters");
  }

  const differences = [
    identityCapStopEvents === 0
      ? null
      : {
          pointer:
            "/accounting/identity_cap_role_checks_skipped_before_materialization",
          historical: historicalIdentitySkips,
          modeled: historicalIdentitySkips + identityCapStopEvents,
        },
    pairCapStopEvents === 0
      ? null
      : {
          pointer:
            "/accounting/unordered_pair_cap_role_checks_skipped_before_materialization",
          historical: historicalPairSkips,
          modeled: historicalPairSkips + pairCapStopEvents,
        },
  ].filter((difference) => difference !== null);
  return Object.freeze({
    historical_accounting: Object.freeze({
      identity_cap_role_checks_skipped_before_materialization:
        historicalIdentitySkips,
      unordered_pair_cap_role_checks_skipped_before_materialization:
        historicalPairSkips,
    }),
    modeled_accounting: Object.freeze({
      identity_cap_role_checks_skipped_before_materialization:
        historicalIdentitySkips + identityCapStopEvents,
      unordered_pair_cap_role_checks_skipped_before_materialization:
        historicalPairSkips + pairCapStopEvents,
    }),
    modeled_manifest_text: modeledManifestText,
    json_pointer_differences: Object.freeze(differences),
  });
}

function rankGames(
  games: readonly FloodgatePureGameInput[],
  role: FloodgateRole,
): readonly FloodgatePureGameInput[] {
  const domain = DEFAULT_FLOODGATE_GAME_RANK_DOMAINS[role];
  return [...games]
    .map((game) => ({
      game,
      digest: createHash("sha256")
        .update([domain, FLOODGATE_ALLOCATION_SEED, game.game_id].join("\0"))
        .digest(),
    }))
    .sort(
      (left, right) =>
        Buffer.compare(left.digest, right.digest) ||
        compareUtf8Bytes(left.game.game_id, right.game.game_id),
    )
    .map(({ game }) => game);
}

function pairKey(identities: readonly [string, string]): string {
  return [...identities].sort(compareUtf8Bytes).join("\0");
}

function eventDigest(events: readonly string[]): string {
  return floodgateIdentifierDigest(events);
}

function eventGameIds(events: readonly string[]): string[] {
  return events.map((event) => event.slice(event.indexOf("\0") + 1));
}

/**
 * Replays only rank/cap/control flow. Exact pure allocation is the parent
 * sampler oracle, so this cannot independently approve the production data.
 */
export function replayFloodgateRoleLockAccounting(
  games: readonly FloodgatePureGameInput[],
  allocatedRoles: Readonly<
    Record<FloodgateRole, readonly Readonly<{ game_id: string }>[]>
  >,
): FloodgateRoleLockAccountingReplay {
  const selectedByRole = Object.fromEntries(
    FLOODGATE_ROLE_PRIORITY.map((role) => [
      role,
      new Set(allocatedRoles[role].map((game) => game.game_id)),
    ]),
  ) as Record<FloodgateRole, Set<string>>;
  const selectedGameIds = new Set<string>();
  const semanticRejected = new Set<string>();
  const encounters: string[] = [];
  const identityStops: string[] = [];
  const pairStops: string[] = [];
  const reprobes: string[] = [];
  const rejectedAgain: string[] = [];
  let candidateAttempts = 0;

  for (const role of FLOODGATE_ROLE_PRIORITY) {
    const requested = DEFAULT_FLOODGATE_ROLE_GAME_COUNTS[role];
    const identityCap = Math.max(
      1,
      Math.floor(requested * FLOODGATE_ROLE_IDENTITY_GAME_CAP_RATIO),
    );
    const pairCap = Math.max(
      1,
      Math.floor(requested * FLOODGATE_ROLE_UNORDERED_PAIR_GAME_CAP_RATIO),
    );
    const identityCounts = new Map<string, number>();
    const pairCounts = new Map<string, number>();
    let selectedForRole = 0;

    for (const game of rankGames(games, role)) {
      if (selectedForRole >= requested) break;
      if (selectedGameIds.has(game.game_id)) continue;
      const wasSemanticRejected = semanticRejected.has(game.game_id);
      const event = `${role}\0${game.game_id}`;
      if (wasSemanticRejected) encounters.push(event);

      if (
        game.player_identities.some(
          (identity) => (identityCounts.get(identity) ?? 0) >= identityCap,
        )
      ) {
        if (wasSemanticRejected) identityStops.push(event);
        continue;
      }
      const gamePairKey = pairKey(game.player_identities);
      if ((pairCounts.get(gamePairKey) ?? 0) >= pairCap) {
        if (wasSemanticRejected) pairStops.push(event);
        continue;
      }

      candidateAttempts += 1;
      if (wasSemanticRejected) reprobes.push(event);
      if (!selectedByRole[role].has(game.game_id)) {
        semanticRejected.add(game.game_id);
        if (wasSemanticRejected) rejectedAgain.push(event);
        continue;
      }

      semanticRejected.delete(game.game_id);
      selectedGameIds.add(game.game_id);
      selectedForRole += 1;
      for (const identity of game.player_identities) {
        identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
      }
      pairCounts.set(gamePairKey, (pairCounts.get(gamePairKey) ?? 0) + 1);
    }

    if (selectedForRole !== requested) {
      fail(`${role} control-flow replay did not reach its exact quota`);
    }
  }

  const uniqueGames = (events: readonly string[]): number =>
    new Set(eventGameIds(events)).size;
  const roleEventCount = (
    events: readonly string[],
    role: FloodgateRole,
  ): number => events.filter((event) => event.startsWith(`${role}\0`)).length;
  return Object.freeze({
    candidate_attempt_events: candidateAttempts,
    final_semantic_rejections: semanticRejected.size,
    previously_rejected_later_role_encounters: encounters.length,
    previously_rejected_later_role_unique_games: uniqueGames(encounters),
    identity_cap_stop_events: identityStops.length,
    identity_cap_stop_unique_games: uniqueGames(identityStops),
    pair_cap_stop_events: pairStops.length,
    pair_cap_stop_unique_games: uniqueGames(pairStops),
    actual_reprobe_events: reprobes.length,
    actual_reprobe_unique_games: uniqueGames(reprobes),
    reprobe_rejected_again_events: rejectedAgain.length,
    reprobe_rejected_again_unique_games: uniqueGames(rejectedAgain),
    encounter_event_digest: eventDigest(encounters),
    encounter_unique_game_digest: floodgateIdentifierDigest(
      eventGameIds(encounters),
    ),
    identity_cap_stop_event_digest: eventDigest(identityStops),
    identity_cap_stop_unique_game_digest: floodgateIdentifierDigest(
      eventGameIds(identityStops),
    ),
    pair_cap_stop_event_digest: eventDigest(pairStops),
    pair_cap_stop_unique_game_digest: floodgateIdentifierDigest(
      eventGameIds(pairStops),
    ),
    actual_reprobe_event_digest: eventDigest(reprobes),
    actual_reprobe_unique_game_digest: floodgateIdentifierDigest(
      eventGameIds(reprobes),
    ),
    reprobe_rejected_again_event_digest: eventDigest(rejectedAgain),
    reprobe_rejected_again_unique_game_digest: floodgateIdentifierDigest(
      eventGameIds(rejectedAgain),
    ),
    by_role: Object.freeze(
      Object.fromEntries(
        FLOODGATE_ROLE_PRIORITY.map((role) => [
          role,
          Object.freeze({
            later_role_encounters: roleEventCount(encounters, role),
            identity_cap_stops: roleEventCount(identityStops, role),
            pair_cap_stops: roleEventCount(pairStops, role),
            actual_reprobes: roleEventCount(reprobes, role),
            rejected_again: roleEventCount(rejectedAgain, role),
          }),
        ]),
      ) as Record<
        FloodgateRole,
        Readonly<{
          later_role_encounters: number;
          identity_cap_stops: number;
          pair_cap_stops: number;
          actual_reprobes: number;
          rejected_again: number;
        }>
      >,
    ),
  });
}

function gitLine(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("/usr/bin/git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C",
      LC_ALL: "C",
    },
  }).trimEnd();
}

function trackedTreeClean(repositoryRoot: string): boolean {
  return (
    gitLine(repositoryRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=no",
    ]) === ""
  );
}

export function main(argv: readonly string[] = process.argv.slice(2)): 0 {
  const startedAt = new Date();
  const started = process.hrtime.bigint();
  const arguments_ = parseArguments(argv);
  const repositoryRoot = gitLine(__dirname, ["rev-parse", "--show-toplevel"]);
  const revision = gitLine(repositoryRoot, ["rev-parse", "HEAD"]);
  if (!REVISION_RE.test(revision))
    fail("Git revision is not full lowercase hex");
  const cleanBefore = trackedTreeClean(repositoryRoot);

  const materializedInputText = fs.readFileSync(
    arguments_.materializedInputPath,
    "utf8",
  );
  const allocationText = fs.readFileSync(arguments_.allocationPath, "utf8");
  const manifestText = fs.readFileSync(arguments_.manifestPath, "utf8");
  const materializedInput = parseJsonObject(
    materializedInputText,
    "materialized input",
  ) as unknown as MaterializedInputCandidate;
  const historicalAllocation = parseJsonObject(allocationText, "allocation");
  const historicalManifest = parseJsonObject(
    manifestText,
    "manifest",
  ) as unknown as HistoricalManifestCandidate;

  const normalized = materializedInput.normalized_options;
  if (
    normalized.seed !== FLOODGATE_ALLOCATION_SEED ||
    !isDeepStrictEqual(
      normalized.role_game_counts,
      DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
    ) ||
    !isDeepStrictEqual(
      normalized.game_rank_domains,
      DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
    ) ||
    !isDeepStrictEqual(
      normalized.parent_rank_domains,
      DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
    )
  ) {
    fail("materialized input does not use the pinned production allocation");
  }

  const pureStarted = process.hrtime.bigint();
  const artifact = allocateFloodgateRolesPure(materializedInput.games, {
    seed: normalized.seed,
    legacyProtectedPositionIds: materializedInput.legacy_protected_position_ids,
    roleGameCounts: normalized.role_game_counts,
    gameRankDomains: normalized.game_rank_domains,
    parentRankDomains: normalized.parent_rank_domains,
  });
  const pureWallSeconds = Number(process.hrtime.bigint() - pureStarted) / 1e9;
  if (
    artifact.input_canonical_json !== materializedInputText ||
    artifact.canonical_json !== allocationText ||
    !isDeepStrictEqual(artifact.output, historicalAllocation)
  ) {
    fail("stored pure input or allocation does not reproduce exactly");
  }

  const canonicalInput = JSON.parse(
    artifact.input_canonical_json,
  ) as MaterializedInputCandidate;
  const replay = replayFloodgateRoleLockAccounting(
    canonicalInput.games,
    artifact.output.roles,
  );
  if (
    replay.candidate_attempt_events !==
      artifact.output.materialization_accounting.candidate_games_materialized ||
    replay.final_semantic_rejections !==
      historicalManifest.accounting.semantic_or_parent_quota_rejections
  ) {
    fail("control-flow replay does not close over pure allocation accounting");
  }
  const selectedGames = FLOODGATE_ROLE_PRIORITY.reduce(
    (total, role) => total + artifact.output.roles[role].length,
    0,
  );
  const expectedReplay = {
    selectedGames: 1400,
    candidateAttempts: 1625,
    finalSemanticRejections: 219,
    laterRoleEncounters: 12,
    laterRoleUniqueGames: 11,
    identityCapStops: 6,
    pairCapStops: 0,
    actualReprobes: 6,
    actualReprobeUniqueGames: 5,
    rejectedAgain: 6,
    rejectedAgainUniqueGames: 5,
  };
  if (
    selectedGames !== expectedReplay.selectedGames ||
    replay.candidate_attempt_events !== expectedReplay.candidateAttempts ||
    replay.final_semantic_rejections !==
      expectedReplay.finalSemanticRejections ||
    replay.previously_rejected_later_role_encounters !==
      expectedReplay.laterRoleEncounters ||
    replay.previously_rejected_later_role_unique_games !==
      expectedReplay.laterRoleUniqueGames ||
    replay.identity_cap_stop_events !== expectedReplay.identityCapStops ||
    replay.pair_cap_stop_events !== expectedReplay.pairCapStops ||
    replay.actual_reprobe_events !== expectedReplay.actualReprobes ||
    replay.actual_reprobe_unique_games !==
      expectedReplay.actualReprobeUniqueGames ||
    replay.reprobe_rejected_again_events !== expectedReplay.rejectedAgain ||
    replay.reprobe_rejected_again_unique_games !==
      expectedReplay.rejectedAgainUniqueGames
  ) {
    fail("control-flow replay does not match the recorded Q1 retry diagnosis");
  }

  const manifestModel = modelFloodgatePreFixManifestFromRetryCaps(
    manifestText,
    replay.identity_cap_stop_events,
    replay.pair_cap_stop_events,
  );
  const historicalIdentitySkips =
    manifestModel.historical_accounting
      .identity_cap_role_checks_skipped_before_materialization;
  const historicalPairSkips =
    manifestModel.historical_accounting
      .unordered_pair_cap_role_checks_skipped_before_materialization;
  if (historicalIdentitySkips !== 1924 || historicalPairSkips !== 2) {
    fail("historical cap accounting is not the recorded Q1 baseline");
  }
  if (
    manifestModel.modeled_accounting
      .identity_cap_role_checks_skipped_before_materialization !== 1930 ||
    manifestModel.modeled_accounting
      .unordered_pair_cap_role_checks_skipped_before_materialization !== 2 ||
    manifestModel.json_pointer_differences.length !== 1 ||
    sha256Hex(manifestModel.modeled_manifest_text) !==
      "42feccf9b12f50d93e2adb864ee76f86a8f0af4578e630b1551bc19ac7db4591"
  ) {
    fail("modeled pre-fix manifest does not match the recorded Q1 candidate");
  }

  const selectionDigests = {
    selected_games_sha256: artifact.output.all_selected_game_ids_sha256,
    selected_parents_sha256: artifact.output.all_selected_parent_ids_sha256,
    protected_position_ids_count:
      artifact.output.all_protected_position_ids_count,
    protected_position_ids_sha256:
      artifact.output.all_protected_position_ids_sha256,
  };
  const historicalSelectionDigests = {
    selected_games_sha256: historicalManifest.all_selected_game_ids_sha256,
    selected_parents_sha256: historicalManifest.all_selected_parent_ids_sha256,
    protected_position_ids_count:
      historicalManifest.all_protected_position_ids_count,
    protected_position_ids_sha256:
      historicalManifest.all_protected_position_ids_sha256,
  };
  if (
    !isDeepStrictEqual(selectionDigests, historicalSelectionDigests) ||
    Object.values(selectionDigests).some(
      (value) => typeof value === "string" && !SHA256_RE.test(value),
    )
  ) {
    fail("selection identities changed or are malformed");
  }

  const cleanAfter = trackedTreeClean(repositoryRoot);
  const finishedAt = new Date();
  const output = {
    schema: FLOODGATE_ROLE_LOCK_ACCOUNTING_DIAGNOSTIC_SCHEMA,
    status: "pass",
    process_exit_code: 0,
    evidence_class: "reproducible-derived-diagnostic-non-gating",
    authoritative_gate: "successful-exit-zero-production-full-bundle-verifier",
    method: {
      description:
        "Exact pure replay followed by allocation-oracle rank/cap control-flow reconstruction.",
      limitation:
        "This reuses the production pure allocation as its semantic-selection oracle and cannot independently approve artifacts or replace the production verifier.",
      script: fileIdentity(__filename),
      argv: [process.execPath, ...process.execArgv, __filename, ...argv],
      cwd: process.cwd(),
      repository_root: repositoryRoot,
      revision,
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      tracked_tree_clean_before: cleanBefore,
      tracked_tree_clean_after: cleanAfter,
    },
    timing: {
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      wall_seconds: Number(process.hrtime.bigint() - started) / 1e9,
      pure_replay_wall_seconds: pureWallSeconds,
    },
    inputs: {
      materialized_input: fileIdentity(arguments_.materializedInputPath),
      historical_allocation: fileIdentity(arguments_.allocationPath),
      historical_manifest: fileIdentity(arguments_.manifestPath),
    },
    exact_replay: {
      materialized_input_exact: true,
      allocation_exact: true,
      materialized_games: canonicalInput.games.length,
      selected_games: selectedGames,
      pure_materialization_accounting:
        artifact.output.materialization_accounting,
    },
    control_flow_replay: replay,
    modeled_pre_fix_counterfactual: {
      limitation:
        "The 11c4ce7 executable is not rerun here. Historical allocation is exact-replayed with the unchanged pure core, then its observed retry-cap deltas are modeled onto the historical manifest.",
      historical_accounting: manifestModel.historical_accounting,
      modeled_accounting: manifestModel.modeled_accounting,
      historical_allocation_exact_replay: fileIdentity(
        arguments_.allocationPath,
      ),
      modeled_manifest: {
        bytes: Buffer.byteLength(manifestModel.modeled_manifest_text, "utf8"),
        sha256: sha256Hex(manifestModel.modeled_manifest_text),
      },
      json_pointer_differences: manifestModel.json_pointer_differences,
      selection_digests: {
        historical: historicalSelectionDigests,
        current_pure_replay: selectionDigests,
        matches_historical: true,
      },
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return 0;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exitCode = 1;
  }
}
