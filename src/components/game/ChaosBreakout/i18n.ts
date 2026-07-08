/**
 * Local bilingual strings for Chaos Breakout.
 * Kept in the component dir per the revamp spec (no new keys in shared translations).
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from './engine';

export interface ChaosBreakoutStrings {
  title: string;
  tagline: string;
  difficultyTitle: string;
  start: string;
  restart: string;
  resume: string;
  pause: string;
  playAgain: string;
  howToPlay: string;
  score: string;
  best: string;
  lives: string;
  stage: string;
  gravity: string;
  combo: string;
  ready: string;
  readyHint: string;
  paused: string;
  gameOver: string;
  finalScore: string;
  newBest: string;
  controlsTitle: string;
  controls: string[];
  chaosTitle: string;
  chaosIntro: string;
  chaosList: string[];
  difficulties: Record<Difficulty, { label: string; description: string }>;
}

const en: ChaosBreakoutStrings = {
  title: 'Chaos Breakout',
  tagline: 'Break every brick while gravity, speed, and your paddle keep going haywire.',
  difficultyTitle: 'Choose your chaos',
  start: 'Start',
  restart: 'Restart',
  resume: 'Resume',
  pause: 'Pause',
  playAgain: 'Play again',
  howToPlay: 'How to play',
  score: 'Score',
  best: 'Best',
  lives: 'Lives',
  stage: 'Stage',
  gravity: 'Gravity',
  combo: 'Combo',
  ready: 'Ready?',
  readyHint: 'Click, tap or press Space to launch',
  paused: 'Paused',
  gameOver: 'Game Over',
  finalScore: 'Final score',
  newBest: 'New best!',
  controlsTitle: 'Controls',
  controls: [
    'Move paddle: mouse / touch drag, or ← → / A D',
    'Launch ball: click, tap, or Space',
    'Pause: P or Esc',
  ],
  chaosTitle: 'What is the chaos?',
  chaosIntro: 'Every few seconds a chaos pulse fires and warps the run:',
  chaosList: [
    'Gravity flips to a new direction — the ball curves that way.',
    'Speed spikes up or drops to slow motion.',
    'Your paddle suddenly grows or shrinks.',
    'A second ball may split off (multiball).',
  ],
  difficulties: {
    easy: { label: 'Easy', description: 'Slow chaos, wide paddle, 5 lives' },
    medium: { label: 'Medium', description: 'Balanced pace, multiball on' },
    hard: { label: 'Hard', description: 'Faster pulses, tougher bricks' },
    expert: { label: 'Expert', description: 'Relentless chaos, narrow paddle' },
    master: { label: 'Master', description: 'Maximum mayhem, 2 lives' },
  },
};

const ja: ChaosBreakoutStrings = {
  title: 'カオス・ブロック崩し',
  tagline: '重力・速度・パドル幅が数秒ごとに暴走する中で、全ブロックを破壊しよう。',
  difficultyTitle: 'カオスの強さを選択',
  start: 'スタート',
  restart: 'リスタート',
  resume: '再開',
  pause: '一時停止',
  playAgain: 'もう一度',
  howToPlay: '遊び方',
  score: 'スコア',
  best: 'ベスト',
  lives: '残機',
  stage: 'ステージ',
  gravity: '重力',
  combo: 'コンボ',
  ready: '準備OK?',
  readyHint: 'クリック・タップ・スペースで発射',
  paused: '一時停止中',
  gameOver: 'ゲームオーバー',
  finalScore: '最終スコア',
  newBest: 'ベスト更新！',
  controlsTitle: '操作方法',
  controls: [
    'パドル移動: マウス / タッチ、または ← → / A D',
    'ボール発射: クリック・タップ・スペース',
    '一時停止: P または Esc',
  ],
  chaosTitle: 'カオスとは?',
  chaosIntro: '数秒ごとにカオスパルスが発生し、状況が激変します:',
  chaosList: [
    '重力の向きが切り替わり、ボールがその方向へ曲がる。',
    '速度が急上昇、またはスローモーションに。',
    'パドルが突然大きく／小さくなる。',
    'ボールが分裂することも（マルチボール）。',
  ],
  difficulties: {
    easy: { label: 'イージー', description: 'ゆっくりカオス・広いパドル・残機5' },
    medium: { label: 'ミディアム', description: 'バランス型・マルチボールあり' },
    hard: { label: 'ハード', description: '速いパルス・硬いブロック' },
    expert: { label: 'エキスパート', description: '容赦ないカオス・狭いパドル' },
    master: { label: 'マスター', description: '最大級の混沌・残機2' },
  },
};

export const getStrings = (language: GameLanguage): ChaosBreakoutStrings =>
  language === 'ja' ? ja : en;
