import { BaccaratForPlayer } from '@/components/game/Baccarat/BaccaratForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('baccarat');

export default function BaccaratPage() {
  return <BaccaratForPlayer />;
}
