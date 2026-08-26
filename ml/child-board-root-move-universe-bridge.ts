#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

import {
  positionFromSfen,
  rulesCompleteLegalMoves,
  teToUsi,
} from "./shogi-sfen";
import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import { GHI, SFU } from "../src/components/game/ShogiImproved/types";
import { ACTIVE_HALFKP81_PRODUCTION_WASM_PATH } from "../wasm-spike/search-driver";

export const REQUEST_SCHEMA = "shogi-production-root-move-universe-request-v2";
// v3: the root move universe is read from fillRootMoveBuffer() instead of from
// a transposition-table shortcut, so the second_search_* evidence fields (which
// described that shortcut) are replaced by root_move_fill.
export const RESPONSE_SCHEMA =
  "shogi-production-root-move-universe-response-v3";
export const ERROR_SCHEMA = "shogi-production-root-move-universe-error-v1";
export const PINNED_WASM_BYTES = 39_433;
export const PINNED_WASM_SHA256 =
  "b43f13951ae1175499ff4577023bc44b44fb8972089d5cd9c939c7b26f1f5b2f";
export const PINNED_ROOT_MOVE_BUFFER_OFFSET = 7_128_112;
export const MAX_ROOT_MOVES = 640;

interface RootMembershipWasm {
  readonly memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  countLegalMoves(): number;
  fillRootMoveBuffer(): number;
  searchBestMove(
    maxTimeMs: number,
    maxDepth: number,
    quiescenceDepthMax: number,
  ): number;
  getHashVal(): number;
  getSecondaryHashVal(): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
}

export interface RootMoveUniverseRequest {
  readonly schema: typeof REQUEST_SCHEMA;
  readonly sequence: number;
  readonly domain: "browser" | "v9";
  readonly parent_id: string;
  readonly parent_sfen: string;
}

export interface RootMoveUniverseResponse {
  readonly schema: typeof RESPONSE_SCHEMA;
  readonly sequence: number;
  readonly domain: "browser" | "v9";
  readonly parent_id: string;
  readonly parent_sfen: string;
  readonly rules_complete_usi: readonly string[];
  readonly js_usi: readonly string[];
  readonly wasm_usi: readonly string[];
  readonly node: {
    readonly exec_path: string;
    readonly version: string;
  };
  readonly wasm: {
    readonly bytes: typeof PINNED_WASM_BYTES;
    readonly sha256: typeof PINNED_WASM_SHA256;
    readonly root_move_buffer_offset: typeof PINNED_ROOT_MOVE_BUFFER_OFFSET;
    readonly legal_moves: number;
    /** Moves fillRootMoveBuffer() wrote; must equal legal_moves. */
    readonly root_move_fill: number;
  };
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyPinnedWasmBytes(value: Uint8Array): void {
  if (
    value.byteLength !== PINNED_WASM_BYTES ||
    sha256(value) !== PINNED_WASM_SHA256
  ) {
    throw new Error("production root move bridge WASM identity mismatch");
  }
}

function instantiatePinnedWasm(value: Uint8Array): RootMembershipWasm {
  verifyPinnedWasmBytes(value);
  const module = new WebAssembly.Module(value);
  const instance = new WebAssembly.Instance(module, {
    env: {
      abort(_message: number, _file: number, line: number, column: number) {
        throw new Error(`production WASM abort at ${line}:${column}`);
      },
      now: () => performance.now(),
      sharedTtProbe: (_hashA: number, _hashB: number) => 0,
      sharedTtStore: (
        _hashA: number,
        _hashB: number,
        _value: number,
        _flagDepth: number,
        _best: number,
      ) => {},
      sharedShouldStop: () => 0,
    },
  });
  const wasm = instance.exports as unknown as RootMembershipWasm;
  const required = [
    "clearBoard",
    "setSquare",
    "setHand",
    "setSideToMove",
    "finalizePosition",
    "clearTT",
    "setRootTesu",
    "countLegalMoves",
    "fillRootMoveBuffer",
    "searchBestMove",
    "getHashVal",
    "getSecondaryHashVal",
    "getSearchDepth",
    "getSearchNodes",
    "getSearchLeaves",
  ] as const;
  for (const name of required) {
    if (typeof wasm[name] !== "function") {
      throw new Error(`production WASM export is absent: ${name}`);
    }
  }
  if (!(wasm.memory instanceof WebAssembly.Memory)) {
    throw new Error("production WASM memory export is absent");
  }
  if (
    PINNED_ROOT_MOVE_BUFFER_OFFSET < 0 ||
    PINNED_ROOT_MOVE_BUFFER_OFFSET + MAX_ROOT_MOVES * 4 >
      wasm.memory.buffer.byteLength
  ) {
    throw new Error("pinned root move buffer is outside WASM memory");
  }
  return wasm;
}

function syncWasm(wasm: RootMembershipWasm, position: KyokumenImproved): void {
  wasm.clearBoard();
  for (let file = 1; file <= 9; file++) {
    for (let rank = 1; rank <= 9; rank++) {
      const square = (file << 4) + rank;
      wasm.setSquare(square, position.ban[square]);
    }
  }
  for (let piece = SFU; piece <= GHI; piece++) {
    wasm.setHand(piece, position.hand[piece] | 0);
  }
  wasm.setSideToMove(position.teban);
  wasm.finalizePosition();
}

function bytewiseUsi(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function squareToUsi(square: number): string {
  const file = square >> 4;
  const rank = square & 0x0f;
  if (file < 1 || file > 9 || rank < 1 || rank > 9) {
    throw new Error(`invalid packed WASM square: ${square}`);
  }
  return `${file}${String.fromCharCode(96 + rank)}`;
}

const DROP_LETTER: Readonly<Record<number, string>> = Object.freeze({
  1: "P",
  2: "L",
  3: "N",
  4: "S",
  5: "G",
  6: "B",
  7: "R",
});

/**
 * Decode the engine's private moveBuf representation from the exact pinned
 * binary. This is deliberately not the public TT/search key representation.
 */
function internalMoveToUsi(value: number): string {
  const to = value & 0xff;
  const from = (value >>> 8) & 0xff;
  const piece = (value >>> 16) & 0x7f;
  const promote = ((value >>> 23) & 1) === 1;
  if (from === 0) {
    const letter = DROP_LETTER[piece & 0x0f];
    if (!letter || promote) {
      throw new Error("invalid packed WASM drop");
    }
    return `${letter}*${squareToUsi(to)}`;
  }
  return `${squareToUsi(from)}${squareToUsi(to)}${promote ? "+" : ""}`;
}

function validateRequest(value: unknown): RootMoveUniverseRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("root move bridge request must be one object");
  }
  const row = value as Record<string, unknown>;
  if (
    row.schema !== REQUEST_SCHEMA ||
    !Number.isSafeInteger(row.sequence) ||
    (row.sequence as number) < 0 ||
    (row.domain !== "browser" && row.domain !== "v9") ||
    typeof row.parent_id !== "string" ||
    row.parent_id.length === 0 ||
    !/^[\x20-\x7e]+$/u.test(row.parent_id) ||
    typeof row.parent_sfen !== "string"
  ) {
    throw new Error("root move bridge request schema mismatch");
  }
  return row as unknown as RootMoveUniverseRequest;
}

export class ProductionRootMoveUniverseBridge {
  private readonly wasm: RootMembershipWasm;

  constructor(
    wasmBytes: Uint8Array = readFileSync(ACTIVE_HALFKP81_PRODUCTION_WASM_PATH),
  ) {
    const [major, minor] = process.versions.node
      .split(".")
      .slice(0, 2)
      .map((value) => Number.parseInt(value, 10));
    if (
      !Number.isSafeInteger(major) ||
      !Number.isSafeInteger(minor) ||
      major < 20 ||
      (major === 20 && minor < 14) ||
      major >= 24
    ) {
      throw new Error(
        `root move bridge requires Node >=20.14.0 and <24, got ${process.versions.node}`,
      );
    }
    this.wasm = instantiatePinnedWasm(wasmBytes);
  }

  verify(value: unknown): RootMoveUniverseResponse {
    const request = validateRequest(value);
    const parsed = positionFromSfen(request.parent_sfen);
    const position = parsed.position;
    const rulesCompleteUsi = rulesCompleteLegalMoves(position).map(
      (entry) => entry.usi,
    );
    if (new Set(rulesCompleteUsi).size !== rulesCompleteUsi.length) {
      throw new Error("rules-complete generator returned duplicate USI");
    }
    const jsUsi = GenerateMovesImproved.generateLegalMoves(position)
      .map(teToUsi)
      .sort(bytewiseUsi);
    if (new Set(jsUsi).size !== jsUsi.length) {
      throw new Error("production JS generator returned duplicate USI");
    }

    this.wasm.clearTT();
    syncWasm(this.wasm, position);
    this.wasm.setRootTesu(parsed.moveNumber - 1);
    const primaryHash = this.wasm.getHashVal();
    const secondaryHash = this.wasm.getSecondaryHashVal();
    const legalMoves = this.wasm.countLegalMoves();
    if (
      !Number.isSafeInteger(legalMoves) ||
      legalMoves < 0 ||
      legalMoves > MAX_ROOT_MOVES
    ) {
      throw new Error("production WASM legal move count is invalid");
    }

    // Fill moveBuf with the engine's own root move universe.
    //
    // This used to be extracted by running searchBestMove twice and relying on
    // the second call hitting an EXACT transposition entry at the root, which
    // returned in a single node and so left moveBuf holding the root list. That
    // root cutoff has been removed (it also made real searches return a stale
    // move at a stale depth), so the buffer is now filled directly by the
    // engine's own root filter — the same code searchBestMove runs — instead of
    // through a side effect of a table hit.
    const filled = legalMoves === 0 ? 0 : this.wasm.fillRootMoveBuffer();
    if (filled !== legalMoves) {
      throw new Error(
        "production WASM root move buffer disagrees with countLegalMoves",
      );
    }

    if (
      this.wasm.getHashVal() !== primaryHash ||
      this.wasm.getSecondaryHashVal() !== secondaryHash
    ) {
      throw new Error("production WASM fill failed to restore the parent");
    }
    const packed =
      legalMoves === 0
        ? []
        : Array.from(
            new Uint32Array(
              this.wasm.memory.buffer,
              PINNED_ROOT_MOVE_BUFFER_OFFSET,
              legalMoves,
            ),
          );
    const wasmUsi = packed.map(internalMoveToUsi).sort(bytewiseUsi);
    if (
      new Set(wasmUsi).size !== wasmUsi.length ||
      wasmUsi.some(
        (move) =>
          !/^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/u.test(move),
      )
    ) {
      throw new Error(
        "production WASM root buffer is not unique canonical USI",
      );
    }
    return {
      schema: RESPONSE_SCHEMA,
      sequence: request.sequence,
      domain: request.domain,
      parent_id: request.parent_id,
      parent_sfen: request.parent_sfen,
      rules_complete_usi: rulesCompleteUsi,
      js_usi: jsUsi,
      wasm_usi: wasmUsi,
      node: {
        exec_path: process.execPath,
        version: process.versions.node,
      },
      wasm: {
        bytes: PINNED_WASM_BYTES,
        sha256: PINNED_WASM_SHA256,
        root_move_buffer_offset: PINNED_ROOT_MOVE_BUFFER_OFFSET,
        legal_moves: legalMoves,
        root_move_fill: filled,
      },
    };
  }
}

async function main(): Promise<void> {
  const bridge = new ProductionRootMoveUniverseBridge();
  const lines = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });
  for await (const line of lines) {
    try {
      if (line.length === 0) throw new Error("empty JSONL request");
      const request = JSON.parse(line) as unknown;
      process.stdout.write(`${JSON.stringify(bridge.verify(request))}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(
        `${JSON.stringify({ schema: ERROR_SCHEMA, error: message })}\n`,
      );
      process.exitCode = 1;
      lines.close();
      return;
    }
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`root move universe bridge failed: ${message}\n`);
    process.exitCode = 1;
  });
}
