/**
 * Local ja/en strings for blackjack, consumed via useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Action as AnalysisAction } from './analysis';
import type { HandOutcome, StrategyId } from './engine';

export interface BlackjackStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabOdds: string;
  tabSim: string;
  howToPlay: string;
  infoBody: string[];
  action: Record<AnalysisAction, string>;
  // The medal floor
  centerLink: string;
  medalsLabel: string;
  /** A number of medals, written out: "12 medals", 「12枚」. */
  medals: (count: string) => string;
  /** The word after a number of medals: "medals", 「枚」. */
  medalUnit: (count: number) => string;
  /** A signed number of medals won or lost: "+3 medals", 「−2枚」. */
  medalsSigned: (signed: string) => string;
  findingMedals: string;
  betLabel: string;
  winLabel: string;
  /** That medals are not money, near the counter and in the help. */
  notMoney: string;
  refill: (medals: number) => string;
  sayRefill: (medals: number) => string;
  cardAway: string;
  playHere: string;
  noticeTitle: string;
  noticeBody: string;
  noticeLink: string;
  noticeDismiss: string;
  resumed: string;
  sayReset: string;
  // Play
  bet: string;
  betAria: (amount: string) => string;
  oneBet: string;
  oneBetAria: string;
  maxBet: string;
  maxBetAria: (most: number) => string;
  betRange: (least: number, most: number) => string;
  oddBet: (bet: number, wins: number, full: string) => string;
  clearBet: string;
  deal: string;
  dealing: string;
  dealer: string;
  you: string;
  handLabel: (n: number) => string;
  total: (total: number, soft: boolean) => string;
  blackjack: string;
  bust: string;
  outcome: Record<HandOutcome, string>;
  insuranceQuestion: (cost: string) => string;
  insuranceYes: string;
  insuranceNo: string;
  insuranceAdvice: string;
  noMedals: string;
  placeBet: string;
  yourMove: string;
  dealerPlays: string;
  resultSummary: (net: string, dealerTotal: number, dealerBust: boolean, dealerBj: boolean) => string;
  insurance: string;
  shoeLabel: (left: number) => string;
  shuffleNext: string;
  newShoe: string;
  feltPays: string;
  feltRules: string;
  holeCard: string;
  hintToggle: string;
  hintSays: (action: string) => string;
  evTitle: string;
  evNote: string;
  statsTitle: string;
  hands: string;
  winsPushesLosses: string;
  blackjacks: string;
  agreement: string;
  statNet: string;
  clearRecord: string;
  hint: string[];
  // Odds
  oddsIntro: string;
  edgeHeadline: string;
  edgeHeadlineNote: string;
  statPlayerBj: string;
  statDealerBj: string;
  statInsurance: string;
  dealerTitle: string;
  dealerIntro: string;
  colUp: string;
  colBust: string;
  colBlackjack: string;
  chartTitle: string;
  chartIntro: string;
  chartHard: string;
  chartSoft: string;
  chartPairs: string;
  chartLegend: Record<AnalysisAction, string>;
  chartDiffers: string;
  cellDetail: (hand: string, up: string) => string;
  cellMargin: (best: string, second: string, margin: string) => string;
  pickCell: string;
  rulesTitle: string;
  rulesIntro: string;
  colRule: string;
  colEdge: string;
  colChange: string;
  ruleName: Record<'table' | 'h17' | 'sixFive' | 'noDas' | 'splitOnce' | 'surrender', string>;
  playersTitle: string;
  playersIntro: string;
  strategyName: Record<StrategyId | 'optimal', string>;
  medalTitle: string;
  medalIntro: (least: number, most: number) => string;
  colBet: string;
  colNaturalWins: string;
  medalNote: (share: string) => string;
  // Simulation
  run: string;
  running: (pct: number) => string;
  roundsLabel: string;
  simTitle: string;
  simIntro: string;
  colStrategy: string;
  colExact: string;
  colSimulated: (rounds: string) => string;
  colWinPushLose: string;
  colBusts: string;
  simNote: string;
  // Counting
  countToggle: string;
  runningCount: string;
  decksLeft: string;
  trueCountLabel: string;
  countBet: (units: number) => string;
  countNote: string;
  countingTitle: string;
  countingIntro: string;
  colTrueCount: string;
  colRoundsShare: string;
  colPlayerEdge: string;
  countChartAxis: string;
  flatBet: string;
  spreadBet: string;
  colAverageBet: string;
  colPer100: string;
  colEdgePerUnit: string;
  countingNote: string;
}

const en: BlackjackStrings = {
  title: 'Blackjack',
  subtitle:
    'Six decks, dealer stands on 17, blackjack pays 3:2. Play with basic-strategy hints and the exact value of every option, then see the exact house edge of each rule and strategy.',
  tabPlay: 'Table',
  tabOdds: 'Odds',
  tabSim: 'Simulation',
  howToPlay: 'How to play',
  infoBody: [
    'Press 1 BET to bet a medal at a time (1 to 10 medals a hand), or MAX BET, then DEAL. Get closer to 21 than the dealer without going over. Cards 2–10 count their value, faces 10, aces 1 or 11.',
    'Hit takes a card, Stand keeps your total, Double doubles the bet for exactly one more card, and Split turns a pair into two hands (up to four; split aces get one card each).',
    'An ace and a ten-value card on the first two cards is blackjack and pays 3:2. The dealer checks for blackjack under an ace or a ten before you act, so doubles and splits never lose to a hidden natural. When the dealer shows an ace you may take insurance with half your bet; it pays 2:1 if the dealer has blackjack.',
    'The dealer draws to 17 and stands on all 17s, including soft 17. Six decks are dealt to a cut card at 75% and then reshuffled.',
    'The table plays with your medals from the Medal Game Center: a bet comes out of them as you make it, and what a hand wins goes back into them. A blackjack’s 3:2 comes in whole medals, rounded down on an odd bet (3 medals win 4), and insurance is half the bet, rounded down. Reload in the middle of a hand and it is still on the table.',
    'Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.',
  ],
  action: { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender' },
  centerLink: 'Medal Game Center',
  medalsLabel: 'YOUR MEDALS',
  medals: (count) => `${count} ${count === '1' ? 'medal' : 'medals'}`,
  medalUnit: (count) => (count === 1 ? 'medal' : 'medals'),
  medalsSigned: (signed) => `${signed} ${signed === '+1' || signed === '−1' ? 'medal' : 'medals'}`,
  findingMedals: 'Finding your medals…',
  betLabel: 'BET',
  winLabel: 'WIN',
  // The same words as the medal center's own note, until that is shared from MedalCenter/strings.ts.
  notMoney: 'Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.',
  refill: (medals) => `Out of medals — take ${medals} more`,
  sayRefill: (medals) => `You were given ${medals} medals.`,
  cardAway: 'Your medals are being played on a machine in another tab. This table waits where it is, with any hand on it.',
  playHere: 'Play here',
  noticeTitle: 'Blackjack now plays with your medals',
  noticeBody:
    'Every bet comes from your medals at the Medal Game Center, and every win goes back to them, so what you win here you can play at any machine on the floor. The old chips are retired: they were not turned into medals.',
  noticeLink: 'Go to the Medal Game Center',
  noticeDismiss: 'Got it',
  resumed: 'The hand you were playing is back on the table.',
  sayReset: 'The Medal Game Center was reset: the table starts over with a new shoe.',
  bet: 'Bet',
  betAria: (amount) => `Betting circle: ${amount} bet. Adds one medal`,
  oneBet: '1 BET',
  oneBetAria: 'Bet one more medal',
  maxBet: 'MAX BET',
  maxBetAria: (most) => `Bet the most, ${most} medals`,
  betRange: (least, most) => `${least} to ${most} medals a hand.`,
  oddBet: (bet, wins, full) => `Odd bet: a blackjack’s 3:2 is rounded down to whole medals, so a bet of ${bet} wins ${wins}, not ${full}. An even bet gets the full 3:2.`,
  clearBet: 'Clear bet',
  deal: 'DEAL',
  dealing: 'Dealing…',
  dealer: 'Dealer',
  you: 'You',
  handLabel: (n) => `Hand ${n}`,
  total: (total, soft) => (soft ? `soft ${total}` : String(total)),
  blackjack: 'Blackjack',
  bust: 'Bust',
  outcome: { blackjack: 'Blackjack 3:2', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust' },
  insuranceQuestion: (cost) => `The dealer shows an ace. Insurance for ${cost}?`,
  insuranceYes: 'Take insurance',
  insuranceNo: 'No insurance',
  insuranceAdvice: 'Basic strategy: never. It pays 2:1 but only wins 4 times in 13 — a 7.7% house edge.',
  noMedals: 'Not enough medals for that.',
  placeBet: 'Place a bet and deal.',
  yourMove: 'Your move.',
  dealerPlays: 'Dealer plays…',
  resultSummary: (net, total, bust, bj) =>
    `${bj ? 'Dealer blackjack' : bust ? `Dealer busts with ${total}` : `Dealer has ${total}`} · ${net}`,
  insurance: 'Insurance',
  shoeLabel: (left) => `Six-deck shoe · ${left} cards left`,
  shuffleNext: 'Cut card is out — the shoe is shuffled before the next hand.',
  newShoe: 'A fresh six-deck shoe is shuffled on the first deal.',
  feltPays: 'BLACKJACK PAYS 3 TO 2',
  feltRules: 'Dealer must stand on all 17s · Insurance pays 2 to 1',
  holeCard: 'Dealer’s face-down card',
  hintToggle: 'Show basic-strategy hint',
  hintSays: (action) => `Basic strategy: ${action}`,
  evTitle: 'What each play is worth',
  evNote:
    'Exact expected result per unit of this hand’s original bet, for an infinite deck, after the dealer has checked for blackjack. Six-deck charts differ only in a few close calls.',
  statsTitle: 'Your record at this table',
  hands: 'Hands',
  winsPushesLosses: 'Won / pushed / lost',
  blackjacks: 'Blackjacks',
  agreement: 'Plays that matched the chart',
  statNet: 'Medals won less lost',
  clearRecord: 'Clear record',
  hint: [
    'The hint uses the standard basic-strategy chart for this game; the Odds tab shows where it comes from.',
    'Doubling and splitting need as many medals again as the hand’s bet.',
    'A 21 made from a split is not a blackjack and pays 1:1.',
  ],
  oddsIntro:
    'Blackjack’s odds depend on your decisions, so the question is “what is each play worth?”. For an infinite deck — every card drawn with the same chance, 1 in 13 per rank — that can be computed exactly: the dealer’s final total by recursion, then the value of standing, hitting, doubling and splitting for every hand. Nothing on this tab is simulated.',
  edgeHeadline: 'House edge with perfect play',
  edgeHeadlineNote:
    'Per unit of the first bet in each round, for an infinite deck under this table’s rules, with an even bet of medals (for an odd bet, see “Bets in medals” below). Real shoes come out slightly better for the player: with a finite number of cards, removal effects — blackjacks come a little more often, for one — tilt toward you.',
  statPlayerBj: 'You get blackjack',
  statDealerBj: 'Dealer gets blackjack',
  statInsurance: 'House edge on insurance',
  dealerTitle: 'Where the dealer ends up',
  dealerIntro:
    'The dealer has no choices, so the final total follows from the up card alone. A 5 or 6 busts the dealer about 42% of the time — the reason basic strategy stands on stiff hands against them.',
  colUp: 'Up card',
  colBust: 'Bust',
  colBlackjack: 'Blackjack',
  chartTitle: 'Basic strategy, derived',
  chartIntro:
    'Each cell is the play with the highest expected value, computed for that hand against that up card. Click a cell to see what every option is worth.',
  chartHard: 'Hard totals',
  chartSoft: 'Soft totals (with an ace counted as 11)',
  chartPairs: 'Pairs',
  chartLegend: { hit: 'H = hit', stand: 'S = stand', double: 'D = double', split: 'P = split', surrender: 'R = surrender' },
  chartDiffers:
    '* The standard six-deck chart (the table’s hint) doubles here instead. These are close calls — less than a hundredth of a bet apart — that the removal of the cards in play tips the other way in a real shoe.',
  cellDetail: (hand, up) => `${hand} against a dealer ${up}`,
  cellMargin: (best, second, margin) => `${best} beats ${second} by ${margin} per unit bet.`,
  pickCell: 'Click a cell above.',
  rulesTitle: 'How the rules move the edge',
  rulesIntro: 'The same calculation with one rule changed at a time. Small print on the felt matters more than it looks.',
  colRule: 'Rule',
  colEdge: 'House edge',
  colChange: 'vs this table',
  ruleName: {
    table: 'This table (S17, 3:2, double after split, split to 4)',
    h17: 'Dealer hits soft 17',
    sixFive: 'Blackjack pays 6:5',
    noDas: 'No double after split',
    splitOnce: 'Split once only (2 hands)',
    surrender: 'Late surrender allowed',
  },
  playersTitle: 'Strategy matters more than any rule',
  playersIntro:
    'Exact edges for simple ways of playing, never doubling or splitting. Playing like the dealer loses because you bust first — and lose even when the dealer then busts too.',
  strategyName: {
    optimal: 'Perfect basic strategy',
    basic: 'Basic strategy (the chart)',
    mimic: 'Play like the dealer (hit to 17)',
    neverBust: 'Never bust (stand on 12+)',
  },
  medalTitle: 'Bets in medals',
  medalIntro: (least, most) =>
    `This table takes ${least} to ${most} medals a hand, a medal at a time, as Japanese medal blackjack machines do. A blackjack’s 3:2 comes in whole medals: on an odd bet the half medal is rounded down (3 medals win 4, not 4½), and insurance is half the bet, rounded down (a 1-medal bet is offered none). An even bet keeps the edge above exactly; an odd bet gives the house a little more, exactly as below.`,
  colBet: 'Bet',
  colNaturalWins: 'A blackjack wins',
  medalNote: (share) =>
    `The same calculation as the headline, with a blackjack winning ⌊1.5 × bet⌋ medals. The edge rises by (1.5 − ⌊1.5 × bet⌋ ÷ bet) times ${share}, the chance of a blackjack the dealer does not match.`,
  run: 'Run',
  running: (pct) => `Running… ${pct}%`,
  roundsLabel: 'Rounds',
  simTitle: 'Three ways to play, same shoes',
  simIntro:
    'Deals real six-deck shoes to the cut card and plays each strategy one unit a round. Every strategy gets the same shuffles. The dashed lines are the exact infinite-deck edges.',
  colStrategy: 'Strategy',
  colExact: 'Exact (∞ deck)',
  colSimulated: (rounds) => `Simulated (${rounds} rounds)`,
  colWinPushLose: 'Win / push / lose',
  colBusts: 'Rounds with a bust',
  simNote:
    'The ± is a 95% range; blackjack’s doubles and splits make a round’s result swing more than a bet that wins 1:1, so it takes about a million rounds to pin the edge down to ±0.2%.',
  countToggle: 'Count cards (Hi-Lo)',
  runningCount: 'Running count',
  decksLeft: 'Decks left',
  trueCountLabel: 'True count',
  countBet: (units) => `A 1–8 spread would bet ${units} unit${units === 1 ? '' : 's'} now`,
  countNote:
    'Hi-Lo: 2–6 count +1, 7–9 count 0, tens and aces −1, for every card you have seen (not the burn card or the dealer’s face-down card). The true count divides by the decks still in the shoe; the Simulation tab measures what it is worth.',
  countingTitle: 'Counting cards',
  countingIntro:
    'A Hi-Lo counter plays basic strategy through the same kind of shoes and reads the true count before every round. Each round is scored twice: with a flat one-unit bet, and with a 1–8 spread (1 unit up to a true count of +1, then 2, 4 and 8 units at +2, +3 and +4 or more). Only the bet changes.',
  colTrueCount: 'True count',
  colRoundsShare: 'Rounds',
  colPlayerEdge: 'Player edge',
  countChartAxis: 'True count before the round',
  flatBet: 'Flat bet (1 unit)',
  spreadBet: 'Hi-Lo, 1–8 spread',
  colAverageBet: 'Average bet',
  colPer100: 'Won per 100 rounds',
  colEdgePerUnit: 'Edge per unit bet',
  countingNote:
    'The shoe swings between favoring the house and favoring the player; a counter bets small in the first case and big in the second. That is the idea behind Edward Thorp’s Beat the Dealer (1962) — and why casinos deal six or eight decks, cut a quarter of the shoe off, use continuous shufflers and ask counters to leave. The ± is a 95% range: even a real edge takes hundreds of thousands of rounds to show.',
};

const ja: BlackjackStrings = {
  title: 'ブラックジャック',
  subtitle:
    '6デッキ、ディーラーは17でスタンド、ブラックジャックは3:2。ベーシックストラテジーのヒントと各選択肢の正確な期待値を見ながら遊び、ルールや戦略ごとの正確なハウスエッジを確認できます。',
  tabPlay: 'テーブル',
  tabOdds: '確率',
  tabSim: 'シミュレーション',
  howToPlay: '遊び方',
  infoBody: [
    '「1枚ベット」でメダルを1枚ずつ（1ハンド1〜10枚）、または「MAXベット」でベットして「ディール」。21を超えずにディーラーより21に近ければ勝ちです。2〜10は数字どおり、絵札は10、Aは1か11と数えます。',
    'ヒットは1枚引く、スタンドはそのまま、ダブルはベットを2倍にしてちょうど1枚だけ引く、スプリットはペアを2つの手に分けます（最大4手、Aのスプリットは各1枚のみ）。',
    '最初の2枚でAと10点札ならブラックジャックで3:2の配当です。ディーラーはアップカードがAか10のとき先にブラックジャックを確認する（ピーク）ので、ダブルやスプリットが隠れたナチュラルに負けることはありません。ディーラーのアップカードがAのときはベットの半分でインシュランスを掛けられ、ディーラーがブラックジャックなら2:1の配当です。',
    'ディーラーは17になるまで引き、ソフト17を含むすべての17でスタンドします。6デッキを75%のカットカードまで配ったらシャッフルします。',
    'このテーブルは、メダルゲームセンターの持ちメダルで遊びます。ベットしたメダルはその場で持ちメダルから出し、勝ったメダルは持ちメダルに戻ります。ブラックジャックの3:2は枚数で数え、奇数ベットでは端数を切り捨てます（3枚なら4枚獲得）。インシュランスもベットの半分を切り捨てた枚数です。ハンドの途中でページを読み込み直しても、そのハンドはテーブルに残っています。',
    'メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。',
  ],
  action: { hit: 'ヒット', stand: 'スタンド', double: 'ダブル', split: 'スプリット', surrender: 'サレンダー' },
  centerLink: 'メダルゲームセンター',
  medalsLabel: '持ちメダル',
  medals: (count) => `${count}枚`,
  medalUnit: () => '枚',
  medalsSigned: (signed) => `${signed}枚`,
  findingMedals: '持ちメダルを確認しています…',
  betLabel: 'ベット',
  winLabel: '獲得',
  notMoney: 'メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  sayRefill: (medals) => `メダルを${medals}枚受け取りました。`,
  cardAway: 'メダルは別のタブのマシンで遊ばれています。このテーブルは、配られたハンドもそのままで待っています。',
  playHere: 'ここで遊ぶ',
  noticeTitle: 'ブラックジャックは持ちメダルで遊ぶようになりました',
  noticeBody:
    'ベットはメダルゲームセンターの持ちメダルから出し、勝ったメダルはそこに戻ります。ここで勝ったメダルは、フロアのどのマシンでも遊べます。以前のチップは使えなくなりました（メダルには替わりません）。',
  noticeLink: 'メダルゲームセンターへ',
  noticeDismiss: '閉じる',
  resumed: '遊んでいたハンドがそのままテーブルに残っています。',
  sayReset: 'メダルゲームセンターがリセットされました。テーブルは新しいシューで最初からです。',
  bet: 'ベット',
  betAria: (amount) => `ベッティングサークル（${amount}ベット中）。1枚追加します`,
  oneBet: '1枚ベット',
  oneBetAria: 'メダルを1枚追加でベット',
  maxBet: 'MAXベット',
  maxBetAria: (most) => `最大の${most}枚をベット`,
  betRange: (least, most) => `1ハンド${least}〜${most}枚。`,
  oddBet: (bet, wins, full) => `奇数ベット：ブラックジャックの3:2は端数を切り捨てるので、${bet}枚なら${wins}枚獲得です（${full}枚ではありません）。偶数ベットなら3:2がそのままです。`,
  clearBet: 'クリア',
  deal: 'ディール',
  dealing: 'ディール中…',
  dealer: 'ディーラー',
  you: 'あなた',
  handLabel: (n) => `ハンド${n}`,
  total: (total, soft) => (soft ? `ソフト${total}` : String(total)),
  blackjack: 'ブラックジャック',
  bust: 'バスト',
  outcome: { blackjack: 'ブラックジャック 3:2', win: '勝ち', push: '引き分け', lose: '負け', bust: 'バスト' },
  insuranceQuestion: (cost) => `ディーラーのアップカードはA。${cost}でインシュランスを掛けますか？`,
  insuranceYes: 'インシュランスを掛ける',
  insuranceNo: '掛けない',
  insuranceAdvice: 'ベーシックストラテジーでは掛けません。配当は2:1ですが勝つのは13回に4回、ハウスエッジは7.7%です。',
  noMedals: 'メダルが足りません。',
  placeBet: 'ベットしてディールしてください。',
  yourMove: 'あなたの番です。',
  dealerPlays: 'ディーラーの番…',
  resultSummary: (net, total, bust, bj) =>
    `${bj ? 'ディーラーのブラックジャック' : bust ? `ディーラーは${total}でバスト` : `ディーラーは${total}`}・${net}`,
  insurance: 'インシュランス',
  shoeLabel: (left) => `6デッキのシュー・残り${left}枚`,
  shuffleNext: 'カットカードが出ました。次のハンドの前にシャッフルします。',
  newShoe: '最初のディールで6デッキのシューをシャッフルします。',
  feltPays: 'ブラックジャックは3対2',
  feltRules: 'ディーラーはすべての17でスタンド・インシュランスは2対1',
  holeCard: 'ディーラーの伏せ札',
  hintToggle: 'ベーシックストラテジーのヒントを表示',
  hintSays: (action) => `ベーシックストラテジー：${action}`,
  evTitle: '各選択肢の期待値',
  evNote:
    'このハンドの元のベット1単位あたりの正確な期待値です（無限デッキ、ディーラーがブラックジャックでないと確認した後）。6デッキの表とは僅差のいくつかのマスだけが異なります。',
  statsTitle: 'このテーブルでの記録',
  hands: 'ハンド数',
  winsPushesLosses: '勝ち / 引き分け / 負け',
  blackjacks: 'ブラックジャック',
  agreement: '表どおりにプレイした割合',
  statNet: 'メダルの増減',
  clearRecord: '記録を消す',
  hint: [
    'ヒントはこのゲームの標準的なベーシックストラテジー表です。確率タブでその根拠を確認できます。',
    'ダブルやスプリットには、そのハンドのベットと同じ枚数のメダルが追加で必要です。',
    'スプリットで作った21はブラックジャックではなく1:1です。',
  ],
  oddsIntro:
    'ブラックジャックの確率はあなたの判断で変わるので、問いは「各選択肢はいくらの価値があるか」です。無限デッキ（どのカードも毎回同じ確率、ランクごとに13分の1）なら厳密に計算できます。ディーラーの最終合計を再帰で求め、各ハンドでスタンド・ヒット・ダブル・スプリットの価値を出すだけです。このタブの数字はシミュレーションではありません。',
  edgeHeadline: '完璧にプレイしたときのハウスエッジ',
  edgeHeadlineNote:
    '各ラウンド最初のベット1単位あたり、このテーブルのルール・無限デッキで、偶数枚のメダルをベットしたときの値です（奇数ベットは下の「メダルでのベット」を参照）。実際のシューはカードの枚数が有限なので、出たカードが抜ける効果（たとえばブラックジャックが少しだけ出やすくなる）でプレイヤーにわずかに有利になります。',
  statPlayerBj: 'あなたがブラックジャック',
  statDealerBj: 'ディーラーがブラックジャック',
  statInsurance: 'インシュランスのハウスエッジ',
  dealerTitle: 'ディーラーの最終結果',
  dealerIntro:
    'ディーラーには選択がないので、最終合計はアップカードだけで決まります。5や6のときディーラーは約42%バストします。これがベーシックストラテジーで弱い手でもスタンドする理由です。',
  colUp: 'アップカード',
  colBust: 'バスト',
  colBlackjack: 'ブラックジャック',
  chartTitle: 'ベーシックストラテジーを導く',
  chartIntro: '各マスは、そのハンドとアップカードの組み合わせで期待値が最も高いプレイです。マスをクリックすると、すべての選択肢の価値が見られます。',
  chartHard: 'ハード',
  chartSoft: 'ソフト（Aを11と数えている手）',
  chartPairs: 'ペア',
  chartLegend: { hit: 'H = ヒット', stand: 'S = スタンド', double: 'D = ダブル', split: 'P = スプリット', surrender: 'R = サレンダー' },
  chartDiffers:
    '* 標準的な6デッキの表（テーブルのヒント）ではここはダブルです。ベット1単位あたり0.01にも満たない僅差で、実際のシューではすでに出ているカードの分だけ逆に傾きます。',
  cellDetail: (hand, up) => `${hand} 対 ディーラーの${up}`,
  cellMargin: (best, second, margin) => `${best}が${second}より1単位あたり${margin}上回ります。`,
  pickCell: '上の表のマスをクリックしてください。',
  rulesTitle: 'ルールでエッジはどう動くか',
  rulesIntro: '同じ計算でルールを1つずつ変えた結果です。フェルトの小さな文字は見た目以上に効きます。',
  colRule: 'ルール',
  colEdge: 'ハウスエッジ',
  colChange: 'このテーブルとの差',
  ruleName: {
    table: 'このテーブル（S17、3:2、スプリット後のダブル可、4手まで）',
    h17: 'ディーラーがソフト17でヒット',
    sixFive: 'ブラックジャックが6:5',
    noDas: 'スプリット後のダブル不可',
    splitOnce: 'スプリットは1回（2手）まで',
    surrender: 'レイトサレンダーあり',
  },
  playersTitle: '戦略の差はどのルールの差より大きい',
  playersIntro:
    'ダブルもスプリットもしない単純な遊び方の正確なエッジです。ディーラーの真似が負けるのは、あなたが先にバストし、その後ディーラーがバストしても負けのままだからです。',
  strategyName: {
    optimal: '完璧なベーシックストラテジー',
    basic: 'ベーシックストラテジー（表）',
    mimic: 'ディーラーの真似（17まで引く）',
    neverBust: 'バストしない（12以上でスタンド）',
  },
  medalTitle: 'メダルでのベット',
  medalIntro: (least, most) =>
    `このテーブルは、日本のメダルゲームのブラックジャック機と同じように、メダルを1枚ずつ、1ハンド${least}〜${most}枚までベットできます。ブラックジャックの3:2は枚数で数え、奇数ベットでは端数を切り捨てます（3枚なら4枚獲得で、4.5枚ではありません）。インシュランスもベットの半分を切り捨てた枚数です（1枚ベットではインシュランスはありません）。偶数ベットなら上のエッジはそのまま、奇数ベットでは下のとおりハウスがわずかに有利になります。`,
  colBet: 'ベット',
  colNaturalWins: 'ブラックジャックの獲得',
  medalNote: (share) =>
    `見出しと同じ計算で、ブラックジャックの獲得を⌊1.5 × ベット⌋枚にしたものです。エッジは (1.5 − ⌊1.5 × ベット⌋ ÷ ベット) × ${share}（ディーラーがブラックジャックでないときにブラックジャックになる確率）だけ上がります。`,
  run: '実行',
  running: (pct) => `実行中… ${pct}%`,
  roundsLabel: 'ラウンド数',
  simTitle: '3つの遊び方を同じシューで',
  simIntro:
    '6デッキのシューをカットカードまで実際に配り、各戦略で毎ラウンド1単位ずつ賭けます。どの戦略も同じシャッフルを使います。点線は無限デッキの正確なエッジです。',
  colStrategy: '戦略',
  colExact: '理論値（無限デッキ）',
  colSimulated: (rounds) => `シミュレーション（${rounds}ラウンド）`,
  colWinPushLose: '勝ち / 引き分け / 負け',
  colBusts: 'バストしたラウンド',
  simNote:
    '± は95%の幅です。ダブルやスプリットがあるぶん1ラウンドの結果は等倍のベットより大きく振れ、エッジを±0.2%まで絞るのに約100万ラウンドかかります。',
  countToggle: 'カードを数える（ハイロー）',
  runningCount: 'ランニングカウント',
  decksLeft: '残りデッキ',
  trueCountLabel: 'トゥルーカウント',
  countBet: (units) => `1〜8倍のスプレッドなら今は${units}単位`,
  countNote:
    'ハイロー：見えたカード（バーンカードとディーラーの伏せ札は除く）ごとに、2〜6は+1、7〜9は0、10点札とAは−1。トゥルーカウントはそれをシューに残るデッキ数で割った値です。その価値はシミュレーションタブで測れます。',
  countingTitle: 'カードカウンティング',
  countingIntro:
    'ハイローのカウンターが同じ6デッキのシューでベーシックストラテジーをプレイし、毎ラウンドの前にトゥルーカウントを読みます。各ラウンドを2通りに集計します：常に1単位の均等ベットと、1〜8倍のスプレッド（+1までは1単位、+2で2、+3で4、+4以上で8単位）。変えるのはベットの大きさだけです。',
  colTrueCount: 'トゥルーカウント',
  colRoundsShare: 'ラウンドの割合',
  colPlayerEdge: 'プレイヤーのエッジ',
  countChartAxis: 'ラウンド前のトゥルーカウント',
  flatBet: '均等ベット（1単位）',
  spreadBet: 'ハイロー、1〜8倍スプレッド',
  colAverageBet: '平均ベット',
  colPer100: '100ラウンドあたりの勝ち',
  colEdgePerUnit: 'ベット1単位あたりのエッジ',
  countingNote:
    'シューはハウス有利とプレイヤー有利の間を行き来し、カウンターは前者で小さく後者で大きく賭けます。これがエドワード・ソープの『ディーラーをやっつけろ！（Beat the Dealer）』（1962年）の考え方で、カジノが6〜8デッキを使い、シューの4分の1をカットし、自動シャッフラーを導入し、カウンターに退場を求める理由です。± は95%の幅で、本物のエッジでも見えてくるまで数十万ラウンドかかります。',
};

export const getStrings = (language: GameLanguage): BlackjackStrings => (language === 'ja' ? ja : en);
