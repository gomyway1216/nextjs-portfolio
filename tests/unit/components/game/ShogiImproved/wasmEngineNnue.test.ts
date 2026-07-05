/**
 * Unit tests for the NNUE weight-loading API of wasmEngine.ts.
 *
 * Uses the REAL committed weight file (public/shogi-nnue-weights.bin) and the
 * real WASM engine, so these tests also pin the deployed asset to the exact
 * size the engine requires. Test order matters: the module-scope loaded/
 * enabled state starts pristine in this file, so the "not loaded yet" paths
 * run first.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import {
  isNnueEnabled,
  isNnueWeightsLoaded,
  loadNnueWeights,
  NNUE_WEIGHTS_BYTES,
  setWasmNnueEnabled,
  wasmSearchBestMove,
} from '@/components/game/ShogiImproved/wasmEngine';

const weightsPath = join(process.cwd(), 'public', 'shogi-nnue-weights.bin');

function readWeights(): Uint8Array {
  const buf = readFileSync(weightsPath);
  // Copy out of the (possibly pooled) Buffer into a plain Uint8Array.
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return bytes;
}

describe('wasmEngine NNUE loading', () => {
  it('ships a weight asset of exactly the size the engine expects', () => {
    expect(readFileSync(weightsPath).byteLength).toBe(NNUE_WEIGHTS_BYTES);
  });

  it('cannot be enabled before weights are loaded (stays on V3)', () => {
    expect(isNnueWeightsLoaded()).toBe(false);
    expect(setWasmNnueEnabled(true)).toBe(false);
    expect(isNnueEnabled()).toBe(false);
  });

  it('rejects weights with a wrong byte size', () => {
    expect(loadNnueWeights(new Uint8Array(NNUE_WEIGHTS_BYTES - 1), 600)).toBe(false);
    expect(loadNnueWeights(new Uint8Array(NNUE_WEIGHTS_BYTES + 1), 600)).toBe(false);
    expect(loadNnueWeights(new Uint8Array(0), 600)).toBe(false);
    expect(isNnueWeightsLoaded()).toBe(false);
  });

  it('rejects an invalid sigmoid scale K', () => {
    const bytes = readWeights();
    expect(loadNnueWeights(bytes, 0)).toBe(false);
    expect(loadNnueWeights(bytes, -5)).toBe(false);
    expect(loadNnueWeights(bytes, Number.NaN)).toBe(false);
    expect(isNnueWeightsLoaded()).toBe(false);
  });

  it('loads the real run1m-base weights', () => {
    expect(loadNnueWeights(readWeights(), 600)).toBe(true);
    expect(isNnueWeightsLoaded()).toBe(true);
    // Loading alone must not flip the evaluation.
    expect(isNnueEnabled()).toBe(false);
  });

  it('enables NNUE after loading and searches a legal move with it', () => {
    expect(setWasmNnueEnabled(true)).toBe(true);
    expect(isNnueEnabled()).toBe(true);

    const k = InitialPositionImproved.createInitialPosition();
    const te = wasmSearchBestMove(k, 0, 200, 32, 8);
    expect(te).not.toBeNull();
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    expect(
      legal.some((m) => m.koma === te!.koma && m.from === te!.from && m.to === te!.to && m.promote === te!.promote)
    ).toBe(true);
  });

  it('can be switched back to V3', () => {
    expect(setWasmNnueEnabled(false)).toBe(false);
    expect(isNnueEnabled()).toBe(false);
    // Weights stay loaded; re-enabling works without another load.
    expect(setWasmNnueEnabled(true)).toBe(true);
    setWasmNnueEnabled(false);
  });
});
