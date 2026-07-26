import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { positionFromSfen } from '../../../ml/shogi-sfen';
import { GenerateMovesImproved } from '../../../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../../../src/components/game/ShogiImproved/KyokumenImproved';
import { GOTE } from '../../../src/components/game/ShogiImproved/types';
import {
  loadShogiWasm,
  syncWasm,
  teFromWasmKey,
  type ShogiSearchWasm,
} from '../../../wasm-spike/search-driver';

type ProductionDualHashWasm = ShogiSearchWasm & {
  getHash(): number;
  getSecondaryBanHash(): number;
  getSecondaryHandHash(): number;
  getSecondaryHash(): number;
  getSecondaryHashVal(): number;
};

function tree(wasm: ShogiSearchWasm) {
  return {
    key: wasm.searchBestMove(0, 5, 8),
    score: wasm.getSearchScore(),
    depth: wasm.getSearchDepth(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
  };
}

function run(wasm: ShogiSearchWasm, position: KyokumenImproved, tesu: number) {
  syncWasm(wasm, position);
  wasm.setRootTesu(tesu);
  return tree(wasm);
}

describe('production dual-hash WASM', () => {
  it('keeps the primary JS key exact while making the secondary key incremental and side-aware', () => {
    const incremental = loadShogiWasm() as ProductionDualHashWasm;
    const reference = loadShogiWasm() as ProductionDualHashWasm;
    const position = new KyokumenImproved();
    position.initHirate();

    syncWasm(incremental, position);
    const initialSecondary = incremental.getSecondaryHashVal();
    expect(incremental.getHash()).toBe(position.BanHash ^ position.HandHash);
    expect(incremental.getSecondaryBanHash() ^ incremental.getSecondaryHandHash()).toBe(
      incremental.getSecondaryHash(),
    );

    position.setTeban(GOTE);
    syncWasm(reference, position);
    expect(reference.getSecondaryHash()).toBe(incremental.getSecondaryHash());
    expect(reference.getSecondaryHashVal()).not.toBe(initialSecondary);

    position.setTeban(incremental.getTeban());
    for (let ply = 0; ply < 32; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(position);
      expect(moves.length).toBeGreaterThan(0);
      const move = moves[(ply * 17 + 3) % moves.length];
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
      incremental.applyMove(move.koma, move.from, move.to, move.promote ? 1 : 0);
      syncWasm(reference, position);
      expect(incremental.getHash()).toBe(position.BanHash ^ position.HandHash);
      expect(incremental.getSecondaryBanHash()).toBe(reference.getSecondaryBanHash());
      expect(incremental.getSecondaryHandHash()).toBe(reference.getSecondaryHandHash());
      expect(incremental.getSecondaryHashVal()).toBe(reference.getSecondaryHashVal());
    }
  });

  it('keeps a colliding primary TT entry from steering the paired position', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(process.cwd(), 'wasm-spike', 'dual-hash-lock-collision-fixture-v1.json'),
        'utf8',
      ),
    ) as {
      positions: {
        a: { sfen: string; tesu: number };
        b: { sfen: string; tesu: number };
      };
    };
    const a = positionFromSfen(fixture.positions.a.sfen).position;
    const b = positionFromSfen(fixture.positions.b.sfen).position;
    const wasm = loadShogiWasm() as ProductionDualHashWasm;

    wasm.clearTT();
    run(wasm, a, fixture.positions.a.tesu);
    const afterA = run(wasm, b, fixture.positions.b.tesu);
    wasm.clearTT();
    const cleanB = run(wasm, b, fixture.positions.b.tesu);

    expect(afterA).toEqual(cleanB);
    const best = teFromWasmKey(afterA.key, b);
    expect(GenerateMovesImproved.generateLegalMoves(b)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          koma: best.koma,
          from: best.from,
          to: best.to,
          promote: best.promote,
        }),
      ]),
    );
    expect('setResearchDualHashLock' in wasm).toBe(false);
    expect('getResearchDualHashTtLockRejects' in wasm).toBe(false);
  });

  it('preserves legal-move counts and both keys across the fixed 64-position holdout', () => {
    const holdout = JSON.parse(
      readFileSync(
        join(process.cwd(), 'wasm-spike', 'lazy-move-picker-fixture-v2.json'),
        'utf8',
      ),
    ) as {
      caseCount: number;
      cases: Array<{ sfen: string; legalMoves: number }>;
    };
    expect(holdout.caseCount).toBe(64);
    expect(holdout.cases).toHaveLength(64);
    const wasm = loadShogiWasm() as ProductionDualHashWasm;

    for (const entry of holdout.cases) {
      const position = positionFromSfen(entry.sfen).position;
      syncWasm(wasm, position);
      const before = [wasm.getHash(), wasm.getSecondaryHashVal()];
      expect(wasm.countLegalMoves()).toBe(
        GenerateMovesImproved.generateLegalMoves(position).length,
      );
      expect([wasm.getHash(), wasm.getSecondaryHashVal()]).toEqual(before);
    }
  });
});
