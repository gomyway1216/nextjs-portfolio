/**
 * Doubt (ダウト) game page
 */

import { Doubt } from '@/components/game/Doubt';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('doubt');

export default function DoubtPage() {
  return <Doubt />;
}

