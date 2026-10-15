import { CrapsForPlayer } from '@/components/game/Craps/CrapsForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('craps');

export default function CrapsPage() {
  return <CrapsForPlayer />;
}
