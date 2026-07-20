/**
 * Local-only paired calibration between the exact production-stable
 * Worker/WASM/NNUE runtime and the pinned YaneuraOu USI runtime.
 *
 * The explicit pinned entry returns an in-memory receipt only after every
 * scheduled game and both runtime cleanups complete. It has no CLI, no
 * argumentless entry, no network path, and no artifact or live-weight writer.
 */

import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import {
  GOTE,
  OU,
  SENTE,
  getKomashu,
} from "../src/components/game/ShogiImproved/types";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS,
  createFloodgateProductionStableWasmRuntime,
  getFloodgateProductionStableWasmRuntimeReceiptDigest,
  type FloodgateProductionStableWasmRuntime,
} from "./floodgate-production-stable-wasm-runtime";
import { FLOODGATE_PRODUCTION_TEACHER_RUNTIME } from "./floodgate-production-teacher-asset-authority";
import {
  createFloodgateProductionTeacherUsiRuntime,
  getFloodgateProductionTeacherUsiRuntimeReceiptDigest,
  type FloodgateProductionTeacherUsiPool,
} from "./floodgate-production-teacher-usi-runtime";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import { toSfen } from "./shogi-sfen-codec";

export const LOCAL_EXTERNAL_CALIBRATION_REQUEST_SCHEMA =
  "shogi-local-external-calibration-request-v1" as const;
export const LOCAL_EXTERNAL_CALIBRATION_RECEIPT_SCHEMA =
  "shogi-local-external-calibration-receipt-v1" as const;
export const LOCAL_EXTERNAL_CALIBRATION_PLAYER_SCHEMA =
  "shogi-local-external-calibration-player-v1" as const;
export const LOCAL_EXTERNAL_CALIBRATION_STATUS = "complete" as const;
export const LOCAL_EXTERNAL_CALIBRATION_CLAIM_BOUNDARY =
  "completed-local-fixed-depth-paired-game-record-only-not-human-rank-formal-ab-holdout-promotion-or-live-weight-evidence" as const;
export const LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL =
  "fixed-depth-no-game-clock-v1" as const;
export const LOCAL_EXTERNAL_CALIBRATION_ADJUDICATION =
  "legal-moves-fourfold-repetition-with-perpetual-check-loss-and-max-plies-draw-v1" as const;
export const LOCAL_EXTERNAL_CALIBRATION_MAX_CONCURRENCY = 12 as const;

const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const CANONICAL_USI_RE = /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/u;
const OPENING_ID_DOMAIN = "shogi-local-external-calibration-opening-v1\0";
const GAME_ID_DOMAIN = "shogi-local-external-calibration-game-v1\0";
const PARENT_ID_DOMAIN = "parent-occurrence-v1\0";
const POSITION_ID_DOMAIN = "sfen-v1\0";
const REQUEST_DIGEST_DOMAIN = "shogi-local-external-calibration-request-v1\0";
const DECISION_DIGEST_DOMAIN = "shogi-local-external-calibration-decision-v1\0";
const GAME_TRANSCRIPT_DIGEST_DOMAIN =
  "shogi-local-external-calibration-game-transcript-v1\0";
const RECEIPT_DIGEST_DOMAIN = "shogi-local-external-calibration-receipt-v1\0";

export type LocalExternalCalibrationColor = "sente" | "gote";
export type LocalExternalCalibrationRole = "stable" | "reference";

export interface LocalExternalCalibrationOpening {
  readonly opening_id: string;
  readonly sfen: string;
}

export interface LocalExternalCalibrationTimeControl {
  readonly mode: typeof LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL;
  readonly stable_depth: number;
  readonly reference_depth: number;
  readonly stable_timeout_ms: number;
  readonly reference_timeout_ms: number;
}

export interface LocalExternalCalibrationRequest {
  readonly schema: typeof LOCAL_EXTERNAL_CALIBRATION_REQUEST_SCHEMA;
  readonly run_id: string;
  readonly openings: readonly Readonly<LocalExternalCalibrationOpening>[];
  readonly time_control: Readonly<LocalExternalCalibrationTimeControl>;
  readonly adjudication: typeof LOCAL_EXTERNAL_CALIBRATION_ADJUDICATION;
  readonly max_plies: number;
  readonly game_concurrency: number;
}

export interface LocalExternalCalibrationPlayerBinding {
  readonly schema: typeof LOCAL_EXTERNAL_CALIBRATION_PLAYER_SCHEMA;
  readonly role: LocalExternalCalibrationRole;
  readonly player_id: string;
  readonly engine_contract: string;
  readonly runtime_receipt_sha256: string;
  readonly fixed_depth: number;
  readonly per_move_timeout_ms: number;
  readonly reset_before_every_move: true;
  readonly book: false;
  readonly network: false;
}

export interface LocalExternalCalibrationMoveInput {
  readonly game_id: string;
  readonly opening_id: string;
  readonly stable_color: LocalExternalCalibrationColor;
  readonly ply: number;
  readonly sfen: string;
  readonly legal_moves: readonly string[];
}

export interface LocalExternalCalibrationMoveDecision {
  readonly usi: string;
  readonly search_receipt_sha256: string;
}

export interface LocalExternalCalibrationPlayer {
  readonly binding: Readonly<LocalExternalCalibrationPlayerBinding>;
  readonly chooseMove: (
    input: Readonly<LocalExternalCalibrationMoveInput>,
  ) => Promise<Readonly<LocalExternalCalibrationMoveDecision>>;
  readonly abortAndReap: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface LocalExternalCalibrationCoreDependencies {
  readonly createStablePlayer: () => Promise<LocalExternalCalibrationPlayer>;
  readonly createReferencePlayer: () => Promise<LocalExternalCalibrationPlayer>;
}

export type LocalExternalCalibrationTermination =
  | "no-legal-moves"
  | "fourfold-repetition"
  | "perpetual-check"
  | "max-plies";

export interface LocalExternalCalibrationGameReceipt {
  readonly game_id: string;
  readonly opening_id: string;
  readonly pair_index: number;
  readonly stable_color: LocalExternalCalibrationColor;
  readonly result_for_stable: "win" | "draw" | "loss";
  readonly termination: LocalExternalCalibrationTermination;
  readonly plies: number;
  readonly moves: readonly string[];
  readonly move_receipt_sha256s: readonly string[];
  readonly final_sfen: string;
  readonly transcript_sha256: string;
}

export interface LocalExternalCalibrationReceipt {
  readonly schema: typeof LOCAL_EXTERNAL_CALIBRATION_RECEIPT_SCHEMA;
  readonly status: typeof LOCAL_EXTERNAL_CALIBRATION_STATUS;
  readonly claim_boundary: typeof LOCAL_EXTERNAL_CALIBRATION_CLAIM_BOUNDARY;
  readonly execution_boundary:
    | "test-only-injected-players"
    | "pinned-local-production-assets";
  readonly request: Readonly<LocalExternalCalibrationRequest>;
  readonly request_sha256: string;
  readonly players: Readonly<{
    readonly stable: Readonly<LocalExternalCalibrationPlayerBinding>;
    readonly reference: Readonly<LocalExternalCalibrationPlayerBinding>;
  }>;
  readonly schedule: Readonly<{
    readonly pairs: number;
    readonly games: number;
    readonly games_per_pair: 2;
    readonly same_opening_per_pair: true;
    readonly stable_colors: readonly ["sente", "gote"];
  }>;
  readonly games: readonly Readonly<LocalExternalCalibrationGameReceipt>[];
  readonly summary: Readonly<{
    readonly stable_wins: number;
    readonly draws: number;
    readonly stable_losses: number;
    readonly stable_points: number;
    readonly games: number;
  }>;
  readonly completeness: Readonly<{
    readonly games_required: number;
    readonly games_completed: number;
    readonly technical_faults: 0;
    readonly partial_result_publishable: false;
    readonly cleanup_completed: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly human_rank: false;
    readonly high_dan: false;
    readonly formal_ab: false;
    readonly holdout: false;
    readonly promotion: false;
    readonly live_weight_change: false;
  }>;
  readonly receipt_sha256: string;
}

export type LocalExternalCalibrationPhase =
  | "capture"
  | "initialization"
  | "game"
  | "timeout"
  | "cleanup";

export class LocalExternalCalibrationError extends Error {
  readonly phase: LocalExternalCalibrationPhase;
  readonly receipt_issued = false;
  readonly partial_result_publishable = false;
  readonly completed_games_discarded: number;
  readonly primary: unknown;

  constructor(
    phase: LocalExternalCalibrationPhase,
    message: string,
    primary: unknown,
    completedGamesDiscarded = 0,
  ) {
    super(`Local external calibration STOP: ${message}`, { cause: primary });
    this.name = "LocalExternalCalibrationError";
    this.phase = phase;
    this.primary = primary;
    this.completed_games_discarded = completedGamesDiscarded;
  }
}

interface CapturedRequest extends LocalExternalCalibrationRequest {
  readonly openings: readonly Readonly<LocalExternalCalibrationOpening>[];
}

interface ScheduledGame {
  readonly game_id: string;
  readonly opening_id: string;
  readonly opening_sfen: string;
  readonly pair_index: number;
  readonly stable_color: LocalExternalCalibrationColor;
}

interface MoveTrace {
  readonly mover: LocalExternalCalibrationColor;
  readonly gaveCheck: boolean;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(
        "canonical JSON requires finite non-negative-zero numbers",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (!isPlainRecord(value)) {
    throw new Error("canonical JSON requires plain records");
  }
  const keys = Object.keys(value).sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
  );
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function digestCanonical(domain: string, value: unknown): string {
  return sha256(`${domain}${canonicalJson(value)}`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value)
  ) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) throw new Error(`${label} must be a plain record`);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new Error(`${label} must not contain symbol fields`);
  }
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has an unexpected field set`);
  }
  const captured = Object.create(null) as Record<string, unknown>;
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new Error(`${label}.${key} must be an enumerable data field`);
    }
    captured[key] = descriptor.value;
  }
  return Object.freeze(captured);
}

function exactArray(
  value: unknown,
  maximumLength: number,
  label: string,
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    throw new Error(`${label} must be a plain non-Proxy array`);
  }
  const length = value.length;
  if (length < 1 || length > maximumLength) {
    throw new Error(`${label} length must be 1 through ${maximumLength}`);
  }
  const expectedKeys = Array.from({ length }, (_, index) => String(index));
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length + 1 ||
    ownKeys[ownKeys.length - 1] !== "length" ||
    expectedKeys.some((key, index) => ownKeys[index] !== key)
  ) {
    throw new Error(`${label} must be dense and contain no extra fields`);
  }
  const captured = expectedKeys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new Error(`${label}[${key}] must be an enumerable data field`);
    }
    return descriptor.value;
  });
  return Object.freeze(captured);
}

function positiveInteger(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new Error(`${label} must be an integer from 1 through ${maximum}`);
  }
  return value;
}

function canonicalSfen(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    throw new Error(`${label} is not canonical SFEN text`);
  }
  const parsed = positionFromSfen(value);
  if (toSfen(parsed.position, parsed.moveNumber) !== value) {
    throw new Error(`${label} is not canonical SFEN`);
  }
  const legal = rulesCompleteLegalMoves(parsed.position);
  if (legal.length === 0) throw new Error(`${label} is already terminal`);
  if (legal.some((entry) => getKomashu(entry.move.capture) === OU)) {
    throw new Error(`${label} permits an opposing-king capture`);
  }
  return value;
}

export function localExternalCalibrationOpeningId(sfen: string): string {
  const canonical = canonicalSfen(sfen, "opening SFEN");
  return `sha256:${sha256(`${OPENING_ID_DOMAIN}${canonical}`)}`;
}

function captureRequest(value: unknown): Readonly<CapturedRequest> {
  const request = exactRecord(
    value,
    [
      "adjudication",
      "game_concurrency",
      "max_plies",
      "openings",
      "run_id",
      "schema",
      "time_control",
    ],
    "request",
  );
  if (request.schema !== LOCAL_EXTERNAL_CALIBRATION_REQUEST_SCHEMA) {
    throw new Error("request schema is not exact");
  }
  if (
    typeof request.run_id !== "string" ||
    !SEMANTIC_ID_RE.test(request.run_id)
  ) {
    throw new Error("request.run_id is not a semantic SHA-256 ID");
  }
  if (request.adjudication !== LOCAL_EXTERNAL_CALIBRATION_ADJUDICATION) {
    throw new Error("request adjudication is not exact");
  }
  const maxPlies = positiveInteger(request.max_plies, 1_024, "max_plies");
  const gameConcurrency = positiveInteger(
    request.game_concurrency,
    LOCAL_EXTERNAL_CALIBRATION_MAX_CONCURRENCY,
    "game_concurrency",
  );
  const time = exactRecord(
    request.time_control,
    [
      "mode",
      "reference_depth",
      "reference_timeout_ms",
      "stable_depth",
      "stable_timeout_ms",
    ],
    "time_control",
  );
  if (time.mode !== LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL) {
    throw new Error("time_control.mode is not fixed-depth");
  }
  const timeControl = Object.freeze({
    mode: LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL,
    stable_depth: positiveInteger(time.stable_depth, 128, "stable_depth"),
    reference_depth: positiveInteger(
      time.reference_depth,
      128,
      "reference_depth",
    ),
    stable_timeout_ms: positiveInteger(
      time.stable_timeout_ms,
      3_600_000,
      "stable_timeout_ms",
    ),
    reference_timeout_ms: positiveInteger(
      time.reference_timeout_ms,
      3_600_000,
      "reference_timeout_ms",
    ),
  });
  const openingValues = exactArray(request.openings, 512, "request.openings");
  const seen = new Set<string>();
  const openings = openingValues.map((value, index) => {
    const opening = exactRecord(
      value,
      ["opening_id", "sfen"],
      `openings[${index}]`,
    );
    const sfen = canonicalSfen(opening.sfen, `openings[${index}].sfen`);
    const expectedId = localExternalCalibrationOpeningId(sfen);
    if (opening.opening_id !== expectedId) {
      throw new Error(`openings[${index}].opening_id is not content-derived`);
    }
    if (seen.has(expectedId)) {
      throw new Error("request contains a duplicate opening");
    }
    seen.add(expectedId);
    return Object.freeze({ opening_id: expectedId, sfen });
  });
  return Object.freeze({
    schema: LOCAL_EXTERNAL_CALIBRATION_REQUEST_SCHEMA,
    run_id: request.run_id,
    openings: Object.freeze(openings),
    time_control: timeControl,
    adjudication: LOCAL_EXTERNAL_CALIBRATION_ADJUDICATION,
    max_plies: maxPlies,
    game_concurrency: gameConcurrency,
  });
}

function capturePlayer(
  value: unknown,
  role: LocalExternalCalibrationRole,
  request: Readonly<CapturedRequest>,
): LocalExternalCalibrationPlayer {
  const player = exactRecord(
    value,
    ["abortAndReap", "binding", "chooseMove", "close"],
    `${role} player`,
  );
  const binding = exactRecord(
    player.binding,
    [
      "book",
      "engine_contract",
      "fixed_depth",
      "network",
      "per_move_timeout_ms",
      "player_id",
      "reset_before_every_move",
      "role",
      "runtime_receipt_sha256",
      "schema",
    ],
    `${role} binding`,
  );
  if (
    binding.schema !== LOCAL_EXTERNAL_CALIBRATION_PLAYER_SCHEMA ||
    binding.role !== role ||
    typeof binding.player_id !== "string" ||
    binding.player_id.length === 0 ||
    typeof binding.engine_contract !== "string" ||
    binding.engine_contract.length === 0 ||
    typeof binding.runtime_receipt_sha256 !== "string" ||
    !SHA256_RE.test(binding.runtime_receipt_sha256) ||
    binding.reset_before_every_move !== true ||
    binding.book !== false ||
    binding.network !== false
  ) {
    throw new Error(`${role} player binding is invalid`);
  }
  const expectedDepth =
    role === "stable"
      ? request.time_control.stable_depth
      : request.time_control.reference_depth;
  const expectedTimeout =
    role === "stable"
      ? request.time_control.stable_timeout_ms
      : request.time_control.reference_timeout_ms;
  if (
    binding.fixed_depth !== expectedDepth ||
    binding.per_move_timeout_ms !== expectedTimeout
  ) {
    throw new Error(`${role} player differs from fixed time control`);
  }
  for (const method of ["chooseMove", "abortAndReap", "close"] as const) {
    if (
      typeof player[method] !== "function" ||
      nodeUtilTypes.isProxy(player[method])
    ) {
      throw new Error(`${role} player ${method} is not a direct function`);
    }
  }
  return Object.freeze({
    binding: Object.freeze({
      schema: LOCAL_EXTERNAL_CALIBRATION_PLAYER_SCHEMA,
      role,
      player_id: binding.player_id,
      engine_contract: binding.engine_contract,
      runtime_receipt_sha256: binding.runtime_receipt_sha256,
      fixed_depth: expectedDepth,
      per_move_timeout_ms: expectedTimeout,
      reset_before_every_move: true,
      book: false,
      network: false,
    }),
    chooseMove:
      player.chooseMove as LocalExternalCalibrationPlayer["chooseMove"],
    abortAndReap:
      player.abortAndReap as LocalExternalCalibrationPlayer["abortAndReap"],
    close: player.close as LocalExternalCalibrationPlayer["close"],
  });
}

function colorFromTeban(teban: number): LocalExternalCalibrationColor {
  if (teban === SENTE) return "sente";
  if (teban === GOTE) return "gote";
  throw new Error("position has an invalid side to move");
}

function otherColor(
  color: LocalExternalCalibrationColor,
): LocalExternalCalibrationColor {
  return color === "sente" ? "gote" : "sente";
}

function positionKey(sfen: string): string {
  const fields = sfen.split(" ");
  if (fields.length !== 4) throw new Error("SFEN must have four fields");
  return fields.slice(0, 3).join(" ");
}

function scheduleGames(
  request: Readonly<CapturedRequest>,
): readonly Readonly<ScheduledGame>[] {
  const games: ScheduledGame[] = [];
  request.openings.forEach((opening, pairIndex) => {
    for (const stableColor of ["sente", "gote"] as const) {
      games.push(
        Object.freeze({
          game_id: `sha256:${sha256(
            `${GAME_ID_DOMAIN}${request.run_id}\0${opening.opening_id}\0${stableColor}`,
          )}`,
          opening_id: opening.opening_id,
          opening_sfen: opening.sfen,
          pair_index: pairIndex,
          stable_color: stableColor,
        }),
      );
    }
  });
  return Object.freeze(games);
}

function moveTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  role: LocalExternalCalibrationRole,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new LocalExternalCalibrationError(
            "timeout",
            `${role} move exceeded ${timeoutMs}ms`,
            new Error("fixed per-move technical timeout"),
          ),
        ),
      timeoutMs,
    );
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function repetitionOutcome(
  occurrenceIndices: readonly number[],
  traces: readonly Readonly<MoveTrace>[],
): Readonly<{
  readonly termination: "fourfold-repetition" | "perpetual-check";
  readonly loser?: LocalExternalCalibrationColor;
}> | null {
  if (occurrenceIndices.length < 4) return null;
  const start = occurrenceIndices[occurrenceIndices.length - 4];
  const end = occurrenceIndices[occurrenceIndices.length - 1];
  const interval = traces.slice(start, end);
  const perpetual = (["sente", "gote"] as const).filter((color) => {
    const moves = interval.filter((trace) => trace.mover === color);
    return moves.length > 0 && moves.every((trace) => trace.gaveCheck);
  });
  if (perpetual.length === 1) {
    return Object.freeze({
      termination: "perpetual-check" as const,
      loser: perpetual[0],
    });
  }
  return Object.freeze({ termination: "fourfold-repetition" as const });
}

function stableResult(
  stableColor: LocalExternalCalibrationColor,
  winner?: LocalExternalCalibrationColor,
): "win" | "draw" | "loss" {
  if (winner === undefined) return "draw";
  return winner === stableColor ? "win" : "loss";
}

async function playGame(
  game: Readonly<ScheduledGame>,
  request: Readonly<CapturedRequest>,
  stable: LocalExternalCalibrationPlayer,
  reference: LocalExternalCalibrationPlayer,
): Promise<Readonly<LocalExternalCalibrationGameReceipt>> {
  let sfen = game.opening_sfen;
  const moves: string[] = [];
  const moveReceiptSha256s: string[] = [];
  const traces: MoveTrace[] = [];
  const occurrences = new Map<string, number[]>();
  occurrences.set(positionKey(sfen), [0]);
  let termination: LocalExternalCalibrationTermination = "max-plies";
  let winner: LocalExternalCalibrationColor | undefined;

  for (let localPly = 0; localPly < request.max_plies; localPly += 1) {
    const parsed = positionFromSfen(sfen);
    const mover = colorFromTeban(parsed.position.teban);
    const legal = rulesCompleteLegalMoves(parsed.position);
    if (legal.some((entry) => getKomashu(entry.move.capture) === OU)) {
      throw new Error("legal move set attempts to capture the opposing king");
    }
    if (legal.length === 0) {
      termination = "no-legal-moves";
      winner = otherColor(mover);
      break;
    }
    const legalMoves = Object.freeze(legal.map((entry) => entry.usi));
    const role: LocalExternalCalibrationRole =
      mover === game.stable_color ? "stable" : "reference";
    const player = role === "stable" ? stable : reference;
    const input = Object.freeze({
      game_id: game.game_id,
      opening_id: game.opening_id,
      stable_color: game.stable_color,
      ply: parsed.moveNumber - 1,
      sfen,
      legal_moves: legalMoves,
    });
    const decisionValue = await moveTimeout(
      Promise.resolve().then(() => player.chooseMove(input)),
      player.binding.per_move_timeout_ms,
      role,
    );
    const decision = exactRecord(
      decisionValue,
      ["search_receipt_sha256", "usi"],
      `${role} move decision`,
    );
    if (
      typeof decision.usi !== "string" ||
      !CANONICAL_USI_RE.test(decision.usi) ||
      !legalMoves.includes(decision.usi) ||
      typeof decision.search_receipt_sha256 !== "string" ||
      !SHA256_RE.test(decision.search_receipt_sha256)
    ) {
      throw new Error(`${role} returned an illegal or unbound move`);
    }
    const child = childSfenAfterUsi(sfen, decision.usi);
    const childParsed = positionFromSfen(child);
    const gaveCheck = GenerateMovesImproved.isKingInCheck(
      childParsed.position,
      childParsed.position.teban,
    );
    moves.push(decision.usi);
    moveReceiptSha256s.push(decision.search_receipt_sha256);
    traces.push(Object.freeze({ mover, gaveCheck }));
    sfen = child;

    const childLegal = rulesCompleteLegalMoves(childParsed.position);
    if (childLegal.some((entry) => getKomashu(entry.move.capture) === OU)) {
      throw new Error(
        "child legal move set attempts to capture the opposing king",
      );
    }
    if (childLegal.length === 0) {
      termination = "no-legal-moves";
      winner = mover;
      break;
    }

    const key = positionKey(sfen);
    const positions = occurrences.get(key) ?? [];
    positions.push(moves.length);
    occurrences.set(key, positions);
    const repetition = repetitionOutcome(positions, traces);
    if (repetition !== null) {
      termination = repetition.termination;
      winner =
        repetition.loser === undefined
          ? undefined
          : otherColor(repetition.loser);
      break;
    }
  }

  const transcript = Object.freeze({
    game_id: game.game_id,
    opening_id: game.opening_id,
    stable_color: game.stable_color,
    moves: Object.freeze([...moves]),
    move_receipt_sha256s: Object.freeze([...moveReceiptSha256s]),
    final_sfen: sfen,
    termination,
  });
  return Object.freeze({
    game_id: game.game_id,
    opening_id: game.opening_id,
    pair_index: game.pair_index,
    stable_color: game.stable_color,
    result_for_stable: stableResult(game.stable_color, winner),
    termination,
    plies: moves.length,
    moves: transcript.moves,
    move_receipt_sha256s: transcript.move_receipt_sha256s,
    final_sfen: sfen,
    transcript_sha256: digestCanonical(
      GAME_TRANSCRIPT_DIGEST_DOMAIN,
      transcript,
    ),
  });
}

async function settleCleanup(
  players: readonly LocalExternalCalibrationPlayer[],
  method: "abortAndReap" | "close",
): Promise<void> {
  const settled = await Promise.allSettled(
    players.map((player) => Promise.resolve().then(() => player[method]())),
  );
  const failures = settled
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )
    .map((result) => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(failures, `player ${method} cleanup failed`);
  }
}

async function createPlayers(
  dependencies: LocalExternalCalibrationCoreDependencies,
  request: Readonly<CapturedRequest>,
): Promise<
  readonly [LocalExternalCalibrationPlayer, LocalExternalCalibrationPlayer]
> {
  const settled = await Promise.allSettled([
    dependencies.createStablePlayer(),
    dependencies.createReferencePlayer(),
  ]);
  const created = settled
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<LocalExternalCalibrationPlayer> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
  if (settled.some((result) => result.status === "rejected")) {
    try {
      await settleCleanup(created, "close");
    } catch {
      // Initialization failure remains the primary STOP reason.
    }
    throw new AggregateError(
      settled
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        )
        .map((result) => result.reason),
      "player initialization failed",
    );
  }
  const stableResult = settled[0];
  const referenceResult = settled[1];
  if (
    stableResult.status !== "fulfilled" ||
    referenceResult.status !== "fulfilled"
  ) {
    throw new Error("player initialization result did not narrow");
  }
  try {
    return Object.freeze([
      capturePlayer(stableResult.value, "stable", request),
      capturePlayer(referenceResult.value, "reference", request),
    ]);
  } catch (primary) {
    try {
      await settleCleanup(created, "close");
    } catch (cleanupFailure) {
      throw new AggregateError(
        [primary, cleanupFailure],
        "player capture and cleanup both failed",
      );
    }
    throw primary;
  }
}

async function runInternal(
  requestValue: LocalExternalCalibrationRequest,
  dependencies: LocalExternalCalibrationCoreDependencies,
  executionBoundary: LocalExternalCalibrationReceipt["execution_boundary"],
): Promise<Readonly<LocalExternalCalibrationReceipt>> {
  let request: Readonly<CapturedRequest>;
  try {
    request = captureRequest(requestValue);
    const factories = exactRecord(
      dependencies,
      ["createReferencePlayer", "createStablePlayer"],
      "player factories",
    );
    if (
      typeof factories.createStablePlayer !== "function" ||
      nodeUtilTypes.isProxy(factories.createStablePlayer) ||
      typeof factories.createReferencePlayer !== "function" ||
      nodeUtilTypes.isProxy(factories.createReferencePlayer)
    ) {
      throw new Error("player factories must be direct functions");
    }
  } catch (primary) {
    throw new LocalExternalCalibrationError(
      "capture",
      primary instanceof Error ? primary.message : "invalid request",
      primary,
    );
  }

  let players:
    | readonly [LocalExternalCalibrationPlayer, LocalExternalCalibrationPlayer]
    | undefined;
  let completed = 0;
  let operationFailure: unknown;
  try {
    try {
      players = await createPlayers(dependencies, request);
    } catch (primary) {
      throw new LocalExternalCalibrationError(
        "initialization",
        "player initialization failed",
        primary,
      );
    }
    const [stable, reference] = players;
    const schedule = scheduleGames(request);
    const results = new Array<
      Readonly<LocalExternalCalibrationGameReceipt> | undefined
    >(schedule.length);
    let next = 0;
    let stopped = false;
    let abortPromise: Promise<void> | undefined;
    const abortOnce = () => {
      abortPromise ??= settleCleanup(players ?? [], "abortAndReap");
      return abortPromise;
    };
    const worker = async () => {
      while (true) {
        if (stopped) return;
        const index = next;
        next += 1;
        if (index >= schedule.length) return;
        try {
          results[index] = await playGame(
            schedule[index],
            request,
            stable,
            reference,
          );
          completed += 1;
        } catch (primary) {
          stopped = true;
          try {
            await abortOnce();
          } catch (cleanupFailure) {
            throw new AggregateError(
              [primary, cleanupFailure],
              "game and abort cleanup both failed",
            );
          }
          throw primary;
        }
      }
    };
    try {
      const workerResults = await Promise.allSettled(
        Array.from(
          { length: Math.min(request.game_concurrency, schedule.length) },
          () => worker(),
        ),
      );
      const failures = workerResults
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        )
        .map((result) => result.reason);
      if (failures.length > 0) throw failures[0];
    } catch (primary) {
      throw new LocalExternalCalibrationError(
        primary instanceof LocalExternalCalibrationError
          ? primary.phase
          : "game",
        "a scheduled game failed; all completed games are discarded",
        primary,
        completed,
      );
    }
    if (
      completed !== schedule.length ||
      results.some((result) => result === undefined)
    ) {
      throw new LocalExternalCalibrationError(
        "game",
        "exact game accounting did not close",
        new Error("incomplete deterministic result vector"),
        completed,
      );
    }
    const games = Object.freeze(
      results as Readonly<LocalExternalCalibrationGameReceipt>[],
    );
    const stableWins = games.filter(
      (game) => game.result_for_stable === "win",
    ).length;
    const draws = games.filter(
      (game) => game.result_for_stable === "draw",
    ).length;
    const stableLosses = games.length - stableWins - draws;
    const body = Object.freeze({
      schema: LOCAL_EXTERNAL_CALIBRATION_RECEIPT_SCHEMA,
      status: LOCAL_EXTERNAL_CALIBRATION_STATUS,
      claim_boundary: LOCAL_EXTERNAL_CALIBRATION_CLAIM_BOUNDARY,
      execution_boundary: executionBoundary,
      request,
      request_sha256: digestCanonical(REQUEST_DIGEST_DOMAIN, request),
      players: Object.freeze({
        stable: stable.binding,
        reference: reference.binding,
      }),
      schedule: Object.freeze({
        pairs: request.openings.length,
        games: games.length,
        games_per_pair: 2 as const,
        same_opening_per_pair: true as const,
        stable_colors: Object.freeze(["sente", "gote"] as const),
      }),
      games,
      summary: Object.freeze({
        stable_wins: stableWins,
        draws,
        stable_losses: stableLosses,
        stable_points: stableWins + draws * 0.5,
        games: games.length,
      }),
      completeness: Object.freeze({
        games_required: schedule.length,
        games_completed: games.length,
        technical_faults: 0 as const,
        partial_result_publishable: false as const,
        cleanup_completed: true as const,
      }),
      nonclaims: Object.freeze({
        human_rank: false as const,
        high_dan: false as const,
        formal_ab: false as const,
        holdout: false as const,
        promotion: false as const,
        live_weight_change: false as const,
      }),
    });
    return Object.freeze({
      ...body,
      receipt_sha256: digestCanonical(RECEIPT_DIGEST_DOMAIN, body),
    });
  } catch (primary) {
    operationFailure = primary;
    throw primary;
  } finally {
    if (players !== undefined) {
      try {
        await settleCleanup(players, "close");
      } catch (cleanupFailure) {
        if (operationFailure === undefined) {
          throw new LocalExternalCalibrationError(
            "cleanup",
            "complete games were discarded because cleanup did not close",
            cleanupFailure,
            completed,
          );
        }
      }
    }
  }
}

/**
 * Test-only dependency seam. It is intentionally not an authority for pinned
 * production assets and is suitable for deterministic fixtures/fake engines.
 */
export function runLocalExternalCalibrationCoreForTests(
  request: LocalExternalCalibrationRequest,
  dependencies: LocalExternalCalibrationCoreDependencies,
): Promise<Readonly<LocalExternalCalibrationReceipt>> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new LocalExternalCalibrationError(
        "capture",
        "CoreForTests accepts exactly request and dependencies",
        new Error("wrong argument count"),
      ),
    );
  }
  return runInternal(request, dependencies, "test-only-injected-players");
}

function stableParent(
  input: Readonly<LocalExternalCalibrationMoveInput>,
): Readonly<{
  readonly schema_version: 1;
  readonly game_id: string;
  readonly parent_id: string;
  readonly position_id: string;
  readonly parent_sfen: string;
  readonly ply: number;
  readonly played_move: string;
}> {
  const fields = input.sfen.split(" ");
  return Object.freeze({
    schema_version: 1 as const,
    game_id: input.game_id,
    parent_id: `sha256:${sha256(
      `${PARENT_ID_DOMAIN}${input.game_id}\0${input.ply}`,
    )}`,
    position_id: `sha256:${sha256(
      `${POSITION_ID_DOMAIN}${fields.slice(0, 3).join(" ")}`,
    )}`,
    parent_sfen: input.sfen,
    ply: input.ply,
    // The runtime requires one legal source-row move for structural binding;
    // calibration uses only its independently returned stable_move.
    played_move: input.legal_moves[0],
  });
}

function stablePlayer(
  runtime: FloodgateProductionStableWasmRuntime<"production-fixed-asset-authority-and-reusable-pool">,
): LocalExternalCalibrationPlayer {
  const runtimeReceiptSha256 =
    getFloodgateProductionStableWasmRuntimeReceiptDigest(runtime);
  return Object.freeze({
    binding: Object.freeze({
      schema: LOCAL_EXTERNAL_CALIBRATION_PLAYER_SCHEMA,
      role: "stable" as const,
      player_id: "production-stable-worker-wasm-nnue-v20",
      engine_contract: runtime.receipt.contract,
      runtime_receipt_sha256: runtimeReceiptSha256,
      fixed_depth: runtime.receipt.search_contract.requested_depth,
      per_move_timeout_ms: runtime.receipt.operational.search_timeout_ms,
      reset_before_every_move: true as const,
      book: false as const,
      network: false as const,
    }),
    chooseMove: async (input: Readonly<LocalExternalCalibrationMoveInput>) => {
      const result = await runtime.propose(stableParent(input));
      return Object.freeze({
        usi: result.row.stable_move,
        search_receipt_sha256: digestCanonical(DECISION_DIGEST_DOMAIN, result),
      });
    },
    abortAndReap: () => runtime.close(),
    close: () => runtime.close(),
  });
}

function referencePlayer(
  runtime: FloodgateProductionTeacherUsiPool<"production-fixed-assets-and-runtime-dependencies">,
): LocalExternalCalibrationPlayer {
  const runtimeReceiptSha256 =
    getFloodgateProductionTeacherUsiRuntimeReceiptDigest(runtime);
  return Object.freeze({
    binding: Object.freeze({
      schema: LOCAL_EXTERNAL_CALIBRATION_PLAYER_SCHEMA,
      role: "reference" as const,
      player_id: "pinned-yaneuraou-nnue-9.60git-applem1",
      engine_contract: runtime.receipt.contract,
      runtime_receipt_sha256: runtimeReceiptSha256,
      fixed_depth: runtime.receipt.runtime.depth,
      per_move_timeout_ms: runtime.receipt.timeouts.searchMs,
      reset_before_every_move: true as const,
      book: false as const,
      network: false as const,
    }),
    chooseMove: (input: Readonly<LocalExternalCalibrationMoveInput>) =>
      choosePinnedReferenceMove(input, runtime),
    abortAndReap: () => runtime.abortAndReap(),
    close: () => runtime.close(),
  });
}

interface PinnedReferenceSearchRuntime {
  readonly propose: (
    sfen: string,
    legalMoveCount: number,
  ) => Promise<Readonly<{ readonly bestmove: string }>>;
  readonly rescore: (
    sfen: string,
    move: string,
  ) => Promise<Readonly<{ readonly bestmove: string }>>;
}

async function choosePinnedReferenceMove(
  input: Readonly<LocalExternalCalibrationMoveInput>,
  runtime: Readonly<PinnedReferenceSearchRuntime>,
): Promise<Readonly<LocalExternalCalibrationMoveDecision>> {
  // The production proposal surface intentionally requires at least two legal
  // moves. A forced position still needs one real depth-16 engine search, so
  // use its fixed MultiPV-1/searchmoves rescore path for the sole legal move.
  const result =
    input.legal_moves.length === 1
      ? await runtime.rescore(input.sfen, input.legal_moves[0])
      : await runtime.propose(input.sfen, input.legal_moves.length);
  return Object.freeze({
    usi: result.bestmove,
    search_receipt_sha256: digestCanonical(DECISION_DIGEST_DOMAIN, result),
  });
}

/** Test-only seam for the production reference adapter's forced-move branch. */
export function choosePinnedReferenceMoveCoreForTests(
  input: Readonly<LocalExternalCalibrationMoveInput>,
  runtime: Readonly<PinnedReferenceSearchRuntime>,
): Promise<Readonly<LocalExternalCalibrationMoveDecision>> {
  return choosePinnedReferenceMove(input, runtime);
}

/**
 * Explicit local pinned-asset entry. The caller must provide a complete
 * request; this module deliberately exposes no argumentless or CLI launcher.
 */
export function runPinnedLocalExternalCalibration(
  request: LocalExternalCalibrationRequest,
): Promise<Readonly<LocalExternalCalibrationReceipt>> {
  if (arguments.length !== 1) {
    return Promise.reject(
      new LocalExternalCalibrationError(
        "capture",
        "pinned local calibration requires exactly one explicit request",
        new Error("wrong argument count"),
      ),
    );
  }
  return runInternal(
    request,
    Object.freeze({
      createStablePlayer: async () =>
        stablePlayer(await createFloodgateProductionStableWasmRuntime()),
      createReferencePlayer: async () =>
        referencePlayer(await createFloodgateProductionTeacherUsiRuntime()),
    }),
    "pinned-local-production-assets",
  );
}

export const PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL = Object.freeze({
  mode: LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL,
  stable_depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.stable.depth,
  reference_depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
  stable_timeout_ms: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS,
  reference_timeout_ms:
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.timeout_ms_per_search,
});
