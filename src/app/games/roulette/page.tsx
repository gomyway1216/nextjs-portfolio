import { RouletteForPlayer } from '@/components/game/Roulette/RouletteForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('roulette');

export default function RoulettePage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <RouletteForPlayer />
    </main>
  );
}
