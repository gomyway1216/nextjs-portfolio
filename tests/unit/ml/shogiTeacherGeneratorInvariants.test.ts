import { describe, expect, it } from 'vitest';

import {
  parseGeneratorArgs,
  playOneGame,
  resolveCanonicalLegalMove,
  validatePhysicalPositionInvariant,
} from '../../../ml/generate-teacher';
import { positionFromSfen } from '../../../ml/shogi-sfen';
import { GenerateMovesImproved } from '../../../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../../../src/components/game/ShogiImproved/InitialPositionImproved';
import { GHI, SKA, Te } from '../../../src/components/game/ShogiImproved/types';

describe('teacher generator safety boundaries', () => {
  it('accepts the initial inventory and preserves it after a canonical legal move', () => {
    const position = InitialPositionImproved.createInitialPosition();
    expect(validatePhysicalPositionInvariant(position)).toEqual({ ok: true });

    const legal = GenerateMovesImproved.generateLegalMoves(position);
    position.move(legal[0]);
    expect(validatePhysicalPositionInvariant(position)).toEqual({ ok: true });
  });

  it('rejects duplicated material and extra kings before they can be serialized', () => {
    const extraBishop = InitialPositionImproved.createInitialPosition();
    extraBishop.put((5 << 4) + 5, SKA);
    expect(validatePhysicalPositionInvariant(extraBishop)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('piece 6 count mismatch'),
    });

    const extraKing = InitialPositionImproved.createInitialPosition();
    extraKing.put((5 << 4) + 5, GHI + 1);
    expect(validatePhysicalPositionInvariant(extraKing)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('expected one king per side'),
    });
  });

  it('rejects the first real corrupt position from the second-Mac teacher shard', () => {
    const corrupt = positionFromSfen(
      'lns1k2nl/3s2rs1/1+Bppppg1p/pp4pp1/9/1BP4P1/PP1PPPP1P/7R1/LNSGKGSNL w - 24'
    ).position;
    expect(validatePhysicalPositionInvariant(corrupt)).toMatchObject({
      ok: false,
    });
  });

  it('returns only the canonical legal object and rejects a stale selector move', () => {
    const position = InitialPositionImproved.createInitialPosition();
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    const canonical = legal[0];
    const selectorCopy = new Te(
      canonical.koma,
      canonical.from,
      canonical.to,
      canonical.promote,
      GHI
    );

    const resolved = resolveCanonicalLegalMove(selectorCopy, legal);
    expect(resolved).toBe(canonical);
    expect(resolved?.capture).toBe(canonical.capture);

    const stale = new Te(SKA, canonical.from, canonical.to, canonical.promote, canonical.capture);
    expect(resolveCanonicalLegalMove(stale, legal)).toBeNull();
  });

  it('never applies a stale selector move during an actual generated game', () => {
    const staleSelector = {
      getNextTe: () => new Te(SKA, (5 << 4) + 5, (5 << 4) + 4),
    };
    const args = {
      ...parseGeneratorArgs([]),
      epsilon: 0,
      minPly: 0,
      maxPly: 8,
      wasm: false,
    };
    const generated: string[] = [];

    playOneGame(staleSelector, () => 0, args, ({ sfen }) => generated.push(sfen));

    expect(generated.length).toBeGreaterThan(0);
    for (const sfen of generated) {
      expect(validatePhysicalPositionInvariant(positionFromSfen(sfen).position)).toEqual({ ok: true });
    }
  });

  it('fails closed on unknown or incomplete CLI flags', () => {
    expect(() => parseGeneratorArgs(['--wasmm'])).toThrow(/unknown option: --wasmm/);
    expect(() => parseGeneratorArgs(['--target', '--wasm'])).toThrow(/--target requires a value/);
    expect(parseGeneratorArgs(['--wasm', '--target', '42'])).toMatchObject({
      wasm: true,
      target: 42,
    });
  });
});
