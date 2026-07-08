/**
 * Local ja/en strings for the Roulette game. Kept inside the component dir so
 * we don't touch the shared constants/gameTranslations.ts. Consumed via the
 * existing useGameLanguage() hook.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import { colorOf } from './engine';

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
  // Play tab
  balance: string;
  wagered: string;
  available: string;
  chip: string;
  spin: string;
  spinning: string;
  clear: string;
  undo: string;
  reset: string;
  recentResults: string;
  none: string;
  betHistory: string;
  noBets: string;
  insideHint: string;
  outsideHint: string;
  net: string;
  win: string;
  lose: string;
  push: string;
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
  outcomeSurvived: string;
  sampleMeta: (spins: number, final: number, maxBet: number) => string;
  hitCapSuffix: string;
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

const EN: RouletteStrings = {
  title: 'Roulette',
  subtitle:
    'European single-zero roulette (house edge −2.70%). Place chips, spin, and see the Martingale system fail under the law of large numbers.',
  tabPlay: 'Play',
  tabSim: 'Martingale sim',
  tabEdge: 'House edge',
  balance: 'Balance',
  wagered: 'Wagered',
  available: 'Available',
  chip: 'Chip',
  spin: 'SPIN',
  spinning: 'Spinning…',
  clear: 'Clear',
  undo: 'Undo',
  reset: 'Reset',
  recentResults: 'Recent results',
  none: '(none yet)',
  betHistory: 'Spin history',
  noBets: 'No spins yet.',
  insideHint:
    'Inside bets: click a grid border = Split (17:1), an intersection = Corner (8:1), the row below the grid = Street (11:1) / Line (5:1).',
  outsideHint: 'Pick a chip, click a betting area, then SPIN. Refill your balance with Reset.',
  net: 'Net',
  win: 'Win',
  lose: 'Loss',
  push: 'Push',
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
    'This is a European (single-zero) wheel: pockets 0–36, with 0 green. Because payouts are calibrated to a 36-pocket wheel but the wheel has 37 pockets, every bet carries the same house edge of 1/37 ≈ 2.70%.',
    'Choose a chip value, click betting areas to stack chips, then press SPIN. Inside bets sit on the number grid; outside bets (red/black, odd/even, dozens, columns, etc.) sit around it.',
    'The Martingale tab and House-edge tab are statistical demos: no betting system can beat a negative expected value in the long run.',
  ],
  payoutTableTitle: 'Payouts (profit : stake)',
  simIntroTitle: 'What is the Martingale system?',
  simIntro: [
    'Double your bet after every loss on an even-money wager. In theory a single win recovers all prior losses plus one base unit of profit.',
    'In reality (1) the table maximum and (2) a finite bankroll mean a long losing streak wipes you out.',
    'Configure the run below and press "Run simulation" to see, on a European wheel (green 0, EV −2.70%), how often the strategy busts.',
  ],
  initialBankroll: 'Initial bankroll',
  baseBet: 'Base bet',
  tableMax: 'Table maximum',
  maxSpins: 'Max spins / run',
  trialsLabel: 'Monte Carlo trials',
  runSim: 'Run simulation',
  running: 'Running',
  restoreDefaults: 'Restore defaults',
  trialsNote: (max) => `Large trial counts take a few seconds (max ${max}).`,
  mcResult: (n) => `Monte Carlo result (${n.toLocaleString()} trials)`,
  bustRate: 'Bust rate',
  medianSpinsToBust: 'Median spins to bust',
  medianFinal: 'Median final bankroll',
  meanFinal: 'Mean final bankroll',
  tableMaxHitRate: 'Table-max hit rate',
  meanFinalNote: (b) =>
    `The mean final bankroll is theoretically a loss (EV −2.70% × total wagered). Below the initial ${b} means you lost money.`,
  finalDist: 'Distribution of final bankrolls',
  spinsAxis: 'spins',
  sampleRun: 'Sample run: bankroll trajectory',
  outcomeBust: '💥 Bust',
  outcomeCapped: (n) => `🛑 Reached max spins (${n})`,
  outcomeSurvived: '✅ Survived',
  sampleMeta: (spins, final, maxBet) => `${spins} spins / final ${final} / max bet ${maxBet}`,
  hitCapSuffix: ' / hit table max',
  edgeTitle: 'House edge convergence',
  edgeIntro: [
    'Flat-bet one unit on the chosen bet, every spin. Early on the empirical return swings wildly, but the law of large numbers drags it toward the theoretical −2.70% — no matter which bet you pick.',
    'This is why "systems" don\'t work: the edge is baked into every wager equally.',
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
    'ヨーロピアンルーレット（0のみ・期待値 −2.70%）で遊び、大数の法則のもとでマーチンゲール法が破綻することを確かめる。',
  tabPlay: '遊ぶ',
  tabSim: 'マーチン法シミュレーション',
  tabEdge: 'ハウスエッジ検証',
  balance: '所持金',
  wagered: '賭け合計',
  available: '使用可能',
  chip: 'チップ',
  spin: 'SPIN',
  spinning: 'スピン中…',
  clear: 'クリア',
  undo: '取り消し',
  reset: 'リセット',
  recentResults: '直近の出目',
  none: '（まだなし）',
  betHistory: 'スピン履歴',
  noBets: 'まだスピンなし。',
  insideHint:
    'インサイドベット: 数字グリッドの境界線をクリック = スプリット (17:1)、交点 = コーナー (8:1)、グリッド下の行 = ストリート (11:1) / ライン (5:1)。',
  outsideHint: 'チップを選んでベットエリアをクリック→SPIN。所持金がゼロになったら Reset で再開できます。',
  net: '損益',
  win: '勝ち',
  lose: '負け',
  push: '引分',
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
    'チップ額を選び、ベットエリアをクリックしてチップを重ね、SPIN を押します。インサイドは数字グリッド上、アウトサイド（赤黒・偶奇・ダズン・コラム等）はその周囲にあります。',
    'マーチン法タブとハウスエッジ検証タブは統計デモです: 期待値がマイナスの勝負に長期的に勝てるベットシステムは存在しません。',
  ],
  payoutTableTitle: '配当表（利益 : 賭金）',
  simIntroTitle: 'マーチンゲール法とは',
  simIntro: [
    '負けたら次のイーブンマネー賭金を2倍にする戦略。理論上、1回勝てば過去の負けを取り戻し、さらに1単位の利益が出る。',
    'ただし現実には (1) テーブル上限 と (2) 資金の有限性 によって連敗が続くと破産します。',
    '下で設定し「シミュレーション実行」を押すと、ヨーロピアンルーレット（緑0あり・期待値 −2.70%）で何回試したら破産するかを統計的に検証できます。',
  ],
  initialBankroll: '初期資金',
  baseBet: '初期賭金',
  tableMax: 'テーブル上限',
  maxSpins: '1ランの最大スピン',
  trialsLabel: 'モンテカルロ試行数',
  runSim: 'シミュレーション実行',
  running: '実行中',
  restoreDefaults: 'デフォルトに戻す',
  trialsNote: (max) => `試行数が多いと数秒かかります（最大 ${max}）。`,
  mcResult: (n) => `モンテカルロ結果 (${n.toLocaleString()} 試行)`,
  bustRate: '破産率',
  medianSpinsToBust: '破産までの中央値スピン',
  medianFinal: '最終資金 中央値',
  meanFinal: '最終資金 平均',
  tableMaxHitRate: 'テーブル上限到達率',
  meanFinalNote: (b) =>
    `「最終資金 平均」は理論的には負け（期待値 −2.70% × 賭けた総額）。初期資金 ${b} を下回るほど損しています。`,
  finalDist: '最終資金の分布',
  spinsAxis: 'スピン数',
  sampleRun: 'サンプル1ラン: 資金推移',
  outcomeBust: '💥 破産',
  outcomeCapped: (n) => `🛑 最大スピン (${n}) 到達`,
  outcomeSurvived: '✅ 生存',
  sampleMeta: (spins, final, maxBet) => `スピン数 ${spins} / 最終 ${final} / 最大賭金 ${maxBet}`,
  hitCapSuffix: ' / 上限到達あり',
  edgeTitle: 'ハウスエッジ収束',
  edgeIntro: [
    '選んだベットに毎スピン 1 単位を賭け続けます。序盤は経験的リターンが大きく揺れますが、大数の法則により理論値 −2.70% に近づきます — どのベットを選んでも同じです。',
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
