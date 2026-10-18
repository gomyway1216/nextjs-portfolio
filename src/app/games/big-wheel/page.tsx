import { BigWheelForPlayer } from '@/components/game/BigWheel/BigWheelForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('big-wheel');

export default function BigWheelPage() {
  return <BigWheelForPlayer />;
}
