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
