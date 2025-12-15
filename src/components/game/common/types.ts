/**
 * Common types shared across all games
 */

/**
 * Shared difficulty levels across games.
 *
 * Games are free to interpret these as they want (depth, time, speed, etc.).
 * For Shogi we map them to "Level 1..5" in the UI:
 * - easy   => Level 1
 * - medium => Level 2
 * - hard   => Level 3
 * - expert => Level 4
 * - master => Level 5
 */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export type GameStatus = 'playing' | 'win' | 'lose' | 'draw';

export interface GameStats {
  wins: number;
  losses: number;
  draws: number;
}

export interface DifficultyConfig {
  bg: string;
  border: string;
  text: string;
}

export interface DifficultyOption {
  value: Difficulty;
  label: string;
  description: string;
}
