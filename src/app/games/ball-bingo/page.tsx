import { BallBingoForPlayer } from '@/components/game/BallBingo/BallBingoForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('ball-bingo');

export default function BallBingoPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <BallBingoForPlayer />
    </main>
  );
}
