import { GamblersRuin } from '@/components/game/GamblersRuin';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('gamblers-ruin');

export default function GamblersRuinPage() {
  return <GamblersRuin />;
}
