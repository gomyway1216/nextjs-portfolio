import { SlotMachine } from '@/components/game/SlotMachine';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('slot-machine');

export default function SlotMachinePage() {
  return <SlotMachine />;
}
