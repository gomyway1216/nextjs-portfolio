import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

const SCHEMA = "shogi-floodgate-bounded-stable-wasm-worker-v3";
const WASM_BYTES = 36_545;
const WASM_SHA256 =
  "9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31";
const WEIGHTS_BYTES = 1_185_988;
const WEIGHTS_SHA256 =
  "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc";
const SEARCH_DEPTH = 11;
const QUIESCENCE_DEPTH = 10;
const SEARCH_BUDGET_MS = 20_000;
const WINNING_MATE_BAND = 89_990_000;
const MAX_SEARCH_SCORE = 90_000_000;
const NNUE_SCALE_K = 600;
const MAX_LINE_BYTES = 2 * 1024 * 1024;
const SENTE = 16;
const GOTE = 32;
const FIRST_HAND_KOMA = 17;
const LAST_HAND_KOMA = 39;

const REQUIRED_EXPORTS = Object.freeze([
  "clearBoard",
  "setSquare",
  "setHand",
  "setSideToMove",
  "finalizePosition",
  "clearTT",
  "setRootTesu",
  "searchBestMove",
  "getSearchScore",
  "getSearchDepth",
  "getSearchNodes",
  "getSearchLeaves",
  "getNnueWeightsPtr",
  "getNnueWeightsSize",
  "setNnueBuckets",
  "getNnueBuckets",
  "setNnueScaleK",
  "setNnueOutputScale",
  "setNnueForceFull",
  "setNnueEnabled",
  "setSharedTtEnabled",
  "setSearchStartDepth",
]);
const VALID_BOARD_PIECES = new Set([
  0, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 33, 34, 35, 36, 37,
  38, 39, 40, 41, 42, 43, 44, 46, 47,
]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail("invalid number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  fail("unsupported canonical JSON value");
}

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} has unexpected keys`);
  }
}

function assertInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} is outside its permitted range`);
  }
}

function decodeAsset(value, bytes, digest, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0
  ) {
    fail(`${label} is not canonical base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.byteLength !== bytes ||
    decoded.toString("base64") !== value ||
    sha256(decoded) !== digest
  ) {
    fail(`${label} does not match its pinned identity`);
  }
  return decoded;
}

function validatePosition(message) {
  assertInteger(message.index, 0, 0x7fffffff, "index");
  assertInteger(message.root_tesu, 0, 0x7fffffff, "root_tesu");
  if (message.side_to_move !== SENTE && message.side_to_move !== GOTE) {
    fail("side_to_move is invalid");
  }
  if (!Array.isArray(message.board) || message.board.length !== 81) {
    fail("board must contain 81 squares");
  }
  if (!Array.isArray(message.hands) || message.hands.length !== 23) {
    fail("hands must contain 23 slots");
  }
  let senteKings = 0;
  let goteKings = 0;
  for (const piece of message.board) {
    if (!Number.isSafeInteger(piece) || !VALID_BOARD_PIECES.has(piece)) {
      fail("board contains an invalid piece");
    }
    if (piece === 24) senteKings += 1;
    if (piece === 40) goteKings += 1;
  }
  if (senteKings !== 1 || goteKings !== 1) {
    fail("board must contain one king per side");
  }
  for (const count of message.hands) {
    assertInteger(count, 0, 18, "hand count");
  }
}

function validatePackedMove(packedMove) {
  if (
    !Number.isSafeInteger(packedMove) ||
    packedMove <= 0 ||
    packedMove > 0x7fffff
  ) {
    fail("WASM returned an invalid packed move");
  }
}

function instantiateRuntime(wasmBytes, weightsBytes, now) {
  const module = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(module, {
    env: {
      abort() {
        fail("WASM abort");
      },
      now,
      sharedShouldStop() {
        return 0;
      },
      sharedTtStore() {},
      sharedTtProbe() {
        return 0;
      },
    },
  });
  const wasm = instance.exports;
  if (!(wasm.memory instanceof WebAssembly.Memory)) fail("missing WASM memory");
  for (const name of REQUIRED_EXPORTS) {
    if (typeof wasm[name] !== "function") fail(`missing WASM export ${name}`);
  }
  wasm.setSharedTtEnabled(0);
  wasm.setSearchStartDepth(1);
  wasm.setNnueBuckets(1);
  if (
    wasm.getNnueBuckets() !== 1 ||
    wasm.getNnueWeightsSize() !== WEIGHTS_BYTES
  ) {
    fail("WASM NNUE layout mismatch");
  }
  const pointer = wasm.getNnueWeightsPtr();
  if (
    !Number.isSafeInteger(pointer) ||
    pointer < 0 ||
    pointer + WEIGHTS_BYTES > wasm.memory.buffer.byteLength
  ) {
    fail("WASM NNUE region is invalid");
  }
  new Uint8Array(wasm.memory.buffer, pointer, WEIGHTS_BYTES).set(weightsBytes);
  if (
    sha256(Buffer.from(wasm.memory.buffer, pointer, WEIGHTS_BYTES)) !==
    WEIGHTS_SHA256
  ) {
    fail("WASM NNUE copy mismatch");
  }
  wasm.setNnueScaleK(NNUE_SCALE_K);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  wasm.setNnueEnabled(1);
  return wasm;
}

function configurePosition(wasm, message) {
  wasm.setSharedTtEnabled(0);
  wasm.setSearchStartDepth(1);
  wasm.clearTT();
  wasm.clearBoard();
  for (let file = 1; file <= 9; file += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      wasm.setSquare(
        (file << 4) + rank,
        message.board[(file - 1) * 9 + (rank - 1)],
      );
    }
  }
  for (let piece = FIRST_HAND_KOMA; piece <= LAST_HAND_KOMA; piece += 1) {
    wasm.setHand(piece, message.hands[piece - FIRST_HAND_KOMA]);
  }
  wasm.setSideToMove(message.side_to_move);
  wasm.finalizePosition();
  wasm.setRootTesu(message.root_tesu);
}

function searchResponse(wasm, message, clock) {
  if (message.cooperative_deadline_ms !== SEARCH_BUDGET_MS) {
    fail("search budget differs from fixed contract");
  }
  const requestPayload = {
    board: message.board,
    cooperative_deadline_ms: message.cooperative_deadline_ms,
    hands: message.hands,
    index: message.index,
    root_tesu: message.root_tesu,
    schema: message.schema,
    side_to_move: message.side_to_move,
    type: message.type,
  };
  if (
    typeof message.request_sha256 !== "string" ||
    message.request_sha256 !==
      sha256(
        `shogi-floodgate-bounded-stable-request-v3\0${canonicalJson(requestPayload)}`,
      )
  ) {
    fail("request digest mismatch");
  }
  validatePosition(message);
  configurePosition(wasm, message);
  clock.epoch = performance.now();
  const packedMove = wasm.searchBestMove(1, SEARCH_DEPTH, QUIESCENCE_DEPTH);
  const completedDepth = wasm.getSearchDepth();
  const rawSearchScore = wasm.getSearchScore();
  const nodes = wasm.getSearchNodes();
  const leaves = wasm.getSearchLeaves();
  assertInteger(completedDepth, 0, SEARCH_DEPTH, "completed depth");
  assertInteger(rawSearchScore, -MAX_SEARCH_SCORE, MAX_SEARCH_SCORE, "score");
  assertInteger(nodes, 0, 0x7fffffff, "nodes");
  assertInteger(leaves, 0, 0x7fffffff, "leaves");
  const complete =
    completedDepth === SEARCH_DEPTH ||
    (completedDepth >= 1 &&
      completedDepth < SEARCH_DEPTH &&
      rawSearchScore >= WINNING_MATE_BAND &&
      rawSearchScore <= MAX_SEARCH_SCORE);
  if (!complete) {
    return {
      completed_depth: completedDepth,
      deadline_ms: SEARCH_BUDGET_MS,
      outcome: "omitted",
      partial_result_adopted: false,
      request_sha256: message.request_sha256,
      schema: SCHEMA,
      type: "result",
      worker_replacement_required: true,
    };
  }
  validatePackedMove(packedMove);
  if (nodes + leaves === 0) fail("completed search has empty counters");
  return {
    completed_depth: completedDepth,
    index: message.index,
    leaves,
    nodes,
    outcome: "proposal",
    packed_move: packedMove,
    partial_result_adopted: false,
    raw_search_score: rawSearchScore,
    request_sha256: message.request_sha256,
    schema: SCHEMA,
    type: "result",
  };
}

async function writeMessage(message) {
  await new Promise((resolve, reject) => {
    process.stdout.write(`${canonicalJson(message)}\n`, "ascii", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function* lines() {
  let pending = "";
  for await (const chunk of process.stdin) {
    pending += Buffer.isBuffer(chunk) ? chunk.toString("ascii") : String(chunk);
    if (Buffer.byteLength(pending, "ascii") > MAX_LINE_BYTES)
      fail("line too large");
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (line === "" || canonicalJson(JSON.parse(line)) !== line) {
        fail("input is not canonical JSON");
      }
      yield JSON.parse(line);
      newline = pending.indexOf("\n");
    }
  }
  if (pending !== "") fail("unterminated input line");
}

async function main() {
  let wasm;
  const clock = { epoch: 0 };
  for await (const message of lines()) {
    if (wasm === undefined) {
      assertExactKeys(
        message,
        ["schema", "type", "wasm_base64", "weights_base64"],
        "init",
      );
      if (message.schema !== SCHEMA || message.type !== "init") {
        fail("first message must initialize the worker");
      }
      const wasmBytes = decodeAsset(
        message.wasm_base64,
        WASM_BYTES,
        WASM_SHA256,
        "wasm_base64",
      );
      const weightsBytes = decodeAsset(
        message.weights_base64,
        WEIGHTS_BYTES,
        WEIGHTS_SHA256,
        "weights_base64",
      );
      wasm = instantiateRuntime(
        wasmBytes,
        weightsBytes,
        () => (performance.now() - clock.epoch) / SEARCH_BUDGET_MS,
      );
      wasmBytes.fill(0);
      weightsBytes.fill(0);
      await writeMessage({
        deadline_ms: SEARCH_BUDGET_MS,
        schema: SCHEMA,
        type: "ready",
        wasm_sha256: WASM_SHA256,
        weights_sha256: WEIGHTS_SHA256,
      });
      continue;
    }
    assertExactKeys(
      message,
      [
        "board",
        "cooperative_deadline_ms",
        "hands",
        "index",
        "request_sha256",
        "root_tesu",
        "schema",
        "side_to_move",
        "type",
      ],
      "search",
    );
    if (message.schema !== SCHEMA || message.type !== "search") {
      fail("worker accepts search messages only after init");
    }
    const response = searchResponse(wasm, message, clock);
    await writeMessage(response);
    if (response.outcome === "omitted") {
      process.stdin.destroy();
      return;
    }
  }
}

try {
  await main();
} catch {
  process.exitCode = 1;
}
