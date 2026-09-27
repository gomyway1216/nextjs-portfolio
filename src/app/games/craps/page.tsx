import { Craps } from '@/components/game/Craps';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('craps');

export default function CrapsPage() {
  return <Craps />;
}
