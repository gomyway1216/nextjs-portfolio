/**
 * Executable local formal paired A/B v2 browser/WASM match adapter.
 *
 * Authentication is separated from execution. The authenticator captures the
 * exact pair request and content-addressed candidate/stable int16 files into
 * an unforgeable in-process capability. The executor accepts only that
 * capability, starts two isolated child players, plays both colors, revalidates
 * the files after cleanup, and only then returns a bound pair receipt.
 *
 * This module has no network client, cloud path, or live-weight writer.
 */

import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import {
  GOTE,
  OU,
  SENTE,
  getKomashu,
} from "../src/components/game/ShogiImproved/types";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";

export const FORMAL_PAIRED_AB_V2_WASM_PAIR_REQUEST_SCHEMA =
  "shogi-formal-paired-ab-v2-wasm-pair-request-v1" as const;
export const FORMAL_PAIRED_AB_V2_WASM_PAIR_RECEIPT_SCHEMA =
  "shogi-formal-paired-ab-v2-wasm-pair-receipt-v1" as const;
export const FORMAL_PAIRED_AB_V2_WASM_GAME_RECEIPT_SCHEMA =
  "shogi-floodgate-formal-paired-ab-local-game-receipt-v1" as const;
export const FORMAL_PAIRED_AB_V2_WASM_PLAYER_SCHEMA =
  "shogi-formal-paired-ab-v2-wasm-player-v1" as const;
export const FORMAL_PAIRED_AB_V2_WASM_IPC_SCHEMA =
  "shogi-formal-paired-ab-v2-wasm-player-ipc-v1" as const;
export const FORMAL_PAIRED_AB_V2_WASM_STATUS = "complete" as const;
export const FORMAL_PAIRED_AB_V2_WASM_ADJUDICATION =
  "legal-moves-fourfold-repetition-with-perpetual-check-loss-and-max-plies-draw-v1" as const;
export const FORMAL_PAIRED_AB_V2_MAX_PAIR_WORKERS = 2 as const;
export const FORMAL_PAIRED_AB_V2_GAMES_PER_PAIR = 2 as const;
export const FORMAL_PAIRED_AB_V2_PAIR_COUNT = 384 as const;
export const FORMAL_PAIRED_AB_V2_GAME_COUNT = 768 as const;
export const FORMAL_PAIRED_AB_V2_MAX_PLIES = 512 as const;
export const FORMAL_PAIRED_AB_V2_SEARCH_DEPTH = 11 as const;
export const FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH = 10 as const;
export const FORMAL_PAIRED_AB_V2_NNUE_SCALE_K = 600 as const;
export const FORMAL_PAIRED_AB_V2_NNUE_BYTES = 1_185_988 as const;
export const FORMAL_PAIRED_AB_V2_WASM_BYTES = 35_597 as const;
export const FORMAL_PAIRED_AB_V2_WASM_SHA256 =
  "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c" as const;
export const FORMAL_PAIRED_AB_V2_STARTUP_TIMEOUT_MS = 120_000 as const;
export const FORMAL_PAIRED_AB_V2_SEARCH_TIMEOUT_MS = 600_000 as const;
export const FORMAL_PAIRED_AB_V2_CLEANUP_TIMEOUT_MS = 15_000 as const;

const SHA256_RE = /^[0-9a-f]{64}$/u;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const USI_RE = /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/u;
const REQUEST_DIGEST_DOMAIN =
  "shogi-formal-paired-ab-v2-wasm-pair-request-v1\0";
const SEARCH_DIGEST_DOMAIN = "shogi-formal-paired-ab-v2-wasm-search-v1\0";
const SEARCH_RECEIPT_DIGEST_DOMAIN =
  "shogi-formal-paired-ab-v2-wasm-search-receipt-v1\0";
const TRANSCRIPT_DIGEST_DOMAIN =
  "shogi-formal-paired-ab-v2-wasm-game-transcript-v1\0";
const CLEANUP_DIGEST_DOMAIN = "shogi-formal-paired-ab-v2-wasm-cleanup-v1\0";
const RECEIPT_DIGEST_DOMAIN =
  "shogi-formal-paired-ab-v2-wasm-pair-receipt-v1\0";
const OPENING_ID_DOMAIN = "shogi-formal-ab-v2-opening-v1\0";
const GAME_ID_DOMAIN = "shogi-formal-ab-v2-game-v1\0";
const CHILD_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "formal-paired-ab-v2-wasm-player-child.ts",
);
const TSX_CJS_PATH = createRequire(import.meta.url).resolve("tsx/cjs");

export type FormalPairedAbV2Color = "sente" | "gote";
export type FormalPairedAbV2Role = "candidate" | "stable";
export type FormalPairedAbV2GameResult = "win" | "draw" | "loss";
export type FormalPairedAbV2Termination =
  | "no-legal-moves"
  | "fourfold-repetition"
  | "perpetual-check"
  | "max-plies";

export interface FormalPairedAbV2ArtifactIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface FormalPairedAbV2PairRequest {
  readonly schema: typeof FORMAL_PAIRED_AB_V2_WASM_PAIR_REQUEST_SCHEMA;
  readonly pair_index: number;
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
  readonly candidate_weights: Readonly<FormalPairedAbV2ArtifactIdentity>;
  readonly stable_weights: Readonly<FormalPairedAbV2ArtifactIdentity>;
  readonly match_binding_sha256: string;
}

export interface FormalPairedAbV2MoveInput {
  readonly game_id: string;
  readonly opening_id: string;
  readonly candidate_color: FormalPairedAbV2Color;
  readonly ply: number;
  readonly sfen: string;
  readonly legal_moves: readonly string[];
}

export interface FormalPairedAbV2MoveDecision {
  readonly usi: string;
  readonly search_receipt_sha256: string;
}

export interface FormalPairedAbV2Player {
  readonly binding: Readonly<{
    readonly schema: typeof FORMAL_PAIRED_AB_V2_WASM_PLAYER_SCHEMA;
    readonly role: FormalPairedAbV2Role;
    readonly weights_sha256: string;
    readonly isolated_process: true;
    readonly fixed_depth: typeof FORMAL_PAIRED_AB_V2_SEARCH_DEPTH;
    readonly quiescence_depth: typeof FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH;
    readonly reset_before_every_move: true;
    readonly book: false;
    readonly network: false;
  }>;
  readonly chooseMove: (
    input: Readonly<FormalPairedAbV2MoveInput>,
  ) => Promise<Readonly<FormalPairedAbV2MoveDecision>>;
  readonly abortAndReap: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface FormalPairedAbV2CoreDependencies {
  readonly createPlayer: (
    role: FormalPairedAbV2Role,
    identity: Readonly<FormalPairedAbV2ArtifactIdentity>,
  ) => Promise<FormalPairedAbV2Player>;
  readonly afterGamesBeforeRevalidation?: () => void | Promise<void>;
  readonly revalidateAssets?: () => void | Promise<void>;
}

export interface FormalPairedAbV2GameTranscript {
  readonly game_index: 0 | 1;
  readonly game_id: string;
  readonly candidate_color: FormalPairedAbV2Color;
  readonly result: FormalPairedAbV2GameResult;
  readonly termination: FormalPairedAbV2Termination;
  readonly plies: number;
  readonly moves: readonly string[];
  readonly move_receipt_sha256s: readonly string[];
  readonly final_sfen: string;
  readonly transcript_sha256: string;
  readonly launcher_receipt: Readonly<{
    readonly schema: typeof FORMAL_PAIRED_AB_V2_WASM_GAME_RECEIPT_SCHEMA;
    readonly pair_index: number;
    readonly opening_id: string;
    readonly game_index: 0 | 1;
    readonly game_id: string;
    readonly candidate_color: FormalPairedAbV2Color;
    readonly seed: number;
    readonly candidate_weights_sha256: string;
    readonly stable_weights_sha256: string;
    readonly match_binding_sha256: string;
    readonly result: FormalPairedAbV2GameResult;
    readonly technical_fault: false;
  }>;
}

export interface FormalPairedAbV2PairReceipt {
  readonly schema: typeof FORMAL_PAIRED_AB_V2_WASM_PAIR_RECEIPT_SCHEMA;
  readonly status: typeof FORMAL_PAIRED_AB_V2_WASM_STATUS;
  readonly execution_boundary:
    | "authenticated-content-addressed-local-assets"
    | "test-only-injected-players";
  readonly request_sha256: string;
  readonly pair_index: number;
  readonly opening_id: string;
  readonly seed: number;
  readonly candidate_weights_sha256: string;
  readonly stable_weights_sha256: string;
  readonly match_binding_sha256: string;
  readonly search_contract: Readonly<{
    readonly engine: "production-browser-wasm-v20";
    readonly wasm_bytes: typeof FORMAL_PAIRED_AB_V2_WASM_BYTES;
    readonly wasm_sha256: typeof FORMAL_PAIRED_AB_V2_WASM_SHA256;
    readonly fixed_depth: typeof FORMAL_PAIRED_AB_V2_SEARCH_DEPTH;
    readonly quiescence_depth: typeof FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH;
    readonly nnue_scale_k: typeof FORMAL_PAIRED_AB_V2_NNUE_SCALE_K;
    readonly reset_before_every_move: true;
    readonly book: false;
    readonly fallback: "forbidden";
  }>;
  readonly schedule: Readonly<{
    readonly pairs: 1;
    readonly games: 2;
    readonly games_per_pair: 2;
    readonly candidate_colors: readonly ["sente", "gote"];
  }>;
  readonly games: readonly [
    Readonly<FormalPairedAbV2GameTranscript>,
    Readonly<FormalPairedAbV2GameTranscript>,
  ];
  readonly summary: Readonly<{
    readonly candidate_wins: number;
    readonly draws: number;
    readonly candidate_losses: number;
    readonly games: 2;
  }>;
  readonly cleanup: Readonly<{
    readonly candidate_closed_and_reaped: true;
    readonly stable_closed_and_reaped: true;
    readonly assets_revalidated_after_games: true;
    readonly cleanup_receipt_sha256: string;
  }>;
  readonly safety: Readonly<{
    readonly local_only: true;
    readonly network: false;
    readonly cloud: false;
    readonly aws: false;
    readonly live_weight_write: false;
  }>;
  readonly receipt_sha256: string;
}

interface FileSnapshot {
  readonly absolutePath: string;
  readonly identity: Readonly<FormalPairedAbV2ArtifactIdentity>;
  readonly device: bigint;
  readonly inode: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

interface AuthenticatedState {
  readonly repoRoot: string;
  readonly request: Readonly<FormalPairedAbV2PairRequest>;
  readonly candidate: Readonly<FileSnapshot>;
  readonly stable: Readonly<FileSnapshot>;
}

export interface AuthenticatedFormalPairedAbV2Pair {
  readonly kind: "authenticated-formal-paired-ab-v2-pair-capability";
}

const AUTHENTICATED = new WeakMap<
  AuthenticatedFormalPairedAbV2Pair,
  Readonly<AuthenticatedState>
>();

export class FormalPairedAbV2WasmMatchError extends Error {
  readonly phase:
    | "capture"
    | "authentication"
    | "initialization"
    | "game"
    | "cleanup"
    | "postvalidation";
  readonly receipt_issued = false;
  readonly partial_result_publishable = false;

  constructor(
    phase: FormalPairedAbV2WasmMatchError["phase"],
    message: string,
    cause?: unknown,
  ) {
    super(`Formal paired A/B v2 WASM match failed: ${message}`, { cause });
    this.name = "FormalPairedAbV2WasmMatchError";
    this.phase = phase;
  }
}

function fail(message: string): never {
  throw new Error(message);
}

function canonicalJson(value: unknown): string {
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
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  fail(`canonical JSON rejects ${typeof value}`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestCanonical(domain: string, value: unknown): string {
  return sha256(`${domain}${canonicalJson(value)}`);
}

function semanticId(domain: string, value: unknown): string {
  return `sha256:${sha256(`${domain}\0${canonicalJson(value)}`)}`;
}

function exactRecord(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    fail(`${label} fields differ`);
  }
  return record;
}

function captureIdentity(
  value: unknown,
  label: string,
): Readonly<FormalPairedAbV2ArtifactIdentity> {
  const identity = exactRecord(value, ["bytes", "path", "sha256"], label);
  if (
    typeof identity.path !== "string" ||
    identity.path === "" ||
    identity.path.includes("\0") ||
    identity.path.includes("\\") ||
    isAbsolute(identity.path) ||
    identity.path
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") ||
    identity.bytes !== FORMAL_PAIRED_AB_V2_NNUE_BYTES ||
    typeof identity.sha256 !== "string" ||
    !SHA256_RE.test(identity.sha256)
  ) {
    fail(`${label} is invalid`);
  }
  return Object.freeze({
    path: identity.path,
    bytes: identity.bytes,
    sha256: identity.sha256,
  }) as Readonly<FormalPairedAbV2ArtifactIdentity>;
}

function capturePairRequest(
  value: FormalPairedAbV2PairRequest,
): Readonly<FormalPairedAbV2PairRequest> {
  const request = exactRecord(
    value,
    [
      "candidate_weights",
      "games",
      "match_binding_sha256",
      "opening",
      "opening_id",
      "pair_index",
      "schema",
      "seed",
      "stable_weights",
    ],
    "pair request",
  );
  if (
    request.schema !== FORMAL_PAIRED_AB_V2_WASM_PAIR_REQUEST_SCHEMA ||
    !Number.isSafeInteger(request.pair_index) ||
    (request.pair_index as number) < 0 ||
    (request.pair_index as number) >= FORMAL_PAIRED_AB_V2_PAIR_COUNT ||
    !Number.isSafeInteger(request.seed) ||
    (request.seed as number) < 1 ||
    (request.seed as number) > Number.MAX_SAFE_INTEGER ||
    typeof request.opening_id !== "string" ||
    !SEMANTIC_ID_RE.test(request.opening_id) ||
    typeof request.match_binding_sha256 !== "string" ||
    !SHA256_RE.test(request.match_binding_sha256)
  ) {
    fail("pair request header is invalid");
  }
  const openingValue = exactRecord(
    request.opening,
    ["sfen", "usi_moves"],
    "pair request opening",
  );
  if (
    typeof openingValue.sfen !== "string" ||
    openingValue.sfen.trim() !== openingValue.sfen ||
    !Array.isArray(openingValue.usi_moves) ||
    openingValue.usi_moves.some(
      (move) => typeof move !== "string" || !USI_RE.test(move),
    )
  ) {
    fail("pair request opening is invalid");
  }
  // Parsing and applying every registered opening move proves that the game
  // starts from a real browser-rules position, not merely well-formed text.
  let openingSfen = openingValue.sfen;
  positionFromSfen(openingSfen);
  for (const move of openingValue.usi_moves as string[]) {
    openingSfen = childSfenAfterUsi(openingSfen, move);
  }
  const opening = Object.freeze({
    sfen: openingValue.sfen,
    usi_moves: Object.freeze([...(openingValue.usi_moves as string[])]),
  });
  if (
    request.opening_id !== semanticId("shogi-formal-ab-v2-opening-v1", opening)
  ) {
    fail("opening ID does not bind the exact SFEN+USI opening");
  }
  if (!Array.isArray(request.games) || request.games.length !== 2) {
    fail("pair request requires exactly two games");
  }
  const games = request.games.map((gameValue, gameIndex) => {
    const game = exactRecord(
      gameValue,
      ["candidate_color", "game_id", "game_index"],
      `pair request game ${gameIndex}`,
    );
    const candidateColor = gameIndex === 0 ? "sente" : "gote";
    if (
      game.game_index !== gameIndex ||
      game.candidate_color !== candidateColor ||
      typeof game.game_id !== "string" ||
      !SEMANTIC_ID_RE.test(game.game_id) ||
      game.game_id !==
        semanticId("shogi-formal-ab-v2-game-v1", {
          candidate_color: candidateColor,
          game_index: gameIndex,
          opening_id: request.opening_id,
          pair_index: request.pair_index,
        })
    ) {
      fail(
        `pair request game ${gameIndex} does not bind its color-swapped plan`,
      );
    }
    return Object.freeze({
      game_index: gameIndex as 0 | 1,
      game_id: game.game_id as string,
      candidate_color: candidateColor,
    });
  });
  const candidate = captureIdentity(
    request.candidate_weights,
    "candidate weights",
  );
  const stable = captureIdentity(request.stable_weights, "stable weights");
  if (candidate.sha256 === stable.sha256 || candidate.path === stable.path) {
    fail("candidate and stable weights must be distinct");
  }
  return Object.freeze({
    schema: FORMAL_PAIRED_AB_V2_WASM_PAIR_REQUEST_SCHEMA,
    pair_index: request.pair_index as number,
    opening_id: request.opening_id as string,
    opening,
    seed: request.seed as number,
    games: Object.freeze(games) as FormalPairedAbV2PairRequest["games"],
    candidate_weights: candidate,
    stable_weights: stable,
    match_binding_sha256: request.match_binding_sha256 as string,
  });
}

function readSnapshot(
  repoRoot: string,
  identity: Readonly<FormalPairedAbV2ArtifactIdentity>,
  label: string,
): Readonly<FileSnapshot> {
  const absolutePath = resolve(repoRoot, ...identity.path.split("/"));
  if (
    absolutePath !== repoRoot &&
    !absolutePath.startsWith(`${repoRoot}${sep}`)
  ) {
    fail(`${label} escapes repository root`);
  }
  if (realpathSync(absolutePath) !== absolutePath) {
    fail(`${label} path contains a symbolic-link alias`);
  }
  const descriptor = openSync(
    absolutePath,
    fsConstants.O_RDONLY |
      (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0),
  );
  try {
    const stat = fstatSync(descriptor, { bigint: true });
    if (
      !stat.isFile() ||
      stat.nlink !== 1n ||
      (process.geteuid !== undefined &&
        stat.uid !== BigInt(process.geteuid())) ||
      stat.size !== BigInt(identity.bytes)
    ) {
      fail(`${label} is not one current-user-owned enrolled regular file`);
    }
    const bytes = readFileSync(descriptor);
    try {
      if (
        bytes.byteLength !== identity.bytes ||
        sha256(bytes) !== identity.sha256
      ) {
        fail(`${label} content identity differs`);
      }
    } finally {
      bytes.fill(0);
    }
    return Object.freeze({
      absolutePath,
      identity,
      device: stat.dev,
      inode: stat.ino,
      size: stat.size,
      mtimeNs: stat.mtimeNs,
      ctimeNs: stat.ctimeNs,
    });
  } finally {
    closeSync(descriptor);
  }
}

function revalidateSnapshot(
  snapshot: Readonly<FileSnapshot>,
  label: string,
): void {
  if (realpathSync(snapshot.absolutePath) !== snapshot.absolutePath) {
    fail(`${label} path became a symbolic-link alias during the match`);
  }
  const descriptor = openSync(
    snapshot.absolutePath,
    fsConstants.O_RDONLY |
      (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0),
  );
  try {
    const stat = fstatSync(descriptor, { bigint: true });
    if (
      !stat.isFile() ||
      stat.nlink !== 1n ||
      stat.dev !== snapshot.device ||
      stat.ino !== snapshot.inode ||
      stat.size !== snapshot.size ||
      stat.mtimeNs !== snapshot.mtimeNs ||
      stat.ctimeNs !== snapshot.ctimeNs
    ) {
      fail(`${label} file identity drifted during the match`);
    }
    const bytes = readFileSync(descriptor);
    try {
      if (
        bytes.byteLength !== snapshot.identity.bytes ||
        sha256(bytes) !== snapshot.identity.sha256
      ) {
        fail(`${label} content drifted during the match`);
      }
    } finally {
      bytes.fill(0);
    }
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Capture an exact registry-issued request and its two files as an unforgeable
 * capability. Arbitrary plain objects are not accepted by the executor.
 */
export function authenticateFormalPairedAbV2WasmPair(
  repoRootValue: string,
  requestValue: FormalPairedAbV2PairRequest,
): Readonly<AuthenticatedFormalPairedAbV2Pair> {
  if (arguments.length !== 2) {
    throw new FormalPairedAbV2WasmMatchError(
      "capture",
      "authentication accepts exactly repository root and pair request",
    );
  }
  try {
    if (
      typeof repoRootValue !== "string" ||
      repoRootValue.length === 0 ||
      repoRootValue.includes("\0")
    ) {
      fail("repository root is invalid");
    }
    const repoRoot = realpathSync(resolve(repoRootValue));
    const request = capturePairRequest(requestValue);
    const candidate = readSnapshot(
      repoRoot,
      request.candidate_weights,
      "candidate weights",
    );
    const stable = readSnapshot(
      repoRoot,
      request.stable_weights,
      "stable weights",
    );
    const capability = Object.freeze({
      kind: "authenticated-formal-paired-ab-v2-pair-capability" as const,
    });
    AUTHENTICATED.set(
      capability,
      Object.freeze({ repoRoot, request, candidate, stable }),
    );
    return capability;
  } catch (cause) {
    throw new FormalPairedAbV2WasmMatchError(
      "authentication",
      cause instanceof Error ? cause.message : "asset authentication failed",
      cause,
    );
  }
}

interface PendingIpc {
  readonly requestId: string;
  readonly resolve: (value: Record<string, unknown>) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface CloseEventSource {
  once(event: "close", listener: () => void): unknown;
  removeListener(event: "close", listener: () => void): unknown;
}

function waitForChildClose(
  child: CloseEventSource,
  isClosed: () => boolean,
  markClosed: () => void,
  timeoutMs: number,
  timeoutMessage: string,
  onTimeout?: () => void,
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      child.removeListener("close", onClose);
    };
    const onClose = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      markClosed();
      resolvePromise();
    };
    child.once("close", onClose);
    // Listener-first plus recheck covers both an already-observed close and a
    // close delivered synchronously by a test/future event source.
    if (isClosed()) {
      onClose();
      return;
    }
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        onTimeout?.();
      } catch (error) {
        rejectPromise(
          error instanceof Error
            ? error
            : new Error("child timeout cleanup failed"),
        );
        return;
      }
      rejectPromise(new Error(timeoutMessage));
    }, timeoutMs);
  });
}

/** Test seam for the listener-first/recheck close-wait primitive. */
export function waitForFormalPairedAbV2ChildCloseCoreForTests(
  child: CloseEventSource,
  isClosed: () => boolean,
  timeoutMs: number,
): Promise<void> {
  return waitForChildClose(
    child,
    isClosed,
    () => undefined,
    timeoutMs,
    "test child did not close",
  );
}

class IsolatedWasmPlayer implements FormalPairedAbV2Player {
  readonly binding: FormalPairedAbV2Player["binding"];
  private readonly child: ChildProcess;
  private pending: PendingIpc | undefined;
  private closed = false;
  private stopPromise: Promise<void> | undefined;
  private gracefulClosePromise: Promise<void> | undefined;
  private stderr = "";
  private requestSequence = 0;

  private constructor(
    child: ChildProcess,
    role: FormalPairedAbV2Role,
    weightsSha256: string,
  ) {
    this.child = child;
    this.binding = Object.freeze({
      schema: FORMAL_PAIRED_AB_V2_WASM_PLAYER_SCHEMA,
      role,
      weights_sha256: weightsSha256,
      isolated_process: true as const,
      fixed_depth: FORMAL_PAIRED_AB_V2_SEARCH_DEPTH,
      quiescence_depth: FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH,
      reset_before_every_move: true as const,
      book: false as const,
      network: false as const,
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (this.stderr.length < 8_192) {
        this.stderr += chunk
          .toString("utf8")
          .slice(0, 8_192 - this.stderr.length);
      }
    });
    child.on("message", (value) => this.onMessage(value));
    child.on("error", () => this.failPending("child process error"));
    child.on("close", (code, signal) => {
      this.closed = true;
      if (this.pending !== undefined) {
        this.failPending(
          `child exited before its response (code=${String(code)}, signal=${String(signal)})`,
        );
      }
    });
  }

  static async create(
    repoRoot: string,
    role: FormalPairedAbV2Role,
    snapshot: Readonly<FileSnapshot>,
  ): Promise<IsolatedWasmPlayer> {
    const child = fork(CHILD_PATH, [], {
      cwd: repoRoot,
      env: Object.freeze({}),
      execArgv: ["-r", TSX_CJS_PATH],
      serialization: "advanced",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    const player = new IsolatedWasmPlayer(
      child,
      role,
      snapshot.identity.sha256,
    );
    try {
      const response = await player.request(
        {
          schema: FORMAL_PAIRED_AB_V2_WASM_IPC_SCHEMA,
          type: "init",
          request_id: player.nextRequestId("init"),
          role,
          weights_path: snapshot.absolutePath,
          weights_bytes: snapshot.identity.bytes,
          weights_sha256: snapshot.identity.sha256,
          nnue_scale_k: FORMAL_PAIRED_AB_V2_NNUE_SCALE_K,
          search_depth: FORMAL_PAIRED_AB_V2_SEARCH_DEPTH,
          quiescence_depth: FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH,
        },
        FORMAL_PAIRED_AB_V2_STARTUP_TIMEOUT_MS,
      );
      if (
        response.schema !== FORMAL_PAIRED_AB_V2_WASM_IPC_SCHEMA ||
        response.type !== "ready" ||
        response.role !== role ||
        response.weights_sha256 !== snapshot.identity.sha256 ||
        response.weights_bytes !== snapshot.identity.bytes ||
        response.wasm_bytes !== FORMAL_PAIRED_AB_V2_WASM_BYTES ||
        response.wasm_sha256 !== FORMAL_PAIRED_AB_V2_WASM_SHA256 ||
        response.nnue_scale_k !== FORMAL_PAIRED_AB_V2_NNUE_SCALE_K ||
        response.search_depth !== FORMAL_PAIRED_AB_V2_SEARCH_DEPTH ||
        response.quiescence_depth !== FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH ||
        response.isolated_process !== true
      ) {
        fail(
          "isolated player ready receipt does not bind its enrolled runtime",
        );
      }
      return player;
    } catch (error) {
      await player.abortAndReap();
      throw error;
    }
  }

  private nextRequestId(kind: string): string {
    this.requestSequence += 1;
    return `${this.binding.role}-${kind}-${this.requestSequence}`;
  }

  private failPending(message: string): void {
    const pending = this.pending;
    this.pending = undefined;
    if (pending !== undefined) {
      clearTimeout(pending.timer);
      pending.reject(
        new Error(
          `${message}${this.stderr === "" ? "" : `; stderr=${this.stderr}`}`,
        ),
      );
    }
  }

  private onMessage(value: unknown): void {
    const pending = this.pending;
    if (
      pending === undefined ||
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      this.failPending("unexpected IPC response");
      void this.abortAndReap();
      return;
    }
    const response = value as Record<string, unknown>;
    if (response.request_id !== pending.requestId) {
      this.failPending("IPC response request identity differs");
      void this.abortAndReap();
      return;
    }
    this.pending = undefined;
    clearTimeout(pending.timer);
    if (response.type === "fault") {
      pending.reject(
        new Error(
          typeof response.message === "string"
            ? response.message
            : "isolated player fault",
        ),
      );
      return;
    }
    pending.resolve(response);
  }

  private request(
    message: Readonly<Record<string, unknown>>,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    if (this.pending !== undefined || this.closed || !this.child.connected) {
      return Promise.reject(new Error("isolated player is not available"));
    }
    const requestId = message.request_id;
    if (typeof requestId !== "string") {
      return Promise.reject(new Error("IPC request identity is missing"));
    }
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.failPending(`isolated player timed out after ${timeoutMs}ms`);
        void this.abortAndReap();
      }, timeoutMs);
      this.pending = {
        requestId,
        resolve: resolvePromise,
        reject: rejectPromise,
        timer,
      };
      this.child.send(message, (error) => {
        if (error !== null) {
          this.failPending("isolated player IPC send failed");
          void this.abortAndReap();
        }
      });
    });
  }

  readonly chooseMove = async (
    input: Readonly<FormalPairedAbV2MoveInput>,
  ): Promise<Readonly<FormalPairedAbV2MoveDecision>> => {
    const requestId = this.nextRequestId("search");
    const requestBody = Object.freeze({
      game_id: input.game_id,
      opening_id: input.opening_id,
      candidate_color: input.candidate_color,
      ply: input.ply,
      sfen: input.sfen,
      legal_moves: input.legal_moves,
      role: this.binding.role,
      weights_sha256: this.binding.weights_sha256,
    });
    const requestSha256 = digestCanonical(SEARCH_DIGEST_DOMAIN, requestBody);
    const response = await this.request(
      {
        schema: FORMAL_PAIRED_AB_V2_WASM_IPC_SCHEMA,
        type: "search",
        request_id: requestId,
        request_sha256: requestSha256,
        sfen: input.sfen,
        ply: input.ply,
        legal_moves: input.legal_moves,
      },
      FORMAL_PAIRED_AB_V2_SEARCH_TIMEOUT_MS,
    );
    if (
      response.schema !== FORMAL_PAIRED_AB_V2_WASM_IPC_SCHEMA ||
      response.type !== "result" ||
      response.request_sha256 !== requestSha256 ||
      response.role !== this.binding.role ||
      response.weights_sha256 !== this.binding.weights_sha256 ||
      typeof response.usi !== "string" ||
      !input.legal_moves.includes(response.usi) ||
      response.search_depth !== FORMAL_PAIRED_AB_V2_SEARCH_DEPTH ||
      response.quiescence_depth !== FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH ||
      response.reset_before_move !== true ||
      response.book !== false
    ) {
      throw new Error("isolated player search receipt is invalid");
    }
    return Object.freeze({
      usi: response.usi,
      search_receipt_sha256: digestCanonical(
        SEARCH_RECEIPT_DIGEST_DOMAIN,
        response,
      ),
    });
  };

  readonly abortAndReap = (): Promise<void> => {
    if (this.stopPromise !== undefined) return this.stopPromise;
    this.stopPromise = (async () => {
      const reaped = waitForChildClose(
        this.child,
        () => this.closed,
        () => {
          this.closed = true;
        },
        FORMAL_PAIRED_AB_V2_CLEANUP_TIMEOUT_MS,
        "isolated player did not reap after forced termination",
        () => {
          this.child.kill("SIGKILL");
        },
      );
      if (!this.closed) this.child.kill("SIGKILL");
      await reaped;
    })();
    return this.stopPromise;
  };

  readonly close = (): Promise<void> => {
    if (this.gracefulClosePromise !== undefined) {
      return this.gracefulClosePromise;
    }
    if (this.stopPromise !== undefined) return this.stopPromise;
    this.gracefulClosePromise = (async () => {
      try {
        if (this.closed) return;
        const requestId = this.nextRequestId("quit");
        const response = await this.request(
          {
            schema: FORMAL_PAIRED_AB_V2_WASM_IPC_SCHEMA,
            type: "quit",
            request_id: requestId,
          },
          FORMAL_PAIRED_AB_V2_CLEANUP_TIMEOUT_MS,
        );
        if (
          response.schema !== FORMAL_PAIRED_AB_V2_WASM_IPC_SCHEMA ||
          response.type !== "bye" ||
          response.role !== this.binding.role ||
          response.weights_sha256 !== this.binding.weights_sha256 ||
          response.process_reap_required !== true
        ) {
          throw new Error("isolated player cleanup receipt is invalid");
        }
        await waitForChildClose(
          this.child,
          () => this.closed,
          () => {
            this.closed = true;
          },
          FORMAL_PAIRED_AB_V2_CLEANUP_TIMEOUT_MS,
          "isolated player did not reap after quit",
        );
        this.stopPromise = Promise.resolve();
      } catch (primary) {
        try {
          await this.abortAndReap();
        } catch (cleanupFailure) {
          throw new AggregateError(
            [primary, cleanupFailure],
            "graceful player close and forced reap both failed",
          );
        }
        throw primary;
      }
    })();
    return this.gracefulClosePromise;
  };
}

function colorFromTeban(teban: number): FormalPairedAbV2Color {
  if (teban === SENTE) return "sente";
  if (teban === GOTE) return "gote";
  fail("position has invalid side to move");
}

function otherColor(color: FormalPairedAbV2Color): FormalPairedAbV2Color {
  return color === "sente" ? "gote" : "sente";
}

function positionKey(sfen: string): string {
  return sfen.split(" ").slice(0, 3).join(" ");
}

function resultForCandidate(
  candidateColor: FormalPairedAbV2Color,
  winner?: FormalPairedAbV2Color,
): FormalPairedAbV2GameResult {
  if (winner === undefined) return "draw";
  return winner === candidateColor ? "win" : "loss";
}

interface MoveTrace {
  readonly mover: FormalPairedAbV2Color;
  readonly gaveCheck: boolean;
}

function repetitionOutcome(
  occurrences: readonly number[],
  traces: readonly Readonly<MoveTrace>[],
): Readonly<{
  readonly termination: "fourfold-repetition" | "perpetual-check";
  readonly loser?: FormalPairedAbV2Color;
}> | null {
  if (occurrences.length < 4) return null;
  const start = occurrences[occurrences.length - 4];
  const end = occurrences[occurrences.length - 1];
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

function openingPosition(
  request: Readonly<FormalPairedAbV2PairRequest>,
): string {
  let sfen = request.opening.sfen;
  for (const usi of request.opening.usi_moves) {
    sfen = childSfenAfterUsi(sfen, usi);
  }
  return sfen;
}

async function playGame(
  request: Readonly<FormalPairedAbV2PairRequest>,
  game: FormalPairedAbV2PairRequest["games"][number],
  candidate: FormalPairedAbV2Player,
  stable: FormalPairedAbV2Player,
): Promise<Readonly<FormalPairedAbV2GameTranscript>> {
  let sfen = openingPosition(request);
  const moves: string[] = [];
  const moveReceiptSha256s: string[] = [];
  const traces: MoveTrace[] = [];
  const occurrences = new Map<string, number[]>();
  occurrences.set(positionKey(sfen), [0]);
  let termination: FormalPairedAbV2Termination = "max-plies";
  let winner: FormalPairedAbV2Color | undefined;

  for (
    let localPly = 0;
    localPly < FORMAL_PAIRED_AB_V2_MAX_PLIES;
    localPly += 1
  ) {
    const parsed = positionFromSfen(sfen);
    const mover = colorFromTeban(parsed.position.teban);
    const legal = rulesCompleteLegalMoves(parsed.position);
    if (legal.some((entry) => getKomashu(entry.move.capture) === OU)) {
      fail("legal move set attempts to capture the opposing king");
    }
    if (legal.length === 0) {
      termination = "no-legal-moves";
      winner = otherColor(mover);
      break;
    }
    const legalMoves = Object.freeze(legal.map((entry) => entry.usi));
    const player = mover === game.candidate_color ? candidate : stable;
    const decision = await player.chooseMove(
      Object.freeze({
        game_id: game.game_id,
        opening_id: request.opening_id,
        candidate_color: game.candidate_color,
        ply: parsed.moveNumber - 1,
        sfen,
        legal_moves: legalMoves,
      }),
    );
    if (
      typeof decision.usi !== "string" ||
      !legalMoves.includes(decision.usi) ||
      typeof decision.search_receipt_sha256 !== "string" ||
      !SHA256_RE.test(decision.search_receipt_sha256)
    ) {
      fail(`${player.binding.role} returned an illegal or unbound move`);
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
      fail("child legal move set attempts to capture the opposing king");
    }
    if (childLegal.length === 0) {
      termination = "no-legal-moves";
      winner = mover;
      break;
    }
    const key = positionKey(sfen);
    const seen = occurrences.get(key) ?? [];
    seen.push(moves.length);
    occurrences.set(key, seen);
    const repetition = repetitionOutcome(seen, traces);
    if (repetition !== null) {
      termination = repetition.termination;
      winner =
        repetition.loser === undefined
          ? undefined
          : otherColor(repetition.loser);
      break;
    }
  }

  const result = resultForCandidate(game.candidate_color, winner);
  const transcriptBody = Object.freeze({
    game_index: game.game_index,
    game_id: game.game_id,
    candidate_color: game.candidate_color,
    result,
    termination,
    plies: moves.length,
    moves: Object.freeze([...moves]),
    move_receipt_sha256s: Object.freeze([...moveReceiptSha256s]),
    final_sfen: sfen,
  });
  return Object.freeze({
    ...transcriptBody,
    transcript_sha256: digestCanonical(
      TRANSCRIPT_DIGEST_DOMAIN,
      transcriptBody,
    ),
    launcher_receipt: Object.freeze({
      schema: FORMAL_PAIRED_AB_V2_WASM_GAME_RECEIPT_SCHEMA,
      pair_index: request.pair_index,
      opening_id: request.opening_id,
      game_index: game.game_index,
      game_id: game.game_id,
      candidate_color: game.candidate_color,
      seed: request.seed,
      candidate_weights_sha256: request.candidate_weights.sha256,
      stable_weights_sha256: request.stable_weights.sha256,
      match_binding_sha256: request.match_binding_sha256,
      result,
      technical_fault: false as const,
    }),
  });
}

function capturePlayer(
  player: FormalPairedAbV2Player,
  role: FormalPairedAbV2Role,
  expectedSha256: string,
): FormalPairedAbV2Player {
  if (
    player === null ||
    typeof player !== "object" ||
    player.binding.schema !== FORMAL_PAIRED_AB_V2_WASM_PLAYER_SCHEMA ||
    player.binding.role !== role ||
    player.binding.weights_sha256 !== expectedSha256 ||
    player.binding.isolated_process !== true ||
    player.binding.fixed_depth !== FORMAL_PAIRED_AB_V2_SEARCH_DEPTH ||
    player.binding.quiescence_depth !== FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH ||
    player.binding.reset_before_every_move !== true ||
    player.binding.book !== false ||
    player.binding.network !== false ||
    typeof player.chooseMove !== "function" ||
    typeof player.abortAndReap !== "function" ||
    typeof player.close !== "function"
  ) {
    fail(`${role} player binding differs from the registered search contract`);
  }
  return player;
}

async function settlePlayers(
  players: readonly FormalPairedAbV2Player[],
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
    throw new AggregateError(failures, `${method} failed`);
  }
}

async function runInternal(
  request: Readonly<FormalPairedAbV2PairRequest>,
  dependencies: Readonly<FormalPairedAbV2CoreDependencies>,
  executionBoundary: FormalPairedAbV2PairReceipt["execution_boundary"],
): Promise<Readonly<FormalPairedAbV2PairReceipt>> {
  let players:
    | readonly [FormalPairedAbV2Player, FormalPairedAbV2Player]
    | undefined;
  let operationFailure: unknown;
  let cleanupComplete = false;
  try {
    const settled = await Promise.allSettled([
      dependencies.createPlayer("candidate", request.candidate_weights),
      dependencies.createPlayer("stable", request.stable_weights),
    ]);
    const created = settled
      .filter(
        (result): result is PromiseFulfilledResult<FormalPairedAbV2Player> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);
    const failures = settled
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      )
      .map((result) => result.reason);
    if (failures.length > 0) {
      await settlePlayers(created, "abortAndReap");
      throw new FormalPairedAbV2WasmMatchError(
        "initialization",
        "one or both isolated players failed to initialize",
        new AggregateError(failures),
      );
    }
    const candidateResult = settled[0];
    const stableResult = settled[1];
    if (
      candidateResult.status !== "fulfilled" ||
      stableResult.status !== "fulfilled"
    ) {
      fail("player initialization results did not narrow");
    }
    try {
      players = Object.freeze([
        capturePlayer(
          candidateResult.value,
          "candidate",
          request.candidate_weights.sha256,
        ),
        capturePlayer(
          stableResult.value,
          "stable",
          request.stable_weights.sha256,
        ),
      ]);
    } catch (error) {
      await settlePlayers(created, "abortAndReap");
      throw error;
    }
    const [candidate, stable] = players;
    const games: FormalPairedAbV2GameTranscript[] = [];
    for (const game of request.games) {
      games.push(await playGame(request, game, candidate, stable));
    }
    await dependencies.afterGamesBeforeRevalidation?.();
    await settlePlayers(players, "close");
    cleanupComplete = true;
    await dependencies.revalidateAssets?.();
    const candidateWins = games.filter((game) => game.result === "win").length;
    const draws = games.filter((game) => game.result === "draw").length;
    const candidateLosses = games.length - candidateWins - draws;
    const cleanupBody = Object.freeze({
      candidate_closed_and_reaped: true as const,
      stable_closed_and_reaped: true as const,
      assets_revalidated_after_games: true as const,
      candidate_weights_sha256: request.candidate_weights.sha256,
      stable_weights_sha256: request.stable_weights.sha256,
      transcript_sha256s: Object.freeze(
        games.map((game) => game.transcript_sha256),
      ),
    });
    const cleanup = Object.freeze({
      candidate_closed_and_reaped: true as const,
      stable_closed_and_reaped: true as const,
      assets_revalidated_after_games: true as const,
      cleanup_receipt_sha256: digestCanonical(
        CLEANUP_DIGEST_DOMAIN,
        cleanupBody,
      ),
    });
    const body = Object.freeze({
      schema: FORMAL_PAIRED_AB_V2_WASM_PAIR_RECEIPT_SCHEMA,
      status: FORMAL_PAIRED_AB_V2_WASM_STATUS,
      execution_boundary: executionBoundary,
      request_sha256: digestCanonical(REQUEST_DIGEST_DOMAIN, request),
      pair_index: request.pair_index,
      opening_id: request.opening_id,
      seed: request.seed,
      candidate_weights_sha256: request.candidate_weights.sha256,
      stable_weights_sha256: request.stable_weights.sha256,
      match_binding_sha256: request.match_binding_sha256,
      search_contract: Object.freeze({
        engine: "production-browser-wasm-v20" as const,
        wasm_bytes: FORMAL_PAIRED_AB_V2_WASM_BYTES,
        wasm_sha256: FORMAL_PAIRED_AB_V2_WASM_SHA256,
        fixed_depth: FORMAL_PAIRED_AB_V2_SEARCH_DEPTH,
        quiescence_depth: FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH,
        nnue_scale_k: FORMAL_PAIRED_AB_V2_NNUE_SCALE_K,
        reset_before_every_move: true as const,
        book: false as const,
        fallback: "forbidden" as const,
      }),
      schedule: Object.freeze({
        pairs: 1 as const,
        games: 2 as const,
        games_per_pair: 2 as const,
        candidate_colors: Object.freeze(["sente", "gote"] as const),
      }),
      games: Object.freeze(games) as FormalPairedAbV2PairReceipt["games"],
      summary: Object.freeze({
        candidate_wins: candidateWins,
        draws,
        candidate_losses: candidateLosses,
        games: 2 as const,
      }),
      cleanup,
      safety: Object.freeze({
        local_only: true as const,
        network: false as const,
        cloud: false as const,
        aws: false as const,
        live_weight_write: false as const,
      }),
    });
    return Object.freeze({
      ...body,
      receipt_sha256: digestCanonical(RECEIPT_DIGEST_DOMAIN, body),
    });
  } catch (error) {
    operationFailure = error;
    throw error instanceof FormalPairedAbV2WasmMatchError
      ? error
      : new FormalPairedAbV2WasmMatchError(
          cleanupComplete ? "postvalidation" : "game",
          error instanceof Error ? error.message : "pair execution failed",
          error,
        );
  } finally {
    if (players !== undefined && !cleanupComplete) {
      try {
        await settlePlayers(players, "abortAndReap");
      } catch (cleanupFailure) {
        throw new FormalPairedAbV2WasmMatchError(
          "cleanup",
          "pair execution and forced cleanup did not both close",
          new AggregateError([operationFailure, cleanupFailure]),
        );
      }
    }
  }
}

/** Test-only player seam; it cannot authenticate files or claim production. */
export function runFormalPairedAbV2WasmPairCoreForTests(
  requestValue: FormalPairedAbV2PairRequest,
  dependencies: FormalPairedAbV2CoreDependencies,
): Promise<Readonly<FormalPairedAbV2PairReceipt>> {
  let request: Readonly<FormalPairedAbV2PairRequest>;
  try {
    request = capturePairRequest(requestValue);
    if (
      dependencies === null ||
      typeof dependencies !== "object" ||
      typeof dependencies.createPlayer !== "function"
    ) {
      fail("test player dependency is invalid");
    }
  } catch (error) {
    return Promise.reject(
      new FormalPairedAbV2WasmMatchError(
        "capture",
        error instanceof Error ? error.message : "request capture failed",
        error,
      ),
    );
  }
  return runInternal(request, dependencies, "test-only-injected-players");
}

/**
 * Execute one authenticated pair. Plain objects and caller-selected asset
 * paths are rejected; only the exact capability returned by the authenticator
 * reaches child-process creation.
 */
export function runAuthenticatedFormalPairedAbV2WasmPair(
  capability: Readonly<AuthenticatedFormalPairedAbV2Pair>,
): Promise<Readonly<FormalPairedAbV2PairReceipt>> {
  if (arguments.length !== 1) {
    return Promise.reject(
      new FormalPairedAbV2WasmMatchError(
        "capture",
        "executor accepts exactly one authenticated pair capability",
      ),
    );
  }
  const state = AUTHENTICATED.get(capability);
  if (state === undefined) {
    return Promise.reject(
      new FormalPairedAbV2WasmMatchError(
        "authentication",
        "plain or foreign pair value has no execution authority",
      ),
    );
  }
  // Consume before process creation. A failed or completed pair must be
  // reauthenticated from the exact files instead of replaying old authority.
  AUTHENTICATED.delete(capability);
  return runInternal(
    state.request,
    Object.freeze({
      createPlayer: (role, _identity) =>
        IsolatedWasmPlayer.create(
          state.repoRoot,
          role,
          role === "candidate" ? state.candidate : state.stable,
        ),
      revalidateAssets: () => {
        revalidateSnapshot(state.candidate, "candidate weights");
        revalidateSnapshot(state.stable, "stable weights");
      },
    }),
    "authenticated-content-addressed-local-assets",
  );
}

/** Exact accounting guard shared by the Python launcher integration/tests. */
export function validateFormalPairedAbV2ExactAccounting(
  pairs: number,
  games: number,
  pairWorkers: number,
): void {
  if (
    pairs !== FORMAL_PAIRED_AB_V2_PAIR_COUNT ||
    games !== FORMAL_PAIRED_AB_V2_GAME_COUNT ||
    games !== pairs * FORMAL_PAIRED_AB_V2_GAMES_PER_PAIR ||
    !Number.isSafeInteger(pairWorkers) ||
    pairWorkers < 1 ||
    pairWorkers > FORMAL_PAIRED_AB_V2_MAX_PAIR_WORKERS
  ) {
    throw new FormalPairedAbV2WasmMatchError(
      "capture",
      "formal schedule must be exactly 384 pairs/768 games with at most two pair workers",
    );
  }
}
