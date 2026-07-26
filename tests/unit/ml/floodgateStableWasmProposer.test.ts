import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify, types as nodeUtilTypes } from "node:util";

import { build as esbuildBuild } from "esbuild";
import { describe, expect, it, vi } from "vitest";

import { GenerateMovesImproved } from "../../../src/components/game/ShogiImproved/GenerateMovesImproved";
import { InitialPositionImproved } from "../../../src/components/game/ShogiImproved/InitialPositionImproved";
import {
  FU,
  GI,
  HI,
  KA,
  KE,
  KI,
  KY,
  type Te,
  getKomashu,
} from "../../../src/components/game/ShogiImproved/types";
import { SHOGI_WASM_BASE64 } from "../../../src/components/game/ShogiImproved/wasm/shogiWasmBase64";
import {
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_REUSABLE_POOL_MAX_QUEUE_BOUND,
  FLOODGATE_STABLE_WASM_PROPOSER_STATUS,
  FLOODGATE_STABLE_WASM_REUSABLE_POOL_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_WASM_REUSABLE_POOL_RECEIPT_SCHEMA,
  FLOODGATE_STABLE_WASM_REUSABLE_POOL_STATUS,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  FLOODGATE_STABLE_WASM_SHA256,
  FLOODGATE_STABLE_WEIGHTS_SHA256,
  FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
  captureFloodgateStableWasmChildRuntimeCoreForTests,
  createFloodgateStableWasmReusableProposalPool,
  createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests,
  generateFloodgateStableWasmProposalsCoreForTests,
  inspectFloodgateStableWasmWorkerFailure,
  normalizeFloodgateStableWasmUnknownWorkerFailureCoreForTests,
  runFloodgateStableWasmWorkerPoolCoreForTests,
  runFloodgateStableWasmWorkerPoolWithSourceCoreForTests,
  type FloodgateStableWasmProposerAssets,
  type FloodgateStableWasmProposerDependencies,
  type FloodgateStableWasmProposerOptions,
  type FloodgateStableWasmProposalRow,
  type FloodgateStableWasmRawSearchResult,
  type FloodgateStableWasmReusableProposalPoolOptions,
  type FloodgateStableWasmSearchRequest,
  type FloodgateStableWasmSearchResultBox,
} from "../../../ml/floodgate-stable-wasm-proposer";
import {
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
} from "../../../ml/floodgate-role-bundle-result";
import { FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT } from "../../../ml/floodgate-role-bundle";
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
} from "../../../ml/floodgate-training-row-consumer";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import { toSfen } from "../../../ml/generate-teacher";
import { positionFromSfen, resolveUsiMove } from "../../../ml/shogi-sfen";
import { positionKeyFromSfen } from "../../../ml/sibling-data";

const REPOSITORY_ROOT = process.cwd();
const execFile = promisify(execFileCallback);
const MATE_SFEN = "4k4/9/5G3/9/4+R4/9/9/9/4K4 b 3P 1";
const MATE_VARIANT_SFEN = "4k4/9/5G3/9/4+R4/9/9/P8/4K4 b 2P 1";
const MATE_MOVE = "4c5b";
const OPTIONS: FloodgateStableWasmProposerOptions = {
  workers: 1,
  startupTimeoutMilliseconds: 30_000,
  searchTimeoutMilliseconds: 30_000,
};
const REUSABLE_POOL_OPTIONS: FloodgateStableWasmReusableProposalPoolOptions = {
  workers: 1,
  queueBound: 2,
  startupTimeoutMilliseconds: 30_000,
  searchTimeoutMilliseconds: 30_000,
  closeTimeoutMilliseconds: 5_000,
};
const TEST_CHILD_RUNTIME = captureFloodgateStableWasmChildRuntimeCoreForTests(
  process.platform,
  process.execPath,
  process.env.SystemRoot,
  process.env.SystemDrive,
);
const DROP_LETTER: Readonly<Record<string, number>> = {
  P: FU,
  L: KY,
  N: KE,
  S: GI,
  G: KI,
  B: KA,
  R: HI,
};
const ROOK_PAWN_LOOP_PREFIX = [
  "2g2f",
  "8c8d",
  "2f2e",
  "8d8e",
  "6i7h",
  "4a3b",
  "2e2d",
  "2c2d",
  "2h2d",
  "P*2c",
  "2d2h",
  "8e8f",
  "8g8f",
  "8b8f",
  "P*8g",
  "8f8d",
  "3i3h",
  "3c3d",
  "5i6h",
  "P*8f",
  "8g8f",
  "8d8f",
  "P*8g",
  "8f8d",
  "3h2g",
  "P*8f",
  "8g8f",
  "8d8f",
  "P*8g",
  "8f8e",
  "2g2f",
] as const;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assets(): FloodgateStableWasmProposerAssets {
  return {
    planBytes: readFileSync(
      join(
        REPOSITORY_ROOT,
        "ml",
        "protocols",
        "floodgate-q1-2026-fresh-sibling-plan.json",
      ),
    ),
    wasmBytes: readFileSync(
      join(
        REPOSITORY_ROOT,
        "src",
        "components",
        "game",
        "ShogiImproved",
        "wasm",
        "shogi.wasm",
      ),
    ),
    embeddedWasmBytes: Buffer.from(SHOGI_WASM_BASE64, "base64"),
    weightsBytes: readFileSync(
      join(REPOSITORY_ROOT, "public", "shogi-nnue-weights.bin"),
    ),
    workerSourceBytes: readFileSync(
      join(REPOSITORY_ROOT, "ml", "floodgate-stable-wasm-worker.mjs"),
    ),
  };
}

function gameId(seed: string): string {
  return `sha256:${sha256(`synthetic-stable-game-v1\0${seed}`)}`;
}

function parentId(game: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${game}\0${ply}`)}`;
}

function parent(
  seed: string,
  sfen: string,
  ply: number,
  playedMove: string,
): Readonly<FloodgateTrainingParent> {
  const game = gameId(seed);
  return {
    schema_version: 1,
    game_id: game,
    parent_id: parentId(game, ply),
    position_id: positionKeyFromSfen(sfen),
    parent_sfen: sfen,
    ply,
    played_move: playedMove,
  };
}

function authenticatedInput(
  inputRows: readonly Readonly<FloodgateTrainingParent>[],
): AuthenticatedFloodgateTrainingRows {
  const rows = [...inputRows].sort((left, right) =>
    Buffer.compare(Buffer.from(left.parent_id), Buffer.from(right.parent_id)),
  );
  const games = new Set(rows.map((row) => row.game_id));
  const parents = new Set(rows.map((row) => row.parent_id));
  const positions = new Set(rows.map((row) => row.position_id));
  return {
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: "training",
    binding: {
      result_receipt_bytes: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
      result_receipt_sha256: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
      bundle_manifest_bytes: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.bytes,
      bundle_manifest_sha256: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.sha256,
      bundle_producer_revision: "a".repeat(40),
      verifier_revision: "b".repeat(40),
      raw_format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
      raw_bytes: 1,
      raw_sha256: "c".repeat(64),
      records: rows.length,
      games: games.size,
      game_ids_sha256: floodgateIdentifierDigest(games),
      parent_ids_sha256: floodgateIdentifierDigest(parents),
      position_ids_count: positions.size,
      position_ids_sha256: floodgateIdentifierDigest(positions),
    },
    rows,
  };
}

function usiSquare(file: string, rank: string): number {
  return ((file.charCodeAt(0) - 48) << 4) + (rank.charCodeAt(0) - 96);
}

function findUsiMove(usi: string, legal: Te[]): Te {
  if (usi[1] === "*") {
    const to = usiSquare(usi[2], usi[3]);
    const piece = DROP_LETTER[usi[0]] ?? -1;
    const match = legal.find(
      (move) =>
        move.from === 0 && move.to === to && getKomashu(move.koma) === piece,
    );
    if (!match) throw new Error(`illegal test drop: ${usi}`);
    return match;
  }
  const from = usiSquare(usi[0], usi[1]);
  const to = usiSquare(usi[2], usi[3]);
  const promote = usi.endsWith("+");
  const match = legal.find(
    (move) => move.from === from && move.to === to && move.promote === promote,
  );
  if (!match) throw new Error(`illegal test move: ${usi}`);
  return match;
}

function rookPawnLoopSfen(): string {
  const position = InitialPositionImproved.createInitialPosition();
  for (const usi of ROOK_PAWN_LOOP_PREFIX) {
    const move = findUsiMove(
      usi,
      GenerateMovesImproved.generateLegalMoves(position),
    );
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
  }
  return toSfen(position, ROOK_PAWN_LOOP_PREFIX.length + 1);
}

function packedMove(sfen: string, usi: string): number {
  const { position } = positionFromSfen(sfen);
  const move = resolveUsiMove(position, usi);
  return (
    (move.koma & 0x3f) |
    (move.from << 6) |
    (move.to << 14) |
    (move.promote ? 1 << 22 : 0)
  );
}

function searchRequest(
  row: Readonly<FloodgateTrainingParent>,
  index: number,
): FloodgateStableWasmSearchRequest {
  const { position } = positionFromSfen(row.parent_sfen);
  const board: number[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      board.push(position.ban[(file << 4) + rank] | 0);
    }
  }
  const hands: number[] = [];
  for (let piece = 17; piece <= 39; piece += 1) {
    hands.push(position.hand[piece] | 0);
  }
  return {
    index,
    board,
    hands,
    side_to_move: position.teban,
    root_tesu: row.ply,
  };
}

function fakeWorkerSource(
  mode:
    | "success"
    | "hang-startup"
    | "crash-startup"
    | "hang-search"
    | "crash-search"
    | "malformed-search"
    | "duplicate-search"
    | "wrong-digest"
    | "invalid-search-result"
    | "stderr-search"
    | "stdout-flood"
    | "stderr-flood"
    | "control-tab"
    | "control-escape"
    | "control-del"
    | "large-source"
    | "bye-hang"
    | "stderr-quit"
    | "invalid-bye"
    | "partial-by-index",
  packed: number,
  pidPath?: string,
): Uint8Array {
  const source = `
import {appendFileSync} from "node:fs";
const S=${JSON.stringify("shogi-floodgate-stable-wasm-worker-v1")};
const W=${JSON.stringify(FLOODGATE_STABLE_WASM_SHA256)};
const N=${JSON.stringify(FLOODGATE_STABLE_WEIGHTS_SHA256)};
const MODE=${JSON.stringify(mode)};
const PACKED=${packed};
const PID_PATH=${JSON.stringify(pidPath ?? null)};
let buffer="";
function send(value, done=false){process.stdout.write(JSON.stringify(value)+"\\n","ascii",()=>{if(done)process.exit(0);});}
function ready(){send({node_version:process.version,schema:S,type:"ready",wasm_sha256:W,weights_sha256:N});}
function result(message){return {completed_depth:11,index:message.index,leaves:20,nodes:MODE==="invalid-search-result"?-1:10,packed_move:PACKED,raw_search_score:0,request_sha256:MODE==="wrong-digest"?"0".repeat(64):message.request_sha256,schema:S,type:"result"};}
process.stdin.setEncoding("ascii");
process.stdin.on("data",chunk=>{
  buffer+=chunk;
  let newline;
  while((newline=buffer.indexOf("\\n"))>=0){
    const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
    const message=JSON.parse(line);
    if(message.type==="init"){
      if(PID_PATH!==null)appendFileSync(PID_PATH,String(process.pid)+"\\n",{encoding:"utf8"});
      if(MODE==="hang-startup")continue;
      if(MODE==="crash-startup")process.exit(7);
      if(MODE==="large-source"&&process.execArgv.some(argument=>argument.includes("FD3_UNIQUE_MARKER")))process.exit(9);
      ready();continue;
    }
    if(message.type==="search"){
      if(MODE==="hang-search")continue;
      if(MODE==="crash-search"||(MODE==="partial-by-index"&&message.index===1))process.exit(8);
      if(MODE==="malformed-search"){process.stdout.write("{\\\"bad\\\":\\n");continue;}
      if(MODE==="stderr-search")process.stderr.write("SENSITIVE_WORKER_STDERR_CANARY pid="+process.pid+" index="+message.index+"\\n");
      if(MODE==="stdout-flood"){process.stdout.write("A".repeat(1024*1024));continue;}
      if(MODE==="stderr-flood"){process.stderr.write("B".repeat(1024*1024));continue;}
      if(MODE==="control-tab"){process.stdout.write(Buffer.from([0x09]));continue;}
      if(MODE==="control-escape"){process.stdout.write(Buffer.from([0x1b]));continue;}
      if(MODE==="control-del"){process.stdout.write(Buffer.from([0x7f]));continue;}
      send(result(message));
      if(MODE==="duplicate-search")send(result(message));
      continue;
    }
    if(message.type==="quit"){
      if(MODE==="bye-hang"){send({schema:S,type:"bye"});setInterval(()=>{},1000);}
      else if(MODE==="stderr-quit"){process.stderr.write("synthetic quit stderr\\n");send({schema:S,type:"bye"},true);}
      else if(MODE==="invalid-bye")send({schema:S,type:"not-bye"},true);
      else send({schema:S,type:"bye"},true);
    }
  }
});
${mode === "large-source" ? `/*${"FD3_UNIQUE_MARKER".repeat(2_500)}*/` : ""}
`;
  return new TextEncoder().encode(source);
}

function invalidByeStayAliveWorkerSource(pidPath: string): Uint8Array {
  const source = `
import {writeFileSync} from "node:fs";
const S=${JSON.stringify("shogi-floodgate-stable-wasm-worker-v1")};
const W=${JSON.stringify(FLOODGATE_STABLE_WASM_SHA256)};
const N=${JSON.stringify(FLOODGATE_STABLE_WEIGHTS_SHA256)};
const PID_PATH=${JSON.stringify(pidPath)};
let buffer="";
function send(value){process.stdout.write(JSON.stringify(value)+"\\n","ascii");}
process.stdin.setEncoding("ascii");
process.stdin.on("data",chunk=>{
  buffer+=chunk;
  let newline;
  while((newline=buffer.indexOf("\\n"))>=0){
    const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
    const message=JSON.parse(line);
    if(message.type==="init"){
      writeFileSync(PID_PATH,String(process.pid));
      send({node_version:process.version,schema:S,type:"ready",wasm_sha256:W,weights_sha256:N});
    } else if(message.type==="quit")send({schema:S,type:"not-bye"});
  }
});
`;
  return new TextEncoder().encode(source);
}

function workerSourceWithTopLevelThrow(
  setup: string,
  throwStatement: string,
): Uint8Array {
  const original = readFileSync(
    join(REPOSITORY_ROOT, "ml", "floodgate-stable-wasm-worker.mjs"),
    "utf8",
  );
  const marker = "try {\n  await main();\n} catch (error) {";
  if (!original.includes(marker)) {
    throw new Error("worker top-level catch marker is missing");
  }
  const replacement = `${setup}\ntry {\n  ${throwStatement}\n} catch (error) {`;
  return new TextEncoder().encode(original.replace(marker, replacement));
}

function workerSearchAssets(sourceBytes: Uint8Array) {
  const pinned = assets();
  return {
    wasmBytes: pinned.wasmBytes,
    weightsBytes: pinned.weightsBytes,
    workerSourceBytes: sourceBytes,
  };
}

function pinnedWorkerSearchAssets() {
  const pinned = assets();
  return {
    wasmBytes: pinned.wasmBytes,
    weightsBytes: pinned.weightsBytes,
    workerSourceBytes: pinned.workerSourceBytes,
  };
}

function result(
  index: number,
  row: Readonly<FloodgateTrainingParent>,
  move = row.played_move,
  overrides: Partial<FloodgateStableWasmRawSearchResult> = {},
): FloodgateStableWasmRawSearchResult {
  return {
    index,
    packed_move: packedMove(row.parent_sfen, move),
    raw_search_score: 0,
    completed_depth: 11,
    nodes: 10,
    leaves: 20,
    ...overrides,
  };
}

function boxedResults(
  results: readonly Readonly<FloodgateStableWasmRawSearchResult>[],
): Readonly<FloodgateStableWasmSearchResultBox> {
  const box = Object.create(null) as { results?: typeof results };
  Object.defineProperty(box, "results", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze([...results]),
  });
  return Object.freeze(box as { results: typeof results });
}

function fakeSearch(
  input: AuthenticatedFloodgateTrainingRows,
  mutate?: (
    requests: readonly Readonly<FloodgateStableWasmSearchRequest>[],
  ) => readonly Readonly<FloodgateStableWasmRawSearchResult>[],
): FloodgateStableWasmProposerDependencies["search"] {
  return (requests) => {
    const rows = input.rows;
    const values = requests.map((request) =>
      result(request.index, rows[request.index]),
    );
    return Promise.resolve(boxedResults(mutate ? mutate(requests) : values));
  };
}

function expectNullFrozen(value: object): void {
  expect(Object.getPrototypeOf(value)).toBeNull();
  expect(Object.isFrozen(value)).toBe(true);
}

describe("Floodgate stable-WASM child runtime capture", () => {
  it("uses a filesystem-root cwd and the minimum platform environment", () => {
    const posix = captureFloodgateStableWasmChildRuntimeCoreForTests(
      "darwin",
      "/opt/node/bin/node",
      "ignored",
      "ignored",
    );
    expect(posix.cwd).toBe("/");
    expect(Object.getPrototypeOf(posix.env)).toBeNull();
    expect(Object.keys(posix.env)).toEqual([]);
    expect(Object.isFrozen(posix.env)).toBe(true);

    const windows = captureFloodgateStableWasmChildRuntimeCoreForTests(
      "win32",
      "C:\\Program Files\\nodejs\\node.exe",
      "C:\\Windows",
      "C:",
    );
    expect(windows.cwd).toBe("C:\\");
    expect(Object.getPrototypeOf(windows.env)).toBeNull();
    expect(windows.env).toEqual({
      SystemDrive: "C:",
      SystemRoot: "C:\\Windows",
    });
    expect(Object.isFrozen(windows.env)).toBe(true);

    const crossDriveNode = captureFloodgateStableWasmChildRuntimeCoreForTests(
      "win32",
      "D:\\nodejs\\node.exe",
      "C:\\Windows",
      "C:",
    );
    expect(crossDriveNode.cwd).toBe("D:\\");
    expect(crossDriveNode.env).toEqual({
      SystemDrive: "C:",
      SystemRoot: "C:\\Windows",
    });
  });

  it("rejects malformed or cross-drive Windows bootstrap metadata", () => {
    const cases = [
      ["C:\\node.exe", undefined, "C:"],
      ["C:\\node.exe", "C:\\Windows", undefined],
      ["C:\\node.exe", "Windows", "C:"],
      ["C:\\node.exe", "C:/Windows", "C:"],
      ["C:\\node.exe", "C:\\Windows", "relative"],
      ["D:\\node.exe", "D:\\Windows", "C:"],
      ["C:\\node.exe", "C:\\Windows\0bad", "C:"],
    ] as const;
    for (const [executablePath, systemRoot, systemDrive] of cases) {
      expect(() =>
        captureFloodgateStableWasmChildRuntimeCoreForTests(
          "win32",
          executablePath,
          systemRoot,
          systemDrive,
        ),
      ).toThrow(/child runtime|Windows/);
    }
  });
});

describe("Floodgate stable-WASM proposer synthetic core", () => {
  it("pins plan, tracked/embedded WASM, weights, and worker source bytes", () => {
    const captured = assets();
    expect(sha256(captured.wasmBytes)).toBe(FLOODGATE_STABLE_WASM_SHA256);
    expect(sha256(captured.embeddedWasmBytes)).toBe(
      FLOODGATE_STABLE_WASM_SHA256,
    );
    expect(Buffer.compare(captured.wasmBytes, captured.embeddedWasmBytes)).toBe(
      0,
    );
    expect(sha256(captured.weightsBytes)).toBe(FLOODGATE_STABLE_WEIGHTS_SHA256);
    expect(sha256(captured.workerSourceBytes)).toBe(
      FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
    );
  });

  it("returns a deeply frozen null-prototype in-memory artifact with canonical JSONL", async () => {
    const row = parent("happy", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const artifact = await generateFloodgateStableWasmProposalsCoreForTests(
      input,
      assets(),
      OPTIONS,
      { search: fakeSearch(input) },
    );

    expectNullFrozen(artifact);
    expectNullFrozen(artifact.receipt);
    expectNullFrozen(artifact.rows[0]);
    expectNullFrozen(artifact.rows[0].search);
    expect(artifact.receipt.status).toBe(FLOODGATE_STABLE_WASM_PROPOSER_STATUS);
    expect(artifact.jsonl.endsWith("\n")).toBe(true);
    expect(artifact.jsonl.endsWith("\n\n")).toBe(false);
    expect(artifact.receipt_json.endsWith("\n")).toBe(true);
    expect(artifact.rows[0].stable_move).toBe(MATE_MOVE);
    expect(artifact.rows[0].search).toMatchObject({
      requested_depth: 11,
      completed_depth: 11,
      termination: "requested-depth-complete",
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      root_tesu: 0,
    });
    expect(
      (artifact.receipt.output as Readonly<Record<string, unknown>>).sha256,
    ).toBe(sha256(artifact.jsonl));
  });

  it("accepts only the exact shallow winning-mate band and labels it explicitly", async () => {
    const row = parent("mate", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const search: FloodgateStableWasmProposerDependencies["search"] = () =>
      Promise.resolve(
        boxedResults([
          result(0, row, MATE_MOVE, {
            completed_depth: 1,
            raw_search_score: FLOODGATE_STABLE_MATE_SCORE_MIN,
            nodes: 133,
            leaves: 2_856,
          }),
        ]),
      );
    const artifact = await generateFloodgateStableWasmProposalsCoreForTests(
      input,
      assets(),
      OPTIONS,
      { search },
    );
    expect(artifact.rows[0].search.termination).toBe("winning-mate-band-early");
    expect(artifact.rows[0].search.raw_search_score).toBe(
      FLOODGATE_STABLE_MATE_SCORE_MIN,
    );

    for (const rawSearchScore of [
      FLOODGATE_STABLE_MATE_SCORE_MIN - 1,
      -FLOODGATE_STABLE_MATE_SCORE_MIN,
      0,
    ]) {
      await expect(
        generateFloodgateStableWasmProposalsCoreForTests(
          input,
          assets(),
          OPTIONS,
          {
            search: () =>
              Promise.resolve(
                boxedResults([
                  result(0, row, MATE_MOVE, {
                    completed_depth: 10,
                    raw_search_score: rawSearchScore,
                  }),
                ]),
              ),
          },
        ),
      ).rejects.toThrow(/neither depth-complete nor a winning-mate/);
    }
  });

  it("sorts by authenticated parent order, never dependency completion order", async () => {
    const rows = [
      parent("order-a", MATE_SFEN, 0, MATE_MOVE),
      parent(
        "order-b",
        rookPawnLoopSfen(),
        ROOK_PAWN_LOOP_PREFIX.length,
        "3a4b",
      ),
    ];
    const input = authenticatedInput(rows);
    const search: FloodgateStableWasmProposerDependencies["search"] = (
      requests,
    ) =>
      Promise.resolve(
        boxedResults(
          [...requests]
            .reverse()
            .map((request) => result(request.index, input.rows[request.index])),
        ),
      );
    const artifact = await generateFloodgateStableWasmProposalsCoreForTests(
      input,
      assets(),
      { ...OPTIONS, workers: 2 },
      { search },
    );
    expect(artifact.rows.map((row) => row.parent_id)).toEqual(
      input.rows.map((row) => row.parent_id),
    );
  });

  it("rejects missing, duplicate, illegal, and shallow non-mate results without an artifact", async () => {
    const row = parent("fail-result", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const cases: Array<readonly FloodgateStableWasmRawSearchResult[]> = [
      [],
      [result(0, row), result(0, row)],
      [result(0, row, "5e5a")],
      [result(0, row, MATE_MOVE, { completed_depth: 0 })],
      [result(0, row, MATE_MOVE, { nodes: 0, leaves: 0 })],
    ];
    for (const values of cases) {
      await expect(
        generateFloodgateStableWasmProposalsCoreForTests(
          input,
          assets(),
          OPTIONS,
          { search: () => Promise.resolve(boxedResults(values)) },
        ),
      ).rejects.toThrow();
    }
  });

  it("rejects a same-size one-bit mutation in every pinned byte asset before search", async () => {
    const row = parent("asset-reject", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    for (const key of [
      "planBytes",
      "wasmBytes",
      "embeddedWasmBytes",
      "weightsBytes",
      "workerSourceBytes",
    ] as const) {
      const original = assets();
      const bytes = new Uint8Array(original[key]);
      bytes[Math.floor(bytes.byteLength / 2)] ^= 1;
      const mutated = { ...original, [key]: bytes };
      const search = vi.fn(fakeSearch(input));
      await expect(
        generateFloodgateStableWasmProposalsCoreForTests(
          input,
          mutated,
          OPTIONS,
          { search },
        ),
      ).rejects.toThrow(/identity|differ/);
      expect(search).not.toHaveBeenCalled();
    }
  });

  it("captures caller-owned rows, options, and asset bytes before the first await", async () => {
    const row = parent("snapshot", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const mutableAssets = assets();
    const mutableOptions = { ...OPTIONS };
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const search: FloodgateStableWasmProposerDependencies["search"] = async (
      _requests,
    ) => {
      await wait;
      return boxedResults([result(0, row, MATE_MOVE)]);
    };
    const pending = generateFloodgateStableWasmProposalsCoreForTests(
      input,
      mutableAssets,
      mutableOptions,
      { search },
    );
    mutableOptions.workers = 12;
    mutableAssets.wasmBytes[0] ^= 1;
    (input.rows as FloodgateTrainingParent[])[0] = {
      ...row,
      played_move: "bogus",
    };
    release();
    const artifact = await pending;
    expect(artifact.rows[0].stable_move).toBe(MATE_MOVE);
    expect(
      (artifact.receipt.operational as Readonly<Record<string, unknown>>)
        .workers,
    ).toBe(1);
  });

  it("copies byte views without consulting constructor or Symbol.species and rejects shared backing", async () => {
    const row = parent("byte-capture", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const original = assets();
    const wasmBytes = new Uint8Array(original.wasmBytes);
    const constructorGetter = vi.fn(() => Uint8Array);
    Object.defineProperty(wasmBytes, "constructor", {
      configurable: true,
      enumerable: false,
      get: constructorGetter,
    });
    let capturedSearchBytes: Uint8Array | undefined;
    const search: FloodgateStableWasmProposerDependencies["search"] = (
      _requests,
      searchAssets,
    ) => {
      capturedSearchBytes = searchAssets.wasmBytes;
      return Promise.resolve(boxedResults([result(0, row)]));
    };
    const artifact = await generateFloodgateStableWasmProposalsCoreForTests(
      input,
      { ...original, wasmBytes },
      OPTIONS,
      { search },
    );
    expect(artifact.rows[0].stable_move).toBe(MATE_MOVE);
    expect(constructorGetter).not.toHaveBeenCalled();
    expect(capturedSearchBytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(capturedSearchBytes)).toBe(false);
    expect(Object.getPrototypeOf(capturedSearchBytes)).toBe(
      Uint8Array.prototype,
    );

    const shared = new SharedArrayBuffer(original.planBytes.byteLength);
    new Uint8Array(shared).set(original.planBytes);
    const sharedGuardDescriptor = Object.getOwnPropertyDescriptor(
      nodeUtilTypes,
      "isSharedArrayBuffer",
    );
    expect(sharedGuardDescriptor).toBeDefined();
    let sharedRejection: unknown;
    try {
      Object.defineProperty(nodeUtilTypes, "isSharedArrayBuffer", {
        ...sharedGuardDescriptor,
        value: () => false,
      });
      try {
        await generateFloodgateStableWasmProposalsCoreForTests(
          input,
          { ...original, planBytes: new Uint8Array(shared) },
          OPTIONS,
          { search: fakeSearch(input) },
        );
      } catch (error) {
        sharedRejection = error;
      }
    } finally {
      if (sharedGuardDescriptor !== undefined) {
        Object.defineProperty(
          nodeUtilTypes,
          "isSharedArrayBuffer",
          sharedGuardDescriptor,
        );
      }
    }
    expect(sharedRejection).toBeInstanceOf(Error);
    expect((sharedRejection as Error).message).toMatch(/SharedArrayBuffer/);
  });

  it("never invokes accessors, inherited values, non-enumerable fields, or proxies", async () => {
    const row = parent("descriptor", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const getter = vi.fn(() => input.binding);
    const withAccessor = { ...input } as Record<string, unknown>;
    Object.defineProperty(withAccessor, "binding", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        withAccessor as unknown as AuthenticatedFloodgateTrainingRows,
        assets(),
        OPTIONS,
        { search: fakeSearch(input) },
      ),
    ).rejects.toThrow(/enumerable own data property/);
    expect(getter).not.toHaveBeenCalled();

    const hidden = { ...OPTIONS };
    Object.defineProperty(hidden, "workers", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: 1,
    });
    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        input,
        assets(),
        hidden,
        { search: fakeSearch(input) },
      ),
    ).rejects.toThrow(/enumerable own data property/);

    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        input,
        assets(),
        OPTIONS,
        new Proxy(
          { search: fakeSearch(input) },
          {},
        ) as FloodgateStableWasmProposerDependencies,
      ),
    ).rejects.toThrow(/non-Proxy plain object/);
  });

  it("rejects negative zero after search poisons Object.is", async () => {
    const row = parent("negative-zero", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const box = boxedResults([
      result(0, row, MATE_MOVE, { raw_search_score: -0 }),
    ]);
    const objectIsDescriptor = Object.getOwnPropertyDescriptor(Object, "is");
    expect(objectIsDescriptor).toBeDefined();
    let rejection: unknown;
    try {
      const pending = generateFloodgateStableWasmProposalsCoreForTests(
        input,
        assets(),
        OPTIONS,
        {
          search: () => {
            Object.defineProperty(Object, "is", {
              ...objectIsDescriptor,
              value: () => false,
            });
            return Promise.resolve(box);
          },
        },
      );
      try {
        await pending;
      } catch (error) {
        rejection = error;
      }
    } finally {
      if (objectIsDescriptor !== undefined) {
        Object.defineProperty(Object, "is", objectIsDescriptor);
      }
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toMatch(/negative zero/);
  });

  it("captures exact record keys without consulting a poisoned array iterator", async () => {
    const row = parent("iterator-poison", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const box = boxedResults([result(0, row)]);
    const iteratorDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      Symbol.iterator,
    );
    expect(iteratorDescriptor?.value).toBeTypeOf("function");
    let guardedCalls = 0;
    let artifact: Awaited<
      ReturnType<typeof generateFloodgateStableWasmProposalsCoreForTests>
    >;
    try {
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        ...iteratorDescriptor,
        value: function guardedArrayIterator(this: unknown[]) {
          if (this.length === 1 && this[0] === "results") {
            guardedCalls += 1;
            throw new Error("expected-key iterator must not be consulted");
          }
          return Reflect.apply(
            iteratorDescriptor?.value as (...args: unknown[]) => unknown,
            this,
            [],
          );
        },
      });
      artifact = await generateFloodgateStableWasmProposalsCoreForTests(
        input,
        assets(),
        OPTIONS,
        { search: () => Promise.resolve(box) },
      );
    } finally {
      if (iteratorDescriptor !== undefined) {
        Object.defineProperty(
          Array.prototype,
          Symbol.iterator,
          iteratorDescriptor,
        );
      }
    }
    expect(artifact.rows[0].stable_move).toBe(MATE_MOVE);
    expect(guardedCalls).toBe(0);
  });

  it("uses its captured Proxy guard after search poisons node:util.types", async () => {
    const row = parent("proxy-guard-poison", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const box = boxedResults([new Proxy(result(0, row), {})]);
    const proxyGuardDescriptor = Object.getOwnPropertyDescriptor(
      nodeUtilTypes,
      "isProxy",
    );
    expect(proxyGuardDescriptor).toBeDefined();
    let rejection: unknown;
    try {
      const pending = generateFloodgateStableWasmProposalsCoreForTests(
        input,
        assets(),
        OPTIONS,
        {
          search: () => {
            Object.defineProperty(nodeUtilTypes, "isProxy", {
              ...proxyGuardDescriptor,
              value: () => false,
            });
            return Promise.resolve(box);
          },
        },
      );
      try {
        await pending;
      } catch (error) {
        rejection = error;
      }
    } finally {
      if (proxyGuardDescriptor !== undefined) {
        Object.defineProperty(nodeUtilTypes, "isProxy", proxyGuardDescriptor);
      }
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toMatch(/non-Proxy plain object/);
  });

  it("uses captured Hash methods after search poisons their live prototype", async () => {
    const row = parent("hash-prototype-poison", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const box = boxedResults([result(0, row)]);
    const hashPrototype = Object.getPrototypeOf(createHash("sha256")) as object;
    const updateDescriptor = Object.getOwnPropertyDescriptor(
      hashPrototype,
      "update",
    );
    const digestDescriptor = Object.getOwnPropertyDescriptor(
      hashPrototype,
      "digest",
    );
    expect(updateDescriptor).toBeDefined();
    expect(digestDescriptor).toBeDefined();
    let artifact: Awaited<
      ReturnType<typeof generateFloodgateStableWasmProposalsCoreForTests>
    >;
    try {
      const pending = generateFloodgateStableWasmProposalsCoreForTests(
        input,
        assets(),
        OPTIONS,
        {
          search: () => {
            Object.defineProperty(hashPrototype, "update", {
              ...updateDescriptor,
              value: () => {
                throw new Error("live Hash.update must not be consulted");
              },
            });
            Object.defineProperty(hashPrototype, "digest", {
              ...digestDescriptor,
              value: () => {
                throw new Error("live Hash.digest must not be consulted");
              },
            });
            return Promise.resolve(box);
          },
        },
      );
      artifact = await pending;
    } finally {
      if (updateDescriptor !== undefined) {
        Object.defineProperty(hashPrototype, "update", updateDescriptor);
      }
      if (digestDescriptor !== undefined) {
        Object.defineProperty(hashPrototype, "digest", digestDescriptor);
      }
    }
    expect(artifact.rows[0].stable_move).toBe(MATE_MOVE);
    expect(artifact.receipt.semantic_run_fingerprint_sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("rejects sparse arrays, extra indexed properties, forged aggregate binding, and non-native search promises", async () => {
    const row = parent("array", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const sparse = { ...input, rows: new Array(1) };
    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        sparse,
        assets(),
        OPTIONS,
        { search: fakeSearch(input) },
      ),
    ).rejects.toThrow(/dense/);

    const extraRows = [...input.rows] as Array<
      Readonly<FloodgateTrainingParent>
    > & {
      extra?: boolean;
    };
    extraRows.extra = true;
    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        { ...input, rows: extraRows },
        assets(),
        OPTIONS,
        { search: fakeSearch(input) },
      ),
    ).rejects.toThrow(/extra properties/);

    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        {
          ...input,
          binding: { ...input.binding, records: 2 },
        },
        assets(),
        OPTIONS,
        { search: fakeSearch(input) },
      ),
    ).rejects.toThrow(/row count/);

    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        input,
        assets(),
        OPTIONS,
        {
          search: (() => ({
            then: () => undefined,
          })) as unknown as FloodgateStableWasmProposerDependencies["search"],
        },
      ),
    ).rejects.toThrow(/native Promise/);
  });

  it("rejects declared array and byte lengths before a second unbounded allocation", async () => {
    const row = parent("allocation-bound", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const hugeRows: FloodgateTrainingParent[] = [];
    hugeRows.length = 0xffff_ffff;
    const search = vi.fn(fakeSearch(input));
    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        { ...input, rows: hugeRows },
        assets(),
        OPTIONS,
        { search },
      ),
    ).rejects.toThrow(/safety bound/);
    expect(search).not.toHaveBeenCalled();

    const original = assets();
    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        input,
        {
          ...original,
          planBytes: new Uint8Array(original.planBytes.byteLength + 1),
        },
        OPTIONS,
        { search },
      ),
    ).rejects.toThrow(/byte length.*safety bound/);
    expect(search).not.toHaveBeenCalled();
  });

  it("propagates a search rejection and never returns partial rows", async () => {
    const input = authenticatedInput([
      parent("reject", MATE_SFEN, 0, MATE_MOVE),
    ]);
    await expect(
      generateFloodgateStableWasmProposalsCoreForTests(
        input,
        assets(),
        OPTIONS,
        { search: () => Promise.reject(new Error("worker crashed")) },
      ),
    ).rejects.toThrow("worker crashed");
  });

  it("does not assimilate successful artifacts or search boxes through Object.prototype.then", async () => {
    const row = parent("then-poison", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const inherited = Object.getOwnPropertyDescriptor(Object.prototype, "then");
    let calls = 0;
    Object.defineProperty(Object.prototype, "then", {
      configurable: true,
      enumerable: false,
      writable: true,
      value() {
        calls += 1;
        throw new Error("Object.prototype.then must not be consulted");
      },
    });
    try {
      const artifact = await generateFloodgateStableWasmProposalsCoreForTests(
        input,
        assets(),
        OPTIONS,
        { search: fakeSearch(input) },
      );
      expect(artifact.rows[0].stable_move).toBe(MATE_MOVE);
      expect(calls).toBe(0);
    } finally {
      if (inherited === undefined)
        delete (Object.prototype as { then?: unknown }).then;
      else Object.defineProperty(Object.prototype, "then", inherited);
    }
  });
});

describe("Floodgate stable-WASM real child pool", () => {
  it("passes the loader-free one-shot and reusable-pool Object.prototype.then regressions", async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), "stable-wasm-then-poison-"),
    );
    const bundlePath = join(temporaryRoot, "then-poison.cjs");
    try {
      await esbuildBuild({
        entryPoints: [
          join(
            REPOSITORY_ROOT,
            "tests",
            "fixtures",
            "floodgate-stable-wasm-then-poison.ts",
          ),
        ],
        bundle: true,
        platform: "node",
        format: "cjs",
        define: { "require.main": "null" },
        outfile: bundlePath,
        logLevel: "silent",
      });
      const result = await execFile(
        process.execPath,
        [bundlePath, REPOSITORY_ROOT],
        {
          cwd: TEST_CHILD_RUNTIME.cwd,
          env: TEST_CHILD_RUNTIME.env,
          timeout: 90_000,
          maxBuffer: 1_048_576,
        },
      );
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("real-and-reusable-pool-then-isolation-pass");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 120_000);

  it.each([
    ["hang-startup", "startup-timeout", 250],
    ["crash-startup", "worker-exit", null],
    ["hang-search", "search-timeout", 250],
    ["crash-search", "worker-exit", null],
    ["malformed-search", "protocol", null],
    ["duplicate-search", "protocol", null],
    ["wrong-digest", "protocol", null],
    ["invalid-search-result", "validation", null],
    ["stderr-search", "transport", null],
    ["stdout-flood", "protocol", null],
    ["stderr-flood", "transport", null],
    ["control-tab", "protocol", null],
    ["control-escape", "protocol", null],
    ["control-del", "protocol", null],
    ["bye-hang", "transport", null],
  ] as const)(
    "kills and rejects the synthetic %s worker without returning a partial box",
    async (mode, failureKind, timeoutMilliseconds) => {
      const row = parent(`transport-${mode}`, MATE_SFEN, 0, MATE_MOVE);
      const source = fakeWorkerSource(mode, packedMove(MATE_SFEN, MATE_MOVE));
      let rejection: unknown;
      try {
        await runFloodgateStableWasmWorkerPoolWithSourceCoreForTests(
          [searchRequest(row, 0)],
          workerSearchAssets(source),
          {
            workers: 1,
            startupTimeoutMilliseconds: mode === "hang-startup" ? 250 : 3_000,
            searchTimeoutMilliseconds: mode === "hang-search" ? 250 : 3_000,
          },
          { bytes: source.byteLength, sha256: sha256(source) },
        );
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeInstanceOf(Error);
      expect(inspectFloodgateStableWasmWorkerFailure(rejection)).toEqual({
        failure_kind: failureKind,
        timeout_ms: timeoutMilliseconds,
      });
      expect(Object.isFrozen(rejection)).toBe(true);
      const serialized = `${String(rejection)}\n${JSON.stringify(rejection)}\n${
        (rejection as Error).stack ?? ""
      }`;
      expect(serialized).not.toMatch(
        /SENSITIVE_WORKER_STDERR_CANARY|pid=|index=/,
      );
      expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(1_500);
    },
    10_000,
  );

  it("transports a worker source larger than the Windows argv limit over fd 3", async () => {
    const row = parent("large-source", MATE_SFEN, 0, MATE_MOVE);
    const source = fakeWorkerSource(
      "large-source",
      packedMove(MATE_SFEN, MATE_MOVE),
    );
    expect(source.byteLength).toBeGreaterThan(32_767);
    const box = await runFloodgateStableWasmWorkerPoolWithSourceCoreForTests(
      [searchRequest(row, 0)],
      workerSearchAssets(source),
      {
        workers: 1,
        startupTimeoutMilliseconds: 3_000,
        searchTimeoutMilliseconds: 3_000,
      },
      { bytes: source.byteLength, sha256: sha256(source) },
    );
    expect(box.results).toHaveLength(1);
    expect(box.results[0].index).toBe(0);
  });

  it("does not let an inherited numeric setter create sparse pool coverage", async () => {
    const rows = [
      parent("coverage-zero", MATE_SFEN, 0, MATE_MOVE),
      parent("coverage-one", MATE_SFEN, 1, MATE_MOVE),
      parent("coverage-two", MATE_SFEN, 2, MATE_MOVE),
    ];
    const source = fakeWorkerSource(
      "success",
      packedMove(MATE_SFEN, MATE_MOVE),
    );
    const inherited = Object.getOwnPropertyDescriptor(Array.prototype, "1");
    let interceptedResults = 0;
    Object.defineProperty(Array.prototype, "1", {
      configurable: true,
      set(value: unknown) {
        if (
          value !== null &&
          typeof value === "object" &&
          Object.hasOwn(value, "raw_search_score")
        ) {
          interceptedResults += 1;
          return;
        }
        Object.defineProperty(this, "1", {
          configurable: true,
          enumerable: true,
          writable: true,
          value,
        });
      },
    });
    try {
      const box = await runFloodgateStableWasmWorkerPoolWithSourceCoreForTests(
        rows.map((row, index) => searchRequest(row, index)),
        workerSearchAssets(source),
        {
          workers: 1,
          startupTimeoutMilliseconds: 3_000,
          searchTimeoutMilliseconds: 3_000,
        },
        { bytes: source.byteLength, sha256: sha256(source) },
      );
      expect(box.results).toHaveLength(3);
      expect(box.results[1].index).toBe(1);
      expect(interceptedResults).toBe(0);
    } finally {
      if (inherited === undefined) delete Array.prototype[1];
      else Object.defineProperty(Array.prototype, "1", inherited);
    }
  });

  it.each([
    {
      name: "primitive string",
      setup: "",
      statement: 'throw "SENSITIVE_STRING_SENTINEL";',
    },
    {
      name: "hostile coercion object",
      setup:
        'const hostile={};Object.defineProperty(hostile,"message",{get(){process.stderr.write("GETTER_SENTINEL");return "SENSITIVE_MESSAGE";}});hostile[Symbol.toPrimitive]=()=>{process.stderr.write("COERCION_SENTINEL");return "SENSITIVE_COERCION";};hostile.toString=()=>{process.stderr.write("TOSTRING_SENTINEL");return "SENSITIVE_TOSTRING";};',
      statement: "throw hostile;",
    },
    {
      name: "native Error with inherited descriptor value getter",
      setup:
        'const accessorError=new Error("discarded");Object.defineProperty(accessorError,"message",{configurable:true,get(){process.stderr.write("MESSAGE_GETTER_SENTINEL");return "SENSITIVE_MESSAGE_GETTER";}});Object.defineProperty(Object.prototype,"value",{configurable:true,get(){process.stderr.write("VALUE_GETTER_SENTINEL");return "SENSITIVE_INHERITED_VALUE";}});',
      statement: "throw accessorError;",
    },
    {
      name: "native Error with poisoned instanceof",
      setup:
        "Object.defineProperty(Error,Symbol.hasInstance,{configurable:true,value:()=>false});",
      statement: 'throw new Error("native-error-detail");',
    },
  ])(
    "bounds $name without invoking unknown coercion hooks",
    async (testCase) => {
      const row = parent(
        `bounded-error-${testCase.name}`,
        MATE_SFEN,
        0,
        MATE_MOVE,
      );
      const source = workerSourceWithTopLevelThrow(
        testCase.setup,
        testCase.statement,
      );
      let rejection: unknown;
      try {
        await runFloodgateStableWasmWorkerPoolWithSourceCoreForTests(
          [searchRequest(row, 0)],
          workerSearchAssets(source),
          {
            workers: 1,
            startupTimeoutMilliseconds: 3_000,
            searchTimeoutMilliseconds: 3_000,
          },
          { bytes: source.byteLength, sha256: sha256(source) },
        );
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeInstanceOf(Error);
      expect(inspectFloodgateStableWasmWorkerFailure(rejection)).toEqual({
        failure_kind: "transport",
        timeout_ms: null,
      });
      const serialized = `${String(rejection)}\n${JSON.stringify(rejection)}\n${
        (rejection as Error).stack ?? ""
      }`;
      expect(serialized).not.toMatch(
        /SENSITIVE_|GETTER_SENTINEL|COERCION_SENTINEL|TOSTRING_SENTINEL|native-error-detail/,
      );
      expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(1_500);
    },
  );

  it("discards an already completed sibling result when another worker crashes", async () => {
    const first = parent("partial-first", MATE_SFEN, 0, MATE_MOVE);
    const second = parent("partial-second", MATE_SFEN, 1, MATE_MOVE);
    const source = fakeWorkerSource(
      "partial-by-index",
      packedMove(MATE_SFEN, MATE_MOVE),
    );
    await expect(
      runFloodgateStableWasmWorkerPoolWithSourceCoreForTests(
        [searchRequest(first, 0), searchRequest(second, 1)],
        workerSearchAssets(source),
        {
          workers: 2,
          startupTimeoutMilliseconds: 2_000,
          searchTimeoutMilliseconds: 2_000,
        },
        { bytes: source.byteLength, sha256: sha256(source) },
      ),
    ).rejects.toMatchObject({
      failure_kind: "worker-exit",
      timeout_ms: null,
    });
  });

  it("reproduces the pinned winning-mate early exit without a fallback", async () => {
    const row = parent("real-mate", MATE_SFEN, 0, MATE_MOVE);
    const input = authenticatedInput([row]);
    const artifact = await generateFloodgateStableWasmProposalsCoreForTests(
      input,
      assets(),
      OPTIONS,
      { search: runFloodgateStableWasmWorkerPoolCoreForTests },
    );
    expect(artifact.rows[0]).toMatchObject({
      stable_move: MATE_MOVE,
      search: {
        completed_depth: 1,
        termination: "winning-mate-band-early",
        raw_search_score: 89_999_999,
        nodes: 133,
        leaves: 2_856,
      },
    });
  }, 30_000);

  it("keeps the known depth-11 sentinel and canonical proposals identical across one, two, and three workers", async () => {
    // This is a semantic invariance check, not a 30-second startup SLO. A
    // loaded full suite can delay the real child initialization pipeline;
    // keep its watchdog aligned with the fixed production runtime while
    // preserving the separate 30-second search watchdog.
    const realChildOptions = {
      ...OPTIONS,
      startupTimeoutMilliseconds: 120_000,
    };
    const sentinelSfen = rookPawnLoopSfen();
    const rows = [
      parent("pool-mate", MATE_SFEN, 0, MATE_MOVE),
      parent("pool-mate-variant", MATE_VARIANT_SFEN, 0, MATE_MOVE),
      parent(
        "pool-sentinel",
        sentinelSfen,
        ROOK_PAWN_LOOP_PREFIX.length,
        "3a4b",
      ),
    ];
    const input = authenticatedInput(rows);
    const one = await generateFloodgateStableWasmProposalsCoreForTests(
      input,
      assets(),
      realChildOptions,
      { search: runFloodgateStableWasmWorkerPoolCoreForTests },
    );
    const two = await generateFloodgateStableWasmProposalsCoreForTests(
      input,
      assets(),
      { ...realChildOptions, workers: 2 },
      { search: runFloodgateStableWasmWorkerPoolCoreForTests },
    );
    const three = await generateFloodgateStableWasmProposalsCoreForTests(
      input,
      assets(),
      { ...realChildOptions, workers: 3 },
      { search: runFloodgateStableWasmWorkerPoolCoreForTests },
    );
    expect(two.jsonl).toBe(one.jsonl);
    expect(three.jsonl).toBe(one.jsonl);
    expect(two.rows).toEqual(one.rows);
    expect(three.rows).toEqual(one.rows);
    const sentinel = one.rows.find(
      (proposal) => proposal.position_id === positionKeyFromSfen(sentinelSfen),
    );
    expect(sentinel).toMatchObject({
      stable_move: "3a4b",
      search: {
        completed_depth: 11,
        termination: "requested-depth-complete",
        raw_search_score: -119,
        nodes: 541_684,
        leaves: 1_270_883,
      },
    });
    expect(
      (two.receipt.output as Readonly<Record<string, unknown>>).sha256,
    ).toBe((one.receipt.output as Readonly<Record<string, unknown>>).sha256);
    expect(two.receipt.semantic_run_fingerprint_sha256).toBe(
      one.receipt.semantic_run_fingerprint_sha256,
    );
    expect(three.receipt.semantic_run_fingerprint_sha256).toBe(
      one.receipt.semantic_run_fingerprint_sha256,
    );
  }, 180_000);
});

describe("Floodgate stable-WASM reusable proposal pool", () => {
  async function syntheticReusablePool(
    mode: Parameters<typeof fakeWorkerSource>[0],
    overrides: Partial<FloodgateStableWasmReusableProposalPoolOptions> = {},
  ) {
    const source = fakeWorkerSource(mode, packedMove(MATE_SFEN, MATE_MOVE));
    return createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests(
      workerSearchAssets(source),
      { ...REUSABLE_POOL_OPTIONS, ...overrides },
      { bytes: source.byteLength, sha256: sha256(source) },
    );
  }

  it("returns an exact frozen nonclaim facade and leaks no asset bytes", async () => {
    const source = fakeWorkerSource(
      "success",
      packedMove(MATE_SFEN, MATE_MOVE),
    );
    const supplied = workerSearchAssets(source);
    const identities = {
      wasm: sha256(supplied.wasmBytes),
      weights: sha256(supplied.weightsBytes),
      source: sha256(supplied.workerSourceBytes),
    };
    const pool =
      await createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests(
        supplied,
        REUSABLE_POOL_OPTIONS,
        { bytes: source.byteLength, sha256: sha256(source) },
      );
    expectNullFrozen(pool);
    expectNullFrozen(pool.receipt);
    expect(Object.keys(pool)).toEqual(["receipt", "propose", "close"]);
    expect(Object.isFrozen(pool.propose)).toBe(true);
    expect(Object.isFrozen(pool.close)).toBe(true);
    expect(pool.receipt).toMatchObject({
      schema: FLOODGATE_STABLE_WASM_REUSABLE_POOL_RECEIPT_SCHEMA,
      status: FLOODGATE_STABLE_WASM_REUSABLE_POOL_STATUS,
      claim_boundary: FLOODGATE_STABLE_WASM_REUSABLE_POOL_CLAIM_BOUNDARY,
      operational: {
        workers: 1,
        queue_bound: 2,
        scheduling: "bounded-fifo-one-parent-per-worker-v1",
        failure_policy: "pool-wide-poison-reject-all-force-stop-v1",
      },
    });
    const serializedReceipt = JSON.stringify(pool.receipt);
    expect(serializedReceipt).not.toContain(
      Buffer.from(supplied.wasmBytes.subarray(0, 32)).toString("base64"),
    );
    expect(serializedReceipt).not.toContain(
      Buffer.from(supplied.weightsBytes.subarray(0, 32)).toString("base64"),
    );
    expect(sha256(supplied.wasmBytes)).toBe(identities.wasm);
    expect(sha256(supplied.weightsBytes)).toBe(identities.weights);
    expect(sha256(supplied.workerSourceBytes)).toBe(identities.source);
    await pool.close();
  });

  it("captures options, assets, and each parent before the first await", async () => {
    const source = fakeWorkerSource(
      "success",
      packedMove(MATE_SFEN, MATE_MOVE),
    );
    const supplied = workerSearchAssets(source);
    const mutableOptions = { ...REUSABLE_POOL_OPTIONS };
    const pendingPool =
      createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests(
        supplied,
        mutableOptions,
        { bytes: source.byteLength, sha256: sha256(source) },
      );
    mutableOptions.workers = 12;
    supplied.wasmBytes[0] ^= 1;
    supplied.weightsBytes[0] ^= 1;
    supplied.workerSourceBytes[0] ^= 1;
    const pool = await pendingPool;
    expect(
      (pool.receipt.operational as Readonly<Record<string, unknown>>).workers,
    ).toBe(1);

    const mutableParent = {
      ...parent("reusable-snapshot", MATE_SFEN, 0, MATE_MOVE),
    };
    const proposal = pool.propose(mutableParent);
    mutableParent.played_move = "bogus";
    mutableParent.parent_sfen = "bogus";
    const row = await proposal;
    expect(row.stable_move).toBe(MATE_MOVE);
    expect(row.search.root_tesu).toBe(0);
    await pool.close();
  });

  it("enforces parallel-worker and FIFO queue bounds for one, two, and three workers", async () => {
    for (const workers of [1, 2, 3]) {
      const pool = await syntheticReusablePool("hang-search", {
        workers,
        queueBound: 2,
        searchTimeoutMilliseconds: 10_000,
      });
      const accepted: Array<Promise<unknown>> = [];
      for (let index = 0; index < workers + 2; index += 1) {
        accepted.push(
          pool.propose(
            parent(`bounded-${workers}-${index}`, MATE_SFEN, 0, MATE_MOVE),
          ),
        );
      }
      await expect(
        pool.propose(
          parent(`bounded-${workers}-overflow`, MATE_SFEN, 0, MATE_MOVE),
        ),
      ).rejects.toThrow(/queue is full/);
      const settlementsPromise = Promise.allSettled(accepted);
      const firstClose = pool.close();
      expect(pool.close()).toBe(firstClose);
      await firstClose;
      const settlements = await settlementsPromise;
      expect(settlements.every((entry) => entry.status === "rejected")).toBe(
        true,
      );
    }
  }, 30_000);

  it("runs one-worker proposals in FIFO order and permits duplicate objects", async () => {
    const pool = await syntheticReusablePool("success", {
      workers: 1,
      queueBound: 3,
    });
    const shared = parent("reusable-duplicate", MATE_SFEN, 0, MATE_MOVE);
    const order: number[] = [];
    const proposals = [shared, shared, shared].map((row, index) =>
      pool.propose(row).then((proposal) => {
        order.push(index);
        return proposal;
      }),
    );
    const rows = await Promise.all(proposals);
    expect(order).toEqual([0, 1, 2]);
    expect(rows[0]).toEqual(rows[1]);
    expect(rows[1]).toEqual(rows[2]);
    await pool.close();
  });

  it("poisons the whole pool with one identical safe cause and reaps every child", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "stable-pool-poison-"));
    const pidPath = join(temporaryRoot, "workers.pid");
    try {
      const source = fakeWorkerSource(
        "crash-search",
        packedMove(MATE_SFEN, MATE_MOVE),
        pidPath,
      );
      const pool =
        await createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests(
          workerSearchAssets(source),
          {
            ...REUSABLE_POOL_OPTIONS,
            workers: 3,
            queueBound: 3,
            searchTimeoutMilliseconds: 3_000,
          },
          { bytes: source.byteLength, sha256: sha256(source) },
        );
      const pending = Array.from({ length: 6 }, (_, index) =>
        pool.propose(
          parent(`reusable-poison-${index}`, MATE_SFEN, 0, MATE_MOVE),
        ),
      );
      const settlements = await Promise.allSettled(pending);
      expect(settlements.every((entry) => entry.status === "rejected")).toBe(
        true,
      );
      const reasons = settlements.map(
        (entry) => (entry as PromiseRejectedResult).reason as unknown,
      );
      for (const reason of reasons) {
        expect(reason).toBe(reasons[0]);
        expect(inspectFloodgateStableWasmWorkerFailure(reason)).toEqual({
          failure_kind: "worker-exit",
          timeout_ms: null,
        });
      }
      let afterPoison: unknown;
      try {
        await pool.propose(
          parent("after-poison", MATE_SFEN, 0, MATE_MOVE),
        );
      } catch (primary) {
        afterPoison = primary;
      }
      expect(afterPoison).toBe(reasons[0]);
      await pool.close();

      const workerPids = readFileSync(pidPath, "utf8")
        .trim()
        .split("\n")
        .map(Number);
      expect(workerPids).toHaveLength(3);
      expect(new Set(workerPids).size).toBe(3);
      for (const workerPid of workerPids) {
        expect(() => process.kill(workerPid, 0)).toThrow();
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["hang-search", "search-timeout", 100],
    ["crash-search", "worker-exit", null],
    ["stderr-search", "transport", null],
    ["malformed-search", "protocol", null],
    ["invalid-search-result", "validation", null],
  ] as const)(
    "keeps exact safe %s metadata at the reusable search boundary",
    async (mode, failureKind, timeoutMilliseconds) => {
      const pool = await syntheticReusablePool(mode, {
        searchTimeoutMilliseconds: 100,
      });
      let rejection: unknown;
      try {
        await pool.propose(
          parent(`reusable-safe-${mode}`, MATE_SFEN, 0, MATE_MOVE),
        );
      } catch (primary) {
        rejection = primary;
      }
      expect(inspectFloodgateStableWasmWorkerFailure(rejection)).toEqual({
        failure_kind: failureKind,
        timeout_ms: timeoutMilliseconds,
      });
      expect(Object.isFrozen(rejection)).toBe(true);
      const serialized = `${String(rejection)}\n${JSON.stringify(rejection)}\n${
        (rejection as Error).stack ?? ""
      }`;
      expect(serialized).not.toMatch(
        /SENSITIVE_WORKER_STDERR_CANARY|pid=|index=|parent_id|parent_sfen|sha256:/,
      );
      await pool.close();
    },
  );

  it("reports the exact startup timeout before exposing a reusable pool", async () => {
    const source = fakeWorkerSource(
      "hang-startup",
      packedMove(MATE_SFEN, MATE_MOVE),
    );
    let rejection: unknown;
    try {
      await createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests(
        workerSearchAssets(source),
        { ...REUSABLE_POOL_OPTIONS, startupTimeoutMilliseconds: 100 },
        { bytes: source.byteLength, sha256: sha256(source) },
      );
    } catch (primary) {
      rejection = primary;
    }
    expect(inspectFloodgateStableWasmWorkerFailure(rejection)).toEqual({
      failure_kind: "startup-timeout",
      timeout_ms: 100,
    });
  });

  it("fails closed for unknown, forged, proxied, and accessor metadata", () => {
    const canary = vi.fn(() => "SENSITIVE_FAILURE_KIND");
    const forged = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(forged, "failure_kind", {
      configurable: true,
      enumerable: true,
      get: canary,
    });
    Object.defineProperty(forged, "timeout_ms", {
      configurable: true,
      enumerable: true,
      get: canary,
    });
    const proxy = new Proxy(forged, {
      get() {
        throw new Error("SENSITIVE_PROXY_CANARY");
      },
    });

    expect(inspectFloodgateStableWasmWorkerFailure(forged)).toBeNull();
    expect(inspectFloodgateStableWasmWorkerFailure(proxy)).toBeNull();
    expect(canary).not.toHaveBeenCalled();

    const unknown = normalizeFloodgateStableWasmUnknownWorkerFailureCoreForTests(
      proxy,
    );
    const metadata = inspectFloodgateStableWasmWorkerFailure(unknown);
    expect(metadata).toEqual({
      failure_kind: "unknown",
      timeout_ms: null,
    });
    expect(Object.getPrototypeOf(metadata)).toBeNull();
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(unknown)).toBe(true);
    expect(Reflect.set(unknown, "failure_kind", "search-timeout")).toBe(false);
    expect(
      `${String(unknown)}\n${JSON.stringify(unknown)}\n${unknown.stack ?? ""}`,
    ).not.toMatch(/SENSITIVE_|Proxy|accessor/);
  });

  it("rejects Proxy, accessor, mutation, and after-close inputs safely", async () => {
    const source = fakeWorkerSource(
      "success",
      packedMove(MATE_SFEN, MATE_MOVE),
    );
    const getter = vi.fn(() => 1);
    const accessorOptions = { ...REUSABLE_POOL_OPTIONS };
    Object.defineProperty(accessorOptions, "workers", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    await expect(
      createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests(
        workerSearchAssets(source),
        accessorOptions,
        { bytes: source.byteLength, sha256: sha256(source) },
      ),
    ).rejects.toThrow(/enumerable own data property/);
    expect(getter).not.toHaveBeenCalled();

    await expect(
      createFloodgateStableWasmReusableProposalPool(
        new Proxy(pinnedWorkerSearchAssets(), {}),
        REUSABLE_POOL_OPTIONS,
      ),
    ).rejects.toThrow(/non-Proxy plain object/);
    expect(FLOODGATE_STABLE_REUSABLE_POOL_MAX_QUEUE_BOUND).toBe(48);

    const pool = await syntheticReusablePool("success");
    const valid = parent("reusable-hostile-parent", MATE_SFEN, 0, MATE_MOVE);
    await expect(pool.propose(new Proxy(valid, {}))).rejects.toThrow(
      /non-Proxy plain object/,
    );
    const accessorParent = { ...valid } as Record<string, unknown>;
    Object.defineProperty(accessorParent, "played_move", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    await expect(
      pool.propose(
        accessorParent as unknown as Readonly<FloodgateTrainingParent>,
      ),
    ).rejects.toThrow(/enumerable own data property/);
    expect(getter).not.toHaveBeenCalled();

    await pool.close();
    await expect(pool.propose(valid)).rejects.toThrow(/closed/);
  });

  it("validates graceful idle shutdown and reports invalid bye, stderr, and close timeout", async () => {
    const normal = await syntheticReusablePool("success");
    await normal.close();

    for (const mode of ["stderr-quit", "invalid-bye"] as const) {
      const pool = await syntheticReusablePool(mode);
      await expect(pool.close()).rejects.toThrow(/could not stop every worker/);
    }

    const hanging = await syntheticReusablePool("bye-hang", {
      closeTimeoutMilliseconds: 200,
    });
    await expect(hanging.close()).rejects.toThrow(/cleanup timed out/);
  }, 15_000);

  it("force-stops and reaps a worker that stays alive after an invalid bye", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "stable-pool-bye-"));
    const pidPath = join(temporaryRoot, "worker.pid");
    try {
      const source = invalidByeStayAliveWorkerSource(pidPath);
      const pool =
        await createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests(
          workerSearchAssets(source),
          REUSABLE_POOL_OPTIONS,
          { bytes: source.byteLength, sha256: sha256(source) },
        );
      const workerPid = Number(readFileSync(pidPath, "utf8"));
      expect(Number.isSafeInteger(workerPid)).toBe(true);
      await expect(pool.close()).rejects.toThrow(/could not stop every worker/);
      expect(() => process.kill(workerPid, 0)).toThrow();
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("uses module-captured Node executable and version identity", async () => {
    const execPathDescriptor = Object.getOwnPropertyDescriptor(
      process,
      "execPath",
    );
    const versionDescriptor = Object.getOwnPropertyDescriptor(
      process,
      "version",
    );
    expect(execPathDescriptor).toBeDefined();
    expect(versionDescriptor).toBeDefined();
    const source = fakeWorkerSource(
      "success",
      packedMove(MATE_SFEN, MATE_MOVE),
    );
    let pool: Awaited<
      ReturnType<
        typeof createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests
      >
    >;
    try {
      Object.defineProperty(process, "execPath", {
        ...execPathDescriptor,
        value: "/poisoned/not-node",
      });
      Object.defineProperty(process, "version", {
        ...versionDescriptor,
        value: "v0.0.0-poisoned",
      });
      pool =
        await createFloodgateStableWasmReusableProposalPoolWithSourceCoreForTests(
          workerSearchAssets(source),
          REUSABLE_POOL_OPTIONS,
          { bytes: source.byteLength, sha256: sha256(source) },
        );
    } finally {
      if (execPathDescriptor !== undefined)
        Object.defineProperty(process, "execPath", execPathDescriptor);
      if (versionDescriptor !== undefined)
        Object.defineProperty(process, "version", versionDescriptor);
    }
    expect(
      (pool.receipt.operational as Readonly<Record<string, unknown>>).workers,
    ).toBe(1);
    await pool.close();
  });

  it("keeps pinned proposal rows deterministic with one, two, and three reusable workers", async () => {
    const proposalSets: Array<
      readonly Readonly<FloodgateStableWasmProposalRow>[]
    > = [];
    const shared = parent("reusable-real-mate", MATE_SFEN, 0, MATE_MOVE);
    for (const workers of [1, 2, 3]) {
      const pool = await createFloodgateStableWasmReusableProposalPool(
        pinnedWorkerSearchAssets(),
        {
          ...REUSABLE_POOL_OPTIONS,
          workers,
          queueBound: 3,
          // This test exercises row determinism, not the operational startup
          // deadline. Full-suite process contention can starve a child for
          // longer than the production 30-second boundary.
          startupTimeoutMilliseconds: 60_000,
        },
      );
      const rows = await Promise.all([
        pool.propose(shared),
        pool.propose(shared),
        pool.propose(shared),
      ]);
      proposalSets.push(rows);
      await pool.close();
    }
    expect(proposalSets[1]).toEqual(proposalSets[0]);
    expect(proposalSets[2]).toEqual(proposalSets[0]);
    expect(proposalSets[0][0]).toMatchObject({
      stable_move: MATE_MOVE,
      search: {
        completed_depth: 1,
        termination: "winning-mate-band-early",
        raw_search_score: 89_999_999,
      },
    });
  }, 120_000);
});
