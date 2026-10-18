import { MedalCenterForPlayer } from '@/components/game/MedalCenter/MedalCenterForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('medal-center');

export default function MedalCenterPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <MedalCenterForPlayer />
    </main>
  );
}
