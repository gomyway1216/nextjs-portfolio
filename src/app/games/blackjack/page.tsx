import { BlackjackForPlayer } from '@/components/game/Blackjack/BlackjackForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('blackjack');

export default function BlackjackPage() {
  return <BlackjackForPlayer />;
}
