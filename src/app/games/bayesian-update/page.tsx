import { BayesianUpdate } from '@/components/game/BayesianUpdate';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('bayesian-update');

export default function BayesianUpdatePage() {
  return <BayesianUpdate />;
}
