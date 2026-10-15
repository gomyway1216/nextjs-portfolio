/**
 * Local ja/en strings for the Roulette game. Kept inside the component dir so
 * we don't touch the shared constants/gameTranslations.ts. Consumed via the
 * existing useGameLanguage() hook.
 *
 * The table plays with the medal center's medals, so nothing a player reads
 * here may be mistaken for real money: it speaks of medals (メダル, 持ちメダル,
 * n枚ベット, n枚獲得), never of a bankroll, a balance, cash or credits.
 */

import type { GameLanguage } from '../constants/gameTranslations';
// That medals are not money, in the medal center's own words: every game that plays with them shows it.
import { NOT_MONEY } from '../MedalCenter/strings';
import { colorOf } from './engine';
import { BET_STEPS, SPOT_MAX } from './medalTable';

const COLOR_NAMES: Record<GameLanguage, Record<'red' | 'black' | 'green', string>> = {
  en: { red: 'red', black: 'black', green: 'green' },
  ja: { red: '赤', black: '黒', green: '緑' },
};

export interface RouletteStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabSim: string;
  tabEdge: string;
  /** The link back to the medal center, over the title. */
  centerLink: string;
  // Play tab: the medal counter
  /** The LED counter of the player's medals that are not on the felt. */
  medals: string;
  /** The LED counter of the medals on the felt. */
  bet: string;
  /** What a screen reader hears for the two counters. */
  medalsSr: (n: number) => string;
  betSr: (n: number) => string;
  /** Until the player's medals have been found. */
  finding: string;
  /** Medals are for playing only: never money. Shown by the counter and in the help. */
  notMoney: string;
  /** The note by the counter that the medals are the medal center's, and its link. */
  centerNote: string;
  centerNoteLink: string;
  /** Shown once: roulette plays with the medal center's medals now, and its old chips are retired. */
  notice: string;
  noticeLink: string;
  noticeOk: string;
  /** The medals are being played in another tab: this table waits. */
  cardAway: string;
  playHere: string;
  /** The player has no medals left: the free cupful. */
  refill: (medals: number) => string;
  sayRefill: (medals: number) => string;
  sayReset: string;
  sayStake: (medals: number) => string;
  sayResumed: string;
  tooFew: string;
  spotFull: (max: number) => string;
  noneLeft: string;
  /** The steps a tap adds. */
  stepGroup: string;
  stepAria: (medals: number) => string;
  /** The outcome of a spin: the medals it won (its bets included) and what that left the player with, or nothing won. */
  wonLine: (won: number, net: number) => string;
  lostLine: (wagered: number) => string;
  lastSpin: string;
  spin: string;
  spinning: string;
  clear: string;
  undo: string;
  recentResults: string;
  none: string;
  betHistory: string;
  noBets: string;
  insideHint: string;
  outsideHint: string;
  /** The columns of the spin history: medals bet, and what the spin left the player with. */
  histBet: string;
  histNet: string;
  /** Croupier call shown while the ball is in motion. */
  noMoreBets: string;
  // Results board (casino marquee)
  /** Header of the board: how many spins the statistics cover. */
  boardSpins: (n: number) => string;
  /** Accessible name for the newest-first results column. */
  ledListLabel: string;
  /** Button that empties the saved results board. */
  boardClear: string;
  boardClearAria: string;
  boardClearConfirm: string;
  zero: string;
  hot: string;
  cold: string;
  /** How many hits a hot / cold number has had. */
  hitCount: (count: number) => string;
  /** Shown until enough spins exist for hot / cold numbers. */
  hotColdPending: (remaining: number) => string;
  /** Localized color name for a pocket (red/black/green). */
  colorName: (n: number) => string;
  /** aria-label for the wheel when idle / spinning. */
  wheelIdle: string;
  /** aria-label for the wheel once a result has settled. */
  wheelResult: (n: number) => string;
  /** aria-label for a bet cell: "<bet name> (<odds>:1)". */
  betAria: (kind: string, odds: number) => string;
  // labels
  low: string;
  high: string;
  even: string;
  odd: string;
  red: string;
  black: string;
  columnLabel: (n: number) => string;
  dozenLabel: (lo: number, hi: number) => string;
  // Info modal
  howToPlay: string;
  infoBody: string[];
  payoutTableTitle: string;
  // Sim tab
  simIntroTitle: string;
  simIntro: string[];
  initialBankroll: string;
  baseBet: string;
  tableMax: string;
  maxSpins: string;
  trialsLabel: string;
  runSim: string;
  running: string;
  restoreDefaults: string;
  trialsNote: (max: string) => string;
  mcResult: (n: number) => string;
  bustRate: string;
  medianSpinsToBust: string;
  medianFinal: string;
  meanFinal: string;
  tableMaxHitRate: string;
  meanFinalNote: (bankroll: number) => string;
  finalDist: string;
  spinsAxis: string;
  sampleRun: string;
  outcomeBust: string;
  outcomeCapped: (n: number) => string;
  sampleMeta: (spins: number, final: number, maxBet: number) => string;
  hitCapSuffix: string;
  /** The sample run's chart: its vertical axis, and the mark where it ran out. */
  medalsAxis: string;
  outMark: string;
  // Edge tab
  edgeTitle: string;
  edgeIntro: string[];
  edgeBetLabel: string;
  edgeSpinsLabel: string;
  edgeRun: string;
  edgeRunning: string;
  theoretical: string;
  empirical: string;
  edgeChartTitle: string;
  edgeConverges: (edge: string) => string;
}

const BET_NAMES_EN: Record<string, string> = {
  straight: 'Straight up',
  split: 'Split',
  street: 'Street',
  corner: 'Corner',
  line: 'Line',
  dozen: 'Dozen',
  column: 'Column',
  red: 'Red',
  black: 'Black',
  even: 'Even',
  odd: 'Odd',
  low: '1–18 (Low)',
  high: '19–36 (High)',
};

const BET_NAMES_JA: Record<string, string> = {
  straight: 'ストレート',
  split: 'スプリット',
  street: 'ストリート',
  corner: 'コーナー',
  line: 'ライン',
  dozen: 'ダズン',
  column: 'コラム',
  red: '赤',
  black: '黒',
  even: '偶数',
  odd: '奇数',
  low: '1–18 (ロー)',
  high: '19–36 (ハイ)',
};

export function betName(kind: string, lang: GameLanguage): string {
  return (lang === 'ja' ? BET_NAMES_JA : BET_NAMES_EN)[kind] ?? kind;
}

/** How many medals, in English: "1 medal", "5 medals". */
const medalsEn = (n: number): string => `${n.toLocaleString('en-US')} ${n === 1 ? 'medal' : 'medals'}`;
/** A change in medals with its sign: +5, −5, ±0. */
const signed = (n: number): string => (n > 0 ? `+${n.toLocaleString('en-US')}` : n < 0 ? `−${(-n).toLocaleString('en-US')}` : '±0');


const EN: RouletteStrings = {
  title: 'Roulette',
  subtitle:
    'European single-zero roulette (house edge −2.70%), played with your medals from the Medal Game Center. Bet, spin, and see the Martingale system fail under the law of large numbers.',
  tabPlay: 'Play',
  tabSim: 'Martingale sim',
  tabEdge: 'House edge',
  centerLink: 'Medal Game Center',
  medals: 'MEDALS',
  bet: 'BET',
  medalsSr: (n) => `Your medals: ${n.toLocaleString('en-US')}`,
  betSr: (n) => `On the felt: ${medalsEn(n)}`,
  finding: 'Looking for your medals…',
  notMoney: NOT_MONEY.en,
  centerNote: 'These are your medals from the Medal Game Center: every game there plays with the same ones, and they are reset only there.',
  centerNoteLink: 'Go to the Medal Game Center',
  notice:
    'Roulette now plays with your medals from the Medal Game Center, the same medals every game there uses. The chips this table used to hand out are retired.',
  noticeLink: 'Go to the Medal Game Center',
  noticeOk: 'OK',
  cardAway: 'Your medals are being played in another tab. This table waits where it is.',
  playHere: 'Play here',
  refill: (medals) => `Out of medals — take ${medals} more`,
  sayRefill: (medals) => `${medalsEn(medals)} added to your medals.`,
  sayReset: 'Your medals were reset at the Medal Game Center: this table starts over.',
  sayStake: (medals) => `${medalsEn(medals)} bet.`,
  sayResumed: 'Your last spin had not finished: the ball is rolling again to the same number.',
  tooFew: 'Not enough medals for the bets on the felt.',
  spotFull: (max) => `${max} medals is the most on one spot.`,
  noneLeft: 'No medals left to bet.',
  stepGroup: 'Medals a tap',
  stepAria: (medals) => `Bet ${medalsEn(medals)} a tap`,
  wonLine: (won, net) => `Won ${medalsEn(won)} (${signed(net)})`,
  lostLine: (wagered) => `No win (${signed(-wagered)})`,
  lastSpin: 'Last spin',
  spin: 'SPIN',
  spinning: 'Spinning…',
  clear: 'Clear',
  undo: 'Undo',
  recentResults: 'Winning numbers',
  none: '(none yet)',
  betHistory: 'Spin history',
  noBets: 'No spins yet.',
  insideHint:
    'Inside bets: tap a grid border = Split (17:1), an intersection = Corner (8:1), the row below the grid = Street (11:1) / Line (5:1).',
  outsideHint: `Pick how many medals a tap adds, tap a betting area, then SPIN. The medals are taken when the wheel spins; at least 1 a bet and up to ${SPOT_MAX} on one spot.`,
  histBet: 'Bet',
  histNet: '+/−',
  noMoreBets: 'No more bets',
  boardSpins: (n) => `Last ${n} ${n === 1 ? 'spin' : 'spins'}`,
  ledListLabel: 'Winning numbers, newest first',
  boardClear: 'Clear',
  boardClearAria: 'Clear saved winning numbers',
  boardClearConfirm: 'Clear all saved winning numbers? This cannot be undone.',
  zero: 'Zero',
  hot: 'Hot',
  cold: 'Cold',
  hitCount: (count) => `${count} ${count === 1 ? 'hit' : 'hits'}`,
  hotColdPending: (remaining) =>
    `Hot / cold numbers appear after ${remaining} more ${remaining === 1 ? 'spin' : 'spins'}.`,
  colorName: (n) => COLOR_NAMES.en[colorOf(n)],
  wheelIdle: 'Roulette wheel',
  wheelResult: (n) => `Roulette wheel showing ${n} (${COLOR_NAMES.en[colorOf(n)]})`,
  betAria: (kind, odds) => `${BET_NAMES_EN[kind] ?? kind} (${odds}:1)`,
  low: '1–18',
  high: '19–36',
  even: 'EVEN',
  odd: 'ODD',
  red: 'RED',
  black: 'BLACK',
  columnLabel: (n) => `Col ${n} (2:1)`,
  dozenLabel: (lo, hi) => `${lo}–${hi} (2:1)`,
  howToPlay: 'How to play',
  infoBody: [
    'This is a European (single-zero) wheel: pockets 0–36, with 0 green. Because the odds are set for a 36-pocket wheel but the wheel has 37 pockets, every bet carries the same house edge of 1/37 ≈ 2.70%.',
    `You bet your medals from the Medal Game Center. Choose how many medals a tap adds (${BET_STEPS.join(', ')}), tap betting areas to stack them, then press SPIN. The medals on the felt are taken when the wheel spins, and what they win is added to your medals when the ball stops. At least 1 medal a bet, and at most ${SPOT_MAX} on any one spot.`,
    'Inside bets sit on the number grid; outside bets (red/black, odd/even, dozens, columns, etc.) sit around it.',
    'A spin is never taken back: its number is drawn when SPIN is pressed. If the page is hidden, left or reloaded while the ball is rolling, the spin is settled with that number, and anything it won is added to your medals.',
    'The Martingale tab and House-edge tab are statistical demos with pretend medals: they never touch yours, and no betting system can beat a negative expected value in the long run.',
    NOT_MONEY.en,
  ],
  payoutTableTitle: 'Odds (medals won for each medal bet; the bet comes back too)',
  simIntroTitle: 'What is the Martingale system?',
  simIntro: [
    'Double your bet after every loss on a bet that wins 1:1 (red or black, say). In theory a single win wins back everything lost so far, plus the first bet.',
    'In reality (1) the most a spot takes and (2) a limited number of medals mean a long losing streak runs you out.',
    'Set up the run below and press "Run simulation" to see, on a European wheel (green 0, EV −2.70%), how often the strategy runs out of medals. It plays with pretend medals: yours are never touched.',
  ],
  initialBankroll: 'Starting medals',
  baseBet: 'First bet (medals)',
  tableMax: 'Most on one spot',
  maxSpins: 'Max spins / run',
  trialsLabel: 'Monte Carlo trials',
  runSim: 'Run simulation',
  running: 'Running',
  restoreDefaults: 'Restore defaults',
  trialsNote: (max) => `Large trial counts take a few seconds (max ${max}).`,
  mcResult: (n) => `Monte Carlo result (${n.toLocaleString()} trials)`,
  bustRate: 'Ran out of medals',
  medianSpinsToBust: 'Median spins to run out',
  medianFinal: 'Median medals at the end',
  meanFinal: 'Average medals at the end',
  tableMaxHitRate: 'Hit the spot limit',
  meanFinalNote: (b) =>
    `The average at the end is in theory a loss (EV −2.70% × every medal bet). Below the starting ${b} means medals were lost.`,
  finalDist: 'Medals at the end, across all runs',
  spinsAxis: 'spins',
  sampleRun: 'Sample run: medals spin by spin',
  outcomeBust: '💥 Out of medals',
  outcomeCapped: (n) => `🛑 Reached max spins (${n})`,
  sampleMeta: (spins, final, maxBet) => `${spins} spins / ${medalsEn(final)} at the end / biggest bet ${maxBet}`,
  hitCapSuffix: ' / hit the spot limit',
  medalsAxis: 'medals',
  outMark: 'OUT',
  edgeTitle: 'House edge convergence',
  edgeIntro: [
    'Bet one medal on the chosen bet, every spin (pretend medals: yours are not touched). Early on the return swings wildly, but the law of large numbers drags it toward the theoretical −2.70% — no matter which bet you pick.',
    'This is why "systems" don\'t work: the edge is baked into every bet equally.',
  ],
  edgeBetLabel: 'Bet type',
  edgeSpinsLabel: 'Number of spins',
  edgeRun: 'Run',
  edgeRunning: 'Running…',
  theoretical: 'Theoretical (−2.70%)',
  empirical: 'Empirical',
  edgeChartTitle: 'Empirical player return vs. spins (log scale)',
  edgeConverges: (edge) => `After the run, the empirical player return was ${edge}, converging toward −2.70%.`,
};

const JA: RouletteStrings = {
  title: 'ルーレット',
  subtitle:
    'ヨーロピアンルーレット（0のみ・期待値 −2.70%）をメダルゲームセンターの持ちメダルで遊び、大数の法則のもとでマーチンゲール法が破綻することを確かめる。',
  tabPlay: '遊ぶ',
  tabSim: 'マーチン法シミュレーション',
  tabEdge: 'ハウスエッジ検証',
  centerLink: 'メダルゲームセンター',
  medals: '持ちメダル',
  bet: 'ベット',
  medalsSr: (n) => `持ちメダル ${n.toLocaleString('ja-JP')}枚`,
  betSr: (n) => `テーブル上のベット ${n.toLocaleString('ja-JP')}枚`,
  finding: '持ちメダルを確認しています…',
  notMoney: NOT_MONEY.ja,
  centerNote: 'メダルゲームセンターの持ちメダルです。センターのどのゲームも同じメダルで遊び、リセットはセンターでのみ行えます。',
  centerNoteLink: 'メダルゲームセンターへ',
  notice: 'ルーレットは、メダルゲームセンターの持ちメダルで遊ぶようになりました。センターのどのゲームとも同じメダルです。これまでこのテーブルで配っていたチップは廃止しました。',
  noticeLink: 'メダルゲームセンターへ',
  noticeOk: 'OK',
  cardAway: 'メダルは別のタブで遊ばれています。このテーブルはそのまま待っています。',
  playHere: 'ここで遊ぶ',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  sayRefill: (medals) => `メダルを${medals}枚受け取りました。`,
  sayReset: 'メダルゲームセンターでメダルがリセットされました。このテーブルも最初からです。',
  sayStake: (medals) => `${medals}枚ベット。`,
  sayResumed: '前回のスピンが終わっていませんでした。同じ出目に向かってボールがもう一度回ります。',
  tooFew: 'テーブル上のベットに足りるメダルがありません。',
  spotFull: (max) => `1か所に置けるのは${max}枚までです。`,
  noneLeft: 'ベットできるメダルがありません。',
  stepGroup: '1回のベット枚数',
  stepAria: (medals) => `1回${medals}枚ベット`,
  wonLine: (won, net) => `${won.toLocaleString('ja-JP')}枚獲得（${signed(net)}枚）`,
  lostLine: (wagered) => `ハズレ（${signed(-wagered)}枚）`,
  lastSpin: '前回のスピン',
  spin: 'SPIN',
  spinning: 'スピン中…',
  clear: 'クリア',
  undo: '取り消し',
  recentResults: '出目履歴',
  none: '（まだなし）',
  betHistory: 'スピン履歴',
  noBets: 'まだスピンなし。',
  insideHint:
    'インサイドベット: 数字グリッドの境界線をタップ = スプリット (17:1)、交点 = コーナー (8:1)、グリッド下の行 = ストリート (11:1) / ライン (5:1)。',
  outsideHint: `1回のベット枚数を選んでベットエリアをタップ→SPIN。メダルはホイールが回るときに使います。ベットは1枚から、1か所${SPOT_MAX}枚まで。`,
  histBet: 'ベット',
  histNet: '増減',
  noMoreBets: 'ノー・モア・ベット',
  boardSpins: (n) => `直近 ${n} 回`,
  ledListLabel: '当選番号（新しい順）',
  boardClear: '消去',
  boardClearAria: '保存した出目履歴を消去',
  boardClearConfirm: '保存した出目履歴をすべて消去しますか？元に戻せません。',
  zero: 'ゼロ',
  hot: 'ホット',
  cold: 'コールド',
  hitCount: (count) => `${count} 回`,
  hotColdPending: (remaining) => `あと ${remaining} 回スピンするとホット / コールド数字を表示します。`,
  colorName: (n) => COLOR_NAMES.ja[colorOf(n)],
  wheelIdle: 'ルーレットホイール',
  wheelResult: (n) => `ルーレットホイール 結果 ${n}（${COLOR_NAMES.ja[colorOf(n)]}）`,
  betAria: (kind, odds) => `${BET_NAMES_JA[kind] ?? kind} (${odds}:1)`,
  low: '1–18',
  high: '19–36',
  even: '偶数',
  odd: '奇数',
  red: '赤',
  black: '黒',
  columnLabel: (n) => `コラム${n} (2:1)`,
  dozenLabel: (lo, hi) => `${lo}–${hi} (2:1)`,
  howToPlay: '遊び方',
  infoBody: [
    'ヨーロピアン（0のみ）ホイールです: ポケット 0–36、0 は緑。配当は 36 ポケット基準なのにホイールは 37 ポケットあるため、どのベットでもハウスエッジは同じ 1/37 ≈ 2.70% になります。',
    `メダルゲームセンターの持ちメダルでベットします。1回のベット枚数（${BET_STEPS.join('・')}枚）を選び、ベットエリアをタップしてメダルを重ね、SPIN を押します。テーブル上のメダルはホイールが回るときに使われ、当たった分はボールが止まったときに持ちメダルに加わります。ベットは1枚から、1か所${SPOT_MAX}枚までです。`,
    'インサイドは数字グリッド上、アウトサイド（赤黒・偶奇・ダズン・コラム等）はその周囲にあります。',
    'スピンの取り消しはできません。出目は SPIN を押したときに決まります。ボールが回っている間にページを隠したり、離れたり、読み込み直したりした場合は、その出目でスピンを精算し、当たった分を持ちメダルに加えます。',
    'マーチン法タブとハウスエッジ検証タブは仮のメダルを使う統計デモで、持ちメダルは使いません。期待値がマイナスの勝負に長期的に勝てるベットシステムは存在しません。',
    NOT_MONEY.ja,
  ],
  payoutTableTitle: '配当（ベット1枚あたりの獲得枚数。ベットした分も戻ります）',
  simIntroTitle: 'マーチンゲール法とは',
  simIntro: [
    '1:1 のベット（赤・黒など）で負けたら、次のベット枚数を2倍にする戦略。理論上、1回勝てばそれまでの負けを取り戻し、さらに最初のベット1回分が増える。',
    'ただし現実には (1) 1か所の上限枚数 と (2) 持ちメダルに限りがあること によって、連敗が続くとメダルが尽きます。',
    '下で設定し「シミュレーション実行」を押すと、ヨーロピアンルーレット（緑0あり・期待値 −2.70%）で何回試したらメダルが尽きるかを統計的に検証できます。仮のメダルで行うので、持ちメダルは使いません。',
  ],
  initialBankroll: '最初の持ちメダル',
  baseBet: '最初のベット枚数',
  tableMax: '1か所の上限枚数',
  maxSpins: '1ランの最大スピン',
  trialsLabel: 'モンテカルロ試行数',
  runSim: 'シミュレーション実行',
  running: '実行中',
  restoreDefaults: 'デフォルトに戻す',
  trialsNote: (max) => `試行数が多いと数秒かかります（最大 ${max}）。`,
  mcResult: (n) => `モンテカルロ結果 (${n.toLocaleString()} 試行)`,
  bustRate: 'メダル切れ率',
  medianSpinsToBust: 'メダル切れまでのスピン 中央値',
  medianFinal: '最後の持ちメダル 中央値',
  meanFinal: '最後の持ちメダル 平均',
  tableMaxHitRate: '上限到達率',
  meanFinalNote: (b) =>
    `「最後の持ちメダル 平均」は理論的には負け（期待値 −2.70% × ベットした総枚数）。最初の ${b}枚を下回るほどメダルが減っています。`,
  finalDist: '最後の持ちメダルの分布',
  spinsAxis: 'スピン数',
  sampleRun: 'サンプル1ラン: 持ちメダルの推移',
  outcomeBust: '💥 メダル切れ',
  outcomeCapped: (n) => `🛑 最大スピン (${n}) 到達`,
  sampleMeta: (spins, final, maxBet) => `スピン数 ${spins} / 最後 ${final}枚 / 最大ベット ${maxBet}枚`,
  hitCapSuffix: ' / 上限到達あり',
  medalsAxis: '持ちメダル',
  outMark: 'メダル切れ',
  edgeTitle: 'ハウスエッジ収束',
  edgeIntro: [
    '選んだベットに毎スピン1枚ずつ賭け続けます（仮のメダルで、持ちメダルは使いません）。序盤は経験的リターンが大きく揺れますが、大数の法則により理論値 −2.70% に近づきます — どのベットを選んでも同じです。',
    'これが「必勝法」が効かない理由です: エッジはすべてのベットに等しく組み込まれています。',
  ],
  edgeBetLabel: 'ベット種類',
  edgeSpinsLabel: 'スピン回数',
  edgeRun: '実行',
  edgeRunning: '実行中…',
  theoretical: '理論値 (−2.70%)',
  empirical: '経験値',
  edgeChartTitle: '経験的プレイヤーリターン vs スピン数（対数）',
  edgeConverges: (edge) => `実行後の経験的リターンは ${edge} で、−2.70% に収束しました。`,
};

export function getStrings(lang: GameLanguage): RouletteStrings {
  return lang === 'ja' ? JA : EN;
}
