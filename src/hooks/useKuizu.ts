'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as kuizuService from '@/services/kuizuService';
import * as gameRoomService from '@/services/gameRoomService';
import * as gameActionClient from '@/services/gameActionClient';
import { subscribeToPath, setData } from '@/lib/firebaseRealtimeDb';
import type {
  Quiz,
  Question,
  QuizCategory,
  QuizDifficulty,
  SoloAnswer,
  SoloResult,
  KuizuHistoryEntry,
  KuizuUserStats,
  DailyChallenge,
  DailyChallengeEntry,
  CreateQuizInput,
  CreateCustomQuizInput,
  UpdateCustomQuizInput,
  QRCodeResponse,
  KuizuGameState,
  KuizuPlayer,
  KuizuPendingAction,
  MultiplayerPhase,
} from '@/types/kuizu';
import { calculatePoints } from '@/types/kuizu';
import type { GameRoom, LobbyState } from '@/services/gameRoomService';

// ============================================================================
// useKuizuCustomQuiz - Single quiz management
// ============================================================================

interface UseKuizuCustomQuizResult {
  quiz: Quiz | null;
  loading: boolean;
  error: string | null;
  requiresPasscode: boolean;
  verifyPasscode: (passcode: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useKuizuCustomQuiz(
  quizId: string | null
): UseKuizuCustomQuizResult {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresPasscode, setRequiresPasscode] = useState(false);
  const [verified, setVerified] = useState(false);

  const fetchQuiz = useCallback(async () => {
    if (!quizId) {
      setQuiz(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await kuizuService.getCustomQuiz(quizId, verified);
      if ((data as any).requiresPasscode) {
        setRequiresPasscode(true);
        setQuiz({
          id: data.id,
          title: data.title,
          hasPasscode: true,
        } as Quiz);
      } else {
        setRequiresPasscode(false);
        setQuiz(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quiz');
      setQuiz(null);
    } finally {
      setLoading(false);
    }
  }, [quizId, verified]);

  const handleVerifyPasscode = useCallback(
    async (passcode: string): Promise<boolean> => {
      if (!quizId) return false;
      try {
        const result = await kuizuService.verifyQuizPasscode(quizId, passcode);
        if (result.verified) {
          setVerified(true);
          setRequiresPasscode(false);
          const data = await kuizuService.getCustomQuiz(quizId, true);
          setQuiz(data);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [quizId]
  );

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  return {
    quiz,
    loading,
    error,
    requiresPasscode,
    verifyPasscode: handleVerifyPasscode,
    refetch: fetchQuiz,
  };
}

// ============================================================================
// useKuizuCustomQuizByShareCode
// ============================================================================

export function useKuizuCustomQuizByShareCode(
  shareCode: string | null
): Omit<UseKuizuCustomQuizResult, 'requiresPasscode' | 'verifyPasscode'> {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuiz = useCallback(async () => {
    if (!shareCode) {
      setQuiz(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await kuizuService.getCustomQuizByShareCode(shareCode);
      setQuiz(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quiz');
      setQuiz(null);
    } finally {
      setLoading(false);
    }
  }, [shareCode]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  return { quiz, loading, error, refetch: fetchQuiz };
}

// ============================================================================
// useKuizuHistory
// ============================================================================

interface UseKuizuHistoryResult {
  history: KuizuHistoryEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useKuizuHistory(): UseKuizuHistoryResult {
  const [history, setHistory] = useState<KuizuHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await kuizuService.getHistory();
      setHistory(data.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refetch: fetchHistory };
}

// ============================================================================
// useKuizuStats
// ============================================================================

interface UseKuizuStatsResult {
  stats: KuizuUserStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useKuizuStats(): UseKuizuStatsResult {
  const [stats, setStats] = useState<KuizuUserStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await kuizuService.getUserStats();
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

// ============================================================================
// useKuizuDaily
// ============================================================================

interface UseKuizuDailyResult {
  challenge: DailyChallenge | null;
  userEntry: DailyChallengeEntry | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useKuizuDaily(): UseKuizuDailyResult {
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [userEntry, setUserEntry] = useState<DailyChallengeEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDaily = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await kuizuService.getDailyChallenge();
      setChallenge(data.challenge);
      setUserEntry(data.userEntry || null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch daily challenge'
      );
      setChallenge(null);
      setUserEntry(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDaily();
  }, [fetchDaily]);

  return { challenge, userEntry, loading, error, refetch: fetchDaily };
}

// ============================================================================
// useKuizuMultiplayer
// ============================================================================

interface UseKuizuMultiplayerResult {
  room: GameRoom<KuizuGameState> | null;
  gameState: KuizuGameState | null;
  players: KuizuPlayer[];
  isHost: boolean;
  lobbyState: LobbyState;
  error: string | null;
  createRoom: (
    playerName: string,
    password: string,
    quiz: Quiz
  ) => Promise<string | null>;
  joinRoom: (
    roomId: string,
    playerName: string,
    password: string
  ) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  startQuiz: (quiz: Quiz) => Promise<void>;
  submitAnswer: (answer: string, answerTime: number) => Promise<void>;
  nextQuestion: () => Promise<void>;
  endQuiz: () => Promise<void>;
}

type WireKuizuGameState = Partial<KuizuGameState> & {
  questionsJson?: string;
  playerScoresJson?: string;
  playerStreaksJson?: string;
  playerAnswersJson?: string;
};

function safeKuizuParse<T>(s: string | undefined, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function rehydrateKuizuGameState(raw: WireKuizuGameState | null | undefined): KuizuGameState | null {
  if (!raw) return null;
  const base = raw as KuizuGameState;
  return {
    ...base,
    playerScores: safeKuizuParse<Record<string, number>>(raw.playerScoresJson, base.playerScores ?? {}),
    playerStreaks: safeKuizuParse<Record<string, number>>(raw.playerStreaksJson, base.playerStreaks ?? {}),
    playerAnswers: safeKuizuParse<Record<string, { answer: string; time: number; isCorrect: boolean }>>(
      raw.playerAnswersJson, base.playerAnswers ?? {},
    ),
  };
}

/**
 * kuizu multiplayer hook — Phase 3f CF migration.
 *
 * Pass `roomIdFromUrl` if you're landing on `/multiplayer/[roomId]` and
 * you want to auto-subscribe (the old hook only subscribed inside
 * createRoom/joinRoom, which broke for anyone who navigated directly to
 * a room URL after a router.push). Backwards-compatible: omitting
 * `roomIdFromUrl` preserves the old behavior.
 */
export function useKuizuMultiplayer(
  playerId: string,
  roomIdFromUrl?: string,
): UseKuizuMultiplayerResult {
  const [room, setRoom] = useState<GameRoom<KuizuGameState> | null>(null);
  const [gameState, setGameState] = useState<KuizuGameState | null>(null);
  const [players, setPlayers] = useState<KuizuPlayer[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [lobbyState, setLobbyState] = useState<LobbyState>('idle');
  const [error, setError] = useState<string | null>(null);

  const unsubscribeRoomRef = useRef<(() => void) | null>(null);
  const unsubscribeGameStateRef = useRef<(() => void) | null>(null);
  const unsubscribePendingActionRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (unsubscribeRoomRef.current) {
      unsubscribeRoomRef.current();
      unsubscribeRoomRef.current = null;
    }
    if (unsubscribeGameStateRef.current) {
      unsubscribeGameStateRef.current();
      unsubscribeGameStateRef.current = null;
    }
    if (unsubscribePendingActionRef.current) {
      unsubscribePendingActionRef.current();
      unsubscribePendingActionRef.current = null;
    }
  }, []);

  // Shared helper: subscribe to room + gameState for `roomId`, returning
  // an unsubscribe. Routes RTDB snapshots through `rehydrateKuizuGameState`
  // so consumers see the original (non-JSON-encoded) shape.
  const setupSubscriptions = useCallback((roomId: string): void => {
    cleanup();
    unsubscribeRoomRef.current = subscribeToPath<GameRoom<KuizuGameState>>(
      `gameRooms/${roomId}`, (data) => {
        if (data) {
          setRoom(data);
          const playerList = Object.values(data.players || {});
          setPlayers(playerList as KuizuPlayer[]);
        }
      },
    );
    unsubscribeGameStateRef.current = subscribeToPath<WireKuizuGameState>(
      `gameRooms/${roomId}/gameState`, (data) => {
        const rehydrated = rehydrateKuizuGameState(data);
        setGameState(rehydrated);
        if (rehydrated?.phase === 'question' || rehydrated?.phase === 'countdown') {
          setLobbyState('playing');
        } else if (rehydrated?.phase === 'results') {
          setLobbyState('finished');
        }
      },
    );
  }, [cleanup]);

  const createRoom = useCallback(
    async (
      playerName: string,
      password: string,
      quiz: Quiz
    ): Promise<string | null> => {
      setError(null);
      setLobbyState('creating');
      try {
        // Pass the quiz through `rules.quiz`; the CF reads it in
        // `startKuizuGame` to build the initial gameState server-side.
        const response = await gameActionClient.createRoom({
          playerId, playerName, password,
          gameType: 'kuizu',
          rules: { quiz },
        });
        if (response.success && response.roomId) {
          const roomId = response.roomId;
          setIsHost(true);
          setLobbyState('waiting');
          setupSubscriptions(roomId);
          return roomId;
        }
        setError(response.error || 'Failed to create room');
        setLobbyState('idle');
        return null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create room');
        setLobbyState('idle');
        return null;
      }
    },
    [playerId, setupSubscriptions]
  );

  const joinRoom = useCallback(
    async (
      roomId: string,
      playerName: string,
      password: string
    ): Promise<boolean> => {
      setError(null);
      setLobbyState('joining');
      try {
        const response = await gameActionClient.joinRoom({
          roomId, playerId, playerName, password,
        });
        if (response.success && response.room) {
          setIsHost(response.room.hostId === playerId);
          setLobbyState('waiting');
          setupSubscriptions(roomId);
          return true;
        }
        setError(response.error || 'Failed to join room');
        setLobbyState('idle');
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join room');
        setLobbyState('idle');
        return false;
      }
    },
    [playerId]
  );

  const leaveRoom = useCallback(async () => {
    if (!room) return;
    try {
      await gameActionClient.leaveRoom({ roomId: room.id, playerId });
    } catch { /* ignore */ }
    cleanup();
    setRoom(null);
    setGameState(null);
    setPlayers([]);
    setLobbyState('idle');
  }, [room, playerId, cleanup]);

  const setReady = useCallback(
    async (ready: boolean) => {
      if (!room) return;
      try {
        await gameActionClient.setReady({ roomId: room.id, playerId, ready });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set ready status');
      }
    },
    [room, playerId]
  );

  /**
   * Host kicks off the match. The quiz was attached to `room.rules.quiz`
   * at `createRoom` time, so the CF can build the initial state itself.
   * The `quiz` arg is unused in the CF path; kept for backwards compat
   * with the existing call sites.
   */
  const startQuiz = useCallback(
    async (_quiz: Quiz) => {
      if (!room || !isHost) return;
      try {
        const r = await gameActionClient.startGame({ roomId: room.id, playerId });
        if (!r.success) setError(r.error ?? 'Failed to start quiz');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start quiz');
      }
    },
    [room, isHost, playerId]
  );

  const submitAnswer = useCallback(
    async (answer: string, answerTime: number) => {
      if (!room || !gameState) return;
      try {
        const r = await gameActionClient.submitKuizuAnswer({
          roomId: room.id, playerId,
          questionIdx: gameState.currentQuestionIndex,
          answer, answerTime,
        });
        if (!r.success) setError(r.error ?? 'Failed to submit answer');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit answer');
      }
    },
    [room, playerId, gameState]
  );

  const nextQuestion = useCallback(async () => {
    if (!room || !isHost) return;
    try {
      const r = await gameActionClient.submitKuizuNext({ roomId: room.id, playerId });
      if (!r.success) setError(r.error ?? 'Failed to advance question');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance question');
    }
  }, [room, isHost, playerId]);

  const endQuiz = useCallback(async () => {
    // CF flips status to 'finished' + sets winnerId when `next` is
    // called past the last question. Nothing for the client to do here.
  }, []);

  // Auto-subscribe when the page is mounted with a roomId in the URL
  // (e.g. `/multiplayer/[roomId]`). The old hook only subscribed inside
  // createRoom / joinRoom, which broke for anyone navigating directly
  // to a room URL after a router.push().
  useEffect(() => {
    if (!roomIdFromUrl) return;
    if (room?.id === roomIdFromUrl) return; // already subscribed
    setupSubscriptions(roomIdFromUrl);
  }, [roomIdFromUrl, room?.id, setupSubscriptions]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    room,
    gameState,
    players,
    isHost,
    lobbyState,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startQuiz,
    submitAnswer,
    nextQuestion,
    endQuiz,
  };
}

// ============================================================================
// useKuizuMutations
// ============================================================================

interface UseKuizuMutationsResult {
  generateQuiz: (input: CreateQuizInput) => Promise<Quiz>;
  createCustomQuiz: (
    input: CreateCustomQuizInput
  ) => Promise<{ id: string; shareCode?: string }>;
  updateCustomQuiz: (
    quizId: string,
    input: UpdateCustomQuizInput
  ) => Promise<void>;
  deleteCustomQuiz: (quizId: string) => Promise<void>;
  submitSoloResult: (
    result: Omit<SoloResult, 'id' | 'createdAt'>
  ) => Promise<{ id: string }>;
  submitDailyResult: (
    entry: Omit<DailyChallengeEntry, 'id' | 'completedAt'>
  ) => Promise<void>;
  generateQRCode: (quizId: string) => Promise<QRCodeResponse>;
  loading: boolean;
  error: string | null;
}

export function useKuizuMutations(): UseKuizuMutationsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrapMutation = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const generateQuiz = useCallback(
    async (input: CreateQuizInput) => {
      const result = await wrapMutation(() => kuizuService.generateQuiz(input));
      return result.quiz;
    },
    [wrapMutation]
  );

  const createCustomQuiz = useCallback(
    async (input: CreateCustomQuizInput) => {
      return await wrapMutation(() => kuizuService.createCustomQuiz(input));
    },
    [wrapMutation]
  );

  const updateCustomQuiz = useCallback(
    async (quizId: string, input: UpdateCustomQuizInput) => {
      await wrapMutation(() => kuizuService.updateCustomQuiz(quizId, input));
    },
    [wrapMutation]
  );

  const deleteCustomQuiz = useCallback(
    async (quizId: string) => {
      await wrapMutation(() => kuizuService.deleteCustomQuiz(quizId));
    },
    [wrapMutation]
  );

  const submitSoloResult = useCallback(
    async (result: Omit<SoloResult, 'id' | 'createdAt'>) => {
      return await wrapMutation(() => kuizuService.submitSoloResult(result));
    },
    [wrapMutation]
  );

  const submitDailyResult = useCallback(
    async (entry: Omit<DailyChallengeEntry, 'id' | 'completedAt'>) => {
      await wrapMutation(() => kuizuService.submitDailyResult(entry));
    },
    [wrapMutation]
  );

  const generateQRCode = useCallback(
    async (quizId: string) => {
      return await wrapMutation(() => kuizuService.generateQRCode(quizId));
    },
    [wrapMutation]
  );

  return {
    generateQuiz,
    createCustomQuiz,
    updateCustomQuiz,
    deleteCustomQuiz,
    submitSoloResult,
    submitDailyResult,
    generateQRCode,
    loading,
    error,
  };
}

// ============================================================================
// useKuizuSoloPlay
// ============================================================================

interface UseKuizuSoloPlayResult {
  currentQuestion: Question | null;
  currentIndex: number;
  totalQuestions: number;
  score: number;
  streak: number;
  answers: SoloAnswer[];
  isFinished: boolean;
  timeRemaining: number;
  submitAnswer: (
    selectedOptionId?: string,
    textAnswer?: string,
    timeTaken?: number
  ) => void;
  reset: () => void;
}

export function useKuizuSoloPlay(quiz: Quiz | null): UseKuizuSoloPlayResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answers, setAnswers] = useState<SoloAnswer[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentQuestion = quiz?.questions[currentIndex] || null;
  const totalQuestions = quiz?.questions.length || 0;

  // Timer countdown
  useEffect(() => {
    if (!quiz || isFinished) return;

    const timeLimit = quiz.timePerQuestion * 1000;
    setTimeRemaining(timeLimit);
    setQuestionStartTime(Date.now());

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - questionStartTime;
      const remaining = Math.max(0, timeLimit - elapsed);
      setTimeRemaining(remaining);

      if (remaining === 0) {
        // Time's up - auto-submit as incorrect
        submitAnswer();
      }
    }, 100);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [quiz, currentIndex, isFinished]);

  const submitAnswer = useCallback(
    (selectedOptionId?: string, textAnswer?: string, timeTaken?: number) => {
      if (!quiz || !currentQuestion || isFinished) return;

      const actualTimeTaken =
        timeTaken !== undefined ? timeTaken : Date.now() - questionStartTime;

      let isCorrect = false;
      if (selectedOptionId) {
        isCorrect = currentQuestion.correctOptionId === selectedOptionId;
      } else if (textAnswer && currentQuestion.acceptableAnswers) {
        isCorrect = currentQuestion.acceptableAnswers.some(
          (acceptable) =>
            acceptable.toLowerCase().trim() === textAnswer.toLowerCase().trim()
        );
      } else if (textAnswer && currentQuestion.correctText) {
        isCorrect =
          currentQuestion.correctText.toLowerCase().trim() ===
          textAnswer.toLowerCase().trim();
      }

      const newStreak = isCorrect ? streak + 1 : 0;
      const points = calculatePoints(
        isCorrect,
        actualTimeTaken,
        quiz.timePerQuestion * 1000,
        streak
      );

      const answer: SoloAnswer = {
        questionId: currentQuestion.id,
        selectedOptionId,
        textAnswer,
        isCorrect,
        timeTaken: actualTimeTaken,
        points,
      };

      setAnswers((prev) => [...prev, answer]);
      setScore((prev) => prev + points);
      setStreak(newStreak);

      // Move to next question or finish
      if (currentIndex + 1 >= totalQuestions) {
        setIsFinished(true);
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    },
    [
      quiz,
      currentQuestion,
      currentIndex,
      totalQuestions,
      streak,
      isFinished,
      questionStartTime,
    ]
  );

  const reset = useCallback(() => {
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setAnswers([]);
    setIsFinished(false);
    setTimeRemaining(0);
    setQuestionStartTime(Date.now());
  }, []);

  return {
    currentQuestion,
    currentIndex,
    totalQuestions,
    score,
    streak,
    answers,
    isFinished,
    timeRemaining,
    submitAnswer,
    reset,
  };
}
