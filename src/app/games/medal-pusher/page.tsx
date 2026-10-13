import { MedalPusherForPlayer } from '@/components/game/MedalPusher/MedalPusherForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('medal-pusher');

export default function MedalPusherPage() {
  return <MedalPusherForPlayer />;
}
