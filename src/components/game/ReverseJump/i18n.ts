/**
 * Local bilingual copy for Reverse Jump. Kept inside the component dir so it
 * does not touch the shared translation constants.
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface ReverseJumpCopy {
  title: string;
  tagline: string;
  score: string;
  best: string;
  mode: string;
  modeNormal: string;
  modeInverted: string;
  swapIn: string;
  seconds: (n: number) => string;
  difficulty: string;
  easy: string;
  medium: string;
  hard: string;
  ready: string;
  start: string;
  gameOver: string;
  retry: string;
  finalScore: string;
  newBest: string;
  howToPlay: string;
  primaryControl: string;
  secondaryControl: string;
  invertNote: string;
  tapHint: string;
  jump: string;
  duck: string;
  a11yPlayfield: string;
  instrTitle: string;
  instr: string[];
  controlsHeading: string;
  controlKeyboard: string;
  controlTouch: string;
  pause: string;
  paused: string;
  resume: string;
}

const en: ReverseJumpCopy = {
  title: 'Reverse Jump',
  tagline: 'The controls flip on a timer. Jump the low blocks, duck the high ones — but remember which way is which right now.',
  score: 'Score',
  best: 'Best',
  mode: 'Controls',
  modeNormal: 'NORMAL',
  modeInverted: 'INVERTED',
  swapIn: 'Flip in',
  seconds: (n) => `${n}s`,
  difficulty: 'Difficulty',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  ready: 'Ready?',
  start: 'Start',
  gameOver: 'Game Over',
  retry: 'Retry',
  finalScore: 'Final score',
  newBest: 'New best!',
  howToPlay: 'How to play',
  primaryControl: 'Primary',
  secondaryControl: 'Secondary',
  invertNote: 'When INVERTED, jump and duck swap places.',
  tapHint: 'Tap / Space to act',
  jump: 'Jump',
  duck: 'Duck',
  a11yPlayfield: 'Reverse Jump playfield. Press Space or Arrow keys to control your runner.',
  instrTitle: 'How to play',
  instr: [
    'Your runner moves automatically. Clear obstacles to score.',
    'Low blocks: jump over them. Overhead bars: duck under them.',
    'Every few seconds the controls FLIP. A banner warns you before each flip.',
    'In NORMAL mode the primary action jumps; in INVERTED mode it ducks. Adapt fast!',
  ],
  controlsHeading: 'Controls',
  controlKeyboard: 'Keyboard: Space / ↑ = primary action, ↓ = secondary action, P = pause.',
  controlTouch: 'Touch: tap the left half for the primary action, the right half for the secondary action.',
  pause: 'Pause',
  paused: 'Paused',
  resume: 'Resume',
};

const ja: ReverseJumpCopy = {
  title: 'リバースジャンプ',
  tagline: '操作が一定時間ごとに反転。低い障害物はジャンプ、高い障害物はしゃがみ。今どちらのモードかを覚えておこう。',
  score: 'スコア',
  best: 'ベスト',
  mode: '操作',
  modeNormal: 'ノーマル',
  modeInverted: '反転',
  swapIn: '反転まで',
  seconds: (n) => `${n}秒`,
  difficulty: '難易度',
  easy: 'かんたん',
  medium: 'ふつう',
  hard: 'むずかしい',
  ready: '準備はいい？',
  start: 'スタート',
  gameOver: 'ゲームオーバー',
  retry: 'リトライ',
  finalScore: '最終スコア',
  newBest: '自己ベスト更新！',
  howToPlay: '遊び方',
  primaryControl: 'メイン',
  secondaryControl: 'サブ',
  invertNote: '反転中はジャンプとしゃがみが入れ替わります。',
  tapHint: 'タップ / スペースで操作',
  jump: 'ジャンプ',
  duck: 'しゃがみ',
  a11yPlayfield: 'リバースジャンプのプレイ画面。スペースまたは矢印キーでランナーを操作します。',
  instrTitle: '遊び方',
  instr: [
    'ランナーは自動で進みます。障害物を避けてスコアを稼ごう。',
    '低い障害物はジャンプ、頭上のバーはしゃがみで回避。',
    '数秒ごとに操作が反転します。反転前にバナーで予告されます。',
    'ノーマル中はメイン操作がジャンプ、反転中はしゃがみになります。素早く切り替えよう！',
  ],
  controlsHeading: '操作方法',
  controlKeyboard: 'キーボード: スペース / ↑ = メイン操作、↓ = サブ操作、P = ポーズ。',
  controlTouch: 'タッチ: 画面左半分でメイン操作、右半分でサブ操作。',
  pause: 'ポーズ',
  paused: '一時停止中',
  resume: '再開',
};

export const getReverseJumpCopy = (language: GameLanguage): ReverseJumpCopy =>
  language === 'ja' ? ja : en;
