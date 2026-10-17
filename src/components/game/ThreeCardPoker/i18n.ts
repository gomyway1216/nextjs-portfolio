/**
 * Local ja/en strings for Three Card Poker, consumed via useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Category, Decision, LineId, Outcome, PairPlusTableId, Showdown, StrategyId } from './engine';

export interface ThreeCardPokerStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabOdds: string;
  tabSim: string;
  howToPlay: string;
  infoBody: string[];
  category: Record<Category, string>;
  lineName: Record<LineId, string>;
  strategyName: Record<StrategyId, string>;
  decisionName: Record<Decision, string>;
  // Table
  /** The medals the player has, on the counter. */
  medals: string;
  medalsUnit: string;
  /** Said of the counter while the medals are still being read. */
  medalsWaiting: string;
  /** Where the medals come from, around the link to the Medal Game Center: the words before it and after it. */
  medalsFrom: readonly [string, string];
  centerLink: string;
  onTable: string;
  net: string;
  /** The counter's amber windows: the bet on the felt, and what the last hand gave back. */
  betLed: string;
  winLed: string;
  step: string;
  stepAria: (medals: number) => string;
  deal: string;
  dealing: string;
  undo: string;
  clear: string;
  rebet: string;
  /** The table's keys, on a desktop. */
  keysHint: string;
  play: string;
  fold: string;
  dealer: string;
  you: string;
  holeCard: string;
  /** "Q-high", "Pair of 8s", "Straight" … from the category and the rank that leads it. */
  handName: (category: Category, top: string) => string;
  qualifies: string;
  notQualifies: string;
  antePays: string;
  pairPlusPays: string;
  playPays: string;
  spotAria: (name: string, pays: string) => string;
  feltQualify: string;
  feltBonus: string;
  noFunds: string;
  spotFull: (most: number) => string;
  needAnte: string;
  needPlayFunds: (ante: number) => string;
  playShort: string;
  /** This browser would not save the hand, so the step was not taken and no medal moved. */
  notKept: string;
  handBusy: string;
  resumed: string;
  placeBets: string;
  yourMove: string;
  revealing: string;
  /** What a hand came to, `net` being the medals it won less those it cost. */
  result: (showdown: Showdown, net: number) => string;
  // The medals: the card in another tab, the refill, the reset, and the notice that the table plays with medals now
  cardAway: string;
  playHere: string;
  refill: (medals: number) => string;
  sayRefill: (medals: number) => string;
  sayCenterReset: string;
  noticeTitle: string;
  noticeBody: string;
  noticeLink: string;
  noticeOk: string;
  handResults: string;
  handTotal: string;
  outcome: Record<Outcome, string>;
  hintToggle: string;
  hintSays: (decision: Decision) => string;
  evTitle: string;
  evNote: string;
  evAgainst: (dealerHands: string) => string;
  evNotQualified: string;
  evWin: string;
  evTie: string;
  evLose: string;
  statsTitle: string;
  observedVsExact: string;
  hands: string;
  played: string;
  dealerQualified: string;
  winsPushesLosses: string;
  agreement: string;
  hint: string[];
  // Odds
  oddsIntro: (hands: string, dealerHands: string, total: string) => string;
  /** The Ante & Play edge and Pair Plus's, in medals at the table's limit on each spot. */
  medalsNote: (most: number, wager: string, loss: string, pairPlusLoss: string) => string;
  handsTitle: string;
  payTableLabel: string;
  payTableName: Record<PairPlusTableId, string>;
  colHand: string;
  colWays: string;
  colProbability: string;
  colPays: string;
  colReturn: string;
  loses: string;
  total: string;
  handsNote: string;
  statPairPlusEdge: (table: string) => string;
  statPairPlusWin: string;
  anteTitle: string;
  anteIntro: (total: string) => string;
  statEdge: string;
  statRisk: string;
  statQualify: string;
  statPlayRate: string;
  statWager: string;
  statCombinations: string;
  colOutcome: string;
  colNet: string;
  colCombinations: string;
  outcomeName: Record<Showdown, string>;
  anteBonusRow: string;
  anteNote: (edge: string, wager: string, risk: string) => string;
  thresholdTitle: string;
  thresholdIntro: string;
  curveAria: string;
  curveFold: string;
  curveAxis: string;
  colEvPlay: string;
  colVsFold: string;
  colDealerOut: string;
  colYouWin: string;
  colBest: string;
  thresholdNote: (worstPlay: string, bestFold: string) => string;
  bonusTitle: string;
  bonusIntro: string;
  bonusNote: (total: string, without: string) => string;
  strategyTitle: string;
  strategyIntro: string;
  colStrategy: string;
  colHouseEdge: string;
  colRisk: string;
  colPlayed: string;
  colWager: string;
  strategyNote: (mimicExtra: string, alwaysExtra: string, hopeless: string) => string;
  // Simulation
  run: string;
  running: (pct: number) => string;
  handsLabel: string;
  simTitle: string;
  simIntro: string;
  colExact: string;
  colSimulated: (hands: string) => string;
  simNote: (qualified: string, exact: string, gap: string) => string;
}

const en: ThreeCardPokerStrings = {
  title: 'Three Card Poker',
  subtitle:
    'Three cards against the dealer. Ante, look at your hand, then play or fold — with the exact value of both choices for the hand in front of you, and every house edge counted out rather than simulated.',
  tabPlay: 'Table',
  tabOdds: 'Odds',
  tabSim: 'Simulation',
  howToPlay: 'How to play',
  infoBody: [
    'One 52-card deck, shuffled before every hand. Bet medals on the Ante (required, 1 to 10) and, if you like, on the Pair Plus side bet (up to 10), then press DEAL: those medals come out of your medals as the cards are dealt. You and the dealer get three cards each; the dealer’s stay face down.',
    'Three-card hands rank, best first: straight flush, three of a kind, straight, flush, pair, high card. A straight beats a flush here because it is harder to make with three cards. A-2-3 is the lowest straight and Q-K-A the highest. Hands of the same kind are split by their ranks — pairs by the pair first, then the kicker.',
    'After seeing your cards, either PLAY — a Play bet equal to your Ante, which comes out of your medals then — or FOLD, which forfeits the Ante and the Pair Plus bet.',
    'The dealer needs Queen-high or better to qualify. If the dealer doesn’t qualify, the Ante pays 1:1 and the Play bet pushes. If the dealer qualifies, the higher hand wins: when you win, the Ante and the Play bet both pay 1:1; when the dealer wins, both lose; a tie pushes both.',
    'Ante Bonus: whenever you play, a straight pays 1:1 on the Ante, three of a kind 4:1 and a straight flush 5:1 — whatever the dealer holds, even if you lose the hand.',
    'Pair Plus is paid on your own three cards, whatever the dealer holds: pair 1:1, flush 3:1, straight 6:1, three of a kind 30:1, straight flush 40:1.',
    'The best strategy fits in one line: play Q-6-4 or better, fold anything worse.',
    'You play with your medals from the Medal Game Center, the same medals every game there uses. What a hand wins goes back into them as the dealer’s cards are turned over, and every win is a whole number of medals. A hand left half-played is kept: come back, even after a reload, and it carries on where it was.',
  ],
  category: {
    highCard: 'High card',
    pair: 'Pair',
    flush: 'Flush',
    straight: 'Straight',
    threeOfAKind: 'Three of a kind',
    straightFlush: 'Straight flush',
  },
  lineName: { ante: 'Ante', play: 'Play', anteBonus: 'Ante Bonus', pairPlus: 'Pair Plus' },
  strategyName: {
    optimal: 'Optimal: play Q-6-4 or better',
    mimic: 'Play like the dealer: Queen-high or better',
    always: 'Always play',
  },
  decisionName: { play: 'Play', fold: 'Fold' },
  medals: 'Your medals',
  medalsUnit: 'medals',
  medalsWaiting: 'Looking for your medals…',
  medalsFrom: ['The same medals play every game at the ', ', where the daily bonus and the one reset are.'],
  centerLink: 'Medal Game Center',
  onTable: 'On table',
  net: 'This session',
  betLed: 'BET',
  winLed: 'WIN',
  step: 'Bet per press',
  stepAria: (medals) => `Bet ${medals} ${medals === 1 ? 'medal' : 'medals'} per press`,
  deal: 'DEAL',
  dealing: 'Dealing…',
  undo: 'Undo',
  clear: 'Clear',
  rebet: 'Rebet',
  keysHint: 'Keys: Space or Enter deals · A ante · P play · F fold · R rebet · U undo',
  play: 'PLAY',
  fold: 'FOLD',
  dealer: 'Dealer',
  you: 'You',
  holeCard: 'Face-down card',
  handName: (category, top) =>
    category === 'highCard'
      ? `${top}-high`
      : category === 'pair'
        ? `Pair of ${top}s`
        : en.category[category],
  qualifies: 'qualifies',
  notQualifies: 'doesn’t qualify',
  antePays: '1:1',
  pairPlusPays: 'up to 40:1',
  playPays: '= Ante',
  spotAria: (name, pays) => `${name} (${pays})`,
  feltQualify: 'Dealer plays with Queen-high or better',
  feltBonus: 'Ante Bonus · Straight 1 · Three of a kind 4 · Straight flush 5',
  noFunds: 'Not enough medals for that bet.',
  spotFull: (most) => `Up to ${most} medals on each spot.`,
  needAnte: 'Bet at least 1 medal on the Ante first.',
  needPlayFunds: (ante) => `Keep ${ante} ${ante === 1 ? 'medal' : 'medals'} for the Play bet — lower the Ante or the Pair Plus bet.`,
  playShort: 'Not enough medals left for the Play bet: you can fold this hand.',
  notKept: 'This browser would not save the hand, so no medals moved. Free some space in the browser and try again.',
  handBusy: 'There is a hand on the table already.',
  resumed: 'Your hand was kept as it was: play or fold.',
  placeBets: 'Place your Ante, then deal.',
  yourMove: 'Play or fold?',
  revealing: 'The dealer turns over…',
  result: (showdown, net) => {
    const medals = (n: number) => `${n} ${n === 1 ? 'medal' : 'medals'}`;
    const came = net > 0 ? `won ${medals(net)}` : net < 0 ? `lost ${medals(-net)}` : 'no medals won or lost';
    switch (showdown) {
      case 'fold':
        return `You folded · ${came}`;
      case 'notQualified':
        return `Dealer doesn’t qualify — Ante pays, Play pushes · ${came}`;
      case 'win':
        return `You beat the dealer · ${came}`;
      case 'lose':
        return `The dealer wins · ${came}`;
      case 'tie':
        return `Tie — Ante and Play push · ${came}`;
    }
  },
  cardAway: 'Your medals are being played in another tab. This table waits as it is.',
  playHere: 'Play here',
  refill: (medals) => `Out of medals — take ${medals} more`,
  sayRefill: (medals) => `${medals} medals are yours to play.`,
  sayCenterReset: 'The medals have been reset at the Medal Game Center: this table starts over.',
  noticeTitle: 'This table plays with medals now',
  noticeBody:
    'Three Card Poker now plays with your medals from the Medal Game Center, the same medals every game there uses. The 1,000 practice chips this table used to start you with are retired: they were a different thing on a different scale, so they are not turned into medals.',
  noticeLink: 'Open the Medal Game Center',
  noticeOk: 'Got it',
  handResults: 'This hand, in medals',
  handTotal: 'Total',
  outcome: { win: 'won', lose: 'lost', push: 'push' },
  hintToggle: 'Show the strategy hint',
  hintSays: (decision) => `Strategy: play Q-6-4 or better → ${decision === 'play' ? 'play' : 'fold'} this hand`,
  evTitle: 'This hand — exact value of the Ante & Play bets',
  evNote:
    'In antes, for the Ante and Play bets with the Ante Bonus. Pair Plus is not included: it is paid on your own cards whatever you decide here, except that a fold gives it up. Folding always costs exactly one ante; playing is right whenever it loses less than that.',
  evAgainst: (dealerHands) => `Against the ${dealerHands} hands the dealer can hold:`,
  evNotQualified: 'Dealer doesn’t qualify',
  evWin: 'You win',
  evTie: 'Tie',
  evLose: 'Dealer wins',
  statsTitle: 'This session',
  observedVsExact: 'observed · exact',
  hands: 'Hands',
  played: 'Played',
  dealerQualified: 'Dealer qualified',
  winsPushesLosses: 'Won / even / lost',
  agreement: 'Agreed with the strategy',
  hint: [
    'Play Q-6-4 or better, fold anything worse — that one rule is the whole optimal strategy.',
    'Folding costs exactly the Ante. Playing a weak hand risks two antes, but it still wins one whenever the dealer fails to qualify — about three hands in ten.',
    'Pair Plus is a separate bet on your own cards. At 1-3-6-30-40 it costs 7.28 of every 100 medals bet on it, more than twice the main game.',
  ],
  oddsIntro: (hands, dealerHands, total) =>
    `Three Card Poker is small enough to count completely: there are ${hands} three-card hands, and for each one the dealer can hold any of ${dealerHands} hands from the other 49 cards — ${total} combinations. Every number on this tab comes from playing all of them. Nothing is simulated.`,
  medalsNote: (most, wager, loss, pairPlusLoss) =>
    `In medals, at the table’s limit of ${most} on each spot: with the best strategy a hand puts ${wager} medals on the Ante and Play bets on average and loses ${loss} of them, and ${most} medals on Pair Plus lose another ${pairPlusLoss} a hand. Every bet is a whole number of medals and every win a whole multiple of it, so nothing is ever rounded.`,
  handsTitle: 'Every three-card hand, and what Pair Plus pays',
  payTableLabel: 'Pair Plus pay table',
  payTableName: { standard: '1-3-6-30-40 (common)', old: '1-4-6-30-40 (original)' },
  colHand: 'Hand',
  colWays: 'Ways',
  colProbability: 'Probability',
  colPays: 'Pays',
  colReturn: 'Return',
  loses: 'loses',
  total: 'Total',
  handsNote:
    'With three cards a straight (720 ways) is rarer than a flush (1,096 ways), so it ranks higher — the reverse of five-card poker. “Return” is probability × what the hand pays: the rows add up to what the side bet gives back per medal bet, and what is missing is the house edge. Cutting the flush from 4:1 to 3:1 more than triples it.',
  statPairPlusEdge: (table) => `House edge at ${table}`,
  statPairPlusWin: 'Hands that are paid',
  anteTitle: 'Ante & Play',
  anteIntro: (total) =>
    `With the best strategy — play Q-6-4 or better — each of the ${total} combinations ends in one of five ways. The Ante Bonus is paid on top whenever you hold a straight or better.`,
  statEdge: 'House edge (per Ante)',
  statRisk: 'Element of risk',
  statQualify: 'Dealer qualifies',
  statPlayRate: 'Hands you play',
  statWager: 'Average wager (antes)',
  statCombinations: 'Combinations counted',
  colOutcome: 'Outcome',
  colNet: 'Net (antes)',
  colCombinations: 'Combinations',
  outcomeName: {
    fold: 'You fold',
    notQualified: 'You play, the dealer doesn’t qualify',
    win: 'You play and beat the dealer',
    tie: 'You play and tie',
    lose: 'You play and the dealer wins',
  },
  anteBonusRow: 'Ante Bonus (on top)',
  anteNote: (edge, wager, risk) =>
    `The house edge is quoted against the Ante: you lose ${edge} of it per hand. But two hands in three you put a second, equal bet on the table, so the average wager is ${wager} antes — per unit actually risked (the “element of risk”) the game costs ${risk}.`,
  thresholdTitle: 'Why Q-6-4 is the cut-off',
  thresholdIntro:
    'Folding always costs one ante. Playing puts a second ante at risk: you win one when the dealer fails to qualify, and win or lose two at a showdown. A hand is worth playing as soon as that averages better than −1. The curve shows the value of playing every unsuited high-card hand, weakest to strongest: flat while the hand can’t beat any qualifying dealer, then climbing through the fold line between Q-6-3 and Q-6-4.',
  curveAria: 'Expected value of playing each high-card hand, crossing the fold line of −1 at Q-6-4',
  curveFold: 'Fold: −1',
  curveAxis: 'High-card hands by top card, weakest to strongest',
  colEvPlay: 'EV of playing',
  colVsFold: 'vs folding',
  colDealerOut: 'Dealer doesn’t qualify',
  colYouWin: 'You win',
  colBest: 'Best',
  thresholdNote: (worstPlay, bestFold) =>
    `Each row averages the 60 suit combinations of those ranks. Which exact cards you hold changes what the dealer can have, but only in the third decimal: the worst Q-6-4 is still worth ${worstPlay} and the best Q-6-3 only ${bestFold}.`,
  bonusTitle: 'What the Ante Bonus is worth',
  bonusIntro:
    'The bonus is paid on the Ante for a straight or better, win or lose. Those hands are never folded, so its value is simply how often they come up times what they pay.',
  bonusNote: (total, without) => `Together the bonus returns ${total} of every Ante. Without it the house edge would be ${without}.`,
  strategyTitle: 'Strategies compared',
  strategyIntro: 'The same count prices any rule for playing or folding.',
  colStrategy: 'Strategy',
  colHouseEdge: 'House edge',
  colRisk: 'Element of risk',
  colPlayed: 'Hands played',
  colWager: 'Average wager',
  strategyNote: (mimicExtra, alwaysExtra, hopeless) =>
    `Playing like the dealer only goes wrong on the ${mimicExtra} Queen-high hands weaker than Q-6-4, and each of those mistakes is tiny, so it costs less than a tenth of a point. Never folding plays ${alwaysExtra} hands the best strategy folds — ${hopeless} of them can’t beat any dealer who qualifies — and more than doubles the edge.`,
  run: 'Run',
  running: (pct) => `Running… ${pct}%`,
  handsLabel: 'Hands',
  simTitle: 'Three strategies on the same cards',
  simIntro:
    'Shuffles a fresh deck for every hand, deals three cards each and lets all three strategies play that same deal through the table’s own rules, one Ante a hand. The dashed lines are the exact edges from the Odds tab.',
  colExact: 'Exact',
  colSimulated: (hands) => `Simulated (${hands} hands)`,
  simNote: (qualified, exact, gap) =>
    `The ± is a 95% range. The dealer qualified on ${qualified} of these hands (exact: ${exact}). The best strategy and playing like the dealer make the same decision on all but about 2% of hands, so their lines move together, and the ${gap} points between them are far smaller than the ± — it takes the full count to separate them.`,
};

const ja: ThreeCardPokerStrings = {
  title: 'スリーカードポーカー',
  subtitle:
    '3枚のカードでディーラーと勝負。アンティを置いて手札を見てから、プレイかフォールドかを選びます。目の前の手札でどちらが得かを正確な数字で確認でき、ハウスエッジはすべてシミュレーションではなく数え上げで求めています。',
  tabPlay: 'テーブル',
  tabOdds: '確率',
  tabSim: 'シミュレーション',
  howToPlay: '遊び方',
  infoBody: [
    '52枚のデッキ1組を毎回シャッフルします。アンティ（必須、1〜10枚）と、お好みでペアプラス（10枚まで）にメダルをベットして「ディール」を押してください。ベットしたメダルは、カードが配られるときに持ちメダルから出ます。あなたとディーラーに3枚ずつ配られ、ディーラーのカードは伏せたままです。',
    '3枚の役は強い順に、ストレートフラッシュ、スリーカード、ストレート、フラッシュ、ペア、ハイカード。3枚ではストレートの方が作りにくいので、フラッシュより上です。A-2-3が一番弱いストレート、Q-K-Aが一番強いストレート。同じ役どうしはランクで決め、ペアはまずペアのランク、次に残り1枚（キッカー）で比べます。',
    '手札を見たら「プレイ」（アンティと同額のプレイベットを追加。そのとき持ちメダルから出ます）か「フォールド」（アンティとペアプラスを没収）を選びます。',
    'ディーラーはクイーンハイ以上でクオリファイ（勝負成立）します。クオリファイしなければ、アンティは1:1で配当、プレイは引き分け。クオリファイしたら強い方の勝ちで、あなたが勝てばアンティもプレイも1:1、ディーラーが勝てば両方負け、同じ強さなら両方引き分けです。',
    'アンティボーナス：プレイしたときは、ストレートで1:1、スリーカードで4:1、ストレートフラッシュで5:1がアンティに対して支払われます。ディーラーの手に関係なく、勝負に負けても受け取れます。',
    'ペアプラスはディーラーに関係なく自分の3枚だけで決まります。ペア1:1、フラッシュ3:1、ストレート6:1、スリーカード30:1、ストレートフラッシュ40:1。',
    '最適戦略は1行です。Q-6-4以上ならプレイ、それ未満はフォールド。',
    'メダルゲームセンターの持ちメダルで遊びます。センターのどのゲームとも同じメダルです。勝った分はディーラーのカードが開くときに持ちメダルに戻り、配当はいつも整数の枚数です。途中のハンドは残るので、ページを読み込み直しても続きから遊べます。',
  ],
  category: {
    highCard: 'ハイカード',
    pair: 'ペア',
    flush: 'フラッシュ',
    straight: 'ストレート',
    threeOfAKind: 'スリーカード',
    straightFlush: 'ストレートフラッシュ',
  },
  lineName: { ante: 'アンティ', play: 'プレイ', anteBonus: 'アンティボーナス', pairPlus: 'ペアプラス' },
  strategyName: {
    optimal: '最適戦略：Q-6-4以上でプレイ',
    mimic: 'ディーラーと同じ：クイーンハイ以上でプレイ',
    always: '常にプレイ',
  },
  decisionName: { play: 'プレイ', fold: 'フォールド' },
  medals: '持ちメダル',
  medalsUnit: '枚',
  medalsWaiting: '持ちメダルを確認しています…',
  medalsFrom: ['', 'のどのゲームとも共通のメダルです。デイリーボーナスとリセットはセンターにあります。'],
  centerLink: 'メダルゲームセンター',
  onTable: 'ベット中',
  net: '今回の増減',
  betLed: 'ベット',
  winLed: '獲得',
  step: '1回のベット',
  stepAria: (medals) => `1回${medals}枚ベット`,
  deal: 'ディール',
  dealing: 'ディール中…',
  undo: '取り消し',
  clear: 'クリア',
  rebet: '同じベット',
  keysHint: 'キー：Space か Enter でディール・A でアンティ・P でプレイ・F でフォールド・R で同じベット・U で取り消し',
  play: 'プレイ',
  fold: 'フォールド',
  dealer: 'ディーラー',
  you: 'あなた',
  holeCard: '伏せたカード',
  handName: (category, top) =>
    category === 'highCard' ? `${top}ハイ` : category === 'pair' ? `${top}のペア` : ja.category[category],
  qualifies: 'クオリファイ',
  notQualifies: 'クオリファイせず',
  antePays: '1:1',
  pairPlusPays: '最大40:1',
  playPays: 'アンティと同額',
  spotAria: (name, pays) => `${name}（${pays}）`,
  feltQualify: 'ディーラーはクイーンハイ以上で勝負',
  feltBonus: 'アンティボーナス・ストレート1・スリーカード4・ストレートフラッシュ5',
  noFunds: '持ちメダルが足りません。',
  spotFull: (most) => `1つのスポットに置けるのは${most}枚までです。`,
  needAnte: 'まずアンティに1枚以上ベットしてください。',
  needPlayFunds: (ante) => `プレイベット用に${ante}枚残してください。アンティかペアプラスを減らしましょう。`,
  playShort: 'プレイベットに足りるメダルがありません。このハンドはフォールドできます。',
  notKept: 'このブラウザにハンドを保存できなかったため、メダルは動いていません。ブラウザの空き容量を確保してから、もう一度お試しください。',
  handBusy: 'テーブルにはまだ途中のハンドがあります。',
  resumed: '途中のハンドをそのまま残してあります。プレイかフォールドを選んでください。',
  placeBets: 'アンティを置いてディールしてください。',
  yourMove: 'プレイ？フォールド？',
  revealing: 'ディーラーがカードを開きます…',
  result: (showdown, net) => {
    const came = net > 0 ? `${net}枚獲得` : net < 0 ? `${-net}枚の負け` : '増減なし';
    switch (showdown) {
      case 'fold':
        return `フォールド・${came}`;
      case 'notQualified':
        return `ディーラーはクオリファイせず — アンティは配当、プレイは引き分け・${came}`;
      case 'win':
        return `あなたの勝ち・${came}`;
      case 'lose':
        return `ディーラーの勝ち・${came}`;
      case 'tie':
        return `同じ強さ — アンティもプレイも引き分け・${came}`;
    }
  },
  cardAway: 'メダルは別のタブで遊ばれています。このテーブルはそのまま待っています。',
  playHere: 'ここで遊ぶ',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  sayRefill: (medals) => `${medals}枚を受け取りました。`,
  sayCenterReset: 'メダルゲームセンターでメダルがリセットされました。このテーブルも最初からになります。',
  noticeTitle: 'このテーブルはメダルで遊ぶようになりました',
  noticeBody:
    'スリーカードポーカーは、メダルゲームセンターの持ちメダルで遊ぶようになりました。センターのどのゲームとも同じメダルです。これまでテーブルで最初に用意していた1,000枚の練習用チップは廃止しました。別物で単位も違うため、メダルには引き継いでいません。',
  noticeLink: 'メダルゲームセンターへ',
  noticeOk: 'OK',
  handResults: 'この回の結果（枚）',
  handTotal: '合計',
  outcome: { win: '勝ち', lose: '負け', push: '引き分け' },
  hintToggle: '戦略のヒントを表示',
  hintSays: (decision) => `戦略：Q-6-4以上でプレイ → この手は${decision === 'play' ? 'プレイ' : 'フォールド'}`,
  evTitle: 'この手札の正確な期待値（アンティとプレイ）',
  evNote:
    '単位はアンティ。アンティとプレイの賭けの期待値で、アンティボーナス込みです。ペアプラスは含みません。ペアプラスは自分の手札だけで決まりますが、フォールドすると没収されます。フォールドは必ずアンティ1つ分の負けなので、プレイの損がそれより小さければプレイが正解です。',
  evAgainst: (dealerHands) => `ディーラーがとり得る${dealerHands}通りの手に対して：`,
  evNotQualified: 'ディーラーがクオリファイせず',
  evWin: 'あなたの勝ち',
  evTie: '引き分け',
  evLose: 'ディーラーの勝ち',
  statsTitle: 'このセッション',
  observedVsExact: '実測・理論値',
  hands: 'ハンド数',
  played: 'プレイした回数',
  dealerQualified: 'ディーラーがクオリファイ',
  winsPushesLosses: '勝ち／±0／負け',
  agreement: '戦略どおりだった割合',
  hint: [
    'Q-6-4以上ならプレイ、それ未満はフォールド。最適戦略はこのルール1つだけです。',
    'フォールドの損はアンティちょうど1つ分。弱い手でプレイするとアンティ2つ分を危険にさらしますが、ディーラーがクオリファイしなければ（約3割）1つ分勝てます。',
    'ペアプラスは自分の手札だけに賭ける別のベットです。1-3-6-30-40の配当では、ベットしたメダル100枚につき平均7.28枚を失い、本体のゲームの2倍以上です。',
  ],
  oddsIntro: (hands, dealerHands, total) =>
    `スリーカードポーカーは全部数え切れる大きさです。3枚の手札は${hands}通り、そのそれぞれに対してディーラーは残り49枚から${dealerHands}通りの手を持ち得るので、組み合わせは全部で${total}通り。このタブの数字はそのすべてを実際に勝負させて求めたもので、シミュレーションは使っていません。`,
  medalsNote: (most, wager, loss, pairPlusLoss) =>
    `メダルで言うと、各スポットの上限${most}枚で最適戦略なら、1回にアンティとプレイへ平均${wager}枚を賭け、そのうち${loss}枚を失います。ペアプラスに${most}枚賭けると、さらに1回${pairPlusLoss}枚です。ベットはいつも整数の枚数で、配当はその整数倍なので、端数が出ることはありません。`,
  handsTitle: '3枚の役の出やすさと、ペアプラスの配当',
  payTableLabel: 'ペアプラスの配当表',
  payTableName: { standard: '1-3-6-30-40（一般的）', old: '1-4-6-30-40（元の配当）' },
  colHand: '役',
  colWays: '場合の数',
  colProbability: '確率',
  colPays: '配当',
  colReturn: '期待値への寄与',
  loses: '負け',
  total: '合計',
  handsNote:
    '3枚ではストレート（720通り）の方がフラッシュ（1,096通り）より出にくいので、5枚のポーカーとは逆にストレートが上です。「期待値への寄与」は確率×配当で、合計がこのサイドベットのメダル1枚あたりの戻り、足りない分がハウスエッジです。フラッシュの配当を4:1から3:1に下げるだけで、エッジは3倍以上になります。',
  statPairPlusEdge: (table) => `${table} のハウスエッジ`,
  statPairPlusWin: '配当がつく手の割合',
  anteTitle: 'アンティとプレイ',
  anteIntro: (total) =>
    `最適戦略（Q-6-4以上でプレイ）のとき、${total}通りの組み合わせはどれも次の5つのどれかで終わります。ストレート以上を持っていれば、アンティボーナスがそれに上乗せされます。`,
  statEdge: 'ハウスエッジ（アンティあたり）',
  statRisk: 'エレメント・オブ・リスク',
  statQualify: 'ディーラーがクオリファイ',
  statPlayRate: 'プレイする手の割合',
  statWager: '平均の賭け金（アンティ単位）',
  statCombinations: '数えた組み合わせ',
  colOutcome: '結果',
  colNet: '収支（アンティ）',
  colCombinations: '組み合わせ数',
  outcomeName: {
    fold: 'フォールド',
    notQualified: 'プレイ、ディーラーがクオリファイせず',
    win: 'プレイしてディーラーに勝つ',
    tie: 'プレイして引き分け',
    lose: 'プレイしてディーラーに負ける',
  },
  anteBonusRow: 'アンティボーナス（上乗せ）',
  anteNote: (edge, wager, risk) =>
    `ハウスエッジはアンティに対する割合で表すのが普通で、1回あたりアンティの${edge}を失います。ただし3回に2回は同額のプレイベットを追加するので、平均の賭け金はアンティ${wager}個分。実際に賭けた1単位あたり（エレメント・オブ・リスク）では${risk}です。`,
  thresholdTitle: 'なぜQ-6-4が境目なのか',
  thresholdIntro:
    'フォールドは必ずアンティ1つ分の負けです。プレイするともう1つアンティを賭けることになり、ディーラーがクオリファイしなければ1つ勝ち、勝負になれば2つ勝つか負けるかです。その平均が−1より良くなった時点で、プレイする価値があります。グラフはスートが揃っていないハイカードの手を弱い順に並べたときのプレイの期待値で、クオリファイしたディーラーに勝てないうちは横ばい、そこから上がっていき、Q-6-3とQ-6-4の間でフォールドの線を越えます。',
  curveAria: '各ハイカードの手でプレイしたときの期待値。Q-6-4でフォールドの−1を上回る',
  curveFold: 'フォールド：−1',
  curveAxis: 'ハイカードの手（一番強いカード別、弱い順）',
  colEvPlay: 'プレイの期待値',
  colVsFold: 'フォールドとの差',
  colDealerOut: 'ディーラーがクオリファイせず',
  colYouWin: 'あなたの勝ち',
  colBest: '正解',
  thresholdNote: (worstPlay, bestFold) =>
    `各行はそのランクの60通りのスートの組み合わせの平均です。実際にどのカードを持っているかでディーラーの手の出方が少し変わりますが、差は小数第3位程度で、一番悪いQ-6-4でも${worstPlay}、一番良いQ-6-3でも${bestFold}です。`,
  bonusTitle: 'アンティボーナスの価値',
  bonusIntro:
    'ボーナスはストレート以上のとき、勝っても負けてもアンティに対して支払われます。これらの手をフォールドすることはないので、価値は「出る確率×配当」だけで決まります。',
  bonusNote: (total, without) => `合わせてアンティの${total}が戻ってきます。ボーナスがなければハウスエッジは${without}になります。`,
  strategyTitle: '戦略の比較',
  strategyIntro: '同じ数え上げで、どんなプレイ／フォールドのルールでも正確に評価できます。',
  colStrategy: '戦略',
  colHouseEdge: 'ハウスエッジ',
  colRisk: 'エレメント・オブ・リスク',
  colPlayed: 'プレイする手',
  colWager: '平均の賭け金',
  strategyNote: (mimicExtra, alwaysExtra, hopeless) =>
    `ディーラーと同じ基準でプレイしても、間違えるのはQ-6-4より弱いクイーンハイの${mimicExtra}通りだけで、どれも損はごくわずかなので、差は0.1ポイント未満です。常にプレイすると、最適戦略ならフォールドする${alwaysExtra}通り（うち${hopeless}通りはクオリファイしたディーラーに絶対に勝てない手）までプレイすることになり、エッジは2倍以上になります。`,
  run: '実行',
  running: (pct) => `実行中… ${pct}%`,
  handsLabel: 'ハンド数',
  simTitle: '同じカードで3つの戦略を比べる',
  simIntro:
    '毎回新しいデッキをシャッフルして3枚ずつ配り、同じ配り方に対して3つの戦略それぞれがテーブルと同じルールでアンティ1単位を賭けます。点線は確率タブの正確なエッジです。',
  colExact: '理論値',
  colSimulated: (hands) => `シミュレーション（${hands}回）`,
  simNote: (qualified, exact, gap) =>
    `± は95%の幅です。このうちディーラーがクオリファイしたのは${qualified}（理論値は${exact}）。最適戦略と「ディーラーと同じ」は約2%の手を除いて同じ判断をするので線もほぼ重なり、両者の差${gap}ポイントは±の幅よりずっと小さいままです。この差をはっきりさせるには全数の数え上げが必要です。`,
};

export const getStrings = (language: GameLanguage): ThreeCardPokerStrings => (language === 'ja' ? ja : en);
