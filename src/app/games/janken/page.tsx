import { JankenForPlayer } from '@/components/game/Janken/JankenForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('janken');

export default function JankenPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <JankenForPlayer />
    </main>
  );
}
