import { CrapsForPlayer } from '@/components/game/Craps/CrapsForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('craps');

export default function CrapsPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <CrapsForPlayer />
    </main>
  );
}
