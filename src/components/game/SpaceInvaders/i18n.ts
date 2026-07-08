/**
 * Local (component-scoped) UI strings for Space Invaders.
 * Uses the shared `useGameLanguage()` hook's `language` ('ja' | 'en').
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from './types';

interface SpaceInvadersStrings {
  title: string;
  tagline: string;
  singlePlayer: string;
  play: string;
  playAgain: string;
  resume: string;
  pause: string;
  howToPlay: string;
  difficulty: string;
  difficultyLabels: Record<Difficulty, string>;
  difficultyDescriptions: Record<Difficulty, string>;
  score: string;
  high: string;
  wave: string;
  lives: string;
  gameOver: string;
  victory: string;
  finalScore: string;
  newHighScore: string;
  paused: string;
  pausedHint: string;
  move: string;
  fire: string;
  controlsHint: string;
  objective: string;
  objectiveText: string;
  controls: string;
  ctrlMove: string;
  ctrlFire: string;
  ctrlPause: string;
  enemies: string;
  tips: string;
  tipShields: string;
  tipSpeed: string;
  tipUfo: string;
  tipExtraLife: string;
  bonus: string;
  topRow: string;
  midRows: string;
  botRows: string;
}

const STRINGS: Record<GameLanguage, SpaceInvadersStrings> = {
  en: {
    title: 'Space Invaders',
    tagline: 'Defend Earth from the endless alien swarm.',
    singlePlayer: 'Single Player',
    play: 'Launch',
    playAgain: 'Play Again',
    resume: 'Resume',
    pause: 'Pause',
    howToPlay: 'How to Play',
    difficulty: 'Difficulty',
    difficultyLabels: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
    difficultyDescriptions: {
      easy: 'Slower aliens, 4 lives',
      normal: 'Classic pace, 3 lives',
      hard: 'Fast & aggressive, 2 lives',
    },
    score: 'Score',
    high: 'Hi',
    wave: 'Wave',
    lives: 'Lives',
    gameOver: 'Game Over',
    victory: 'Victory!',
    finalScore: 'Final Score',
    newHighScore: 'New High Score!',
    paused: 'Paused',
    pausedHint: 'Press P or ESC to resume',
    move: 'Move',
    fire: 'Fire',
    controlsHint: 'Move: Arrows / A,D  ·  Fire: Space / Up  ·  Pause: P / ESC',
    objective: 'Objective',
    objectiveText: 'Destroy every alien before they reach Earth. Each wave descends lower and moves faster — survive as long as you can!',
    controls: 'Controls',
    ctrlMove: 'Arrow keys / A, D — Move ship',
    ctrlFire: 'Space / Up Arrow — Fire',
    ctrlPause: 'P / ESC — Pause',
    enemies: 'Enemies',
    tips: 'Tips',
    tipShields: 'Duck behind shields for cover — but they wear down.',
    tipSpeed: 'Aliens speed up as their ranks thin.',
    tipUfo: 'Shoot the mystery UFO for a big bonus.',
    tipExtraLife: 'Earn an extra life every 1,500 points.',
    bonus: 'bonus',
    topRow: 'top row',
    midRows: 'middle rows',
    botRows: 'bottom rows',
  },
  ja: {
    title: 'スペースインベーダー',
    tagline: '終わりなきエイリアンの群れから地球を守れ。',
    singlePlayer: 'シングルプレイ',
    play: '開始',
    playAgain: 'もう一度',
    resume: '再開',
    pause: '一時停止',
    howToPlay: '遊び方',
    difficulty: '難易度',
    difficultyLabels: { easy: 'イージー', normal: 'ノーマル', hard: 'ハード' },
    difficultyDescriptions: {
      easy: '遅い敵・ライフ4',
      normal: '標準ペース・ライフ3',
      hard: '高速で攻撃的・ライフ2',
    },
    score: 'スコア',
    high: 'ハイ',
    wave: 'ウェーブ',
    lives: 'ライフ',
    gameOver: 'ゲームオーバー',
    victory: '勝利！',
    finalScore: '最終スコア',
    newHighScore: 'ハイスコア更新！',
    paused: '一時停止中',
    pausedHint: 'P または ESC で再開',
    move: '移動',
    fire: '発射',
    controlsHint: '移動: 矢印 / A,D  ·  発射: スペース / ↑  ·  一時停止: P / ESC',
    objective: '目的',
    objectiveText: 'エイリアンが地球に到達する前に全滅させろ。ウェーブごとに低く速くなる——どこまで生き残れる？',
    controls: '操作',
    ctrlMove: '矢印キー / A, D — 移動',
    ctrlFire: 'スペース / ↑ — 発射',
    ctrlPause: 'P / ESC — 一時停止',
    enemies: '敵',
    tips: 'ヒント',
    tipShields: 'シールドの陰に隠れよう——ただし削れていく。',
    tipSpeed: '敵は数が減るほど速くなる。',
    tipUfo: 'ミステリーUFOを撃つと大ボーナス。',
    tipExtraLife: '1,500点ごとに残機が1つ増える。',
    bonus: 'ボーナス',
    topRow: '上段',
    midRows: '中段',
    botRows: '下段',
  },
};

export function getSpaceInvadersStrings(language: GameLanguage): SpaceInvadersStrings {
  return STRINGS[language] ?? STRINGS.en;
}
