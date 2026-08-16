#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const EXPECTED = {
  wasm: [45_391, 'e3e14d0836ed11d4432ff11478c98b1c808a504ff5ee99da714aa0bde4c8c606'],
  payload: [35_490_240, '00025a3b7bbe5cd28565676ed76c8f04110fdad3e9159384629d268fcc382f32'],
};

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

function identity(bytes) {
  return [bytes.byteLength, createHash('sha256').update(bytes).digest('hex')];
}

const wasmBytes = readFileSync(argument('--wasm'));
const zeroPayload = readFileSync(argument('--weights'));
assert.deepEqual(identity(wasmBytes), EXPECTED.wasm);
assert.deepEqual(identity(zeroPayload), EXPECTED.payload);

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
  'getDpaHalfkp96WeightsPtr',
  'getDpaHalfkp96WeightsSize',
  'getDpaHalfkp96RuntimeEnabled',
  'setDpaHalfkp96RuntimeEnabled',
]) {
  assert.equal(typeof wasm[name], 'function', `missing candidate-only export ${name}`);
}
assert.equal(wasm.getDpaHalfkp96WeightsSize(), EXPECTED.payload[0]);
const pointer = wasm.getDpaHalfkp96WeightsPtr();
assert.ok(pointer > 0);
new Uint8Array(wasm.memory.buffer, pointer, zeroPayload.byteLength).set(zeroPayload);

assert.equal(wasm.setDpaHalfkp96RuntimeEnabled(1), 1);
wasm.initHirate();
assert.equal(wasm.nnueEvaluate(), 0);
assert.equal(wasm.nnueEvaluateFast(), 0);
assert.equal(wasm.nnueAccMismatch(), 0);

// Seed every W1 row in memory while retaining the file as an immutable zero
// artifact.  This makes incremental/full comparison exercise real row deltas.
const view = new DataView(wasm.memory.buffer, pointer, zeroPayload.byteLength);
const rowBytes = 96 * 2;
for (let row = 0; row < 81 * 2268; row += 1) {
  for (let lane = 0; lane < 4; lane += 1) {
    view.setInt16(row * rowBytes + lane * 2, ((row + lane * 5) % 13) - 6, true);
  }
}
const handOffset = 35_271_936;
for (let row = 0; row < 81 * 14; row += 1) {
  for (let lane = 0; lane < 4; lane += 1) {
    view.setInt16(handOffset + row * rowBytes + lane * 2, ((row * 3 + lane) % 11) - 5, true);
  }
}
for (let lane = 0; lane < 4; lane += 1) {
  view.setInt32(35_489_664 + lane * 4, lane - 2, true);
}
for (let lane = 0; lane < 96; lane += 1) {
  view.setInt16(35_490_048 + lane * 2, (lane % 7) - 3, true);
}

wasm.setDpaHalfkp96RuntimeEnabled(1);
wasm.initHirate();
// Break hirate's rotational symmetry, then evaluate the same board with each
// side-to-move ordering.  Exchanging the two views must negate the raw score.
wasm.applyMove(17, (7 << 4) + 7, (7 << 4) + 6, 0);
const goteRaw = wasm.nnueEvaluateFast();
wasm.setNnueForceFull(1);
assert.equal(wasm.nnueEvaluate(), goteRaw);
wasm.setNnueForceFull(0);
assert.equal(wasm.nnueAccMismatch(), 0);

wasm.setSideToMove(16);
wasm.finalizePosition();
const senteRaw = wasm.nnueEvaluateFast();
assert.equal(senteRaw + goteRaw, 0, 'view exchange must negate the raw output');
assert.notEqual(senteRaw, 0, 'diagnostic W1 markers should produce a nonzero score');

wasm.initHirate();
wasm.clearTT();
const bestMove = wasm.searchBestMove(0, 2, 4);
assert.notEqual(bestMove, 0);
assert.equal(wasm.getSearchDepth(), 2);
assert.ok(wasm.getSearchNodes() > 0);
assert.ok(wasm.getSearchLeaves() > 0);
assert.equal(wasm.nnueAccMismatch(), 0);
const fastAfterSearch = wasm.nnueEvaluateFast();
wasm.setNnueForceFull(1);
assert.equal(wasm.nnueEvaluate(), fastAfterSearch);
wasm.setNnueForceFull(0);
assert.ok(wasm.getNnueEvalCount() > 0);
assert.equal(wasm.setDpaHalfkp96RuntimeEnabled(0), 1);

console.log(
  JSON.stringify(
    {
      status: 'pass',
      wasm: { bytes: EXPECTED.wasm[0], sha256: EXPECTED.wasm[1] },
      payload: { bytes: EXPECTED.payload[0], sha256: EXPECTED.payload[1] },
      antisymmetry: { senteRaw, goteRaw },
      search: {
        depth: wasm.getSearchDepth(),
        nodes: wasm.getSearchNodes(),
        leaves: wasm.getSearchLeaves(),
      },
      incrementalMismatch: 0,
      productionAssetsModified: false,
    },
    null,
    2,
  ),
);
