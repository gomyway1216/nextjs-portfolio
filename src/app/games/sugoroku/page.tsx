import { SugorokuForPlayer } from '@/components/game/Sugoroku/SugorokuForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('sugoroku');

export default function SugorokuPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <SugorokuForPlayer />
    </main>
  );
}
