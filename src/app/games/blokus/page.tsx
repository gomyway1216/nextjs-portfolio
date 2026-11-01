import Blokus from '@/components/game/Blokus';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('blokus');

export default function BlokusPage() {
  return <Blokus />;
}
