/**
 * Shogi game page.
 *
 * This is the canonical Shogi route. It renders the improved implementation
 * (stronger NNUE eval, 30-ply opening book, kifu, handicap, takeback, 3D
 * pieces, selectable typefaces). The former `/games/shogi-improved` route now
 * permanently redirects here (see next.config.ts).
 */

import { ShogiImproved } from '@/components/game/ShogiImproved';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('shogi');

export default function ShogiPage() {
  return <ShogiImproved />;
}
