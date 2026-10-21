import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import { BETS, DISCS, JACKPOT, LAMP_SETS, LEVELS, POCKETS, type Bet, type PocketKind, type Run, type Stop } from './engine';

/**
 * Every word Firework Ball Tower shows, in English and Japanese.
 *
 * Medals are not money, and nothing here may read as money (no bank,
 * deposit, withdraw, balance, cash, cash out, wager, payout, coin or $; no
 * 預け, 残高, お金, 円, 換金, 賭け, 景品交換): the medals are "your medals" /
 * 「持ちメダル」, and `notMoney` says outright that the medals are not money.
 * A bet is the medals a ball takes, and every pocket pays a multiple of it in
 * medals; nothing is exchanged for anything.
 *
 * The words printed on the discs (UP, OUT, CHANCE, JP, ×3, ?) are the same in
 * both languages, as a Japanese machine prints them; they are painted on the
 * canvas (draw.ts) and said in words here for a screen reader.
 *
 * Japanese lines carry their own break points: a zero-width space (`​`)
 * between phrases, where Safari and Firefox, which keep Japanese words whole
 * only where the text says so, may break a line.
 */

/** A break point between Japanese phrases. */
const B = '​';

const enMedals = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'medal' : 'medals'}`;
const jaMedals = (n: number) => `${n.toLocaleString('ja-JP')}枚`;
const enDisc = (level: number) => (level === LEVELS - 1 ? 'the jackpot disc' : level === 3 ? 'the chance disc' : `disc ${level + 1}`);
const jaDisc = (level: number) => (level === LEVELS - 1 ? 'ジャックポットの段' : level === 3 ? 'チャンスの段' : `${level + 1}段目`);
const isChance = (stop: Pick<Stop, 'kind' | 'level'>) => stop.kind === 'up' && stop.level >= 2;

/** What a pocket is, in words: for a screen reader, and for the Odds tab's tables. */
const enPocket = (kind: PocketKind, level: number, pays = 0) =>
  kind === 'up' ? (level >= 2 ? 'CHANCE: on to the jackpot chance' : 'UP: down to the next disc') : kind === 'out' ? 'OUT' : kind === 'mystery' ? '?: a multiple the lamps pick' : kind === 'jackpot' ? `JP: the jackpot, ×${JACKPOT}` : `×${pays}`;
const jaPocket = (kind: PocketKind, level: number, pays = 0) =>
  kind === 'up' ? (level >= 2 ? `CHANCE：${B}ジャックポット${B}チャンスへ` : `UP：${B}次の段へ`) : kind === 'out' ? 'OUT' : kind === 'mystery' ? `？：${B}ランプが${B}倍率を${B}決める` : kind === 'jackpot' ? `JP：${B}ジャックポット${B}×${JACKPOT}` : `×${pays}`;

/** What a run came to, in a few words for the status line (`status`) and a sentence for a screen reader (`say`). */
function enOutcome(run: Run, bet: number): { status: string; say: string } {
  const last = run.stops[run.stops.length - 1];
  const won = run.pays * bet;
  if (run.jackpot) return { status: `JACKPOT!! +${won.toLocaleString('en-US')}`, say: `The ball dropped into JP on the jackpot disc: the jackpot, ${enMedals(won)}.` };
  if (won === 0) return { status: `OUT on ${enDisc(last.level)}`, say: `The ball dropped into OUT on ${enDisc(last.level)}. Nothing this time.` };
  return { status: `×${run.pays} on ${enDisc(last.level)}! +${won.toLocaleString('en-US')}`, say: `The ball came to rest on ${enDisc(last.level)} in ×${run.pays}: ${enMedals(won)}.` };
}

function jaOutcome(run: Run, bet: number): { status: string; say: string } {
  const last = run.stops[run.stops.length - 1];
  const won = run.pays * bet;
  if (run.jackpot) return { status: `ジャックポット！！${B}+${won.toLocaleString('ja-JP')}枚`, say: `ボールがジャックポットの段のJPに入りました。ジャックポット、${jaMedals(won)}です。` };
  if (won === 0) return { status: `${jaDisc(last.level)}で${B}OUT`, say: `ボールは${jaDisc(last.level)}のOUTに入りました。今回はなしです。` };
  return { status: `${jaDisc(last.level)}で${B}×${run.pays}！${B}+${won.toLocaleString('ja-JP')}枚`, say: `ボールは${jaDisc(last.level)}の×${run.pays}に入りました。${jaMedals(won)}の当たりです。` };
}

/** What the status line says as the ball settles in a pocket. */
function enSettled(stop: Stop, bet: number): string {
  if (stop.kind === 'up') return isChance(stop) ? (stop.level === 2 ? 'CHANCE! On to the jackpot chance.' : 'CHANCE! On to the jackpot disc!') : `UP! Down to ${enDisc(stop.level + 1)}.`;
  if (stop.kind === 'mystery') return '“?” — the lamps run…';
  if (stop.kind === 'jackpot') return 'JP!! JACKPOT!';
  if (stop.kind === 'out') return 'OUT.';
  return `×${stop.pays}! +${(stop.pays * bet).toLocaleString('en-US')}`;
}

function jaSettled(stop: Stop, bet: number): string {
  if (stop.kind === 'up') return isChance(stop) ? (stop.level === 2 ? `CHANCE！${B}ジャックポット${B}チャンスへ。` : `CHANCE！${B}ジャックポットの段へ！`) : `UP！${B}${jaDisc(stop.level + 1)}へ。`;
  if (stop.kind === 'mystery') return `「？」${B}ランプが${B}回る…`;
  if (stop.kind === 'jackpot') return `JP！！${B}ジャックポット！`;
  if (stop.kind === 'out') return 'OUT。';
  return `×${stop.pays}！${B}+${(stop.pays * bet).toLocaleString('ja-JP')}枚`;
}

const en = {
  title: 'Firework Ball Tower',
  /** The title in the pieces it may be broken between on a narrow screen. */
  titleParts: ['Firework', 'Ball Tower'],
  subtitle: 'The big machine of the festival floor: a steel ball goes up the lift to the top of a glass tower and comes down five turning discs. UP takes it on, OUT ends it, and only a run that goes UP all the way reaches the jackpot.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  /** The marquee over the cabinet. */
  marqueeSub: 'FIREWORK',
  marquee: 'BALL TOWER',
  jackpotLabel: 'JACKPOT',
  jackpotNote: (bet: number) => `×${JACKPOT} the bet: ${enMedals(JACKPOT * bet)}`,
  /** The badge over a run from before this page that simply ended, shown again (`resumed` is a run this page finished). */
  lastRun: 'Last run',
  medals: 'MEDALS',
  betLabel: 'BET',
  win: 'WIN',
  start: 'START',
  startAria: (bet: number) => `START: one ball for ${enMedals(bet)}`,
  skip: 'Skip',
  /** Why Skip waits: it only fast-forwards, once the ball is at the top of the tower. */
  skipWhy: 'once the ball is up',
  betsLabel: 'Medals a ball',
  betAria: (bet: number) => `Bet ${enMedals(bet)} a ball`,
  boardLabel: (where: string) => `The ball tower: five turning discs, one above another, each ringed with pockets, and the lift up the side. ${where}`,
  whereIdle: 'No ball in play.',
  whereLift: 'The ball is going up the lift.',
  whereDisc: (level: number) => `The ball is rolling round ${enDisc(level)}.`,
  whereRest: (level: number) => `The ball is at rest on ${enDisc(level)}.`,
  pocketWords: (kind: PocketKind, level: number, pays?: number) => enPocket(kind, level, pays),
  discName: (level: number) => (level === LEVELS - 1 ? 'Jackpot disc' : level === 3 ? 'Chance disc' : `Disc ${level + 1}`),
  status: {
    first: 'Pick your bet and press START: one ball down the tower.',
    again: 'Press START for another ball.',
    lift: 'Up the lift it goes…',
    disc: (level: number) => (level === LEVELS - 1 ? 'The jackpot disc! Round and round…' : level === 3 ? 'The chance disc! Round and round…' : `Disc ${level + 1} of ${LEVELS}: round and round…`),
    settled: enSettled,
    lamp: (pays: number, bet: number) => `The lamps stop on ×${pays}! +${(pays * bet).toLocaleString('en-US')}`,
  },
  /** The flash over the tower as a run ends well. */
  flash: (run: Run) => (run.jackpot ? 'JACKPOT!!' : `×${run.pays}!`),
  outcome: enOutcome,
  notEnough: (bet: number) => `Not enough medals: a ball at this bet takes ${bet}.`,
  unsaved: 'This browser’s storage is full: the run cannot be kept, so no medals were taken.',
  unfinished: 'A run from before is being finished first.',
  cardAway: 'Your medals are in a machine in another tab.',
  playHere: 'Play here',
  refill: (medals: number) => `Out of medals — take ${medals} more`,
  outOfMedals: 'Out of medals.',
  tooFew: (medals: number) => `A ball at this bet takes more than your ${enMedals(medals)}: pick a smaller bet.`,
  resumed: 'Finished from before',
  /** A run this page finished as it gave up the medals (hidden, left or reloaded), or found left unfinished. */
  finishedAway: (won: number) => (won > 0 ? `The run was finished while you were away: it paid ${enMedals(won)}.` : 'The run was finished while you were away: it ended OUT.'),
  sayStart: (bet: number) => `${enMedals(bet)} in: the ball goes up the lift.`,
  sayTop: 'The ball is at the top of the tower.',
  sayLand: (level: number) => `The ball drops onto ${enDisc(level)}.`,
  saySettled: (stop: Stop, bet: number) => enSettled(stop, bet),
  sayResumed: 'A run left unfinished was finished, as it was drawn.',
  sayRestart: 'The medals were reset at the medal center.',
  sayRefill: (medals: number) => `${enMedals(medals)} added.`,
  sayBet: (bet: number) => `Bet: ${enMedals(bet)} a ball.`,
  historyTitle: 'Last runs',
  historyEmpty: 'No runs yet.',
  historyEntry: (run: Run, bet: number) => (run.jackpot ? `JP! +${run.pays * bet}` : run.pays > 0 ? `×${run.pays} +${run.pays * bet}` : `OUT ${run.stops.length}`),
  historyEntryLabel: (run: Run, bet: number) => (run.jackpot ? `The jackpot: ${enMedals(run.pays * bet)}` : run.pays > 0 ? `×${run.pays} on ${enDisc(run.stops.length - 1)}: ${enMedals(run.pays * bet)}` : `OUT on ${enDisc(run.stops.length - 1)}`),
  sessionTitle: 'This visit',
  runs: 'Runs',
  played: 'Medals played',
  won: 'Medals won',
  net: 'Net',
  chances: 'Jackpot chances',
  jackpots: 'Jackpots',
  cameBack: 'Came back',
  everyBetBack: 'Every bet brings back',
  keysHint: 'Keys: Space or Enter starts · ← → change the bet · S skips once the ball is up',
  notMoney: NOT_MONEY.en,
  centerNote: 'Your medals are the medal center’s, shared by every machine there.',
  centerNoteLink: 'Medal Game Center',
  infoBody: (back: string) => [
    `Pick a bet (${BETS.join(', ')} medals a ball) and press START: the medals go in, and a steel ball goes up the lift to the top of the glass tower.`,
    `It drops onto the top disc and rolls round it as it turns, slows, and settles in a pocket. UP drops it through to the disc below; OUT ends the run. Every other pocket pays a multiple of your bet and ends the run: ×1 gives the bet back, ×3 three times it. A "?" pocket lights the disc’s lamp roulette, and the lamp it stops on is the multiple.`,
    `Each disc has fewer pockets than the one above it, and fewer UPs: 6 of 18 on the top disc, 3 of 15 on the second, and one CHANCE on the third and the fourth, the jackpot chance. Only a run that goes UP on every disc reaches the jackpot disc, where JP pays ×${JACKPOT} your bet.`,
    `Every bet brings back the same, ${back} of the medals played: the Odds tab works out every pocket’s chances exactly.`,
    'Where the ball ends is drawn the moment you press START; the tower only shows it. Skip (once the ball is at the top) takes it straight to its pocket. Leave the page in the middle of a run and it is finished for you, as it was drawn, and paid.',
    NOT_MONEY.en,
  ],
  // ── The Odds tab ──
  oddsIntro: [
    'Everything is worked out exactly, as fractions. The run is a Markov chain over the five discs: each pocket of a disc is as likely as any other, and each either ends the run with what it pays or drops the ball to the disc below. What a ball is worth on a disc is each pocket’s pay (a "?" pocket’s lamps on average), or what it is worth on the disc below for an UP, over the disc’s pockets.',
    'Every pocket pays a multiple of the bet, so no bet is better than another: each brings back exactly the same, and the floor is told that.',
  ],
  backLabel: 'Return, every bet',
  backNote: 'medals back for every medal played, over every way a run can go',
  hitLabel: 'A ball pays',
  hitNote: 'the chance of any pocket that pays',
  jackpotOdds: 'The jackpot',
  jackpotOddsNote: (bet: string) => `1 ball in ${bet}: UP on every disc, then JP`,
  rulesTitle: 'How it works',
  rules: [
    `A ball takes ${BETS.join(', ')} medals, the bet you pick. Every pocket pays its multiple of the bet.`,
    'Five discs, each with its pockets round its rim, all of a disc’s pockets as wide: the ball is as likely to settle in any one of them.',
    'UP (CHANCE on the third and fourth discs) drops the ball through to the disc below. OUT ends the run with nothing. Every other pocket ends it, and pays.',
    `A "?" pocket lights the disc’s lamp roulette: each lamp is as likely, and the multiple on the lamp it stops on is paid. JP, on the jackpot disc, pays ×${JACKPOT}.`,
    'Where the ball settles on each disc, and the lamp each roulette stops on, are drawn the moment START is pressed: ten numbers, two a disc. Nothing is drawn as the ball comes down.',
    'Skip only fast-forwards: once the ball is at the top of the tower, it takes it straight to its pocket.',
    'While the Odds tab is open the machine waits: the ball and the discs stop, and go on from the same point when you come back.',
    'Leaving the page (or reloading it) in the middle of a run finishes it at once, as it was drawn, and pays it.',
  ],
  betsTitle: 'Every bet',
  colBet: 'Bet',
  colBack: 'Return',
  colJackpot: 'Jackpot',
  betRow: (bet: Bet) => enMedals(bet),
  discsTitle: 'Each disc’s pockets',
  discsNote: 'Out of the disc’s pockets: how many of each kind, the chance of each once the ball is on the disc, and what it does.',
  discHeading: (level: number, chance: string) => `${level === LEVELS - 1 ? 'The jackpot disc' : level === 3 ? 'The chance disc' : `Disc ${level + 1}`}: ${POCKETS[level]} pockets, reached by ${chance} of balls`,
  colPocket: 'Pocket',
  colCount: 'Pockets',
  colChance: 'Chance',
  lampsTitle: 'The lamp roulettes',
  lampsNote: 'A ball in a "?" pocket lights its disc’s roulette: each lamp is as likely, and its multiple is paid.',
  lampHeading: (level: number) => `${level === LEVELS - 1 ? 'The jackpot disc' : level === 3 ? 'The chance disc' : `Disc ${level + 1}`}: ${LAMP_SETS[level].length} lamps`,
  colLampPays: 'Multiple',
  colLamps: 'Lamps',
  paysTitle: 'What a ball pays',
  colPays: 'Pays',
  paysRow: (pays: number) => (pays === JACKPOT ? `×${pays} (JP)` : `×${pays}`),
  nothingRow: 'Nothing (OUT)',
  checkTitle: 'A check by play',
  checkNote: (runs: string) => `${runs} balls, drawn at random as the machine draws them, beside the exact figures.`,
  checkRun: 'Play them',
  checkRunning: 'Playing…',
  colWhat: 'What',
  colExact: 'Exact',
  colSeen: 'Played',
  checkBack: 'Return',
  checkReach: (level: number) => `Reached ${enDisc(level)}`,
  fractionNote: (fraction: string) => `As a fraction: ${fraction}.`,
};

export type BallTowerStrings = typeof en;

const ja: BallTowerStrings = {
  title: '花火ボールタワー',
  titleParts: ['花火', 'ボールタワー'],
  subtitle: `お祭りフロアの${B}大型機。${B}鉄のボールが${B}リフトで${B}ガラスのタワーの${B}てっぺんへ上がり、${B}回る5段の${B}回転盤を${B}下りてきます。${B}UPで次の段、${B}OUTで終わり。${B}全部の段で${B}UPした${B}ボールだけが${B}ジャックポットへ。`,
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabMachine: 'マシン',
  tabOdds: '確率',
  marqueeSub: '花火',
  marquee: 'BALL TOWER',
  jackpotLabel: 'ジャックポット',
  jackpotNote: (bet: number) => `ベットの×${JACKPOT}：${jaMedals(JACKPOT * bet)}`,
  lastRun: '前回のボール',
  medals: '持ちメダル',
  betLabel: 'ベット',
  win: '当たり',
  start: 'スタート',
  startAria: (bet: number) => `スタート（${bet}枚でボール1球）`,
  skip: 'スキップ',
  skipWhy: 'ボールが上に着いてから',
  betsLabel: '1球のメダル',
  betAria: (bet: number) => `1球${jaMedals(bet)}でベット`,
  boardLabel: (where: string) => `ボールタワー：ポケットがまわりに並んだ回転盤が5段に重なり、横にリフトがあります。${where}`,
  whereIdle: 'ボールは出ていません。',
  whereLift: 'ボールがリフトで上がっています。',
  whereDisc: (level: number) => `ボールが${jaDisc(level)}を転がっています。`,
  whereRest: (level: number) => `ボールは${jaDisc(level)}で止まっています。`,
  pocketWords: (kind: PocketKind, level: number, pays?: number) => jaPocket(kind, level, pays),
  discName: (level: number) => (level === LEVELS - 1 ? `ジャックポットの${B}段` : level === 3 ? `チャンスの${B}段` : `${level + 1}段目`),
  status: {
    first: `ベットを${B}選んで${B}「スタート」。${B}ボール1球が${B}タワーを${B}下ります。`,
    again: `もう一度${B}「スタート」で${B}次のボール。`,
    lift: `リフトで${B}上がって${B}いく…`,
    disc: (level: number) => (level === LEVELS - 1 ? `ジャックポットの段！${B}ころころ…` : level === 3 ? `チャンスの段！${B}ころころ…` : `${level + 1}段目／${LEVELS}：${B}ころころ…`),
    settled: jaSettled,
    lamp: (pays: number, bet: number) => `ランプは${B}×${pays}で${B}止まった！${B}+${(pays * bet).toLocaleString('ja-JP')}枚`,
  },
  flash: (run: Run) => (run.jackpot ? 'ジャックポット！！' : `×${run.pays}！`),
  outcome: jaOutcome,
  notEnough: (bet: number) => `メダルが${B}足りません。${B}このベットは${B}1球${bet}枚です。`,
  unsaved: `このブラウザの保存領域が${B}いっぱいのため、${B}記録できません。${B}メダルは使っていません。`,
  unfinished: `前のボールを${B}先に終わらせています。`,
  cardAway: `持ちメダルは${B}別のタブの${B}マシンで${B}使われています。`,
  playHere: 'ここで遊ぶ',
  refill: (medals: number) => `メダルがなくなりました — ${medals}枚もらう`,
  outOfMedals: 'メダルがなくなりました。',
  tooFew: (medals: number) => `このベットには${B}のこりの${medals}枚では${B}足りません。${B}小さいベットを${B}選んでください。`,
  resumed: '前のボールの続き',
  finishedAway: (won: number) => (won > 0 ? `離れている間に${B}ボールが${B}止まりました。${B}${jaMedals(won)}の${B}当たりです。` : `離れている間に${B}ボールが${B}止まりました。${B}OUTでした。`),
  sayStart: (bet: number) => `メダルを${bet}枚入れました。ボールがリフトで上がります。`,
  sayTop: 'ボールがタワーのてっぺんに着きました。',
  sayLand: (level: number) => `ボールが${jaDisc(level)}に落ちました。`,
  saySettled: (stop: Stop, bet: number) => jaSettled(stop, bet).split(B).join(''),
  sayResumed: '途中だったボールを、決まっていたとおりに終わらせました。',
  sayRestart: 'メダルゲームセンターでメダルがリセットされました。',
  sayRefill: (medals: number) => `${jaMedals(medals)}を補充しました。`,
  sayBet: (bet: number) => `ベットは1球${jaMedals(bet)}です。`,
  historyTitle: '最近のボール',
  historyEmpty: 'まだ遊んでいません。',
  historyEntry: (run: Run, bet: number) => (run.jackpot ? `JP！+${run.pays * bet}枚` : run.pays > 0 ? `×${run.pays} +${run.pays * bet}枚` : `OUT ${run.stops.length}段目`),
  historyEntryLabel: (run: Run, bet: number) => (run.jackpot ? `ジャックポット：${jaMedals(run.pays * bet)}` : run.pays > 0 ? `${jaDisc(run.stops.length - 1)}で×${run.pays}：${jaMedals(run.pays * bet)}` : `${jaDisc(run.stops.length - 1)}でOUT`),
  sessionTitle: '今回のプレイ',
  runs: `ボールの${B}数`,
  played: `使った${B}メダル`,
  won: `当たった${B}メダル`,
  net: '差し引き',
  chances: `ジャックポット${B}チャンス`,
  jackpots: 'ジャックポット',
  cameBack: `戻った${B}割合`,
  everyBetBack: `どの${B}ベットも${B}戻りは`,
  keysHint: 'キー：Space か Enter でスタート・← → でベットを変える・ボールが上に着いたら S でスキップ',
  notMoney: NOT_MONEY.ja,
  centerNote: '持ちメダルはメダルゲームセンターのもので、どのマシンでも同じメダルで遊べます。',
  centerNoteLink: 'メダルゲームセンター',
  infoBody: (back: string) => [
    `ベット（1球${BETS.join('・')}枚）を選んで「スタート」を押すと、メダルが入り、鉄のボールがリフトでガラスのタワーのてっぺんへ上がります。`,
    'ボールはいちばん上の回転盤に落ち、回る盤の上を転がって、だんだん遅くなり、どれかのポケットに入ります。UPなら下の段へ落ち、OUTならそこで終わり。ほかのポケットはベットの何倍かがもらえて、そこで終わります（×1はベットがそのまま戻り、×3なら3倍）。「？」のポケットはその段のランプが回り、止まったランプの倍率になります。',
    `下の段ほどポケットもUPも少なくなります。いちばん上は18のうち6つがUP、2段目は15のうち3つ、3段目と4段目はCHANCEが1つずつ（ジャックポットチャンス）。全部の段でUPしたボールだけがジャックポットの段まで行き、JPに入ればベットの×${JACKPOT}です。`,
    `どのベットでも戻りは同じ${back}。くわしくは「確率」タブで、すべてのポケットの確率を正確に計算しています。`,
    'ボールがどこに入るかは「スタート」を押したときに決まっていて、タワーはそれを見せるだけです。スキップ（ボールがてっぺんに着いてから）でそのポケットまで一気に進みます。途中でページを離れても、決まっていたとおりに終わらせて、当たりをお渡しします。',
    NOT_MONEY.ja,
  ],
  oddsIntro: [
    'すべて分数で正確に計算しています。ボールの行き方は5段の回転盤をたどるマルコフ連鎖です。ひとつの段のポケットはどれも同じ確率で、それぞれ当たりを払って終わるか、ボールを下の段へ落とします。ある段でのボールの価値は、ポケットごとの当たり（「？」はランプの平均）、UPなら下の段での価値を、その段のポケットの数で割ったものです。',
    'どのポケットもベットの何倍かなので、どのベットが得ということはありません。どれもまったく同じ戻りで、フロアにもその値を伝えています。',
  ],
  backLabel: `戻り（${B}どのベットも${B}）`,
  backNote: `使った${B}メダル1枚に${B}つき、${B}ボールの${B}あらゆる行き方の${B}平均で${B}戻る${B}メダル`,
  hitLabel: `当たる${B}確率`,
  hitNote: `何かが${B}もらえる${B}ポケットに${B}入る確率`,
  jackpotOdds: 'ジャックポット',
  jackpotOddsNote: (bet: string) => `${bet}球に${B}1球：${B}全部の段で${B}UPして${B}JP`,
  rulesTitle: 'しくみ',
  rules: [
    `1球のメダルは${B}${BETS.join('・')}枚から${B}選ぶベット。${B}どのポケットも${B}ベットの${B}何倍かを${B}払います。`,
    `回転盤は5段。${B}まわりに${B}ポケットが並び、${B}ひとつの段の${B}ポケットは${B}どれも同じ幅で、${B}どれに入るのも${B}同じ確率です。`,
    `UP（${B}3段目と4段目は${B}CHANCE）は${B}ボールを${B}下の段へ${B}落とします。${B}OUTは${B}何もなしで${B}終わり。${B}ほかのポケットは${B}当たりを払って${B}終わります。`,
    `「？」のポケットは${B}その段の${B}ランプが回り、${B}どのランプも${B}同じ確率で、${B}止まったランプの${B}倍率が${B}もらえます。${B}ジャックポットの段の${B}JPは${B}×${JACKPOT}。`,
    `各段で${B}どのポケットに入るか、${B}ランプが${B}どこで止まるかは、${B}「スタート」を${B}押したときに${B}決まります（${B}1段に2つ、${B}10個の数）。${B}ボールが下りる${B}途中で${B}何かを引くことは${B}ありません。`,
    `スキップは${B}早送りだけ。${B}ボールが${B}てっぺんに着いたら、${B}入るポケットまで${B}一気に進みます。`,
    `「確率」タブを${B}見ている間は${B}マシンが待ちます。${B}ボールも回転盤も止まり、${B}戻ると${B}同じところから${B}続きます。`,
    `ボールの途中で${B}ページを離れる（${B}再読み込みする）と、${B}すぐに${B}決まっていたとおりに${B}終わらせて、${B}当たりを${B}お渡しします。`,
  ],
  betsTitle: 'ベットごとの戻り',
  colBet: 'ベット',
  colBack: '戻り',
  colJackpot: 'ジャックポット',
  betRow: (bet: Bet) => jaMedals(bet),
  discsTitle: `各段の${B}ポケット`,
  discsNote: `その段の${B}ポケットのうち、${B}種類ごとの数と、${B}ボールが${B}その段に来たときの${B}確率、${B}どうなるか。`,
  discHeading: (level: number, chance: string) => `${level === LEVELS - 1 ? `ジャックポットの${B}段` : level === 3 ? `チャンスの${B}段` : `${level + 1}段目`}：${B}ポケット${POCKETS[level]}個、${B}ボールの${B}${chance}が${B}ここまで`,
  colPocket: 'ポケット',
  colCount: '数',
  colChance: '確率',
  lampsTitle: `ランプ${B}ルーレット`,
  lampsNote: `「？」に${B}入ると${B}その段の${B}ランプが回ります。${B}どのランプも${B}同じ確率で、${B}止まった${B}ランプの${B}倍率が${B}もらえます。`,
  lampHeading: (level: number) => `${level === LEVELS - 1 ? `ジャックポットの${B}段` : level === 3 ? `チャンスの${B}段` : `${level + 1}段目`}：${B}ランプ${LAMP_SETS[level].length}個`,
  colLampPays: '倍率',
  colLamps: 'ランプ',
  paysTitle: `1球で${B}もらえる${B}倍率`,
  colPays: '倍率',
  paysRow: (pays: number) => (pays === JACKPOT ? `×${pays}（JP）` : `×${pays}`),
  nothingRow: `なし（${B}OUT）`,
  checkTitle: `じっさいに${B}遊んで${B}たしかめる`,
  checkNote: (runs: string) => `${runs}球を、マシンと同じようにランダムに引いた結果を、正確な値とならべます。`,
  checkRun: '遊ぶ',
  checkRunning: '遊んでいます…',
  colWhat: '項目',
  colExact: `正確な${B}値`,
  colSeen: `遊んだ${B}結果`,
  checkBack: '戻り',
  checkReach: (level: number) => `${jaDisc(level)}まで${B}行った`,
  fractionNote: (fraction: string) => `分数で：${fraction}`,
};

export const getStrings = (language: GameLanguage): BallTowerStrings => (language === 'ja' ? ja : en);

/** Every disc's pockets by kind, for the Odds tab: the kinds in the order they are first met round the rim, and how many of each. */
export function pocketKindsOf(level: number): { kind: PocketKind; pays: number; count: number }[] {
  const rows: { kind: PocketKind; pays: number; count: number }[] = [];
  for (const pocket of DISCS[level]) {
    const pays = pocket.kind === 'pay' ? pocket.pays : 0;
    const row = rows.find((r) => r.kind === pocket.kind && r.pays === pays);
    if (row) row.count += 1;
    else rows.push({ kind: pocket.kind, pays, count: 1 });
  }
  const order: PocketKind[] = ['jackpot', 'up', 'mystery', 'pay', 'out'];
  return rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.pays - b.pays);
}
