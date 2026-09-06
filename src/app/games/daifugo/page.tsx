/**
 * Daifugo (大富豪) game page
 */

import { Daifugo } from '@/components/game/Daifugo';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('daifugo');

export default function DaifugoPage() {
  return <Daifugo />;
}

