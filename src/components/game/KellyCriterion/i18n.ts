/**
 * Local ja/en strings for the Kelly Criterion game, consumed via useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { ScenarioId } from './engine';
import type { StrategyId } from './sim';

export type FinishReason = 'bust' | 'cap' | 'flips';

export interface KellyStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabFormula: string;
  tabSim: string;
  howToPlay: string;
  infoBody: string[];
  scenarioLabel: string;
  scenarioName: Record<ScenarioId, string>;
  strategyName: Record<StrategyId, string>;
  // Table
  bankroll: string;
  flips: string;
  cap: string;
  heads: string;
  tails: string;
  headsShort: string;
  tailsShort: string;
  coinIdle: string;
  coinAria: (face: string) => string;
  stakeLabel: string;
  stakeValue: (percent: string, amount: string) => string;
  quickStakes: string;
  allIn: string;
  flip: string;
  flipMany: (count: number) => string;
  flipManyAria: (count: number) => string;
  flipping: string;
  newGame: string;
  needStake: string;
  /** The payout in a sentence: "even money", "4 to 1". */
  oddsShort: (b: number) => string;
  startPrompt: (percent: string, odds: string) => string;
  lastFlip: (won: boolean, amount: string) => string;
  finished: (reason: FinishReason, flips: number, amount: string) => string;
  finishedKelly: (percent: string, amount: string) => string;
  kellyToggle: string;
  kellyHint: (percent: string, amount: string) => string;
  chartTitle: string;
  chartYou: string;
  chartKelly: (percent: string) => string;
  chartSummary: (flips: number, you: string, kelly: string) => string;
  recentTitle: string;
  recentAria: (flips: number) => string;
  statsTitle: string;
  statFlips: string;
  statHeads: string;
  statAverageStake: string;
  statLargestStake: string;
  statKelly: (percent: string) => string;
  hint: string[];
  // Formula
  formulaTitle: string;
  formulaIntro: string;
  winChance: string;
  payout: string;
  payoutOption: (b: number) => string;
  presets: string;
  statEdge: string;
  statKellyStake: string;
  statGrowth: string;
  statDouble: string;
  statZero: string;
  never: string;
  ofBankroll: string;
  perBet: string;
  bets: string;
  timesKelly: (multiple: string) => string;
  formulaLine: (p: string, q: string, b: string, kelly: string) => string;
  noEdge: string;
  curveTitle: string;
  curveIntro: string;
  curveAria: string;
  curveX: string;
  curveY: string;
  curveKelly: string;
  curveZero: string;
  colStake: string;
  colGrowth: string;
  afterTitle: string;
  afterIntro: (bets: string) => string;
  betsLabel: string;
  colStrategy: string;
  colTypical: string;
  colRange: string;
  colAverage: string;
  colBelowStart: string;
  colEverHalf: string;
  rangeValue: (low: string, high: string) => string;
  afterNote: (kellyAverage: string, kellyTypical: string, allInAverage: string) => string;
  experimentTitle: string;
  experimentIntro: string;
  experimentFacts: string[];
  experimentExact: (ten: string, fifteen: string, twenty: string) => string;
  experimentSource: string;
  // Simulation
  simTitle: string;
  simIntro: string;
  sessionsLabel: string;
  flipsPerSession: string;
  run: string;
  running: (pct: number) => string;
  cancel: string;
  simChartAria: string;
  simChartX: string;
  colSimulated: string;
  colExact: string;
  simNote: (winRate: string, exact: string) => string;
}

const en: KellyStrings = {
  title: 'Kelly Criterion',
  subtitle:
    'A coin that lands heads 60% of the time, $25, and 300 flips. The bet is in your favor — the only question is how much to stake. Play it, then see why one bet size beats all the others.',
  tabPlay: 'Play',
  tabFormula: 'The formula',
  tabSim: 'Simulation',
  howToPlay: 'How to play',
  infoBody: [
    'You start with $25. The coin lands heads 60% of the time, and a bet on heads pays even money: stake $5 and you either win $5 or lose $5.',
    'Choose how much to stake, then flip — once, or 10 or 50 times in a row with the same percentage of whatever you have. You get 300 flips, and the game stops early if you go bust or reach the $250 cap.',
    'The Kelly criterion says to stake the same fraction of your bankroll every time: your edge divided by the odds. For this coin that is 20%.',
    'Stake less and you grow more slowly. Stake more and the swings eat the edge: beyond about twice the Kelly stake, the typical player ends with less than they started, on a bet that favors them every single time.',
    'This is the game of a 2016 experiment by Victor Haghani and Richard Dewey. Sixty-one finance students and young professionals played it for real money, and 28% of them went bust.',
  ],
  scenarioLabel: 'The bet',
  scenarioName: {
    coin60: '60% coin, even money (the 2016 experiment)',
    edge53: '53% coin, even money (a thin edge)',
    longshot: '25% long shot paying 4 to 1',
  },
  strategyName: {
    half: 'Half Kelly',
    kelly: 'Kelly',
    double: 'Double Kelly',
    triple: 'Triple Kelly',
    allIn: 'All in',
  },
  bankroll: 'Bankroll',
  flips: 'Flips',
  cap: 'Cap',
  heads: 'Heads',
  tails: 'Tails',
  headsShort: 'H',
  tailsShort: 'T',
  coinIdle: 'The coin has not been flipped yet',
  coinAria: (face) => `The coin shows ${face}`,
  stakeLabel: 'Stake',
  stakeValue: (percent, amount) => `${percent} of your bankroll = ${amount}`,
  quickStakes: 'Quick stakes',
  allIn: 'All in',
  flip: 'FLIP',
  flipMany: (count) => `×${count}`,
  flipManyAria: (count) => `Flip ${count} times, staking the same percentage each time`,
  flipping: 'Flipping…',
  newGame: 'New game',
  needStake: 'Stake something first.',
  oddsShort: (b) => (b === 1 ? 'even money' : `${b} to 1`),
  startPrompt: (percent, odds) => `Heads comes up ${percent} of the time and pays ${odds}. How much will you stake?`,
  lastFlip: (won, amount) => (won ? `Heads — you win ${amount}` : `Tails — you lose ${amount}`),
  finished: (reason, flips, amount) =>
    reason === 'bust'
      ? `Bust after ${flips} flips.`
      : reason === 'cap'
        ? `You reached the ${amount} cap in ${flips} flips.`
        : `All ${flips} flips used: you finish with ${amount}.`,
  finishedKelly: (percent, amount) => `Staking ${percent} on every one of the same flips ends with ${amount}.`,
  kellyToggle: 'Show the Kelly stake',
  kellyHint: (percent, amount) => `Kelly: ${percent} of your bankroll, which is ${amount} right now.`,
  chartTitle: 'Your bankroll, flip by flip',
  chartYou: 'You',
  chartKelly: (percent) => `${percent} every flip (Kelly)`,
  chartSummary: (flips, you, kelly) => `After ${flips} flips you have ${you}. The Kelly stake on the same flips has ${kelly}.`,
  recentTitle: 'Recent flips',
  recentAria: (flips) => `The last ${flips} flips, oldest first`,
  statsTitle: 'This game',
  statFlips: 'Flips',
  statHeads: 'Heads',
  statAverageStake: 'Average stake',
  statLargestStake: 'Largest stake',
  statKelly: (percent) => `${percent} every flip, same flips`,
  hint: [
    'The Kelly stake is a fraction of what you have now, not a fixed amount: it shrinks after a loss and grows after a win, which is why it cannot go bust on its own.',
    'Losing 50% takes a 100% gain to recover. That asymmetry is why bigger bets do not simply mean bigger growth.',
    'Many professionals stake half Kelly: about three quarters of the growth for far smaller swings.',
  ],
  formulaTitle: 'How much to stake',
  formulaIntro:
    'A bet is two numbers: the chance it wins and what it pays. The Kelly stake is the edge divided by the odds, and it is the fraction that makes a bankroll grow fastest over many bets.',
  winChance: 'Chance of winning',
  payout: 'Payout',
  payoutOption: (b) => (b === 0.5 ? '1 to 2 (win half your stake)' : b === 1 ? 'Even money (1 to 1)' : `${b} to 1`),
  presets: 'Presets',
  statEdge: 'Edge per $1 staked',
  statKellyStake: 'Kelly stake',
  statGrowth: 'Growth per bet at Kelly',
  statDouble: 'Bets to double',
  statZero: 'Growth turns negative above',
  never: 'never',
  ofBankroll: 'of your bankroll',
  perBet: 'per bet',
  bets: 'bets',
  timesKelly: (multiple) => `${multiple} × Kelly`,
  formulaLine: (p, q, b, kelly) => `f* = p − q / b = ${p} − ${q} / ${b} = ${kelly}`,
  noEdge: 'This bet has no edge, so the Kelly stake is zero. No bet size turns a losing bet into a winning one.',
  curveTitle: 'Growth against the size of the bet',
  curveIntro:
    'Long-run growth per bet for every stake from nothing to everything. It rises to a peak at the Kelly stake, falls back to zero a little under twice that, and is negative beyond: the same favorable bet, sized too large, loses money.',
  curveAria: 'Long-run growth per bet against the fraction of the bankroll staked',
  curveX: 'Fraction of the bankroll staked',
  curveY: 'Growth per bet',
  curveKelly: 'Kelly',
  curveZero: 'zero growth',
  colStake: 'Stake',
  colGrowth: 'Growth per bet',
  afterTitle: 'The same bet, five ways of sizing it',
  afterIntro: (bets) =>
    `Where a bankroll ends after ${bets} bets, as a multiple of where it started. Every number is counted exactly from the binomial distribution, with nothing simulated.`,
  betsLabel: 'Bets',
  colStrategy: 'Strategy',
  colTypical: 'Typical result',
  colRange: '9 runs in 10 end between',
  colAverage: 'Average result',
  colBelowStart: 'Ends below the start',
  colEverHalf: 'Loses half along the way',
  rangeValue: (low, high) => `${low} and ${high}`,
  afterNote: (kellyAverage, kellyTypical, allInAverage) =>
    `The average and the typical result are very different things. At the Kelly stake the average is ${kellyAverage} and the typical result ${kellyTypical}: a few enormous runs carry the average. All in has the best average of all, ${allInAverage}, and ends with nothing unless every single flip is a win.`,
  experimentTitle: 'What people actually did',
  experimentIntro:
    'In 2016 Victor Haghani and Richard Dewey gave 61 finance students and young investment professionals $25 each and half an hour, about 300 flips, on a coin they were told lands heads 60% of the time. Payouts were capped at $250.',
  experimentFacts: [
    '28% of them went bust.',
    'The average payout was $91, and only 21% reached the $250 cap.',
    '18 of the 61 staked their whole bankroll on a single flip.',
    '41 of them (67%) bet on tails at some point.',
    'Only 5 said they had ever heard of the Kelly criterion.',
  ],
  experimentExact: (ten, fifteen, twenty) =>
    `Staking a constant 20% reaches ten times the stake within 300 flips ${twenty} of the time; 15% does it ${fifteen} of the time and 10% does it ${ten}. Those are exact counts from this page, and they match the roughly 95% the paper reports.`,
  experimentSource: 'Haghani & Dewey (2016), “Rational Decision-Making under Uncertainty: Observed Betting Patterns on a Biased Coin”',
  simTitle: 'Five bet sizes on the same flips',
  simIntro:
    'Every session tosses one run of coins, and all five strategies bet on that same run, each staking its own fixed fraction of whatever it has left. The dashed lines are the exact long-run growth of each strategy.',
  sessionsLabel: 'Sessions',
  flipsPerSession: 'Flips per session',
  run: 'Run',
  running: (pct) => `Running… ${pct}%`,
  cancel: 'Cancel',
  simChartAria: 'Average growth per bet against the number of sessions simulated, one line per strategy',
  simChartX: 'Sessions',
  colSimulated: 'Simulated',
  colExact: 'Exact',
  simNote: (winRate, exact) =>
    `The coin won ${winRate} of the flips in this run (exact: ${exact}). All in is left out of the chart: one loss ends it, so its growth is minus infinity.`,
};

const ja: KellyStrings = {
  title: 'ケリー基準',
  subtitle:
    '60%で表が出るコイン、所持金25ドル、300回。賭けは自分に有利で、決めるのは「いくら賭けるか」だけです。まず遊んでから、なぜ1つの賭け方がほかのすべてに勝つのかを確かめます。',
  tabPlay: 'プレイ',
  tabFormula: 'ケリーの式',
  tabSim: 'シミュレーション',
  howToPlay: '遊び方',
  infoBody: [
    '25ドルから始めます。コインは60%の確率で表が出て、表に賭けると配当は1倍です。5ドル賭ければ、5ドル勝つか5ドル失うかのどちらかです。',
    '賭ける額を決めてコインを投げます。1回ずつでも、所持金に対する同じ割合のまま10回・50回まとめてでも投げられます。投げられるのは300回までで、破産するか上限の250ドルに届くとそこで終わりです。',
    'ケリー基準は「毎回、所持金の同じ割合を賭けよ」と教えます。その割合は優位性をオッズで割ったもので、このコインでは20%です。',
    'それより少なく賭けると増え方が遅くなります。多く賭けると、振れ幅が優位性を食いつぶします。ケリーのおよそ2倍を超えると、毎回有利な賭けなのに、ふつうの人は元手を減らして終わります。',
    'これは2016年にVictor HaghaniとRichard Deweyが行った実験と同じゲームです。金融を学ぶ学生と若手の専門家61人が実際のお金で遊び、28%が破産しました。',
  ],
  scenarioLabel: '賭けの種類',
  scenarioName: {
    coin60: '60%のコイン・配当1倍（2016年の実験）',
    edge53: '53%のコイン・配当1倍（わずかな優位）',
    longshot: '25%の大穴・配当4倍',
  },
  strategyName: {
    half: 'ケリーの半分',
    kelly: 'ケリー',
    double: 'ケリーの2倍',
    triple: 'ケリーの3倍',
    allIn: '全額',
  },
  bankroll: '所持金',
  flips: '回数',
  cap: '上限',
  heads: '表',
  tails: '裏',
  headsShort: '表',
  tailsShort: '裏',
  coinIdle: 'コインはまだ投げられていません',
  coinAria: (face) => `コインは${face}です`,
  stakeLabel: '賭ける額',
  stakeValue: (percent, amount) => `所持金の${percent} = ${amount}`,
  quickStakes: '割合をすぐ選ぶ',
  allIn: '全額',
  flip: '投げる',
  flipMany: (count) => `×${count}`,
  flipManyAria: (count) => `同じ割合のまま${count}回投げる`,
  flipping: '投げています…',
  newGame: '新しいゲーム',
  needStake: '先に賭ける額を決めてください。',
  oddsShort: (b) => `${b}倍`,
  startPrompt: (percent, odds) => `表は${percent}の確率で出て、配当は${odds}です。いくら賭けますか？`,
  lastFlip: (won, amount) => (won ? `表 — ${amount}の勝ち` : `裏 — ${amount}の負け`),
  finished: (reason, flips, amount) =>
    reason === 'bust'
      ? `${flips}回目で破産しました。`
      : reason === 'cap'
        ? `${flips}回で上限の${amount}に届きました。`
        : `${flips}回すべて終了。最終的な所持金は${amount}です。`,
  finishedKelly: (percent, amount) => `同じ出目に毎回${percent}ずつ賭けていたら、${amount}で終わっていました。`,
  kellyToggle: 'ケリーの賭け額を表示',
  kellyHint: (percent, amount) => `ケリー：所持金の${percent}。いまは${amount}です。`,
  chartTitle: '所持金の推移',
  chartYou: 'あなた',
  chartKelly: (percent) => `毎回${percent}（ケリー）`,
  chartSummary: (flips, you, kelly) => `${flips}回終わって、あなたは${you}。同じ出目にケリーで賭けた場合は${kelly}です。`,
  recentTitle: '直近の出目',
  recentAria: (flips) => `直近${flips}回の出目（古い順）`,
  statsTitle: 'このゲーム',
  statFlips: '回数',
  statHeads: '表の回数',
  statAverageStake: '賭けた割合の平均',
  statLargestStake: '賭けた割合の最大',
  statKelly: (percent) => `同じ出目に毎回${percent}`,
  hint: [
    'ケリーの賭け額は固定の金額ではなく、いまの所持金に対する割合です。負ければ小さく、勝てば大きくなるので、それだけで破産することはありません。',
    '50%失うと、元に戻すには100%の利益が必要です。この非対称があるので、大きく賭ければその分だけ増える、とはなりません。',
    'プロの多くは「ケリーの半分」を賭けます。増え方は約4分の3を保ったまま、振れ幅はずっと小さくなります。',
  ],
  formulaTitle: 'いくら賭けるか',
  formulaIntro:
    '賭けは2つの数字で決まります。勝つ確率と配当です。ケリーの賭け額は優位性をオッズで割ったもので、何度も賭けたときに所持金がもっとも速く増える割合です。',
  winChance: '勝つ確率',
  payout: '配当',
  payoutOption: (b) => (b === 0.5 ? '0.5倍（賭け金の半分が勝ち分）' : b === 1 ? '1倍（イーブン）' : `${b}倍`),
  presets: 'プリセット',
  statEdge: '1ドル賭けたときの優位性',
  statKellyStake: 'ケリーの賭け額',
  statGrowth: 'ケリーで賭けたときの1回あたりの成長',
  statDouble: '2倍になるまでの回数',
  statZero: 'これを超えると減っていく',
  never: 'なし',
  ofBankroll: '所持金に対して',
  perBet: '1回あたり',
  bets: '回',
  timesKelly: (multiple) => `ケリーの${multiple}倍`,
  formulaLine: (p, q, b, kelly) => `f* = p − q / b = ${p} − ${q} / ${b} = ${kelly}`,
  noEdge: 'この賭けには優位性がないので、ケリーの賭け額はゼロです。どんな賭け方をしても、不利な賭けは有利になりません。',
  curveTitle: '賭ける割合と成長率',
  curveIntro:
    '何も賭けない場合から全額まで、賭ける割合ごとの長期的な成長率（1回あたり）です。ケリーの賭け額で頂点に達し、その2倍弱でゼロに戻り、それを超えるとマイナスになります。同じ有利な賭けでも、大きく賭けすぎると損をします。',
  curveAria: '所持金に対する賭ける割合と、1回あたりの長期的な成長率',
  curveX: '所持金に対する賭ける割合',
  curveY: '1回あたりの成長',
  curveKelly: 'ケリー',
  curveZero: '成長ゼロ',
  colStake: '賭ける割合',
  colGrowth: '1回あたりの成長',
  afterTitle: '同じ賭け、5通りの賭け方',
  afterIntro: (bets) =>
    `${bets}回賭けたあとの所持金を、最初の何倍かで示します。数字はすべて二項分布から厳密に数えたもので、シミュレーションは使っていません。`,
  betsLabel: '賭ける回数',
  colStrategy: '賭け方',
  colTypical: 'ふつうの結果',
  colRange: '10回中9回はこの範囲',
  colAverage: '平均の結果',
  colBelowStart: '元手を割って終わる',
  colEverHalf: '途中で半分になる',
  rangeValue: (low, high) => `${low} 〜 ${high}`,
  afterNote: (kellyAverage, kellyTypical, allInAverage) =>
    `平均と「ふつうの結果」はまったく別物です。ケリーで賭けると平均は${kellyAverage}ですが、ふつうの結果は${kellyTypical}です。ごく一部の大勝ちが平均を引き上げています。全額賭けは平均では最高の${allInAverage}ですが、すべての回で勝たないかぎり何も残りません。`,
  experimentTitle: '実際の人はどう賭けたか',
  experimentIntro:
    '2016年、Victor HaghaniとRichard Deweyは、金融を学ぶ学生と若手の投資専門家61人に25ドルずつ渡し、「60%の確率で表が出る」と伝えたコインで30分間（およそ300回）賭けてもらいました。払い出しの上限は250ドルでした。',
  experimentFacts: [
    '28%が破産しました。',
    '払い出しの平均は91ドルで、上限の250ドルに届いたのは21%だけでした。',
    '61人中18人が、1回の勝負に全額を賭けました。',
    '41人（67%）が、どこかで裏に賭けました。',
    'ケリー基準を聞いたことがあると答えたのは5人だけでした。',
  ],
  experimentExact: (ten, fifteen, twenty) =>
    `毎回20%ずつ賭けると、300回以内に元手の10倍へ届く確率は${twenty}です。15%なら${fifteen}、10%なら${ten}です。これはこのページで厳密に数えた値で、論文が報告している約95%と一致します。`,
  experimentSource: 'Haghani & Dewey（2016）「Rational Decision-Making under Uncertainty: Observed Betting Patterns on a Biased Coin」',
  simTitle: '同じ出目に、5通りの賭け方',
  simIntro:
    '各セッションでコインを一続き投げ、5つの賭け方すべてがその同じ出目に賭けます。それぞれ、残っている所持金の決まった割合を賭け続けます。点線は各賭け方の正確な長期成長率です。',
  sessionsLabel: 'セッション数',
  flipsPerSession: '1セッションの回数',
  run: '実行',
  running: (pct) => `実行中… ${pct}%`,
  cancel: '中止',
  simChartAria: 'シミュレーションしたセッション数と1回あたりの平均成長率（賭け方ごとに1本）',
  simChartX: 'セッション数',
  colSimulated: 'シミュレーション',
  colExact: '厳密値',
  simNote: (winRate, exact) =>
    `この実行でコインが勝ったのは全体の${winRate}でした（厳密値：${exact}）。全額賭けはグラフに入れていません。1回負けると終わりなので、成長率はマイナス無限大です。`,
};

export const getStrings = (language: GameLanguage): KellyStrings => (language === 'ja' ? ja : en);
