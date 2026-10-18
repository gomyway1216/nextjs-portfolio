import { VideoPokerForPlayer } from '@/components/game/VideoPoker/VideoPokerForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('video-poker');

export default function VideoPokerPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <VideoPokerForPlayer />
    </main>
  );
}
