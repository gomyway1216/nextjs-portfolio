const PLAYER_ID_KEY = 'game_player_id';

export interface GameScores {
  [gameKey: string]: number;
}

/**
 * Get or create a unique player ID stored in localStorage (for guests)
 */
export function getLocalPlayerId(): string {
  if (typeof window === 'undefined') return '';

  let playerId = localStorage.getItem(PLAYER_ID_KEY);
  if (!playerId) {
    playerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  }
  return playerId;
}

/**
 * Resolve the effective player ID: use uid if logged in, fallback to local
 */
export function resolvePlayerId(uid?: string | null): string {
  return uid || getLocalPlayerId();
}

/**
 * Get all high scores for a player
 */
export async function getHighScores(playerId: string): Promise<GameScores> {
  if (!playerId) return {};

  const response = await fetch(`/api/game/scores?playerId=${encodeURIComponent(playerId)}`);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  const data = await response.json();
  return data.scores;
}

/**
 * Update a high score for a specific game
 */
export async function updateHighScore(
  gameKey: string,
  score: number,
  playerId: string
): Promise<{ highScore: number; isNewHighScore: boolean }> {
  if (!playerId) return { highScore: score, isNewHighScore: false };

  const response = await fetch('/api/game/scores', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameKey, score }),
  });

  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json();
}

/**
 * Get a specific game's high score
 */
export async function getHighScore(gameKey: string, playerId: string): Promise<number> {
  const scores = await getHighScores(playerId);
  return scores[gameKey] || 0;
}

/**
 * Migrate guest scores to a logged-in user's uid.
 * Copies scores from the local playerId to the uid, keeping the higher of each.
 */
export async function migrateGuestScores(uid: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const localId = localStorage.getItem(PLAYER_ID_KEY);
  if (!localId || localId === uid) return;

  try {
    const [guestScores, userScores] = await Promise.all([
      getHighScores(localId),
      getHighScores(uid),
    ]);

    const updates: Array<ReturnType<typeof updateHighScore>> = [];
    for (const [gameKey, guestScore] of Object.entries(guestScores)) {
      const userScore = userScores[gameKey] || 0;
      if (guestScore > userScore) {
        updates.push(updateHighScore(gameKey, guestScore, uid));
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch (e) {
    console.warn('Failed to migrate guest scores:', e);
  }
}
