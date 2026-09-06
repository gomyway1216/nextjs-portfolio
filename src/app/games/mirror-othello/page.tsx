import { MirrorOthello } from '@/components/game/MirrorOthello';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('mirror-othello');

export default function MirrorOthelloPage() {
  return <MirrorOthello />;
}
