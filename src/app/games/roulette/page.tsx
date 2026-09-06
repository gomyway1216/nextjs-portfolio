import { Roulette } from '@/components/game/Roulette';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('roulette');

export default function RoulettePage() {
  return <Roulette />;
}
