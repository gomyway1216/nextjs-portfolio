// ============================================================================
// ENUMS
// ============================================================================

export enum QuizCategory {
  ENGLISH_VOCAB = 'english_vocab',
  TRAIN_STATION = 'train_station',
  GENERAL_KNOWLEDGE = 'general_knowledge',
  JAPANESE_CULTURE = 'japanese_culture',
  GEOGRAPHY = 'geography',
  FOOD_DRINK = 'food_drink',
  SCIENCE = 'science',
  HISTORY = 'history',
  SPORTS = 'sports',
  MUSIC_ART = 'music_art',
  CUSTOM = 'custom',
}

export enum QuestionType {
  FOUR_CHOICE = 'four_choice',
  TRUE_FALSE = 'true_false',
  FILL_IN_BLANK = 'fill_in_blank',
  IMAGE_CHOICE = 'image_choice',
}

export enum QuizDifficulty {
  EASY = 'easy',
  NORMAL = 'normal',
  HARD = 'hard',
}

export enum QuizMode {
  SOLO = 'solo',
  MULTIPLAYER = 'multiplayer',
}

export enum MultiplayerPhase {
  LOBBY = 'lobby',
  COUNTDOWN = 'countdown',
  QUESTION = 'question',
  ANSWER_REVEAL = 'answer_reveal',
  SCOREBOARD = 'scoreboard',
  RESULTS = 'results',
}

// ============================================================================
// LABEL MAPS
// ============================================================================

export const QUIZ_CATEGORY_LABELS: Record<QuizCategory, string> = {
  [QuizCategory.ENGLISH_VOCAB]: 'English Vocabulary',
  [QuizCategory.TRAIN_STATION]: 'Train Stations',
  [QuizCategory.GENERAL_KNOWLEDGE]: 'General Knowledge',
  [QuizCategory.JAPANESE_CULTURE]: 'Japanese Culture',
  [QuizCategory.GEOGRAPHY]: 'Geography',
  [QuizCategory.FOOD_DRINK]: 'Food & Drink',
  [QuizCategory.SCIENCE]: 'Science',
  [QuizCategory.HISTORY]: 'History',
  [QuizCategory.SPORTS]: 'Sports',
  [QuizCategory.MUSIC_ART]: 'Music & Art',
  [QuizCategory.CUSTOM]: 'Custom',
};

export const QUIZ_CATEGORY_EMOJI: Record<QuizCategory, string> = {
  [QuizCategory.ENGLISH_VOCAB]: '🔤',
  [QuizCategory.TRAIN_STATION]: '🚃',
  [QuizCategory.GENERAL_KNOWLEDGE]: '💡',
  [QuizCategory.JAPANESE_CULTURE]: '⛩️',
  [QuizCategory.GEOGRAPHY]: '🌍',
  [QuizCategory.FOOD_DRINK]: '🍱',
  [QuizCategory.SCIENCE]: '🔬',
  [QuizCategory.HISTORY]: '📜',
  [QuizCategory.SPORTS]: '⚽',
  [QuizCategory.MUSIC_ART]: '🎨',
  [QuizCategory.CUSTOM]: '✏️',
};

export const QUIZ_DIFFICULTY_LABELS: Record<QuizDifficulty, string> = {
  [QuizDifficulty.EASY]: 'Easy',
  [QuizDifficulty.NORMAL]: 'Normal',
  [QuizDifficulty.HARD]: 'Hard',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  [QuestionType.FOUR_CHOICE]: 'Multiple Choice',
  [QuestionType.TRUE_FALSE]: 'True or False',
  [QuestionType.FILL_IN_BLANK]: 'Fill in the Blank',
  [QuestionType.IMAGE_CHOICE]: 'Image Choice',
};

// ============================================================================
// CORE TYPES
// ============================================================================

export interface QuestionOption {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  questionText: string;
  questionImageUrl?: string;
  options: QuestionOption[];
  correctOptionId: string;
  correctText?: string;
  acceptableAnswers?: string[];
  explanation?: string;
  hint?: string;
  tags?: string[];
}

export interface QuestionTemplate extends Question {
  createdBy: string | null;
  isBuiltIn: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  questionCount: number;
  questions: Question[];
  timePerQuestion: number;
  createdBy: string | null;
  isCustom: boolean;
  shareCode?: string;
  hasPasscode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuizInput {
  title: string;
  description?: string;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  questionCount?: number;
  timePerQuestion?: number;
  questionTypes?: QuestionType[];
  passcode?: string;
}

export interface CreateCustomQuizInput {
  title: string;
  description?: string;
  category?: QuizCategory;
  questions: Question[];
  timePerQuestion?: number;
  passcode?: string;
}

export interface UpdateCustomQuizInput {
  title?: string;
  description?: string;
  questions?: Question[];
  timePerQuestion?: number;
  passcode?: string;
}

export interface CreateQuestionInput {
  type: QuestionType;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  questionText: string;
  questionImageUrl?: string;
  options: QuestionOption[];
  correctOptionId: string;
  correctText?: string;
  acceptableAnswers?: string[];
  explanation?: string;
  hint?: string;
  tags?: string[];
}

// ============================================================================
// SOLO TYPES
// ============================================================================

export interface SoloAnswer {
  questionId: string;
  selectedOptionId?: string;
  textAnswer?: string;
  isCorrect: boolean;
  timeTaken: number;
  points: number;
}

export interface SoloResult {
  id: string;
  quizId: string;
  userId: string | null;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  answers: SoloAnswer[];
  totalQuestions: number;
  correctCount: number;
  totalPoints: number;
  maxPoints: number;
  accuracy: number;
  streak: number;
  timeTaken: number;
  createdAt: string;
}

// ============================================================================
// MULTIPLAYER TYPES
// ============================================================================

export interface KuizuPlayer {
  id: string;
  name: string;
  ready: boolean;
  score: number;
  streak: number;
  currentAnswer?: string;
  answerTime?: number;
  isCorrect?: boolean;
  lastUpdate: number;
}

export interface KuizuGameState {
  phase: MultiplayerPhase;
  quizId?: string;
  category?: QuizCategory;
  difficulty?: QuizDifficulty;
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion?: Question;
  questionStartTime?: number;
  timePerQuestion: number;
  playerScores: Record<string, number>;
  playerStreaks: Record<string, number>;
  playerAnswers: Record<string, { answer: string; time: number; isCorrect: boolean }>;
  questionResults?: {
    correctAnswer: string;
    playerResults: Record<string, { isCorrect: boolean; points: number }>;
  };
  lastUpdate: number;
}

export interface KuizuPendingAction {
  playerId: string;
  action: string;
  payload: unknown;
  timestamp: number;
}

// ============================================================================
// SCORING
// ============================================================================

export const SCORING = {
  BASE_POINTS: 1000,
  TIME_BONUS_MAX: 500,
  STREAK_MULTIPLIERS: {
    0: 1.0,
    1: 1.0,
    2: 1.2,
    3: 1.5,
    4: 2.0,
  },
} as const;

export function calculatePoints(
  isCorrect: boolean,
  answerTimeMs: number,
  timeLimitMs: number,
  streak: number
): number {
  if (!isCorrect) return 0;

  const basePoints = SCORING.BASE_POINTS;

  // Calculate time bonus (faster = more points)
  const timeRatio = 1 - (answerTimeMs / timeLimitMs);
  const timeBonus = Math.max(0, Math.floor(timeRatio * SCORING.TIME_BONUS_MAX));

  // Get streak multiplier
  const multiplierKey = Math.min(streak, 4) as keyof typeof SCORING.STREAK_MULTIPLIERS;
  const streakMultiplier = SCORING.STREAK_MULTIPLIERS[multiplierKey];

  return Math.floor((basePoints + timeBonus) * streakMultiplier);
}

// ============================================================================
// DAILY CHALLENGE TYPES
// ============================================================================

export interface DailyChallenge {
  id: string;
  date: string;
  quizId: string;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  questionCount: number;
  questions: Question[];
  createdAt: string;
}

export interface DailyChallengeEntry {
  id: string;
  challengeId: string;
  userId: string;
  displayName: string;
  score: number;
  accuracy: number;
  timeTaken: number;
  completedAt: string;
}

export interface DailyLeaderboard {
  challengeId: string;
  date: string;
  entries: DailyChallengeEntry[];
  total: number;
}

// ============================================================================
// USER STATS/HISTORY TYPES
// ============================================================================

export interface KuizuUserStats {
  userId: string;
  totalQuizzesTaken: number;
  totalCorrect: number;
  totalPoints: number;
  bestStreak: number;
  categoryStats: Partial<Record<QuizCategory, {
    quizzesTaken: number;
    correctAnswers: number;
    totalQuestions: number;
    accuracy: number;
    bestScore: number;
  }>>;
  dailyChallengesCompleted: number;
  multiplayerGamesPlayed: number;
  multiplayerWins: number;
  createdAt: string;
  updatedAt: string;
}

export interface KuizuHistoryEntry {
  id: string;
  userId: string;
  quizId: string;
  quizTitle: string;
  mode: QuizMode;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  score: number;
  accuracy: number;
  questionCount: number;
  correctCount: number;
  timeTaken: number;
  createdAt: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface QuizzesResponse {
  quizzes: Quiz[];
  total: number;
}

export interface QuestionsResponse {
  questions: QuestionTemplate[];
  total: number;
}

export interface HistoryResponse {
  history: KuizuHistoryEntry[];
  total: number;
}

export interface StatsResponse {
  stats: KuizuUserStats;
}

export interface DailyChallengeResponse {
  challenge: DailyChallenge;
  userEntry?: DailyChallengeEntry;
}

export interface CreateQuizResponse {
  id: string;
  shareCode?: string;
}

export interface QRCodeResponse {
  qrCodeDataUrl: string;
  shareUrl: string;
}

export interface GenerateQuizResponse {
  quiz: Quiz;
}
