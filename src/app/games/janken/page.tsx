import { JankenForPlayer } from '@/components/game/Janken/JankenForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('janken');

export default function JankenPage() {
  return <JankenForPlayer />;
}
