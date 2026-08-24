/**
 * Local bilingual strings for ShogiImproved.
 * Kept in the component dir following the pattern of sibling games
 * (e.g. TicTacToe/i18n.ts). Board/kifu terms that are shogi-native
 * (手合割, 待った, status strip) stay Japanese in the component.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from '../common/types';

export interface ShogiImprovedCopy {
  title: string;
  subtitle: string;
  gameSetup: string;
  chooseStrength: string;
  start: string;
  resumeSavedGame: (ply: number, difficultyLabel: string, handicapLabel: string) => string;
  saveGame: string;
  saving: string;
  saved: string;
  saveFailed: string;
  saveTitleEnabled: string;
  saveTitleDisabled: string;
  yourPieces: string;
  aiPieces: string;
  engineUnavailable: string;
  youWin: string;
  aiWins: string;
  retryGame: string;
  playAgain: string;
  promoteTitle: string;
  promote: string;
  keepOriginal: string;
  howToPlayTitle: string;
  objectiveLabel: string;
  objectiveBody: string;
  basicRulesLabel: string;
  basicRules: string[];
  controlsLabel: string;
  controls: string[];
  /** Standing notice that finished/abandoned games are stored anonymously. */
  recordNotice: string;
  difficulties: Record<Difficulty, { label: string; description: string }>;
}

const en: ShogiImprovedCopy = {
  title: 'Shogi Improved',
  subtitle: 'Fast-engine Japanese chess with worker search, saved games, and stronger opening play.',
  gameSetup: 'Game setup',
  chooseStrength: 'Choose engine strength',
  start: 'Start Game',
  resumeSavedGame: (ply, difficultyLabel, handicapLabel) =>
    `Resume saved game (move ${ply}, ${difficultyLabel}${handicapLabel ? `, ${handicapLabel}` : ''})`,
  saveGame: 'Save game',
  saving: 'Saving…',
  saved: 'Saved ✓',
  saveFailed: 'Save failed',
  saveTitleEnabled: 'Save and continue later',
  saveTitleDisabled: 'Saving is available on your turn',
  yourPieces: 'Your Pieces (先手)',
  aiPieces: 'AI Pieces (後手)',
  engineUnavailable: 'AI engine unavailable',
  youWin: '🎉 You Win!',
  aiWins: '😔 AI Wins!',
  retryGame: 'Retry Game',
  playAgain: 'Play Again',
  promoteTitle: 'Promote Piece?',
  promote: 'Promote',
  keepOriginal: 'Keep Original',
  howToPlayTitle: 'How to Play Shogi',
  objectiveLabel: 'Objective:',
  objectiveBody: "Capture the opponent's King (王/玉)",
  basicRulesLabel: 'Basic Rules:',
  basicRules: [
    'Each piece has unique movement patterns',
    'Pieces can be promoted when entering or within enemy territory (top 3 rows)',
    'Captured pieces can be dropped back on the board as your own',
    'Cannot drop pawns for checkmate or have two unpromoted pawns in same column'
  ],
  controlsLabel: 'Controls:',
  controls: [
    'Click a piece to select it',
    'Click a highlighted square to move',
    'Click captured pieces to drop them',
    'Choose to promote when entering promotion zone'
  ],
  recordNotice:
    'Games played here are saved anonymously — the moves, the level and the result — to study how the engine plays. No personal information is stored.',
  difficulties: {
    easy: { label: 'Level 1 (Easy)', description: 'Fast (~250ms)' },
    medium: { label: 'Level 2 (Medium)', description: 'Balanced (~1s)' },
    hard: { label: 'Level 3 (Hard)', description: 'Strong (~2s)' },
    expert: { label: 'Level 4 (Expert)', description: 'Very strong (~4s)' },
    master: { label: 'Level 5 (Master)', description: 'Strongest (~5s)' }
  }
};

const ja: ShogiImprovedCopy = {
  title: '将棋（改良版）',
  subtitle: 'AI対戦の将棋。エンジン強化・棋譜保存・定跡対応。',
  gameSetup: 'ゲーム設定',
  chooseStrength: 'エンジンの強さを選択',
  start: '対局開始',
  resumeSavedGame: (ply, difficultyLabel, handicapLabel) =>
    `保存した対局を再開（${ply}手目・${difficultyLabel}${handicapLabel ? `・${handicapLabel}` : ''}）`,
  saveGame: '保存する',
  saving: '保存中…',
  saved: '保存済み ✓',
  saveFailed: '保存失敗',
  saveTitleEnabled: '保存して後で再開できます',
  saveTitleDisabled: '保存は自分の手番でのみ可能です',
  yourPieces: 'あなたの持ち駒（先手）',
  aiPieces: 'AIの持ち駒（後手）',
  engineUnavailable: 'AIエンジンを利用できません',
  youWin: '🎉 あなたの勝ち！',
  aiWins: '😔 AIの勝ち',
  retryGame: 'もう一度対局',
  playAgain: 'もう一度',
  promoteTitle: '成りますか？',
  promote: '成る',
  keepOriginal: '成らない',
  howToPlayTitle: '将棋の遊び方',
  objectiveLabel: '目的：',
  objectiveBody: '相手の王（王将・玉将）を詰ませましょう',
  basicRulesLabel: '基本ルール：',
  basicRules: [
    '駒ごとに動き方が異なります',
    '敵陣（奥3段）に入るか、その中で動くと成れます',
    '取った駒は持ち駒として盤上に打てます',
    '打ち歩詰めと二歩は禁止です'
  ],
  controlsLabel: '操作方法：',
  controls: [
    '駒をクリックして選択',
    'ハイライトされたマスをクリックして移動',
    '持ち駒をクリックして打つ',
    '成れるときは成るかどうかを選択'
  ],
  recordNotice:
    'エンジンの改善のため、対局の棋譜（指し手・レベル・結果）を匿名で保存しています。個人を特定する情報は保存しません。',
  difficulties: {
    easy: { label: 'レベル1（入門）', description: '高速（約250ms）' },
    medium: { label: 'レベル2（中級）', description: 'バランス（約1秒）' },
    hard: { label: 'レベル3（上級）', description: '強い（約2秒）' },
    expert: { label: 'レベル4（エキスパート）', description: '非常に強い（約4秒）' },
    master: { label: 'レベル5（マスター）', description: '最強（約5秒）' }
  }
};

export const getShogiImprovedCopy = (language: GameLanguage): ShogiImprovedCopy =>
  language === 'ja' ? ja : en;
