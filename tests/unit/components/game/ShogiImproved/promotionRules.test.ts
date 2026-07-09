import { describe, expect, it } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';
import { isForcedPromotion, buildDeclinablePromotion } from '@/components/game/ShogiImproved/PromotionRulesImproved';
import { EMPTY, GOU, SOU, SKA, SHI, SGI, SFU, SKE, SENTE, type Te } from '@/components/game/ShogiImproved/types';

function pos(suji: number, dan: number): number {
  return (suji << 4) + dan;
}

function emptyBoardWithKings(): number[][] {
  const E = EMPTY;
  return [
    [GOU, E, E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E, E, E],
    [SOU, E, E, E, E, E, E, E, E],
  ];
}

describe('PromotionRulesImproved', () => {
  describe('isForcedPromotion', () => {
    it('forces promotion for a Sente pawn reaching the last rank (dan 1)', () => {
      expect(isForcedPromotion(SFU, SENTE, 1)).toBe(true);
      expect(isForcedPromotion(SFU, SENTE, 2)).toBe(false);
    });

    it('forces promotion for a Sente knight reaching the last two ranks (dan 1-2)', () => {
      expect(isForcedPromotion(SKE, SENTE, 1)).toBe(true);
      expect(isForcedPromotion(SKE, SENTE, 2)).toBe(true);
      expect(isForcedPromotion(SKE, SENTE, 3)).toBe(false);
    });

    it('never forces promotion for silver, bishop, or rook', () => {
      for (const dan of [1, 2, 3]) {
        expect(isForcedPromotion(SGI, SENTE, dan)).toBe(false);
        expect(isForcedPromotion(SKA, SENTE, dan)).toBe(false);
        expect(isForcedPromotion(SHI, SENTE, dan)).toBe(false);
      }
    });
  });

  describe('buildDeclinablePromotion', () => {
    it('bishop entering the promotion zone: the engine only generates the promote move, but decline is legal', () => {
      // Sente bishop at 5五 moving to 3三 (inside the promotion zone, dan<=3).
      const k = new KyokumenImproved();
      InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
      k.ban[pos(5, 5)] = SKA;
      k.initAll();
      k.setTeban(SENTE);

      const legal = GenerateMovesImproved.generateLegalMoves(k);
      const toSquare = pos(3, 3);
      const candidates = legal.filter((m) => m.from === pos(5, 5) && m.to === toSquare);

      // Confirms the engine-pruning behavior this fix works around: only the
      // promoting variant is generated for bishop/rook.
      expect(candidates).toHaveLength(1);
      expect(candidates[0].promote).toBe(true);

      const declined = buildDeclinablePromotion(candidates[0], SENTE);
      expect(declined).not.toBeNull();
      expect((declined as Te).promote).toBe(false);
      expect((declined as Te).from).toBe(pos(5, 5));
      expect((declined as Te).to).toBe(toSquare);
      expect((declined as Te).koma).toBe(SKA);
    });

    it('rook entering the promotion zone: decline is legal', () => {
      const k = new KyokumenImproved();
      InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
      k.ban[pos(5, 5)] = SHI;
      k.initAll();
      k.setTeban(SENTE);

      const legal = GenerateMovesImproved.generateLegalMoves(k);
      const toSquare = pos(5, 3);
      const candidates = legal.filter((m) => m.from === pos(5, 5) && m.to === toSquare);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].promote).toBe(true);

      const declined = buildDeclinablePromotion(candidates[0], SENTE);
      expect(declined).not.toBeNull();
      expect((declined as Te).promote).toBe(false);
    });

    it('pawn reaching the last rank: promotion is forced, no decline offered', () => {
      const k = new KyokumenImproved();
      InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
      k.ban[pos(5, 2)] = SFU;
      k.initAll();
      k.setTeban(SENTE);

      const legal = GenerateMovesImproved.generateLegalMoves(k);
      const toSquare = pos(5, 1);
      const candidates = legal.filter((m) => m.from === pos(5, 2) && m.to === toSquare);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].promote).toBe(true);

      expect(buildDeclinablePromotion(candidates[0], SENTE)).toBeNull();
    });

    it('knight reaching the second-to-last rank: promotion is forced, no decline offered', () => {
      const k = new KyokumenImproved();
      InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
      k.ban[pos(5, 4)] = SKE;
      k.initAll();
      k.setTeban(SENTE);

      const legal = GenerateMovesImproved.generateLegalMoves(k);
      const toSquare = pos(4, 2); // knight jump to dan 2 (forced zone for Sente)
      const candidates = legal.filter((m) => m.from === pos(5, 4) && m.to === toSquare);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].promote).toBe(true);

      expect(buildDeclinablePromotion(candidates[0], SENTE)).toBeNull();
    });

    it('silver entering the promotion zone: the engine already generates both variants (no reconstruction needed)', () => {
      const k = new KyokumenImproved();
      InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
      k.ban[pos(5, 4)] = SGI;
      k.initAll();
      k.setTeban(SENTE);

      const legal = GenerateMovesImproved.generateLegalMoves(k);
      const toSquare = pos(5, 3); // silver steps straight forward into the zone
      const candidates = legal.filter((m) => m.from === pos(5, 4) && m.to === toSquare);

      expect(candidates.some((m) => m.promote)).toBe(true);
      expect(candidates.some((m) => !m.promote)).toBe(true);
    });
  });
});
