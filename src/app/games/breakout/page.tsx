/**
 * Breakout game page
 */

import { Breakout } from '@/components/game/Breakout';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('breakout');

export default function BreakoutPage() {
  return <Breakout />;
}
