import { ThreeCardPoker } from '@/components/game/ThreeCardPoker';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('three-card-poker');

export default function ThreeCardPokerPage() {
  return <ThreeCardPoker />;
}
