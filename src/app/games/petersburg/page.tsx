import { Petersburg } from '@/components/game/Petersburg';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('petersburg');

export default function PetersburgPage() {
  return <Petersburg />;
}
