import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

const SCHEMA = "shogi-floodgate-stable-wasm-deadline-diagnostic-worker-v1";
const WASM_BYTES = 36_545;
const WASM_SHA256 =
  "9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31";
const WEIGHTS_BYTES = 1_185_988;
const WEIGHTS_SHA256 =
  "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc";
const NNUE_SCALE_K = 600;
const SEARCH_DEPTH = 11;
const QUIESCENCE_DEPTH = 10;
const WINNING_MATE_BAND = 89_990_000;
const MAX_SEARCH_SCORE = 90_000_000;
const MAX_COOPERATIVE_DEADLINE_MS = 600_000;
const MAX_LINE_BYTES = 2 * 1024 * 1024;

const SENTE = 16;
const GOTE = 32;
const FIRST_HAND_KOMA = 17;
const LAST_HAND_KOMA = 39;

const INPUT_KEYS = Object.freeze([
  "board",
  "cooperative_deadline_ms",
  "hands",
  "mode",
  "root_tesu",
  "schema",
  "side_to_move",
  "wasm_base64",
  "weights_base64",
]);
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
const MATERIAL_LIMIT_BY_KIND = Object.freeze({
  1: 18,
  2: 4,
  3: 4,
  4: 4,
  5: 4,
  6: 2,
  7: 2,
});
const COUNTER_BUCKETS = Object.freeze([
  Object.freeze({ label: "0", maximumExclusive: 1 }),
  Object.freeze({ label: "1-1023", maximumExclusive: 1_024 }),
  Object.freeze({ label: "1024-32767", maximumExclusive: 32_768 }),
  Object.freeze({ label: "32768-1048575", maximumExclusive: 1_048_576 }),
  Object.freeze({
    label: "1048576-33554431",
    maximumExclusive: 33_554_432,
  }),
  Object.freeze({
    label: "33554432-2147483647",
    maximumExclusive: 2_147_483_648,
  }),
]);

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

function assertIntegerInRange(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} is outside its permitted integer range`);
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
  if (value.length - firstPadding > 2) {
    fail(`${label} is not canonical base64`);
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.byteLength !== expectedBytes ||
    bytes.toString("base64") !== value
  ) {
    fail(`${label} has the wrong decoded size or encoding`);
  }
  return bytes;
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
  const file = square >> 4;
  const rank = square & 0x0f;
  if (file < 1 || file > 9 || rank < 1 || rank > 9) return -1;
  return (file - 1) * 9 + (rank - 1);
}

function validatePosition(message) {
  assertIntegerInRange(message.root_tesu, 0, 0x7fffffff, "root_tesu");
  if (message.side_to_move !== SENTE && message.side_to_move !== GOTE) {
    fail("side_to_move must be SENTE or GOTE");
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
    const droppable =
      (pieceSide(koma) === SENTE || pieceSide(koma) === GOTE) &&
      kind >= 1 &&
      kind <= 7;
    if (!droppable && count !== 0) {
      fail(`hands[${index}] is not a droppable-piece slot`);
    }
    if (count !== 0) {
      materialByKind.set(kind, (materialByKind.get(kind) ?? 0) + count);
    }
  }
  for (const [kindText, limit] of Object.entries(MATERIAL_LIMIT_BY_KIND)) {
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
  } else if (
    fromIndex === toIndex ||
    message.board[fromIndex] !== koma ||
    (promote && ![1, 2, 3, 4, 6, 7].includes(koma & 0x0f))
  ) {
    fail("WASM returned an invalid board move");
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

function instantiateRuntime(wasmBytes, weightsBytes, now) {
  const wasmModule = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(wasmModule, {
    env: {
      abort() {
        throw new Error("WASM abort");
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
  assertRequiredExports(wasm);
  wasm.setSharedTtEnabled(0);
  wasm.setSearchStartDepth(1);
  wasm.setNnueBuckets(1);
  if (
    wasm.getNnueBuckets() !== 1 ||
    wasm.getNnueWeightsSize() !== WEIGHTS_BYTES
  ) {
    fail("WASM NNUE layout does not match the pinned layout");
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
  if (
    sha256(Buffer.from(wasm.memory.buffer, weightsPointer, WEIGHTS_BYTES)) !==
    WEIGHTS_SHA256
  ) {
    fail("NNUE weights did not copy into WASM memory exactly");
  }
  wasm.setNnueScaleK(NNUE_SCALE_K);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  wasm.setNnueEnabled(1);
  wasm.clearTT();
  return Object.freeze({
    memoryBuffer: wasm.memory.buffer,
    wasm,
    weightsPointer,
  });
}

function configurePosition(runtime, message) {
  const { wasm, memoryBuffer, weightsPointer } = runtime;
  if (
    wasm.memory.buffer !== memoryBuffer ||
    wasm.getNnueWeightsPtr() !== weightsPointer
  ) {
    fail("WASM memory identity changed before search");
  }
  wasm.setSharedTtEnabled(0);
  wasm.setSearchStartDepth(1);
  wasm.clearTT();
  wasm.clearBoard();
  for (let file = 1; file <= 9; file += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      const index = (file - 1) * 9 + (rank - 1);
      wasm.setSquare((file << 4) + rank, message.board[index]);
    }
  }
  for (let koma = FIRST_HAND_KOMA; koma <= LAST_HAND_KOMA; koma += 1) {
    wasm.setHand(koma, message.hands[koma - FIRST_HAND_KOMA]);
  }
  wasm.setSideToMove(message.side_to_move);
  wasm.finalizePosition();
  wasm.setRootTesu(message.root_tesu);
}

function runSearch(runtime, message, maximumTime) {
  configurePosition(runtime, message);
  const { wasm, memoryBuffer } = runtime;
  const packedMove = wasm.searchBestMove(
    maximumTime,
    SEARCH_DEPTH,
    QUIESCENCE_DEPTH,
  );
  const result = Object.freeze({
    packedMove,
    rawSearchScore: wasm.getSearchScore(),
    completedDepth: wasm.getSearchDepth(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
  });
  if (wasm.memory.buffer !== memoryBuffer) {
    fail("WASM memory grew during search");
  }
  validatePackedMove(result.packedMove, message);
  assertIntegerInRange(
    result.rawSearchScore,
    -MAX_SEARCH_SCORE,
    MAX_SEARCH_SCORE,
    "raw search score",
  );
  assertIntegerInRange(
    result.completedDepth,
    0,
    SEARCH_DEPTH,
    "completed depth",
  );
  assertIntegerInRange(result.nodes, 0, 0x7fffffff, "node counter");
  assertIntegerInRange(result.leaves, 0, 0x7fffffff, "leaf counter");
  if (result.nodes + result.leaves === 0) {
    fail("search returned empty counters");
  }
  return result;
}

function counterBucket(value) {
  for (const bucket of COUNTER_BUCKETS) {
    if (value < bucket.maximumExclusive) return bucket.label;
  }
  fail("counter is outside the fixed buckets");
}

function parityResponse(message, wasmBytes, weightsBytes) {
  const untimed = runSearch(
    instantiateRuntime(wasmBytes, weightsBytes, () => 0),
    message,
    0,
  );
  const diagnosticConstantClock = runSearch(
    instantiateRuntime(wasmBytes, weightsBytes, () => 0),
    message,
    1,
  );
  const exact =
    untimed.packedMove === diagnosticConstantClock.packedMove &&
    untimed.rawSearchScore === diagnosticConstantClock.rawSearchScore &&
    untimed.completedDepth === diagnosticConstantClock.completedDepth &&
    untimed.nodes === diagnosticConstantClock.nodes &&
    untimed.leaves === diagnosticConstantClock.leaves;
  return {
    compared_field_count: 5,
    exact,
    schema: SCHEMA,
    type: "parity",
  };
}

function diagnosticResponse(message, wasmBytes, weightsBytes) {
  const epoch = performance.now();
  const runtime = instantiateRuntime(
    wasmBytes,
    weightsBytes,
    () => (performance.now() - epoch) / message.cooperative_deadline_ms,
  );
  const result = runSearch(runtime, message, 1);
  const completed =
    result.completedDepth === SEARCH_DEPTH ||
    (result.completedDepth < SEARCH_DEPTH &&
      result.rawSearchScore >= WINNING_MATE_BAND);
  const phase =
    result.completedDepth === SEARCH_DEPTH
      ? "requested-depth-complete"
      : completed
        ? "winning-mate-early"
        : `cooperative-deadline-after-completed-depth-${result.completedDepth}`;
  return {
    adopted: false,
    completed_depth: result.completedDepth,
    leaves_bucket: counterBucket(result.leaves),
    nodes_bucket: counterBucket(result.nodes),
    outcome: completed ? "complete" : "deadline",
    phase,
    schema: SCHEMA,
    type: "result",
  };
}

function parseInput(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    fail("input line is not valid JSON");
  }
  if (canonicalJson(message) !== line) {
    fail("input line is not canonical JSON");
  }
  assertExactKeys(message, INPUT_KEYS, "diagnostic message");
  if (
    message.schema !== SCHEMA ||
    (message.mode !== "diagnostic" && message.mode !== "parity")
  ) {
    fail("protocol schema or mode is invalid");
  }
  assertIntegerInRange(
    message.cooperative_deadline_ms,
    1,
    MAX_COOPERATIVE_DEADLINE_MS,
    "cooperative deadline",
  );
  validatePosition(message);
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
  if (sha256(wasmBytes) !== WASM_SHA256) {
    fail("WASM SHA-256 does not match the pin");
  }
  if (sha256(weightsBytes) !== WEIGHTS_SHA256) {
    fail("NNUE weights SHA-256 does not match the pin");
  }
  if (!WebAssembly.validate(wasmBytes)) {
    fail("pinned WASM bytes failed validation");
  }
  return Object.freeze({ message, wasmBytes, weightsBytes });
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

async function writeCanonicalMessage(message) {
  const json = canonicalJson(message);
  for (let index = 0; index < json.length; index += 1) {
    const code = json.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) {
      fail("output was not canonical ASCII JSON");
    }
  }
  await new Promise((resolve, reject) => {
    process.stdout.write(`${json}\n`, "ascii", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function readSingleCanonicalLine() {
  const pieces = [];
  let bytes = 0;
  for await (const inputChunk of process.stdin) {
    const chunk = Buffer.isBuffer(inputChunk)
      ? inputChunk
      : Buffer.from(inputChunk);
    for (const byte of chunk) {
      if (byte !== 0x0a && (byte < 0x20 || byte > 0x7e)) {
        fail("protocol input must contain printable ASCII and one LF only");
      }
    }
    pieces.push(chunk);
    bytes += chunk.byteLength;
    if (bytes > MAX_LINE_BYTES + 1) {
      fail("protocol line exceeds the byte limit");
    }
  }
  if (bytes < 2) fail("protocol input is empty");
  const input = Buffer.concat(pieces, bytes);
  if (input[input.length - 1] !== 0x0a) {
    fail("protocol input is missing its final LF");
  }
  if (input.subarray(0, input.length - 1).includes(0x0a)) {
    fail("protocol accepts exactly one input line");
  }
  return input.subarray(0, input.length - 1).toString("ascii");
}

async function main() {
  const line = await readSingleCanonicalLine();
  const { message, wasmBytes, weightsBytes } = parseInput(line);
  const response =
    message.mode === "parity"
      ? parityResponse(message, wasmBytes, weightsBytes)
      : diagnosticResponse(message, wasmBytes, weightsBytes);
  await writeCanonicalMessage(response);
}

try {
  await main();
} catch {
  process.exitCode = 1;
}
