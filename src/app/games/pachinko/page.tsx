import { PachinkoForPlayer } from '@/components/game/Pachinko/PachinkoForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('pachinko');

export default function PachinkoPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <PachinkoForPlayer />
    </main>
  );
}
