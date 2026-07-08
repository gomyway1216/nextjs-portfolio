import type { GameLanguage } from '../constants/gameTranslations';

/** Local, self-contained strings for Gambler's Ruin (ja/en). */
const STRINGS = {
  title: { ja: 'ギャンブラーの破産', en: "Gambler's Ruin" },
  subtitle: {
    ja: '公平 (p=0.5) でも有限資金なら破産確率は (N − a) / N。少しでも p < 0.5 なら破産はほぼ確実 — それを実験で確かめる。',
    en: 'Even a fair game (p=0.5) ruins you with probability (N − a) / N on finite capital. Any p < 0.5 makes ruin nearly certain — verify it by experiment.',
  },
  tabPlay: { ja: '遊ぶ', en: 'Play' },
  tabSim: { ja: 'シミュレーション', en: 'Simulate' },

  // controls
  start: { ja: '開始資金 a', en: 'Start a' },
  target: { ja: '目標 N', en: 'Target N' },
  winProb: { ja: '勝率 p', en: 'Win prob p' },
  maxSteps: { ja: '最大ステップ', en: 'Max steps' },
  trials: { ja: '試行回数', en: 'Trials' },
  reset: { ja: 'リセット', en: 'Reset' },
  restoreDefaults: { ja: 'デフォルトに戻す', en: 'Restore defaults' },

  // play buttons
  step1: { ja: '1 ステップ', en: 'Step once' },
  auto: { ja: 'オート', en: 'Auto' },
  stop: { ja: '停止', en: 'Stop' },

  // play stats
  bankroll: { ja: '現在の資金', en: 'Bankroll' },
  stepsLabel: { ja: 'ステップ数', en: 'Steps' },
  theoryHeading: { ja: '理論値 & このセッション', en: 'Theory & this session' },
  theoRuin: { ja: '理論 破産確率', en: 'Theoretical ruin' },
  theoReach: { ja: '理論 達成確率', en: 'Theoretical reach' },
  expDuration: { ja: '理論 期待ステップ', en: 'Expected steps' },
  sessionRuined: { ja: 'セッション破産', en: 'Session ruins' },
  sessionReached: { ja: 'セッション達成', en: 'Session reaches' },
  bankrollTrend: { ja: '資金の推移', en: 'Bankroll path' },
  ruinedMsg: { ja: '破産 — {steps} ステップで $0', en: 'Ruined — hit $0 in {steps} steps' },
  reachedMsg: { ja: '目標達成 — {steps} ステップで ${target}', en: 'Reached ${target} in {steps} steps' },

  // sim
  run: { ja: 'シミュレーション実行', en: 'Run simulation' },
  running: { ja: '実行中', en: 'Running' },
  empRuin: { ja: '実測 破産率', en: 'Empirical ruin' },
  theoRuinShort: { ja: '理論 破産率', en: 'Theoretical ruin' },
  diff: { ja: '差', en: 'Difference' },
  meanSteps: { ja: '平均ステップ', en: 'Mean steps' },
  medianSteps: { ja: '中央値ステップ', en: 'Median steps' },
  theoMeanSteps: { ja: '理論 期待ステップ', en: 'Expected steps' },
  undecided: { ja: '未決着 (上限到達)', en: 'Undecided (hit cap)' },
  outcomeBreakdown: { ja: '結果の内訳（実測 vs 理論）', en: 'Outcome breakdown (empirical vs theory)' },
  outcomeCaption: {
    ja: '黄色の縦線 = 理論破産確率の境界。実測の赤領域とぴったり重なるはず。',
    en: 'Yellow line = theoretical ruin boundary. The red empirical region should land right on it.',
  },
  convergenceHeading: { ja: '破産率の収束', en: 'Ruin estimate converging' },
  convergenceCaption: {
    ja: '試行を重ねるほど実測（青）が理論値（黄破線）に近づく — 大数の法則。',
    en: 'As trials accumulate, the empirical estimate (blue) settles onto theory (yellow dashed) — the law of large numbers.',
  },
  durationHeading: { ja: '決着までのステップ分布', en: 'Distribution of steps to absorption' },
  durationCaption: {
    ja: '破産・達成にかかったステップ数のヒストグラム。緑破線 = 理論期待値。',
    en: 'Histogram of steps until ruin or target. Green dashed = theoretical mean.',
  },
  samplePaths: { ja: 'サンプル経路', en: 'Sample paths' },
  samplePathsCaption: {
    ja: '緑 = 目標達成、赤 = 破産、灰 = ステップ上限。破産経路が多ければ p ≤ 0.5 の宿命。',
    en: 'Green = reached target, red = ruined, grey = hit step cap. Mostly red means the p ≤ 0.5 destiny.',
  },
  introBody: {
    ja: '$a で始めて $N に達するか $0 で破産するまで賭ける。公平 (p=0.5) なら破産確率は (N − a) / N。不公平になると指数関数的に破産しやすくなる。現在の設定の理論破産確率を、モンテカルロで確かめる。',
    en: 'Start with $a, bet until you reach $N or go broke at $0. Fair game (p=0.5): ruin probability is (N − a) / N. Bias it and ruin grows exponentially. Verify the theoretical ruin for the current settings with Monte Carlo.',
  },
  currentTheoRuin: { ja: '理論破産確率', en: 'theoretical ruin' },

  // legend / outcomes
  legendRuin: { ja: '破産', en: 'Ruin' },
  legendReach: { ja: '目標達成', en: 'Reached' },
  legendCap: { ja: '未決着 (上限)', en: 'Undecided (cap)' },

  // info
  info: { ja: '解説', en: 'About' },
  infoTitle: { ja: 'ギャンブラーの破産とは', en: "About Gambler's Ruin" },
  infoBody: {
    ja: 'あなたは資金 $a から始め、毎回 1 単位を確率 p で勝ち、確率 1−p で負けるゲームを繰り返します。$N に達すれば勝ち、$0 になれば破産です。\n\n・公平 (p=0.5): 破産確率は (N − a) / N。時間が無限にあっても、有限資金なら目標到達は保証されません。\n・不利 (p<0.5): 破産確率は 1 に急接近します。\n・期待ステップ数: p=0.5 なら a(N−a)、それ以外は閉じた式で与えられます。\n\n「遊ぶ」で 1 本の経路を体感し、「シミュレーション」で何千回も試して実測と理論が一致することを確かめましょう。',
    en: 'You start with $a and repeatedly bet 1 unit, winning with probability p and losing with probability 1−p. Reach $N to win; hit $0 and you are ruined.\n\n• Fair (p=0.5): ruin probability is (N − a) / N. Even with unlimited time, finite capital does not guarantee reaching the target.\n• Unfavorable (p<0.5): ruin probability rushes toward 1.\n• Expected steps: a(N−a) when p=0.5, otherwise a closed form.\n\nUse "Play" to feel a single path, and "Simulate" to run thousands of trials and confirm empirical results match the theory.',
  },
  close: { ja: '閉じる', en: 'Close' },
} as const;

export type StringKey = keyof typeof STRINGS;

export function makeT(language: GameLanguage) {
  return (key: StringKey, vars?: Record<string, string | number>): string => {
    let s: string = STRINGS[key][language];
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(`{${k}}`, String(v));
      }
    }
    return s;
  };
}

export type TFn = ReturnType<typeof makeT>;
