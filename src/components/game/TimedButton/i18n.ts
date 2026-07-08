/**
 * Local bilingual copy for the Timed Button game. Kept in the component dir so
 * we don't touch the shared gameTranslations.ts (see revamp spec).
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from './gameLogic';

export interface TimedButtonCopy {
  title: string;
  tagline: string;
  selectDifficulty: string;
  start: string;
  tapToStop: string;
  tapToStart: string;
  round: string;
  score: string;
  best: string;
  precision: string;
  hitTheTarget: string;
  perfect: string;
  great: string;
  good: string;
  miss: string;
  runComplete: string;
  finalScore: string;
  newBest: string;
  playAgain: string;
  changeDifficulty: string;
  avgPrecision: string;
  bestPrecision: string;
  howToPlay: string;
  hits: string;
  difficulties: Record<Difficulty, { label: string; description: string }>;
  infoSections: { title: string; description: string }[];
  proTipsTitle: string;
  proTips: string[];
  controlsHint: string;
}

const en: TimedButtonCopy = {
  title: 'Timed Button',
  tagline: 'Stop the sweeping marker inside the target zone. The closer to dead-centre, the higher your score.',
  selectDifficulty: 'Select Difficulty',
  start: 'Start',
  tapToStop: 'TAP TO STOP',
  tapToStart: 'TAP TO START',
  round: 'Round',
  score: 'Score',
  best: 'Best',
  precision: 'Precision',
  hitTheTarget: 'Stop inside the green zone',
  perfect: 'PERFECT!',
  great: 'Great',
  good: 'Good',
  miss: 'Miss',
  runComplete: 'Run Complete',
  finalScore: 'Final Score',
  newBest: 'New personal best!',
  playAgain: 'Play Again',
  changeDifficulty: 'Change Difficulty',
  avgPrecision: 'Avg precision',
  bestPrecision: 'Best precision',
  howToPlay: 'How to Play',
  hits: 'Hits',
  difficulties: {
    easy: { label: 'Easy', description: 'Slow sweep, wide zone' },
    medium: { label: 'Medium', description: 'Balanced pace' },
    hard: { label: 'Hard', description: 'Fast, narrow zone' },
    expert: { label: 'Expert', description: 'Very fast, tiny zone' },
    master: { label: 'Master', description: 'Blazing, pinpoint zone' },
  },
  infoSections: [
    { title: 'Goal', description: 'A marker sweeps back and forth. Tap the button to stop it as close to the centre of the target zone as you can.' },
    { title: 'Scoring', description: 'Score scales with precision — a dead-centre PERFECT is worth far more than a hit near the edge. Higher difficulties multiply your points.' },
    { title: 'Rounds', description: 'Each run is several rounds. The target position and zone change every round. Your total across all rounds is your run score.' },
    { title: 'Controls', description: 'Tap the button, or press Space / Enter. Everything is keyboard and touch friendly.' },
  ],
  proTipsTitle: 'Pro tips',
  proTips: [
    'Watch a full sweep before your first tap to learn the rhythm.',
    'Tap slightly early — reaction lag means you register a touch after you decide.',
    'On Master the zone is tiny; aim for the exact centre, not just "inside".',
  ],
  controlsHint: 'Space / Enter or tap',
};

const ja: TimedButtonCopy = {
  title: 'タイムドボタン',
  tagline: '往復するマーカーをターゲットゾーン内で止めよう。中心に近いほど高得点。',
  selectDifficulty: '難易度を選択',
  start: 'スタート',
  tapToStop: 'タップで停止',
  tapToStart: 'タップで開始',
  round: 'ラウンド',
  score: 'スコア',
  best: 'ベスト',
  precision: '精度',
  hitTheTarget: '緑のゾーンで止めよう',
  perfect: 'パーフェクト！',
  great: 'グレート',
  good: 'グッド',
  miss: 'ミス',
  runComplete: 'クリア',
  finalScore: '最終スコア',
  newBest: '自己ベスト更新！',
  playAgain: 'もう一度',
  changeDifficulty: '難易度を変更',
  avgPrecision: '平均精度',
  bestPrecision: '最高精度',
  howToPlay: '遊び方',
  hits: 'ヒット',
  difficulties: {
    easy: { label: 'かんたん', description: 'ゆっくり・広いゾーン' },
    medium: { label: 'ふつう', description: 'バランス型' },
    hard: { label: 'むずかしい', description: '速い・狭いゾーン' },
    expert: { label: 'エキスパート', description: '超高速・極小ゾーン' },
    master: { label: 'マスター', description: '爆速・ピンポイント' },
  },
  infoSections: [
    { title: '目的', description: 'マーカーが左右に往復します。ボタンをタップして、ターゲットゾーンの中心にできるだけ近い位置で止めましょう。' },
    { title: 'スコア', description: 'スコアは精度に比例します。中心ちょうどのパーフェクトは端すれすれよりずっと高得点。高難易度ほど倍率が上がります。' },
    { title: 'ラウンド', description: '1プレイは複数ラウンド。ラウンドごとにターゲット位置とゾーンが変わります。合計が最終スコアです。' },
    { title: '操作', description: 'ボタンをタップ、またはスペース／エンターキー。キーボードにもタッチにも対応しています。' },
  ],
  proTipsTitle: 'コツ',
  proTips: [
    '最初のタップ前に一往復見てリズムをつかもう。',
    '反応の遅れを見込んで、ほんの少し早めにタップ。',
    'マスターはゾーンが極小。「中に入れる」ではなく中心ちょうどを狙おう。',
  ],
  controlsHint: 'スペース／エンター・タップ',
};

export const getTimedButtonCopy = (language: GameLanguage): TimedButtonCopy =>
  language === 'ja' ? ja : en;
