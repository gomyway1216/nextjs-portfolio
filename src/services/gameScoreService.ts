const PLAYER_ID_KEY = 'game_player_id';

export interface GameScores {
  [gameKey: string]: number;
}

/**
 * Get or create a unique player ID stored in localStorage
 */
export function getPlayerId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  let playerId = localStorage.getItem(PLAYER_ID_KEY);
  if (!playerId) {
    playerId = generatePlayerId();
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  }
  return playerId;
}

/**
 * Generate a unique player ID
 */
function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get all high scores for the current player
 */
export async function getHighScores(): Promise<GameScores> {
  const playerId = getPlayerId();
  if (!playerId) {
    return {};
  }

  const response = await fetch(`/api/game/scores?playerId=${encodeURIComponent(playerId)}`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.scores;
}

/**
 * Update a high score for a specific game
 * Only updates if the new score is higher than the existing score
 */
export async function updateHighScore(
  gameKey: string,
  score: number
): Promise<{ highScore: number; isNewHighScore: boolean }> {
  const playerId = getPlayerId();
  if (!playerId) {
    return { highScore: score, isNewHighScore: false };
  }

  const response = await fetch('/api/game/scores', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ playerId, gameKey, score }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Get a specific game's high score
 */
export async function getHighScore(gameKey: string): Promise<number> {
  const scores = await getHighScores();
  return scores[gameKey] || 0;
}
