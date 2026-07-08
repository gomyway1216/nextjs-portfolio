import type { GameLanguage } from '../constants/gameTranslations';
import type { QuizDifficulty } from './questions';

interface IqStrings {
  title: string;
  subtitle: string;
  startLabel: string;
  difficultyTitle: string;
  howToPlay: string;
  question: string;
  score: string;
  correctLabel: string;
  correctFeedback: string;
  wrongFeedback: string;
  timeUp: string;
  nextQuestion: string;
  seeResults: string;
  keyHint: string;
  nextHint: string;
  reviewTitle: string;
  playAgain: string;
  resultTitle: string;
  estimatedIq: string;
  outOf: (correct: number, total: number) => string;
  yourAnswer: string;
  timerLabel: string;
  timerOn: string;
  timerOff: string;
  difficultyOptions: { value: QuizDifficulty; label: string; description: string }[];
  ratingFor: (correct: number, total: number) => string;
}

const ja: IqStrings = {
  title: 'IQ テスト',
  subtitle: '数列・仲間外れ・類比・図形マトリックスをランダム出題。全問解いて推定IQを確認しよう。',
  startLabel: 'スタート',
  difficultyTitle: '難易度を選択',
  howToPlay: '遊び方',
  question: '問題',
  score: 'スコア',
  correctLabel: '正解',
  correctFeedback: '正解！',
  wrongFeedback: '不正解',
  timeUp: '時間切れ',
  nextQuestion: '次の問題',
  seeResults: '結果を見る',
  keyHint: 'キー 1〜4 でも選べます',
  nextHint: 'Enter / Space で次へ',
  reviewTitle: '解答レビュー',
  playAgain: 'もう一度',
  resultTitle: 'テスト終了',
  estimatedIq: '推定 IQ',
  outOf: (correct, total) => `正解 ${correct} / ${total}`,
  yourAnswer: 'あなたの解答',
  timerLabel: 'タイマー',
  timerOn: 'オン',
  timerOff: 'オフ',
  difficultyOptions: [
    { value: 'easy', label: 'かんたん', description: '基本的な数列と類比' },
    { value: 'medium', label: 'ふつう', description: '図形マトリックスなど全種類' },
    { value: 'hard', label: 'むずかしい', description: '大きな数・複雑なパターン' },
    { value: 'mixed', label: 'ミックス', description: '徐々に難しくなる（推奨）' },
  ],
  ratingFor: (correct, total) => {
    const r = total === 0 ? 0 : correct / total;
    if (r >= 0.9) return '天才クラス 🏆';
    if (r >= 0.7) return '非常に優秀 🥇';
    if (r >= 0.5) return '平均以上 🥈';
    if (r >= 0.3) return '平均的 🧠';
    return 'これから伸びる 🌱';
  },
};

const en: IqStrings = {
  title: 'IQ Test',
  subtitle:
    'Randomly generated sequences, odd-one-out, analogies and figure matrices. Finish the quiz to see your estimated IQ.',
  startLabel: 'Start',
  difficultyTitle: 'Select Difficulty',
  howToPlay: 'How to play',
  question: 'Question',
  score: 'Score',
  correctLabel: 'Correct',
  correctFeedback: 'Correct!',
  wrongFeedback: 'Incorrect',
  timeUp: "Time's up",
  nextQuestion: 'Next question',
  seeResults: 'See results',
  keyHint: 'Tip: press keys 1–4 to answer',
  nextHint: 'Press Enter / Space to continue',
  reviewTitle: 'Answer review',
  playAgain: 'Play again',
  resultTitle: 'Test complete',
  estimatedIq: 'Estimated IQ',
  outOf: (correct, total) => `${correct} / ${total} correct`,
  yourAnswer: 'Your answer',
  timerLabel: 'Timer',
  timerOn: 'On',
  timerOff: 'Off',
  difficultyOptions: [
    { value: 'easy', label: 'Easy', description: 'Basic sequences and analogies' },
    { value: 'medium', label: 'Medium', description: 'All types incl. figure matrices' },
    { value: 'hard', label: 'Hard', description: 'Larger numbers, trickier patterns' },
    { value: 'mixed', label: 'Mixed', description: 'Ramps up in difficulty (recommended)' },
  ],
  ratingFor: (correct, total) => {
    const r = total === 0 ? 0 : correct / total;
    if (r >= 0.9) return 'Genius level 🏆';
    if (r >= 0.7) return 'Highly gifted 🥇';
    if (r >= 0.5) return 'Above average 🥈';
    if (r >= 0.3) return 'Average 🧠';
    return 'Keep training 🌱';
  },
};

export const getIqStrings = (language: GameLanguage): IqStrings =>
  language === 'ja' ? ja : en;

/**
 * Rough estimated-IQ mapping from proportion correct. Not clinically meaningful —
 * a playful score. Centered at ~100 for 50% and scaled to a plausible spread.
 */
export const estimateIq = (correct: number, total: number): number => {
  if (total === 0) return 100;
  const frac = correct / total;
  // Map 0..1 → roughly 80..145, centered ~100 at 0.5.
  const iq = 80 + frac * 65;
  return Math.round(iq);
};
