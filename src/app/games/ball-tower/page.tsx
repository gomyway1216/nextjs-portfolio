import { BallTowerForPlayer } from '@/components/game/BallTower/BallTowerForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('ball-tower');

export default function BallTowerPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <BallTowerForPlayer />
    </main>
  );
}
