/**
 * Breakout — local ja/en strings (kept out of the shared translations file).
 */

import type { Difficulty, DifficultyOption } from '../common/types';
import type { GameLanguage } from '../constants/gameTranslations';

export interface BreakoutStrings {
  title: string;
  tagline: string;
  gameSetup: string;
  selectDifficulty: string;
  start: string;
  howToPlay: string;
  objective: string;
  objectiveBody: string;
  controls: string;
  controlMove: string;
  controlLaunch: string;
  controlPause: string;
  powerups: string;
  puExpand: string;
  puShrink: string;
  puMulti: string;
  puSlow: string;
  puFast: string;
  puLife: string;
  score: string;
  hi: string;
  level: string;
  lives: string;
  combo: string;
  paused: string;
  resume: string;
  pause: string;
  gameOver: string;
  victory: string;
  finalScore: string;
  newHighScore: string;
  playAgain: string;
  backToMenu: string;
  launchHint: string;
  clearedLevels: (n: number) => string;
}

const en: BreakoutStrings = {
  title: 'BREAKOUT',
  tagline: 'Classic brick-breaking action, rebuilt.',
  gameSetup: 'Game setup',
  selectDifficulty: 'Select difficulty',
  start: 'Start Game',
  howToPlay: 'How to Play',
  objective: 'Objective',
  objectiveBody: 'Clear every brick across 6 escalating levels. Keep the ball in play and chain hits for combo bonuses.',
  controls: 'Controls',
  controlMove: 'Move paddle — Mouse / Touch / Arrow keys / A · D',
  controlLaunch: 'Launch ball — Click / Tap / Space',
  controlPause: 'Pause — P / Esc',
  powerups: 'Power-ups',
  puExpand: 'Widen paddle',
  puShrink: 'Shrink paddle',
  puMulti: 'Multi-ball',
  puSlow: 'Slow ball',
  puFast: 'Fast ball',
  puLife: 'Extra life',
  score: 'Score',
  hi: 'Best',
  level: 'Level',
  lives: 'Lives',
  combo: 'Combo',
  paused: 'Paused',
  resume: 'Resume',
  pause: 'Pause',
  gameOver: 'Game Over',
  victory: 'You Win!',
  finalScore: 'Final score',
  newHighScore: 'New best score!',
  playAgain: 'Play Again',
  backToMenu: 'Menu',
  launchHint: 'Click, tap or press Space to launch',
  clearedLevels: (n) => `Cleared ${n} level${n === 1 ? '' : 's'}`,
};

const ja: BreakoutStrings = {
  title: 'ブロック崩し',
  tagline: '定番のブロック崩しをリニューアル。',
  gameSetup: 'ゲーム設定',
  selectDifficulty: '難易度を選択',
  start: 'ゲーム開始',
  howToPlay: '遊び方',
  objective: '目的',
  objectiveBody: '6ステージのブロックをすべて崩そう。ボールを落とさず、連続ヒットでコンボボーナスを狙え。',
  controls: '操作',
  controlMove: 'パドル移動 — マウス / タッチ / 矢印キー / A・D',
  controlLaunch: 'ボール発射 — クリック / タップ / スペース',
  controlPause: '一時停止 — P / Esc',
  powerups: 'パワーアップ',
  puExpand: 'パドル拡大',
  puShrink: 'パドル縮小',
  puMulti: 'マルチボール',
  puSlow: 'スロー',
  puFast: 'スピードアップ',
  puLife: '残機追加',
  score: 'スコア',
  hi: 'ベスト',
  level: 'レベル',
  lives: '残機',
  combo: 'コンボ',
  paused: '一時停止中',
  resume: '再開',
  pause: '一時停止',
  gameOver: 'ゲームオーバー',
  victory: 'クリア！',
  finalScore: '最終スコア',
  newHighScore: 'ベストスコア更新！',
  playAgain: 'もう一度',
  backToMenu: 'メニュー',
  launchHint: 'クリック・タップ・スペースで発射',
  clearedLevels: (n) => `${n}ステージクリア`,
};

export function getStrings(lang: GameLanguage): BreakoutStrings {
  return lang === 'ja' ? ja : en;
}

export function getDifficultyOptions(lang: GameLanguage): DifficultyOption[] {
  const opts: Record<Difficulty, { en: [string, string]; ja: [string, string] }> = {
    easy: { en: ['Easy', 'Slow ball · 5 lives · frequent power-ups'], ja: ['やさしい', 'ゆっくり・残機5・アイテム多め'] },
    medium: { en: ['Normal', 'Balanced speed · 3 lives'], ja: ['ふつう', 'バランス・残機3'] },
    hard: { en: ['Hard', 'Fast ball · smaller paddle · 3 lives'], ja: ['むずかしい', '高速・小さめパドル・残機3'] },
    expert: { en: ['Expert', 'Very fast · 2 lives · rare power-ups'], ja: ['エキスパート', '超高速・残機2・アイテム希少'] },
    master: { en: ['Master', 'Blazing · tiny paddle · 2 lives'], ja: ['マスター', '爆速・極小パドル・残機2'] },
  };
  return (Object.keys(opts) as Difficulty[]).map((value) => {
    const o = opts[value];
    const [label, description] = lang === 'ja' ? o.ja : o.en;
    return { value, label, description };
  });
}
