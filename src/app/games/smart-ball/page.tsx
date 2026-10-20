import { SmartBallForPlayer } from '@/components/game/SmartBall/SmartBallForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('smart-ball');

export default function SmartBallPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <SmartBallForPlayer />
    </main>
  );
}
