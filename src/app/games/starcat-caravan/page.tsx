import StarcatCaravanForPlayer from '@/components/game/StarcatCaravan/StarcatCaravanForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('starcat-caravan');

export default function StarcatCaravanPage() {
  return <StarcatCaravanForPlayer />;
}
