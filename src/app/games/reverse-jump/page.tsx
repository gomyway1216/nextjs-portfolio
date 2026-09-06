import { ReverseJump } from '@/components/game/ReverseJump';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('reverse-jump');

export default function ReverseJumpPage() {
  return <ReverseJump />;
}
