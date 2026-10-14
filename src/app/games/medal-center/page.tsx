import { MedalCenterForPlayer } from '@/components/game/MedalCenter/MedalCenterForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('medal-center');

export default function MedalCenterPage() {
  return <MedalCenterForPlayer />;
}
