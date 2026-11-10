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
export type GameType = 'ogiri' | 'majority' | 'identity' | 'match' | 'drawing' | 'shiritori' | 'quiz' | 'gesture' | 'minority' | 'thermometer' | 'wordwolf' | 'bluff';
export const GAME_TITLES: Record<GameType, string> = {
  ogiri: 'みんなの大喜利王', majority: 'みんなの多数決', identity: 'だれのひとこと？', match: 'せーので同じ答え', drawing: 'おえかき伝言便',
  shiritori: 'おえかきしりとり', quiz: 'おえかきクイズ', gesture: 'ジェスチャー早当て', minority: '少数派が勝ち', thermometer: 'みんなの温度計', wordwolf: 'ワードウルフ', bluff: 'うそ回答まぜ',
};
/** Everyone answers the same question at once; no written answers and no per-voter choices are public. */
export type ChoiceGameType = 'majority' | 'minority' | 'thermometer';
export const isChoiceGame = (type: GameType | undefined): type is ChoiceGameType =>
  type === 'majority' || type === 'minority' || type === 'thermometer';
export type SideGameType = ChoiceGameType | 'identity' | 'match';
/** Games where everyone writes one answer before anything is shown. */
export const isWrittenSideGame = (type: GameType | undefined) => type === 'identity' || type === 'match';
/** せーので同じ答え: one word or a short phrase is what matches. */
export const MATCH_MAX_LENGTH = 20;
/** Ogiri can run as a long evening and the other games stay short. Drawing modes play once and
 * ignore this, so the host's choice is still there for the next game in the room. */
export const isDrawingType = (type: GameType | undefined) => type === 'drawing' || type === 'shiritori' || type === 'quiz';
/** Games where everyone takes exactly one turn, so the round setting does not apply. */
export const hasFixedTurns = (type: GameType | undefined) => isDrawingType(type) || type === 'gesture';
export const maxRounds = (type: GameType = 'ogiri') => type === 'ogiri' || hasFixedTurns(type) ? 20 : 5;
export const roundsFor = (type: GameType | undefined, rounds: number) => Math.min(rounds, maxRounds(type));
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
  /** ワードウルフ only: 2 applies from 6 players, otherwise 1. */
  wolves?: 1 | 2;
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
export interface RejoinSeat {
  id: string;
  name: string;
  avatar: string;
}
/** The host answers one request, named by `requestedAt`, so a later device cannot inherit a yes. */
export interface RejoinRequest extends RejoinSeat {
  requestedAt: number;
}
export interface Room {
  /** A device asking for a quiet seat. The hash replaces the old session once the host agrees. */
  rejoinRequests?: Record<string, { secretHash: string; at: number }>;
  drawing?: DrawingRound;
  /** Private: words and roles. Never spread into RoomView. */
  wordWolf?: WordWolfRound[];
  bluffRounds?: BluffRound[];
  /** Private: the word being acted. Never spread into RoomView. */
  gestures?: GestureRound[];
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
  /** Thermometer only: room average of the valid ratings. */
  average?: number;
  /** せーので同じ答え only: answers that matched, largest first, labelled with one player's spelling. */
  groups?: { label: string; ids: string[] }[];
}
export interface PartyGameView {
  type: SideGameType;
  /** Thermometer only: what 0 and 100 mean for this prompt. */
  scale?: { low: string; high: string };
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
  type: SideGameType;
  prompt: string;
  scale?: { low: string; high: string };
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
  bluffGame?: BluffGameView;
  /** Quiet seats offered to a visitor without a session, for example after scanning the TV QR. */
  rejoinSeats?: RejoinSeat[];
  rejoinRequests?: RejoinRequest[];
  /** This visitor asked for a seat and is waiting for the host. */
  rejoinPending?: boolean;
  /** Includes the GM, who is intentionally absent from the player standings. */
  participantName?: string;
  /** Only the authenticated participant's setup status, never a verifier. */
  hasPassphrase?: boolean;
  drawingGame?: DrawingGameView;
  wordWolfGame?: WordWolfView;
  gestureGame?: GestureView;
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
  | { type: 'drawingSubmit'; drawing: DrawingData; word?: string }
  | { type: 'drawingGuess'; text: string }
  | { type: 'drawingVote'; choice: string }
  | { type: 'quizGuess'; choice: number }
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
  | { type: 'rejoinAnswer'; playerId: string; requestedAt: number; approve: boolean }
  | { type: 'hide'; matchId: string; choice: number }
  | { type: 'wolfAccept' }
  | { type: 'gestureStart' }
  /** `word` is how many words had been dealt when the actor tapped, so a resent tap cannot reach the next one. */
  | { type: 'gesturePass'; word: number }
  | { type: 'gestureCorrect'; by: string; word: number };

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
  /** おえかきクイズ chains also carry their choices and who picked which. Firestore cannot store an
   * array inside an array, so these live on each chain rather than in parallel lists. */
  chains: { prompt: string; steps: (DrawingStep | null)[]; choices?: string[]; guesses?: Record<string, number>; closed?: boolean }[];
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
    /** Shiritori only: the opening sound, set when no picture has to reveal it. */
    sound: string | null;
  };
  chain: null | {
    index: number;
    total: number;
    prompt: string;
    steps: { kind: 'draw' | 'guess'; name: string; avatar: string; drawingId: string | null; text: string | null; link: boolean | null }[];
  };
  gallery: { id: string; author: string; name: string; avatar: string; votes: number; points: number }[];
  canVote: boolean;
  voted: boolean;
  votesReceived: number;
  eligible: number;
  results: boolean;
  /** おえかきクイズ: the picture everyone is guessing now, and its answer once the guesses close. */
  quiz?: null | {
    index: number;
    total: number;
    drawingId: string;
    name: string;
    avatar: string;
    mine: boolean;
    choices: string[];
    guess: number | null;
    canGuess: boolean;
    guessed: number;
    eligible: number;
    result: null | { answer: number; counts: number[]; correct: { name: string; avatar: string }[]; drawerPoints: number };
  };
}
export interface DrawingHistoryChain {
  prompt: string;
  steps: { kind: 'draw' | 'guess'; name: string; avatar: string; drawing: string | null; text: string | null; votes: number; points: number; link?: boolean | null }[];
}
/** One player's turn acting words out. The first round fixes everyone's turn order. */
export interface GestureRound {
  round: number;
  actor: string;
  order: string[];
  /** Words dealt this turn, the last one is on the actor's phone now. */
  words: string[];
  results: { word: string; by: string | null }[];
  awards: { id: string; points: number }[];
  /** 0 until the actor presses start, so the clock waits for them to reach the TV. */
  startedAt: number;
  /** The turn reached its result, so the game counts as played even if every word was passed. */
  ended?: boolean;
}
export interface GestureView {
  index: number;
  total: number;
  actor: { id: string; name: string; avatar: string };
  mine: boolean;
  started: boolean;
  canStart: boolean;
  /** Words dealt so far this turn; the actor's taps name it. */
  dealt: number;
  /** Only the actor sees the word, and only while acting. */
  word: string | null;
  solved: { word: string; name: string; avatar: string }[];
  passes: number;
  guessers: { id: string; name: string; avatar: string }[];
  result: null | {
    words: { word: string; name: string | null; avatar: string }[];
    /** The word on screen when time ran out. */
    last: string | null;
    awards: { id: string; points: number }[];
  };
}
export interface WordWolfRound {
  round: number;
  /** Index into WORD_WOLF_PAIRS and which side the wolves received. */
  pair: number;
  wolfSide: 0 | 1;
  players: string[];
  wolves: string[];
  ballots: Record<string, string>;
  accused: string | null;
  guess: string | null;
  guessCorrect: boolean;
  counts: Record<string, number>;
  awards: { id: string; points: number }[];
  scored: boolean;
}
export interface WordWolfView {
  /** Only the authenticated assigned player's own word. Roles are never told before the result. */
  myWord: string | null;
  wolfCount: number;
  readyCount: number;
  playerCount: number;
  options: { id: string; name: string; avatar: string }[];
  canVote: boolean;
  voted: boolean;
  votesReceived: number;
  eligible: number;
  accused: null | { id: string; name: string; avatar: string; votes: number; isWolf: boolean };
  counts: Record<string, number> | null;
  canGuess: boolean;
  guessing: boolean;
  canAccept: boolean;
  result: null | {
    citizenWord: string;
    wolfWord: string;
    wolves: { id: string; name: string; avatar: string }[];
    guess: string | null;
    guessCorrect: boolean;
    winner: 'citizens' | 'wolves';
    awards: { id: string; points: number }[];
  };
}
export const BLUFF_MAX_LENGTH = 40;
/** Private bluff round: the truth and authors never leave the room before the reveal. */
export interface BluffRound {
  round: number;
  prompt: string;
  truth: string;
  also: string[];
  sourceUrl: string;
  players: string[];
  fakes: Record<string, string>;
  options: { id: string; label: string; truth: boolean; authors: string[] }[];
  ballots: Record<string, string>;
  result: null | { truth: string; counts: Record<string, number>; awards: { id: string; points: number }[] };
}
export interface BluffGameView {
  prompt: string;
  index: number;
  total: number;
  answer: string;
  answerRequired: boolean;
  readyCount: number;
  answererCount: number;
  options: { id: string; label: string }[];
  mine: string | null;
  canVote: boolean;
  voted: boolean;
  votesReceived: number;
  eligible: number;
  result: null | {
    truth: string;
    counts: Record<string, number>;
    authors: Record<string, string[]>;
    awards: { id: string; points: number }[];
    sourceUrl: string;
  };
}
