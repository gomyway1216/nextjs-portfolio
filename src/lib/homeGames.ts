import { games, type Game } from '@/components/game/constants/games';

export const HOME_GAMES_CACHE_TAG = 'home-games';
export const DEFAULT_HOME_GAME_IDS = games.map((game) => game.id);

const gameById = new Map(games.map((game) => [game.id, game]));

export interface HomeGamesConfig {
  gameIds: string[];
}

export function shouldUseDefaultHomeGameIdsForRuntimeEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const projectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_PROJECT_ID;
  const hasAdminCredentials = Boolean(
    env.FIREBASE_SERVICE_ACCOUNT_KEY
      || (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY && projectId),
  );

  return env.CI === 'true' && projectId === 'ci-placeholder' && !hasAdminCredentials;
}

export function isKnownGameId(gameId: string): boolean {
  return gameById.has(gameId);
}

export function getUnknownHomeGameIds(gameIds: readonly string[]): string[] {
  return gameIds.filter((gameId) => !isKnownGameId(gameId));
}

export function getDuplicateHomeGameIds(gameIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const gameId of gameIds) {
    if (seen.has(gameId)) {
      duplicates.add(gameId);
    } else {
      seen.add(gameId);
    }
  }

  return Array.from(duplicates);
}

export function normalizeHomeGameIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_HOME_GAME_IDS;
  }

  const seen = new Set<string>();
  const validIds: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string' || seen.has(item) || !isKnownGameId(item)) {
      continue;
    }

    seen.add(item);
    validIds.push(item);
  }

  return validIds.length > 0 ? validIds : DEFAULT_HOME_GAME_IDS;
}

export function getHomeGamesByIds(gameIds: readonly string[] | undefined): Game[] {
  const normalizedIds = gameIds ? normalizeHomeGameIds(gameIds) : DEFAULT_HOME_GAME_IDS;
  const orderedGames = normalizedIds
    .map((gameId) => gameById.get(gameId))
    .filter((game): game is Game => Boolean(game));

  return orderedGames.length > 0 ? orderedGames : games;
}
