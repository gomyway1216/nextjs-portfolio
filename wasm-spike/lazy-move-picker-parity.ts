/**
 * Fixed-depth tree-equivalence gate for the isolated stable lazy move picker.
 *
 * The production runtime is the baseline. Two independent instances of the
 * research runtime exercise its default-off and enabled paths with identical
 * live weights and positions. The enabled path uses threshold=2 deliberately
 * so the research branch cannot pass without being exercised.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/lazy-move-picker-parity.ts
 *   node -r tsx/cjs wasm-spike/lazy-move-picker-parity.ts --depth 5
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import { GHI, SFU, type Te } from "../src/components/game/ShogiImproved/types";
import { mulberry32 } from "./nnue-ref";

interface ShogiWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  searchBestMove(
    maxTimeMs: number,
    maxDepth: number,
    quiescenceDepthMax: number,
  ): number;
  getSearchScore(): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  setNnueScaleK(k: number): void;
  setNnueEnabled(flag: number): void;
}

interface ResearchShogiWasm extends ShogiWasm {
  setResearchLazyMovePicker(flag: number, minMoves: number): void;
  getResearchLazyMovePickerEnabled(): number;
  getResearchLazyMovePickerMinMoves(): number;
  getResearchLazyMovePickerNodes(): number;
}

interface Snapshot {
  label: string;
  position: KyokumenImproved;
  tesu: number;
}

interface SearchResult {
  key: number;
  score: number;
  depth: number;
  nodes: number;
  leaves: number;
}

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} requires a value`);
  return value;
}

function instantiate(path: string): ShogiWasm {
  const bytes = readFileSync(path);
  return new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    env: {
      abort(_msg: number, _file: number, line: number, col: number) {
        throw new Error(`WASM abort at ${line}:${col}`);
      },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  }).exports as unknown as ShogiWasm;
}

function installLiveWeights(wasm: ShogiWasm, weights: Uint8Array): void {
  wasm.setNnueBuckets(1);
  if (wasm.getNnueWeightsSize() !== weights.byteLength) {
    throw new Error(
      `weights size mismatch: runtime=${wasm.getNnueWeightsSize()} file=${weights.byteLength}`,
    );
  }
  new Uint8Array(
    wasm.memory.buffer,
    wasm.getNnueWeightsPtr(),
    weights.byteLength,
  ).set(weights);
  wasm.setNnueScaleK(600);
  wasm.setNnueEnabled(1);
}

function sync(wasm: ShogiWasm, position: KyokumenImproved): void {
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      wasm.setSquare(pos, position.ban[pos]);
    }
  }
  for (let koma = SFU; koma <= GHI; koma++)
    wasm.setHand(koma, position.hand[koma] | 0);
  wasm.setSideToMove(position.teban);
  wasm.finalizePosition();
}

function buildSnapshots(): Snapshot[] {
  const wanted = new Set([0, 18, 30, 42]);
  const snapshots: Snapshot[] = [];
  const random = mulberry32(0x1a2b3c4d);
  const position = new KyokumenImproved();
  position.initHirate();

  for (let tesu = 0; tesu <= 42; tesu++) {
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    if (wanted.has(tesu) && legal.length > 0) {
      snapshots.push({ label: `ply${tesu}`, position: position.clone(), tesu });
    }
    if (tesu === 42 || legal.length === 0) break;
    const move = legal[Math.floor(random() * legal.length)];
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
  }
  if (snapshots.length !== wanted.size) {
    throw new Error(
      `snapshot generation ended early: expected ${wanted.size}, got ${snapshots.length}`,
    );
  }
  return snapshots;
}

function isLegalKey(key: number, legal: Te[]): boolean {
  const koma = key & 0x3f;
  const from = (key >> 6) & 0xff;
  const to = (key >> 14) & 0xff;
  const promote = ((key >> 22) & 1) === 1;
  return (
    key !== 0 &&
    legal.some(
      (move) =>
        move.koma === koma &&
        move.from === from &&
        move.to === to &&
        move.promote === promote,
    )
  );
}

function search(
  wasm: ShogiWasm,
  sample: Snapshot,
  depth: number,
): SearchResult {
  sync(wasm, sample.position);
  wasm.clearTT();
  wasm.setRootTesu(sample.tesu);
  const key = wasm.searchBestMove(0, depth, 8);
  return {
    key,
    score: wasm.getSearchScore(),
    depth: wasm.getSearchDepth(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
  };
}

function requireSame(
  label: string,
  baseline: SearchResult,
  candidate: SearchResult,
): void {
  if (JSON.stringify(baseline) !== JSON.stringify(candidate)) {
    throw new Error(
      `${label} changed the fixed-depth search tree:\n` +
        `baseline=${JSON.stringify(baseline)}\n` +
        `candidate=${JSON.stringify(candidate)}`,
    );
  }
}

function main(): void {
  const root = resolve(__dirname, "..");
  const baselinePath = resolve(
    arg("--baseline-wasm") ??
      join(
        root,
        "src",
        "components",
        "game",
        "ShogiImproved",
        "wasm",
        "shogi.wasm",
      ),
  );
  const candidatePath = resolve(
    arg("--candidate-wasm") ??
      join(
        root,
        "wasm-spike",
        "artifacts",
        "shogi-lazy-move-picker-research.wasm",
      ),
  );
  const depth = Number(arg("--depth") ?? "4");
  if (!Number.isInteger(depth) || depth < 1 || depth > 8) {
    throw new Error("--depth must be an integer in 1..8");
  }

  const weights = readFileSync(join(root, "public", "shogi-nnue-weights.bin"));
  const baseline = instantiate(baselinePath);
  const candidateOff = instantiate(candidatePath) as ResearchShogiWasm;
  const candidateOn = instantiate(candidatePath) as ResearchShogiWasm;
  for (const wasm of [baseline, candidateOff, candidateOn])
    installLiveWeights(wasm, weights);

  if (
    candidateOff.getResearchLazyMovePickerEnabled() !== 0 ||
    candidateOff.getResearchLazyMovePickerMinMoves() !== 64
  ) {
    throw new Error(
      "research picker must be disabled by default with threshold=64",
    );
  }
  candidateOff.setResearchLazyMovePicker(0, 2);
  candidateOn.setResearchLazyMovePicker(1, 2);

  let activatedNodes = 0;
  console.log(
    `stable lazy move picker parity: depth=${depth}, live weights=${weights.byteLength} bytes`,
  );
  console.log("position | legal | nodes | leaves | lazy main-search nodes");
  for (const sample of buildSnapshots()) {
    const legal = GenerateMovesImproved.generateLegalMoves(sample.position);
    const expected = search(baseline, sample, depth);
    const off = search(candidateOff, sample, depth);
    const on = search(candidateOn, sample, depth);
    requireSame(`${sample.label} candidate-default path`, expected, off);
    requireSame(`${sample.label} candidate-enabled path`, expected, on);
    if (!isLegalKey(expected.key, legal)) {
      throw new Error(
        `${sample.label} returned illegal/empty root key ${expected.key}`,
      );
    }
    const lazyNodes = candidateOn.getResearchLazyMovePickerNodes();
    if (candidateOff.getResearchLazyMovePickerNodes() !== 0) {
      throw new Error(
        `${sample.label} disabled candidate unexpectedly used the picker`,
      );
    }
    activatedNodes += lazyNodes;
    console.log(
      `${sample.label.padEnd(8)} | ${String(legal.length).padStart(5)} | ` +
        `${String(expected.nodes).padStart(7)} | ${String(expected.leaves).padStart(8)} | ` +
        `${String(lazyNodes).padStart(22)}`,
    );
  }
  if (activatedNodes === 0) {
    throw new Error(
      "enabled research run did not enter any eligible main-search node",
    );
  }
  console.log(
    `PASS: production, candidate-off, and candidate-on are exactly equal across key/score/depth/nodes/leaves; ` +
      `enabled picker activated at ${activatedNodes} main-search nodes`,
  );
}

main();
