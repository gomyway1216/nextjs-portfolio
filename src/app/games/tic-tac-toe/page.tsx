import TicTacToe from '@/components/game/TicTacToe';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('tic-tac-toe');

export default function TicTacToePage() {
  return <TicTacToe />;
}
