import { MemoryMaze } from '@/components/game/MemoryMaze';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('memory-maze');

export default function MemoryMazePage() {
  return <MemoryMaze />;
}
