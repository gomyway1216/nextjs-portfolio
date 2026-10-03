import { VideoPoker } from '@/components/game/VideoPoker';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('video-poker');

export default function VideoPokerPage() {
  return <VideoPoker />;
}
