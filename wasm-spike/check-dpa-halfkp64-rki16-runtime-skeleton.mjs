#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const EXPECTED = {
  wasm: [45_751, '0c07a50793470b354bd57072565476a9a87dc9189271aa43c9ef15a0105bc7e3'],
  payload: [23_665_376, 'e96b53d4538f423f6f6dc95f5b24e8743f7479714a092b86e2d0e3e8fcf33c9f'],
};
const OFFSETS = {
  hand: 23_514_624,
  bias: 23_659_776,
  mainOutput: 23_660_032,
  relativeSelf: 23_660_160,
  relativeOther: 23_662_752,
  relativeOutput: 23_665_344,
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
  'getDpaHalfkp64Rki16WeightsPtr',
  'getDpaHalfkp64Rki16WeightsSize',
  'getDpaHalfkp64Rki16RuntimeEnabled',
  'setDpaHalfkp64Rki16RuntimeEnabled',
]) {
  assert.equal(typeof wasm[name], 'function', `missing candidate-only export ${name}`);
}
assert.equal(wasm.getDpaHalfkp64Rki16WeightsSize(), EXPECTED.payload[0]);
const pointer = wasm.getDpaHalfkp64Rki16WeightsPtr();
assert.ok(pointer > 0);
new Uint8Array(wasm.memory.buffer, pointer, zeroPayload.byteLength).set(zeroPayload);

assert.equal(wasm.setDpaHalfkp64Rki16RuntimeEnabled(1), 1);
wasm.initHirate();
assert.equal(wasm.nnueEvaluate(), 0);
assert.equal(wasm.nnueEvaluateFast(), 0);
assert.equal(wasm.nnueAccMismatch(), 0);

const view = new DataView(wasm.memory.buffer, pointer, zeroPayload.byteLength);
const rowBytes = 64 * 2;
for (let row = 0; row < 81 * 2268; row += 1) {
  for (let lane = 0; lane < 4; lane += 1) {
    view.setInt16(row * rowBytes + lane * 2, ((row + lane * 5) % 13) - 6, true);
  }
}
for (let row = 0; row < 81 * 14; row += 1) {
  for (let lane = 0; lane < 4; lane += 1) {
    view.setInt16(OFFSETS.hand + row * rowBytes + lane * 2, ((row * 3 + lane) % 11) - 5, true);
  }
}
for (let lane = 0; lane < 4; lane += 1) {
  view.setInt32(OFFSETS.bias + lane * 4, lane - 2, true);
}
for (let lane = 0; lane < 64; lane += 1) {
  view.setInt16(OFFSETS.mainOutput + lane * 2, (lane % 7) - 3, true);
}
for (let row = 0; row < 81; row += 1) {
  for (let lane = 0; lane < 16; lane += 1) {
    view.setInt16(OFFSETS.relativeSelf + (row * 16 + lane) * 2, ((row + lane * 7) % 127) - 63, true);
    view.setInt16(OFFSETS.relativeOther + (row * 16 + lane) * 2, ((row * 5 + lane * 3) % 127) - 63, true);
  }
}
for (let lane = 0; lane < 16; lane += 1) {
  view.setInt16(OFFSETS.relativeOutput + lane * 2, (lane % 9) - 4, true);
}

wasm.setDpaHalfkp64Rki16RuntimeEnabled(1);
wasm.initHirate();
wasm.applyMove(17, (7 << 4) + 7, (7 << 4) + 6, 0);
const goteRaw = wasm.nnueEvaluateFast();
wasm.setNnueForceFull(1);
assert.equal(wasm.nnueEvaluate(), goteRaw);
wasm.setNnueForceFull(0);
assert.equal(wasm.nnueAccMismatch(), 0);

wasm.setSideToMove(16);
wasm.finalizePosition();
const senteRaw = wasm.nnueEvaluateFast();
assert.equal(senteRaw + goteRaw, 0, 'view exchange must negate the integrated output');
assert.notEqual(senteRaw, 0, 'diagnostic main and relative weights should produce a nonzero score');

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
assert.equal(wasm.setDpaHalfkp64Rki16RuntimeEnabled(0), 1);

console.log(JSON.stringify({
  status: 'pass',
  wasm: { bytes: EXPECTED.wasm[0], sha256: EXPECTED.wasm[1] },
  payload: { bytes: EXPECTED.payload[0], sha256: EXPECTED.payload[1] },
  antisymmetry: { senteRaw, goteRaw },
  search: { depth: wasm.getSearchDepth(), nodes: wasm.getSearchNodes(), leaves: wasm.getSearchLeaves() },
  incrementalMismatch: 0,
  productionAssetsModified: false,
}, null, 2));
