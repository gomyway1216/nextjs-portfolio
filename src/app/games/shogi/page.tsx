/**
 * Shogi game page.
 *
 * This is the canonical Shogi route. It renders the improved implementation
 * (stronger NNUE eval, 30-ply opening book, kifu, handicap, takeback, 3D
 * pieces, selectable typefaces). The former `/games/shogi-improved` route now
 * permanently redirects here (see next.config.ts).
 */

import { ShogiImproved } from '@/components/game/ShogiImproved';
import { ShogiEngineParityHarness } from '@/components/game/ShogiImproved/ShogiEngineParityHarness';
import { isExactShogiEngineParityQuery } from '@/components/game/ShogiImproved/shogiEngineParityProtocol';

export default async function ShogiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isExactShogiEngineParityQuery(await searchParams)) {
    return <ShogiEngineParityHarness />;
  }
  return <ShogiImproved />;
}
