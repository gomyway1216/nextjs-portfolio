import { SicBoForPlayer } from '@/components/game/SicBo/SicBoForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('sic-bo');

export default function SicBoPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <SicBoForPlayer />
    </main>
  );
}
