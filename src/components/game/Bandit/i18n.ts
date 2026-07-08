import type { GameLanguage } from '../constants/gameTranslations';

/**
 * Local bilingual strings for the Bandit game. We keep these self-contained
 * (not in the shared gameTranslations) so this game can evolve independently.
 */
export interface BanditStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabSim: string;

  // Play tab
  armCount: string;
  pullLimit: string;
  newGame: string;
  showProbs: string;
  hideProbs: string;
  hint: string;
  hintOn: string;
  hintOff: string;
  armLabel: (i: number) => string;
  pulledTimes: (n: number, wins: number) => string;
  empMean: string;
  trueValue: string;
  notPulledYet: string;
  suggestsPull: (strategy: string) => string;

  progress: string;
  remainingPulls: string;
  cumReward: string;
  optimalReward: string;
  cumRegret: string;
  hitRate: string;
  finished: string;
  finishedDetail: (reward: number, total: number, pct: string) => string;
  trueProbsAre: string;
  bestArmExpected: (v: string) => string;
  yourRegret: (v: string) => string;

  explainTitle: string;
  explainBody: string;

  // Sim tab
  trueProbsInput: string;
  steps: string;
  trialsPerStrategy: string;
  epsilon: string;
  runComparison: string;
  running: (label: string, done: string, total: string) => string;
  simCaption: string;
  cumRewardChart: (T: number, trials: string) => string;
  cumRegretChart: string;
  regretNote: string;
  finalScores: string;
  colStrategy: string;
  colReward: string;
  colRegret: string;
  colVsOptimal: string;
  introTitle: string;
  introList: { name: string; desc: string; color: string }[];
  introFooter: string;

  strategyLabels: Record<string, string>;
}

const ja: BanditStrings = {
  title: '🎰 K本腕バンディット',
  subtitle: '各アームに隠れた当たり確率。探索(explore)と活用(exploit)のバランスをどう取るか — Thompson Sampling / UCB1 / ε-greedy を比べる古典問題。',
  tabPlay: '遊ぶ',
  tabSim: 'シミュレーション',

  armCount: 'アーム数 K',
  pullLimit: '制限回数 T',
  newGame: '🎲 新しいゲーム',
  showProbs: '👀 真の確率を見る',
  hideProbs: '🙈 確率を隠す',
  hint: 'ヒント',
  hintOn: '💡 ヒントを消す',
  hintOff: '💡 戦略のヒント',
  armLabel: (i) => `アーム ${i}`,
  pulledTimes: (n, wins) => `引いた ${n} 回 / 当たり ${wins}`,
  empMean: '実測 p̂',
  trueValue: '真値',
  notPulledYet: '（まだ引いてない）',
  suggestsPull: (s) => `${s} ならここ`,

  progress: '進捗',
  remainingPulls: '残り pulls',
  cumReward: '累計報酬',
  optimalReward: '最適報酬 (理論)',
  cumRegret: '累積 regret',
  hitRate: '当選率',
  finished: '終了！',
  finishedDetail: (reward, total, pct) => `累計 ${reward} / ${total} = ${pct}%`,
  trueProbsAre: '真の確率',
  bestArmExpected: (v) => `ベストアームを毎回引いていれば期待 ${v}`,
  yourRegret: (v) => `あなたとの差 (regret) = ${v}`,

  explainTitle: 'K本腕バンディットとは:',
  explainBody:
    '各アームには隠された当たり確率 p_i があり、毎回どれを引くか選びます。探索(explore)＝情報集め（どれが良いか確かめる）、活用(exploit)＝今のところベストっぽいものを引く。このバランスがすべて。シミュレーションタブで ε-greedy / UCB1 / Thompson Sampling を比較できます。',

  trueProbsInput: '真の p (カンマ区切り、2つ以上)',
  steps: 'ステップ数 T',
  trialsPerStrategy: '試行回数 (戦略あたり)',
  epsilon: 'ε (ε-greedy 用)',
  runComparison: '6 戦略を比較実行',
  running: (label, done, total) => `実行中 ${label}: ${done} / ${total}`,
  simCaption: '各戦略を独立にシミュレーション。同じ probs で 6 戦略の挙動を比較。',
  cumRewardChart: (T, trials) => `累積報酬 (T=${T}, 試行=${trials})`,
  cumRegretChart: '累積 regret (= optimal − reward)',
  regretNote:
    'Thompson と UCB1 は対数的な regret（素晴らしい）。Random は線形に発散。Greedy は運次第で線形に発散することも。',
  finalScores: '戦略別 最終スコア',
  colStrategy: '戦略',
  colReward: '平均 reward',
  colRegret: '平均 regret',
  colVsOptimal: 'vs Optimal',
  introTitle: 'このタブ:',
  introList: [
    { name: 'Optimal', desc: 'チート — 常にベストアーム (regret の下限 = 0)', color: '#fbbf24' },
    { name: 'Thompson sampling', desc: 'ベイズ的サンプリング (実用上ベスト戦略)', color: '#4ade80' },
    { name: 'UCB1', desc: '信頼区間上界で楽観的に選ぶ', color: '#67e8f9' },
    { name: 'ε-greedy', desc: '確率 ε でランダム探索、それ以外は経験ベスト', color: '#a78bfa' },
    { name: 'Greedy', desc: '各1回引いた後、ずっと経験ベストを選ぶ (運次第で外れる)', color: '#f472b6' },
    { name: 'Random', desc: '毎回ランダム', color: '#94a3b8' },
  ],
  introFooter:
    '累積 regret（＝最適との差）の伸び方で「賢さ」が一目で分かる。Thompson と UCB1 は対数的に伸びるが、Random は線形に発散する。',

  strategyLabels: {
    optimal: 'Optimal (cheat)',
    thompson: 'Thompson sampling',
    ucb1: 'UCB1',
    'eps-greedy': 'ε-greedy',
    greedy: 'Greedy',
    random: 'Random',
  },
};

const en: BanditStrings = {
  title: '🎰 K-armed Bandit',
  subtitle: 'Each arm hides a payout probability. How do you balance explore vs exploit? The classic problem behind Thompson Sampling, UCB1 and ε-greedy.',
  tabPlay: 'Play',
  tabSim: 'Simulation',

  armCount: 'Arms K',
  pullLimit: 'Pull limit T',
  newGame: '🎲 New game',
  showProbs: '👀 Reveal true odds',
  hideProbs: '🙈 Hide odds',
  hint: 'Hint',
  hintOn: '💡 Hide hints',
  hintOff: '💡 Strategy hints',
  armLabel: (i) => `Arm ${i}`,
  pulledTimes: (n, wins) => `pulled ${n} / wins ${wins}`,
  empMean: 'observed p̂',
  trueValue: 'true',
  notPulledYet: '(no pulls yet)',
  suggestsPull: (s) => `${s} picks this`,

  progress: 'Progress',
  remainingPulls: 'pulls left',
  cumReward: 'total reward',
  optimalReward: 'optimal (theory)',
  cumRegret: 'cumulative regret',
  hitRate: 'hit rate',
  finished: 'Done!',
  finishedDetail: (reward, total, pct) => `total ${reward} / ${total} = ${pct}%`,
  trueProbsAre: 'True odds',
  bestArmExpected: (v) => `Always pulling the best arm expects ${v}`,
  yourRegret: (v) => `your gap (regret) = ${v}`,

  explainTitle: 'K-armed Bandit:',
  explainBody:
    'Each arm has a hidden win probability p_i; every turn you choose which to pull. Explore = gather info (find out which is best); exploit = pull the current best-looking one. Balancing the two is the whole game. The Simulation tab compares ε-greedy / UCB1 / Thompson Sampling.',

  trueProbsInput: 'True p (comma-separated, 2+)',
  steps: 'Steps T',
  trialsPerStrategy: 'Trials (per strategy)',
  epsilon: 'ε (for ε-greedy)',
  runComparison: 'Compare 6 strategies',
  running: (label, done, total) => `Running ${label}: ${done} / ${total}`,
  simCaption: 'Each strategy simulated independently on the same probs.',
  cumRewardChart: (T, trials) => `Cumulative reward (T=${T}, trials=${trials})`,
  cumRegretChart: 'Cumulative regret (= optimal − reward)',
  regretNote:
    'Thompson and UCB1 grow logarithmically (excellent). Random diverges linearly. Greedy can diverge linearly depending on luck.',
  finalScores: 'Final scores by strategy',
  colStrategy: 'Strategy',
  colReward: 'avg reward',
  colRegret: 'avg regret',
  colVsOptimal: 'vs Optimal',
  introTitle: 'This tab:',
  introList: [
    { name: 'Optimal', desc: 'cheats — always the best arm (regret lower bound = 0)', color: '#fbbf24' },
    { name: 'Thompson sampling', desc: 'Bayesian sampling (best in practice)', color: '#4ade80' },
    { name: 'UCB1', desc: 'optimistic upper-confidence-bound choice', color: '#67e8f9' },
    { name: 'ε-greedy', desc: 'explore randomly with prob ε, else empirical best', color: '#a78bfa' },
    { name: 'Greedy', desc: 'pull each once, then always the empirical best (can miss)', color: '#f472b6' },
    { name: 'Random', desc: 'uniformly random every turn', color: '#94a3b8' },
  ],
  introFooter:
    'The slope of cumulative regret (gap vs optimal) shows the "smartness" at a glance: Thompson and UCB1 grow logarithmically, Random diverges linearly.',

  strategyLabels: {
    optimal: 'Optimal (cheat)',
    thompson: 'Thompson sampling',
    ucb1: 'UCB1',
    'eps-greedy': 'ε-greedy',
    greedy: 'Greedy',
    random: 'Random',
  },
};

export const getBanditStrings = (lang: GameLanguage): BanditStrings => (lang === 'ja' ? ja : en);
