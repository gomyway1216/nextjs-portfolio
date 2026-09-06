import { Blackjack } from '@/components/game/Blackjack';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('blackjack');

export default function BlackjackPage() {
  return <Blackjack />;
}
