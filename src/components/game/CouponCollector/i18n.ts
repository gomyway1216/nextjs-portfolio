import type { GameLanguage } from '../constants/gameTranslations';

/**
 * Local, self-contained bilingual strings for the Coupon Collector game.
 * Kept out of the shared gameTranslations.ts on purpose (per revamp scope).
 */
export interface CouponStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabSim: string;
  howToPlay: string;
  toggleLanguage: string;
  // Play tab
  sizeLabel: string;
  drawOne: string;
  completeNow: string;
  reset: string;
  statusHeading: string;
  collected: string;
  totalDraws: string;
  expected: string;
  youVsExpected: string;
  luckyFast: string;
  unlucky: string;
  onTrack: string;
  completeBanner: (n: number, draws: number, ratio: string) => string;
  curveTitle: string;
  curveNote: string;
  uniqueAxis: (n: number) => string;
  drawsAxisStart: string;
  drawsAxisEnd: (draws: string) => string;
  gridHint: string;
  // Sim tab
  simSizeLabel: string;
  trialsLabel: string;
  runSim: string;
  running: (done: string, total: string) => string;
  introTitle: string;
  introBody: string;
  resultHeading: (n: number, trials: string) => string;
  meanDraws: string;
  median: string;
  minMax: string;
  theoreticalMean: string;
  theoreticalStd: string;
  empiricalStd: string;
  meanRatio: string;
  p90: string;
  p99: string;
  skewNote: string;
  distTitle: string;
  distAxis: (bin: string) => string;
  meanLabel: (v: string) => string;
  medianLabel: (v: string) => string;
  theoryLabel: (v: string) => string;
  convergenceTitle: string;
  convergenceNote: string;
  trialsAxis: string;
  // Info modal
  infoTitle: string;
  infoIntro: string;
  infoFormula: string;
  infoFormulaBody: string;
  infoTail: string;
  infoTailBody: string;
}

const en: CouponStrings = {
  title: 'Coupon Collector',
  subtitle:
    'How many random draws to collect all n distinct coupons? Draw by hand, then run thousands of simulations and watch the empirical mean lock onto the theory E[T] = n·Hₙ.',
  tabPlay: 'Play',
  tabSim: 'Simulate',
  howToPlay: 'How it works',
  toggleLanguage: 'Switch to Japanese',
  sizeLabel: 'Collection size (n)',
  drawOne: 'Draw one',
  completeNow: 'Finish instantly',
  reset: 'Reset',
  statusHeading: 'Status',
  collected: 'Collected / n',
  totalDraws: 'Total draws',
  expected: 'Expected E[T]',
  youVsExpected: 'You vs expected',
  luckyFast: 'Lucky — ahead of the curve',
  unlucky: 'Unlucky — the last few are hiding',
  onTrack: 'Right around the expected pace',
  completeBanner: (n, draws, ratio) =>
    `🎉 All ${n} collected in ${draws} draws (${ratio}× the expected value).`,
  curveTitle: 'Collection curve (diminishing returns)',
  curveNote:
    'The curve shoots up early, then flattens: collecting the last one or two coupons eats an enormous number of draws — the "gacha completion" problem made visible.',
  uniqueAxis: (n) => `Distinct collected (max n = ${n})`,
  drawsAxisStart: '0 draws',
  drawsAxisEnd: (draws) => `${draws} draws`,
  gridHint: 'Each cell is a coupon; the number below is how many copies you have drawn.',
  simSizeLabel: 'Collection size n',
  trialsLabel: 'Trials',
  runSim: 'Run simulation',
  running: (done, total) => `Running… ${done} / ${total}`,
  introTitle: 'The coupon collector problem',
  introBody:
    'Each draw is uniform over n coupons. The expected number of draws to collect every one is E[T] = n·Hₙ ≈ n·(ln n + γ). n = 50 needs ≈ 225 draws, n = 100 ≈ 519 — a small bump in n blows up the wait. Run the simulation to see the long right tail (that "just one left" agony) and watch the empirical mean converge to the theory.',
  resultHeading: (n, trials) => `Results (n = ${n}, ${trials} trials)`,
  meanDraws: 'Empirical mean',
  median: 'Median',
  minMax: 'Min / Max',
  theoreticalMean: 'Theoretical E[T]',
  theoreticalStd: 'Theoretical σ',
  empiricalStd: 'Empirical σ',
  meanRatio: 'Empirical / theory',
  p90: '90th percentile',
  p99: '99th percentile',
  skewNote:
    'The mean sits well above the median — proof the distribution has a long right tail (some unlucky runs wait ages for the final coupon).',
  distTitle: 'Distribution of draws to completion',
  distAxis: (bin) => `Draws to completion (bin ≈ ${bin})`,
  meanLabel: (v) => `mean ${v}`,
  medianLabel: (v) => `median ${v}`,
  theoryLabel: (v) => `theory ${v}`,
  convergenceTitle: 'Empirical mean → theoretical n·Hₙ',
  convergenceNote:
    'Early on the running average swings wildly, but as trials accumulate it settles onto the dashed theoretical line. This is the law of large numbers doing its job.',
  trialsAxis: 'Trials (log scale)',
  infoTitle: 'How the coupon collector works',
  infoIntro:
    'You are collecting n distinct coupons (think gacha or trading cards). Every draw gives a uniformly random coupon — duplicates are common and expected. The question: how many draws until you own at least one of each?',
  infoFormula: 'The expected number of draws',
  infoFormulaBody:
    'When you already hold k distinct coupons, the chance a draw is new is (n−k)/n, so the expected wait for the next new one is n/(n−k). Summing over k = 0…n−1 gives E[T] = n·(1/1 + 1/2 + … + 1/n) = n·Hₙ, the n-th harmonic number. That grows like n·ln n, much faster than n itself.',
  infoTail: 'Why the last coupon hurts',
  infoTailBody:
    'Collecting the final coupon alone takes an expected n draws — as long as the entire early game combined. That is why completion times have a long right tail and the mean sits far above the median. The variance is Σ (n/i)² − (n/i), whose standard deviation is roughly 0.64·n.',
};

const ja: CouponStrings = {
  title: 'クーポンコレクター',
  subtitle:
    '全 n 種のクーポンを集めるには何回引けばいい？ 手で引いてから何千回もシミュレーションし、実測平均が理論値 E[T] = n·Hₙ に吸い付く様子を確認する。',
  tabPlay: '遊ぶ',
  tabSim: 'シミュレーション',
  howToPlay: '仕組み',
  toggleLanguage: '英語に切り替え',
  sizeLabel: 'コレクションのサイズ (n)',
  drawOne: '1回引く',
  completeNow: '一気に完成',
  reset: 'リセット',
  statusHeading: '状況',
  collected: '集めた / n',
  totalDraws: '総 draws',
  expected: '理論期待値 E[T]',
  youVsExpected: 'あなた vs 期待値',
  luckyFast: 'ラッキー — 期待値より速い',
  unlucky: 'アンラッキー — 最後の数種が出ない',
  onTrack: 'ほぼ期待値どおりのペース',
  completeBanner: (n, draws, ratio) =>
    `🎉 全 ${n} 種コンプ！ ${draws} draws（期待値の ${ratio}×）`,
  curveTitle: '収集カーブ（diminishing returns）',
  curveNote:
    '序盤は急上昇するが、やがて平坦化する。ラスト 1〜2 種を引くのに大量の draws がかかる「コンプガチャ問題」がカーブの平坦化で見える。',
  uniqueAxis: (n) => `ユニーク数（上限 n = ${n}）`,
  drawsAxisStart: '0 draws',
  drawsAxisEnd: (draws) => `${draws} draws`,
  gridHint: '各マスがクーポン。下の数字はそのクーポンを引いた枚数です。',
  simSizeLabel: 'コレクションのサイズ n',
  trialsLabel: '試行回数',
  runSim: 'シミュレーション実行',
  running: (done, total) => `実行中… ${done} / ${total}`,
  introTitle: 'クーポンコレクター問題',
  introBody:
    '各 draw は n 種のクーポンから一様ランダム。全種そろえるまでの期待 draw 数は E[T] = n·Hₙ ≈ n·(ln n + γ)。n=50 で約 225 draws、n=100 で約 519 — n を少し増やすだけで待ち時間が急増します。シミュレーションを実行すると、右に長く伸びる尻尾（「あと1個」の苦しみ）と、実測平均が理論値へ収束する様子が見えます。',
  resultHeading: (n, trials) => `結果（n = ${n}, ${trials} 試行）`,
  meanDraws: '実測平均',
  median: '中央値',
  minMax: '最小 / 最大',
  theoreticalMean: '理論平均 E[T]',
  theoreticalStd: '理論標準偏差 σ',
  empiricalStd: '実測標準偏差 σ',
  meanRatio: '実測 / 理論',
  p90: '90 パーセンタイル',
  p99: '99 パーセンタイル',
  skewNote:
    '平均が中央値よりかなり大きい — 分布が右に長い尻尾を持つ証拠（運悪く最後の1個が出ない人がいる）。',
  distTitle: '完成までの draws の分布',
  distAxis: (bin) => `完成までの draws（bin ≈ ${bin}）`,
  meanLabel: (v) => `平均 ${v}`,
  medianLabel: (v) => `中央値 ${v}`,
  theoryLabel: (v) => `理論 ${v}`,
  convergenceTitle: '実測平均 → 理論値 n·Hₙ',
  convergenceNote:
    '序盤は移動平均が大きく揺れますが、試行が増えるにつれて破線（理論値）に収束します。これが大数の法則です。',
  trialsAxis: '試行回数（対数スケール）',
  infoTitle: 'クーポンコレクターの仕組み',
  infoIntro:
    'n 種類のクーポン（ガチャやトレカを想像してください）を集めます。各 draw では一様ランダムに1枚もらえ、ダブりは当然発生します。問題は「全種を最低1枚ずつ揃えるまで何回引くか」です。',
  infoFormula: '期待 draw 数',
  infoFormulaBody:
    'すでに k 種持っているとき、次の draw が新種である確率は (n−k)/n。よって次の新種までの期待回数は n/(n−k)。k = 0…n−1 で合計すると E[T] = n·(1/1 + 1/2 + … + 1/n) = n·Hₙ（n 番目の調和数）。これは n·ln n のように増え、n 自身よりずっと速く伸びます。',
  infoTail: 'なぜ最後の1枚が苦しいのか',
  infoTailBody:
    '最後の1種を引くだけで期待 n 回 — 序盤全体と同じくらいかかります。だから完成時間は右に長い尻尾を持ち、平均が中央値よりずっと大きくなります。分散は Σ (n/i)² − (n/i) で、標準偏差はおよそ 0.64·n です。',
};

export function getStrings(language: GameLanguage): CouponStrings {
  return language === 'ja' ? ja : en;
}
