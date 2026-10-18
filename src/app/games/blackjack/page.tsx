import { BlackjackForPlayer } from '@/components/game/Blackjack/BlackjackForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('blackjack');

export default function BlackjackPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <BlackjackForPlayer />
    </main>
  );
}
