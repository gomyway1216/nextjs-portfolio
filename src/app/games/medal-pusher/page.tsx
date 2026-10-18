import { MedalPusherForPlayer } from '@/components/game/MedalPusher/MedalPusherForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('medal-pusher');

export default function MedalPusherPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <MedalPusherForPlayer />
    </main>
  );
}
