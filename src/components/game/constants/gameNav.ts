// Lightweight path → {id, title, thumbnail} lookup for the global
// toolbar. Kept separate from games.ts so the GlobalToolbar (which the
// root layout renders on nearly every route) doesn't pull every game's
// description/category/difficulty into the shared client bundle.
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
