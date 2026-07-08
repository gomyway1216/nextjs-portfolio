/**
 * Local bilingual strings for Doubt Word. Kept in the component dir per the
 * revamp spec (do not add keys to the shared gameTranslations.ts).
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from '../common/types';

export interface DoubtWordStrings {
  title: string;
  subtitle: string;
  difficultyTitle: string;
  startLabel: string;
  difficultyOptions: Record<Difficulty, { label: string; description: string }>;
  livesLabel: string;
  scoreLabel: string;
  you: string;
  ai: string;
  aiClaimTitle: string;
  claimSentence: (first: string, length: number) => string;
  believe: string;
  doubt: string;
  yourTurnTitle: string;
  yourTurnHint: string;
  pickWord: string;
  bluffMode: string;
  bluffHint: string;
  willAnnounce: string;
  first: string;
  length: string;
  sendClaim: string;
  hidden: string;
  roundResultTitle: string;
  realWordWas: (word: string) => string;
  nextTurn: string;
  aiReacted: (reaction: 'believe' | 'doubt') => string;
  youReacted: (reaction: 'believe' | 'doubt') => string;
  outcomes: {
    doubtCorrect: string;
    doubtWrong: string;
    believedBluff: string;
    safePass: string;
  };
  gameOverTitle: string;
  youWin: string;
  aiWins: string;
  draw: string;
  finalScore: (you: number, ai: number) => string;
  playAgain: string;
  howToPlayTitle: string;
  howToPlay: string[];
  waiting: string;
  aiThinking: string;
  claimantYou: string;
  claimantAi: string;
}

const en: DoubtWordStrings = {
  title: 'Doubt Word',
  subtitle: 'A bluffing duel of first-letters and word length. Read the AI, or fool it.',
  difficultyTitle: 'Choose your opponent',
  startLabel: 'Start Duel',
  difficultyOptions: {
    easy: { label: 'Novice', description: 'Reacts almost at random, rarely bluffs. 4 lives.' },
    medium: { label: 'Player', description: 'Reads plausibility, bluffs sometimes. 3 lives.' },
    hard: { label: 'Sharp', description: 'Catches weak bluffs, bluffs plausibly. 3 lives.' },
    expert: { label: 'Expert', description: 'Rarely fooled, bluffs cleverly. 3 lives.' },
    master: { label: 'Master', description: 'Near-perfect reads, relentless. 2 lives.' },
  },
  livesLabel: 'Lives',
  scoreLabel: 'Score',
  you: 'You',
  ai: 'AI',
  aiClaimTitle: 'AI declares',
  claimSentence: (first, length) =>
    `“I hold a word starting with ${first}, ${length} letters long.”`,
  believe: 'Believe',
  doubt: 'Doubt',
  yourTurnTitle: 'Your declaration',
  yourTurnHint: 'Pick one of your words, then declare it — truthfully or as a bluff.',
  pickWord: 'Your words',
  bluffMode: 'Bluff',
  bluffHint: 'Announce a false first-letter and/or length to mislead the AI.',
  willAnnounce: 'You will announce',
  first: 'first',
  length: 'length',
  sendClaim: 'Declare',
  hidden: 'hidden',
  roundResultTitle: 'Round result',
  realWordWas: (word) => `The real word was “${word}”.`,
  nextTurn: 'Next round',
  aiReacted: (reaction) => (reaction === 'doubt' ? 'The AI doubted you.' : 'The AI believed you.'),
  youReacted: (reaction) => (reaction === 'doubt' ? 'You doubted.' : 'You believed.'),
  outcomes: {
    doubtCorrect: 'Bluff caught — well read!',
    doubtWrong: 'Wrong call — it was the truth.',
    believedBluff: 'Fooled — the claim was a bluff.',
    safePass: 'Honest claim, believed. Safe pass.',
  },
  gameOverTitle: 'Match over',
  youWin: 'You win!',
  aiWins: 'AI wins',
  draw: 'Draw',
  finalScore: (you, ai) => `You ${you} — ${ai} AI`,
  playAgain: 'Play again',
  howToPlayTitle: 'How to play Doubt Word',
  howToPlay: [
    'Each round one side holds a secret word and announces its first letter and length.',
    'The claim may be TRUE, or a BLUFF where the letter and/or length is faked.',
    'When it is the AI’s claim, you choose Believe or Doubt.',
    'Doubt a bluff → the AI loses a life. Doubt the truth → you lose a life.',
    'Believe a bluff → you lose a life. Believe the truth → a safe pass, no damage.',
    'On your turn, pick a word and optionally toggle Bluff, then declare. The AI reacts.',
    'Lose all your lives and the match is over. Higher difficulty = smarter, bolder AI.',
  ],
  waiting: 'Waiting…',
  aiThinking: 'AI is deciding…',
  claimantYou: 'Your claim',
  claimantAi: 'AI’s claim',
};

const ja: DoubtWordStrings = {
  title: 'Doubt Word',
  subtitle: '「頭文字」と「文字数」で仕掛けるブラフ勝負。AIの宣言を読み切れ。',
  difficultyTitle: '相手を選ぶ',
  startLabel: '対戦開始',
  difficultyOptions: {
    easy: { label: '初級', description: 'ほぼランダムに反応。ブラフは稀。ライフ4。' },
    medium: { label: '中級', description: '妥当性を読み、時々ブラフ。ライフ3。' },
    hard: { label: '上級', description: '甘いブラフを見抜き、巧妙に騙す。ライフ3。' },
    expert: { label: '達人', description: 'ほぼ騙されず、賢くブラフ。ライフ3。' },
    master: { label: '名人', description: 'ほぼ完璧な読み。容赦なし。ライフ2。' },
  },
  livesLabel: 'ライフ',
  scoreLabel: 'スコア',
  you: 'あなた',
  ai: 'AI',
  aiClaimTitle: 'AIの宣言',
  claimSentence: (first, length) => `「頭文字は ${first}、文字数は ${length} の単語を持っている」`,
  believe: '信じる',
  doubt: '疑う',
  yourTurnTitle: 'あなたの宣言',
  yourTurnHint: '単語を1つ選び、真実かブラフで宣言しよう。',
  pickWord: '手持ちの単語',
  bluffMode: 'ブラフ',
  bluffHint: '偽の頭文字・文字数を宣言してAIを惑わせる。',
  willAnnounce: '宣言内容',
  first: '頭文字',
  length: '文字数',
  sendClaim: '宣言する',
  hidden: '？',
  roundResultTitle: 'ラウンド結果',
  realWordWas: (word) => `実際の単語は「${word}」でした。`,
  nextTurn: '次のラウンド',
  aiReacted: (reaction) => (reaction === 'doubt' ? 'AIはあなたを疑った。' : 'AIはあなたを信じた。'),
  youReacted: (reaction) => (reaction === 'doubt' ? 'あなたは疑った。' : 'あなたは信じた。'),
  outcomes: {
    doubtCorrect: 'ブラフを見破った！',
    doubtWrong: '誤読。宣言は本当だった。',
    believedBluff: '騙された。宣言はブラフだった。',
    safePass: '正直な宣言を信頼。無傷で通過。',
  },
  gameOverTitle: '対戦終了',
  youWin: 'あなたの勝ち！',
  aiWins: 'AIの勝ち',
  draw: '引き分け',
  finalScore: (you, ai) => `あなた ${you} — ${ai} AI`,
  playAgain: 'もう一度',
  howToPlayTitle: 'Doubt Word の遊び方',
  howToPlay: [
    '各ラウンド、片方が秘密の単語を持ち「頭文字」と「文字数」を宣言する。',
    '宣言は本当のこともあれば、頭文字や文字数を偽ったブラフのこともある。',
    'AIの宣言に対し、あなたは「信じる」か「疑う」を選ぶ。',
    'ブラフを疑えば→AIがライフを失う。本当を疑えば→あなたがライフを失う。',
    'ブラフを信じれば→あなたがライフを失う。本当を信じれば→無傷で通過。',
    '自分の番では単語を選び、必要ならブラフを付けて宣言。AIが反応する。',
    'ライフを全て失うと敗北。難易度が上がるほどAIは賢く大胆になる。',
  ],
  waiting: '待機中…',
  aiThinking: 'AIが考え中…',
  claimantYou: 'あなたの宣言',
  claimantAi: 'AIの宣言',
};

export const getStrings = (language: GameLanguage): DoubtWordStrings =>
  language === 'ja' ? ja : en;
