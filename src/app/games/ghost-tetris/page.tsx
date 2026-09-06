import { GhostTetris } from '@/components/game/GhostTetris';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('ghost-tetris');

export default function GhostTetrisPage() {
  return <GhostTetris />;
}
