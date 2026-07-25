const MAX_N: i32 = 128;

const sourceMoves = new StaticArray<i32>(MAX_N);
const sourceScores = new StaticArray<i32>(MAX_N);

const currentMoves = new StaticArray<i32>(MAX_N);
const currentScores = new StaticArray<i32>(MAX_N);
const currentOrdinals = new StaticArray<i32>(MAX_N);

const packedMoves = new StaticArray<i32>(MAX_N);
const packedKeys = new StaticArray<u64>(MAX_N);

const referenceMoves = new StaticArray<i32>(MAX_N);
const referenceScores = new StaticArray<i32>(MAX_N);
const referenceOrdinals = new StaticArray<i32>(MAX_N);

@inline
function nextRandom(value: u32): u32 {
  let x = value;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return x;
}

function makeInput(n: i32, seed: u32): void {
  let state = seed | 1;
  for (let i = 0; i < n; i++) {
    state = nextRandom(state);
    // Intentionally tie-heavy: only 11 distinct signed scores, including
    // negatives, while every move id is unique within the vector.
    const score = <i32>(state % 11) - 5;
    unchecked(sourceMoves[i] = <i32>((seed & 0x7fffff) << 8) ^ i);
    unchecked(sourceScores[i] = score);
  }
}

function makeSignedBoundaryInput(n: i32, seed: u32): void {
  let state = seed | 1;
  for (let i = 0; i < n; i++) {
    state = nextRandom(state);
    const lane = (i + <i32>(state % 12)) % 12;
    let score: i32;
    if (lane == 0 || lane == 10) {
      score = i32.MIN_VALUE;
    } else if (lane == 1 || lane == 11) {
      score = i32.MAX_VALUE;
    } else if (lane == 2) {
      score = i32.MIN_VALUE + 1;
    } else if (lane == 3) {
      score = i32.MAX_VALUE - 1;
    } else if (lane == 4 || lane == 7) {
      score = -1;
    } else if (lane == 5 || lane == 8) {
      score = 0;
    } else if (lane == 6 || lane == 9) {
      score = 1;
    } else {
      score = <i32>state;
    }
    unchecked(sourceMoves[i] = <i32>((seed & 0x7fffff) << 8) ^ i);
    unchecked(sourceScores[i] = score);
  }
}

@inline
function currentHigher(a: i32, b: i32): bool {
  const scoreA = unchecked(currentScores[a]);
  const scoreB = unchecked(currentScores[b]);
  if (scoreA != scoreB) return scoreA > scoreB;
  return unchecked(currentOrdinals[a]) < unchecked(currentOrdinals[b]);
}

@inline
function currentSwap(a: i32, b: i32): void {
  const move = unchecked(currentMoves[a]);
  const score = unchecked(currentScores[a]);
  const ordinal = unchecked(currentOrdinals[a]);
  unchecked(currentMoves[a] = currentMoves[b]);
  unchecked(currentScores[a] = currentScores[b]);
  unchecked(currentOrdinals[a] = currentOrdinals[b]);
  unchecked(currentMoves[b] = move);
  unchecked(currentScores[b] = score);
  unchecked(currentOrdinals[b] = ordinal);
}

function currentSiftDown(root: i32, size: i32): void {
  let current = root;
  while (true) {
    const left = current * 2 + 1;
    if (left >= size) return;
    const right = left + 1;
    let best = left;
    if (right < size && currentHigher(right, left)) best = right;
    if (!currentHigher(best, current)) return;
    currentSwap(current, best);
    current = best;
  }
}

function currentBuild(n: i32): void {
  for (let i = (n >> 1) - 1; i >= 0; i--) currentSiftDown(i, n);
}

function currentPop(size: i32): i32 {
  const move = unchecked(currentMoves[0]);
  const last = size - 1;
  if (last > 0) {
    unchecked(currentMoves[0] = currentMoves[last]);
    unchecked(currentScores[0] = currentScores[last]);
    unchecked(currentOrdinals[0] = currentOrdinals[last]);
    currentSiftDown(0, last);
  }
  return move;
}

@inline
function makePackedKey(score: i32, ordinal: i32): u64 {
  // Signed score ascending is mapped to unsigned ascending by flipping its
  // sign bit. The inverted ordinal makes an earlier generated move a larger
  // low word, so one unsigned comparison implements the full stable order.
  const scoreWord = <u32>score ^ 0x80000000;
  const ordinalWord = 0xffffffff - <u32>ordinal;
  return (<u64>scoreWord << 32) | <u64>ordinalWord;
}

@inline
function packedHigher(a: i32, b: i32): bool {
  return unchecked(packedKeys[a]) > unchecked(packedKeys[b]);
}

@inline
function packedSwap(a: i32, b: i32): void {
  const move = unchecked(packedMoves[a]);
  const key = unchecked(packedKeys[a]);
  unchecked(packedMoves[a] = packedMoves[b]);
  unchecked(packedKeys[a] = packedKeys[b]);
  unchecked(packedMoves[b] = move);
  unchecked(packedKeys[b] = key);
}

function packedSiftDown(root: i32, size: i32): void {
  let current = root;
  while (true) {
    const left = current * 2 + 1;
    if (left >= size) return;
    const right = left + 1;
    let best = left;
    if (right < size && packedHigher(right, left)) best = right;
    if (!packedHigher(best, current)) return;
    packedSwap(current, best);
    current = best;
  }
}

function packedBuild(n: i32): void {
  for (let i = (n >> 1) - 1; i >= 0; i--) packedSiftDown(i, n);
}

function packedPop(size: i32): i32 {
  const move = unchecked(packedMoves[0]);
  const last = size - 1;
  if (last > 0) {
    unchecked(packedMoves[0] = packedMoves[last]);
    unchecked(packedKeys[0] = packedKeys[last]);
    packedSiftDown(0, last);
  }
  return move;
}

function prepareCurrent(n: i32): void {
  for (let i = 0; i < n; i++) {
    unchecked(currentMoves[i] = sourceMoves[i]);
    unchecked(currentScores[i] = sourceScores[i]);
    unchecked(currentOrdinals[i] = i);
  }
}

function preparePacked(n: i32): void {
  for (let i = 0; i < n; i++) {
    const score = unchecked(sourceScores[i]);
    unchecked(packedMoves[i] = sourceMoves[i]);
    unchecked(packedKeys[i] = makePackedKey(score, i));
  }
}

function prepareReference(n: i32): void {
  for (let i = 0; i < n; i++) {
    unchecked(referenceMoves[i] = sourceMoves[i]);
    unchecked(referenceScores[i] = sourceScores[i]);
    unchecked(referenceOrdinals[i] = i);
  }
}

function referenceStableSort(n: i32): void {
  for (let i = 1; i < n; i++) {
    const move = unchecked(referenceMoves[i]);
    const score = unchecked(referenceScores[i]);
    const ordinal = unchecked(referenceOrdinals[i]);
    let j = i;
    while (j > 0) {
      const prior = j - 1;
      const priorScore = unchecked(referenceScores[prior]);
      const priorOrdinal = unchecked(referenceOrdinals[prior]);
      if (priorScore > score || (priorScore == score && priorOrdinal < ordinal)) break;
      unchecked(referenceMoves[j] = referenceMoves[prior]);
      unchecked(referenceScores[j] = priorScore);
      unchecked(referenceOrdinals[j] = priorOrdinal);
      j = prior;
    }
    unchecked(referenceMoves[j] = move);
    unchecked(referenceScores[j] = score);
    unchecked(referenceOrdinals[j] = ordinal);
  }
}

// Returns mismatch count across both heap implementations and a stable
// insertion-sort reference. The caller uses >= 1,000 vectors per n.
export function verify(n: i32, vectors: i32, pops: i32, seed: u32): i32 {
  if (n < 2 || n > MAX_N || pops < 1 || pops > n) return -1;
  let failures = 0;
  let state = seed;
  for (let vector = 0; vector < vectors; vector++) {
    state = nextRandom(state + <u32>vector + 0x9e3779b9);
    makeInput(n, state);
    prepareReference(n);
    referenceStableSort(n);
    prepareCurrent(n);
    currentBuild(n);
    preparePacked(n);
    packedBuild(n);
    for (let i = 0; i < pops; i++) {
      const expected = unchecked(referenceMoves[i]);
      const fromCurrent = currentPop(n - i);
      const fromPacked = packedPop(n - i);
      if (fromCurrent != expected) failures++;
      if (fromPacked != expected) failures++;
    }
  }
  return failures;
}

export function verifySignedBoundaries(
  n: i32,
  vectors: i32,
  pops: i32,
  seed: u32,
): i32 {
  if (n < 2 || n > MAX_N || pops < 1 || pops > n) return -1;
  let failures = 0;
  let state = seed;
  for (let vector = 0; vector < vectors; vector++) {
    state = nextRandom(state + <u32>vector + 0x7f4a7c15);
    makeSignedBoundaryInput(n, state);
    prepareReference(n);
    referenceStableSort(n);
    prepareCurrent(n);
    currentBuild(n);
    preparePacked(n);
    packedBuild(n);
    for (let i = 0; i < pops; i++) {
      const expected = unchecked(referenceMoves[i]);
      const fromCurrent = currentPop(n - i);
      const fromPacked = packedPop(n - i);
      if (fromCurrent != expected) failures++;
      if (fromPacked != expected) failures++;
    }
  }
  return failures;
}

export function benchCurrent(n: i32, vectors: i32, pops: i32, seed: u32): i32 {
  let checksum = 0;
  let state = seed;
  for (let vector = 0; vector < vectors; vector++) {
    state = nextRandom(state + <u32>vector + 0x9e3779b9);
    makeInput(n, state);
    prepareCurrent(n);
    currentBuild(n);
    for (let i = 0; i < pops; i++) checksum ^= currentPop(n - i);
  }
  return checksum;
}

export function benchPacked(n: i32, vectors: i32, pops: i32, seed: u32): i32 {
  let checksum = 0;
  let state = seed;
  for (let vector = 0; vector < vectors; vector++) {
    state = nextRandom(state + <u32>vector + 0x9e3779b9);
    makeInput(n, state);
    preparePacked(n);
    packedBuild(n);
    for (let i = 0; i < pops; i++) checksum ^= packedPop(n - i);
  }
  return checksum;
}
