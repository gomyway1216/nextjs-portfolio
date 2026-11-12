/** Limits of the Play tab's "pull limit T" field. */
export const MIN_PULL_LIMIT = 10;
export const MAX_PULL_LIMIT = 500;
export const DEFAULT_PULL_LIMIT = 50;

/**
 * The pull limit a typed value stands for: inside the field's range and never
 * below the pulls already made, so a game in progress can be cut short (it ends
 * at once, on the pulls made) but can never show more pulls than its limit.
 */
export const clampPullLimit = (raw: number, pullsMade: number): number => {
  const wanted = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : DEFAULT_PULL_LIMIT;
  const floor = Math.max(MIN_PULL_LIMIT, Math.min(MAX_PULL_LIMIT, pullsMade));
  return Math.max(floor, Math.min(MAX_PULL_LIMIT, wanted));
};

/** What the progress panel shows for `pullsMade` pulls of a `limit`: never negative, never past 100%. */
export const pullProgress = (pullsMade: number, limit: number): { remaining: number; fraction: number } => {
  const made = Math.max(0, pullsMade);
  if (limit <= 0) return { remaining: 0, fraction: 1 };
  return { remaining: Math.max(0, limit - made), fraction: Math.min(1, made / limit) };
};

/**
 * Whether a half-typed limit can take effect while the player is still typing:
 * a whole number inside the field's range that leaves the game running. Anything
 * else ("3" on the way to "30", an emptied field, a limit at or below the pulls
 * made) waits until the field is left or Enter is pressed, so typing never ends a
 * game by accident.
 */
export const isLivePullLimit = (text: string, pullsMade: number): boolean => {
  if (!/^\d+$/.test(text.trim())) return false;
  const value = Number(text);
  return value >= MIN_PULL_LIMIT && value <= MAX_PULL_LIMIT && value > pullsMade;
};

/** The limit the field settles on when it is left: the typed one, clamped, or `current` when nothing usable was typed. */
export const settlePullLimit = (text: string, pullsMade: number, current: number): number => {
  const value = Number(text);
  return text.trim() === '' || !Number.isFinite(value) || value <= 0 ? current : clampPullLimit(value, pullsMade);
};
