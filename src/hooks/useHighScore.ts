/**
 * Custom hook for persisting game high scores to Firebase
 * Uses localStorage for immediate display and syncs with Firebase
 * When logged in, uses Firebase Auth uid as playerId
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import * as gameScoreService from '@/services/gameScoreService';

const STORAGE_PREFIX = 'game_high_score_';

/**
 * Hook to manage persistent high scores for games
 * - Logged-in users: uses Firebase Auth uid as playerId
 * - Guests: uses a locally-generated playerId
 * - On login, migrates guest scores to uid
 */
export function useHighScore(gameKey: string): [number, (score: number) => void] {
  const [highScore, setHighScore] = useState<number>(0);
  const { currentUser } = useAuth();
  const uid = currentUser?.uid as string | undefined;
  const playerId = gameScoreService.resolvePlayerId(uid);
  const storageKey = `${STORAGE_PREFIX}${gameKey}`;
  const pendingUpdateRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const hasMigratedRef = useRef(false);

  // Migrate guest scores when user logs in
  useEffect(() => {
    if (uid && !hasMigratedRef.current) {
      hasMigratedRef.current = true;
      gameScoreService.migrateGuestScores(uid);
    }
  }, [uid]);

  // Load high score on mount or when playerId changes
  useEffect(() => {
    isMountedRef.current = true;

    const loadHighScore = async () => {
      let localScore = 0;

      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) {
              localScore = parsed;
              if (isMountedRef.current) setHighScore(parsed);
            }
          }
        } catch (e) {
          console.warn('Failed to load high score from localStorage:', e);
        }
      }

      try {
        const firebaseScore = await gameScoreService.getHighScore(gameKey, playerId);
        if (isMountedRef.current) {
          const finalScore = Math.max(localScore, firebaseScore);
          setHighScore(finalScore);

          if (localScore > firebaseScore && localScore > 0) {
            await gameScoreService.updateHighScore(gameKey, localScore, playerId);
          } else if (firebaseScore > localScore && typeof window !== 'undefined') {
            localStorage.setItem(storageKey, firebaseScore.toString());
          }
        }
      } catch (e) {
        console.warn('Failed to sync high score with Firebase:', e);
      }
    };

    loadHighScore();

    return () => {
      isMountedRef.current = false;
    };
  }, [gameKey, storageKey, playerId]);

  const updateHighScore = useCallback((score: number) => {
    setHighScore((current) => {
      if (score <= current) return current;

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, score.toString());
        } catch (e) {
          console.warn('Failed to save high score to localStorage:', e);
        }
      }

      if (pendingUpdateRef.current !== null) {
        clearTimeout(pendingUpdateRef.current);
      }

      pendingUpdateRef.current = window.setTimeout(async () => {
        try {
          await gameScoreService.updateHighScore(gameKey, score, playerId);
        } catch (e) {
          console.warn('Failed to save high score to Firebase:', e);
        }
        pendingUpdateRef.current = null;
      }, 1000);

      return score;
    });
  }, [storageKey, gameKey, playerId]);

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
            if (!isNaN(parsed)) scores[gameKey] = parsed;
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
