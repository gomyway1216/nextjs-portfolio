/**
 * Local ja/en strings for video poker, consumed via useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import type { HandName } from './engine';
import type { StrategyId } from './sim';

export interface VideoPokerStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabOdds: string;
  tabSim: string;
  howToPlay: string;
  infoBody: string[];
  hand: Record<HandName, string>;
  // The medal center
  centerLink: string;
  noticeTitle: string;
  noticeBody: string;
  noticeLink: string;
  noticeDismiss: string;
  cardAway: string;
  playHere: string;
  findingMedals: string;
  /** Storage will not keep the hand just now, so nothing was bet or won. */
  unsaved: string;
  refill: (medals: number) => string;
  sayRefill: (medals: number) => string;
  sayReset: string;
  // Play
  medals: string;
  bet: string;
  win: string;
  net: string;
  betOne: string;
  betMax: string;
  deal: string;
  draw: string;
  hold: string;
  held: string;
  holdAria: (card: string, held: boolean) => string;
  cardBack: string;
  payTableLabel: string;
  /** Column header of the pay table: the bet it pays for, and whether that is the current bet. */
  coinColumn: (coins: number, current: boolean) => string;
  payTableOption: (id: string, payback: string) => string;
  coins: (n: number) => string;
  pressDeal: string;
  chooseHolds: (bet: number) => string;
  resultWin: (hand: string, won: number, amount: string) => string;
  resultLose: string;
  noMedals: string;
  bestTitle: string;
  bestToggle: string;
  holdBest: string;
  calculating: string;
  discardAll: string;
  holdAll: string;
  yourHold: string;
  evUnit: string;
  bestNote: string;
  mistake: (cost: string) => string;
  perfect: string;
  statsTitle: string;
  statHands: string;
  statReturn: string;
  statPerfect: string;
  statMistakeCost: string;
  hint: string[];
  // Odds
  oddsIntro: string;
  paybackTitle: string;
  paybackNote: (classes: string, deals: string) => string;
  statHouseEdge: string;
  statVariance: string;
  statShortCoin: string;
  statRoyalEvery: string;
  finalTitle: string;
  finalIntro: string;
  colHand: string;
  colPays: string;
  colProbability: string;
  colOneIn: string;
  colContribution: string;
  colDealt: string;
  tablesTitle: string;
  tablesIntro: string;
  colPayTable: string;
  colFullHouseFlush: string;
  colPayback: string;
  colEdge: string;
  colPer1000: string;
  holdTitle: string;
  holdIntro: string;
  holdLabel: (n: number) => string;
  callsTitle: string;
  callsIntro: string;
  callName: Record<'flushOverPair' | 'pairOverStraight' | 'breakFlush' | 'noKicker' | 'pairOverRoyal3', string>;
  // Simulation
  run: string;
  running: (pct: number) => string;
  handsLabel: string;
  sessionsLabel: string;
  handsPerSessionLabel: string;
  stratTitle: string;
  stratIntro: string;
  strategyName: Record<StrategyId, string>;
  strategyRule: Record<StrategyId, string>;
  colStrategy: string;
  colExact: string;
  colSimulated: (hands: string) => string;
  colDiffered: string;
  colRoyals: string;
  stratNote: string;
  sessionTitle: string;
  sessionIntro: string;
  sessExpected: string;
  sessMean: string;
  sessMedian: string;
  sessAhead: string;
  sessRoyal: string;
  sessRoyalExact: (pct: string) => string;
  sessMedianNoRoyal: string;
  sessAxis: string;
  sessOffChart: (count: string, cap: string) => string;
  // The histogram as a table, for screen readers.
  sessTableCaption: (expected: string) => string;
  sessColRange: string;
  sessColCount: string;
  sessRange: (from: string, to: string) => string;
  sessRangeOver: (cap: string) => string;
  sessionNote: string;
}

const en: VideoPokerStrings = {
  title: 'Video Poker',
  subtitle:
    'Jacks or Better — the one machine where your choices matter. Play it with your medals from the Medal Game Center and the exact value of every possible hold, then see how a “9/6” machine returns 99.54% and what each cheaper pay table gives up.',
  tabPlay: 'Machine',
  tabOdds: 'Odds',
  tabSim: 'Simulation',
  howToPlay: 'How to play',
  infoBody: [
    'The machine plays with your medals from the Medal Game Center: the same medals as every other machine there. Bet 1–5 medals and press DEAL to get five cards from a fresh 52-card deck. The bet comes out of your medals as the cards are dealt.',
    'Tap the cards you want to keep (HELD), then press DRAW: every other card is replaced once from the same deck. What the final hand wins, by the table at the top, goes into your medals.',
    'A pair of jacks or better is the lowest winning hand. A royal flush wins 250 medals for each medal bet, but 4,000 on a five-medal bet — which is why you bet five.',
    'A hand that has been dealt stays dealt: reload the page, or come back to it in another tab, and the same five cards are waiting, with the same cards to come.',
    'There are 32 ways to play every deal. The Best play panel shows the five best of them, plus your own hold, each with its exact expected return, counted over every card that could be drawn.',
    NOT_MONEY.en,
  ],
  hand: {
    nothing: 'Nothing',
    jacksOrBetter: 'Jacks or Better',
    twoPair: 'Two Pair',
    threeOfAKind: 'Three of a Kind',
    straight: 'Straight',
    flush: 'Flush',
    fullHouse: 'Full House',
    fourOfAKind: 'Four of a Kind',
    straightFlush: 'Straight Flush',
    royalFlush: 'Royal Flush',
  },
  centerLink: 'Medal Game Center',
  noticeTitle: 'Video Poker now plays with your medals',
  noticeBody:
    'This machine now plays with your medals from the Medal Game Center, the same medals as every other machine there. The 1,000 it used to start every visit with are gone, and were not added to your medals.',
  noticeLink: 'Go to the Medal Game Center',
  noticeDismiss: 'Got it',
  cardAway: 'Your medals are being played on a machine in another tab. This machine waits where it is.',
  playHere: 'Play here',
  findingMedals: 'Looking for your medals…',
  unsaved: 'This browser cannot save the hand just now, so nothing was bet or won. Try again in a moment.',
  refill: (medals) => `Out of medals — take ${medals} more`,
  sayRefill: (medals) => `${medals} medals added.`,
  sayReset: 'Your medals were reset at the Medal Game Center: this machine starts over, and the hand that was on it is gone.',
  medals: 'Medals',
  bet: 'Bet',
  win: 'Win',
  net: 'Net medals',
  betOne: 'Bet one',
  betMax: 'Bet max',
  deal: 'DEAL',
  draw: 'DRAW',
  hold: 'Hold',
  held: 'HELD',
  holdAria: (card, held) => `${card}${held ? ', held' : ''}`,
  cardBack: 'Face-down card',
  payTableLabel: 'Pay table',
  coinColumn: (coins, current) => `${coins} ${coins === 1 ? 'medal' : 'medals'}${current ? ' (current bet)' : ''}`,
  payTableOption: (id, payback) => `${id} · ${payback}`,
  coins: (n) => (n === 1 ? '1 medal' : `${n} medals`),
  pressDeal: 'Press DEAL to start.',
  chooseHolds: (bet) => `BET ${bet} ${bet === 1 ? 'medal' : 'medals'}. Tap the cards to hold, then DRAW.`,
  resultWin: (hand, won, amount) => `${hand}! Won ${amount} ${won === 1 ? 'medal' : 'medals'}`,
  resultLose: 'No win.',
  noMedals: 'Not enough medals for that bet.',
  bestTitle: 'Best play',
  bestToggle: 'Show the best play',
  holdBest: 'Hold the best',
  calculating: 'Calculating every draw…',
  discardAll: 'Discard everything',
  holdAll: 'Hold all five',
  yourHold: 'your hold',
  evUnit: '× bet',
  bestNote: 'Expected return per medal bet, exact: every card that could be drawn is counted (up to 1,533,939 draws).',
  mistake: (cost) => `That hold gives up ${cost} × your bet on average.`,
  perfect: 'That is the best play.',
  statsTitle: 'This session',
  statHands: 'Hands',
  statReturn: 'Returned',
  statPerfect: 'Best plays',
  statMistakeCost: 'Given up by other holds',
  hint: [
    'The meters are in medals. Betting five medals is what unlocks the 4,000-medal royal.',
    'Never hold a kicker with a pair, and almost never break a paying pair — the panel shows why.',
    'The pay table changes the best play only in a few close hands.',
  ],
  oddsIntro:
    'Video poker deals from one honest 52-card deck, so everything can be counted: all 2,598,960 deals, each of the 32 ways to play them, and every card the draw could bring. With the best hold for every deal, that gives the machine’s exact return. Nothing on this tab is simulated, and nothing on it touches your medals.',
  paybackTitle: 'Return with perfect play',
  paybackNote: (classes, deals) =>
    `At five medals a hand. Computed from the best of 32 holds for each of the ${classes} suit-distinct deals, weighted over all ${deals}.`,
  statHouseEdge: 'House edge',
  statVariance: 'Variance',
  statShortCoin: 'Return at 1–4 medals',
  statRoyalEvery: 'Hands per royal flush',
  finalTitle: 'Where the return comes from',
  finalIntro:
    'How often perfect play ends on each hand, and how much of the return it provides. The royal flush comes once in about 40,000 hands yet carries two percent of the return — in the short run you are playing a worse game than the label says.',
  colHand: 'Hand',
  colPays: 'Wins per medal',
  colProbability: 'After the draw',
  colOneIn: '1 in',
  colContribution: 'Share of return',
  colDealt: 'On the deal',
  tablesTitle: 'The same game at six prices',
  tablesIntro:
    'Machines differ in only two lines — what a full house and a flush win. Each medal taken off those lines costs about 1.1 points of return.',
  colPayTable: 'Machine',
  colFullHouseFlush: 'Full house / flush',
  colPayback: 'Return',
  colEdge: 'House edge',
  colPer1000: 'Medals lost per 1,000 hands at 5 medals',
  holdTitle: 'How many cards perfect play keeps',
  holdIntro: 'Most of the time the right play is two cards — usually a pair or two high cards. Throwing all five away is right about one hand in thirty.',
  holdLabel: (n) => (n === 0 ? 'None' : n === 5 ? 'All five' : String(n)),
  callsTitle: 'Close calls',
  callsIntro: 'Five deals where instinct and arithmetic disagree: the exact value of the best play against the tempting one, on this pay table.',
  callName: {
    flushOverPair: 'Four to a flush beats a low pair',
    pairOverStraight: '…but a low pair beats four to a straight',
    breakFlush: 'Break a made flush for four to a royal',
    noKicker: 'Never keep a kicker',
    pairOverRoyal3: 'A high pair beats three to a royal',
  },
  run: 'Run',
  running: (pct) => `Running… ${pct}%`,
  handsLabel: 'Hands',
  sessionsLabel: 'Sessions',
  handsPerSessionLabel: 'Hands per session',
  stratTitle: 'Perfect play against two habits, on the same deals',
  stratIntro:
    'Every strategy gets the same five cards and the same replacement cards on a 9/6 machine, betting five medals a hand. The return is shown per medal bet, so a royal flush counts as 800 per medal. The dashed lines are each strategy’s exact return. Nothing here touches your medals.',
  strategyName: { optimal: 'Perfect play', simple: 'Common-sense rules', madeOnly: 'Keep only what already pays' },
  strategyRule: {
    optimal: 'The hold with the highest exact expectation, every hand.',
    simple: 'Keep a made straight or better; otherwise any pair, two pair or three of a kind; otherwise four to a flush; otherwise every jack or higher; otherwise draw five.',
    madeOnly: 'Hold a paying hand if you are dealt one; otherwise throw all five away.',
  },
  colStrategy: 'Strategy',
  colExact: 'Exact return',
  colSimulated: (hands) => `Simulated (${hands} hands)`,
  colDiffered: 'Hands played differently',
  colRoyals: 'Royals',
  stratNote:
    'The ± is a 95% range. A single royal flush moves the return of 100,000 hands by 0.8 points, which is why video poker results take so long to settle.',
  sessionTitle: 'One evening at the machine',
  sessionIntro:
    'Sessions of perfect play at five medals a hand on a 9/6 machine, played here with simulated medals. On average a session loses exactly what the return says — but that average is propped up by rare royal flushes, so the typical session does worse.',
  sessExpected: 'Exact expectation',
  sessMean: 'Average result',
  sessMedian: 'Typical (median) result',
  sessAhead: 'Sessions that ended ahead',
  sessRoyal: 'Sessions with a royal',
  sessRoyalExact: (pct) => `exact: ${pct}`,
  sessMedianNoRoyal: 'Median without a royal',
  sessAxis: 'Net medals at the end of the session',
  sessOffChart: (count, cap) => `${count} sessions finished above +${cap} and are gathered in the last bar.`,
  sessTableCaption: (expected) => `Sessions by net medals at the end. The exact expectation is ${expected} medals.`,
  sessColRange: 'Net medals',
  sessColCount: 'Sessions',
  sessRange: (from, to) => (from === to ? from : `${from} to ${to}`),
  sessRangeOver: (cap) => `Above +${cap}`,
  sessionNote:
    'Results are in medals. Take the royal flush away and the same play returns about 97.6%: two points of the return sit in a hand you may not see for 40,000 deals.',
};

const ja: VideoPokerStrings = {
  title: 'ビデオポーカー',
  subtitle:
    'ジャックス・オア・ベター。あなたの選択で結果が変わる唯一のマシンです。メダルゲームセンターの持ちメダルで、すべての残し方の正確な期待値を見ながら遊び、「9/6」機の還元率99.54%と、配当表が下がるごとの差を確認できます。',
  tabPlay: 'マシン',
  tabOdds: '確率',
  tabSim: 'シミュレーション',
  howToPlay: '遊び方',
  infoBody: [
    'このマシンは、メダルゲームセンターの持ちメダルで遊びます。ほかのマシンと同じメダルです。1〜5枚ベットして「ディール」を押すと、52枚のデッキから5枚が配られます。ベットしたメダルは、配られたときに持ちメダルから減ります。',
    '残したいカードをタップして（HELD）、「ドロー」を押します。残さなかったカードは同じデッキから1回だけ引き直され、最終的な手で獲得したメダル（上の配当表のとおり）が持ちメダルに加わります。',
    'ジャック以上のワンペアが最低の当たりです。ロイヤルフラッシュは1枚ベットあたり250枚ですが、5枚ベットのときだけ4,000枚になります。だから5枚ベットが基本です。',
    '配られた手はそのまま残ります。ページを読み込み直しても、別のタブで開いても、同じ5枚と、同じ引き直しのカードが待っています。',
    'どの配り方にも32通りの残し方があります。「最善手」パネルには、そのうち上位5通りと自分が選んだ残し方が、引く可能性のあるカードをすべて数えた正確な期待値つきで表示されます。',
    NOT_MONEY.ja,
  ],
  hand: {
    nothing: 'ハズレ',
    jacksOrBetter: 'ジャックス・オア・ベター',
    twoPair: 'ツーペア',
    threeOfAKind: 'スリーカード',
    straight: 'ストレート',
    flush: 'フラッシュ',
    fullHouse: 'フルハウス',
    fourOfAKind: 'フォーカード',
    straightFlush: 'ストレートフラッシュ',
    royalFlush: 'ロイヤルフラッシュ',
  },
  centerLink: 'メダルゲームセンター',
  noticeTitle: 'ビデオポーカーは持ちメダルで遊ぶようになりました',
  noticeBody:
    'このマシンは、メダルゲームセンターの持ちメダルで遊ぶようになりました。ほかのマシンと同じメダルです。これまで毎回最初にあった1,000はなくなり、持ちメダルには加わりません。',
  noticeLink: 'メダルゲームセンターへ',
  noticeDismiss: 'OK',
  cardAway: 'メダルは別のタブのマシンで遊ばれています。このマシンはそのまま待っています。',
  playHere: 'ここで遊ぶ',
  findingMedals: '持ちメダルを確認しています…',
  unsaved: 'このブラウザはいま手を保存できないため、ベットも獲得もしていません。少ししてからもう一度お試しください。',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  sayRefill: (medals) => `${medals}枚もらいました。`,
  sayReset: 'メダルゲームセンターでメダルがリセットされました。このマシンも最初からになり、遊んでいた手はなくなりました。',
  medals: 'メダル',
  bet: 'ベット',
  win: '獲得',
  net: 'メダル増減',
  betOne: '1枚追加',
  betMax: 'マックスベット',
  deal: 'ディール',
  draw: 'ドロー',
  hold: 'ホールド',
  held: 'HELD',
  holdAria: (card, held) => `${card}${held ? '（ホールド中）' : ''}`,
  cardBack: '伏せたカード',
  payTableLabel: '配当表',
  coinColumn: (coins, current) => `${coins}枚${current ? '（現在のベット）' : ''}`,
  payTableOption: (id, payback) => `${id}・${payback}`,
  coins: (n) => `${n}枚`,
  pressDeal: '「ディール」を押してスタート。',
  chooseHolds: (bet) => `${bet}枚ベット。残すカードをタップして「ドロー」。`,
  resultWin: (hand, _won, amount) => `${hand}！ ${amount}枚獲得`,
  resultLose: 'ハズレ。',
  noMedals: 'メダルが足りません。',
  bestTitle: '最善手',
  bestToggle: '最善手を表示',
  holdBest: '最善手でホールド',
  calculating: 'すべての引きを計算中…',
  discardAll: '全部捨てる',
  holdAll: '5枚とも残す',
  yourHold: 'あなたの選択',
  evUnit: '倍',
  bestNote: 'ベット1枚あたりに戻ると期待できるメダルの倍率（厳密値）。引く可能性のあるカードをすべて数えています（最大1,533,939通り）。',
  mistake: (cost) => `その残し方は平均でベットの${cost}倍ぶん損です。`,
  perfect: 'それが最善手です。',
  statsTitle: 'このセッション',
  statHands: 'ハンド数',
  statReturn: '還元率',
  statPerfect: '最善手の回数',
  statMistakeCost: '最善手以外で失った期待値',
  hint: [
    'メーターの単位はメダル（枚）です。4,000枚のロイヤルは5枚ベットのときだけです。',
    'ペアにキッカーは付けない、当たりのペアはまず崩さない。パネルの数字が理由です。',
    '配当表で最善手が変わるのは、僅差のごく一部の手だけです。',
  ],
  oddsIntro:
    'ビデオポーカーは本物の52枚デッキから配るので、すべて数え上げられます。2,598,960通りの配り方、それぞれ32通りの残し方、引く可能性のあるすべてのカード。配り方ごとに最善の残し方を選べば、マシンの正確な還元率が出ます。このタブの数字はシミュレーションではなく、持ちメダルも使いません。',
  paybackTitle: '完璧にプレイしたときの還元率',
  paybackNote: (classes, deals) =>
    `5枚ベットのとき。スートの違いを除いた${classes}通りの配り方それぞれで32通りの残し方から最善を選び、全${deals}通りに重み付けして計算しています。`,
  statHouseEdge: 'ハウスエッジ',
  statVariance: '分散',
  statShortCoin: '1〜4枚ベットのときの還元率',
  statRoyalEvery: 'ロイヤルフラッシュ1回までの平均ハンド数',
  finalTitle: '還元率の内訳',
  finalIntro:
    '完璧にプレイしたときに各役で終わる確率と、還元率に占める割合です。ロイヤルフラッシュは約4万回に1回ですが、還元率の2%を担っています。短い時間では、表示されている数字より悪いゲームを遊んでいることになります。',
  colHand: '役',
  colPays: '1枚あたりの配当',
  colProbability: 'ドロー後',
  colOneIn: '何回に1回',
  colContribution: '還元率に占める割合',
  colDealt: '配られた時点',
  tablesTitle: '同じゲームの6つの値段',
  tablesIntro: 'マシンごとに違うのは、フルハウスとフラッシュの配当の2行だけです。その行から1枚減るごとに、還元率は約1.1ポイント下がります。',
  colPayTable: 'マシン',
  colFullHouseFlush: 'フルハウス / フラッシュ',
  colPayback: '還元率',
  colEdge: 'ハウスエッジ',
  colPer1000: '5枚ベットで1,000回遊んだときに減るメダル',
  holdTitle: '最善手で残す枚数',
  holdIntro: 'ほとんどの場合、正解は2枚（たいていペアかハイカード2枚）です。5枚とも捨てるのが正解なのは、およそ30回に1回です。',
  holdLabel: (n) => (n === 0 ? '0枚' : n === 5 ? '5枚とも' : `${n}枚`),
  callsTitle: '迷いやすい手',
  callsIntro: '直感と計算が食い違う5つの配り方です。この配当表での最善手と、つい選びたくなる手の正確な期待値を比べます。',
  callName: {
    flushOverPair: 'ローペアよりフラッシュ4枚',
    pairOverStraight: '…でもストレート4枚よりはローペア',
    breakFlush: '完成したフラッシュを崩してロイヤル4枚を狙う',
    noKicker: 'キッカーは残さない',
    pairOverRoyal3: 'ロイヤル3枚よりハイペア',
  },
  run: '実行',
  running: (pct) => `実行中… ${pct}%`,
  handsLabel: 'ハンド数',
  sessionsLabel: 'セッション数',
  handsPerSessionLabel: '1セッションのハンド数',
  stratTitle: '最善手と2つの「ありがちな遊び方」を同じ配りで比べる',
  stratIntro:
    'どの戦略にも同じ5枚と同じ引き直しのカードが配られます。9/6機で1ハンド5枚ベットしたときの還元率を、ベット1枚あたりで表しています（ロイヤルフラッシュは1枚あたり800）。点線は各戦略の正確な還元率です。ここでは持ちメダルは使いません。',
  strategyName: { optimal: '最善手', simple: '常識的なルール', madeOnly: '当たっている役だけ残す' },
  strategyRule: {
    optimal: '毎回、正確な期待値が最も高い残し方。',
    simple: 'ストレート以上ができていれば全部残す。なければペア・ツーペア・スリーカード、なければフラッシュ4枚、なければジャック以上を全部、どれもなければ5枚とも引き直す。',
    madeOnly: '配られた時点で当たりの役があればそれを残し、なければ5枚とも捨てる。',
  },
  colStrategy: '戦略',
  colExact: '正確な還元率',
  colSimulated: (hands) => `シミュレーション（${hands}ハンド）`,
  colDiffered: '最善手と違った手',
  colRoyals: 'ロイヤル',
  stratNote: '± は95%の幅です。ロイヤルフラッシュ1回で10万ハンドの還元率が0.8ポイント動きます。ビデオポーカーの結果がなかなか収束しないのはそのためです。',
  sessionTitle: 'マシンで過ごす一晩',
  sessionIntro:
    '9/6機で1ハンド5枚ベット、最善手でプレイしたセッションを、シミュレーション上のメダルで試します。平均すれば還元率どおりの減りで済みますが、その平均はまれなロイヤルフラッシュに支えられています。ふつうのセッションはそれより悪くなります。',
  sessExpected: '正確な期待値',
  sessMean: '平均の結果',
  sessMedian: 'ふつうの（中央値の）結果',
  sessAhead: 'プラスで終わったセッション',
  sessRoyal: 'ロイヤルが出たセッション',
  sessRoyalExact: (pct) => `理論値：${pct}`,
  sessMedianNoRoyal: 'ロイヤルなしの中央値',
  sessAxis: 'セッション終了時のメダル増減（枚）',
  sessOffChart: (count, cap) => `${count}セッションは+${cap}を超えており、右端の棒にまとめています。`,
  sessTableCaption: (expected) => `セッション終了時のメダル増減（枚）ごとのセッション数。正確な期待値は${expected}枚です。`,
  sessColRange: 'メダル増減（枚）',
  sessColCount: 'セッション数',
  sessRange: (from, to) => (from === to ? from : `${from}〜${to}`),
  sessRangeOver: (cap) => `+${cap}超`,
  sessionNote: '単位はメダル（枚）です。ロイヤルフラッシュを除くと、同じプレイでも還元率は約97.6%です。還元率のうち2ポイントは、4万回配られても出ないかもしれない1つの役の中にあります。',
};

export const getStrings = (language: GameLanguage): VideoPokerStrings => (language === 'ja' ? ja : en);
