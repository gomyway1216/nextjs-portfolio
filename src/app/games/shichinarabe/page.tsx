/**
 * Shichinarabe (七並べ) game page
 */

import { Shichinarabe } from '@/components/game/Shichinarabe';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('shichinarabe');

export default function ShichinarabePage() {
  return <Shichinarabe />;
}

