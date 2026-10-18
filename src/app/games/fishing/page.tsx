import { FishingForPlayer } from '@/components/game/Fishing/FishingForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('fishing');

export default function FishingPage() {
  return <FishingForPlayer />;
}
