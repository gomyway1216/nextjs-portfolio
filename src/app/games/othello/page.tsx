/**
 * Othello game page
 */

import { Othello } from '@/components/game/Othello';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('othello');

export default function OthelloPage() {
  return <Othello />;
}
