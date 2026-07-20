// Lightweight path → {id, title, thumbnail} lookup for the global toolbar.
// Derived from games.ts at module load so it can never go stale (note this
// does pull games.ts into any bundle that imports this file).
import { games } from './games';

export interface GameNavEntry {
  id: string;
  title: string;
  thumbnail: string;
  path: string;
}

export const GAME_NAV_ENTRIES: GameNavEntry[] = games.map((game) => ({
  id: game.id,
  title: game.title,
  thumbnail: game.thumbnail,
  path: game.path,
}));

export function findGameByPath(pathname: string): GameNavEntry | undefined {
  return GAME_NAV_ENTRIES.find(
    (game) => pathname === game.path || pathname.startsWith(`${game.path}/`),
  );
}
