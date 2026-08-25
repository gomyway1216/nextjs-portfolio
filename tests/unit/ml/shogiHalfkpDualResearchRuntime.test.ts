import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { KyokumenImproved } from '../../../src/components/game/ShogiImproved/KyokumenImproved';
import { GOTE } from '../../../src/components/game/ShogiImproved/types';
import {
  NNUE_HALFKP_DUAL_FORMAT,
  NNUE_HALFKP_DUAL_LAYOUT,
  NNUE_H1,
  NNUE_H2,
  NNUE_LAYOUT,
  bucketsForByteLength,
  dualWeightsFromBuffer,
  extractDualFeatures,
  extractFeatures,
  intForward,
  intForwardDual,
  liftLegacyWeightsToDualHalfkp,
  weightsFromBuffer,
} from '../../../wasm-spike/nnue-ref';

function identity(bytes: Uint8Array): { bytes: number; sha256: string } {
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function instantiate(bytes: Uint8Array) {
  return new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    env: {
      abort: () => {
        throw new Error('WASM abort');
      },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  }).exports as WebAssembly.Exports & {
    getNnueBuckets(): number;
    getNnueWeightsSize(): number;
    setNnueBuckets(format: number): void;
  };
}

describe('dual-perspective HalfKP research runtime', () => {
  it('keeps production byte-pinned and isolates the dual runtime in reproducible research artifacts', () => {
    const productionSource = readFileSync(join(process.cwd(), 'wasm-spike', 'assembly', 'index.ts'));
    const productionWasm = readFileSync(
      join(process.cwd(), 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm'),
    );
    const dualPatch = readFileSync(
      join(process.cwd(), 'wasm-spike', 'assembly', 'halfkp81-dual-research.patch'),
    );
    const dualWasm = readFileSync(
      join(process.cwd(), 'wasm-spike', 'artifacts', 'shogi-halfkp81-dual-research.wasm'),
    );

    expect(identity(productionSource)).toEqual({
      bytes: 147_394,
      sha256: 'a6f833f1d0c12007f667542dc29b2f17a4e8b0ed14f9dd6ea71f196ba3ce857a',
    });
    expect(identity(productionWasm)).toEqual({
      bytes: 36_545,
      sha256: '9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31',
    });
    expect(identity(dualPatch)).toEqual({
      bytes: 8_051,
      sha256: '1387986b8e94883c88e499a7f2e8b0ef5403c10bec2023b79dcb98c882136d59',
    });
    expect(identity(dualWasm)).toEqual({
      bytes: 37_733,
      sha256: 'b5ee2227963ba2f1221cdd41e8cc487a49b534cee8b01cf3933e3b50db9deb62',
    });

    const production = instantiate(productionWasm);
    const research = instantiate(dualWasm);
    production.setNnueBuckets(NNUE_HALFKP_DUAL_FORMAT);
    research.setNnueBuckets(NNUE_HALFKP_DUAL_FORMAT);
    expect(production.getNnueBuckets()).toBe(1);
    expect(research.getNnueBuckets()).toBe(NNUE_HALFKP_DUAL_FORMAT);
    expect(research.getNnueWeightsSize()).toBe(94_675_268);
  });

  it('detects the distinct layout and exact-lifts the legacy tail into 512 -> 32 -> 32 -> 1', () => {
    expect(NNUE_HALFKP_DUAL_LAYOUT.totalBytes).toBe(94_675_268);
    expect(bucketsForByteLength(NNUE_HALFKP_DUAL_LAYOUT.totalBytes)).toBe(
      NNUE_HALFKP_DUAL_FORMAT,
    );

    const sourceBytes = new Uint8Array(NNUE_LAYOUT.totalBytes);
    const source = weightsFromBuffer(sourceBytes.buffer);
    source.b1[0] = 37;
    source.w2[0] = 11;
    source.b2[0] = -64;
    source.w3[0] = 9;
    source.b3[0] = 1234;
    const dualBytes = liftLegacyWeightsToDualHalfkp(sourceBytes);
    const dual = dualWeightsFromBuffer(dualBytes.buffer);

    expect(dualBytes.byteLength).toBe(NNUE_HALFKP_DUAL_LAYOUT.totalBytes);
    expect(dual.w2[0]).toBe(11);
    expect(dual.w2[NNUE_H1]).toBe(0);
    expect(dual.w3[0]).toBe(64);
    expect(dual.w3[1]).toBe(0);
    expect(dual.w3[NNUE_H2 + 1]).toBe(64);
    expect(dual.w4[0]).toBe(9);
    expect(dual.b4[0]).toBe(1234);

    const position = new KyokumenImproved();
    position.initHirate();
    for (const teban of [position.teban, GOTE]) {
      position.setTeban(teban);
      expect(intForwardDual(dual, extractDualFeatures(position))).toBe(
        intForward(source, extractFeatures(position, 1)),
      );
    }
  });
});
