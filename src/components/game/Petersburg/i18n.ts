import type { GameLanguage } from '../constants/gameTranslations';

export interface PetersburgStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabSim: string;
  info: string;
  // Play tab
  entryPrice: string;
  perGame: string;
  flip1: string;
  play10: string;
  play100: string;
  play1000: string;
  reset: string;
  flipping: string;
  lastGame: string;
  flips: string;
  payout: string;
  recentPayouts: string;
  sessionStats: string;
  played: string;
  meanPayout: string;
  totalWon: string;
  paid: string;
  net: string;
  maxPayout: string;
  fairPriceLog: string;
  verdict: string;
  verdictProfit: string;
  verdictLoss: string;
  // Sim tab
  trials: string;
  runSim: string;
  running: string;
  simHint: string;
  simIntro: string;
  convergence: string;
  convergenceCaption: string;
  finalReadout: string;
  meanLabel: string;
  fairTheory: string;
  medianLabel: string;
  distribution: string;
  distributionCaption: string;
  longestStreak: string;
  legendMean: string;
  legendFair: string;
  legendMedian: string;
  legendMax: string;
  legendObserved: string;
  legendTheory: string;
  payoutAxis: string;
  nAxis: string;
  // Fair-price explorer
  explorer: string;
  wealth: string;
  logUtilityPrice: string;
  logUtilityHint: string;
  // Info modal
  howItWorksTitle: string;
  howItWorks: string[];
}

const en: PetersburgStrings = {
  title: 'St. Petersburg Paradox',
  subtitle:
    'Flip a coin until the first tails. The payout is 2^(k-1) where k is the flip that lands tails. The expected value is infinite — yet nobody pays infinity. Why not?',
  tabPlay: 'Play',
  tabSim: 'Simulate',
  info: 'How it works',
  entryPrice: 'Entry price (per game)',
  perGame: 'per game',
  flip1: 'Flip once',
  play10: 'Play 10',
  play100: 'Play 100',
  play1000: 'Play 1,000',
  reset: 'Reset',
  flipping: 'Flipping…',
  lastGame: 'Last game',
  flips: 'flips',
  payout: 'payout',
  recentPayouts: 'Recent payouts',
  sessionStats: 'Session stats',
  played: 'Games played',
  meanPayout: 'Mean payout',
  totalWon: 'Total won',
  paid: 'Total paid',
  net: 'Net',
  maxPayout: 'Best payout',
  fairPriceLog: '"Fair" price ≈ log₂(N)/2',
  verdict: 'Verdict',
  verdictProfit: 'up so far',
  verdictLoss: 'down so far',
  trials: 'Number of trials',
  runSim: 'Run simulation',
  running: 'Running',
  simHint: 'The empirical mean creeps up with N — the true face of "infinite EV".',
  simIntro:
    'Play N games and watch how the empirical (1) mean, (2) median, (3) best payout, and (4) "fair price" log₂(N)/2 evolve. The mean never settles: every rare jackpot yanks it upward, so it drifts up forever without converging.',
  convergence: 'Convergence behaviour',
  convergenceCaption:
    'Mean (cyan) tracks the fair price log₂(N)/2 (dashed). The median (green) stalls near $1–2, while the max (pink) climbs exponentially — the mathematical source of the "infinite" mean.',
  finalReadout: 'Final readout',
  meanLabel: 'Empirical mean',
  fairTheory: 'log₂(N)/2 (theory)',
  medianLabel: 'Median',
  distribution: 'Payout distribution (log₂ buckets)',
  distributionCaption:
    'Each bucket is half as frequent as the last — a clean geometric law. The yellow markers are the theoretical count N·(1/2)^(k+1). High buckets are rare, but one hit moves the mean a lot.',
  longestStreak: 'Longest head streak',
  legendMean: 'Empirical mean',
  legendFair: '"Fair price" log₂(N)/2',
  legendMedian: 'Empirical median',
  legendMax: 'Empirical max',
  legendObserved: 'Observed',
  legendTheory: 'Theory (½ⁿ × total)',
  payoutAxis: 'Payout (log₂ buckets)',
  nAxis: 'N (trials, log scale)',
  explorer: 'Willingness-to-pay (log utility)',
  wealth: 'Your wealth',
  logUtilityPrice: 'You should pay at most',
  logUtilityHint:
    "Bernoulli's fix: a player with wealth w and logarithmic utility pays c so that E[ln(w − c + payout)] = ln(w). The answer is finite and grows only slowly with wealth — resolving the paradox.",
  howItWorksTitle: 'The St. Petersburg Paradox',
  howItWorks: [
    'A fair coin is flipped until it lands tails. If the first tails is on flip k, you win 2^(k-1) dollars: T → $1, HT → $2, HHT → $4, HHHT → $8, …',
    'The probability of first tails on flip k is (1/2)^k, so each term of the expected value is (1/2)^k · 2^(k-1) = 1/2. Adding infinitely many halves gives an infinite expected value.',
    'Despite that, almost nobody will pay more than a few dollars to play. The median outcome is just $1–2, and with N plays the average payout only creeps up like log₂(N)/2.',
    'In the Simulate tab, watch the running mean drift upward forever without settling, the median stay flat, and the max jump exponentially — the whole "infinite EV" lives in that rare, huge tail.',
    'Bernoulli resolved it with logarithmic utility: value the winnings by ln(wealth), not by dollars. That makes a finite, sensible price — try the willingness-to-pay slider.',
  ],
};

const ja: PetersburgStrings = {
  title: 'セントペテルブルクのパラドックス',
  subtitle:
    'コインを初めて裏が出るまで投げる。裏が出た回を k とすると配当は 2^(k-1)。期待値は無限大なのに、誰も無限のお金は払わない。なぜか？',
  tabPlay: '遊ぶ',
  tabSim: 'シミュレーション',
  info: '仕組み',
  entryPrice: '参加料 (1ゲーム)',
  perGame: '/ゲーム',
  flip1: '1回投げる',
  play10: '10回',
  play100: '100回',
  play1000: '1,000回',
  reset: 'リセット',
  flipping: '投げています…',
  lastGame: '最後のゲーム',
  flips: '回',
  payout: '配当',
  recentPayouts: '最近の配当',
  sessionStats: 'セッション統計',
  played: 'プレイ数',
  meanPayout: '平均配当',
  totalWon: '累計配当',
  paid: '支払い合計',
  net: '差し引き',
  maxPayout: '最大配当',
  fairPriceLog: '「公正な」価格 ≈ log₂(N)/2',
  verdict: '収支',
  verdictProfit: 'プラス',
  verdictLoss: 'マイナス',
  trials: '試行数',
  runSim: 'シミュレーション実行',
  running: '実行中',
  simHint: '実測平均は N とともにゆっくり伸びる — 「無限期待値」の正体。',
  simIntro:
    'N ゲームをプレイし、実測の (1) 平均 (2) 中央値 (3) 最大配当 (4)「公正な価格」log₂(N)/2 の推移を見る。平均は決して落ち着かない — 稀な大当たりのたびに跳ね上がり、収束せず永遠に上昇し続ける。',
  convergence: '収束の振る舞い',
  convergenceCaption:
    '平均(水色)は公正価格 log₂(N)/2(破線)を追う。中央値(緑)は $1–2 付近で停滞し、最大(ピンク)は指数的に増加 — これが「無限の平均」の数学的源泉。',
  finalReadout: '最終地点の値',
  meanLabel: '実測平均',
  fairTheory: 'log₂(N)/2 (理論)',
  medianLabel: '中央値',
  distribution: '配当の分布 (log₂ バケット)',
  distributionCaption:
    '各バケットの頻度は前の半分 — 綺麗な幾何分布。黄色のマーカーは理論度数 N·(1/2)^(k+1)。高額バケットは稀だが、1回出るだけで平均が大きく動く。',
  longestStreak: '最長の表連続',
  legendMean: '実測 平均',
  legendFair: '「公正な価格」log₂(N)/2',
  legendMedian: '実測 中央値',
  legendMax: '実測 最大',
  legendObserved: '実測度数',
  legendTheory: '理論 (½ⁿ × total)',
  payoutAxis: '配当 (log₂ バケット)',
  nAxis: 'N (試行回数, log scale)',
  explorer: '支払意思額 (対数効用)',
  wealth: 'あなたの資産',
  logUtilityPrice: '払ってよい上限は',
  logUtilityHint:
    'ベルヌーイの解決策: 資産 w と対数効用を持つ人は E[ln(w − c + 配当)] = ln(w) となる c を払う。答えは有限で、資産が増えてもゆっくりしか増えない — これがパラドックスの解消。',
  howItWorksTitle: 'セントペテルブルクのパラドックス',
  howItWorks: [
    'コインを初めて裏が出るまで投げる。裏が出た回を k とすると 2^(k-1) ドルもらえる: T → $1、HT → $2、HHT → $4、HHHT → $8、…',
    'k 回目で初めて裏が出る確率は (1/2)^k。よって期待値の各項は (1/2)^k · 2^(k-1) = 1/2。1/2 を無限に足すので期待値は無限大になる。',
    'それでも大半の人は数ドル以上払わない。結果の中央値はわずか $1–2 で、N 回プレイしても平均配当は log₂(N)/2 程度でしか伸びない。',
    'シミュレーションタブでは、実測平均が収束せず永遠に上昇し、中央値は平ら、最大は指数的に跳ねる様子が見える — 「無限の期待値」はこの稀で巨大な裾に宿っている。',
    'ベルヌーイは対数効用で解決した: 賞金をドルではなく ln(資産) で評価する。すると有限で妥当な価格が出る — 支払意思額スライダーで試してみよう。',
  ],
};

export function getPetersburgStrings(language: GameLanguage): PetersburgStrings {
  return language === 'ja' ? ja : en;
}
