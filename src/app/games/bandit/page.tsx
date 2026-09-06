import { Bandit } from '@/components/game/Bandit';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('bandit');

export default function BanditPage() {
  return <Bandit />;
}
