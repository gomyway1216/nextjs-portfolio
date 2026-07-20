import type { GameLanguage } from '../constants/gameTranslations';

export interface GhostTetrisStrings {
  title: string;
  tagline: string;
  score: string;
  best: string;
  lines: string;
  level: string;
  speed: string;
  next: string;
  start: string;
  restart: string;
  playAgain: string;
  resume: string;
  pause: string;
  paused: string;
  gameOver: string;
  gameOverReason: string;
  howToPlay: string;
  controlsTitle: string;
  move: string;
  softDrop: string;
  rotate: string;
  hardDrop: string;
  pauseKey: string;
  ghostTitle: string;
  ghostBody: string;
  scoringTitle: string;
  scoringBody: string[];
  touchMove: string;
  touchRotate: string;
  touchDrop: string;
}

const en: GhostTetrisStrings = {
  title: 'Ghost Tetris',
  tagline: 'Landed blocks fade to ghosts after a moment. Clear lines from memory.',
  score: 'Score',
  best: 'Best',
  lines: 'Lines',
  level: 'Level',
  speed: 'Speed',
  next: 'Next',
  start: 'Start',
  restart: 'Restart',
  playAgain: 'Play again',
  resume: 'Resume',
  pause: 'Pause',
  paused: 'Paused',
  gameOver: 'Game Over',
  gameOverReason: 'No room to spawn the next piece.',
  howToPlay: 'How to play',
  controlsTitle: 'Controls',
  move: 'Move',
  softDrop: 'Soft drop',
  rotate: 'Rotate',
  hardDrop: 'Hard drop',
  pauseKey: 'Pause',
  ghostTitle: 'The ghost twist',
  ghostBody:
    'A block stays solid for a couple of seconds after it locks, then fades to a faint ghost. It is still there and still fills lines — you just have to remember where it is.',
  scoringTitle: 'Scoring',
  scoringBody: [
    'Single / Double / Triple / Tetris award more per line.',
    'Line points scale with your level, and the level rises every 10 lines.',
    'Soft drop +1 per cell, hard drop +2 per cell.',
  ],
  touchMove: 'Move',
  touchRotate: 'Rotate',
  touchDrop: 'Drop',
};

const ja: GhostTetrisStrings = {
  title: 'ゴーストテトリス',
  tagline: '着地したブロックは少し経つと透けて消える。記憶を頼りにラインを消そう。',
  score: 'スコア',
  best: 'ベスト',
  lines: 'ライン',
  level: 'レベル',
  speed: '速度',
  next: 'ネクスト',
  start: 'スタート',
  restart: 'リスタート',
  playAgain: 'もう一度',
  resume: '再開',
  pause: '一時停止',
  paused: '一時停止中',
  gameOver: 'ゲームオーバー',
  gameOverReason: '次のピースを置く場所がありませんでした。',
  howToPlay: '遊び方',
  controlsTitle: '操作',
  move: '移動',
  softDrop: 'ソフトドロップ',
  rotate: '回転',
  hardDrop: 'ハードドロップ',
  pauseKey: '一時停止',
  ghostTitle: 'ゴーストの仕掛け',
  ghostBody:
    'ロックされたブロックは数秒だけはっきり見え、その後うっすらとしたゴーストに変わります。消えたように見えてもそこに残っており、ラインも埋めます。位置を覚えておきましょう。',
  scoringTitle: 'スコア',
  scoringBody: [
    'シングル／ダブル／トリプル／テトリスほど1ラインあたりの得点が増えます。',
    '得点はレベルに比例し、レベルは10ラインごとに上がります。',
    'ソフトドロップは1マス+1、ハードドロップは1マス+2。',
  ],
  touchMove: '移動',
  touchRotate: '回転',
  touchDrop: 'ドロップ',
};

export const getStrings = (language: GameLanguage): GhostTetrisStrings =>
  language === 'ja' ? ja : en;
