import { DailyMovePuzzle } from '@/components/game/DailyMovePuzzle';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('daily-move-puzzle');

export default function DailyMovePuzzlePage() {
  return <DailyMovePuzzle />;
}
