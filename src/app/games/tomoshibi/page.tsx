/**
 * Tomoshibi — Ruins of the Lantern — embedded Godot HTML5 build.
 *
 * buildGameMetadata derives the title, description, canonical URL and social
 * card from the catalog entry, so this page and /games stay in step. Every
 * /games/<id> route is required to call it (tests/unit/lib/games).
 */

import { Tomoshibi } from '@/components/game/Tomoshibi';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('tomoshibi');

export default function TomoshibiPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <Tomoshibi />
    </main>
  );
}
