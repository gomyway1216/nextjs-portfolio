import { KenoForPlayer } from '@/components/game/Keno/KenoForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('keno');

export default function KenoPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <KenoForPlayer />
    </main>
  );
}
