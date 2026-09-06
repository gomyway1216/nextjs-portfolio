import Gomoku from '@/components/game/Gomoku';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('gomoku');

export default function GomokuPage() {
  return <Gomoku />;
}
