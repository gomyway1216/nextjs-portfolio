import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import { PAYS, STAGES, type GateKind, type Play, type Pocket, type StageEnd } from './engine';

/**
 * Every word Candy Shop Medal Maze shows, in English and Japanese.
 *
 * Medals are not money, and nothing here may read as money (no bank,
 * deposit, withdraw, balance, cash, cash out, wager, payout, coin or $; no
 * 預け, 残高, お金, 円, 換金, 賭け): the medals are "your medals" /
 * 「持ちメダル」, and `notMoney` says outright that the medals are not money.
 *
 * Japanese lines carry their own break points: a zero-width space (`​`)
 * between phrases, where Safari and Firefox, which keep Japanese words whole
 * only where the text says so, may break a line.
 */

/** A break point between Japanese phrases. */
const B = '​';

const enMedals = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'medal' : 'medals'}`;
const jaMedals = (n: number) => `${n.toLocaleString('ja-JP')}枚`;

const EN_GATES: readonly string[] = ['Ramune gate', 'Strawberry gate', 'Melon gate', 'Chocolate gate'];
const JA_GATES: readonly string[] = ['ラムネゲート', 'いちごゲート', 'メロンゲート', 'チョコゲート'];
const EN_KINDS: Record<GateKind, string> = { wide: 'Wide', mid: 'Even', narrow: 'Narrow', slit: 'Slit', flutter: 'Flutter' };
const JA_KINDS: Record<GateKind, string> = { wide: 'ひろい', mid: 'ふつう', narrow: 'せまい', slit: 'すき間', flutter: 'パタパタ' };
const EN_POCKETS: Record<Pocket, string> = { big: 'BIG WIN', win: 'WIN', out: 'OUT' };
const JA_POCKETS: Record<Pocket, string> = { big: '大当たり', win: '当たり', out: 'はずれ' };

/** What a play came to, in a few words for the status line (`status`) and a sentence for a screen reader (`say`). */
function enOutcome(play: Play): { status: string; say: string } {
  if (play.outAt !== null) {
    const end = play.stages[play.outAt].end;
    const how = end === 'timeout' ? 'time ran out' : end === 'graze-out' ? 'it grazed the edge' : 'the gate was shut';
    return { status: `OUT at gate ${play.outAt + 1}: ${how}`, say: `The medal fell into the OUT hole at gate ${play.outAt + 1}: ${how}. Nothing this time.` };
  }
  if (play.pocket === 'big') return { status: `BIG WIN! +${play.won}`, say: `Through all four gates and into the BIG WIN pocket: ${enMedals(play.won)} won.` };
  if (play.pocket === 'win') return { status: `WIN! +${play.won}`, say: `Through all four gates and into the WIN pocket: ${enMedals(play.won)} won.` };
  return { status: 'Through all four gates… OUT in the pins', say: 'Through all four gates, and into an OUT pocket under the pins. Nothing this time.' };
}

function jaOutcome(play: Play): { status: string; say: string } {
  if (play.outAt !== null) {
    const end = play.stages[play.outAt].end;
    const how = end === 'timeout' ? '時間切れ' : end === 'graze-out' ? 'ふちに当たって落ちた' : 'ゲートが閉まっていた';
    return { status: `ゲート${play.outAt + 1}でアウト：${B}${how}`, say: `ゲート${play.outAt + 1}でアウトの穴に落ちました。${how}。今回はなしです。` };
  }
  if (play.pocket === 'big') return { status: `大当たり！${B}+${play.won}枚`, say: `4つのゲートを抜けて大当たりのポケットへ。${jaMedals(play.won)}の当たりです。` };
  if (play.pocket === 'win') return { status: `当たり！${B}+${play.won}枚`, say: `4つのゲートを抜けて当たりのポケットへ。${jaMedals(play.won)}の当たりです。` };
  return { status: `4つのゲートを${B}抜けたけど、${B}釘ではずれ`, say: '4つのゲートを抜けましたが、釘の下ではずれのポケットに入りました。今回はなしです。' };
}

/** What happened at a gate, as it is shown. */
const enEnd: Record<StageEnd, string> = {
  through: 'Through!',
  'graze-through': 'Clack… it wobbles… through!',
  'graze-out': 'Clack… it wobbles… OUT.',
  shut: 'Clack! Shut — OUT.',
  timeout: 'Too slow — it dropped OUT.',
};
const jaEnd: Record<StageEnd, string> = {
  through: '抜けた！',
  'graze-through': `カチン、${B}ぐらぐら…${B}抜けた！`,
  'graze-out': `カチン、${B}ぐらぐら…${B}アウト。`,
  shut: `カチン！${B}閉まっていて${B}アウト。`,
  timeout: `時間切れで${B}アウト。`,
};

const en = {
  title: 'Candy Shop Medal Maze',
  /** The title in the pieces it may be broken between on a narrow screen. */
  titleParts: ['Candy Shop', 'Medal Maze'],
  subtitle: 'The flick-a-medal maze of the candy shop corner: drop one medal in, flick it through four moving gates with the levers, and down the pins into WIN.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  sign: 'MEDAL MAZE',
  signSub: 'CANDY SHOP',
  perPlay: '1 MEDAL A PLAY',
  /** The badge over a play from before this page that simply ended, shown again (`resumed` is a play this page finished). */
  lastPlay: 'Last play',
  medals: 'MEDALS',
  win: 'WIN',
  drop: 'DROP',
  dropAria: 'Drop a medal in',
  lever: 'LEVER',
  leverAria: 'Lever: press and let go to flick the medal at the gate; hold it to pull it back',
  skip: 'Skip',
  /** Why Skip waits: it only fast-forwards, once there is no lever left to flick. */
  skipWhy: 'after the last lever',
  slotLabel: 'IN',
  outLabel: 'OUT',
  pocketName: (pocket: Pocket) => EN_POCKETS[pocket],
  /** A pocket's name as it is printed on it. */
  pocketShort: (pocket: Pocket) => ({ big: 'BIG', win: 'WIN', out: 'OUT' })[pocket],
  pocketPays: (pocket: Pocket) => (PAYS[pocket] > 0 ? `${PAYS[pocket]}` : ''),
  gateName: (stage: number) => EN_GATES[stage],
  kindName: (kind: GateKind) => EN_KINDS[kind],
  boardLabel: (where: string) => `The maze: four lever cups with a moving gate at each, then four rows of pins over the pockets. ${where}`,
  whereIdle: 'No medal in the maze.',
  whereCup: (stage: number) => `The medal waits at gate ${stage + 1} of ${STAGES}, the ${EN_GATES[stage]}.`,
  whereMoving: 'The medal is on its way.',
  wherePins: 'The medal is in the pins.',
  pocketsLabel: 'The pockets: BIG WIN 5 medals at each end, WIN 2 medals in the middle, OUT between.',
  status: {
    first: 'Press DROP to drop a medal in.',
    again: 'Drop another medal in.',
    dropping: 'In it goes…',
    wait: (stage: number) => `Gate ${stage + 1} of ${STAGES}: flick when it opens!`,
    end: (end: StageEnd) => enEnd[end],
    pins: 'Down through the pins…',
  },
  outcome: enOutcome,
  notEnough: 'No medal to drop in.',
  unsaved: 'This browser’s storage is full: the play cannot be kept, so no medal was taken.',
  unfinished: 'A play from before is being finished first.',
  cardAway: 'Your medals are in a machine in another tab.',
  playHere: 'Play here',
  refill: (medals: number) => `Out of medals — take ${medals} more`,
  outOfMedals: 'Out of medals.',
  resumed: 'Finished from before',
  /** A play this page finished as it gave up the medals (hidden, left, or another tab playing them): not the player's flicks. */
  finishedAway: 'The play was finished while you were away: the levers left were flicked blind.',
  sayDrop: 'A medal dropped in.',
  sayResumed: 'A play left unfinished was finished: the levers not flicked were flicked blind.',
  sayRestart: 'The medals were reset at the medal center.',
  sayRefill: (medals: number) => `${enMedals(medals)} added.`,
  sayGate: (stage: number) => `Gate ${stage + 1}: flick when it opens.`,
  historyTitle: 'Last plays',
  historyEmpty: 'No plays yet.',
  historyEntry: (play: Play) => (play.outAt !== null ? `OUT ${play.outAt + 1}` : play.pocket === 'out' ? 'OUT pins' : `+${play.won}`),
  sessionTitle: 'This visit',
  plays: 'Plays',
  played: 'Medals played',
  won: 'Medals won',
  net: 'Net',
  gates: 'Gates got through',
  wins: 'WINs and BIG WINs',
  cameBack: 'Came back',
  perfectBack: 'Perfect timing brings back',
  keysHint: 'Keys: Space or Enter drops a medal · Space held and let go flicks the lever · S skips after the last lever',
  notMoney: NOT_MONEY.en,
  centerNote: 'Your medals are the medal center’s, shared by every machine there.',
  centerNoteLink: 'Medal Game Center',
  infoBody: (perfect: string, typical: string, blind: string) => [
    'Press DROP: one of your medals drops into the case at the top right and rolls down to the first lever.',
    'At each of the four levers a gate goes round its turn in front of the medal: open, half open, shut. Press LEVER (or hold it to pull it back and let go) to flick the medal at the gate. Open: it sails across to the next lever. Half open: it clacks the edge and wobbles, through one time in two. Shut: it drops into the OUT hole. Leave it too long and it drops OUT too.',
    'Through all four gates, it falls through four rows of pins into a pocket: WIN pays 2 medals, BIG WIN at either end 5.',
    `How the gates move is drawn as the medal drops in, and some never open all the way. Perfect timing brings back ${perfect} of the medals played, an everyday hand about ${typical}, and blind presses ${blind}: the Odds tab works it all out.`,
    'Skip fast-forwards the medal’s way once the last lever has been flicked. While the Odds tab is open, the gates and the time limit wait for you. Leave the page in the middle of a play and it is finished for you: the levers flicked keep your timing, and the rest are flicked blind.',
    NOT_MONEY.en,
  ],
  // ── The Odds tab ──
  oddsIntro: [
    'Everything is worked out exactly, as fractions, by dynamic programming down the four gates: what a medal waiting at a gate is worth is the chance of each of the gate’s eight settings, times the chance the flick gets through it, times what the next gate is worth; the last gate leads into the pins.',
    'Timing is a skill here, and it pays: but even perfect timing meets gates that only flutter, and the pins are luck. So no way of playing brings back more than the medals played.',
  ],
  perfectLabel: 'Perfect timing',
  perfectNote: 'the best window at every gate',
  typicalLabel: 'Everyday hand',
  typicalNote: 'aims at the middle of the opening; on it half the time, a window early or late a quarter each',
  blindLabel: 'Blind presses',
  blindNote: 'any window, each as likely: a play left mid-way is finished this way',
  reachLabel: 'Perfect timing reaches the pins',
  rulesTitle: 'How it works',
  rules: [
    'One medal a play. It is the medal that rolls.',
    'Each gate goes round eight windows of 0.3 seconds; how many it stands open, half open and shut depends on its setting, drawn as the medal drops in.',
    'A flick counts in the window the medal meets the gate. Open: through. Half open: through one time in two, drawn as the medal drops in. Shut: OUT.',
    'A medal left in a cup for three turns of its gate (7.2 seconds) drops OUT. That is counted below as one more way to flick: it gets nothing.',
    'Under the fourth gate the medal goes left or right at each of four rows of pins, one time in two: the middle pocket is WIN (2 medals), the two at the ends BIG WIN (5).',
    'Skip only fast-forwards: it can be pressed once the last lever has been flicked, and the medal lands where it was going.',
    'While the Odds tab is open the machine waits: the gates stop turning and the cup’s time limit stops, and both go on from the same point when you come back. No timing is gained: the gate is still moving.',
    'Leaving the page (or reloading it) in the middle of a play finishes it at once: the levers already flicked keep your timing, and every lever still to come is flicked blind, at a window drawn as the medal dropped in.',
  ],
  gatesTitle: 'The four gates',
  colGate: 'Gate',
  colSettings: 'Its eight settings',
  colPerfect: 'Perfect',
  colTypical: 'Everyday',
  colBlind: 'Blind',
  kindsTitle: 'Each kind of gate',
  colKind: 'Kind',
  colTurn: 'Its turn',
  turnKey: 'O open · ½ half open · × shut, window by window',
  pinsTitle: 'The pins and the pockets',
  colPocket: 'Pocket',
  colChance: 'Chance',
  colPays: 'Pays',
  skipTitle: 'Leaving mid-play',
  skipNote: 'What a play brings back with perfect timing up to a gate, and the page left there (every gate from there flicked blind).',
  colSkipAt: 'Left at',
  skipAtGate: (stage: number) => `gate ${stage + 1}`,
  skipNever: 'never',
  colBack: 'Brings back',
  checkTitle: 'A check by play',
  checkNote: (plays: string) => `${plays} plays for each hand, drawn at random as the machine draws them, beside the exact figures.`,
  checkRun: 'Play them',
  checkRunning: 'Playing…',
  colHand: 'Hand',
  colExact: 'Exact',
  colSeen: 'Played',
  fractionNote: (fraction: string) => `As a fraction: ${fraction}.`,
};

export type CoinMazeStrings = typeof en;

const ja: CoinMazeStrings = {
  title: '駄菓子屋メダルめいろ',
  titleParts: ['駄菓子屋', 'メダルめいろ'],
  subtitle: `駄菓子屋コーナーの${B}メダルはじきめいろ。${B}メダルを1枚入れて、${B}レバーで${B}4つの動くゲートを${B}はじいて抜け、${B}釘を落ちて${B}当たりをめざそう。`,
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabMachine: 'マシン',
  tabOdds: '確率',
  sign: 'MEDAL MAZE',
  signSub: 'だがしや',
  perPlay: '1回1枚',
  lastPlay: '前回のプレイ',
  medals: '持ちメダル',
  win: '当たり',
  drop: 'メダルを入れる',
  dropAria: 'メダルを入れる（1枚）',
  lever: 'レバー',
  leverAria: 'レバー：押して離すと、メダルをゲートへはじきます。押したままで引いて、離してはじくこともできます',
  skip: 'スキップ',
  skipWhy: 'レバーを全部はじいてから',
  slotLabel: '入口',
  outLabel: 'OUT',
  pocketName: (pocket: Pocket) => JA_POCKETS[pocket],
  pocketShort: (pocket: Pocket) => ({ big: '大当り', win: 'あたり', out: 'はずれ' })[pocket],
  pocketPays: (pocket: Pocket) => (PAYS[pocket] > 0 ? `${PAYS[pocket]}枚` : ''),
  gateName: (stage: number) => JA_GATES[stage],
  kindName: (kind: GateKind) => JA_KINDS[kind],
  boardLabel: (where: string) => `めいろ：動くゲートのついたレバーが4つ、その下に4段の釘とポケット。${where}`,
  whereIdle: 'めいろにメダルはありません。',
  whereCup: (stage: number) => `メダルは${STAGES}つのうち${stage + 1}番目の${JA_GATES[stage]}で待っています。`,
  whereMoving: 'メダルが動いています。',
  wherePins: 'メダルが釘を落ちています。',
  pocketsLabel: 'ポケット：両はしが大当たり5枚、まん中が当たり2枚、その間ははずれ。',
  status: {
    first: `「メダルを入れる」で${B}メダルを1枚入れよう。`,
    again: `もう1枚、${B}入れてみよう。`,
    dropping: `メダルが${B}転がっていく…`,
    wait: (stage: number) => `ゲート${stage + 1}／${STAGES}：${B}開いたら${B}はじこう！`,
    end: (end: StageEnd) => jaEnd[end],
    pins: `釘を${B}落ちていく…`,
  },
  outcome: jaOutcome,
  notEnough: `入れるメダルが${B}ありません。`,
  unsaved: `このブラウザの保存領域が${B}いっぱいのため、${B}記録できません。${B}メダルは使っていません。`,
  unfinished: `前のプレイを${B}先に終わらせています。`,
  cardAway: `持ちメダルは${B}別のタブの${B}マシンで${B}使われています。`,
  playHere: 'ここで遊ぶ',
  refill: (medals: number) => `メダルがなくなりました — ${medals}枚もらう`,
  outOfMedals: 'メダルがなくなりました。',
  resumed: '前のプレイの続き',
  finishedAway: `離れている間に${B}プレイを終えました。${B}残りのレバーは${B}目をつぶって${B}はじきました。`,
  sayDrop: 'メダルを1枚入れました。',
  sayResumed: '途中だったプレイを終わらせました。まだのレバーは目をつぶってはじきました。',
  sayRestart: 'メダルゲームセンターでメダルがリセットされました。',
  sayRefill: (medals: number) => `${jaMedals(medals)}を補充しました。`,
  sayGate: (stage: number) => `ゲート${stage + 1}：開いたらはじこう。`,
  historyTitle: '最近のプレイ',
  historyEmpty: 'まだ遊んでいません。',
  historyEntry: (play: Play) => (play.outAt !== null ? `アウト${play.outAt + 1}` : play.pocket === 'out' ? 'はずれ' : `+${play.won}枚`),
  sessionTitle: '今回のプレイ',
  plays: `プレイ${B}回数`,
  played: `使った${B}メダル`,
  won: `当たった${B}メダル`,
  net: '差し引き',
  gates: `抜けた${B}ゲート`,
  wins: `当たり・${B}大当たり`,
  cameBack: `戻った${B}割合`,
  perfectBack: `ぴったりの${B}戻り`,
  keysHint: 'キー：Space か Enter でメダルを入れる・Space を押して離すとレバー・レバーを全部はじいたら S でスキップ',
  notMoney: NOT_MONEY.ja,
  centerNote: '持ちメダルはメダルゲームセンターのもので、どのマシンでも同じメダルで遊べます。',
  centerNoteLink: 'メダルゲームセンター',
  infoBody: (perfect: string, typical: string, blind: string) => [
    '「メダルを入れる」を押すと、持ちメダルが1枚、ケースの右上から入って、最初のレバーまで転がります。',
    '4つのレバーの前では、それぞれゲートが「開く・半分開く・閉まる」をくり返しています。「レバー」を押す（押したまま引いて離してもOK）とメダルをゲートへはじきます。開いていれば次のレバーへ。半分なら、ふちに当たってぐらぐら、2回に1回は抜けます。閉まっていればアウトの穴へ。待ちすぎてもアウトです。',
    '4つのゲートを抜けると、4段の釘を落ちてポケットへ。まん中の当たりは2枚、両はしの大当たりは5枚。',
    `ゲートの動き方はメダルを入れたときに決まり、全開にならないこともあります。ぴったりのタイミングなら戻りは${perfect}、ふつうの腕前でおよそ${typical}、目をつぶって押すと${blind}。くわしくは「確率」タブで。`,
    'スキップは早送りです。レバーを全部はじいてから押せて、メダルはそのまま行き先に着きます。「確率」タブを見ている間は、ゲートも制限時間も止まって待っています。プレイの途中でページを離れると、そこでプレイを終えます。はじいたレバーはそのまま、残りは目をつぶってはじいたことになります。',
    NOT_MONEY.ja,
  ],
  oddsIntro: [
    'すべて分数で正確に、4つのゲートを順にたどる動的計画法で計算しています。あるゲートで待つメダルの価値は、そのゲートの8つの設定それぞれの確率×はじいて抜ける確率×次のゲートでの価値。最後のゲートの先は釘です。',
    'タイミングは腕前で、上手なほど戻りは増えます。でもぴったりでも全開にならないゲートに当たることがあり、釘は運まかせ。だから、どんな遊び方でも使ったメダルより多くは戻りません。',
  ],
  perfectLabel: `ぴったりの${B}タイミング`,
  perfectNote: `どのゲートでも${B}いちばんいい${B}タイミング`,
  typicalLabel: `ふつうの${B}腕前`,
  typicalNote: `開いたまん中をねらい、${B}半分は${B}ねらいどおり、${B}4回に1回ずつ${B}早すぎ・遅すぎ`,
  blindLabel: `目をつぶって${B}押す`,
  blindNote: `どのタイミングも${B}同じ確率。${B}途中で離れた${B}プレイの残りは${B}これ`,
  reachLabel: `ぴったりで${B}釘まで${B}行く確率`,
  rulesTitle: 'しくみ',
  rules: [
    `1回1枚。${B}入れたメダルが${B}そのまま転がります。`,
    `ゲートは${B}0.3秒のタイミングを${B}8つくり返します。${B}開く・半分・閉まるが${B}いくつずつかは${B}ゲートの設定しだいで、${B}メダルを入れたときに${B}決まります。`,
    `メダルが${B}ゲートに当たる${B}瞬間の${B}タイミングで${B}決まります。${B}開いていれば抜け、${B}半分なら${B}2回に1回抜け（${B}これも${B}入れたときに${B}決まります）、${B}閉まっていればアウト。`,
    `メダルをカップに${B}ゲート3周分（7.2秒）${B}置いたままにすると${B}アウト。${B}下の計算では${B}「何ももらえない${B}はじき方」の1つとして${B}数えています。`,
    `4つ目のゲートの下で、${B}メダルは4段の釘で${B}左か右へ${B}2回に1回ずつ。${B}まん中は当たり（2枚）、${B}両はしは大当たり（5枚）。`,
    `スキップは${B}早送りだけ。${B}レバーを全部はじいてから${B}押せて、${B}メダルは${B}行き先に着きます。`,
    `「確率」タブを見ている間は${B}マシンが待ちます。${B}ゲートも${B}カップの制限時間も止まり、${B}戻ると${B}同じところから続きます。${B}ゲートは動いたままなので、${B}タイミングが楽になることはありません。`,
    `プレイの途中で${B}ページを離れる（${B}再読み込みする）と、${B}すぐにプレイを終えます。${B}はじいたレバーはそのまま、${B}まだのレバーは${B}メダルを入れたときに決めた${B}タイミングで${B}目をつぶってはじきます。`,
  ],
  gatesTitle: '4つのゲート',
  colGate: 'ゲート',
  colSettings: `8つの${B}設定`,
  colPerfect: 'ぴったり',
  colTypical: 'ふつう',
  colBlind: `目を${B}つぶる`,
  kindsTitle: `ゲートの${B}種類`,
  colKind: '種類',
  colTurn: `1周の${B}動き`,
  turnKey: `O 開く・½ 半分・× 閉まる（${B}タイミング1つずつ）`,
  pinsTitle: `釘と${B}ポケット`,
  colPocket: 'ポケット',
  colChance: '確率',
  colPays: `もらえる${B}メダル`,
  skipTitle: `途中で${B}離れたら`,
  skipNote: 'あるゲートまでぴったりのタイミングで、そこでページを離れたとき（そこから先は目をつぶってはじく）の戻り。',
  colSkipAt: `離れた所`,
  skipAtGate: (stage: number) => `ゲート${stage + 1}`,
  skipNever: '離れない',
  colBack: '戻り',
  checkTitle: `じっさいに${B}遊んで${B}たしかめる`,
  checkNote: (plays: string) => `それぞれの腕前で${plays}回、マシンと同じようにランダムに遊んだ結果を、正確な値とならべます。`,
  checkRun: '遊ぶ',
  checkRunning: '遊んでいます…',
  colHand: '腕前',
  colExact: `正確な${B}値`,
  colSeen: `遊んだ${B}結果`,
  fractionNote: (fraction: string) => `分数で：${fraction}`,
};

export const getStrings = (language: GameLanguage): CoinMazeStrings => (language === 'ja' ? ja : en);
