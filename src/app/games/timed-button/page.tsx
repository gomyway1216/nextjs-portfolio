import { TimedButton } from '@/components/game/TimedButton';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('timed-button');

export default function TimedButtonPage() {
  return <TimedButton />;
}
