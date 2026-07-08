import type { GameLanguage } from '../constants/gameTranslations';

/**
 * Local (component-scoped) i18n for the Secretary Problem game.
 * Keeps NEW strings out of the shared gameTranslations.ts per the revamp spec.
 */
export interface SecretaryStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabSim: string;
  howToPlay: string;

  // Play tab
  candidatesLabel: string;
  suggestedSkip: string;
  start: string;
  hire: string;
  pass: string;
  nextRound: string;
  reset: string;
  currentCandidate: string;
  bestSoFar: string;
  observePhaseBest: string;
  observePhaseHint: string;
  phaseObserve: string;
  phaseDecide: string;
  candidateStrip: string;
  legendObserve: string;
  legendHidden: string;
  ofN: (i: number, n: number) => string;
  personSuffix: string;
  resultsHeading: string;
  win: string;
  lose: string;
  youHired: (score: number) => string;
  forcedLast: string;
  actualBest: (score: number) => string;
  plays: string;
  winRate: string;
  wins: string;
  theoryMax: string;
  resetStats: string;
  showHint: string;
  idlePrompt: string;
  recommendHire: string;
  recommendPass: string;

  // Sim tab
  simIntroTitle: string;
  simIntroBody: string;
  simIntroHighlight: string;
  numCandidates: string;
  trialsPerR: string;
  runSim: string;
  running: (done: number, total: number) => string;
  successVsSkip: (n: number, trials: number) => string;
  empiricalBest: string;
  theoreticalBest: string;
  convergesTo: string;
  keyRatios: string;
  ratiosNote: string;
  theoryShort: string;
  empiricalShort: string;
  legendTheory: string;
  legendSim: string;
  chartXAxis: string;
  chartYAxis: string;

  // Info modal
  infoTitle: string;
  infoRulesTitle: string;
  infoRules: string;
  infoStrategyTitle: string;
  infoStrategy: string;
  infoWhyTitle: string;
  infoWhy: string;
}

const en: SecretaryStrings = {
  title: 'Secretary Problem',
  subtitle:
    'Interview candidates one at a time and decide on the spot. Pass and you can never go back. Can you hire the single best one? The optimal move: skip the first ~37%, then hire the first who beats everyone seen so far — winning about 37% of the time.',
  tabPlay: 'Play',
  tabSim: 'Simulation',
  howToPlay: 'How to play',

  candidatesLabel: 'Candidates n',
  suggestedSkip: 'Suggested skip',
  start: 'Start interviewing',
  hire: 'Hire',
  pass: 'Pass',
  nextRound: 'Next round',
  reset: 'Reset',
  currentCandidate: 'Current candidate',
  bestSoFar: 'best so far',
  observePhaseBest: 'Best score in the observation phase',
  observePhaseHint: 'Hire the first candidate who beats this',
  phaseObserve: 'Observation phase',
  phaseDecide: 'Decision phase',
  candidateStrip: 'Candidates seen',
  legendObserve: 'Yellow bar = observation phase (n/e people).',
  legendHidden: '? = not yet revealed.',
  ofN: (i, n) => `${i} / ${n}`,
  personSuffix: '',
  resultsHeading: 'Result & your record',
  win: 'Nailed it!',
  lose: 'Missed',
  youHired: (s) => `You hired score ${s}`,
  forcedLast: ' (nobody beat the observed best, so the last candidate was forced)',
  actualBest: (s) => `Actual best score: ${s}`,
  plays: 'Plays',
  winRate: 'Win rate',
  wins: 'Wins',
  theoryMax: 'Theory max (n→∞)',
  resetStats: 'Reset record',
  showHint: 'Show optimal-strategy hint',
  idlePrompt: 'Press Start to interview candidates.',
  recommendHire: 'Optimal strategy suggests hiring',
  recommendPass: 'Optimal strategy suggests passing',

  simIntroTitle: 'This tab',
  simIntroBody:
    'For each r (number of candidates skipped) it runs the "skip the first r, then hire the first who beats the observed best" strategy many times and plots the probability of catching the single best candidate as a function of r.',
  simIntroHighlight:
    'The signature single-humped curve peaks at r = n/e (≈ 37%). The theory line (amber) and the simulation (cyan) sit right on top of each other.',
  numCandidates: 'Candidates n',
  trialsPerR: 'Trials per r',
  runSim: 'Run simulation',
  running: (done, total) => `Running… ${done.toLocaleString()} / ${total.toLocaleString()}`,
  successVsSkip: (n, trials) => `Success rate vs skip count (n = ${n}, ${trials.toLocaleString()} trials/r)`,
  empiricalBest: 'Empirical best',
  theoreticalBest: 'Theoretical best',
  convergesTo: 'converges to 1/e ≈ 36.79% as n → ∞.',
  keyRatios: 'Snapshot at key skip ratios',
  ratiosNote:
    'r=0 (hire the first) is 1/n. r=n−1 (forced last) is also 1/n. The hump in between is the essence of the secretary problem.',
  theoryShort: 'theory',
  empiricalShort: 'sim',
  legendTheory: 'Theory',
  legendSim: 'Simulation',
  chartXAxis: 'Candidates skipped (r)',
  chartYAxis: 'Success rate',

  infoTitle: 'Secretary Problem',
  infoRulesTitle: 'The rules',
  infoRules:
    'Candidates arrive in random order. You interview each one and must immediately hire or pass. A passed candidate is gone forever. Your goal is to hire the single best candidate — not "good enough", the very best.',
  infoStrategyTitle: 'The 37% rule',
  infoStrategy:
    'Reject the first n/e ≈ 37% of candidates no matter what — this is your observation phase. After that, hire the first candidate who is better than everyone you have seen. This wins roughly 36.8% of the time.',
  infoWhyTitle: 'Why 37%?',
  infoWhy:
    'Skip too few and you commit before you have a good yardstick; skip too many and the best candidate has probably already walked out. The sweet spot balances these, and as n grows it converges exactly to 1/e for both the cutoff fraction and the win probability.',
};

const ja: SecretaryStrings = {
  title: '秘書問題',
  subtitle:
    '候補者を1人ずつ面接し、その場で即決。見送ったら二度と戻れない。最高の1人を当てられる？ 最適手は「最初の約37%をスキップし、その後で観測期の最高を超えた最初の人を採用」。的中率も約37%。',
  tabPlay: '遊ぶ',
  tabSim: 'シミュレーション',
  howToPlay: '遊び方',

  candidatesLabel: '候補者数 n',
  suggestedSkip: '推奨スキップ',
  start: '面接開始',
  hire: '採用',
  pass: '見送り',
  nextRound: '次のラウンド',
  reset: 'リセット',
  currentCandidate: '現在の候補者',
  bestSoFar: 'これまでで最高',
  observePhaseBest: '観測期の最高スコア',
  observePhaseHint: 'これを超えた最初の候補を採用が基本',
  phaseObserve: '観測期',
  phaseDecide: '決定期',
  candidateStrip: 'これまでの候補者',
  legendObserve: '黄ライン = 観測期 (n/e 人)。',
  legendHidden: '? = 未公開。',
  ofN: (i, n) => `${i} / ${n} 人目`,
  personSuffix: '人',
  resultsHeading: '結果 & あなたの戦績',
  win: '大正解！',
  lose: 'ハズレ',
  youHired: (s) => `あなたが採用したのはスコア ${s}`,
  forcedLast: ' (最後まで誰も超えず、最終候補を強制採用)',
  actualBest: (s) => `実際の最高スコア: ${s}`,
  plays: 'プレイ回数',
  winRate: '正解率',
  wins: '正解数',
  theoryMax: '理論最大 (n→∞)',
  resetStats: '戦績リセット',
  showHint: '最適戦略のヒントを表示',
  idlePrompt: '「面接開始」で候補者を面接します。',
  recommendHire: '最適戦略は採用を推奨',
  recommendPass: '最適戦略は見送りを推奨',

  simIntroTitle: 'このタブ',
  simIntroBody:
    '各 r (スキップする人数) について「最初の r 人は無条件で見送り、その後に観測期の最高を超えた最初の人を採用」戦略を試行し、最高スコア人を引き当てる確率を r の関数として描きます。',
  simIntroHighlight:
    '特徴的な単峰カーブの頂点が r = n/e (≈ 37%) に出てくるのが見どころ。理論線 (黄) とシミュレーション (水色) がぴったり重なります。',
  numCandidates: '候補者数 n',
  trialsPerR: 'r ごとの試行回数',
  runSim: 'シミュレーション実行',
  running: (done, total) => `実行中… ${done.toLocaleString()} / ${total.toLocaleString()}`,
  successVsSkip: (n, trials) => `成功率 vs スキップ数 (n = ${n}, ${trials.toLocaleString()} 試行/r)`,
  empiricalBest: '実測ベスト',
  theoreticalBest: '理論ベスト',
  convergesTo: 'n → ∞ で 1/e ≈ 36.79% に収束。',
  keyRatios: '主要な r 比率のスナップショット',
  ratiosNote:
    'r=0 (最初を採用) は 1/n。r=n−1 (最後を強制) も 1/n。中間に山ができるのが秘書問題の本質。',
  theoryShort: '理論',
  empiricalShort: '実測',
  legendTheory: '理論値',
  legendSim: 'シミュレーション',
  chartXAxis: 'スキップした人数 (r)',
  chartYAxis: '成功率',

  infoTitle: '秘書問題',
  infoRulesTitle: 'ルール',
  infoRules:
    '候補者はランダムな順で現れます。1人ずつ面接し、その場で採用か見送りを即決。見送った候補には二度と戻れません。目標は「そこそこ良い人」ではなく、最高の1人を当てること。',
  infoStrategyTitle: '37% ルール',
  infoStrategy:
    '最初の n/e ≈ 37% は無条件で見送り「観測期」とします。以後、それまで見た全員より良い最初の候補を採用。これで約 36.8% の確率で正解できます。',
  infoWhyTitle: 'なぜ 37%？',
  infoWhy:
    'スキップが少なすぎると良い物差しを持つ前に決めてしまう。多すぎると最高の候補が既に去っている確率が高い。この2つの釣り合う点が最適で、n が大きくなるとスキップ割合も勝率もぴったり 1/e に収束します。',
};

export const getStrings = (language: GameLanguage): SecretaryStrings =>
  language === 'ja' ? ja : en;
