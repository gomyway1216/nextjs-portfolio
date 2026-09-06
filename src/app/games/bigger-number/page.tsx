/**
 * Bigger Number game page.
 */

import { BiggerNumber } from '@/components/game/BiggerNumber';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('bigger-number');

export default function BiggerNumberPage() {
  return <BiggerNumber />;
}
