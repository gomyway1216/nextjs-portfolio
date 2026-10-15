import { SlotMachineForPlayer } from '@/components/game/SlotMachine/SlotMachineForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('slot-machine');

export default function SlotMachinePage() {
  return <SlotMachineForPlayer />;
}
