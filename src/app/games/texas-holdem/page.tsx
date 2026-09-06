import { TexasHoldem } from '@/components/game/TexasHoldem';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('texas-holdem');

export default function TexasHoldemPage() {
  return <TexasHoldem />;
}
