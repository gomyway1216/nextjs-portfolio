import { DoubtWord } from '@/components/game/DoubtWord';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('doubt-word');

export default function DoubtWordPage() {
  return <DoubtWord />;
}
