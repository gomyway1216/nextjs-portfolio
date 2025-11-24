/**
 * Common utility functions shared across all games
 */

import { Difficulty, DifficultyConfig } from './types';

/**
 * Get color scheme for difficulty level
 */
export const getDifficultyColor = (difficulty: Difficulty): DifficultyConfig => {
  switch (difficulty) {
    case 'easy':
      return {
        bg: 'rgba(34, 197, 94, 0.2)',
        border: '#22c55e',
        text: '#22c55e'
      };
    case 'medium':
      return {
        bg: 'rgba(234, 179, 8, 0.2)',
        border: '#eab308',
        text: '#eab308'
      };
    case 'hard':
      return {
        bg: 'rgba(239, 68, 68, 0.2)',
        border: '#ef4444',
        text: '#ef4444'
      };
  }
};

/**
 * Common button styles
 */
export const buttonStyles = {
  primary: {
    background: '#0ea5e9',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    padding: '0.75rem 2rem',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  secondary: {
    background: 'rgba(75, 85, 99, 0.8)',
    border: '1px solid rgba(107, 114, 128, 1)',
    borderRadius: '0.5rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    padding: '0.75rem 2rem',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
};
