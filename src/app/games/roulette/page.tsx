import { RouletteForPlayer } from '@/components/game/Roulette/RouletteForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('roulette');

export default function RoulettePage() {
  return <RouletteForPlayer />;
}
