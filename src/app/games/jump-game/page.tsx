import JumpGame from '@/components/game/JumpGame';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('jump-game');

export default function JumpGamePage() {
  return <JumpGame />;
}
