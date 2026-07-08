import type { GameLanguage } from '../constants/gameTranslations';

export interface BayesianStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabSim: string;

  // Play tab
  truePLabel: string;
  hidden: string;
  reveal: string;
  hide: string;
  flipOnce: string;
  flipN: (n: number) => string;
  reset: string;
  priorLabel: string;
  priorHint: string;
  priorAlpha: string;
  priorBeta: string;
  presetUniform: string;
  presetJeffreys: string;
  presetStrong: string;

  summaryHeading: string;
  statObserved: string;
  statMean: string;
  statMode: string;
  statStd: string;
  statCI: string;
  yourGuess: string;
  guessValue: string;
  guessDiff: string;

  legendPrior: string;
  legendPosterior: string;
  legendTrueP: string;
  legendCI: string;

  explainHeading: string;
  explainBody: string;
  formulaHeading: string;

  historyHeading: string;
  historyTruncated: (n: number) => string;
  noFlipsYet: string;

  // Sim tab
  simTrueP: string;
  simSteps: string;
  simTrials: string;
  simRun: string;
  simRunning: (done: number, total: number) => string;
  simIntroTitle: string;
  simIntroBody: string;
  simTrajHeading: (trials: number, p: string) => string;
  simTrajCaption: (p: string) => string;
  simFinalHeading: (steps: number) => string;
  simStatTrueP: string;
  simStatMeanOfMeans: string;
  simStatSpread: string;
  simStatTheory: string;
  simFinalCaption: string;
  flipsAxis: (n: string) => string;
  posteriorMeanAxis: (trials: number) => string;
}

const ja: BayesianStrings = {
  title: 'ベイズ更新',
  subtitle:
    '隠された確率 p を持つコイン。事前分布から始めて、観測 1 回ごとに事後分布が鋭くなる様子を体感します。',
  tabPlay: '遊ぶ',
  tabSim: 'シミュレーション',

  truePLabel: '真の確率 p (隠されている)',
  hidden: '???',
  reveal: '真値を表示',
  hide: '真値を隠す',
  flipOnce: '1 回振る',
  flipN: (n) => `${n} 回`,
  reset: 'リセット',
  priorLabel: '事前分布 Beta(α₀, β₀)',
  priorHint: '観測前の信念。値が大きいほど事前の確信が強い。',
  priorAlpha: 'α₀ (表側の擬似観測)',
  priorBeta: 'β₀ (裏側の擬似観測)',
  presetUniform: '一様 (1,1)',
  presetJeffreys: 'ジェフリーズ (0.5,0.5)',
  presetStrong: '強い事前 (8,2)',

  summaryHeading: '事後分布の要約',
  statObserved: '観測 (表 / 裏)',
  statMean: '推定値 p̂ (事後平均)',
  statMode: '最頻値 (MAP)',
  statStd: '不確かさ σ',
  statCI: '95% 信用区間',
  yourGuess: 'あなたの予想 p',
  guessValue: '予想',
  guessDiff: '真値との差',

  legendPrior: '事前分布',
  legendPosterior: '事後分布',
  legendTrueP: '真値 p',
  legendCI: '95% 信用区間',

  explainHeading: 'ベイズ更新のしくみ',
  explainBody:
    'コインの真の確率 p は不明。事前分布 Beta(α₀, β₀) からスタートし、表が出れば α に +1、裏が出れば β に +1 するだけで事後分布が得られます (ベータ・二項共役)。観測が増えるほど山が鋭くなり、真の p に寄っていきます。',
  formulaHeading: '事後分布 = Beta(α₀ + 表, β₀ + 裏)',

  historyHeading: '観測履歴',
  historyTruncated: (n) => `(直近 ${n} 回のみ表示)`,
  noFlipsYet: 'まだコインを振っていません。',

  simTrueP: '真の確率 p',
  simSteps: 'ステップ数',
  simTrials: '試行回数',
  simRun: 'シミュレーション実行',
  simRunning: (done, total) =>
    `実行中… ${done.toLocaleString()} / ${total.toLocaleString()}`,
  simIntroTitle: 'このタブについて',
  simIntroBody:
    '独立な試行を多数回実行し、各試行で事後平均がどう推移するかを重ねて表示します。全試行とも真の p に収束し、ばらつきは O(1/√N) で縮みます。',
  simTrajHeading: (trials, p) => `事後平均の推移 (${trials} 試行, 真値 p = ${p})`,
  simTrajCaption: (p) =>
    `各線 = 1 試行の事後平均。最初はバラつくが、観測が増えると皆 真値 ${p} に収束。`,
  simFinalHeading: (steps) => `最終 (${steps} 回振った後) の事後平均`,
  simStatTrueP: '真値 p',
  simStatMeanOfMeans: '試行平均の平均',
  simStatSpread: '試行間の std',
  simStatTheory: '理論 std ≈ √(p(1−p)/N)',
  simFinalCaption:
    '試行間 std が理論値 √(p(1−p)/N) と一致すれば、ベイズ推定が最尤推定 (単純平均) と漸近的に同じ収束率を持つことが分かります。',
  flipsAxis: (n) => `${n} 回`,
  posteriorMeanAxis: (trials) => `事後平均 / 試行 (${trials} 試行)`,
};

const en: BayesianStrings = {
  title: 'Bayesian Update',
  subtitle:
    'A coin with a hidden probability p. Start from a prior and watch the posterior sharpen with every observation.',
  tabPlay: 'Play',
  tabSim: 'Simulation',

  truePLabel: 'True probability p (hidden)',
  hidden: '???',
  reveal: 'Reveal truth',
  hide: 'Hide truth',
  flipOnce: 'Flip once',
  flipN: (n) => `${n}×`,
  reset: 'Reset',
  priorLabel: 'Prior Beta(α₀, β₀)',
  priorHint: 'Your belief before any data. Larger values = stronger prior conviction.',
  priorAlpha: 'α₀ (pseudo-heads)',
  priorBeta: 'β₀ (pseudo-tails)',
  presetUniform: 'Uniform (1,1)',
  presetJeffreys: 'Jeffreys (0.5,0.5)',
  presetStrong: 'Strong (8,2)',

  summaryHeading: 'Posterior summary',
  statObserved: 'Observed (H / T)',
  statMean: 'Estimate p̂ (posterior mean)',
  statMode: 'Mode (MAP)',
  statStd: 'Uncertainty σ',
  statCI: '95% credible interval',
  yourGuess: 'Your guess for p',
  guessValue: 'Guess',
  guessDiff: 'Error vs truth',

  legendPrior: 'Prior',
  legendPosterior: 'Posterior',
  legendTrueP: 'True p',
  legendCI: '95% CI',

  explainHeading: 'How Bayesian updating works',
  explainBody:
    "The coin's true probability p is unknown. Start from a prior Beta(α₀, β₀); every heads adds 1 to α and every tails adds 1 to β to give the posterior (Beta-Binomial conjugacy). The more you observe, the sharper the peak and the closer it sits to the true p.",
  formulaHeading: 'Posterior = Beta(α₀ + heads, β₀ + tails)',

  historyHeading: 'Observation history',
  historyTruncated: (n) => `(showing last ${n} only)`,
  noFlipsYet: "You haven't flipped the coin yet.",

  simTrueP: 'True probability p',
  simSteps: 'Steps',
  simTrials: 'Trials',
  simRun: 'Run simulation',
  simRunning: (done, total) =>
    `Running… ${done.toLocaleString()} / ${total.toLocaleString()}`,
  simIntroTitle: 'About this tab',
  simIntroBody:
    'Run many independent trials and overlay how each trial’s posterior mean evolves. Every trial converges to the true p, and the spread shrinks like O(1/√N).',
  simTrajHeading: (trials, p) => `Posterior-mean trajectories (${trials} trials, true p = ${p})`,
  simTrajCaption: (p) =>
    `Each line = one trial's posterior mean. Noisy at first, but they all converge to the true value ${p}.`,
  simFinalHeading: (steps) => `Posterior mean after ${steps} flips`,
  simStatTrueP: 'True p',
  simStatMeanOfMeans: 'Mean of trial means',
  simStatSpread: 'Std across trials',
  simStatTheory: 'Theory std ≈ √(p(1−p)/N)',
  simFinalCaption:
    'When the across-trial std matches the theoretical √(p(1−p)/N), it shows the Bayesian estimate converges at the same asymptotic rate as the MLE (the simple average).',
  flipsAxis: (n) => `${n} flips`,
  posteriorMeanAxis: (trials) => `posterior mean / trial (${trials} trials)`,
};

export function getStrings(lang: GameLanguage): BayesianStrings {
  return lang === 'ja' ? ja : en;
}
