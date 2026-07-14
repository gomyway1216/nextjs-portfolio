/**
 * Provenance-neutral parent sampling and role allocation.
 *
 * This file deliberately does not establish that a caller's games are genuine
 * Floodgate evidence. The pure core is useful for deterministic computation and
 * adversarial unit tests only. The reserved production boundary fails closed
 * until an orchestrator can hash exact locked manifest bytes, verify rating and
 * CSA content-addressed objects, re-run source eligibility, and legally parse
 * every game from raw evidence.
 */

import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import { toSfen } from "./generate-teacher";
import { compareBytewise, positionKeyFromSfen } from "./sibling-data";
import { positionFromSfen, rulesCompleteLegalMoves } from "./shogi-sfen";

export const FLOODGATE_PURE_INPUT_SCHEMA =
  "shogi-floodgate-role-pure-input-v1" as const;
export const FLOODGATE_PURE_ALLOCATION_SCHEMA =
  "shogi-floodgate-role-pure-allocation-v1" as const;
export const FLOODGATE_PARENTS_PER_GAME = 24 as const;
export const FLOODGATE_PARENT_PLY_MIN = 16 as const;
export const FLOODGATE_PARENT_PLY_MAX = 119 as const;

export const FLOODGATE_ROLE_PRIORITY = Object.freeze([
  "fresh_final_holdout",
  "fresh_selection",
  "training",
] as const);

export type FloodgateRole = (typeof FLOODGATE_ROLE_PRIORITY)[number];
export type FloodgateParentPhase = "opening" | "middle" | "endgame";

export const FLOODGATE_PHASE_QUOTAS = Object.freeze([
  Object.freeze({
    phase: "opening",
    firstPly: 16,
    lastPly: 31,
    parents: 6,
  }),
  Object.freeze({
    phase: "middle",
    firstPly: 32,
    lastPly: 79,
    parents: 12,
  }),
  Object.freeze({
    phase: "endgame",
    firstPly: 80,
    lastPly: 119,
    parents: 6,
  }),
] as const) satisfies readonly {
  phase: FloodgateParentPhase;
  firstPly: number;
  lastPly: number;
  parents: number;
}[];

export const DEFAULT_FLOODGATE_ROLE_GAME_COUNTS: Readonly<
  Record<FloodgateRole, number>
> = Object.freeze({
  fresh_final_holdout: 200,
  fresh_selection: 200,
  training: 1000,
});

export const DEFAULT_FLOODGATE_GAME_RANK_DOMAINS: Readonly<
  Record<FloodgateRole, string>
> = Object.freeze({
  fresh_final_holdout: "floodgate-q1-2026-final-game-v1",
  fresh_selection: "floodgate-q1-2026-selection-game-v1",
  training: "floodgate-q1-2026-training-game-v1",
});

export const FLOODGATE_ALLOCATION_SEED =
  "floodgate-q1-2026-role-seed-v1" as const;

export const FLOODGATE_PHASE_PARENT_RANK_DOMAIN =
  "floodgate-q1-2026-parent-phase-v1" as const;
export const FLOODGATE_FILL_PARENT_RANK_DOMAIN =
  "floodgate-q1-2026-parent-fill-v1" as const;

export const DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS = Object.freeze({
  phase: FLOODGATE_PHASE_PARENT_RANK_DOMAIN,
  fill: FLOODGATE_FILL_PARENT_RANK_DOMAIN,
});

export const FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS = Object.freeze({
  count: 8678,
  identifiersSha256:
    "f9d9560452554b7e40ed0183c95f9d42cc8b8787f63200b453a511dd44fac5c5",
});

/** Exact immutable role-allocation binding from the preregistered plan. */
export const FLOODGATE_PLANNED_ALLOCATION = Object.freeze({
  seed: FLOODGATE_ALLOCATION_SEED,
  roleGameCounts: DEFAULT_FLOODGATE_ROLE_GAME_COUNTS,
  gameRankDomains: DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
  parentRankDomains: DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
  legacyProtectedPositionIds: FLOODGATE_PINNED_LEGACY_PROTECTED_POSITION_IDS,
});

const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;
const FULL_IDENTITY_RE = /^([^:\r\n]+)\+[0-9a-f]{32}$/;
const PURE_GAME_KEYS = ["game_id", "parents", "player_identities"] as const;
const PURE_PARENT_KEYS = ["parent_id", "parent_sfen", "ply"] as const;
const PURE_OPTION_KEYS = [
  "gameRankDomains",
  "legacyProtectedPositionIds",
  "parentRankDomains",
  "roleGameCounts",
  "seed",
] as const;

export interface FloodgatePureParentInput {
  parent_id: string;
  parent_sfen: string;
  ply: number;
}

/**
 * Unverified pure-core input. This type is not evidence of Floodgate origin,
 * rating eligibility, player identity, or a content-addressed CSA object.
 */
export interface FloodgatePureGameInput {
  game_id: string;
  player_identities: readonly [string, string];
  parents: readonly FloodgatePureParentInput[];
}

export interface FloodgatePureAllocationOptions {
  seed: string;
  legacyProtectedPositionIds: readonly string[];
  roleGameCounts?: Readonly<Record<FloodgateRole, number>>;
  gameRankDomains?: Readonly<Record<FloodgateRole, string>>;
  parentRankDomains?: Readonly<{ phase: string; fill: string }>;
}

export interface FloodgateAllocatedParent extends FloodgatePureParentInput {
  position_id: string;
  phase: FloodgateParentPhase;
  sampling_stage: "phase" | "fill";
  protected_position_ids: string[];
}

export interface FloodgateAllocatedGame {
  game_id: string;
  player_identities: readonly [string, string];
  parents: FloodgateAllocatedParent[];
}

export interface FloodgatePureRoleSummary {
  requested_games: number;
  selected_games: number;
  selected_parents: number;
  identity_game_cap: number;
  unordered_identity_pair_game_cap: number;
  game_ids: string[];
  game_ids_sha256: string;
  parent_ids: string[];
  parent_ids_sha256: string;
  game_parent_ids: {
    game_id: string;
    player_identities: readonly [string, string];
    parent_ids: string[];
  }[];
  protected_position_ids_count: number;
  protected_position_ids_sha256: string;
  identity_game_counts: { identity: string; games: number }[];
  unordered_identity_pair_game_counts: {
    identities: readonly [string, string];
    games: number;
  }[];
}

export interface FloodgatePureAllocationOutput {
  schema: typeof FLOODGATE_PURE_ALLOCATION_SCHEMA;
  provenance: {
    status: "unverified-pure-core";
    production_eligible: false;
    raw_source_evidence_revalidated: false;
    teacher_or_candidate_scores_consumed: false;
  };
  input_binding: {
    format: typeof FLOODGATE_PURE_INPUT_SCHEMA;
    canonical_json_bytes: number;
    canonical_json_sha256: string;
  };
  seed: string;
  game_rank_domains: Readonly<Record<FloodgateRole, string>>;
  parent_rank_domains: Readonly<{ phase: string; fill: string }>;
  parent_contract: {
    ply_inclusive: readonly [number, number];
    parents_per_game: number;
    preferred_phase_quotas: typeof FLOODGATE_PHASE_QUOTAS;
  };
  role_priority: typeof FLOODGATE_ROLE_PRIORITY;
  legacy_protected_position_ids_count: number;
  legacy_protected_position_ids_sha256: string;
  roles: Record<FloodgateRole, FloodgateAllocatedGame[]>;
  role_summaries: Record<FloodgateRole, FloodgatePureRoleSummary>;
  all_selected_game_ids_sha256: string;
  all_selected_parent_ids_sha256: string;
  all_protected_position_ids_count: number;
  all_protected_position_ids_sha256: string;
  materialization_accounting: {
    candidate_games_materialized: number;
    semantic_parent_groups_materialized: number;
    selected_parent_groups_retained: number;
  };
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface FloodgatePureAllocationArtifact {
  output: DeepReadonly<FloodgatePureAllocationOutput>;
  input_canonical_json: string;
  input_canonical_json_bytes: number;
  input_canonical_json_sha256: string;
  canonical_json: string;
  canonical_json_bytes: number;
  canonical_json_sha256: string;
}

interface Ranked<T> {
  value: T;
  digest: Buffer;
  tieBreak: string;
}

interface PreparedParent extends FloodgatePureParentInput {
  position_id: string;
  phase: FloodgateParentPhase;
  protected_position_ids: string[];
}

function requiredText(value: string, label: string): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length === 0 ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    hasUnpairedSurrogate(value)
  ) {
    throw new Error(
      `${label} must be nonempty, trimmed, well-formed Unicode text without controls`,
    );
  }
  return value;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function assertPositionId(value: string, label: string): string {
  if (typeof value !== "string" || !POSITION_ID_RE.test(value))
    throw new Error(`${label} must be a canonical SHA-256 position ID`);
  return value;
}

function assertStrictPlainObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (nodeUtilTypes.isProxy(value)) {
    throw new Error(`${label} must not be a Proxy`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object with Object.prototype`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error(`${label} must not contain symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new Error(
        `${label}.${key} must be a data property, not an accessor`,
      );
    }
    if (!descriptor.enumerable) {
      throw new Error(`${label}.${key} must not be non-enumerable`);
    }
  }
  return value as Record<string, unknown>;
}

function assertStrictArray(value: unknown, label: string): readonly unknown[] {
  if (nodeUtilTypes.isProxy(value)) {
    throw new Error(`${label} must not be a Proxy`);
  }
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    throw new Error(`${label} must be a plain array`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error(`${label} must not contain symbol keys`);
  }
  const names = Object.getOwnPropertyNames(value);
  const allowed = new Set<string>([
    "length",
    ...Array.from({ length: value.length }, (_, index) => String(index)),
  ]);
  for (const name of names) {
    if (!allowed.has(name)) {
      throw new Error(`${label}.${name} is an unexpected array property`);
    }
  }
  if (names.length !== value.length + 1) {
    throw new Error(`${label} must be dense and contain no hidden properties`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) {
      throw new Error(
        `${label}[${index}] must be a data property, not an accessor`,
      );
    }
    if (!descriptor.enumerable) {
      throw new Error(`${label}[${index}] must be enumerable`);
    }
  }
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.getOwnPropertyNames(value).sort(compareBytewise);
  const wanted = [...expected].sort(compareBytewise);
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(
      `${label} must contain exactly keys ${wanted.join(",")} (got ${actual.join(",")})`,
    );
  }
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  label: string,
): void {
  const actual = Object.getOwnPropertyNames(value);
  const allowedSet = new Set(allowed);
  const unknown = actual.filter((key) => !allowedSet.has(key));
  const missing = required.filter((key) => !actual.includes(key));
  if (unknown.length > 0 || missing.length > 0) {
    const problems: string[] = [];
    if (unknown.length > 0) {
      problems.push(`unknown keys ${unknown.sort(compareBytewise).join(",")}`);
    }
    if (missing.length > 0) {
      problems.push(`missing keys ${missing.sort(compareBytewise).join(",")}`);
    }
    throw new Error(`${label} has ${problems.join(" and ")}`);
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(
        "canonical JSON accepts finite numbers other than negative zero only",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new Error("canonical JSON does not support sparse arrays");
      }
    }
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort(compareBytewise);
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  throw new Error(`canonical JSON does not support ${typeof value}`);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    const object = value as object;
    if (!seen.has(object)) {
      seen.add(object);
      for (const key of Reflect.ownKeys(object)) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (descriptor && "value" in descriptor)
          deepFreeze(descriptor.value, seen);
      }
      Object.freeze(object);
    }
  }
  return value as DeepReadonly<T>;
}

/** Digest a set/list independently of input order, with no trailing LF. */
export function floodgateIdentifierDigest(values: Iterable<string>): string {
  return sha256Hex([...new Set(values)].sort(compareBytewise).join("\n"));
}

function domainDigest(
  domain: string,
  seed: string,
  ...parts: string[]
): Buffer {
  // Every component is NUL-free, so this encoding is unambiguous and portable.
  return createHash("sha256")
    .update([domain, seed, ...parts].join("\0"), "utf8")
    .digest();
}

function ranked<T>(
  values: readonly T[],
  domain: string,
  seed: string,
  identity: (value: T) => readonly [string, ...string[]],
): T[] {
  const withRanks: Ranked<T>[] = values.map((value) => {
    const parts = identity(value);
    return {
      value,
      digest: domainDigest(domain, seed, ...parts),
      tieBreak: parts[parts.length - 1],
    };
  });
  return withRanks
    .sort(
      (left, right) =>
        Buffer.compare(left.digest, right.digest) ||
        compareBytewise(left.tieBreak, right.tieBreak),
    )
    .map((entry) => entry.value);
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256Hex(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function phaseForPly(ply: number): FloodgateParentPhase {
  const phase = FLOODGATE_PHASE_QUOTAS.find(
    (candidate) => ply >= candidate.firstPly && ply <= candidate.lastPly,
  );
  if (!phase)
    throw new Error(`parent ply ${ply} is outside the preregistered range`);
  return phase.phase;
}

function addAll(target: Set<string>, values: readonly string[]): void {
  for (const value of values) target.add(value);
}

interface FloodgateLabelBlindParentSemantics {
  readonly legalChildCount: number;
  readonly protectedPositionIds: readonly string[];
}

function labelBlindParentSemantics(
  parentSfen: string,
): FloodgateLabelBlindParentSemantics {
  const normalized = requiredText(parentSfen, "parent_sfen");
  const { position, moveNumber } = positionFromSfen(normalized);
  if (toSfen(position, moveNumber) !== normalized) {
    throw new Error("parent_sfen must use the canonical SFEN serialization");
  }
  const legalMoves = rulesCompleteLegalMoves(position);

  const protectedIds = new Set<string>([positionKeyFromSfen(normalized)]);
  for (const { move } of legalMoves) {
    const child = position.clone();
    child.move(move);
    child.toggleTeban();
    protectedIds.add(positionKeyFromSfen(toSfen(child, moveNumber + 1)));
  }
  return Object.freeze({
    legalChildCount: legalMoves.length,
    protectedPositionIds: Object.freeze(
      [...protectedIds].sort(compareBytewise),
    ),
  });
}

/**
 * Compute the protected semantic group without asking any teacher: the parent
 * position plus every rules-complete legal child position.
 */
export function protectedSemanticPositionIds(parentSfen: string): string[] {
  return [...labelBlindParentSemantics(parentSfen).protectedPositionIds];
}

function decodePureGames(input: unknown): FloodgatePureGameInput[] {
  const rawGames = assertStrictArray(input, "pure core games");
  return rawGames.map((rawGame, gameIndex) => {
    const label = `pure core games[${gameIndex}]`;
    const game = assertStrictPlainObject(rawGame, label);
    assertExactKeys(game, PURE_GAME_KEYS, label);
    const gameId = assertPositionId(game.game_id as string, `${label}.game_id`);

    const rawIdentities = assertStrictArray(
      game.player_identities,
      `${label}.player_identities`,
    );
    if (rawIdentities.length !== 2) {
      throw new Error(
        `${label}.player_identities must contain exactly two entries`,
      );
    }
    const firstIdentity = requiredText(
      rawIdentities[0] as string,
      `${label}.player_identities[0]`,
    );
    const secondIdentity = requiredText(
      rawIdentities[1] as string,
      `${label}.player_identities[1]`,
    );
    if (
      !FULL_IDENTITY_RE.test(firstIdentity) ||
      !FULL_IDENTITY_RE.test(secondIdentity)
    ) {
      throw new Error(`${label} has a noncanonical full player identity`);
    }
    if (firstIdentity === secondIdentity) {
      throw new Error(`${label} repeats the same full player identity`);
    }

    const rawParents = assertStrictArray(game.parents, `${label}.parents`);
    const parentIds = new Set<string>();
    const plies = new Set<number>();
    const parents = rawParents.map((rawParent, parentIndex) => {
      const parentLabel = `${label}.parents[${parentIndex}]`;
      const parent = assertStrictPlainObject(rawParent, parentLabel);
      assertExactKeys(parent, PURE_PARENT_KEYS, parentLabel);
      const ply = parent.ply;
      if (
        !Number.isSafeInteger(ply) ||
        Object.is(ply, -0) ||
        (ply as number) < 0
      ) {
        throw new Error(
          `${parentLabel}.ply must be a nonnegative safe integer other than negative zero`,
        );
      }
      const parentId = assertPositionId(
        parent.parent_id as string,
        `${parentLabel}.parent_id`,
      );
      if (parentId !== parentOccurrenceId(gameId, ply as number)) {
        throw new Error(
          `${parentLabel}.parent_id does not match game_id and ply`,
        );
      }
      if (parentIds.has(parentId) || plies.has(ply as number)) {
        throw new Error(`${label} repeats a parent ID or ply`);
      }
      parentIds.add(parentId);
      plies.add(ply as number);
      const parentSfen = requiredText(
        parent.parent_sfen as string,
        `${parentLabel}.parent_sfen`,
      );
      const { position, moveNumber } = positionFromSfen(parentSfen);
      if (toSfen(position, moveNumber) !== parentSfen) {
        throw new Error(`${parentLabel}.parent_sfen is not canonical SFEN`);
      }
      if (moveNumber !== (ply as number) + 1) {
        throw new Error(
          `${parentLabel}.parent_sfen move number does not match ply`,
        );
      }
      // Syntax, canonical serialization, and move-number binding are checked
      // for every input before hashing. Full legal-child groups are much
      // heavier and are materialized one ranked candidate game at a time.
      return {
        parent_id: parentId,
        parent_sfen: parentSfen,
        ply: ply as number,
      };
    });

    return {
      game_id: gameId,
      player_identities: [firstIdentity, secondIdentity] as const,
      parents,
    };
  });
}

function prepareParents(game: FloodgatePureGameInput): PreparedParent[] {
  return game.parents
    .filter(
      (parent) =>
        parent.ply >= FLOODGATE_PARENT_PLY_MIN &&
        parent.ply <= FLOODGATE_PARENT_PLY_MAX,
    )
    .flatMap((parent) => {
      const semantics = labelBlindParentSemantics(parent.parent_sfen);
      // This fail-closed structural condition is not a new/tunable plan
      // threshold. The sibling candidate-union schema requires at least two
      // alternatives per parent; a 0/1-child parent cannot produce one
      // comparison pair. Reject it label-blind before parent hashing and fill
      // under the frozen domains.
      if (semantics.legalChildCount < 2) return [];
      return [
        {
          ...parent,
          position_id: positionKeyFromSfen(parent.parent_sfen),
          phase: phaseForPly(parent.ply),
          protected_position_ids: [...semantics.protectedPositionIds],
        },
      ];
    });
}

function sampleGameParents(
  game: FloodgatePureGameInput,
  prepared: readonly PreparedParent[],
  blocked: ReadonlySet<string>,
  seed: string,
  domains: Readonly<{ phase: string; fill: string }>,
): FloodgateAllocatedParent[] | null {
  const selected: FloodgateAllocatedParent[] = [];
  const selectedParentIds = new Set<string>();
  // A tentative game must not clone or mutate the potentially multi-million-ID
  // global set. Only this small overlay changes before all 24 parents succeed.
  const localBlocked = new Set<string>();

  const attempt = (
    parent: PreparedParent,
    stage: "phase" | "fill",
  ): boolean => {
    if (selectedParentIds.has(parent.parent_id)) return false;
    if (
      parent.protected_position_ids.some(
        (id) => blocked.has(id) || localBlocked.has(id),
      )
    )
      return false;
    selectedParentIds.add(parent.parent_id);
    addAll(localBlocked, parent.protected_position_ids);
    selected.push({ ...parent, sampling_stage: stage });
    return true;
  };

  for (const quota of FLOODGATE_PHASE_QUOTAS) {
    let accepted = 0;
    const candidates = ranked(
      prepared.filter((parent) => parent.phase === quota.phase),
      domains.phase,
      seed,
      (parent) => [game.game_id, quota.phase, parent.parent_id],
    );
    for (const parent of candidates) {
      if (accepted >= quota.parents) break;
      if (attempt(parent, "phase")) accepted += 1;
    }
  }

  if (selected.length < FLOODGATE_PARENTS_PER_GAME) {
    const fill = ranked(prepared, domains.fill, seed, (parent) => [
      game.game_id,
      parent.parent_id,
    ]);
    for (const parent of fill) {
      if (selected.length >= FLOODGATE_PARENTS_PER_GAME) break;
      attempt(parent, "fill");
    }
  }

  if (selected.length !== FLOODGATE_PARENTS_PER_GAME) return null;
  return selected.sort(
    (left, right) =>
      left.ply - right.ply || compareBytewise(left.parent_id, right.parent_id),
  );
}

/**
 * Internal lazy role-lock probe under the exact preregistered seed and parent
 * domains. It preserves the pure core's strict untrusted-game decode and exact
 * semantic sampler, but intentionally emits no canonical artifact, digest, or
 * option summary for each tentative game. The caller-owned blocked set is read
 * only through membership checks and is never iterated or mutated here.
 */
export function sampleFloodgatePlannedGameParentsForRoleLock(
  inputGame: unknown,
  blockedPositionIds: ReadonlySet<string>,
): FloodgateAllocatedParent[] | null {
  const games = decodePureGames([inputGame]);
  if (games.length !== 1) {
    throw new Error("role-lock parent probe requires exactly one decoded game");
  }
  const game = games[0];
  return sampleGameParents(
    game,
    prepareParents(game),
    blockedPositionIds,
    FLOODGATE_ALLOCATION_SEED,
    DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
  );
}

function sortedPair(
  identities: readonly [string, string],
): readonly [string, string] {
  return compareBytewise(identities[0], identities[1]) <= 0
    ? [identities[0], identities[1]]
    : [identities[1], identities[0]];
}

function pairKey(identities: readonly [string, string]): string {
  return sortedPair(identities).join("\0");
}

function validatedOptions(input: unknown): {
  seed: string;
  legacy: Set<string>;
  counts: Readonly<Record<FloodgateRole, number>>;
  gameDomains: Readonly<Record<FloodgateRole, string>>;
  parentDomains: Readonly<{ phase: string; fill: string }>;
} {
  const options = assertStrictPlainObject(input, "pure core options");
  assertAllowedKeys(
    options,
    PURE_OPTION_KEYS,
    ["legacyProtectedPositionIds", "seed"],
    "pure core options",
  );
  const seed = requiredText(options.seed as string, "allocation seed");

  const decodeRoleCounts = (): Readonly<Record<FloodgateRole, number>> => {
    if (!Object.hasOwn(options, "roleGameCounts")) {
      return { ...DEFAULT_FLOODGATE_ROLE_GAME_COUNTS };
    }
    const raw = assertStrictPlainObject(
      options.roleGameCounts,
      "roleGameCounts",
    );
    assertExactKeys(raw, FLOODGATE_ROLE_PRIORITY, "roleGameCounts");
    const result = {} as Record<FloodgateRole, number>;
    for (const role of FLOODGATE_ROLE_PRIORITY) {
      const value = raw[role];
      if (
        !Number.isSafeInteger(value) ||
        Object.is(value, -0) ||
        (value as number) < 0
      ) {
        throw new Error(
          `${role} game count must be a nonnegative safe integer other than negative zero`,
        );
      }
      result[role] = value as number;
    }
    return result;
  };

  const decodeGameDomains = (): Readonly<Record<FloodgateRole, string>> => {
    if (!Object.hasOwn(options, "gameRankDomains")) {
      return { ...DEFAULT_FLOODGATE_GAME_RANK_DOMAINS };
    }
    const raw = assertStrictPlainObject(
      options.gameRankDomains,
      "gameRankDomains",
    );
    assertExactKeys(raw, FLOODGATE_ROLE_PRIORITY, "gameRankDomains");
    const result = {} as Record<FloodgateRole, string>;
    for (const role of FLOODGATE_ROLE_PRIORITY) {
      result[role] = requiredText(
        raw[role] as string,
        `${role} game rank domain`,
      );
    }
    return result;
  };

  const decodeParentDomains = (): Readonly<{ phase: string; fill: string }> => {
    if (!Object.hasOwn(options, "parentRankDomains")) {
      return { ...DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS };
    }
    const raw = assertStrictPlainObject(
      options.parentRankDomains,
      "parentRankDomains",
    );
    assertExactKeys(raw, ["fill", "phase"], "parentRankDomains");
    return {
      phase: requiredText(raw.phase as string, "phase parent rank domain"),
      fill: requiredText(raw.fill as string, "fill parent rank domain"),
    };
  };

  const counts = decodeRoleCounts();
  const gameDomains = decodeGameDomains();
  const parentDomains = decodeParentDomains();

  for (const role of FLOODGATE_ROLE_PRIORITY) {
    requiredText(gameDomains[role], `${role} game rank domain`);
  }
  requiredText(parentDomains.phase, "phase parent rank domain");
  requiredText(parentDomains.fill, "fill parent rank domain");
  const allDomains = [
    ...FLOODGATE_ROLE_PRIORITY.map((role) => gameDomains[role]),
    parentDomains.phase,
    parentDomains.fill,
  ];
  if (new Set(allDomains).size !== allDomains.length) {
    throw new Error("every game and parent rank domain must be distinct");
  }

  const rawLegacy = assertStrictArray(
    options.legacyProtectedPositionIds,
    "legacyProtectedPositionIds",
  );
  const legacy = new Set<string>();
  for (const value of rawLegacy) {
    const id = assertPositionId(
      value as string,
      "legacy protected position ID",
    );
    if (legacy.has(id))
      throw new Error(`legacy protected position ID ${id} is duplicated`);
    legacy.add(id);
  }
  return {
    seed,
    legacy,
    counts,
    gameDomains,
    parentDomains,
  };
}

function countMapSummary(
  counts: ReadonlyMap<string, number>,
): { identity: string; games: number }[] {
  return [...counts]
    .sort(([left], [right]) => compareBytewise(left, right))
    .map(([identity, games]) => ({ identity, games }));
}

function pairCountSummary(
  counts: ReadonlyMap<
    string,
    { identities: readonly [string, string]; games: number }
  >,
): { identities: readonly [string, string]; games: number }[] {
  return [...counts]
    .sort(([left], [right]) => compareBytewise(left, right))
    .map(([, value]) => ({ identities: value.identities, games: value.games }));
}

function canonicalPureInput(
  games: readonly FloodgatePureGameInput[],
  seed: string,
  legacy: ReadonlySet<string>,
  counts: Readonly<Record<FloodgateRole, number>>,
  gameDomains: Readonly<Record<FloodgateRole, string>>,
  parentDomains: Readonly<{ phase: string; fill: string }>,
): string {
  const canonicalGames = games
    .map((game) => ({
      game_id: game.game_id,
      player_identities: [game.player_identities[0], game.player_identities[1]],
      parents: game.parents
        .map((parent) => ({ ...parent }))
        .sort(
          (left, right) =>
            left.ply - right.ply ||
            compareBytewise(left.parent_id, right.parent_id),
        ),
    }))
    .sort((left, right) => compareBytewise(left.game_id, right.game_id));
  return canonicalJson({
    schema: FLOODGATE_PURE_INPUT_SCHEMA,
    games: canonicalGames,
    legacy_protected_position_ids: [...legacy].sort(compareBytewise),
    normalized_options: {
      seed,
      role_game_counts: { ...counts },
      game_rank_domains: { ...gameDomains },
      parent_rank_domains: { ...parentDomains },
    },
  });
}

/**
 * Deterministic, provenance-neutral pure core. It verifies strict plain-data
 * shape and shogi semantics, but does not prove source origin or eligibility.
 * Semantic isolation includes parent/child and child/child transpositions.
 */
export function allocateFloodgateRolesPure(
  inputGames: unknown,
  inputOptions: unknown,
): FloodgatePureAllocationArtifact {
  const games = decodePureGames(inputGames);
  const { seed, legacy, counts, gameDomains, parentDomains } =
    validatedOptions(inputOptions);

  const gameIds = new Set<string>();
  for (const game of games) {
    if (gameIds.has(game.game_id))
      throw new Error(`pure core games repeat game_id ${game.game_id}`);
    gameIds.add(game.game_id);
  }

  const inputCanonicalJson = canonicalPureInput(
    games,
    seed,
    legacy,
    counts,
    gameDomains,
    parentDomains,
  );
  const inputCanonicalJsonBytes = Buffer.byteLength(inputCanonicalJson, "utf8");
  const inputCanonicalJsonSha256 = sha256Hex(inputCanonicalJson);

  const selectedGameIds = new Set<string>();
  const reservedProtectedIds = new Set(legacy);
  let candidateGamesMaterialized = 0;
  let semanticParentGroupsMaterialized = 0;
  const roles: Record<FloodgateRole, FloodgateAllocatedGame[]> = {
    fresh_final_holdout: [],
    fresh_selection: [],
    training: [],
  };
  const identityCountsByRole = new Map<FloodgateRole, Map<string, number>>();
  const pairCountsByRole = new Map<
    FloodgateRole,
    Map<string, { identities: readonly [string, string]; games: number }>
  >();

  for (const role of FLOODGATE_ROLE_PRIORITY) {
    const requestedGames = counts[role];
    const identityCap = Math.max(1, Math.floor(requestedGames * 0.1));
    const pairCap = Math.max(1, Math.floor(requestedGames * 0.02));
    const identityCounts = new Map<string, number>();
    const pairCounts = new Map<
      string,
      { identities: readonly [string, string]; games: number }
    >();
    identityCountsByRole.set(role, identityCounts);
    pairCountsByRole.set(role, pairCounts);

    const candidates = ranked(games, gameDomains[role], seed, (game) => [
      game.game_id,
    ]);
    for (const game of candidates) {
      if (roles[role].length >= requestedGames) break;
      if (selectedGameIds.has(game.game_id)) continue;

      const uniqueIdentities = [...new Set<string>(game.player_identities)];
      if (
        uniqueIdentities.some(
          (identity) => (identityCounts.get(identity) ?? 0) >= identityCap,
        )
      ) {
        continue;
      }
      const identities = sortedPair(game.player_identities);
      const key = pairKey(identities);
      if ((pairCounts.get(key)?.games ?? 0) >= pairCap) continue;

      const prepared = prepareParents(game);
      candidateGamesMaterialized += 1;
      semanticParentGroupsMaterialized += prepared.length;
      const parents = sampleGameParents(
        game,
        prepared,
        reservedProtectedIds,
        seed,
        parentDomains,
      );
      if (!parents) continue;

      roles[role].push({
        game_id: game.game_id,
        player_identities: [
          game.player_identities[0],
          game.player_identities[1],
        ],
        parents,
      });
      selectedGameIds.add(game.game_id);
      for (const identity of uniqueIdentities) {
        identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
      }
      pairCounts.set(key, {
        identities,
        games: (pairCounts.get(key)?.games ?? 0) + 1,
      });
      for (const parent of parents)
        addAll(reservedProtectedIds, parent.protected_position_ids);
    }

    if (roles[role].length !== requestedGames) {
      throw new Error(
        `cannot allocate exact ${role} quota: selected ${roles[role].length} of ${requestedGames} games`,
      );
    }
  }

  const roleSummaries = {} as Record<FloodgateRole, FloodgatePureRoleSummary>;
  for (const role of FLOODGATE_ROLE_PRIORITY) {
    const games = roles[role];
    const roleGameIds = games.map((game) => game.game_id).sort(compareBytewise);
    const roleParents = games.flatMap((game) => game.parents);
    const roleParentIds = roleParents
      .map((parent) => parent.parent_id)
      .sort(compareBytewise);
    const protectedIds = new Set(
      roleParents.flatMap((parent) => parent.protected_position_ids),
    );
    const gameParentIds = games
      .map((game) => ({
        game_id: game.game_id,
        player_identities: sortedPair(game.player_identities),
        parent_ids: game.parents
          .map((parent) => parent.parent_id)
          .sort(compareBytewise),
      }))
      .sort((left, right) => compareBytewise(left.game_id, right.game_id));
    roleSummaries[role] = {
      requested_games: counts[role],
      selected_games: games.length,
      selected_parents: roleParents.length,
      identity_game_cap: Math.max(1, Math.floor(counts[role] * 0.1)),
      unordered_identity_pair_game_cap: Math.max(
        1,
        Math.floor(counts[role] * 0.02),
      ),
      game_ids: roleGameIds,
      game_ids_sha256: floodgateIdentifierDigest(roleGameIds),
      parent_ids: roleParentIds,
      parent_ids_sha256: floodgateIdentifierDigest(roleParentIds),
      game_parent_ids: gameParentIds,
      protected_position_ids_count: protectedIds.size,
      protected_position_ids_sha256: floodgateIdentifierDigest(protectedIds),
      identity_game_counts: countMapSummary(identityCountsByRole.get(role)!),
      unordered_identity_pair_game_counts: pairCountSummary(
        pairCountsByRole.get(role)!,
      ),
    };
  }

  const allGames = FLOODGATE_ROLE_PRIORITY.flatMap((role) => roles[role]);
  const allParents = allGames.flatMap((game) => game.parents);
  const allProtectedIds = new Set(
    allParents.flatMap((parent) => parent.protected_position_ids),
  );
  const protectedIdOccurrences = allParents.reduce(
    (total, parent) => total + parent.protected_position_ids.length,
    0,
  );
  if (
    allGames.length !== selectedGameIds.size ||
    allParents.length !== allGames.length * FLOODGATE_PARENTS_PER_GAME ||
    new Set(allParents.map((parent) => parent.parent_id)).size !==
      allParents.length ||
    allProtectedIds.size !== protectedIdOccurrences
  ) {
    throw new Error("internal role-allocation isolation invariant failed");
  }
  const output: FloodgatePureAllocationOutput = {
    schema: FLOODGATE_PURE_ALLOCATION_SCHEMA,
    provenance: {
      status: "unverified-pure-core",
      production_eligible: false,
      raw_source_evidence_revalidated: false,
      teacher_or_candidate_scores_consumed: false,
    },
    input_binding: {
      format: FLOODGATE_PURE_INPUT_SCHEMA,
      canonical_json_bytes: inputCanonicalJsonBytes,
      canonical_json_sha256: inputCanonicalJsonSha256,
    },
    seed,
    game_rank_domains: { ...gameDomains },
    parent_rank_domains: { ...parentDomains },
    parent_contract: {
      ply_inclusive: [FLOODGATE_PARENT_PLY_MIN, FLOODGATE_PARENT_PLY_MAX],
      parents_per_game: FLOODGATE_PARENTS_PER_GAME,
      preferred_phase_quotas: FLOODGATE_PHASE_QUOTAS.map((quota) => ({
        ...quota,
      })) as unknown as typeof FLOODGATE_PHASE_QUOTAS,
    },
    role_priority: [
      ...FLOODGATE_ROLE_PRIORITY,
    ] as unknown as typeof FLOODGATE_ROLE_PRIORITY,
    legacy_protected_position_ids_count: legacy.size,
    legacy_protected_position_ids_sha256: floodgateIdentifierDigest(legacy),
    roles,
    role_summaries: roleSummaries,
    all_selected_game_ids_sha256: floodgateIdentifierDigest(
      allGames.map((game) => game.game_id),
    ),
    all_selected_parent_ids_sha256: floodgateIdentifierDigest(
      allParents.map((parent) => parent.parent_id),
    ),
    all_protected_position_ids_count: allProtectedIds.size,
    all_protected_position_ids_sha256:
      floodgateIdentifierDigest(allProtectedIds),
    materialization_accounting: {
      candidate_games_materialized: candidateGamesMaterialized,
      semantic_parent_groups_materialized: semanticParentGroupsMaterialized,
      selected_parent_groups_retained: allParents.length,
    },
  };
  const frozenOutput = deepFreeze(output);
  const outputCanonicalJson = canonicalJson(frozenOutput);
  return deepFreeze({
    output: frozenOutput,
    input_canonical_json: inputCanonicalJson,
    input_canonical_json_bytes: inputCanonicalJsonBytes,
    input_canonical_json_sha256: inputCanonicalJsonSha256,
    canonical_json: outputCanonicalJson,
    canonical_json_bytes: Buffer.byteLength(outputCanonicalJson, "utf8"),
    canonical_json_sha256: sha256Hex(outputCanonicalJson),
  });
}

/**
 * Reserved production boundary. It intentionally rejects every value until it
 * can consume exact locked manifest bytes plus raw rating/CSA objects and
 * independently re-run content hashes, source eligibility, identity joins,
 * legal parsing, and then the fixed pure-core configuration.
 */
export class FloodgateProductionEvidenceUnavailableError extends Error {
  constructor() {
    super(
      "Floodgate production allocation is unavailable until the locked raw-evidence orchestrator is implemented",
    );
    this.name = "FloodgateProductionEvidenceUnavailableError";
  }
}

export function allocateFloodgateRolesFromLockedEvidence(
  _lockedRawEvidence: unknown,
): never {
  throw new FloodgateProductionEvidenceUnavailableError();
}
