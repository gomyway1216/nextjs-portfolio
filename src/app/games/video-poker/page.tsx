import { VideoPokerForPlayer } from '@/components/game/VideoPoker/VideoPokerForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('video-poker');

export default function VideoPokerPage() {
  return <VideoPokerForPlayer />;
}
