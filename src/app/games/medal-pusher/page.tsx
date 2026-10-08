import { MedalPusher } from '@/components/game/MedalPusher';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('medal-pusher');

export default function MedalPusherPage() {
  return <MedalPusher />;
}
