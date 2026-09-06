import { ChaosBreakout } from '@/components/game/ChaosBreakout';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('chaos-breakout');

export default function ChaosBreakoutPage() {
  return <ChaosBreakout />;
}
