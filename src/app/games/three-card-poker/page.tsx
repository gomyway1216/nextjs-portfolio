import { ThreeCardPokerForPlayer } from '@/components/game/ThreeCardPoker/ThreeCardPokerForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('three-card-poker');

export default function ThreeCardPokerPage() {
  return <ThreeCardPokerForPlayer />;
}
