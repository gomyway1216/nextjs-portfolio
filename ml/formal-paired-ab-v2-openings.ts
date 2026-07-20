/**
 * Label-blind opening construction and production-rules preflight for the
 * formal paired A/B v2 browser/WASM match.
 *
 * The builder accepts only source-game identities and move lists. It has no
 * winner, score, rating, candidate/stable label, or evaluation field. The
 * fixed rule takes the first 16 plies, ranks source games by a public SHA-256
 * domain, keeps the first semantically unique nonterminal positions, and
 * emits exactly 384 color-swapped pairs.
 */

import { createHash } from "node:crypto";

import { toSfen } from "./shogi-sfen-codec";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";

export const FORMAL_PAIRED_AB_V2_SOURCE_GAMES_SCHEMA =
  "shogi-formal-paired-ab-v2-label-blind-source-games-v1" as const;
export const FORMAL_PAIRED_AB_V2_OPENINGS_MANIFEST_SCHEMA =
  "shogi-formal-paired-ab-v2-wasm-openings-manifest-v2" as const;
export const FORMAL_PAIRED_AB_V2_OPENINGS_PREFLIGHT_SCHEMA =
  "shogi-formal-paired-ab-v2-wasm-openings-preflight-v1" as const;
export const FORMAL_PAIRED_AB_V2_OPENING_PLY = 16 as const;
export const FORMAL_PAIRED_AB_V2_OPENING_COUNT = 384 as const;
export const FORMAL_PAIRED_AB_V2_GAME_COUNT = 768 as const;
export const FORMAL_PAIRED_AB_V2_START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1" as const;

export const FORMAL_PAIRED_AB_V2_OPENING_SELECTION_RULE = Object.freeze({
  label_blind: true,
  opening_ply: FORMAL_PAIRED_AB_V2_OPENING_PLY,
  ranking: "sha256-domain-source-game-id-byte-order",
  duplicate_policy: "keep-first-ranked-semantic-final-position",
  required_openings: FORMAL_PAIRED_AB_V2_OPENING_COUNT,
});

const SHA256_RE = /^[0-9a-f]{64}$/u;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const USI_RE = /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/u;
const SOURCE_GAME_ID_DOMAIN = "shogi-formal-ab-v2-source-game-v1";
const SOURCE_MANIFEST_DIGEST_DOMAIN =
  "shogi-formal-paired-ab-v2-label-blind-source-manifest-v1\0";
const SOURCE_RANK_DOMAIN = "shogi-formal-paired-ab-v2-opening-source-rank-v1\0";
const OPENING_ID_DOMAIN = "shogi-formal-ab-v2-opening-v1";
const GAME_ID_DOMAIN = "shogi-formal-ab-v2-game-v1";
const POSITION_ID_DOMAIN = "sfen-v1";
const SEED_DOMAIN = "shogi-formal-paired-ab-v2-opening-seed-v1\0";
const PREFLIGHT_DIGEST_DOMAIN =
  "shogi-formal-paired-ab-v2-wasm-openings-preflight-v1\0";
const MAX_SAFE_SEED = BigInt(Number.MAX_SAFE_INTEGER);

type JsonRecord = Record<string, unknown>;

export interface FormalPairedAbV2SourceGames {
  readonly schema: typeof FORMAL_PAIRED_AB_V2_SOURCE_GAMES_SCHEMA;
  readonly games: readonly Readonly<{
    readonly source_game_id: string;
    readonly usi_moves: readonly string[];
  }>[];
}

export interface FormalPairedAbV2OpeningPair {
  readonly pair_index: number;
  readonly source_game_id: string;
  readonly opening_id: string;
  readonly opening: Readonly<{
    readonly sfen: string;
    readonly usi_moves: readonly string[];
  }>;
  readonly seed: number;
  readonly games: readonly [
    Readonly<{
      readonly game_index: 0;
      readonly game_id: string;
      readonly candidate_color: "sente";
    }>,
    Readonly<{
      readonly game_index: 1;
      readonly game_id: string;
      readonly candidate_color: "gote";
    }>,
  ];
}

export interface FormalPairedAbV2OpeningsManifest {
  readonly schema: typeof FORMAL_PAIRED_AB_V2_OPENINGS_MANIFEST_SCHEMA;
  readonly source_manifest_sha256: string;
  readonly selection_rule: Readonly<
    typeof FORMAL_PAIRED_AB_V2_OPENING_SELECTION_RULE
  >;
  readonly pairs: readonly Readonly<FormalPairedAbV2OpeningPair>[];
}

export interface FormalPairedAbV2OpeningsPreflightReceipt {
  readonly schema: typeof FORMAL_PAIRED_AB_V2_OPENINGS_PREFLIGHT_SCHEMA;
  readonly status: "PASS";
  readonly manifest_sha256: string;
  readonly pairs: number;
  readonly games: number;
  readonly source_games: number;
  readonly semantic_final_positions: number;
  readonly source_game_ids_sha256: string;
  readonly semantic_final_position_ids_sha256: string;
  readonly receipt_sha256: string;
}

function fail(message: string): never {
  throw new Error(message);
}

export function formalPairedAbV2CanonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || Object.is(value, -0))
    ) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((entry) => formalPairedAbV2CanonicalJson(entry))
      .join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as JsonRecord;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${formalPairedAbV2CanonicalJson(record[key])}`,
      )
      .join(",")}}`;
  }
  fail(`canonical JSON rejects ${typeof value}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function domainDigest(domain: string, value: unknown): string {
  return sha256(`${domain}${formalPairedAbV2CanonicalJson(value)}`);
}

function semanticId(domain: string, value: unknown): string {
  return `sha256:${sha256(
    `${domain}\0${formalPairedAbV2CanonicalJson(value)}`,
  )}`;
}

function exactRecord(
  value: unknown,
  expectedFields: readonly string[],
  label: string,
): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const record = value as JsonRecord;
  const actual = Object.keys(record).sort();
  const expected = [...expectedFields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    fail(`${label} fields differ`);
  }
  return record;
}

function exactCanonicalSfen(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    fail(`${label} is not canonical SFEN text`);
  }
  const parsed = positionFromSfen(value);
  if (toSfen(parsed.position, parsed.moveNumber) !== value) {
    fail(`${label} is not canonical SFEN serialization`);
  }
  return value;
}

function semanticPositionId(sfen: string): string {
  const fields = sfen.split(" ");
  if (fields.length !== 4) fail("final SFEN must contain four fields");
  return `sha256:${sha256(
    `${POSITION_ID_DOMAIN}\0${fields.slice(0, 3).join(" ")}`,
  )}`;
}

function exactSelectionRule(
  value: unknown,
  openingPly: number,
  requiredOpenings: number,
): void {
  const rule = exactRecord(
    value,
    [
      "duplicate_policy",
      "label_blind",
      "opening_ply",
      "ranking",
      "required_openings",
    ],
    "opening selection rule",
  );
  const expected = {
    label_blind: true,
    opening_ply: openingPly,
    ranking: "sha256-domain-source-game-id-byte-order",
    duplicate_policy: "keep-first-ranked-semantic-final-position",
    required_openings: requiredOpenings,
  };
  if (
    formalPairedAbV2CanonicalJson(rule) !==
    formalPairedAbV2CanonicalJson(expected)
  ) {
    fail("opening selection rule differs from the fixed label-blind rule");
  }
}

function validateMoveVector(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((move) => typeof move !== "string" || !USI_RE.test(move))
  ) {
    fail(`${label} must be a canonical USI move vector`);
  }
  return Object.freeze([...(value as string[])]);
}

function applyOpening(
  initialSfen: string,
  moves: readonly string[],
  label: string,
): Readonly<{ finalSfen: string; finalPositionId: string }> {
  let sfen = exactCanonicalSfen(initialSfen, `${label}.sfen`);
  const repetitions = new Map<string, number>();
  const notePosition = (): void => {
    const positionId = semanticPositionId(sfen);
    const count = (repetitions.get(positionId) ?? 0) + 1;
    repetitions.set(positionId, count);
    if (count >= 4) fail(`${label} reaches a terminal fourfold repetition`);
  };
  notePosition();
  for (const [moveIndex, move] of moves.entries()) {
    try {
      sfen = childSfenAfterUsi(sfen, move);
    } catch (error) {
      throw new Error(`${label}.usi_moves[${moveIndex}] is illegal`, {
        cause: error,
      });
    }
    notePosition();
  }
  const parsed = positionFromSfen(sfen);
  if (rulesCompleteLegalMoves(parsed.position).length === 0) {
    fail(`${label} final position is terminal`);
  }
  return Object.freeze({
    finalSfen: sfen,
    finalPositionId: semanticPositionId(sfen),
  });
}

function sourceGameId(moves: readonly string[]): string {
  return semanticId(SOURCE_GAME_ID_DOMAIN, { usi_moves: moves });
}

function gameId(
  openingId: string,
  pairIndex: number,
  gameIndex: number,
  candidateColor: "sente" | "gote",
): string {
  return semanticId(GAME_ID_DOMAIN, {
    candidate_color: candidateColor,
    game_index: gameIndex,
    opening_id: openingId,
    pair_index: pairIndex,
  });
}

function uniqueSeed(sourceGameIdValue: string, used: Set<number>): number {
  for (let counter = 0; counter < 1_000_000; counter += 1) {
    const digest = sha256(`${SEED_DOMAIN}${sourceGameIdValue}\0${counter}`);
    let value = BigInt(`0x${digest.slice(0, 14)}`) & MAX_SAFE_SEED;
    if (value === 0n) value = 1n;
    const seed = Number(value);
    if (!used.has(seed)) {
      used.add(seed);
      return seed;
    }
  }
  fail("could not derive a unique safe opening seed");
}

function buildManifest(
  value: unknown,
  openingPly: number,
  requiredOpenings: number,
): Readonly<FormalPairedAbV2OpeningsManifest> {
  const source = exactRecord(
    value,
    ["games", "schema"],
    "label-blind source manifest",
  );
  if (source.schema !== FORMAL_PAIRED_AB_V2_SOURCE_GAMES_SCHEMA) {
    fail("label-blind source manifest schema differs");
  }
  if (!Array.isArray(source.games) || source.games.length < requiredOpenings) {
    fail(`source manifest requires at least ${requiredOpenings} games`);
  }
  const sourceIds = new Set<string>();
  const ranked = source.games.map((rawGame, sourceIndex) => {
    const game = exactRecord(
      rawGame,
      ["source_game_id", "usi_moves"],
      `source game ${sourceIndex}`,
    );
    const moves = validateMoveVector(
      game.usi_moves,
      `source game ${sourceIndex}.usi_moves`,
    );
    if (moves.length < openingPly) {
      fail(`source game ${sourceIndex} has fewer than ${openingPly} plies`);
    }
    const expectedSourceGameId = sourceGameId(moves);
    if (
      typeof game.source_game_id !== "string" ||
      game.source_game_id !== expectedSourceGameId ||
      sourceIds.has(game.source_game_id)
    ) {
      fail(`source game ${sourceIndex} identity is invalid or duplicated`);
    }
    sourceIds.add(game.source_game_id);
    const openingMoves = Object.freeze(moves.slice(0, openingPly));
    const applied = applyOpening(
      FORMAL_PAIRED_AB_V2_START_SFEN,
      openingMoves,
      `source game ${sourceIndex} opening`,
    );
    return Object.freeze({
      sourceGameId: game.source_game_id,
      openingMoves,
      finalPositionId: applied.finalPositionId,
      rank: sha256(`${SOURCE_RANK_DOMAIN}${game.source_game_id}`),
    });
  });
  ranked.sort((left, right) =>
    left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0,
  );

  const finalPositionIds = new Set<string>();
  const selected = ranked.filter((entry) => {
    if (finalPositionIds.has(entry.finalPositionId)) return false;
    finalPositionIds.add(entry.finalPositionId);
    return true;
  });
  if (selected.length < requiredOpenings) {
    fail(
      `source manifest has only ${selected.length} semantically unique nonterminal openings`,
    );
  }

  const seeds = new Set<number>();
  const pairs = selected.slice(0, requiredOpenings).map((entry, pairIndex) => {
    const opening = Object.freeze({
      sfen: FORMAL_PAIRED_AB_V2_START_SFEN,
      usi_moves: entry.openingMoves,
    });
    const openingId = semanticId(OPENING_ID_DOMAIN, opening);
    return Object.freeze({
      pair_index: pairIndex,
      source_game_id: entry.sourceGameId,
      opening_id: openingId,
      opening,
      seed: uniqueSeed(entry.sourceGameId, seeds),
      games: Object.freeze([
        Object.freeze({
          game_index: 0 as const,
          game_id: gameId(openingId, pairIndex, 0, "sente"),
          candidate_color: "sente" as const,
        }),
        Object.freeze({
          game_index: 1 as const,
          game_id: gameId(openingId, pairIndex, 1, "gote"),
          candidate_color: "gote" as const,
        }),
      ]),
    });
  });
  return Object.freeze({
    schema: FORMAL_PAIRED_AB_V2_OPENINGS_MANIFEST_SCHEMA,
    source_manifest_sha256: domainDigest(SOURCE_MANIFEST_DIGEST_DOMAIN, {
      schema: FORMAL_PAIRED_AB_V2_SOURCE_GAMES_SCHEMA,
      source_game_ids: [...sourceIds].sort(),
    }),
    selection_rule: Object.freeze({
      label_blind: true as const,
      opening_ply: openingPly,
      ranking: "sha256-domain-source-game-id-byte-order" as const,
      duplicate_policy: "keep-first-ranked-semantic-final-position" as const,
      required_openings: requiredOpenings,
    }),
    pairs: Object.freeze(pairs),
  }) as Readonly<FormalPairedAbV2OpeningsManifest>;
}

function preflightManifest(
  value: unknown,
  openingPly: number,
  requiredOpenings: number,
): Readonly<FormalPairedAbV2OpeningsPreflightReceipt> {
  const manifest = exactRecord(
    value,
    ["pairs", "schema", "selection_rule", "source_manifest_sha256"],
    "formal openings manifest",
  );
  if (
    manifest.schema !== FORMAL_PAIRED_AB_V2_OPENINGS_MANIFEST_SCHEMA ||
    typeof manifest.source_manifest_sha256 !== "string" ||
    !SHA256_RE.test(manifest.source_manifest_sha256)
  ) {
    fail("formal openings manifest header is invalid");
  }
  exactSelectionRule(manifest.selection_rule, openingPly, requiredOpenings);
  if (
    !Array.isArray(manifest.pairs) ||
    manifest.pairs.length !== requiredOpenings
  ) {
    fail(`formal openings manifest requires exactly ${requiredOpenings} pairs`);
  }

  const sourceGameIds = new Set<string>();
  const openingIds = new Set<string>();
  const gameIds = new Set<string>();
  const seeds = new Set<number>();
  const finalPositionIds = new Set<string>();
  for (const [pairIndex, rawPair] of manifest.pairs.entries()) {
    const pair = exactRecord(
      rawPair,
      [
        "games",
        "opening",
        "opening_id",
        "pair_index",
        "seed",
        "source_game_id",
      ],
      `opening pair ${pairIndex}`,
    );
    if (
      pair.pair_index !== pairIndex ||
      typeof pair.source_game_id !== "string" ||
      !SEMANTIC_ID_RE.test(pair.source_game_id) ||
      sourceGameIds.has(pair.source_game_id) ||
      typeof pair.seed !== "number" ||
      !Number.isSafeInteger(pair.seed) ||
      pair.seed < 1 ||
      pair.seed > Number.MAX_SAFE_INTEGER ||
      seeds.has(pair.seed)
    ) {
      fail(`opening pair ${pairIndex} header is invalid or duplicated`);
    }
    sourceGameIds.add(pair.source_game_id);
    seeds.add(pair.seed);
    const openingValue = exactRecord(
      pair.opening,
      ["sfen", "usi_moves"],
      `opening pair ${pairIndex}.opening`,
    );
    const openingSfen = exactCanonicalSfen(
      openingValue.sfen,
      `opening pair ${pairIndex}.opening.sfen`,
    );
    const moves = validateMoveVector(
      openingValue.usi_moves,
      `opening pair ${pairIndex}.opening.usi_moves`,
    );
    if (moves.length !== openingPly) {
      fail(
        `opening pair ${pairIndex} must contain exactly ${openingPly} plies`,
      );
    }
    const opening = Object.freeze({ sfen: openingSfen, usi_moves: moves });
    const expectedOpeningId = semanticId(OPENING_ID_DOMAIN, opening);
    if (
      typeof pair.opening_id !== "string" ||
      pair.opening_id !== expectedOpeningId ||
      openingIds.has(pair.opening_id)
    ) {
      fail(
        `opening pair ${pairIndex} opening identity is invalid or duplicated`,
      );
    }
    openingIds.add(pair.opening_id);
    const applied = applyOpening(
      openingSfen,
      moves,
      `opening pair ${pairIndex}.opening`,
    );
    if (finalPositionIds.has(applied.finalPositionId)) {
      fail("formal openings must have unique semantic final positions");
    }
    finalPositionIds.add(applied.finalPositionId);

    if (!Array.isArray(pair.games) || pair.games.length !== 2) {
      fail(`opening pair ${pairIndex} requires exactly two games`);
    }
    for (const [gameIndex, rawGame] of pair.games.entries()) {
      const game = exactRecord(
        rawGame,
        ["candidate_color", "game_id", "game_index"],
        `opening pair ${pairIndex}.games[${gameIndex}]`,
      );
      const candidateColor = gameIndex === 0 ? "sente" : "gote";
      const expectedGameId = gameId(
        pair.opening_id,
        pairIndex,
        gameIndex,
        candidateColor,
      );
      if (
        game.game_index !== gameIndex ||
        game.candidate_color !== candidateColor ||
        game.game_id !== expectedGameId ||
        gameIds.has(expectedGameId)
      ) {
        fail(`opening pair ${pairIndex} game ${gameIndex} is invalid`);
      }
      gameIds.add(expectedGameId);
    }
  }

  const body = {
    schema: FORMAL_PAIRED_AB_V2_OPENINGS_PREFLIGHT_SCHEMA,
    status: "PASS" as const,
    manifest_sha256: domainDigest(
      "shogi-formal-paired-ab-v2-wasm-openings-manifest-v2\0",
      manifest,
    ),
    pairs: requiredOpenings,
    games: requiredOpenings * 2,
    source_games: sourceGameIds.size,
    semantic_final_positions: finalPositionIds.size,
    source_game_ids_sha256: domainDigest(
      "shogi-formal-paired-ab-v2-source-game-ids-v1\0",
      [...sourceGameIds].sort(),
    ),
    semantic_final_position_ids_sha256: domainDigest(
      "shogi-formal-paired-ab-v2-final-position-ids-v1\0",
      [...finalPositionIds].sort(),
    ),
  };
  return Object.freeze({
    ...body,
    receipt_sha256: domainDigest(PREFLIGHT_DIGEST_DOMAIN, body),
  });
}

export function buildFormalPairedAbV2OpeningsManifest(
  value: FormalPairedAbV2SourceGames,
): Readonly<FormalPairedAbV2OpeningsManifest> {
  return buildManifest(
    value,
    FORMAL_PAIRED_AB_V2_OPENING_PLY,
    FORMAL_PAIRED_AB_V2_OPENING_COUNT,
  );
}

export function preflightFormalPairedAbV2OpeningsManifest(
  value: FormalPairedAbV2OpeningsManifest,
): Readonly<FormalPairedAbV2OpeningsPreflightReceipt> {
  return preflightManifest(
    value,
    FORMAL_PAIRED_AB_V2_OPENING_PLY,
    FORMAL_PAIRED_AB_V2_OPENING_COUNT,
  );
}

/** Small-count seam for fixture tests; production exports remain fixed. */
export function buildFormalPairedAbV2OpeningsManifestCoreForTests(
  value: FormalPairedAbV2SourceGames,
  openingPly: number,
  requiredOpenings: number,
): Readonly<FormalPairedAbV2OpeningsManifest> {
  if (
    !Number.isSafeInteger(openingPly) ||
    openingPly < 1 ||
    !Number.isSafeInteger(requiredOpenings) ||
    requiredOpenings < 1
  ) {
    fail("CoreForTests opening parameters are invalid");
  }
  return buildManifest(value, openingPly, requiredOpenings);
}

/** Small-count seam for fixture tests; production exports remain fixed. */
export function preflightFormalPairedAbV2OpeningsManifestCoreForTests(
  value: FormalPairedAbV2OpeningsManifest,
  openingPly: number,
  requiredOpenings: number,
): Readonly<FormalPairedAbV2OpeningsPreflightReceipt> {
  return preflightManifest(value, openingPly, requiredOpenings);
}

export function formalPairedAbV2SourceGameIdForTests(
  moves: readonly string[],
): string {
  return sourceGameId(moves);
}

export function formalPairedAbV2OpeningIdForTests(
  opening: Readonly<{ sfen: string; usi_moves: readonly string[] }>,
): string {
  return semanticId(OPENING_ID_DOMAIN, opening);
}

export function formalPairedAbV2GameIdForTests(
  openingId: string,
  pairIndex: number,
  gameIndex: number,
  candidateColor: "sente" | "gote",
): string {
  return gameId(openingId, pairIndex, gameIndex, candidateColor);
}
