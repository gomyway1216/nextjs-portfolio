import { KellyCriterion } from '@/components/game/KellyCriterion';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('kelly-criterion');

export default function KellyCriterionPage() {
  return <KellyCriterion />;
}
