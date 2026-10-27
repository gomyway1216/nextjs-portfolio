import { OgiriLanding } from '@/components/game/Ogiri/Ogiri';
import { buildGameMetadata } from '@/lib/games/gameMetadata';
export const metadata = buildGameMetadata('ogiri');
export default function Page() {
  return <OgiriLanding />;
}
