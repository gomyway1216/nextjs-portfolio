/**
 * Local bilingual (ja/en) strings for the Tetris UI.
 * Kept inside the component dir per the revamp spec (no shared-file edits).
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface TetrisStrings {
  title: string;
  subtitle: string;
  selectDifficulty: string;
  start: string;
  easy: string;
  medium: string;
  hard: string;
  easyDesc: string;
  mediumDesc: string;
  hardDesc: string;
  score: string;
  highScore: string;
  level: string;
  lines: string;
  next: string;
  hold: string;
  pause: string;
  resume: string;
  newGame: string;
  menu: string;
  gameOver: string;
  paused: string;
  playAgain: string;
  controls: string;
  move: string;
  rotate: string;
  rotateCcw: string;
  softDrop: string;
  hardDrop: string;
  holdKey: string;
  pauseKey: string;
  howToPlay: string;
  objective: string;
  objectiveBody: string;
  scoring: string;
  scoringSingle: string;
  scoringDouble: string;
  scoringTriple: string;
  scoringTetris: string;
  scoringDrops: string;
  scoringLevel: string;
  tips: string;
  tip1: string;
  tip2: string;
  tip3: string;
  tip4: string;
}

const en: TetrisStrings = {
  title: 'Tetris',
  subtitle: 'Stack blocks, clear lines, chase the Tetris.',
  selectDifficulty: 'Starting Speed',
  start: 'Start Game',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  easyDesc: 'Gentle gravity — great for learning',
  mediumDesc: 'Classic starting speed',
  hardDesc: 'Fast drops from the first piece',
  score: 'Score',
  highScore: 'High Score',
  level: 'Level',
  lines: 'Lines',
  next: 'Next',
  hold: 'Hold',
  pause: 'Pause',
  resume: 'Resume',
  newGame: 'Restart',
  menu: 'Menu',
  gameOver: 'Game Over',
  paused: 'Paused',
  playAgain: 'Play Again',
  controls: 'Controls',
  move: 'Move',
  rotate: 'Rotate CW',
  rotateCcw: 'Rotate CCW',
  softDrop: 'Soft drop',
  hardDrop: 'Hard drop',
  holdKey: 'Hold',
  pauseKey: 'Pause',
  howToPlay: 'How to Play',
  objective: 'Objective',
  objectiveBody:
    'Move and rotate the falling tetrominoes to fill complete horizontal rows. Filled rows clear and score points. The game ends when the stack reaches the top.',
  scoring: 'Scoring',
  scoringSingle: 'Single (1 line): 100 × level',
  scoringDouble: 'Double (2 lines): 300 × level',
  scoringTriple: 'Triple (3 lines): 500 × level',
  scoringTetris: 'Tetris (4 lines): 800 × level',
  scoringDrops: 'Soft drop +1 / hard drop +2 per cell',
  scoringLevel: 'Level (and speed) goes up every 10 lines',
  tips: 'Pro Tips',
  tip1: 'Keep the stack flat and avoid holes.',
  tip2: 'Save the I-piece and Hold to set up Tetrises.',
  tip3: 'Use the ghost piece to line up hard drops.',
  tip4: 'Plan ahead with the 5-piece Next queue.',
};

const ja: TetrisStrings = {
  title: 'テトリス',
  subtitle: 'ブロックを積んでラインを消そう。',
  selectDifficulty: '開始スピード',
  start: 'ゲーム開始',
  easy: 'かんたん',
  medium: 'ふつう',
  hard: 'むずかしい',
  easyDesc: 'ゆっくり落下 — 練習向け',
  mediumDesc: '標準的な開始スピード',
  hardDesc: '最初から速い落下',
  score: 'スコア',
  highScore: 'ハイスコア',
  level: 'レベル',
  lines: 'ライン',
  next: 'ネクスト',
  hold: 'ホールド',
  pause: '一時停止',
  resume: '再開',
  newGame: 'リスタート',
  menu: 'メニュー',
  gameOver: 'ゲームオーバー',
  paused: '一時停止中',
  playAgain: 'もう一度',
  controls: '操作',
  move: '移動',
  rotate: '右回転',
  rotateCcw: '左回転',
  softDrop: 'ソフトドロップ',
  hardDrop: 'ハードドロップ',
  holdKey: 'ホールド',
  pauseKey: '一時停止',
  howToPlay: '遊び方',
  objective: '目的',
  objectiveBody:
    '落ちてくるテトリミノを動かし回転させて横一列を埋めましょう。揃った列は消えて得点になります。積み上がって上まで達するとゲームオーバーです。',
  scoring: 'スコア',
  scoringSingle: 'シングル(1列): 100 × レベル',
  scoringDouble: 'ダブル(2列): 300 × レベル',
  scoringTriple: 'トリプル(3列): 500 × レベル',
  scoringTetris: 'テトリス(4列): 800 × レベル',
  scoringDrops: 'ソフトドロップ +1 / ハードドロップ +2 (1マスごと)',
  scoringLevel: '10ライン消すごとにレベルと速度が上昇',
  tips: '上達のコツ',
  tip1: '表面を平らに保ち、穴を作らない。',
  tip2: 'Iミノとホールドでテトリスを狙う。',
  tip3: 'ゴーストでハードドロップの位置を合わせる。',
  tip4: '5個のネクストで先を読む。',
};

export const getTetrisStrings = (lang: GameLanguage): TetrisStrings =>
  lang === 'ja' ? ja : en;
