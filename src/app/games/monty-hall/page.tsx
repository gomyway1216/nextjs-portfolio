import { MontyHall } from '@/components/game/MontyHall';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('monty-hall');

export default function MontyHallPage() {
  return <MontyHall />;
}
