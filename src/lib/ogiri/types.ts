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
export const AVATARS = [
  '🐱', '🐶', '🐼', '🦊', '🐸', '🐙', '🦄', '🐧', '🎃', '👻', '🦇', '🧙',
  'rabbit', 'capybara', 'axolotl', 'hedgehog', 'redpanda', 'sloth', 'alien', 'pudding',
];
export type Phase = 'lobby' | 'answering' | 'voting' | 'reveal' | 'ranking' | 'finished';
export type GameType = 'ogiri' | 'majority' | 'identity' | 'drawing';
export const GAME_TITLES: Record<GameType, string> = {
  ogiri: 'みんなの大喜利王', majority: 'みんなの多数決', identity: 'だれのひとこと？', drawing: 'おえかき伝言便',
};
export interface Settings {
  gameType?: GameType;
  rounds: number;
  answerSeconds: number;
  voteSeconds: number;
  autoAdvance: boolean;
  categories: Category[];
  halloween: boolean;
  /** Approved room prompts are mixed in by default; 'only' asks only them (catalog tops up). */
  customMode?: 'mix' | 'only';
  /** Participants may submit prompts that wait for the host's approval. */
  customSubmissions?: boolean;
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
/** Room-scoped prompt written by the host or a participant. Pending ones are host-only. */
export interface CustomPrompt {
  id: string;
  text: string;
  author: string;
  approved: boolean;
  createdAt: number;
}
export interface Player {
  /** Private salted scrypt verifier. Never project into room/history responses. */
  passphraseHash?: { salt: string; hash: string };
  /** Private recovery capability; plaintext is returned only at issuance. */
  recoveryHash?: string;
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
  /** Final-round matches double every point; absent on rooms created before the multiplier. */
  multiplier?: number;
  /** Index of the answer that took every vote (2+ voters, both answers shown). */
  shutout?: number | null;
}
export interface Room {
  drawing?: DrawingRound;
  /** Durable recovery throttle shared across server instances. */
  recoveryAttempts?: { count: number; resetAt: number };
  /** Snapshot of the game actually started, independent of the next game's settings. */
  gameType?: GameType;
  sideRounds?: SideGameRound[];
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
  /** Display-only crowd reactions for the current turn. Never archived. */
  reactions?: import('./reactions').ReactionState;
  historyId?: string;
  archivedGame?: number;
  history?: HistoryRef[];
  customPrompts?: CustomPrompt[];
  customPromptSeq?: number;
}
export interface HistoryRef {
  gameType?: GameType;
  id: string;
  code: string;
  game: number;
  finishedAt: number;
  expiresAt: number;
}
export interface GameHistory extends HistoryRef {
  drawingChains?: DrawingHistoryChain[];
  gameType?: GameType;
  partyGames?: number;
  partyRankings?: { name: string; avatar: string; rank: number; points: number; earned: number }[];
  version: 1;
  rounds: number;
  rankings: { name: string; avatar: string; rank: number; score: number }[];
  matches: {
    round: number;
    text: string;
    answers: { name: string; avatar: string; text: string | null; votes: number; points: number; shutout?: boolean }[];
    awards?: { name: string; avatar: string; points: number }[];
    note?: string;
    multiplier?: number;
    custom?: boolean;
  }[];
}
export interface PartyGameResult {
  correctOption: string | null;
  counts: Record<string, number>;
  awards: { id: string; points: number }[];
}
export interface PartyGameView {
  type: 'majority' | 'identity';
  prompt: string;
  answer: string;
  answerRequired: boolean;
  readyCount: number;
  answererCount: number;
  revealText: string | null;
  options: { id: string; label: string; avatar?: string }[];
  canVote: boolean;
  isAuthor: boolean;
  voted: boolean;
  votesReceived: number;
  eligible: number;
  index: number;
  total: number;
  result: PartyGameResult | null;
}
/** Private round state. Never spread into RoomView. */
export interface SideGameRound {
  round: number;
  type: 'majority' | 'identity';
  prompt: string;
  players: string[];
  options: { id: string; label: string }[];
  answers: Record<string, string>;
  order: string[];
  ballots: Record<string, Record<string, string>>;
  results: { index: number; author: string | null; text: string | null; result: PartyGameResult }[];
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
  /** Includes the GM, who is intentionally absent from the player standings. */
  participantName?: string;
  /** Only the authenticated participant's setup status, never a verifier. */
  hasPassphrase?: boolean;
  drawingGame?: DrawingGameView;
  /** Transient issuance response only. Never populated by project/poll/history. */
  recoveryCode?: string;
  resting?: boolean;
  gameType?: GameType;
  sideGame?: PartyGameView;
  partyPlayers?: {
    id: string;
    name: string;
    avatar: string;
    partyPoints: number;
    partyEarned: number;
  }[];
  partyGames?: number;
  highlights?: GameHighlights | null;
  /** Anonymous reaction totals for the current turn while voting/reveal, else null. */
  reactions?: import('./reactions').ReactionCounts | null;
  hostPlays?: boolean;
  history?: HistoryRef[];
  /** Approved custom prompts in this room; the texts are never public. */
  customPromptCount?: number;
  /** Host: every submission. Participant: only their own. TV: never. */
  customPrompts?: { id: string; text: string; author: string; approved: boolean; mine: boolean }[];
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
    custom?: boolean;
    voted: boolean;
    votesReceived: number;
    eligible: number;
    multiplier: number;
    result: null | { counts: number[]; points: number[]; authors: string[]; shutout: number | null };
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
  | { type: 'drawingSubmit'; drawing: DrawingData }
  | { type: 'drawingGuess'; text: string }
  | { type: 'drawingVote'; choice: string }
  | { type: 'partyAnswer'; text: string }
  | { type: 'partyVote'; choice: string }
  | { type: 'answerReady'; ready: boolean }
  | { type: 'hostParticipation'; participating: boolean }
  | { type: 'answer'; matchId: string; text: string }
  | { type: 'vote'; matchId: string; choice: number }
  | { type: 'settings'; settings: Settings }
  | { type: 'rematch'; gameType?: GameType }
  | { type: 'start' | 'next' | 'extend' | 'pause' | 'resume' | 'finish' | 'leave' | 'return' | 'heartbeat' }
  | { type: 'customPromptAdd'; text: string }
  | { type: 'customPromptApprove' | 'customPromptRemove'; id: string }
  | { type: 'kick'; playerId: string }
  | { type: 'hide'; matchId: string; choice: number };

export interface DrawingData {
  v: 1;
  strokes: { c: string; w: number; p: number[] }[];
}
export interface DrawingStep {
  author: string;
  kind: 'draw' | 'guess';
  id?: string;
  data?: string;
  text?: string;
}
export interface DrawingRound {
  players: string[];
  stages: number;
  stage: number;
  chains: { prompt: string; steps: (DrawingStep | null)[] }[];
  revealed: number;
  votes: Record<string, string>;
  awards: Record<string, number>;
  scored: boolean;
}
export interface DrawingGameView {
  stage: number;
  stages: number;
  readyCount: number;
  answererCount: number;
  assignment: null | {
    key: string;
    kind: 'draw' | 'guess';
    prompt: string | null;
    inputDrawingId: string | null;
    savedDrawingId: string | null;
    answer: string;
    saved: boolean;
  };
  chain: null | {
    index: number;
    total: number;
    prompt: string;
    steps: { kind: 'draw' | 'guess'; name: string; avatar: string; drawingId: string | null; text: string | null }[];
  };
  gallery: { id: string; author: string; name: string; avatar: string; votes: number; points: number }[];
  canVote: boolean;
  voted: boolean;
  votesReceived: number;
  eligible: number;
  results: boolean;
}
export interface DrawingHistoryChain {
  prompt: string;
  steps: { kind: 'draw' | 'guess'; name: string; avatar: string; drawing: string | null; text: string | null; votes: number; points: number }[];
}
