import { FishingForPlayer } from '@/components/game/Fishing/FishingForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('fishing');

export default function FishingPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <FishingForPlayer />
    </main>
  );
}
