import { BigWheelForPlayer } from '@/components/game/BigWheel/BigWheelForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('big-wheel');

export default function BigWheelPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <BigWheelForPlayer />
    </main>
  );
}
