/**
 * Custom hook for persisting game high scores to Firebase
 * Uses localStorage for immediate display and syncs with Firebase
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as gameScoreService from '@/services/gameScoreService';

const STORAGE_PREFIX = 'game_high_score_';

/**
 * Hook to manage persistent high scores for games
 * - Displays from localStorage immediately (fast)
 * - Syncs with Firebase in background
 * @param gameKey - Unique identifier for the game (e.g., 'jumpgame', 'tetris')
 * @returns [highScore, updateHighScore] - Current high score and function to update it
 */
export function useHighScore(gameKey: string): [number, (score: number) => void] {
  const [highScore, setHighScore] = useState<number>(0);
  const storageKey = `${STORAGE_PREFIX}${gameKey}`;
  const pendingUpdateRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Load high score on mount
  useEffect(() => {
    isMountedRef.current = true;

    const loadHighScore = async () => {
      let localScore = 0;

      // Load from localStorage first (immediate)
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) {
              localScore = parsed;
              if (isMountedRef.current) {
                setHighScore(parsed);
              }
            }
          }
        } catch (e) {
          console.warn('Failed to load high score from localStorage:', e);
        }
      }

      // Then try to get from Firebase and merge
      try {
        const firebaseScore = await gameScoreService.getHighScore(gameKey);
        if (isMountedRef.current) {
          const finalScore = Math.max(localScore, firebaseScore);
          setHighScore(finalScore);

          // Sync the higher score to both places
          if (localScore > firebaseScore && localScore > 0) {
            // Local has higher score, sync to Firebase
            await gameScoreService.updateHighScore(gameKey, localScore);
          } else if (firebaseScore > localScore && typeof window !== 'undefined') {
            // Firebase has higher score, update localStorage
            localStorage.setItem(storageKey, firebaseScore.toString());
          }
        }
      } catch (e) {
        console.warn('Failed to sync high score with Firebase:', e);
        // Keep using localStorage score
      }
    };

    loadHighScore();

    return () => {
      isMountedRef.current = false;
    };
  }, [gameKey, storageKey]);

  // Update high score if new score is higher
  const updateHighScore = useCallback((score: number) => {
    setHighScore(current => {
      if (score <= current) {
        return current;
      }

      // Save to localStorage immediately
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, score.toString());
        } catch (e) {
          console.warn('Failed to save high score to localStorage:', e);
        }
      }

      // Debounce Firebase updates
      if (pendingUpdateRef.current !== null) {
        clearTimeout(pendingUpdateRef.current);
      }

      pendingUpdateRef.current = window.setTimeout(async () => {
        try {
          await gameScoreService.updateHighScore(gameKey, score);
        } catch (e) {
          console.warn('Failed to save high score to Firebase:', e);
        }
        pendingUpdateRef.current = null;
      }, 1000);

      return score;
    });
  }, [storageKey, gameKey]);

  // Cleanup pending updates on unmount
  useEffect(() => {
    return () => {
      if (pendingUpdateRef.current !== null) {
        clearTimeout(pendingUpdateRef.current);
      }
    };
  }, []);

  return [highScore, updateHighScore];
}

/**
 * Get all stored high scores from localStorage
 */
export function getAllHighScores(): Record<string, number> {
  const scores: Record<string, number> = {};

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          const gameKey = key.replace(STORAGE_PREFIX, '');
          const value = localStorage.getItem(key);
          if (value) {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              scores[gameKey] = parsed;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to read high scores from localStorage:', e);
    }
  }

  return scores;
}

/**
 * Clear a specific game's high score from localStorage
 */
export function clearHighScore(gameKey: string): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${gameKey}`);
    } catch (e) {
      console.warn('Failed to clear high score:', e);
    }
  }
}
