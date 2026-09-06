/**
 * Space Invaders game page
 */

import { SpaceInvaders } from '@/components/game/SpaceInvaders';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('space-invaders');

export default function SpaceInvadersPage() {
  return <SpaceInvaders />;
}
