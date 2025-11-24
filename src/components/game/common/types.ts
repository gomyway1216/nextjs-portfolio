/**
 * Common types shared across all games
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

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
