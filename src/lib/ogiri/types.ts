export const CATEGORIES = {
  daily: '日常生活',
  work: '学校・仕事',
  travel: '旅行・乗り物',
  food: '食べ物',
  relationships: '恋愛・人間関係',
  animals: '動物',
  tech: 'IT・AI・未来技術',
  surreal: '非現実・シュール',
  halloween: 'ハロウィン・ホラー',
  classic: '誰でも遊べる定番',
  japan: '日本文化',
  random: 'その他・ランダム',
} as const;
export type Category = keyof typeof CATEGORIES;
export const AVATARS = ['🐱', '🐶', '🐼', '🦊', '🐸', '🐙', '🦄', '🐧', '🎃', '👻', '🦇', '🧙'];
export type Phase = 'lobby' | 'answering' | 'voting' | 'reveal' | 'ranking' | 'finished';
export interface Settings {
  rounds: number;
  answerSeconds: number;
  voteSeconds: number;
  autoAdvance: boolean;
  categories: Category[];
  halloween: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  rounds: 3,
  answerSeconds: 180,
  voteSeconds: 45,
  autoAdvance: true,
  categories: [],
  halloween: false,
};
export interface Prompt {
  id: string;
  text: string;
  category: Category;
  format: string;
  difficulty: 'easy' | 'medium';
  tags: string[];
  origin: 'original' | 'external';
  sourceUrl: string | null;
  license: string;
  enabled: boolean;
  createdAt: string;
}
export interface Player {
  answerReady?: boolean;
  partyPoints?: number;
  partyEarned?: number;
  spectator?: boolean;
  id: string;
  name: string;
  avatar: string;
  secretHash: string;
  score: number;
  roundScore: number;
  previousRank: number;
  active: boolean;
  kicked: boolean;
  joinedRound: number;
  lastSeen: number;
}
export interface Match {
  id: string;
  promptId: string;
  players: [string, string];
  answers: Record<string, string>;
  hidden: Record<string, boolean>;
  votes: Record<string, number>;
  scored: boolean;
  points: number[];
}
export interface Room {
  partyGames?: number;
  partyAwardedGame?: number;
  code: string;
  hostId: string;
  createdAt: number;
  expiresAt: number;
  revision: number;
  settings: Settings;
  phase: Phase;
  round: number;
  matchIndex: number;
  deadline: number;
  pausedAt: number;
  players: Record<string, Player>;
  matches: Match[];
  usedPrompts: string[];
  pairCounts: Record<string, number>;
  game: number;
  pastRounds?: { round: number; matches: Match[] }[];
  historyId?: string;
  archivedGame?: number;
  history?: HistoryRef[];
}
export interface HistoryRef {
  id: string;
  code: string;
  game: number;
  finishedAt: number;
  expiresAt: number;
}
export interface GameHistory extends HistoryRef {
  gameType?: 'ogiri';
  partyGames?: number;
  partyRankings?: { name: string; avatar: string; rank: number; points: number; earned: number }[];
  version: 1;
  rounds: number;
  rankings: { name: string; avatar: string; rank: number; score: number }[];
  matches: {
    round: number;
    text: string;
    answers: { name: string; avatar: string; text: string | null; votes: number; points: number }[];
  }[];
}
export interface PublicPlayer {
  answerReady?: boolean;
  answeringThisRound?: boolean;
  playingThisGame?: boolean;
  partyPoints?: number;
  partyEarned?: number;
  id: string;
  name: string;
  avatar: string;
  score: number;
  roundScore: number;
  rank: number;
  previousRank: number;
  active: boolean;
  connected: boolean;
  answered: number;
}
export interface RoomView {
  partyPlayers?: {
    id: string;
    name: string;
    avatar: string;
    partyPoints: number;
    partyEarned: number;
  }[];
  partyGames?: number;
  highlights?: GameHighlights | null;
  hostPlays?: boolean;
  history?: HistoryRef[];
  turn: string;
  code: string;
  revision: number;
  phase: Phase;
  round: number;
  game: number;
  settings: Settings;
  deadline: number;
  paused: boolean;
  serverTime: number;
  me: string | null;
  isHost: boolean;
  players: PublicPlayer[];
  assignments: { id: string; text: string; answer: string }[];
  match: null | {
    id: string;
    text: string;
    index: number;
    total: number;
    answers: (string | null)[];
    canVote: boolean;
    isAuthor?: boolean;
    voted: boolean;
    votesReceived: number;
    eligible: number;
    result: null | { counts: number[]; points: number[]; authors: string[] };
  };
}
export interface GameHighlights {
  roundMvps: string[];
  climbers: { id: string; places: number }[];
  bestAnswer: {
    text: string;
    answer: string;
    author: string;
    avatar: string;
    votes: number;
    points: number;
  } | null;
}
export type Action =
  | { type: 'answerReady'; ready: boolean }
  | { type: 'hostParticipation'; participating: boolean }
  | { type: 'answer'; matchId: string; text: string }
  | { type: 'vote'; matchId: string; choice: number }
  | { type: 'settings'; settings: Settings }
  | { type: 'start' | 'next' | 'extend' | 'pause' | 'resume' | 'finish' | 'rematch' | 'leave' | 'heartbeat' }
  | { type: 'kick'; playerId: string }
  | { type: 'hide'; matchId: string; choice: number };
