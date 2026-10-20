import { HighLowForPlayer } from '@/components/game/HighLow/HighLowForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('high-low');

export default function HighLowPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <HighLowForPlayer />
    </main>
  );
}
