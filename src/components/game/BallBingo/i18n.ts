/**
 * Ball Bingo's words, in English and Japanese.
 *
 * Medals are never spoken of as money (the owner: 「本当のお金と誤解される書き方は
 * しないでほしい。」): they are "your medals" / 「持ちメダル」, a win "gives"
 * medals, and the note that they are not money (`NOT_MONEY`) is shown under
 * the machine. `tests/unit/components/game/BallBingo/render.test.tsx` reads
 * every string here for words that would say otherwise.
 *
 * The words of the game — BINGO, REACH (リーチ), FREE, CHANCE, OUT, a line —
 * are everybody's. The machine's name is a plain description of what it is.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import { BALLS_PER_GAME, CHANCE_BALLS, FREE_MOST, WEIGHT_TOTAL } from './engine';

export interface BingoStrings {
  title: string;
  subtitle: string;
  centerLink: string;
  howToPlay: string;
  infoBody: (rtp: string) => string[];
  tabMachine: string;
  tabOdds: string;
  // The cabinet
  marquee: string;
  marqueeSub: string;
  cardLabel: string;
  /** What the card says to a screen reader: which numbers are marked, and the lines held. */
  cardSays: (marked: number[], lines: number) => string;
  boardLabel: (state: string) => string;
  boardIdle: string;
  boardFlying: string;
  pocketName: (kind: 'number' | 'out' | 'free' | 'chance', number: number) => string;
  chanceTime: string;
  free: string;
  freeLeft: (left: number) => string;
  reach: string;
  medals: string;
  bet: string;
  balls: string;
  win: string;
  lines: (n: number) => string;
  fullCard: string;
  /** The pay glass on the cabinet: its caption, and the full card's short name in it. */
  stripCaption: string;
  stripAll: string;
  start: string;
  launch: string;
  flying: string;
  skip: string;
  auto: string;
  autoOn: string;
  /** The quick mode's switch, and what it says to a screen reader. */
  speed: string;
  speedAria: string;
  betAria: (n: number) => string;
  keysHint: string;
  /** The result line under the meters. */
  ready: string;
  inPlay: (left: number) => string;
  resultWin: (lines: number, medals: number) => string;
  resultFull: (medals: number) => string;
  resultLose: string;
  outOfMedals: string;
  notEnough: (bet: number) => string;
  resumed: string;
  paidAlready: string;
  // Read out
  sayStart: (bet: number) => string;
  sayPocket: (pocket: string, reach: boolean) => string;
  sayFree: string;
  sayChance: string;
  sayEnd: (lines: number, medals: number) => string;
  sayRestart: string;
  sayRefill: (medals: number) => string;
  // The medal center
  refill: (medals: number) => string;
  cardAway: string;
  playHere: string;
  notMoney: string;
  centerNote: string;
  centerNoteLink: string;
  // The panel beside the cabinet
  payTitle: string;
  payColLines: string;
  payColBet: (bet: number) => string;
  sessionTitle: string;
  games: string;
  played: string;
  won: string;
  net: string;
  seenReturn: string;
  exactReturn: string;
  biggest: string;
  recentTitle: string;
  recentLine: (lines: number, medals: number) => string;
  // Odds
  oddsTitle: string;
  oddsIntro: string[];
  rtp: string;
  edge: string;
  hit: string;
  fullCardOdds: string;
  chanceOdds: string;
  freeOdds: string;
  meanShots: string;
  meanMarks: string;
  spread: string;
  gamesForOnePercent: string;
  gamesForOnePercentNote: string;
  linesTitle: string;
  linesIntro: string;
  colLines: string;
  colChance: string;
  colOneIn: string;
  colPays: string;
  colShare: string;
  /** The note under the table for the full card's row, which is marked with a star. */
  fullCardMark: string;
  total: string;
  impossible: string;
  pocketsTitle: string;
  pocketsIntro: string;
  colPocket: string;
  colWeight: string;
  colEach: string;
  pocketKind: Record<'number' | 'out' | 'free' | 'chance', string>;
  rulesTitle: string;
  rules: string[];
  cardTitle: string;
  cardIntro: string;
  chanceShare: (share: string) => string;
  howTitle: string;
  how: string[];
  sourcesTitle: string;
  sources: string[];
}

const EN: BingoStrings = {
  title: 'Ball Bingo',
  subtitle: 'The ball-drop bingo of the medal corner. Bet up to three medals, shoot the balls through the pins, and every numbered pocket marks its number on your 3 × 3 card. Lines pay, more lines pay more, and the exact odds of every one are on the Odds tab.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  infoBody: (rtp) => [
    `Choose your bet (1, 2 or 3 medals) and press START. A game has ${BALLS_PER_GAME} balls. Press LAUNCH to shoot each one up the lane: it runs round the arch, drops through the pins and comes to rest in a pocket.`,
    'A numbered pocket marks its number on the card, and the ball stays in it until the game is over, so no number comes twice. Three marked in a row, a column or a diagonal is a line. The OUT gutters at the sides give nothing.',
    `The two FREE pockets give the ball back with one more (up to ${FREE_MOST} a game). The CHANCE pocket keeps its ball and starts CHANCE TIME: ${CHANCE_BALLS} more balls.`,
    'When the balls run out (or every number is marked) the card is paid: 1 line 2 medals a medal bet, up to 500 for the full card. REACH lights when a line wants one more number.',
    `Every ball’s pocket is drawn from published chances when you press START, and the ball is then shot and bounced to it. In the long run the machine gives back ${rtp} of the medals bet, on any bet: worked out exactly on the Odds tab.`,
    'SKIP drops the rest of a game’s balls at once; AUTO shoots them for you; 2× makes them fly twice as fast. You play with your medals from the Medal Game Center, the same medals as every machine there.',
    NOT_MONEY.en,
  ],
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  marquee: 'BALL BINGO',
  marqueeSub: 'ボールビンゴ',
  cardLabel: 'Your card',
  cardSays: (marked, lines) =>
    `Bingo card. ${marked.length === 0 ? 'No numbers marked yet' : `Marked: ${marked.join(', ')}`}. ${lines === 0 ? 'No lines' : lines === 1 ? 'One line' : `${lines} lines`}.`,
  boardLabel: (state) => `The field. ${state}`,
  boardIdle: 'Waiting for a game.',
  boardFlying: 'A ball is falling through the pins.',
  pocketName: (kind, number) => (kind === 'number' ? `number ${number}` : kind === 'out' ? 'OUT' : kind === 'free' ? 'FREE' : 'CHANCE'),
  chanceTime: 'CHANCE TIME',
  free: 'FREE',
  freeLeft: (left) => `Free balls left this game: ${left}`,
  reach: 'REACH',
  medals: 'MEDALS',
  bet: 'BET',
  balls: 'BALLS',
  win: 'WIN',
  lines: (n) => (n === 1 ? '1 line' : `${n} lines`),
  fullCard: 'FULL CARD',
  stripCaption: 'Lines held · medals they pay at this bet',
  stripAll: 'ALL',
  start: 'START',
  launch: 'LAUNCH',
  flying: 'In play…',
  skip: 'SKIP',
  auto: 'AUTO',
  autoOn: 'AUTO on',
  speed: '2×',
  speedAria: '2× speed: the balls fly twice as fast',
  betAria: (n) => `Bet ${n} medal${n === 1 ? '' : 's'} a game`,
  keysHint: 'Keys: Space or Enter starts and launches · S skips · A auto · F 2× speed · 1 2 3 choose the bet',
  ready: 'Choose a bet and press START.',
  inPlay: (left) => `${left} ball${left === 1 ? '' : 's'} to go.`,
  resultWin: (lines, medals) => `BINGO! ${lines === 1 ? '1 line' : `${lines} lines`}: ${medals} medals.`,
  resultFull: (medals) => `FULL CARD! ${medals} medals.`,
  resultLose: 'No line this game.',
  outOfMedals: 'You have no medals left.',
  notEnough: (bet) => `Not enough medals for a bet of ${bet}.`,
  resumed: 'Carrying on with the game left under way: the same balls, into the same pockets.',
  paidAlready: 'Its medals were given as the page closed: they are in your medals already.',
  sayStart: (bet) => `Game started, ${bet} medal${bet === 1 ? '' : 's'} bet.`,
  sayPocket: (pocket, reach) => `The ball went into ${pocket}.${reach ? ' Reach!' : ''}`,
  sayFree: 'FREE: the ball comes back with one more.',
  sayChance: `CHANCE TIME: ${CHANCE_BALLS} more balls.`,
  sayEnd: (lines, medals) => (lines === 0 ? 'Game over. No line.' : `Game over. ${lines === 1 ? 'One line' : `${lines} lines`}: ${medals} medals.`),
  sayRestart: 'Your medals were reset at the Medal Game Center: this machine has started over.',
  sayRefill: (medals) => `The attendant brought ${medals} medals.`,
  refill: (medals) => `Out of medals — take ${medals} more`,
  cardAway: 'Your medals are being played on a machine in another tab. This machine waits where it is.',
  playHere: 'Play here',
  notMoney: NOT_MONEY.en,
  centerNote: 'These are your medals from the Medal Game Center, shared by every machine there. The daily bonus and the reset are on its front page.',
  centerNoteLink: 'Go to the Medal Game Center',
  payTitle: 'What a card pays',
  payColLines: 'Lines',
  payColBet: (bet) => `${bet} bet`,
  sessionTitle: 'This visit',
  games: 'Games',
  played: 'Medals played',
  won: 'Medals won',
  net: 'Ahead / behind',
  seenReturn: 'Return seen',
  exactReturn: 'Exact return',
  biggest: 'Biggest win',
  recentTitle: 'Last games',
  recentLine: (lines, medals) => (lines === 0 ? 'no line' : `${lines === 8 ? 'full card' : lines === 1 ? '1 line' : `${lines} lines`} · +${medals}`),
  oddsTitle: 'The exact odds',
  oddsIntro: [
    `Every pocket has a published weight out of ${WEIGHT_TOTAL}. Each ball goes into one of the pockets open at that moment, with a chance of its weight over the weights of all the open ones. A number with a ball in it is closed for the rest of the game; the FREE pockets close once they have given ${FREE_MOST} free balls; CHANCE closes once it holds its ball; OUT never closes.`,
    'The figures below are not counted from games played. They are worked out exactly, by dynamic programming over every state a game can be in: the numbers marked (512 of them), the balls still to come, the free balls given and whether CHANCE TIME has come. A game’s return is what every one of those states leads to, each by its chance.',
  ],
  rtp: 'Return to player',
  edge: 'Kept by the machine',
  hit: 'Games that pay',
  fullCardOdds: 'Full card',
  chanceOdds: 'CHANCE TIME comes',
  freeOdds: 'At least one free ball',
  meanShots: 'Balls shot a game, on average',
  meanMarks: 'Numbers marked a game, on average',
  spread: 'Spread of a game’s pay (σ, per medal bet)',
  gamesForOnePercent: 'Games for ±1 point',
  gamesForOnePercentNote: 'How many games before the return you see is within one point of the exact return, 95 times in 100. The rare full card makes it a long wait.',
  linesTitle: 'Lines at the end of a game',
  linesIntro: 'The chance of a game ending with each count of lines, what it pays a medal bet, and what it adds to the return. Seven lines cannot be held on a 3 × 3 card: the eighth comes with the seventh.',
  colLines: 'Lines',
  colChance: 'Chance',
  colOneIn: '1 game in',
  colPays: 'Pays',
  colShare: 'Adds',
  fullCardMark: '★ The full card: all eight lines.',
  total: 'Total',
  impossible: 'cannot happen',
  pocketsTitle: 'The pockets',
  pocketsIntro: 'Each pocket’s weight, and its chance while every pocket is open (the first ball’s chances).',
  colPocket: 'Pocket',
  colWeight: 'Weight',
  colEach: 'First ball',
  pocketKind: { number: 'Number', out: 'OUT', free: 'FREE', chance: 'CHANCE' },
  rulesTitle: 'The rules the figures follow',
  rules: [
    `A game starts with ${BALLS_PER_GAME} balls, and ends when they run out or every number is marked.`,
    'A ball in a numbered pocket marks its number and stays: no number comes twice in a game.',
    `FREE: the ball comes back with one more ball, so there is one more to come than before it was shot. At most ${FREE_MOST} a game.`,
    `CHANCE: the ball stays, and ${CHANCE_BALLS} more balls come (CHANCE TIME). Once a game.`,
    'OUT: the ball is gone.',
    'The card pays by the lines it holds when the game is over, times the medals bet.',
  ],
  cardTitle: 'The card',
  cardIntro: 'Every row, column and diagonal adds up to 15. The middle number, 5, is in four lines; each corner in three; each edge in two.',
  chanceShare: (share) => `Games with CHANCE TIME bring back ${share} of everything the machine returns.`,
  howTitle: 'How the ball finds its pocket',
  how: [
    'The pocket of every ball of a game is drawn when START is pressed, from the chances above, and nothing after that changes it.',
    'The ball is then shot up the lane at a strength the machine picks, runs round the arch until it is too slow to hold to it, and falls under gravity through the pins, bouncing off each one: a physics model of the field, worked out without being drawn. The machine tries strengths until a ball comes down in the pocket drawn, and shows that flight. Nothing about the flight is invented except the strength of the shot.',
    'The field was set so that a ball shot at any strength lands about as often in each kind of pocket as the chances say: the flights you see are the field’s own.',
    '2× shows the same flights at twice the pace. The pockets were drawn at START, so it changes nothing about the odds.',
  ],
  sourcesTitle: 'What it follows',
  sources: [
    'The bingo pinballs of the 1950s: a field of 25 numbered holes, five balls a game, a ball staying in its hole, three, four or five in a line paying more.',
    'The ball bingo machines of the Japanese medal corner that followed them: 25 numbered holes and a hole that gives the ball back, five balls a game and up to three extra balls, three, four and five in a line paying from 4 to 600 medals.',
    'The big bingo machines of today’s arcades: five balls a game into numbered holes, a hole that shoots the ball again, features that add lines and balls; and bingo bonus games played on a 3 × 3 card.',
    'Medal games are said to be set to give back about 85 to 95% of the medals played; this one gives back about 90%.',
  ],
};

const JA: BingoStrings = {
  title: 'ボールビンゴ',
  subtitle: 'メダルコーナーの定番、ボールのビンゴです。メダルを最大3枚ベットしてボールを打ち出し、釘の間を落ちたボールが入った数字のポケットが3×3のカードに開きます。ラインがそろうと払い出し、ラインが多いほど多くもらえます。すべてのラインの正確な確率は「確率」タブにあります。',
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  infoBody: (rtp) => [
    `ベット（1〜3枚）を選んでSTARTを押します。1ゲームはボール${BALLS_PER_GAME}球。「発射」を押すたびに1球がレーンを上ってアーチを回り、釘の間を落ちてポケットに入ります。`,
    '数字のポケットに入るとカードのその数字が開き、ボールはゲームが終わるまでポケットに残るので、同じ数字は2度出ません。縦・横・斜めに3つそろうと1ライン。両端のOUTに入ると何もありません。',
    `FREEポケットはボールを返し、もう1球くれます（1ゲーム${FREE_MOST}回まで）。CHANCEポケットはボールを残してチャンスタイムになり、ボールが${CHANCE_BALLS}球増えます。`,
    'ボールがなくなる（またはすべての数字が開く）とカードの払い出しです。1ラインはベット1枚につき2枚、全部そろうと500枚。あと1つでラインになる数字があるとREACHが光ります。',
    `各ボールが入るポケットは、STARTを押したときに公開した確率で決まり、ボールはそのポケットまで打ち出され、跳ねて落ちます。長い目で見ると、どのベットでもメダルの${rtp}が戻ります。正確な計算は「確率」タブにあります。`,
    '「スキップ」でそのゲームの残りのボールをまとめて落とし、「オート」で自動で打ち出し、「2×」でボールが2倍の速さで飛びます。遊ぶメダルはメダルゲームセンターの持ちメダルで、センターのどのマシンでも同じです。',
    NOT_MONEY.ja,
  ],
  tabMachine: 'マシン',
  tabOdds: '確率',
  marquee: 'BALL BINGO',
  marqueeSub: 'ボールビンゴ',
  cardLabel: 'ビンゴカード',
  cardSays: (marked, lines) => `ビンゴカード。${marked.length === 0 ? 'まだ開いた数字はありません' : `開いた数字：${marked.join('、')}`}。${lines === 0 ? 'ラインなし' : `${lines}ライン`}。`,
  boardLabel: (state) => `盤面。${state}`,
  boardIdle: 'ゲームを待っています。',
  boardFlying: 'ボールが釘の間を落ちています。',
  pocketName: (kind, number) => (kind === 'number' ? `${number}番` : kind === 'out' ? 'OUT' : kind === 'free' ? 'FREE' : 'CHANCE'),
  chanceTime: 'チャンスタイム',
  free: 'FREE',
  freeLeft: (left) => `このゲームのFREEはあと${left}回`,
  reach: 'リーチ',
  medals: '持ちメダル',
  bet: 'ベット',
  balls: 'ボール',
  win: '獲得',
  lines: (n) => `${n}ライン`,
  fullCard: 'パーフェクト',
  stripCaption: 'そろったライン数・このベットでの払い出し',
  stripAll: '全部',
  start: 'START',
  launch: '発射',
  flying: 'プレイ中…',
  skip: 'スキップ',
  auto: 'オート',
  autoOn: 'オート中',
  speed: '2×',
  speedAria: '2× 高速：ボールが2倍の速さで飛びます',
  betAria: (n) => `1ゲーム${n}枚ベット`,
  keysHint: 'キー：Space か Enter でスタートと打ち出し・S でスキップ・A でオート・F で2倍速・1 2 3 でベット',
  ready: 'ベットを選んでSTARTを押してください。',
  inPlay: (left) => `残り${left}球。`,
  resultWin: (lines, medals) => `ビンゴ！ ${lines}ラインで${medals}枚。`,
  resultFull: (medals) => `パーフェクト！ ${medals}枚。`,
  resultLose: 'このゲームはラインなし。',
  outOfMedals: '持ちメダルがありません。',
  notEnough: (bet) => `${bet}枚ベットするには持ちメダルが足りません。`,
  resumed: '途中だったゲームの続きです。同じボールが同じポケットに入ります。',
  paidAlready: 'このゲームのメダルはページを閉じたときに払い出し済みで、持ちメダルに入っています。',
  sayStart: (bet) => `${bet}枚ベットでゲーム開始。`,
  sayPocket: (pocket, reach) => `ボールが${pocket}に入りました。${reach ? 'リーチ！' : ''}`,
  sayFree: 'FREE：ボールが戻って、もう1球。',
  sayChance: `チャンスタイム：ボールが${CHANCE_BALLS}球増えます。`,
  sayEnd: (lines, medals) => (lines === 0 ? 'ゲーム終了。ラインなし。' : `ゲーム終了。${lines}ラインで${medals}枚。`),
  sayRestart: 'メダルゲームセンターでメダルがリセットされたので、この台も最初からになりました。',
  sayRefill: (medals) => `係員がメダルを${medals}枚持ってきました。`,
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  cardAway: 'メダルは別のタブのマシンで遊ばれています。このマシンはそのまま待っています。',
  playHere: 'ここで遊ぶ',
  notMoney: NOT_MONEY.ja,
  centerNote: 'このメダルはメダルゲームセンターの持ちメダルで、センターのどのマシンでも同じです。デイリーボーナスとリセットはセンターの入口ページにあります。',
  centerNoteLink: 'メダルゲームセンターへ',
  payTitle: 'カードの払い出し',
  payColLines: 'ライン',
  payColBet: (bet) => `${bet}枚`,
  sessionTitle: '今回の記録',
  games: 'ゲーム数',
  played: '遊んだメダル',
  won: 'もらったメダル',
  net: '差し引き',
  seenReturn: '実際の戻り',
  exactReturn: '正確な戻り',
  biggest: '最大の当たり',
  recentTitle: '最近のゲーム',
  recentLine: (lines, medals) => (lines === 0 ? 'ラインなし' : `${lines === 8 ? 'パーフェクト' : `${lines}ライン`}・+${medals}`),
  oddsTitle: '正確な確率',
  oddsIntro: [
    `ポケットにはそれぞれ公開した重み（全体で${WEIGHT_TOTAL}）があります。各ボールは、そのとき開いているポケットのどれかに、その重み÷開いているポケットの重みの合計の確率で入ります。ボールが入った数字はゲームの終わりまで閉じ、FREEは${FREE_MOST}回出すと閉じ、CHANCEはボールが入ると閉じます。OUTは閉じません。`,
    '下の数字は遊んだゲームから数えたものではありません。ゲームがなりうるすべての状態（開いた数字512通り、残りのボール数、出たFREEの数、チャンスタイムの有無）をたどる動的計画法で、正確に計算しています。1ゲームの戻りは、それぞれの状態が行き着く先を確率どおりに足し合わせたものです。',
  ],
  rtp: 'ペイアウト率（戻り）',
  edge: 'マシンに残る分',
  hit: '払い出しのあるゲーム',
  fullCardOdds: 'パーフェクト',
  chanceOdds: 'チャンスタイムになる',
  freeOdds: 'FREEが1回以上',
  meanShots: '1ゲームに打つボール（平均）',
  meanMarks: '1ゲームに開く数字（平均）',
  spread: '1ゲームの払い出しのばらつき（σ、ベット1枚あたり）',
  gamesForOnePercent: '±1ポイントまでのゲーム数',
  gamesForOnePercentNote: '実際の戻りが正確な戻りの±1ポイント以内に入るまで（100回に95回）のゲーム数です。まれなパーフェクトがあるので長くかかります。',
  linesTitle: 'ゲーム終了時のライン数',
  linesIntro: 'ゲームがそれぞれのライン数で終わる確率、ベット1枚あたりの払い出し、戻りへの寄与です。3×3のカードでは7ラインはありえません（7本目がそろうと8本目もそろいます）。',
  colLines: 'ライン',
  colChance: '確率',
  colOneIn: '何回に1回',
  colPays: '配当',
  colShare: '寄与',
  fullCardMark: '★ パーフェクト：8ライン全部。',
  total: '合計',
  impossible: 'ありえない',
  pocketsTitle: 'ポケット',
  pocketsIntro: '各ポケットの重みと、すべてのポケットが開いているとき（1球目）の確率です。',
  colPocket: 'ポケット',
  colWeight: '重み',
  colEach: '1球目',
  pocketKind: { number: '数字', out: 'OUT', free: 'FREE', chance: 'CHANCE' },
  rulesTitle: '計算のルール',
  rules: [
    `1ゲームはボール${BALLS_PER_GAME}球で始まり、ボールがなくなるかすべての数字が開くと終わります。`,
    '数字のポケットに入ったボールはその数字を開いて残ります。同じ数字は1ゲームに2度出ません。',
    `FREE：ボールが戻ってもう1球もらえるので、打つ前より残りが1球増えます。1ゲーム${FREE_MOST}回まで。`,
    `CHANCE：ボールは残り、ボールが${CHANCE_BALLS}球増えます（チャンスタイム）。1ゲーム1回。`,
    'OUT：ボールはなくなります。',
    'ゲームが終わったときにカードにあるライン数で、ベット枚数をかけて払い出します。',
  ],
  cardTitle: 'カード',
  cardIntro: '縦・横・斜めのどの列も合計が15になります。真ん中の5は4本のラインに、四隅はそれぞれ3本、辺の真ん中は2本に入っています。',
  chanceShare: (share) => `チャンスタイムになったゲームが、マシンの戻り全体の${share}を占めます。`,
  howTitle: 'ボールがポケットに入るまで',
  how: [
    'そのゲームのすべてのボールが入るポケットは、STARTを押したときに上の確率で決まり、その後は何も変わりません。',
    'ボールはマシンが選んだ強さでレーンを打ち上げられ、遅くなってアーチから離れるところまで回り、重力で釘の間を跳ねながら落ちます。盤面の物理モデルを、描かずに最後まで計算したものです。マシンは決まったポケットに入るまで打つ強さを変えて試し、その飛び方を見せます。作っているのは打つ強さだけで、飛び方はすべて物理です。',
    'どの強さで打っても、それぞれの種類のポケットにだいたい確率どおりに入るように盤面を調整しています。見えるボールの動きは盤面そのものの動きです。',
    '2×は同じ飛び方を2倍の速さで見せます。ポケットはSTARTのときに決まっているので、確率は何も変わりません。',
  ],
  sourcesTitle: '参考にした実機',
  sources: [
    '1950年代のビンゴピンボール：25の数字の穴、1ゲーム5球、ボールは穴に残り、3つ・4つ・5つ並ぶほど配当が上がる。',
    'その後の日本のメダルコーナーのボールビンゴ：25の数字の穴とボールを戻す穴、1ゲーム5球と最大3球の追加球、3・4・5並びで4枚〜600枚。',
    '今のゲームセンターの大型ビンゴ：1ゲーム5球を数字の穴へ、ボールを打ち直す穴、ラインやボールを増やすフィーチャー。3×3のカードで遊ぶビンゴのボーナスゲーム。',
    'メダルゲームのペイアウト率は、遊んだメダルの85〜95%ぐらいに設定されていることが多いといわれます。この台は約90%です。',
  ],
};

export const STRINGS: Record<GameLanguage, BingoStrings> = { en: EN, ja: JA };
export const getStrings = (language: GameLanguage): BingoStrings => STRINGS[language] ?? EN;
