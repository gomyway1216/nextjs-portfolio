import { CoinMazeForPlayer } from '@/components/game/CoinMaze/CoinMazeForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('coin-maze');

export default function CoinMazePage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <CoinMazeForPlayer />
    </main>
  );
}
