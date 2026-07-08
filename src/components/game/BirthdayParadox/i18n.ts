import type { GameLanguage } from '../constants/gameTranslations';

/**
 * Local, self-contained bilingual strings for the Birthday Paradox game.
 * Kept in the component dir (per revamp spec) rather than the shared
 * gameTranslations.ts so parallel game work cannot conflict.
 */
export interface BirthdayStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabSim: string;
  howToPlay: string;
  // Play tab
  groupSize: string;
  generate: string;
  autoDeal: string;
  stopAuto: string;
  reset: string;
  matchFound: (day: string, a: number, b: number) => string;
  noMatch: string;
  person: string;
  yourEmpirical: string;
  theoretical: string;
  trialsLabel: (matches: number, trials: number) => string;
  playHintTitle: string;
  playHint: string;
  dealing: string;
  // Sim tab
  maxGroup: string;
  trialsPerN: string;
  runSim: string;
  running: (done: number, total: number) => string;
  simIntroTitle: string;
  simIntro: string;
  chartTitle: (trials: string) => string;
  crossing: (fifty: string, ninetyNine: string) => string;
  snapshotTitle: string;
  simEmpirical: string;
  legendTheoretical: string;
  legendSimulation: string;
  axisN: string;
  convergence: string;
  // Info modal body
  infoTitle: string;
  infoP1: string;
  infoP2: string;
  infoFormula: string;
  infoP3: string;
}

const en: BirthdayStrings = {
  title: 'Birthday Paradox',
  subtitle:
    'A classic counterintuitive result: in a surprisingly small group, two people probably share a birthday. Feel it by dealing random birthdays, then watch simulation converge on the exact theory.',
  tabPlay: 'Play',
  tabSim: 'Simulate',
  howToPlay: 'How it works',
  groupSize: 'Group size',
  generate: 'Deal birthdays',
  autoDeal: 'Auto-deal',
  stopAuto: 'Stop',
  reset: 'Reset stats',
  matchFound: (day, a, b) => `Match! ${day} — person #${a} & #${b}`,
  noMatch: 'No shared birthday',
  person: 'Person',
  yourEmpirical: 'Your empirical',
  theoretical: 'Theoretical',
  trialsLabel: (matches, trials) => `${matches} / ${trials} deals`,
  playHintTitle: 'The paradox',
  playHint:
    'With just 23 people the chance of a shared birthday passes 50%. Move the slider and keep dealing — your empirical rate should track the theoretical value.',
  dealing: 'Dealing…',
  maxGroup: 'Max group size n',
  trialsPerN: 'Trials per n',
  runSim: 'Run simulation',
  running: (done, total) => `Running… n = ${done} / ${total}`,
  simIntroTitle: 'This tab',
  simIntro:
    'For each group size n we simulate many groups and estimate P(at least two share a birthday). The simulation (cyan) should sit right on top of the exact theory (amber). The curve rises steeply: ~50% at n=23, ~97% at n=50, >99.9% at n=70.',
  chartTitle: (trials) => `P(shared birthday) vs group size (${trials} trials per n)`,
  crossing: (fifty, ninetyNine) =>
    `First crosses 50% at n = ${fifty}, and 99% at n = ${ninetyNine}.`,
  snapshotTitle: 'Key group sizes',
  simEmpirical: 'sim',
  legendTheoretical: 'Theoretical',
  legendSimulation: 'Simulation',
  axisN: 'Group size n',
  convergence: 'Mean abs. error (sim vs theory)',
  infoTitle: 'The Birthday Paradox',
  infoP1:
    'How many people do you need in a room before it is more likely than not that two of them share a birthday? Intuition says a lot — there are 365 days, so surely you would need around 180. The answer is just 23.',
  infoP2:
    'The trick is that we compare every pair, not every person to a fixed date. A group of n people has n(n−1)/2 pairs, which grows fast. It is easier to compute the probability that everyone is different and subtract from 1:',
  infoFormula: 'P(match) = 1 − 365! / ( 365ⁿ · (365 − n)! )',
  infoP3:
    'Computed as a stable product ∏(365−i)/365 for i = 0…n−1. The Simulate tab confirms it empirically: draw random birthdays thousands of times and the collision rate lands right on the curve.',
};

const ja: BirthdayStrings = {
  title: '誕生日のパラドックス',
  subtitle:
    '直感に反する確率の代表例。意外なほど少人数で、誰かの誕生日が被る確率は高くなる。ランダムな誕生日を配って体感し、シミュレーションが厳密な理論値に重なる様子を見よう。',
  tabPlay: '遊ぶ',
  tabSim: 'シミュレーション',
  howToPlay: '仕組み',
  groupSize: 'グループ人数',
  generate: '誕生日を配る',
  autoDeal: '自動配布',
  stopAuto: '停止',
  reset: '戦績リセット',
  matchFound: (day, a, b) => `一致！ ${day} — 人 #${a} と #${b}`,
  noMatch: '一致なし',
  person: '人',
  yourEmpirical: 'あなたの実測',
  theoretical: '理論値',
  trialsLabel: (matches, trials) => `${matches} / ${trials} 回`,
  playHintTitle: 'パラドックス',
  playHint:
    'わずか 23 人で誕生日が被る確率は 50% を超える。スライダーを動かして配り続ければ、実測値が理論値に近づくのが分かる。',
  dealing: '配布中…',
  maxGroup: '最大グループ人数 n',
  trialsPerN: 'n ごとの試行回数',
  runSim: 'シミュレーション実行',
  running: (done, total) => `実行中… n = ${done} / ${total}`,
  simIntroTitle: 'このタブ',
  simIntro:
    '各人数 n について多数のグループをシミュレートし、「2 人以上が誕生日を共有する」確率を推定する。シミュレーション（水色）が厳密な理論値（黄）にぴったり重なるはず。曲線は急上昇し、n=23 で約 50%、n=50 で約 97%、n=70 で 99.9% 超。',
  chartTitle: (trials) => `P(誕生日が被る) vs グループ人数（${trials} 試行/n）`,
  crossing: (fifty, ninetyNine) =>
    `理論上、初めて 50% を超える n = ${fifty}、99% を超える n = ${ninetyNine}。`,
  snapshotTitle: '主要な n のスナップショット',
  simEmpirical: '実測',
  legendTheoretical: '理論値',
  legendSimulation: 'シミュレーション',
  axisN: 'グループ人数 n',
  convergence: '平均絶対誤差（実測 vs 理論）',
  infoTitle: '誕生日のパラドックス',
  infoP1:
    '部屋に何人いれば、そのうち 2 人の誕生日が被る確率が 50% を超えるだろうか？ 直感では「365 日もあるから 180 人くらい必要」と感じる。実際の答えはたった 23 人。',
  infoP2:
    'ポイントは、特定の日付ではなく全ての「ペア」を比べること。n 人のグループには n(n−1)/2 通りのペアがあり、これは急速に増える。全員が異なる確率を求めて 1 から引く方が簡単だ：',
  infoFormula: 'P(一致) = 1 − 365! / ( 365ⁿ × (365 − n)! )',
  infoP3:
    '数値的に安定な積 ∏(365−i)/365（i = 0…n−1）で計算している。シミュレーションタブがこれを実証する：ランダムな誕生日を何千回も引くと、被る割合はちょうど曲線上に乗る。',
};

export function getStrings(lang: GameLanguage): BirthdayStrings {
  return lang === 'ja' ? ja : en;
}
