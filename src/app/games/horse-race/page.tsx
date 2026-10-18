import { HorseRaceForPlayer } from '@/components/game/HorseRace/HorseRaceForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('horse-race');

export default function HorseRacePage() {
  return <HorseRaceForPlayer />;
}
