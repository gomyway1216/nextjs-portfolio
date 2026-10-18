import { BallBingoForPlayer } from '@/components/game/BallBingo/BallBingoForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('ball-bingo');

export default function BallBingoPage() {
  return <BallBingoForPlayer />;
}
