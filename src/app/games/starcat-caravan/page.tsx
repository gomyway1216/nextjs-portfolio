import StarcatCaravan from '@/components/game/StarcatCaravan/StarcatCaravan';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('starcat-caravan');

export default function StarcatCaravanPage() {
  return <StarcatCaravan />;
}
