/**
 * Territory Number game page.
 */

import { TerritoryNumber } from '@/components/game/TerritoryNumber';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('territory-number');

export default function TerritoryNumberPage() {
  return <TerritoryNumber />;
}
