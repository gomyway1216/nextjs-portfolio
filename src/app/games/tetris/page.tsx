/**
 * Tetris game page
 */

import Tetris from '@/components/game/Tetris';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('tetris');

export default function TetrisPage() {
  return <Tetris />;
}
