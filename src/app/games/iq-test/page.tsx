import { IqTest } from '@/components/game/IqTest';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('iq-test');

export default function IqTestPage() {
  return <IqTest />;
}
