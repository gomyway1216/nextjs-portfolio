/**
 * Local ja/en strings for craps, consumed via useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { BetId, RollEvent } from './engine';
import type { TableError } from './medalTable';
import type { StrategyId } from './sim';

/**
 * The owner's note on what medals are, shown wherever the game shows the
 * player's medals. The same words go into the medal center's shared strings;
 * until they are there, they are written out here.
 */
export const NOT_MONEY_EN = 'Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.';
export const NOT_MONEY_JA = 'メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。';

export interface CrapsStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabOdds: string;
  tabSim: string;
  howToPlay: string;
  infoBody: string[];
  betName: Record<BetId, string>;
  // The medals
  centerLink: string;
  yourMedals: string;
  unit: string;
  /** What a roll brought back: the medals bet on what won, and what they won. */
  wonMedals: (medals: number) => string;
  onTable: string;
  net: string;
  /** The owner's note, shown wherever medals are played: they are not money. */
  notMoney: string;
  centerNote: string;
  cardAway: string;
  playHere: string;
  refill: (medals: number) => string;
  sayRefill: (medals: number) => string;
  sayReset: string;
  noticeTitle: string;
  noticeBody: string;
  noticeLink: string;
  noticeClose: string;
  // Play
  betSize: string;
  betSizeAria: (medals: number) => string;
  roll: string;
  rolling: string;
  undo: string;
  clear: string;
  repeat: string;
  takeDown: string;
  puckOn: string;
  puckOff: string;
  comeOut: string;
  pointIs: (n: number) => string;
  event: (event: RollEvent, total: number, point: number | null) => string;
  diceLabel: (a: number, b: number) => string;
  trayIdle: string;
  tableError: (e: TableError, max?: number) => string;
  stepped: (bet: string, step: number) => string;
  upTo: (bet: string, max: number) => string;
  betAria: (name: string, pays: string, amount: number, step: number) => string;
  stepTag: (step: number) => string;
  oddsMax: (max: number) => string;
  fieldNote: string;
  offOnComeOut: string;
  proposition: string;
  pays: (p: string) => string;
  rollResults: string;
  noBetsRoll: string;
  won: string;
  lost: string;
  push: string;
  stays: string;
  statsTitle: string;
  rolls: string;
  shooter: string;
  handRolls: string;
  longestHand: string;
  pointsMade: string;
  sevenOuts: string;
  recentRolls: string;
  none: string;
  hint: string[];
  // Odds
  oddsIntro: string;
  diceTitle: string;
  diceNote: string;
  ways: (n: number) => string;
  edgeTableTitle: string;
  colBet: string;
  colPays: string;
  colWin: string;
  colEdge: string;
  colRolls: string;
  trueOdds: string;
  edgeNote: string;
  wholeTitle: string;
  wholeIntro: string;
  colStep: string;
  stepCell: (step: number) => string;
  wholeRow: (kind: 'place' | 'passOdds' | 'dontPassOdds', a: number, b: number) => string;
  wholeNote: string;
  passTitle: string;
  passIntro: string;
  passNatural: string;
  passCraps: string;
  passPoint: (p: number) => string;
  passTotal: string;
  colChance: string;
  colMake: string;
  colContribution: string;
  oddsEffectTitle: string;
  oddsEffectIntro: string;
  colStrategy: string;
  colCombined: string;
  flatOnly: string;
  withOdds: (label: string) => string;
  dontWithLay: string;
  shooterTitle: string;
  shooterIntro: string;
  expectedRolls: string;
  survivalAxis: string;
  survivalLabel: (n: number) => string;
  recordNote: (oneIn: string) => string;
  // Simulation
  strategyName: Record<StrategyId, string>;
  simEdgeTitle: string;
  simEdgeIntro: string;
  rollsLabel: string;
  run: string;
  running: (pct: number) => string;
  colTheory: string;
  colObserved: (rolls: string) => string;
  simOwnMedals: string;
  simMedalsAxis: string;
  sessionTitle: string;
  sessionIntro: string;
  strategyLabel: string;
  bankrollLabel: string;
  rollsPerSession: string;
  sessionsLabel: string;
  bustRate: string;
  aheadRate: string;
  medianFinal: string;
  meanFinal: string;
  expectedFinal: string;
  expectedFinalNote: string;
  finalDist: string;
  sampleSession: string;
  handsTitle: string;
  handsIntro: string;
  handsLabel: string;
  simulatedShare: string;
  exactShare: string;
  handsResult: (hands: string, mean: string, exact: string, longest: number) => string;
}

const BET_EN: Record<BetId, string> = {
  pass: 'Pass Line',
  dontPass: "Don't Pass",
  passOdds: 'Pass odds',
  dontPassOdds: 'Lay odds',
  place4: 'Place 4',
  place5: 'Place 5',
  place6: 'Place 6',
  place8: 'Place 8',
  place9: 'Place 9',
  place10: 'Place 10',
  field: 'Field',
  any7: 'Any Seven',
  anyCraps: 'Any Craps',
  yo: 'Yo (11)',
  aces: 'Aces (2)',
  twelve: 'Twelve (12)',
  hard4: 'Hard 4',
  hard6: 'Hard 6',
  hard8: 'Hard 8',
  hard10: 'Hard 10',
};

const BET_JA: Record<BetId, string> = {
  pass: 'パスライン',
  dontPass: 'ドントパス',
  passOdds: 'パスのオッズ',
  dontPassOdds: 'レイオッズ',
  place4: 'プレイス 4',
  place5: 'プレイス 5',
  place6: 'プレイス 6',
  place8: 'プレイス 8',
  place9: 'プレイス 9',
  place10: 'プレイス 10',
  field: 'フィールド',
  any7: 'エニーセブン',
  anyCraps: 'エニークラップス',
  yo: 'ヨー（11）',
  aces: 'エーシーズ（2）',
  twelve: 'トゥエルブ（12）',
  hard4: 'ハード 4',
  hard6: 'ハード 6',
  hard8: 'ハード 8',
  hard10: 'ハード 10',
};

const EN: CrapsStrings = {
  title: 'Craps',
  subtitle:
    'Throw the dice at a full craps table with your medals from the Medal Game Center, then see the exact house edge of every bet — from 0% on the odds to 16.7% on Any Seven.',
  tabPlay: 'Play',
  tabOdds: 'Exact odds',
  tabSim: 'Simulation',
  howToPlay: 'How to play',
  infoBody: [
    'The first roll of a round is the come-out. Pass Line wins on 7 or 11 and loses on 2, 3 or 12; any other total becomes the point (the puck turns ON). The shooter then rolls until the point comes again (Pass wins) or a 7 shows (seven out — Pass loses).',
    "Don't Pass is the opposite, except a come-out 12 is a push. Once a point is on you can back your line bet with odds, which pay true odds — the only bet in the casino with no house edge (up to 3-4-5× here, lay up to 6×).",
    'Place bets and hardways work only while a point is on; place bets stay up after they win. Field and the center bets are one-roll bets. Pick a BET size, click a betting area, then ROLL.',
    'You play with your medals from the Medal Game Center, the same medals every game there uses. A bet takes its medals as you put it on; a win brings back the bet and what it won. A spot holds up to 50 medals, and every win is whole medals: Place 6 and 8 take medals in 6s, Place 4, 5, 9 and 10 in 5s, and the odds in the steps shown on them.',
    'Bets stay on the table when you leave or reload the page, as they would at a real table. Take down brings back every bet that may come down; a Pass Line bet stays until its point is decided.',
    NOT_MONEY_EN,
  ],
  betName: BET_EN,
  centerLink: 'Medal Game Center',
  yourMedals: 'YOUR MEDALS',
  unit: 'medals',
  wonMedals: (medals) => `Won ${medals} ${medals === 1 ? 'medal' : 'medals'}`,
  onTable: 'On the table',
  net: 'Net medals',
  notMoney: NOT_MONEY_EN,
  centerNote: 'These are your medals from the Medal Game Center, shared by every game there. They are reset only at the Medal Game Center.',
  cardAway: 'Your medals are being played on a machine in another tab. This table waits as it is, with your bets on it.',
  playHere: 'Play here',
  refill: (medals) => `Out of medals — take ${medals} more`,
  sayRefill: (medals) => `The attendant brought you ${medals} medals.`,
  sayReset: 'Your medals were reset at the Medal Game Center: the table has been cleared.',
  noticeTitle: 'Craps now plays with your medals',
  noticeBody:
    'This table uses the medals from the Medal Game Center, the same ones every game there plays with. The old 1,000 chips are retired: they are not turned into medals, which are counted on a different scale.',
  noticeLink: 'Go to the Medal Game Center',
  noticeClose: 'OK',
  betSize: 'BET',
  betSizeAria: (medals) => `BET ${medals} ${medals === 1 ? 'medal' : 'medals'}`,
  roll: 'ROLL',
  rolling: 'Rolling…',
  undo: 'Undo',
  clear: 'Clear',
  repeat: 'Repeat bets',
  takeDown: 'Take down',
  puckOn: 'ON',
  puckOff: 'OFF',
  comeOut: 'Coming out',
  pointIs: (n) => `The point is ${n}`,
  event: (event, total, point) => {
    switch (event) {
      case 'natural':
        return `${total} — winner on the come-out!`;
      case 'craps':
        return `${total} — craps!`;
      case 'pointSet':
        return `${total} — the point is ${total}`;
      case 'pointMade':
        return `${total} — point made! Winner!`;
      case 'sevenOut':
        return `7 — seven out. Line away.`;
      default:
        return `${total} — the point is still ${point}`;
    }
  },
  diceLabel: (a, b) => `Dice: ${a} and ${b}, total ${a + b}`,
  trayIdle: 'Craps table with two dice',
  tableError: (e, max) =>
    ({
      comeOutOnly: 'Line bets can only be made on the come-out roll.',
      needsPoint: 'Odds can be taken only after a point is set.',
      needsLineBet: 'Put a bet on the line first, then back it with odds.',
      oddsLimit: `That is over the odds limit (max ${max} medals).`,
      spotLimit: `A spot holds at most ${max} medals.`,
      step: 'That bet would not pay whole medals.',
      noMedals: 'Not enough medals for that bet.',
      notHere: 'The table is waiting for your medals.',
      notKept: 'This browser could not keep the table, so nothing was changed.',
      nothing: 'There is nothing to take back.',
    })[e],
  stepped: (bet, step) => `${bet} takes medals in ${step}s, so that every win is whole medals.`,
  upTo: (bet, max) => `${bet} is now at its limit of ${max} medals.`,
  betAria: (name, pays, amount, step) =>
    `${name} (${pays})${step > 1 ? `, in ${step}s` : ''}${amount > 0 ? ` — ${amount} ${amount === 1 ? 'medal' : 'medals'} on it` : ''}`,
  stepTag: (step) => `in ${step}s`,
  oddsMax: (max) => `max ${max}`,
  fieldNote: '2 pays double · 12 pays triple',
  offOnComeOut: 'Off on the come-out',
  proposition: 'One-roll & hardway bets',
  pays: (p) => `pays ${p}`,
  rollResults: 'This roll',
  noBetsRoll: 'No bets were decided.',
  won: 'won',
  lost: 'lost',
  push: 'push',
  stays: 'stays up',
  statsTitle: 'Table stats',
  rolls: 'Rolls',
  shooter: 'Shooter',
  handRolls: 'Rolls this hand',
  longestHand: 'Longest hand',
  pointsMade: 'Points made',
  sevenOuts: 'Seven-outs',
  recentRolls: 'Recent rolls',
  none: '(none yet)',
  hint: [
    'Line bets only on the come-out; odds only behind a line bet once the point is ON.',
    'A spot holds up to 50 medals; the odds go up to 3-4-5× the line bet (lay 6×). A spot marked “in 6s” or the like takes medals in those steps, so a press puts on the BET rounded up to the step.',
    'Place bets stay up until a 7. Undo and Clear take back only what you put on since the last roll; Take down takes back every bet that may come down.',
  ],
  oddsIntro:
    'Two dice give 36 equally likely combinations, so every probability here is an exact fraction. House edge is the average loss per medal bet, per decision (pushes count as decisions).',
  diceTitle: 'The 36 combinations',
  diceNote: '7 is the most common total (6 ways) — which is why it ends every point.',
  ways: (n) => `${n} ${n === 1 ? 'way' : 'ways'}`,
  edgeTableTitle: 'House edge of every bet',
  colBet: 'Bet',
  colPays: 'Pays',
  colWin: 'Win chance',
  colEdge: 'House edge',
  colRolls: 'Rolls per decision',
  trueOdds: 'true odds',
  edgeNote: 'Odds bets pay exactly what they are worth, so their edge is zero. The flashier the win in the center, the bigger the edge.',
  wholeTitle: 'Every win in whole medals',
  wholeIntro:
    'A medal cannot be cut, so a bet that pays a fraction takes medals only in amounts it pays in whole medals, as a dealer asks for 6 on the 6. These are the steps:',
  colStep: 'Medals at a time',
  stepCell: (step) => `${step}s`,
  wholeRow: (kind, a, b) =>
    kind === 'place' ? `Place ${a} and ${b}` : kind === 'passOdds' ? `Pass odds on ${a} and ${b}` : `Lay odds against ${a} and ${b}`,
  wholeNote:
    'Nothing is ever rounded, so every edge on this page is exactly the edge on the table. A table that rounds a win down instead (5 medals on the 6 winning 5, not 5⅚) would cost the player more than these figures say.',
  passTitle: 'Where 244 / 495 comes from',
  passIntro: 'Pass wins on a come-out 7 or 11, or by making the point before a 7:',
  passNatural: 'Come-out 7 or 11',
  passCraps: 'Come-out 2, 3, 12 (lose)',
  passPoint: (p) => `Point ${p}, then made`,
  passTotal: 'Pass wins',
  colChance: 'Chance',
  colMake: 'Makes it',
  colContribution: 'Contributes',
  oddsEffectTitle: 'Taking odds shrinks the edge',
  oddsEffectIntro:
    'The Pass line always costs 7/495 per flat bet, but odds add action at zero edge — so the edge on everything you bet falls as you take more odds.',
  colStrategy: 'Strategy',
  colCombined: 'Edge on total action',
  flatOnly: 'Pass line only',
  withOdds: (label) => `Pass + ${label} odds`,
  dontWithLay: "Don't Pass + 6× lay",
  shooterTitle: 'How long does a shooter last?',
  shooterIntro:
    'A hand ends only on a seven-out (a come-out 7 is a winner). From a Markov chain over the come-out and the six points:',
  expectedRolls: 'Expected rolls per hand',
  survivalAxis: 'rolls',
  survivalLabel: (n) => `Chance a hand lasts at least ${n} rolls`,
  recordNote: (oneIn) =>
    `In 2009 Patricia Demauro rolled 154 times before sevening out. The chance of a hand lasting that long is about 1 in ${oneIn}.`,
  strategyName: {
    passMaxOdds: 'Pass + 3-4-5× odds',
    dontPass: "Don't Pass",
    pass: 'Pass Line',
    place68: 'Place 6 & 8',
    field: 'Field',
    any7: 'Any Seven',
  },
  simEdgeTitle: 'Which bet costs the most?',
  simEdgeIntro:
    'Six players bet the same way on every roll of the same dice. Each line is the house edge they have actually lost on everything they bet; dashed lines are the exact values. Luck dominates early — the order only settles after tens of thousands of rolls.',
  rollsLabel: 'Number of rolls',
  run: 'Run',
  running: (pct) => `Running… ${pct}%`,
  colTheory: 'Exact edge',
  colObserved: (rolls) => `After ${rolls} rolls`,
  simOwnMedals: 'The simulations play with medals of their own: your medals are not touched.',
  simMedalsAxis: 'Medals at the end',
  sessionTitle: 'A night at the table',
  sessionIntro:
    'Many players sit down with the same number of medals and follow one strategy for a number of rolls (5-medal bets; Place 6 & 8 are 6 each). After the last roll an open line bet is played out and everything else is taken down. How many go home ahead?',
  strategyLabel: 'Strategy',
  bankrollLabel: 'Starting medals',
  rollsPerSession: 'Rolls per session',
  sessionsLabel: 'Players (sessions)',
  bustRate: 'Ran out (can’t make the next bet)',
  aheadRate: 'Finished ahead',
  medianFinal: 'Median medals at the end',
  meanFinal: 'Mean medals at the end',
  expectedFinal: 'Expected medals at the end',
  expectedFinalNote: 'Starting medals minus the exact expected loss of every bet actually made (each stake × its own edge).',
  finalDist: 'Distribution of medals at the end',
  sampleSession: 'One sample session',
  handsTitle: 'Shooter hands: simulation vs exact',
  handsIntro: 'Roll until each shooter sevens out and count how long every hand lasted. Bars are the simulation; the line is the exact Markov-chain answer.',
  handsLabel: 'Number of hands',
  simulatedShare: 'Simulated share of hands',
  exactShare: 'Exact probability',
  handsResult: (hands, mean, exact, longest) =>
    `${hands} hands averaged ${mean} rolls (exact ${exact}); the longest lasted ${longest} rolls.`,
};

const JA: CrapsStrings = {
  title: 'クラップス',
  subtitle:
    'メダルゲームセンターの持ちメダルで、本格的なクラップステーブルのサイコロを振れます。全ベットの正確なハウスエッジも確かめられます。オッズの 0% からエニーセブンの 16.7% まで。',
  tabPlay: '遊ぶ',
  tabOdds: '正確な確率',
  tabSim: 'シミュレーション',
  howToPlay: '遊び方',
  infoBody: [
    '1 ラウンドの最初の投げはカムアウト。パスラインは 7・11 で勝ち、2・3・12 で負け。それ以外の目は「ポイント」になり（パックが ON）、シューターはポイントがもう一度出る（パスの勝ち）か、7 が出る（セブンアウト・パスの負け）まで振り続けます。',
    'ドントパスはその逆ですが、カムアウトの 12 は引き分けです。ポイントが決まったらラインベットの後ろにオッズを付けられます。オッズは真の確率どおりの配当になる、カジノで唯一ハウスエッジ 0% の賭けです（ここでは 3-4-5 倍まで、レイは 6 倍まで）。',
    'プレイスベットとハードウェイはポイントが ON のときだけ有効で、プレイスは当たってもそのまま残ります。フィールドと中央のベットは 1 投ごとに決着します。ベット枚数を選んでエリアをクリックし、ROLL を押します。',
    'メダルゲームセンターの持ちメダルで遊びます。センターのどのゲームとも共通のメダルです。ベットを置くとその枚数が持ちメダルから減り、勝つとベットと配当の分が戻ります。1 か所に置けるのは 50 枚まで。配当はいつも整数枚です。プレイス 6・8 は 6 枚単位、プレイス 4・5・9・10 は 5 枚単位、オッズはエリアに書かれた単位でベットします。',
    'ページを閉じたり読み込み直したりしても、ベットは本物のテーブルと同じようにテーブルに残ります。「引き上げる」で、引き上げられるベットをすべて持ちメダルに戻せます。パスラインはポイントの決着までそのままです。',
    NOT_MONEY_JA,
  ],
  betName: BET_JA,
  centerLink: 'メダルゲームセンター',
  yourMedals: '持ちメダル',
  unit: '枚',
  wonMedals: (medals) => `${medals}枚獲得`,
  onTable: 'テーブル上',
  net: '差枚',
  notMoney: NOT_MONEY_JA,
  centerNote: 'メダルゲームセンターの持ちメダルで、センターのすべてのゲームで共通です。リセットはメダルゲームセンターでだけできます。',
  cardAway: 'メダルは別のタブのマシンで遊ばれています。このテーブルはベットをそのままにして待っています。',
  playHere: 'ここで遊ぶ',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  sayRefill: (medals) => `店員さんがメダルを${medals}枚持ってきました。`,
  sayReset: 'メダルゲームセンターでメダルがリセットされたので、テーブルを片付けました。',
  noticeTitle: 'クラップスは持ちメダルで遊ぶようになりました',
  noticeBody:
    'このテーブルでは、メダルゲームセンターの持ちメダルを使います。センターのどのゲームとも共通のメダルです。以前の 1,000 チップは廃止しました。数え方の違う別のものなので、メダルには替えていません。',
  noticeLink: 'メダルゲームセンターへ',
  noticeClose: 'OK',
  betSize: 'ベット',
  betSizeAria: (medals) => `${medals}枚ベット`,
  roll: 'ROLL',
  rolling: '投げています…',
  undo: '取り消し',
  clear: 'クリア',
  repeat: '前回と同じ賭け',
  takeDown: '引き上げる',
  puckOn: 'ON',
  puckOff: 'OFF',
  comeOut: 'カムアウト',
  pointIs: (n) => `ポイントは ${n}`,
  event: (event, total, point) => {
    switch (event) {
      case 'natural':
        return `${total} — カムアウトで勝ち！`;
      case 'craps':
        return `${total} — クラップス！`;
      case 'pointSet':
        return `${total} — ポイントは ${total}`;
      case 'pointMade':
        return `${total} — ポイント成立！勝ち！`;
      case 'sevenOut':
        return `7 — セブンアウト`;
      default:
        return `${total} — ポイントは ${point} のまま`;
    }
  },
  diceLabel: (a, b) => `サイコロ: ${a} と ${b}、合計 ${a + b}`,
  trayIdle: '2 個のサイコロがあるクラップステーブル',
  tableError: (e, max) =>
    ({
      comeOutOnly: 'ラインベットはカムアウトのときだけ置けます。',
      needsPoint: 'オッズはポイントが決まってから付けられます。',
      needsLineBet: '先にラインにベットしてから、その後ろにオッズを付けます。',
      oddsLimit: `オッズの上限を超えています（最大${max}枚）。`,
      spotLimit: `1 か所に置けるのは${max}枚までです。`,
      step: 'そのベットでは配当が整数枚になりません。',
      noMedals: '持ちメダルが足りません。',
      notHere: 'テーブルは持ちメダルの準備を待っています。',
      notKept: 'このブラウザにテーブルを保存できなかったため、何も変えていません。',
      nothing: '戻せるベットはありません。',
    })[e],
  stepped: (bet, step) => `${bet}は${step}枚単位でベットします（配当を整数枚にするため）。`,
  upTo: (bet, max) => `${bet}は上限の${max}枚になりました。`,
  betAria: (name, pays, amount, step) => `${name}（${pays}）${step > 1 ? `・${step}枚単位` : ''}${amount > 0 ? ` — ${amount}枚ベット中` : ''}`,
  stepTag: (step) => `${step}枚単位`,
  oddsMax: (max) => `最大 ${max}`,
  fieldNote: '2 は 2 倍・12 は 3 倍',
  offOnComeOut: 'カムアウト中は無効',
  proposition: '1 投ベットとハードウェイ',
  pays: (p) => `配当 ${p}`,
  rollResults: '今回の結果',
  noBetsRoll: '決着したベットはありません。',
  won: '勝ち',
  lost: '負け',
  push: '引分',
  stays: '継続',
  statsTitle: 'テーブルの記録',
  rolls: '投げた回数',
  shooter: 'シューター',
  handRolls: 'この手番の投数',
  longestHand: '最長の手番',
  pointsMade: 'ポイント成立',
  sevenOuts: 'セブンアウト',
  recentRolls: '最近の出目',
  none: '（まだなし）',
  hint: [
    'ラインベットはカムアウトのときだけ、オッズはポイント ON 後にラインベットの後ろにだけ置けます。',
    '1 か所に置けるのは 50 枚まで、オッズはラインベットの 3-4-5 倍まで（レイは 6 倍）です。「6枚単位」などと書かれたエリアはその単位でベットするので、1 回のクリックでベット枚数をその単位に切り上げて置きます。',
    'プレイスベットは 7 が出るまで残ります。取り消し / クリアで戻せるのは前回の投げ以降に置いたメダルだけです。「引き上げる」では、引き上げられるベットをすべて戻せます。',
  ],
  oddsIntro:
    '2 個のサイコロの組み合わせは 36 通りで、すべて同じ確率です。そのためここの確率はすべて厳密な分数です。ハウスエッジは 1 回の決着あたり・賭けたメダル 1 枚あたりの平均損失です（引き分けも決着として数えます）。',
  diceTitle: '36 通りの組み合わせ',
  diceNote: '7 が一番出やすい合計（6 通り）です。だからこそ、どのポイントも 7 で終わります。',
  ways: (n) => `${n} 通り`,
  edgeTableTitle: '全ベットのハウスエッジ',
  colBet: 'ベット',
  colPays: '配当',
  colWin: '勝つ確率',
  colEdge: 'ハウスエッジ',
  colRolls: '決着までの平均投数',
  trueOdds: '真の確率',
  edgeNote: 'オッズは価値どおりの配当なのでエッジは 0 です。中央の派手な配当ほどエッジは大きくなります。',
  wholeTitle: '配当はいつも整数枚',
  wholeIntro: 'メダルは割れないので、端数の出る配当のベットは、配当が整数枚になる単位でだけ置けます。ディーラーが「6 には 6 枚で」と頼むのと同じです。単位は次のとおりです:',
  colStep: '1 回の単位',
  stepCell: (step) => `${step}枚`,
  wholeRow: (kind, a, b) =>
    kind === 'place' ? `プレイス ${a}・${b}` : kind === 'passOdds' ? `パスのオッズ（ポイント ${a}・${b}）` : `レイオッズ（ポイント ${a}・${b}）`,
  wholeNote:
    '端数を切り捨てることは一切ないので、このページのエッジはすべてテーブルのエッジそのものです。単位に合わない額を受けて配当を切り捨てるテーブル（6 に 5 枚で、当たりが 5⅚ 枚ではなく 5 枚）なら、プレイヤーの損はこの数字より大きくなります。',
  passTitle: '244 / 495 の内訳',
  passIntro: 'パスはカムアウトの 7・11、または 7 より先にポイントを出すと勝ちます:',
  passNatural: 'カムアウトで 7・11',
  passCraps: 'カムアウトで 2・3・12（負け）',
  passPoint: (p) => `ポイント ${p} → 成立`,
  passTotal: 'パスの勝ち',
  colChance: '確率',
  colMake: '成立する確率',
  colContribution: '寄与',
  oddsEffectTitle: 'オッズを付けるほどエッジは小さくなる',
  oddsEffectIntro:
    'パスラインは 1 回あたり 7/495 のエッジが必ずかかりますが、オッズはエッジ 0 で賭けるメダルだけを増やします。そのため賭けたメダル全体に対するエッジは、オッズを増やすほど下がります。',
  colStrategy: '賭け方',
  colCombined: '賭けたメダル全体へのエッジ',
  flatOnly: 'パスラインのみ',
  withOdds: (label) => `パス + ${label} オッズ`,
  dontWithLay: 'ドントパス + 6 倍レイ',
  shooterTitle: 'シューターは何回投げ続けられる？',
  shooterIntro:
    '手番はセブンアウトでしか終わりません（カムアウトの 7 は勝ち）。カムアウトと 6 つのポイントからなるマルコフ連鎖で計算すると:',
  expectedRolls: '1 手番の平均投数',
  survivalAxis: '投',
  survivalLabel: (n) => `手番が ${n} 投以上続く確率`,
  recordNote: (oneIn) =>
    `2009 年、パトリシア・デマウロはセブンアウトまで 154 回投げ続けました。手番がそこまで続く確率は約 ${oneIn} 分の 1 です。`,
  strategyName: {
    passMaxOdds: 'パス + 3-4-5 倍オッズ',
    dontPass: 'ドントパス',
    pass: 'パスライン',
    place68: 'プレイス 6・8',
    field: 'フィールド',
    any7: 'エニーセブン',
  },
  simEdgeTitle: 'どの賭け方が一番損をする？',
  simEdgeIntro:
    '6 人のプレイヤーが同じサイコロの出目に、それぞれ決まった賭け方を続けます。各線は賭けたメダル全体に対して実際にかかったハウスエッジ、破線は厳密値です。序盤は運に左右され、順位が落ち着くのは数万投を超えてからです。',
  rollsLabel: '投げる回数',
  run: '実行',
  running: (pct) => `実行中… ${pct}%`,
  colTheory: '厳密なエッジ',
  colObserved: (rolls) => `${rolls} 投後`,
  simOwnMedals: 'シミュレーションは専用のメダルで行うので、持ちメダルは減りも増えもしません。',
  simMedalsAxis: '最後のメダル',
  sessionTitle: 'テーブルでの一晩',
  sessionIntro:
    '大勢のプレイヤーが同じ枚数のメダルで座り、1 つの賭け方で決まった回数だけ遊びます（1 回 5 枚、プレイス 6・8 は各 6 枚）。最後の投げの後、残ったラインベットは決着まで続け、それ以外は引き上げます。勝って帰れるのは何人？',
  strategyLabel: '賭け方',
  bankrollLabel: '最初の持ちメダル',
  rollsPerSession: '1 セッションの投数',
  sessionsLabel: 'プレイヤー数（セッション）',
  bustRate: 'メダル切れ（次のベットができない）',
  aheadRate: '勝って終わった',
  medianFinal: '最後のメダル 中央値',
  meanFinal: '最後のメダル 平均',
  expectedFinal: '最後のメダル 期待値',
  expectedFinalNote: '最初の持ちメダルから、実際に賭けた各ベットの枚数 × そのベット固有の厳密なエッジの合計を引いた値。',
  finalDist: '最後のメダルの分布',
  sampleSession: 'サンプル 1 セッション',
  handsTitle: 'シューターの手番: シミュレーション vs 厳密値',
  handsIntro: '各シューターがセブンアウトするまで振り、手番が何投続いたかを数えます。棒がシミュレーション、線がマルコフ連鎖による厳密値です。',
  handsLabel: '手番の数',
  simulatedShare: 'シミュレーションの割合',
  exactShare: '厳密な確率',
  handsResult: (hands, mean, exact, longest) =>
    `${hands} 手番の平均は ${mean} 投（厳密値 ${exact}）、最長は ${longest} 投でした。`,
};

export function getStrings(lang: GameLanguage): CrapsStrings {
  return lang === 'ja' ? JA : EN;
}
