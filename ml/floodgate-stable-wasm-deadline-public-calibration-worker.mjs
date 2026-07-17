import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

const SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-public-calibration-worker-v1";
const WASM_BYTES = 35_597;
const WASM_SHA256 =
  "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c";
const WEIGHTS_BYTES = 1_185_988;
const WEIGHTS_SHA256 =
  "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc";
const NNUE_SCALE_K = 600;
const SEARCH_DEPTH = 11;
const QUIESCENCE_DEPTH = 10;
const MEASURED_SAMPLES = 5;
const MAX_LINE_BYTES = 2 * 1024 * 1024;
const MAX_SEARCH_SCORE = 90_000_000;
const STABILITY_LIMIT_PPM = 250_000;

/*
 * Public deterministic sentinel:
 * lnsgk1snl/6gb1/p1pppp1pp/6p2/1r7/7S1/PPPPPPP1P/1BGK3R1/LNS2G1NL w Pp 32
 *
 * It is embedded as the engine's integer representation so neither this
 * worker nor its parent accepts a position, identifier, or row selector.
 */
const PUBLIC_BOARD = Object.freeze([
  34, 0, 33, 0, 0, 0, 17, 0, 18, 35, 38, 33, 0, 0, 20, 0, 23, 19, 36, 37, 0,
  33, 0, 0, 17, 0, 0, 0, 0, 33, 0, 0, 0, 17, 0, 21, 40, 0, 33, 0, 0, 0, 17,
  0, 0, 37, 0, 33, 0, 0, 0, 17, 24, 0, 36, 0, 33, 0, 0, 0, 17, 21, 20, 35,
  0, 0, 0, 39, 0, 17, 22, 19, 34, 0, 33, 0, 0, 0, 17, 0, 18,
]);
const PUBLIC_HANDS = Object.freeze([
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
]);
const PUBLIC_SIDE_TO_MOVE = 32;
const PUBLIC_ROOT_TESU = 31;
const EXPECTED_RESULT = Object.freeze({
  packedMove: 1_084_516,
  rawSearchScore: -114,
  completedDepth: 11,
  nodes: 644_923,
  leaves: 1_533_244,
});

const INPUT_KEYS = Object.freeze(["schema", "wasm_base64", "weights_base64"]);
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

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  fail("canonical JSON rejects unsupported values");
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
    const alphabet =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (code === 61) {
      if (firstPadding === value.length) firstPadding = index;
    } else if (!alphabet || firstPadding !== value.length) {
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

function parseInput(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    fail("input is not JSON");
  }
  if (canonicalJson(message) !== line) {
    fail("input is not canonical JSON");
  }
  assertExactKeys(message, INPUT_KEYS, "calibration input");
  if (message.schema !== SCHEMA) fail("calibration schema is invalid");
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
  if (
    sha256(wasmBytes) !== WASM_SHA256 ||
    sha256(weightsBytes) !== WEIGHTS_SHA256 ||
    !WebAssembly.validate(wasmBytes)
  ) {
    fail("calibration assets do not match their fixed identities");
  }
  return Object.freeze({ wasmBytes, weightsBytes });
}

function assertRequiredExports(wasm) {
  if (!(wasm.memory instanceof WebAssembly.Memory)) {
    fail("WASM memory export is missing");
  }
  for (const name of REQUIRED_FUNCTION_EXPORTS) {
    if (typeof wasm[name] !== "function") {
      fail(`required WASM export ${name} is missing`);
    }
  }
}

function instantiateRuntime(module, weightsBytes) {
  const instance = new WebAssembly.Instance(module, {
    env: {
      abort() {
        fail("WASM abort");
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
  const wasm = instance.exports;
  assertRequiredExports(wasm);
  wasm.setSharedTtEnabled(0);
  wasm.setSearchStartDepth(1);
  wasm.setNnueBuckets(1);
  if (
    wasm.getNnueBuckets() !== 1 ||
    wasm.getNnueWeightsSize() !== WEIGHTS_BYTES
  ) {
    fail("WASM NNUE layout is invalid");
  }
  const weightsPointer = wasm.getNnueWeightsPtr();
  if (
    !Number.isSafeInteger(weightsPointer) ||
    weightsPointer < 0 ||
    weightsPointer + WEIGHTS_BYTES > wasm.memory.buffer.byteLength
  ) {
    fail("WASM NNUE region is invalid");
  }
  new Uint8Array(wasm.memory.buffer, weightsPointer, WEIGHTS_BYTES).set(
    weightsBytes,
  );
  if (
    sha256(Buffer.from(wasm.memory.buffer, weightsPointer, WEIGHTS_BYTES)) !==
    WEIGHTS_SHA256
  ) {
    fail("WASM NNUE copy is not exact");
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

function configurePosition(runtime) {
  const { wasm, memoryBuffer, weightsPointer } = runtime;
  if (
    wasm.memory.buffer !== memoryBuffer ||
    wasm.getNnueWeightsPtr() !== weightsPointer
  ) {
    fail("WASM memory identity changed");
  }
  wasm.setSharedTtEnabled(0);
  wasm.setSearchStartDepth(1);
  wasm.clearTT();
  wasm.clearBoard();
  for (let file = 1; file <= 9; file += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      wasm.setSquare(
        (file << 4) + rank,
        PUBLIC_BOARD[(file - 1) * 9 + (rank - 1)],
      );
    }
  }
  for (let koma = 17; koma <= 39; koma += 1) {
    wasm.setHand(koma, PUBLIC_HANDS[koma - 17]);
  }
  wasm.setSideToMove(PUBLIC_SIDE_TO_MOVE);
  wasm.finalizePosition();
  wasm.setRootTesu(PUBLIC_ROOT_TESU);
}

function runSearch(runtime, maximumTime) {
  configurePosition(runtime);
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
  if (
    wasm.memory.buffer !== memoryBuffer ||
    !Number.isInteger(result.packedMove) ||
    !Number.isSafeInteger(result.rawSearchScore) ||
    Math.abs(result.rawSearchScore) > MAX_SEARCH_SCORE ||
    !Number.isSafeInteger(result.completedDepth) ||
    !Number.isSafeInteger(result.nodes) ||
    !Number.isSafeInteger(result.leaves)
  ) {
    fail("WASM calibration result is invalid");
  }
  return result;
}

function exactResult(left, right) {
  return (
    left.packedMove === right.packedMove &&
    left.rawSearchScore === right.rawSearchScore &&
    left.completedDepth === right.completedDepth &&
    left.nodes === right.nodes &&
    left.leaves === right.leaves
  );
}

function assertPinnedSentinel(result) {
  if (!exactResult(result, EXPECTED_RESULT)) {
    fail("public sentinel does not match the pinned result");
  }
}

function measuredSearch(runtime, maximumTime) {
  const start = performance.now();
  const result = runSearch(runtime, maximumTime);
  const elapsed = performance.now() - start;
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    fail("calibration elapsed time is invalid");
  }
  return Object.freeze({ elapsed, result });
}

function calibrate(wasmBytes, weightsBytes) {
  const wasmModule = new WebAssembly.Module(wasmBytes);
  const untimedRuntime = instantiateRuntime(wasmModule, weightsBytes);
  const callbackRuntime = instantiateRuntime(wasmModule, weightsBytes);

  assertPinnedSentinel(runSearch(untimedRuntime, 0));
  assertPinnedSentinel(runSearch(callbackRuntime, 1));

  const untimedDurations = [];
  const callbackDurations = [];
  let exactParityCount = 0;
  for (let sample = 0; sample < MEASURED_SAMPLES; sample += 1) {
    let untimed;
    let callback;
    if (sample % 2 === 0) {
      untimed = measuredSearch(untimedRuntime, 0);
      callback = measuredSearch(callbackRuntime, 1);
    } else {
      callback = measuredSearch(callbackRuntime, 1);
      untimed = measuredSearch(untimedRuntime, 0);
    }
    assertPinnedSentinel(untimed.result);
    assertPinnedSentinel(callback.result);
    if (exactResult(untimed.result, callback.result)) {
      exactParityCount += 1;
    }
    untimedDurations.push(untimed.elapsed);
    callbackDurations.push(callback.elapsed);
  }
  if (exactParityCount !== MEASURED_SAMPLES) {
    fail("public sentinel parity is not exact");
  }

  const ratios = untimedDurations.map(
    (duration, index) => callbackDurations[index] / duration,
  );
  if (ratios.some((ratio) => !Number.isFinite(ratio) || ratio <= 0)) {
    fail("calibration ratio is invalid");
  }
  const sortedRatios = [...ratios].sort((left, right) => left - right);
  const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];
  if (
    ratios.some(
      (ratio) =>
        Math.abs(ratio - medianRatio) / medianRatio >
        STABILITY_LIMIT_PPM / 1_000_000,
    )
  ) {
    fail("calibration samples are unstable");
  }

  const untimedTotal = untimedDurations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const callbackTotal = callbackDurations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const ratioPpm = Math.round((callbackTotal / untimedTotal) * 1_000_000);
  if (!Number.isSafeInteger(ratioPpm) || ratioPpm <= 0) {
    fail("aggregate calibration ratio is invalid");
  }
  return Object.freeze({
    callback_overhead_ratio_ppm: ratioPpm,
    exact_parity_count: exactParityCount,
    schema: SCHEMA,
    type: "calibration",
  });
}

async function readSingleCanonicalLine() {
  const pieces = [];
  let bytes = 0;
  for await (const inputChunk of process.stdin) {
    const chunk = Buffer.isBuffer(inputChunk)
      ? inputChunk
      : Buffer.from(inputChunk);
    if (
      [...chunk].some(
        (byte) => byte !== 0x0a && (byte < 0x20 || byte > 0x7e),
      )
    ) {
      fail("protocol input is not printable ASCII");
    }
    pieces.push(chunk);
    bytes += chunk.byteLength;
    if (bytes > MAX_LINE_BYTES + 1) fail("protocol input is too large");
  }
  if (bytes < 2) fail("protocol input is empty");
  const input = Buffer.concat(pieces, bytes);
  if (
    input[input.length - 1] !== 0x0a ||
    input.subarray(0, input.length - 1).includes(0x0a)
  ) {
    fail("protocol requires one line");
  }
  return input.subarray(0, input.length - 1).toString("ascii");
}

async function writeResult(result) {
  const output = canonicalJson(result);
  if (
    [...output].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code > 0x7e;
    })
  ) {
    fail("protocol output is not printable ASCII");
  }
  await new Promise((resolve, reject) => {
    process.stdout.write(`${output}\n`, "ascii", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

try {
  const line = await readSingleCanonicalLine();
  const { wasmBytes, weightsBytes } = parseInput(line);
  await writeResult(calibrate(wasmBytes, weightsBytes));
} catch {
  process.exitCode = 1;
}
