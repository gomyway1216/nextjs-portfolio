import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import { MARBLES, PAYS, STAKE, numberOf, type Play } from './engine';

/**
 * Every word Hot Spring Smart Ball shows, in English and Japanese.
 *
 * Medals are not money, and nothing here may read as money (no bank,
 * deposit, withdraw, balance, cash, cash out, wager, payout, coin or $; no
 * 預け, 残高, お金, 円, 換金, 賭け): the medals are "your medals" /
 * 「持ちメダル」, and `notMoney` says outright that the medals are not money.
 * A real smart ball pays in balls, exchanged for prizes; here the lines pay
 * medals, and nothing is exchanged for anything.
 *
 * Japanese lines carry their own break points: a zero-width space (`​`)
 * between phrases, where Safari and Firefox, which keep Japanese words whole
 * only where the text says so, may break a line.
 */

/** A break point between Japanese phrases. */
const B = '​';

const enMedals = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'medal' : 'medals'}`;
const jaMedals = (n: number) => `${n.toLocaleString('ja-JP')}枚`;
const enLines = (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`;
const enHoles = (n: number) => `${n} ${n === 1 ? 'hole' : 'holes'}`;

/** The four columns of holes, left to right. */
const EN_COLUMNS: readonly string[] = ['far left', 'left', 'right', 'far right'];
const JA_COLUMNS: readonly string[] = ['左はし', '左より', '右より', '右はし'];

/** What a play came to, in a few words for the status line (`status`) and a sentence for a screen reader (`say`). */
function enOutcome(play: Play): { status: string; say: string } {
  const n = Math.min(play.lines.length, PAYS.length - 1);
  const lit = play.marbles.filter((m) => m.hole !== null).length;
  if (n === 0) return { status: `${enHoles(lit)} lit, no line this time`, say: `All ${MARBLES} marbles shot: ${enHoles(lit)} lit, and no line. Nothing this time.` };
  const name = n === 3 ? 'TRIPLE BINGO' : n === 2 ? 'DOUBLE BINGO' : 'BINGO';
  return { status: `${name}! +${play.won}`, say: `All ${MARBLES} marbles shot: ${enLines(n)} lit, ${enMedals(play.won)} won.` };
}

function jaOutcome(play: Play): { status: string; say: string } {
  const n = Math.min(play.lines.length, PAYS.length - 1);
  const lit = play.marbles.filter((m) => m.hole !== null).length;
  if (n === 0) return { status: `穴は${lit}個、${B}ビンゴならず`, say: `玉を${MARBLES}個打ち終わりました。穴は${lit}個、そろった列はありません。今回はなしです。` };
  return { status: `ビンゴ${n}列！${B}+${play.won}枚`, say: `玉を${MARBLES}個打ち終わりました。${n}列そろって、${jaMedals(play.won)}の当たりです。` };
}

const en = {
  title: 'Hot Spring Smart Ball',
  /** The title in the pieces it may be broken between on a narrow screen. */
  titleParts: ['Hot Spring', 'Smart Ball'],
  subtitle: 'The smart ball of the hot-spring town game rooms: pull the plunger, shoot ten glass marbles round the rail and down through the pins, and light four holes in a row for BINGO.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  sign: 'SMART BALL',
  signSub: 'HOT SPRING',
  perPlay: `${STAKE} MEDALS · ${MARBLES} BALLS`,
  /** The badge over a play from before this page that simply ended, shown again (`resumed` is a play this page finished). */
  lastPlay: 'Last play',
  medals: 'MEDALS',
  balls: 'BALLS',
  win: 'WIN',
  start: 'START',
  startAria: `START: ${STAKE} medals for ${MARBLES} marbles`,
  plunger: 'PULL',
  plungerAria: 'Plunger: hold it to draw it back, and let go to shoot the marble',
  skip: 'Skip',
  /** Why Skip waits: it only fast-forwards, once there is no marble left to shoot. */
  skipWhy: 'after the last marble',
  outLabel: 'OUT',
  /** The plate printed on the board: what the lines pay. */
  payPlate: [['1 LINE', `${PAYS[1]}`], ['2 LINES', `${PAYS[2]}`], ['3 LINES', `${PAYS[3]}`]] as [string, string][],
  payPlateTitle: 'BINGO',
  holeNumber: (hole: number) => `${numberOf(hole)}`,
  boardLabel: (where: string) => `The smart ball board: a plunger and lane at the right, a rail round the top, two rows of pins, and sixteen numbered holes in a square of four by four over the OUT gutter. ${where}`,
  whereIdle: 'No marble on the board.',
  whereReady: (marble: number, lit: number) => `Marble ${marble + 1} of ${MARBLES} waits on the plunger. ${lit} of 16 holes lit.`,
  whereMoving: 'A marble is on its way.',
  status: {
    first: 'Press START: 5 medals for 10 marbles.',
    again: 'Press START for another 10 marbles.',
    loading: 'The marbles roll into the tray…',
    ready: (marble: number) => `Marble ${marble + 1} of ${MARBLES}: pull, and let go!`,
    pulling: (window: number) => (window < 0 ? 'Pull a little more…' : `Strength ${window + 1} — let go!`),
    weak: 'Too soft: it rolled back. Shoot it again.',
    flying: 'Round the rail and down through the pins…',
    /** What the last marble did, said before the next one's prompt. */
    hole: (hole: number) => `Hole ${numberOf(hole)}!`,
    bingo: (lines: number) => (lines >= 2 ? `${lines} LINES!` : 'BINGO!'),
    out: 'OUT.',
    then: (what: string, next: string) => `${what} ${next}`,
  },
  /** The flash over the board as a line lights. */
  flash: (lines: number) => (lines >= 2 ? `${lines} LINES!` : 'BINGO!'),
  outcome: enOutcome,
  notEnough: `Not medals enough: a play takes ${STAKE}.`,
  unsaved: 'This browser’s storage is full: the play cannot be kept, so no medals were taken.',
  unfinished: 'A play from before is being finished first.',
  cardAway: 'Your medals are in a machine in another tab.',
  playHere: 'Play here',
  refill: (medals: number) => `Out of medals — take ${medals} more`,
  outOfMedals: 'Out of medals.',
  tooFew: (medals: number) => `A play takes ${STAKE} medals: play your last ${medals === 1 ? 'one' : medals} on another machine.`,
  resumed: 'Finished from before',
  /** A play this page finished as it gave up the medals (hidden, left, or another tab playing them): not the player's shots. */
  finishedAway: 'The play was finished while you were away: the marbles left were shot blind.',
  sayStart: `${STAKE} medals in: ${MARBLES} marbles.`,
  sayResumed: 'A play left unfinished was finished: the marbles not shot were shot blind.',
  sayRestart: 'The medals were reset at the medal center.',
  sayRefill: (medals: number) => `${enMedals(medals)} added.`,
  sayReady: (marble: number) => `Marble ${marble + 1}: hold the plunger and let go to shoot.`,
  sayHole: (hole: number, lines: number) => `Hole ${numberOf(hole)} lit.${lines > 0 ? ` ${enLines(lines)} so far.` : ''}`,
  sayOut: 'OUT.',
  historyTitle: 'Last plays',
  historyEmpty: 'No plays yet.',
  historyEntry: (play: Play) => (play.lines.length > 0 ? `${play.lines.length}L +${play.won}` : enHoles(play.marbles.filter((m) => m.hole !== null).length)),
  historyEntryLabel: (play: Play) => (play.lines.length > 0 ? `${enLines(play.lines.length)}, ${enMedals(play.won)}` : `${enHoles(play.marbles.filter((m) => m.hole !== null).length)} lit, no line`),
  sessionTitle: 'This visit',
  plays: 'Plays',
  played: 'Medals played',
  won: 'Medals won',
  net: 'Net',
  holesLit: 'Holes lit',
  bingos: 'Plays with a line',
  cameBack: 'Came back',
  perfectBack: 'Perfect play brings back',
  keysHint: 'Keys: Space or Enter starts · Space or Enter held and let go shoots · S skips after the last marble',
  notMoney: NOT_MONEY.en,
  centerNote: 'Your medals are the medal center’s, shared by every machine there.',
  centerNoteLink: 'Medal Game Center',
  infoBody: (perfect: string, typical: string, blind: string) => [
    `Press START: ${STAKE} of your medals go in, and ${MARBLES} glass marbles roll into the tray. One waits on the plunger at the right-hand corner.`,
    'Hold PULL (or Space): the plunger draws back on its spring and eases in again, over a gauge of seven strengths, back and forth while you hold it. Let go to shoot. A soft shot rolls off the rail over the right of the board; a hard one rides it round to the left. Too soft, and the marble rolls back to be shot again.',
    'The pins under the rail scatter it onto the sixteen holes. Each hole a marble drops into lights. A marble that comes to a lit hole rattles over it and rolls on down its column; missing every hole, it goes OUT.',
    `When all ${MARBLES} are shot, the lines of four lit holes pay: rows, columns and the two diagonals. One line ${PAYS[1]} medals, two ${PAYS[2]}, three ${PAYS[3]}.`,
    `How hard you pull is up to you, but the pins choose the hole. Perfect play brings back ${perfect} of the medals played, an everyday hand about ${typical}, and blind shots ${blind}: the Odds tab works it all out.`,
    'Skip fast-forwards once the last marble has been shot. While the Odds tab or this help is open, the machine waits. Leave the page in the middle of a play and it is finished for you: the marbles shot keep your strengths, and the rest are shot blind.',
    NOT_MONEY.en,
  ],
  // ── The Odds tab ──
  oddsIntro: [
    'Everything is worked out exactly, as fractions, by dynamic programming over every state the board can be in: which of the sixteen holes are lit, and how many marbles are left. What a board is worth is, for the best strength, the chance of each hole the pins can drop the marble at (or OUT) times what the board it leaves is worth; with no marble left, it is what its lines pay.',
    'The strength is a skill here, and it pays: but no strength is sure of a column, the pins choose the hole, and a line takes four. So no way of playing brings back more than the medals played.',
  ],
  perfectLabel: 'Perfect play',
  perfectNote: 'the best strength for every marble, for the board as it stands',
  typicalLabel: 'Everyday hand',
  typicalNote: 'aims as perfect play would; on the strength aimed at half the time, one softer or harder a quarter each',
  blindLabel: 'Blind shots',
  blindNote: 'any strength, each as likely: a play left mid-way is finished this way',
  rulesTitle: 'How it works',
  rules: [
    `${STAKE} medals a play, for ${MARBLES} marbles, shot one at a time.`,
    'Held, the plunger sweeps the gauge from soft to hard and back, a second each way. It shoots at the strength it is let go at; under the first strength the marble rolls back and is shot again.',
    'Each strength has its chances of reaching each column of holes, and of missing them all (the table below). In its column the pins drop the marble at one of the four holes, each as likely. A lit hole it comes to, it rattles over, on down the column.',
    `When the ${MARBLES}th marble has been shot, the lines lit pay: one line ${PAYS[1]} medals, two ${PAYS[2]}, three ${PAYS[3]}. Ten marbles light ten holes at most, and four lines need eleven: three is the most.`,
    'Where each marble goes is drawn when the medals go in; the strength only chooses which way the pins’ throw drawn for it leads. Nothing is drawn as you shoot.',
    'Skip only fast-forwards: it can be pressed once the last marble has been shot.',
    'While the Odds tab is open the machine waits: the plunger and the marble stop, and go on from the same point when you come back. A plunger held as you leave is let go without a shot.',
    'Leaving the page (or reloading it) in the middle of a play finishes it at once: the marbles already shot keep your strengths, and every marble still to come is shot blind, at a strength drawn when the medals went in.',
  ],
  linesTitle: 'What the lines pay, and how often',
  colLines: 'Lines',
  colPays: 'Pays',
  colPerfect: 'Perfect',
  colTypical: 'Everyday',
  colBlind: 'Blind',
  lineCount: (n: number) => (n === 0 ? 'none' : `${n}`),
  windowsTitle: 'The seven strengths',
  windowsNote: 'Where each strength sends a marble, out of 24: to each column of holes (shared out evenly among its four holes), or OUT.',
  colWindow: 'Strength',
  columnName: (col: number) => EN_COLUMNS[col],
  colOut: 'OUT',
  windowName: (window: number) => `${window + 1}${window === 0 ? ' soft' : window === 6 ? ' hard' : ''}`,
  checkTitle: 'A check by play',
  checkNote: (plays: string) => `${plays} plays for each hand, drawn at random as the machine draws them, beside the exact figures.`,
  checkRun: 'Play them',
  checkRunning: 'Playing…',
  colHand: 'Hand',
  colExact: 'Exact',
  colSeen: 'Played',
  fractionNote: (fraction: string) => `As a fraction: ${fraction}.`,
};

export type SmartBallStrings = typeof en;

const ja: SmartBallStrings = {
  title: '湯けむりスマートボール',
  titleParts: ['湯けむり', 'スマートボール'],
  subtitle: `温泉街の${B}遊技場の${B}スマートボール。${B}バネを引いて${B}ガラス玉を10個、${B}レールの上から${B}釘の間へ打ち込み、${B}4つの穴を${B}一列に光らせて${B}ビンゴをめざそう。`,
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabMachine: 'マシン',
  tabOdds: '確率',
  sign: 'SMART BALL',
  signSub: '湯けむり',
  perPlay: `1回${STAKE}枚・玉${MARBLES}個`,
  lastPlay: '前回のプレイ',
  medals: '持ちメダル',
  balls: '残り玉',
  win: '当たり',
  start: 'スタート',
  startAria: `スタート（${STAKE}枚で玉${MARBLES}個）`,
  plunger: '引いて打つ',
  plungerAria: '発射バネ：押したままで引き、離すと玉を打ちます',
  skip: 'スキップ',
  skipWhy: '玉を全部打ってから',
  outLabel: 'OUT',
  payPlate: [['1列', `${PAYS[1]}枚`], ['2列', `${PAYS[2]}枚`], ['3列', `${PAYS[3]}枚`]],
  payPlateTitle: 'ビンゴ',
  holeNumber: (hole: number) => `${numberOf(hole)}`,
  boardLabel: (where: string) => `スマートボールの盤：右に発射バネとレーン、上にレール、2段の釘、その下に番号つきの穴が4×4で16個、いちばん下にOUTのみぞ。${where}`,
  whereIdle: '盤に玉はありません。',
  whereReady: (marble: number, lit: number) => `${MARBLES}個のうち${marble + 1}個目の玉が発射台で待っています。光った穴は16個のうち${lit}個。`,
  whereMoving: '玉が動いています。',
  status: {
    first: `「スタート」で${B}メダル${STAKE}枚、${B}玉が${MARBLES}個。`,
    again: `もう一度${B}「スタート」で${B}玉${MARBLES}個。`,
    loading: `玉が${B}受け皿に${B}出てくる…`,
    ready: (marble: number) => `${marble + 1}／${MARBLES}個目：${B}引いて、${B}離して打とう！`,
    pulling: (window: number) => (window < 0 ? `もう少し${B}引いて…` : `強さ${window + 1}：${B}いま離す！`),
    weak: `弱すぎて${B}戻ってきた。${B}もう一度${B}打とう。`,
    flying: `レールを回って${B}釘の間へ…`,
    hole: (hole: number) => `${numberOf(hole)}番に入った！`,
    bingo: (lines: number) => (lines >= 2 ? `${lines}列そろった！` : 'ビンゴ！'),
    out: 'OUT！',
    then: (what: string, next: string) => `${what}${B}${next}`,
  },
  flash: (lines: number) => (lines >= 2 ? `ビンゴ${lines}列！` : 'ビンゴ！'),
  outcome: jaOutcome,
  notEnough: `メダルが${B}足りません。${B}1回${STAKE}枚です。`,
  unsaved: `このブラウザの保存領域が${B}いっぱいのため、${B}記録できません。${B}メダルは使っていません。`,
  unfinished: `前のプレイを${B}先に終わらせています。`,
  cardAway: `持ちメダルは${B}別のタブの${B}マシンで${B}使われています。`,
  playHere: 'ここで遊ぶ',
  refill: (medals: number) => `メダルがなくなりました — ${medals}枚もらう`,
  outOfMedals: 'メダルがなくなりました。',
  tooFew: (medals: number) => `1回${STAKE}枚です。${B}のこりの${medals}枚は${B}ほかのマシンで${B}遊べます。`,
  resumed: '前のプレイの続き',
  finishedAway: `離れている間に${B}プレイを終えました。${B}残りの玉は${B}目をつぶって${B}打ちました。`,
  sayStart: `メダルを${STAKE}枚入れました。玉は${MARBLES}個です。`,
  sayResumed: '途中だったプレイを終わらせました。まだの玉は目をつぶって打ちました。',
  sayRestart: 'メダルゲームセンターでメダルがリセットされました。',
  sayRefill: (medals: number) => `${jaMedals(medals)}を補充しました。`,
  sayReady: (marble: number) => `${marble + 1}個目の玉：バネを引いて、離して打とう。`,
  sayHole: (hole: number, lines: number) => `${numberOf(hole)}番の穴が光りました。${lines > 0 ? `いま${lines}列です。` : ''}`,
  sayOut: 'OUTです。',
  historyTitle: '最近のプレイ',
  historyEmpty: 'まだ遊んでいません。',
  historyEntry: (play: Play) => (play.lines.length > 0 ? `${play.lines.length}列 +${play.won}枚` : `穴${play.marbles.filter((m) => m.hole !== null).length}個`),
  historyEntryLabel: (play: Play) => (play.lines.length > 0 ? `${play.lines.length}列、${jaMedals(play.won)}` : `穴${play.marbles.filter((m) => m.hole !== null).length}個、ビンゴなし`),
  sessionTitle: '今回のプレイ',
  plays: `プレイ${B}回数`,
  played: `使った${B}メダル`,
  won: `当たった${B}メダル`,
  net: '差し引き',
  holesLit: `光った${B}穴`,
  bingos: `ビンゴした${B}回数`,
  cameBack: `戻った${B}割合`,
  perfectBack: `いちばん${B}上手な${B}打ち方の${B}戻り`,
  keysHint: 'キー：Space か Enter でスタート・Space か Enter を押して離すと玉を打つ・玉を全部打ったら S でスキップ',
  notMoney: NOT_MONEY.ja,
  centerNote: '持ちメダルはメダルゲームセンターのもので、どのマシンでも同じメダルで遊べます。',
  centerNoteLink: 'メダルゲームセンター',
  infoBody: (perfect: string, typical: string, blind: string) => [
    `「スタート」を押すと、持ちメダルが${STAKE}枚入り、ガラス玉が${MARBLES}個、受け皿に出てきます。1個ずつ、右下の発射台で待ちます。`,
    '「引いて打つ」（または Space）を押したままにすると、バネが引かれては戻り、7段階の強さのゲージを行ったり来たりします。離すと玉を打ちます。弱く打つとレールの右寄りで落ち、強く打つと左までぐるりと回ります。弱すぎると玉は戻ってくるので、打ち直せます。',
    'レールの下の釘が玉を16個の穴のどれかへはじきます。玉が入った穴は光ります。光った穴に来た玉は、その上を転がって同じたての穴を下へ。どの穴にも入らなければOUTです。',
    `${MARBLES}個打ち終わると、光った穴が4つ一列（横・たて・ななめ2本）にそろった数で当たり。1列${PAYS[1]}枚、2列${PAYS[2]}枚、3列${PAYS[3]}枚。`,
    `引く強さは腕前ですが、どの穴に入るかは釘しだい。いちばん上手な打ち方で戻りは${perfect}、ふつうの腕前でおよそ${typical}、目をつぶって打つと${blind}。くわしくは「確率」タブで。`,
    'スキップは早送りです。玉を全部打ってから押せます。「確率」タブや遊び方を見ている間は、マシンが止まって待っています。プレイの途中でページを離れると、そこでプレイを終えます。打った玉はそのまま、残りの玉は目をつぶって打ったことになります。',
    NOT_MONEY.ja,
  ],
  oddsIntro: [
    'すべて分数で正確に、盤のありうる状態（16個の穴のどれが光っているかと、残りの玉の数）すべてを動的計画法でたどって計算しています。ある盤の価値は、いちばんいい強さで打ったとき、釘が玉を落とす穴（またはOUT）それぞれの確率×そのあとの盤の価値の合計。玉が残っていなければ、そろった列の当たりです。',
    '強さは腕前で、上手なほど戻りは増えます。でも、どの強さもたての列を決めきれず、穴を決めるのは釘で、1列には4つの穴が要ります。だから、どんな打ち方でも使ったメダルより多くは戻りません。',
  ],
  perfectLabel: `いちばん${B}上手な${B}打ち方`,
  perfectNote: `玉ごとに、${B}いまの盤で${B}いちばんいい強さ`,
  typicalLabel: `ふつうの${B}腕前`,
  typicalNote: `上手な打ち方と${B}同じ強さをねらい、${B}半分は${B}ねらいどおり、${B}4回に1回ずつ${B}1段弱く・強く`,
  blindLabel: `目をつぶって${B}打つ`,
  blindNote: `どの強さも${B}同じ確率。${B}途中で離れた${B}プレイの残りは${B}これ`,
  rulesTitle: 'しくみ',
  rules: [
    `1回${STAKE}枚で${B}玉${MARBLES}個。${B}1個ずつ打ちます。`,
    `押している間、${B}バネは${B}弱から強へ、${B}強から弱へ、${B}それぞれ1秒で${B}ゲージを動きます。${B}離したときの強さで打ち、${B}1段目より弱いと${B}玉は戻ってきて${B}打ち直しです。`,
    `強さごとに、${B}どのたての列に${B}行くか、${B}どの穴にも入らないかの${B}確率が決まっています（${B}下の表）。${B}たての列の中では、${B}釘が4つの穴の${B}どれかへ${B}同じ確率で落とします。${B}光った穴に来たら、${B}その上を転がって${B}下の穴へ。`,
    `${MARBLES}個目を打ち終わったら、${B}そろった列で当たり。${B}1列${PAYS[1]}枚、${B}2列${PAYS[2]}枚、${B}3列${PAYS[3]}枚。${B}玉${MARBLES}個で${B}光る穴は${B}10個まで、${B}4列には11個要るので、${B}3列が最高です。`,
    `玉がどこへ行くかは${B}メダルを入れたときに${B}決まっていて、${B}強さは${B}そのとき決まった${B}釘のはじき方が${B}どこへ向かうかを${B}選ぶだけ。${B}打つときに${B}何かを引くことは${B}ありません。`,
    `スキップは${B}早送りだけ。${B}玉を全部打ってから${B}押せます。`,
    `「確率」タブを見ている間は${B}マシンが待ちます。${B}バネも玉も止まり、${B}戻ると${B}同じところから続きます。${B}バネを引いたまま${B}離れると、${B}打たずに戻します。`,
    `プレイの途中で${B}ページを離れる（${B}再読み込みする）と、${B}すぐにプレイを終えます。${B}打った玉は${B}そのまま、${B}まだの玉は${B}メダルを入れたときに決めた${B}強さで${B}目をつぶって打ちます。`,
  ],
  linesTitle: `そろった列の${B}当たりと${B}その確率`,
  colLines: '列',
  colPays: `当たり${B}（枚）`,
  colPerfect: `いちばん${B}上手`,
  colTypical: 'ふつう',
  colBlind: `目を${B}つぶる`,
  lineCount: (n: number) => (n === 0 ? 'なし' : `${n}列`),
  windowsTitle: `7段階の${B}強さ`,
  windowsNote: `強さごとに、${B}玉がどのたての列へ行くか（${B}その列の4つの穴に${B}同じだけ）、${B}またはOUTになるかを、${B}24のうちいくつかで。`,
  colWindow: '強さ',
  columnName: (col: number) => JA_COLUMNS[col],
  colOut: 'OUT',
  windowName: (window: number) => `${window + 1}${window === 0 ? '（弱）' : window === 6 ? '（強）' : ''}`,
  checkTitle: `じっさいに${B}遊んで${B}たしかめる`,
  checkNote: (plays: string) => `それぞれの腕前で${plays}回、マシンと同じようにランダムに遊んだ結果を、正確な値とならべます。`,
  checkRun: '遊ぶ',
  checkRunning: '遊んでいます…',
  colHand: '腕前',
  colExact: `正確な${B}値`,
  colSeen: `遊んだ${B}結果`,
  fractionNote: (fraction: string) => `分数で：${fraction}`,
};

export const getStrings = (language: GameLanguage): SmartBallStrings => (language === 'ja' ? ja : en);
