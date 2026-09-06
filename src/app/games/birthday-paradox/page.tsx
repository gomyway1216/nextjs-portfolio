import { BirthdayParadox } from '@/components/game/BirthdayParadox';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('birthday-paradox');

export default function BirthdayParadoxPage() {
  return <BirthdayParadox />;
}
