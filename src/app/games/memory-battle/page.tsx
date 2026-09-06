import { MemoryBattle } from '@/components/game/MemoryBattle';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('memory-battle');

export default function MemoryBattlePage() {
  return <MemoryBattle />;
}
