#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const EXPECTED_ZERO = {
  bytes: 47_401_444,
  sha256: 'b395833c996d95ebe5ff15774e2d4e24d76fdcbaaeeaabb2603d7e66d45da822',
};

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const wasmBytes = readFileSync(argument('--wasm'));
const zeroPayload = readFileSync(argument('--weights'));
assert.equal(zeroPayload.byteLength, EXPECTED_ZERO.bytes);
assert.equal(sha256(zeroPayload), EXPECTED_ZERO.sha256);

const source = new ArrayBuffer(wasmBytes.byteLength);
new Uint8Array(source).set(wasmBytes);
const instance = new WebAssembly.Instance(new WebAssembly.Module(source), {
  env: {
    abort(_message, _file, line, column) {
      throw new Error(`WASM abort at ${line}:${column}`);
    },
    now: () => performance.now(),
    sharedTtProbe: () => 0,
    sharedTtStore: () => {},
    sharedShouldStop: () => 0,
  },
});
const wasm = instance.exports;

for (const name of [
  'getKingPairWeightsPtr',
  'getKingPairWeightsSize',
  'getKingPairRuntimeEnabled',
  'setKingPairRuntimeEnabled',
]) {
  assert.equal(typeof wasm[name], 'function', `missing candidate-only export ${name}`);
}
assert.equal(wasm.getKingPairWeightsSize(), EXPECTED_ZERO.bytes);
const pointer = wasm.getKingPairWeightsPtr();
assert.ok(pointer > 0);
new Uint8Array(wasm.memory.buffer, pointer, zeroPayload.byteLength).set(zeroPayload);

// Keep the dense tail all-zero (the candidate must remain output-only zero),
// but seed a few lanes in every W1 row.  Full rebuild versus lazy incremental
// mismatch checking then exercises real row addressing and make/unmake deltas
// instead of passing trivially because both accumulators contain only zeroes.
const payloadView = new DataView(wasm.memory.buffer, pointer, zeroPayload.byteLength);
const boardRows = 81 * 2268;
const handRows = 81 * 14;
const rowBytes = 128 * 2;
for (let row = 0; row < boardRows; row += 1) {
  for (let lane = 0; lane < 4; lane += 1) {
    payloadView.setInt16(row * rowBytes + lane * 2, ((row + lane * 3) % 11) - 5, true);
  }
}
const handOffset = 47_029_248;
for (let row = 0; row < handRows; row += 1) {
  for (let lane = 0; lane < 4; lane += 1) {
    payloadView.setInt16(
      handOffset + row * rowBytes + lane * 2,
      ((row * 3 + lane) % 9) - 4,
      true,
    );
  }
}
for (let lane = 0; lane < 4; lane += 1) {
  payloadView.setInt32(47_319_552 + lane * 4, lane - 2, true);
}

assert.equal(wasm.setKingPairRuntimeEnabled(1), 1);
assert.equal(wasm.getKingPairRuntimeEnabled(), 1);
wasm.initHirate();
assert.equal(wasm.nnueEvaluate(), 0);
assert.equal(wasm.nnueEvaluateFast(), 0);
assert.equal(wasm.nnueEvaluateCp(), 0);
assert.equal(wasm.nnueAccMismatch(), 0);
assert.equal(wasm.benchNnueEvaluateFast(4), 0);

wasm.clearTT();
const bestMove = wasm.searchBestMove(0, 2, 4);
assert.notEqual(bestMove, 0);
assert.equal(wasm.getSearchDepth(), 2);
assert.ok(wasm.getSearchNodes() > 0);
assert.ok(wasm.getSearchLeaves() > 0);
assert.equal(wasm.nnueAccMismatch(), 0);
assert.equal(wasm.nnueEvaluateFast(), 0);

wasm.setNnueForceFull(1);
assert.equal(wasm.nnueEvaluateCp(), 0);
wasm.setNnueForceFull(0);
assert.ok(wasm.getNnueEvalCount() > 0);
assert.equal(wasm.setKingPairRuntimeEnabled(0), 1);
assert.equal(wasm.getKingPairRuntimeEnabled(), 0);

console.log(
  JSON.stringify(
    {
      status: 'pass',
      wasm: { bytes: wasmBytes.byteLength, sha256: sha256(wasmBytes) },
      payload: EXPECTED_ZERO,
      search: {
        depth: wasm.getSearchDepth(),
        nodes: wasm.getSearchNodes(),
        leaves: wasm.getSearchLeaves(),
      },
      incrementalMismatch: 0,
      rawOutput: 0,
      productionAssetsModified: false,
    },
    null,
    2,
  ),
);
