import { BaccaratForPlayer } from '@/components/game/Baccarat/BaccaratForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('baccarat');

export default function BaccaratPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <BaccaratForPlayer />
    </main>
  );
}
