/**
 * Mini Adventure game page
 */

import { MiniAdventure } from '@/components/game/MiniAdventure';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('mini-adventure');

export default function MiniAdventurePage() {
  return <MiniAdventure />;
}
