import { Baccarat } from '@/components/game/Baccarat';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('baccarat');

export default function BaccaratPage() {
  return <Baccarat />;
}
