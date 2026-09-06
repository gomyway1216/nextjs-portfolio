import { SecretaryProblem } from '@/components/game/SecretaryProblem';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('secretary-problem');

export default function SecretaryProblemPage() {
  return <SecretaryProblem />;
}
