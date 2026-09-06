/**
 * Animal Roleplay game page
 */

import { AnimalRoleplay } from '@/components/game/AnimalRoleplay';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('animal-roleplay');

export default function AnimalRoleplayPage() {
  return <AnimalRoleplay />;
}
