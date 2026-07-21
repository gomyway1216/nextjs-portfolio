import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { KyokumenImproved } from '../../../src/components/game/ShogiImproved/KyokumenImproved';
import { GOTE, SENTE } from '../../../src/components/game/ShogiImproved/types';
import {
  NNUE_BONAPIECE_ACTIVE,
  NNUE_BONAPIECE_FE_END,
  NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT,
  NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT,
  NNUE_H1,
  NNUE_H2,
  bonaPieceHalfkpSingleWeightsFromBuffer,
  bucketsForByteLength,
  extractBonaPieceHalfkpFeatures,
  intForwardBonaPieceHalfkpSingle,
  parseSfen,
} from '../../../wasm-spike/nnue-ref';

interface ResearchWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(format: number): void;
  getNnueBuckets(): number;
  setNnueEnabled(flag: number): void;
  nnueEvaluate(): number;
  nnueEvaluateFast(): number;
  nnueAccMismatch(): number;
}

function identity(bytes: Uint8Array): { bytes: number; sha256: string } {
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function instantiate(bytes: Uint8Array): ResearchWasm {
  return new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    env: {
      abort: () => { throw new Error('WASM abort'); },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  }).exports as unknown as ResearchWasm;
}

function sync(wasm: ResearchWasm, position: KyokumenImproved): void {
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const square = (suji << 4) + dan;
      if (position.ban[square] !== 0) wasm.setSquare(square, position.ban[square]);
    }
  }
  for (let koma = 0; koma < 64; koma++) {
    if (position.hand[koma] > 0) wasm.setHand(koma, position.hand[koma]);
  }
  wasm.setSideToMove(position.teban);
  wasm.finalizePosition();
}

function makeSparseFingerprintWeights(): Uint8Array {
  const bytes = new Uint8Array(NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT.totalBytes);
  const weights = bonaPieceHalfkpSingleWeightsFromBuffer(bytes.buffer);
  // Every feature fingerprints the first eight accumulator lanes. The other
  // lanes have positive bias so the 256-wide dense path is non-vacuous.
  weights.b1.fill(17);
  for (let feature = 0; feature < 81 * NNUE_BONAPIECE_FE_END; feature++) {
    const base = feature * NNUE_H1;
    for (let lane = 0; lane < 8; lane++) {
      weights.w1Board[base + lane] = ((feature * 17 + lane * 29) % 31) - 15;
    }
  }
  for (let row = 0; row < NNUE_H2; row++) {
    for (let column = 0; column < NNUE_H1; column++) {
      weights.w2[row * NNUE_H1 + column] = ((row * 19 + column * 7) % 9) - 4;
    }
    weights.w3[row] = row - 16;
    weights.b2[row] = 64 * (row % 5);
  }
  weights.b3[0] = 12345;
  return bytes;
}

describe('single-perspective BonaPiece HalfKP format84 research runtime', () => {
  it('is isolated from production and pins the headerless trainer layout', () => {
    const productionSource = readFileSync(join(process.cwd(), 'wasm-spike', 'assembly', 'index.ts'));
    const productionWasm = readFileSync(
      join(process.cwd(), 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm'),
    );
    const researchWasm = readFileSync(
      join(process.cwd(), 'wasm-spike', 'artifacts', 'shogi-bonapiece-halfkp-research.wasm'),
    );
    const evidenceBytes = readFileSync(
      join(
        process.cwd(),
        'wasm-spike',
        'artifacts',
        'shogi-bonapiece-halfkp-format84-evidence.json',
      ),
    );
    expect(identity(productionSource)).toEqual({
      bytes: 139_447,
      sha256: '0a522e5e167e9a6070d2d1f339ceaada48f623493a827038b744b2b49163115c',
    });
    expect(identity(productionWasm)).toEqual({
      bytes: 35_597,
      sha256: 'e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c',
    });
    expect(identity(researchWasm)).toEqual({
      bytes: 39_516,
      sha256: 'da093d0e6f6c2f046072784ba757de30aa2f41bae11270b7b90c5209c22fafdb',
    });
    expect(identity(evidenceBytes)).toEqual({
      bytes: 3_461,
      sha256: 'b6f96b13635391188398958ec2a6064daf938f1f778a76f34a1e951fae835ab3',
    });
    const evidence = JSON.parse(evidenceBytes.toString('utf8')) as Record<string, any>;
    expect(evidence.runtime_selector).toBe(84);
    expect(evidence.parity.actual_trainer_weights).toMatchObject({
      positions: 64,
      sente_to_move: 32,
      gote_to_move: 32,
      torch_ts_wasm_static_incremental_bit_exact: true,
      accumulator_mismatches: 0,
    });
    expect(evidence.runtime_g1).toMatchObject({ status: 'pass', strength_evidence: false });
    expect(evidence.fixed_time_match_smoke).toMatchObject({
      status: 'pass',
      candidate_selector_auto_detected: 84,
      stable_selector_auto_detected: 1,
      technical_faults: 0,
    });
    expect(evidence.promotion_authorized).toBe(false);
    expect(NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT).toEqual({
      format: 84,
      buckets: 81,
      w1BoardOff: 0,
      w1HandOff: 64_198_656,
      b1Off: 64_198_656,
      w2Off: 64_199_680,
      b2Off: 64_216_064,
      w3Off: 64_216_192,
      b3Off: 64_216_256,
      totalBytes: 64_216_260,
    });
    expect(bucketsForByteLength(64_216_260)).toBe(NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT);

    const production = instantiate(productionWasm);
    const research = instantiate(researchWasm);
    production.setNnueBuckets(NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT);
    research.setNnueBuckets(NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT);
    expect(production.getNnueBuckets()).toBe(1);
    expect(research.getNnueBuckets()).toBe(NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT);
    expect(research.getNnueWeightsSize()).toBe(64_216_260);
  });

  it('extracts official default semantics and matches TS/full/fast bit-exactly', () => {
    const bytes = makeSparseFingerprintWeights();
    const weights = bonaPieceHalfkpSingleWeightsFromBuffer(bytes.buffer);
    const wasmBytes = readFileSync(
      join(process.cwd(), 'wasm-spike', 'artifacts', 'shogi-bonapiece-halfkp-research.wasm'),
    );
    const wasm = instantiate(wasmBytes);
    wasm.setNnueBuckets(NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT);
    new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), bytes.byteLength).set(bytes);
    wasm.setNnueEnabled(1);

    const position = new KyokumenImproved();
    position.initHirate();
    for (const side of [SENTE, GOTE]) {
      position.setTeban(side);
      const features = extractBonaPieceHalfkpFeatures(position);
      expect(features.us).toHaveLength(NNUE_BONAPIECE_ACTIVE);
      expect(features.them).toHaveLength(NNUE_BONAPIECE_ACTIVE);
      // Kings are 5i/5a, both square 44 in their normalized frames.
      expect(features.us.every((feature) => Math.floor(feature / NNUE_BONAPIECE_FE_END) === 44)).toBe(true);
      const reference = intForwardBonaPieceHalfkpSingle(weights, features);
      sync(wasm, position);
      expect(wasm.nnueEvaluate()).toBe(reference);
      expect(wasm.nnueEvaluateFast()).toBe(reference);
      expect(wasm.nnueAccMismatch()).toBe(0);
    }
  });

  it('pins slot hands, promoted-minor collapse, horse/dragon, and king exclusion', () => {
    const handPosition = parseSfen(
      'lnsgkgsnl/1r5b1/ppppppp2/9/9/9/3PPPPPP/1B5R1/LNSGKGSNL b 3P2p 1',
    );
    const handFeatures = extractBonaPieceHalfkpFeatures(handPosition).us;
    const kingBase = 44 * NNUE_BONAPIECE_FE_END;
    for (const bona of [1, 2, 3, 20, 21]) expect(handFeatures).toContain(kingBase + bona);

    const promotedPosition = parseSfen(
      '4k4/9/9/9/4+P+L+N+S1/9/9/9/4K+B+R2 b 14P3L3N3S4GBR 1',
    );
    const promoted = extractBonaPieceHalfkpFeatures(promotedPosition).us;
    // +P/+L/+N/+S all use friend-gold base 738; +B/+R use 1062/1386.
    for (const square of [40, 31, 22, 13]) expect(promoted).toContain(kingBase + 738 + square);
    expect(promoted).toContain(kingBase + 1062 + 35);
    expect(promoted).toContain(kingBase + 1386 + 26);
    // Two kings condition their own w1 tables and do not add active rows.
    expect(promoted).toHaveLength(NNUE_BONAPIECE_ACTIVE);
  });
});
