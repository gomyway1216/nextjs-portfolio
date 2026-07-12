import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

const isNativeError = nodeUtilTypes.isNativeError.bind(nodeUtilTypes);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwnProperty = Object.prototype.hasOwnProperty;
const reflectApply = Reflect.apply;
const nativeStringCharCodeAt = String.prototype.charCodeAt;
const nativeStringSlice = String.prototype.slice;

const SCHEMA = "shogi-floodgate-stable-wasm-worker-v1";
const WASM_BYTES = 35_597;
const WASM_SHA256 =
  "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c";
const WEIGHTS_BYTES = 1_185_988;
const WEIGHTS_SHA256 =
  "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc";
const NNUE_SCALE_K = 600;
const SEARCH_DEPTH = 11;
const QUIESCENCE_DEPTH = 10;
const WINNING_MATE_BAND = 89_990_000;
const MAX_SEARCH_SCORE = 90_000_000;
const MAX_LINE_BYTES = 2 * 1024 * 1024;
const MAX_STDERR_BYTES = 1_024;

const SENTE = 16;
const GOTE = 32;
const FIRST_HAND_KOMA = 17;
const LAST_HAND_KOMA = 39;

const INIT_KEYS = Object.freeze([
  "schema",
  "type",
  "wasm_base64",
  "weights_base64",
]);
const SEARCH_KEYS = Object.freeze([
  "board",
  "hands",
  "index",
  "request_sha256",
  "root_tesu",
  "schema",
  "side_to_move",
  "type",
]);
const QUIT_KEYS = Object.freeze(["schema", "type"]);
const REQUIRED_FUNCTION_EXPORTS = Object.freeze([
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
const HAND_LIMIT_BY_KIND = Object.freeze({
  1: 18,
  2: 4,
  3: 4,
  4: 4,
  5: 4,
  6: 2,
  7: 2,
});

let phase = "await-init";
let runtime = null;

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const keys = Object.keys(value);
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} has unexpected, missing, or out-of-order keys`);
  }
}

function assertCanonicalBase64(value, expectedBytes, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0
  ) {
    fail(`${label} is not canonical base64`);
  }
  let firstPadding = value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const validAlphabet =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (code === 61) {
      if (firstPadding === value.length) firstPadding = index;
    } else if (!validAlphabet || firstPadding !== value.length) {
      fail(`${label} is not canonical base64`);
    }
  }
  const padding = value.length - firstPadding;
  if (padding > 2) fail(`${label} is not canonical base64`);

  const bytes = Buffer.from(value, "base64");
  if (
    bytes.byteLength !== expectedBytes ||
    bytes.toString("base64") !== value
  ) {
    fail(`${label} has the wrong decoded size or encoding`);
  }
  return bytes;
}

function assertIntegerInRange(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} is outside its permitted integer range`);
  }
}

function pieceSide(koma) {
  if ((koma & SENTE) !== 0) return SENTE;
  if ((koma & GOTE) !== 0) return GOTE;
  return 0;
}

function basePieceKind(koma) {
  const kind = koma & 0x0f;
  return kind >= 9 ? kind - 8 : kind;
}

function boardIndexFromSquare(square) {
  const suji = square >> 4;
  const rank = square & 0x0f;
  if (suji < 1 || suji > 9 || rank < 1 || rank > 9) return -1;
  return (suji - 1) * 9 + (rank - 1);
}

function validatePositionMessage(message) {
  assertIntegerInRange(message.index, 0, 0x7fffffff, "search index");
  assertIntegerInRange(message.root_tesu, 0, 0x7fffffff, "root_tesu");
  if (message.side_to_move !== SENTE && message.side_to_move !== GOTE) {
    fail("side_to_move must be SENTE or GOTE");
  }
  const requestPayload = {
    board: message.board,
    hands: message.hands,
    index: message.index,
    root_tesu: message.root_tesu,
    schema: message.schema,
    side_to_move: message.side_to_move,
    type: message.type,
  };
  const expectedRequestSha256 = sha256(
    `shogi-floodgate-stable-wasm-worker-request-v1\0${canonicalJson(requestPayload)}`,
  );
  if (
    typeof message.request_sha256 !== "string" ||
    message.request_sha256 !== expectedRequestSha256
  ) {
    fail("search request digest does not match its canonical payload");
  }
  if (!Array.isArray(message.board) || message.board.length !== 81) {
    fail("board must contain exactly 81 squares");
  }
  if (
    !Array.isArray(message.hands) ||
    message.hands.length !== LAST_HAND_KOMA - FIRST_HAND_KOMA + 1
  ) {
    fail("hands must contain exactly koma 17 through 39");
  }

  const materialByKind = new Map();
  let senteKings = 0;
  let goteKings = 0;
  for (let index = 0; index < message.board.length; index += 1) {
    const koma = message.board[index];
    if (!Number.isSafeInteger(koma) || !VALID_BOARD_PIECES.has(koma)) {
      fail(`board square ${index} contains an invalid piece`);
    }
    if (koma === 24) senteKings += 1;
    if (koma === 40) goteKings += 1;
    if (koma !== 0) {
      const kind = basePieceKind(koma);
      materialByKind.set(kind, (materialByKind.get(kind) ?? 0) + 1);
    }
  }
  if (senteKings !== 1 || goteKings !== 1) {
    fail("board must contain exactly one king for each side");
  }

  for (let index = 0; index < message.hands.length; index += 1) {
    const count = message.hands[index];
    const koma = FIRST_HAND_KOMA + index;
    assertIntegerInRange(count, 0, 18, `hands[${index}]`);
    const kind = koma & 0x0f;
    const isDroppable =
      (pieceSide(koma) === SENTE || pieceSide(koma) === GOTE) &&
      kind >= 1 &&
      kind <= 7;
    if (!isDroppable && count !== 0) {
      fail(`hands[${index}] is not a droppable-piece slot`);
    }
    if (count !== 0) {
      materialByKind.set(kind, (materialByKind.get(kind) ?? 0) + count);
    }
  }

  for (const [kindText, limit] of Object.entries(HAND_LIMIT_BY_KIND)) {
    const kind = Number(kindText);
    if ((materialByKind.get(kind) ?? 0) > limit) {
      fail(`position exceeds the material limit for piece kind ${kind}`);
    }
  }
}

function validatePackedMove(packedMove, message) {
  if (
    !Number.isInteger(packedMove) ||
    packedMove <= 0 ||
    packedMove > 0x7fffff
  ) {
    fail("WASM returned an invalid or empty packed move");
  }
  const koma = packedMove & 0x3f;
  const from = (packedMove >> 6) & 0xff;
  const to = (packedMove >> 14) & 0xff;
  const promote = ((packedMove >> 22) & 1) === 1;
  const fromIndex = from === 0 ? -1 : boardIndexFromSquare(from);
  const toIndex = boardIndexFromSquare(to);
  if (
    !VALID_BOARD_PIECES.has(koma) ||
    koma === 0 ||
    pieceSide(koma) !== message.side_to_move ||
    toIndex < 0 ||
    (from !== 0 && fromIndex < 0)
  ) {
    fail("WASM returned a malformed packed move");
  }

  const destination = message.board[toIndex];
  if (destination !== 0 && pieceSide(destination) === message.side_to_move) {
    fail("WASM returned a move onto a friendly piece");
  }
  if ((destination & 0x0f) === 8) {
    fail("WASM returned a move that captures the opposing king");
  }
  if (from === 0) {
    const kind = koma & 0x0f;
    const handIndex = koma - FIRST_HAND_KOMA;
    if (
      destination !== 0 ||
      promote ||
      kind < 1 ||
      kind > 7 ||
      handIndex < 0 ||
      handIndex >= message.hands.length ||
      message.hands[handIndex] === 0
    ) {
      fail("WASM returned an invalid drop");
    }
  } else {
    if (fromIndex === toIndex || message.board[fromIndex] !== koma) {
      fail("WASM returned a move whose source does not match the board");
    }
    if (promote && ![1, 2, 3, 4, 6, 7].includes(koma & 0x0f)) {
      fail("WASM returned an invalid promotion flag");
    }
  }
}

function assertRequiredExports(wasm) {
  if (!(wasm.memory instanceof WebAssembly.Memory)) {
    fail("WASM memory export is missing or invalid");
  }
  for (const name of REQUIRED_FUNCTION_EXPORTS) {
    if (typeof wasm[name] !== "function") {
      fail(`required WASM export ${name} is missing`);
    }
  }
}

function applyStrictEngineConfiguration(currentRuntime) {
  const { wasm, memoryBuffer, weightsPointer } = currentRuntime;
  if (wasm.memory.buffer !== memoryBuffer) {
    fail("WASM memory buffer changed unexpectedly");
  }
  wasm.setSharedTtEnabled(0);
  wasm.setSearchStartDepth(1);
  wasm.setNnueBuckets(1);
  if (wasm.getNnueBuckets() !== 1) fail("WASM rejected NNUE buckets=1");
  if (wasm.getNnueWeightsSize() !== WEIGHTS_BYTES) {
    fail("WASM NNUE weight size changed unexpectedly");
  }
  if (wasm.getNnueWeightsPtr() !== weightsPointer) {
    fail("WASM NNUE weight pointer changed unexpectedly");
  }
  wasm.setNnueScaleK(NNUE_SCALE_K);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  wasm.setNnueEnabled(1);
}

function initializeRuntime(message) {
  if (phase !== "await-init" || runtime !== null) {
    fail("init is only permitted once as the first message");
  }
  const wasmBytes = assertCanonicalBase64(
    message.wasm_base64,
    WASM_BYTES,
    "wasm_base64",
  );
  const weightsBytes = assertCanonicalBase64(
    message.weights_base64,
    WEIGHTS_BYTES,
    "weights_base64",
  );
  if (sha256(wasmBytes) !== WASM_SHA256)
    fail("WASM SHA-256 does not match the pin");
  if (sha256(weightsBytes) !== WEIGHTS_SHA256) {
    fail("NNUE weights SHA-256 does not match the pin");
  }
  if (!WebAssembly.validate(wasmBytes))
    fail("pinned WASM bytes failed validation");

  const wasmModule = new WebAssembly.Module(wasmBytes);
  const wasmInstance = new WebAssembly.Instance(wasmModule, {
    env: {
      abort(_message, _file, line, column) {
        throw new Error(`WASM abort at ${line}:${column}`);
      },
      now() {
        return 0;
      },
      sharedShouldStop() {
        return 0;
      },
      sharedTtStore() {},
      sharedTtProbe() {
        return 0;
      },
    },
  });
  const wasm = wasmInstance.exports;
  assertRequiredExports(wasm);

  wasm.setNnueBuckets(1);
  if (
    wasm.getNnueBuckets() !== 1 ||
    wasm.getNnueWeightsSize() !== WEIGHTS_BYTES
  ) {
    fail("WASM NNUE layout does not match the pinned runOp1 layout");
  }
  const weightsPointer = wasm.getNnueWeightsPtr();
  if (
    !Number.isSafeInteger(weightsPointer) ||
    weightsPointer < 0 ||
    weightsPointer + WEIGHTS_BYTES > wasm.memory.buffer.byteLength
  ) {
    fail("WASM NNUE weight region is outside exported memory");
  }
  new Uint8Array(wasm.memory.buffer, weightsPointer, WEIGHTS_BYTES).set(
    weightsBytes,
  );
  const copiedWeights = Buffer.from(
    wasm.memory.buffer,
    weightsPointer,
    WEIGHTS_BYTES,
  );
  if (sha256(copiedWeights) !== WEIGHTS_SHA256) {
    fail("NNUE weights did not copy into WASM memory exactly");
  }

  const candidateRuntime = Object.freeze({
    wasm,
    memoryBuffer: wasm.memory.buffer,
    weightsPointer,
  });
  applyStrictEngineConfiguration(candidateRuntime);
  wasm.clearTT();
  runtime = candidateRuntime;
  phase = "ready";
}

function runSearch(message) {
  if (phase !== "ready" || runtime === null)
    fail("search requires successful init");
  validatePositionMessage(message);

  const { wasm, memoryBuffer } = runtime;
  applyStrictEngineConfiguration(runtime);
  wasm.clearTT();
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      const index = (suji - 1) * 9 + (rank - 1);
      wasm.setSquare((suji << 4) + rank, message.board[index]);
    }
  }
  for (let koma = FIRST_HAND_KOMA; koma <= LAST_HAND_KOMA; koma += 1) {
    wasm.setHand(koma, message.hands[koma - FIRST_HAND_KOMA]);
  }
  wasm.setSideToMove(message.side_to_move);
  wasm.finalizePosition();
  wasm.setRootTesu(message.root_tesu);

  const packedMove = wasm.searchBestMove(0, SEARCH_DEPTH, QUIESCENCE_DEPTH);
  const rawSearchScore = wasm.getSearchScore();
  const completedDepth = wasm.getSearchDepth();
  const nodes = wasm.getSearchNodes();
  const leaves = wasm.getSearchLeaves();
  if (wasm.memory.buffer !== memoryBuffer)
    fail("WASM memory grew during search");

  validatePackedMove(packedMove, message);
  assertIntegerInRange(
    rawSearchScore,
    -MAX_SEARCH_SCORE,
    MAX_SEARCH_SCORE,
    "raw search score",
  );
  assertIntegerInRange(completedDepth, 1, SEARCH_DEPTH, "completed depth");
  assertIntegerInRange(nodes, 0, 0x7fffffff, "node counter");
  assertIntegerInRange(leaves, 0, 0x7fffffff, "leaf counter");
  if (nodes + leaves === 0) fail("search returned empty counters");
  if (
    completedDepth !== SEARCH_DEPTH &&
    !(completedDepth < SEARCH_DEPTH && rawSearchScore >= WINNING_MATE_BAND)
  ) {
    fail("search did not reach depth 11 or the pinned winning-mate band");
  }

  return {
    schema: SCHEMA,
    type: "result",
    index: message.index,
    packed_move: packedMove,
    raw_search_score: rawSearchScore,
    request_sha256: message.request_sha256,
    completed_depth: completedDepth,
    nodes,
    leaves,
  };
}

function parseCanonicalMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    fail("input line is not valid JSON");
  }
  if (canonicalJson(message) !== line) fail("input line is not canonical JSON");
  if (
    message === null ||
    typeof message !== "object" ||
    Array.isArray(message)
  ) {
    fail("protocol message must be an object");
  }
  if (message.schema !== SCHEMA || typeof message.type !== "string") {
    fail("protocol schema or type is invalid");
  }
  return message;
}

function handleLine(line) {
  const message = parseCanonicalMessage(line);
  if (message.type === "init") {
    assertExactKeys(message, INIT_KEYS, "init message");
    initializeRuntime(message);
    return {
      quit: false,
      response: {
        schema: SCHEMA,
        type: "ready",
        node_version: process.version,
        wasm_sha256: WASM_SHA256,
        weights_sha256: WEIGHTS_SHA256,
      },
    };
  }
  if (message.type === "search") {
    assertExactKeys(message, SEARCH_KEYS, "search message");
    return { quit: false, response: runSearch(message) };
  }
  if (message.type === "quit") {
    assertExactKeys(message, QUIT_KEYS, "quit message");
    if (phase !== "ready" || runtime === null)
      fail("quit requires successful init");
    phase = "done";
    return {
      quit: true,
      response: { schema: SCHEMA, type: "bye" },
    };
  }
  fail("protocol message type is unknown");
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
    }
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
  fail(`canonical JSON rejects ${typeof value}`);
}

function writeCanonicalMessage(message) {
  const json = canonicalJson(message);
  for (let index = 0; index < json.length; index += 1) {
    const code = json.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) fail("output was not canonical ASCII JSON");
  }
  return new Promise((resolve, reject) => {
    process.stdout.write(`${json}\n`, "ascii", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main() {
  let pieces = [];
  let lineBytes = 0;
  for await (const inputChunk of process.stdin) {
    const chunk = Buffer.isBuffer(inputChunk)
      ? inputChunk
      : Buffer.from(inputChunk);
    let segmentStart = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      const byte = chunk[index];
      if (byte !== 0x0a && (byte < 0x20 || byte > 0x7e)) {
        fail("protocol input must contain printable ASCII and LF only");
      }
      if (byte !== 0x0a) continue;

      const segment = chunk.subarray(segmentStart, index);
      lineBytes += segment.byteLength;
      if (lineBytes === 0) fail("empty protocol lines are forbidden");
      if (lineBytes > MAX_LINE_BYTES)
        fail("protocol line exceeds the byte limit");
      pieces.push(segment);
      const line = Buffer.concat(pieces, lineBytes).toString("ascii");
      pieces = [];
      lineBytes = 0;
      segmentStart = index + 1;

      const outcome = handleLine(line);
      if (outcome.quit && segmentStart !== chunk.length) {
        fail("bytes after quit are forbidden");
      }
      await writeCanonicalMessage(outcome.response);
      if (outcome.quit) {
        process.stdin.destroy();
        return;
      }
    }

    if (segmentStart < chunk.length) {
      const remainder = chunk.subarray(segmentStart);
      lineBytes += remainder.byteLength;
      if (lineBytes > MAX_LINE_BYTES)
        fail("protocol line exceeds the byte limit");
      pieces.push(remainder);
    }
  }

  if (lineBytes !== 0) fail("final protocol line is missing LF");
  fail("protocol ended before quit");
}

function boundedAsciiError(error) {
  let raw = "unknown failure";
  if (isNativeError(error)) {
    try {
      const descriptor = objectGetOwnPropertyDescriptor(error, "message");
      if (
        descriptor !== undefined &&
        reflectApply(objectHasOwnProperty, descriptor, ["value"]) &&
        typeof descriptor.value === "string"
      ) {
        raw = descriptor.value;
      }
    } catch {
      raw = "unknown failure";
    }
  }
  let safe = "";
  for (let index = 0; index < raw.length && safe.length < 900; index += 1) {
    const code = reflectApply(nativeStringCharCodeAt, raw, [index]);
    safe += code >= 0x20 && code <= 0x7e ? raw[index] : "?";
  }
  const output = `stable WASM worker error: ${safe || "unknown failure"}\n`;
  return reflectApply(nativeStringSlice, output, [0, MAX_STDERR_BYTES]);
}

try {
  await main();
} catch (error) {
  process.stdin.destroy();
  process.exitCode = 1;
  await new Promise((resolve) => {
    process.stderr.write(boundedAsciiError(error), "ascii", resolve);
  });
}
