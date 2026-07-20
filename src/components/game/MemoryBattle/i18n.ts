/**
 * Local bilingual strings for Memory Battle.
 * Kept inside the component dir per the revamp spec (no shared-constant edits).
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface MemoryBattleStrings {
  title: string;
  subtitle: string;
  gameSetup: string;
  difficultyTitle: string;
  startLabel: string;
  difficulties: {
    easy: { label: string; description: string };
    medium: { label: string; description: string };
    hard: { label: string; description: string };
    expert: { label: string; description: string };
    master: { label: string; description: string };
  };
  gridLabel: string;
  grids: { small: string; medium: string; large: string };
  yourTurn: string;
  aiTurn: string;
  aiThinking: string;
  youScore: string;
  aiScore: string;
  pairsLeft: string;
  matchFound: string;
  goAgain: string;
  noMatch: string;
  youWin: string;
  aiWins: string;
  draw: string;
  playAgain: string;
  changeSettings: string;
  cardAria: (n: number) => string;
  matchedAria: (owner: string, value: number) => string;
  you: string;
  ai: string;
  howToTitle: string;
  objectiveTitle: string;
  objectiveBody: string;
  tipsTitle: string;
  tips: string[];
}

const en: MemoryBattleStrings = {
  title: 'Memory Battle',
  subtitle: 'Out-remember the AI in a game of concentration.',
  gameSetup: 'Game setup',
  difficultyTitle: 'AI Difficulty',
  startLabel: 'Start Battle',
  difficulties: {
    easy: { label: 'Easy', description: 'Forgetful AI — misses pairs often' },
    medium: { label: 'Medium', description: 'Remembers over half the board' },
    hard: { label: 'Hard', description: 'Sharp memory, rare mistakes' },
    expert: { label: 'Expert', description: 'Near-perfect recall' },
    master: { label: 'Master', description: 'Never forgets, never blunders' },
  },
  gridLabel: 'Board size',
  grids: { small: '4×3 · 6 pairs', medium: '4×4 · 8 pairs', large: '6×4 · 12 pairs' },
  yourTurn: 'Your turn',
  aiTurn: "AI's turn",
  aiThinking: 'AI is thinking…',
  youScore: 'You',
  aiScore: 'AI',
  pairsLeft: 'pairs left',
  matchFound: 'Match! Go again.',
  goAgain: 'Nice — flip two more.',
  noMatch: 'No match.',
  youWin: 'You win! 🎉',
  aiWins: 'AI wins',
  draw: "It's a draw!",
  playAgain: 'Play Again',
  changeSettings: 'Change Settings',
  you: 'You',
  ai: 'AI',
  cardAria: (n) => `Face-down card ${n}`,
  matchedAria: (owner, value) => `Matched pair ${value + 1}, captured by ${owner}`,
  howToTitle: 'How to Play',
  objectiveTitle: 'Objective',
  objectiveBody:
    'Flip two cards each turn to find matching pairs. Match a pair and you keep it and go again. Miss and the turn passes to the AI. Whoever captures the most pairs wins.',
  tipsTitle: 'Tips',
  tips: [
    'Watch the AI’s flips — every revealed card is information you can use.',
    'When you know a pair, grab it, then chain into another flip.',
    'On higher difficulties the AI remembers almost everything — deny it easy reveals.',
  ],
};

const ja: MemoryBattleStrings = {
  title: 'メモリーバトル',
  subtitle: '神経衰弱でAIより多くのペアを記憶しよう。',
  gameSetup: 'ゲーム設定',
  difficultyTitle: 'AIの強さ',
  startLabel: '対戦開始',
  difficulties: {
    easy: { label: 'かんたん', description: '忘れっぽいAI。ペアをよく見逃す' },
    medium: { label: 'ふつう', description: '盤面の半分以上を記憶' },
    hard: { label: 'むずかしい', description: '鋭い記憶力、ミスはまれ' },
    expert: { label: 'エキスパート', description: 'ほぼ完璧な記憶力' },
    master: { label: 'マスター', description: '決して忘れず、ミスもしない' },
  },
  gridLabel: '盤面の大きさ',
  grids: { small: '4×3 ・ 6ペア', medium: '4×4 ・ 8ペア', large: '6×4 ・ 12ペア' },
  yourTurn: 'あなたの番',
  aiTurn: 'AIの番',
  aiThinking: 'AIが考え中…',
  youScore: 'あなた',
  aiScore: 'AI',
  pairsLeft: 'ペア残り',
  matchFound: 'ペア成立！もう一度めくれます。',
  goAgain: 'いいね — もう2枚めくろう。',
  noMatch: 'はずれ。',
  youWin: 'あなたの勝ち！🎉',
  aiWins: 'AIの勝ち',
  draw: '引き分け！',
  playAgain: 'もう一度',
  changeSettings: '設定を変える',
  you: 'あなた',
  ai: 'AI',
  cardAria: (n) => `裏向きのカード ${n}`,
  matchedAria: (owner, value) => `ペア ${value + 1}、${owner} が獲得`,
  howToTitle: '遊び方',
  objectiveTitle: '目的',
  objectiveBody:
    '毎ターン2枚めくって同じ数字のペアを探します。ペアが揃えば獲得してもう一度めくれます。外すとAIの番に。より多くのペアを取った方が勝ちです。',
  tipsTitle: 'コツ',
  tips: [
    'AIがめくったカードをよく見よう。すべてが手がかりになります。',
    'ペアの位置が分かったら取りに行き、連続でめくろう。',
    '高難度のAIはほぼ全て記憶します。無駄な公開を避けましょう。',
  ],
};

export const getStrings = (language: GameLanguage): MemoryBattleStrings =>
  language === 'ja' ? ja : en;
