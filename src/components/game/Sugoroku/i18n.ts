import { NOT_MONEY } from '../MedalCenter/strings';
import { BOARD, BLOWHOLE, JP_FACE, UNIT, medalsFor, type ArrowKind, type Play, type SquareKind } from './engine';
import type { Banner } from './scene';

/**
 * Every word Whale Isle Sugoroku shows, in English and Japanese.
 *
 * Medals are not money, and nothing here may read as money (no bank,
 * deposit, withdraw, balance, cash, cash out, wager, payout or $; no 預け,
 * 残高, お金, 換金, 賭け): the medals are "your medals" / 「持ちメダル」, and
 * `notMoney` says outright that the medals are not money.
 */

/** A figure per 2 medals bet as a multiple of the bet: ×½, ×1, ×5, ×100. */
export const timesOf = (pays: number): string => {
  const whole = Math.floor(pays / UNIT);
  const half = pays % UNIT !== 0;
  return `×${whole === 0 && half ? '' : whole}${half ? '½' : ''}`;
};

const enMedals = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'medal' : 'medals'}`;
const jaMedals = (n: number) => `${n.toLocaleString('ja-JP')}枚`;

const EN_NAMES: Record<SquareKind, string> = {
  start: 'START',
  shell: 'Shell',
  pearl: 'Pearl',
  rest: 'Palm tree',
  tailwind: 'Tailwind',
  current: 'Ebb tide',
  storm: 'Storm',
  whirlpool: 'Whirlpool',
  lamp: 'Lamp Chance',
  jp: 'JP Chance',
  whale: 'Whale Ride',
};
const JA_NAMES: Record<SquareKind, string> = {
  start: 'スタート',
  shell: '貝がら',
  pearl: '真珠',
  rest: 'ヤシの木',
  tailwind: '追い風',
  current: '引き潮',
  storm: '嵐',
  whirlpool: 'うずしお',
  lamp: 'ランプチャンス',
  jp: 'JPチャンス',
  whale: 'くじらライド',
};

/** What a roll came to, in a few words for the status line (`status`) and a sentence for a screen reader (`say`). */
function enOutcome(play: Play, bet: number): { status: string; say: string } {
  const won = medalsFor(bet, play.pays);
  const parts: string[] = [];
  if (play.lap) parts.push('past START');
  const landed = BOARD[play.landed].kind;
  if (play.sent) parts.push(play.sent.kind === 'whirlpool' ? 'Whirlpool, back to START' : `${EN_NAMES[landed]} to the ${EN_NAMES[BOARD[play.stop].kind]}`);
  else if (landed !== 'start') parts.push(EN_NAMES[landed]);
  if (play.ride) parts.push(play.ride.blowhole ? 'up to the blowhole' : `${play.ride.steps.reduce((sum, step) => sum + step.roll, 0)} squares up the whale`);
  const chance = play.chance;
  if (chance?.kind === 'lamp') parts.push(timesOf(chance.pays));
  else if (chance?.kind === 'jp') parts.push(chance.star ? (chance.jackpot ? 'JP FINAL: a 6, the JACKPOT' : `JP FINAL: a ${chance.final}, ${timesOf(chance.pays)}`) : chance.pays > 0 ? timesOf(chance.pays) : 'no prize');
  const what = parts.join(', ');
  const status = `${play.draw.roll}! ${what}${won > 0 ? ` → +${won.toLocaleString('en-US')}` : ' → nothing'}`;
  const say = `Rolled a ${play.draw.roll}: ${what}. ${won > 0 ? `${enMedals(won)} won.` : 'Nothing this time.'}`;
  return { status, say };
}

function jaOutcome(play: Play, bet: number): { status: string; say: string } {
  const won = medalsFor(bet, play.pays);
  const parts: string[] = [];
  if (play.lap) parts.push('スタート通過');
  const landed = BOARD[play.landed].kind;
  if (play.sent) parts.push(play.sent.kind === 'whirlpool' ? 'うずしおでふりだしへ' : `${JA_NAMES[landed]}で${JA_NAMES[BOARD[play.stop].kind]}へ`);
  else if (landed !== 'start') parts.push(JA_NAMES[landed]);
  if (play.ride) parts.push(play.ride.blowhole ? '潮吹き穴まで' : `くじらの背中を${play.ride.steps.reduce((sum, step) => sum + step.roll, 0)}マス`);
  const chance = play.chance;
  if (chance?.kind === 'lamp') parts.push(timesOf(chance.pays));
  else if (chance?.kind === 'jp') parts.push(chance.star ? (chance.jackpot ? 'JPファイナルで6、ジャックポット' : `JPファイナルは${chance.final}、${timesOf(chance.pays)}`) : chance.pays > 0 ? timesOf(chance.pays) : 'はずれ');
  const what = parts.join('・');
  const status = `${play.draw.roll}！${what}${won > 0 ? `→+${won.toLocaleString('ja-JP')}枚` : '→なし'}`;
  const say = `${play.draw.roll}が出ました。${what}。${won > 0 ? `${jaMedals(won)}の当たり。` : '今回はなしです。'}`;
  return { status, say };
}

const enArrow: Record<ArrowKind, string> = { tailwind: 'TAILWIND!', current: 'EBB TIDE…', storm: 'STORM!', whirlpool: 'WHIRLPOOL! BACK TO START' };
const jaArrow: Record<ArrowKind, string> = { tailwind: '追い風！', current: '引き潮…', storm: '嵐！', whirlpool: 'うずしお！ふりだしに戻る' };

const en = {
  title: 'Whale Isle Sugoroku',
  /** The title in the pieces it may be broken between on a narrow screen. */
  titleParts: ['Whale Isle', 'Sugoroku'],
  subtitle: 'The board-game machine of the medal floor: roll the die, sail the boat round the island, and ride the whale to the jackpot.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  sign: 'WHALE ISLE',
  signSub: 'SUGOROKU',
  medals: 'MEDALS',
  bet: 'BET',
  win: 'WIN',
  betGroup: 'Bet',
  betAria: (bet: number) => `Bet ${enMedals(bet)}`,
  roll: 'ROLL',
  skip: 'Skip',
  boardLabel: (where: string) => `The board: 30 squares round Whale Isle. ${where}`,
  boatOn: (square: number, name: string) => `The boat is on square ${square}: ${name}.`,
  boatRiding: 'The boat is riding the whale.',
  ringLabel: 'The 30 squares round the island',
  squareName: (kind: SquareKind) => EN_NAMES[kind],
  /** What a square says on the board, read out: what it is, and what it does at the bet chosen. */
  squareAria: (square: number, kind: SquareKind, medals: number, to: number | null, here: boolean) => {
    const what = (() => {
      switch (kind) {
        case 'start':
          return `START: sailing past it pays ${enMedals(medals)}`;
        case 'shell':
        case 'pearl':
          return `${EN_NAMES[kind]}: ${enMedals(medals)}`;
        case 'rest':
          return 'Palm tree: a rest';
        case 'whirlpool':
          return 'Whirlpool: back to START';
        case 'tailwind':
          return `Tailwind: on to square ${to}`;
        case 'current':
        case 'storm':
          return `${EN_NAMES[kind]}: back to square ${to}`;
        case 'lamp':
          return 'Lamp Chance';
        case 'jp':
          return 'JP Chance';
        case 'whale':
          return 'Whale Ride, the bonus';
      }
    })();
    return `Square ${square}, ${what}${here ? '. The boat is here' : ''}`;
  },
  legendTitle: 'What the squares do',
  /** Each kind of square in the legend under the controls, in board order: its name and what it does. */
  legend: [
    ['start', 'START', 'sailing past pays ×½'],
    ['shell', 'Shell', '×½'],
    ['pearl', 'Pearl', '×1'],
    ['rest', 'Palm tree', 'a rest'],
    ['tailwind', 'Tailwind', 'on that many squares'],
    ['current', 'Ebb tide', 'back that many squares'],
    ['storm', 'Storm', 'back that many squares'],
    ['whirlpool', 'Whirlpool', 'back to START'],
    ['lamp', 'Lamp Chance', '×1 to ×10'],
    ['whale', 'Whale Ride', 'the bonus: 3 free rolls'],
    ['jp', 'JP Chance', 'a 6 at the JP final is ×100'],
  ] as [SquareKind, string, string][],
  laneLabel: 'The whale’s back: 10 squares and the blowhole',
  laneAria: (step: number, medals: number): string => (step === BLOWHOLE ? 'The blowhole: the JP Chance' : `Whale’s back, square ${step}: ${enMedals(medals)}`),
  lampsLabel: (set: 'lamp' | 'jp' | null): string => (set === 'lamp' ? 'The lamps, set for the Lamp Chance' : set === 'jp' ? 'The lamps, set for the JP Chance' : 'The lamps round the dome'),
  dieAria: (face: number, rolling: boolean): string => (rolling ? 'The die is tumbling' : `The die shows ${face}`),
  banner: (banner: Banner, bet: number): string => {
    switch (banner.kind) {
      case 'lap':
        return `LAP +${medalsFor(bet, banner.pays)}`;
      case 'pays':
      case 'total':
        return `+${medalsFor(bet, banner.pays).toLocaleString('en-US')}`;
      case 'rest':
        return 'REST';
      case 'arrow':
        return enArrow[banner.arrow];
      case 'lamp':
        return 'LAMP CHANCE';
      case 'jp':
        return 'JP CHANCE';
      case 'final':
        return `JP FINAL: ROLL A ${JP_FACE}!`;
      case 'jackpot':
        return `JACKPOT! +${medalsFor(bet, banner.pays).toLocaleString('en-US')}`;
      case 'ride':
        return 'WHALE RIDE!';
      case 'blowhole':
        return 'THE BLOWHOLE!';
      case 'times':
        return banner.pays > 0 ? `${timesOf(banner.pays)} +${medalsFor(bet, banner.pays).toLocaleString('en-US')}` : 'NO PRIZE';
      case 'none':
        return '';
    }
  },
  status: {
    first: 'Choose a bet, then ROLL.',
    idle: (name: string) => `The boat is on ${name === EN_NAMES.start ? '' : 'the '}${name}. Choose a bet and ROLL.`,
    rolling: 'Rolling the die…',
    sailing: (face: number) => `A ${face}!`,
    arrow: (name: string) => `${name}!`,
    lamp: 'LAMP CHANCE: the lamps are running…',
    jp: 'JP CHANCE: will the star light up?',
    final: `JP FINAL: a ${JP_FACE} is the jackpot!`,
    ride: 'WHALE RIDE: three free rolls up the whale’s back',
  },
  outcome: enOutcome,
  outOfMedals: 'No medals left.',
  notEnough: 'Not enough medals for that bet.',
  /** A last medal or two that no bet can take: there is no refill while there are any, so they are for another machine. */
  tooFew: (medals: number, least: number) => `A roll takes at least ${least} medals: play your last ${medals === 1 ? 'one' : medals} on another machine.`,
  unsaved: 'This browser’s storage is full: the roll could not be written down, so it was not played. Try again.',
  unfinished: 'Finishing the last roll first.',
  refill: (medals: number) => `Out of medals — take ${medals} more`,
  cardAway: 'Your medals are in a machine in another tab.',
  playHere: 'Play here',
  resumed: 'Roll resumed',
  keysHint: 'Keys: Space or Enter rolls (or skips) · S skips · B changes the bet',
  notMoney: NOT_MONEY.en,
  centerNote: 'Your medals are the Medal Game Center’s, shared by every machine there.',
  centerNoteLink: 'Daily bonus and refills at the front',
  historyTitle: 'Last rolls',
  historyEmpty: 'No rolls yet.',
  historyEntry: (face: number, won: number): string => (won > 0 ? `${face}: +${won.toLocaleString('en-US')}` : `${face}: —`),
  historyJackpot: 'JP',
  sessionTitle: 'This visit',
  rolls: 'Rolls',
  played: 'Medals played',
  won: 'Medals won',
  net: 'Net',
  rides: 'Whale rides',
  jackpots: 'Jackpots',
  cameBack: 'Came back',
  longRun: 'Steady play returns',
  sayRoll: (bet: number) => `${enMedals(bet)} in. The die is rolling.`,
  sayResumed: 'Your roll from before the reload: the same roll, played out and paid once.',
  sayRestart: 'The medals were reset at the medal center: the boat is back at START.',
  sayRefill: (medals: number) => `${medals} medals added.`,
  infoBody: (best: string, longRun: string) => [
    'Choose a bet of 2, 4, 6 or 10 medals and press ROLL: the bet goes in and the die tumbles in the dome. The boat sails that many squares round Whale Isle and stays where it stops until your next roll: a reload, or another tab, finds it on the same square.',
    'Every figure is per 2 medals bet, so a bet of 10 is paid five times what a bet of 2 is; the squares show what they pay at your bet. A shell pays half the bet, a pearl the bet back, and a palm tree is a rest. A tailwind carries the boat on; the ebb tide and the storm take it back; the whirlpool sends it back to START, with no lap bonus. Sailing past START pays a lap bonus of half the bet.',
    'LAMP CHANCE: the 12 lamps round the dome run and stop on ×1 to ×10 the bet. JP CHANCE: the same lamps with the JP star among them; at the star comes the JP FINAL, where a 6 on the die is the jackpot, 100 times the bet (1,000 medals on a bet of 10), and any other face pays ×4.',
    'WHALE RIDE: three free rolls up the whale’s back, each square paying ×½ or ×1. Past the tenth square is the blowhole, and the JP CHANCE. The ride is part of the roll that started it, and the boat comes back to the gate.',
    `Every special square is worth the same on average, so from almost every square the next roll brings back ${best} of its bet, whatever you bet; steady play brings back ${longRun} in the long run. The Odds tab shows every square’s figure and how it is worked out.`,
    NOT_MONEY.en,
  ],
  // ── The Odds tab ──
  oddsIntro: [
    'Every figure here is worked out exactly, in fractions, not by playing. Where the boat stands is all that carries from one roll to the next, so the machine is a chain of 30 squares: for each square, every way a roll from it can go (the die, the lamps, the JP final and the whale’s three rolls: 93,312 ways in all) gives what the roll brings back and where it leaves the boat.',
    'You can see where the boat is before you choose your bet, so no square may be one where betting big wins in the long run: from every square, the next roll brings back less than it takes.',
  ],
  longRunLabel: 'Steady play',
  longRunNote: 'of every medal bet comes back, in the long run, at any bet',
  bestLabel: 'Best square',
  bestNote: (count: number) => `the next roll from any of ${count} squares`,
  worstLabel: 'Quietest square',
  worstNote: 'the JP Chance: START, which pays only its lap bonus, is among the next six',
  bettingLabel: 'Betting by the square',
  bettingNote: '10 on every square but the six before START, 2 on those: the most any choice of bet brings back',
  jackpotLabel: 'The jackpot',
  jackpotNote: (rolls: string) => `once in ${rolls} rolls, in the long run`,
  rulesTitle: 'The rules this machine plays by',
  rules: [
    'The die: one six-sided die, each face 1 chance in 6, every roll. The roll is drawn the moment ROLL is pressed.',
    'The board: 30 squares in a loop. The boat stays where it stops until the next roll, through a reload or another tab; a reset at the medal center puts it back at START.',
    'The bet: 2, 4, 6 or 10 medals a roll. Every figure is per 2 medals bet.',
    'The lap bonus: ×½, for sailing past START or onto it, but not for the whirlpool’s trip back to it.',
    'An arrow (a tailwind, the ebb tide, the storm, the whirlpool) moves the boat once; the square it reaches then counts.',
    'The chances and the whale ride are part of the roll that starts them: they take no medals of their own.',
  ],
  squaresTitle: 'Every square',
  squaresNote: 'What the next roll brings back from each square, per medal bet, and how often the boat stands there in the long run. Nobody stops on an arrow: it moves the boat on at once.',
  colSquare: 'Square',
  colWhat: 'What it is',
  colNext: 'Next roll brings back',
  colThere: 'Boat there',
  never: '—',
  arrowTo: (name: string, to: number) => `${name} → ${to}`,
  chancesTitle: 'The chances',
  lampTitle: 'Lamp Chance: 12 lamps',
  jpTitle: 'JP Chance: 12 lamps and the JP final',
  colLamps: 'Lamps',
  colPays: 'Pays',
  colChance: 'Chance',
  starRow: 'The JP star → JP FINAL',
  finalRow: (face: number) => `JP FINAL: a ${face}, the jackpot`,
  finalMiss: 'JP FINAL: any other face',
  noPrize: 'No prize',
  rideTitle: 'Whale Ride: three free rolls',
  rideNote: (blowhole: string) => `The whale’s back pays ×½ or ×1 on each of its squares; the boat reaches the blowhole, and the JP Chance, ${blowhole} of the time.`,
  worthNote: (each: string) => `Each special square (a Lamp Chance, the JP Chance, the Whale Ride) is worth exactly ${each} of the bet on average.`,
  whyTitle: 'Why every square is worth the same',
  why: [
    'A roll from a square lands on one of the six squares after it, each 1 chance in 6, so what it brings back is the average of those six. The board repeats every six squares: a special square, then a shell, a pearl, a palm tree, a shell and a shell. Any six squares in a row hold one of each, so the next roll brings back the same from every square.',
    'Every special square is made to be worth the same on average, and an arrow only ever carries the boat to a square of the kind it stands in for. The one place the six are not alike is just before START: START itself pays only its lap bonus, so the six squares before it are quieter.',
  ],
  chainTitle: 'The long run',
  chain: [
    'How often the boat stands on each square in the long run is the chain’s stationary distribution, solved exactly: the arrows and the whirlpool send it to some squares more often than others. Steady play brings back the average of every square’s next roll, each weighted by how often the boat stands there.',
    'Changing the bet as the boat moves cannot beat that by much: betting 10 on every square but the six before START, and 2 there, is the best any choice of bet can do, and it still brings back less than it takes.',
  ],
  oftenTitle: 'How often, in the long run',
  colEvent: 'Something',
  colEvery: 'Once in',
  oftenRows: {
    paid: 'A roll pays something',
    lap: 'Lap bonus',
    lamp: 'Lamp Chance',
    jpChance: 'JP Chance (on the board or at the blowhole)',
    ride: 'Whale Ride',
    blowhole: 'The blowhole',
    jackpot: 'The jackpot',
    moved: 'An arrow moves the boat',
  },
  inRolls: (n: string) => `${n} rolls`,
  compareTitle: 'Next to the real thing',
  compare: [
    'Board-game medal machines have stood on Japanese medal floors for decades: on some, a medal through a numbered checker or a dice ball off the pusher field moves a piece round a board on the cabinet’s screen; on others a ball’s colour or a digital die decides the steps. Their squares pay medals, start a lottery or a minigame, send the piece forward or back to START, and reaching the goal or a jackpot square earns a jackpot chance that a second draw decides. Kids’ machines keep the bets small and the boards short.',
    'This machine buys its roll with a bet, as the newest machines do, and keeps the rest: squares that pay, move the boat or start a chance, a lap bonus at START, a bonus lane, and a jackpot that a final roll of the die decides. The island, the whale and every square are the floor’s own. The figures are set so that steady play brings back about 90%, as medal machines are commonly set, and so that no square is one to bet big on.',
  ],
  checkTitle: 'Check it',
  checkButton: 'Play 100,000 rolls',
  checkRunning: 'Playing…',
  checkResult: (rolls: string) => `${rolls} rolls from START at one bet:`,
  checkBack: (seen: string, exact: string) => `Came back: ${seen} (exactly: ${exact})`,
  checkLaps: (seen: string, expected: string) => `Lap bonuses: ${seen} (expected: ${expected})`,
  checkRides: (seen: string, expected: string) => `Whale rides: ${seen} (expected: ${expected})`,
  checkJackpots: (seen: string, expected: string) => `Jackpots: ${seen} (expected: ${expected})`,
};

export type SugorokuStrings = typeof en;

const ja: SugorokuStrings = {
  title: 'くじら島すごろく',
  titleParts: ['くじら島', 'すごろく'],
  subtitle: 'メダルフロアのすごろくマシン。サイコロをふって島のまわりを船で進み、くじらに乗ってジャックポットをめざそう。',
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabMachine: 'マシン',
  tabOdds: '確率',
  sign: 'WHALE ISLE',
  signSub: 'すごろく',
  medals: '持ちメダル',
  bet: 'ベット',
  win: '当たり',
  betGroup: 'ベット',
  betAria: (bet) => `${bet}枚ベット`,
  roll: 'サイコロをふる',
  skip: 'スキップ',
  boardLabel: (where) => `すごろく盤：くじら島をめぐる30マス。${where}`,
  boatOn: (square, name) => `船は${square}番のマス「${name}」にいます。`,
  boatRiding: '船はくじらに乗っています。',
  ringLabel: '島をめぐる30マス',
  squareName: (kind) => JA_NAMES[kind],
  squareAria: (square, kind, medals, to, here) => {
    const what = (() => {
      switch (kind) {
        case 'start':
          return `スタート：通過で${jaMedals(medals)}`;
        case 'shell':
        case 'pearl':
          return `${JA_NAMES[kind]}：${jaMedals(medals)}`;
        case 'rest':
          return 'ヤシの木：ひとやすみ';
        case 'whirlpool':
          return 'うずしお：ふりだしに戻る';
        case 'tailwind':
          return `追い風：${to}番のマスへ進む`;
        case 'current':
        case 'storm':
          return `${JA_NAMES[kind]}：${to}番のマスへ戻る`;
        case 'lamp':
          return 'ランプチャンス';
        case 'jp':
          return 'JPチャンス';
        case 'whale':
          return 'くじらライド（ボーナス）';
      }
    })();
    return `${square}番のマス、${what}${here ? '。船はここ' : ''}`;
  },
  legendTitle: 'マスのはたらき',
  legend: [
    ['start', 'スタート', '通過で×½'],
    ['shell', '貝がら', '×½'],
    ['pearl', '真珠', '×1'],
    ['rest', 'ヤシの木', 'ひとやすみ'],
    ['tailwind', '追い風', '数字のマスだけ進む'],
    ['current', '引き潮', '数字のマスだけ戻る'],
    ['storm', '嵐', '数字のマスだけ戻る'],
    ['whirlpool', 'うずしお', 'ふりだしに戻る'],
    ['lamp', 'ランプチャンス', '×1〜×10'],
    ['whale', 'くじらライド', '無料で3回ふれるボーナス'],
    ['jp', 'JPチャンス', 'JPファイナルで6なら×100'],
  ],
  laneLabel: 'くじらの背中：10マスと潮吹き穴',
  laneAria: (step, medals) => (step === BLOWHOLE ? '潮吹き穴：JPチャンス' : `くじらの背中の${step}マスめ：${jaMedals(medals)}`),
  lampsLabel: (set) => (set === 'lamp' ? 'ランプチャンスのランプ' : set === 'jp' ? 'JPチャンスのランプ' : 'ドームのまわりのランプ'),
  dieAria: (face, rolling) => (rolling ? 'サイコロが転がっています' : `サイコロの目は${face}`),
  banner: (banner, bet) => {
    switch (banner.kind) {
      case 'lap':
        return `周回ボーナス +${medalsFor(bet, banner.pays)}`;
      case 'pays':
      case 'total':
        return `+${medalsFor(bet, banner.pays).toLocaleString('ja-JP')}`;
      case 'rest':
        return 'ひとやすみ';
      case 'arrow':
        return jaArrow[banner.arrow];
      case 'lamp':
        return 'ランプチャンス';
      case 'jp':
        return 'JPチャンス';
      case 'final':
        return `JPファイナル　${JP_FACE}を出せ！`;
      case 'jackpot':
        return `ジャックポット！ +${medalsFor(bet, banner.pays).toLocaleString('ja-JP')}`;
      case 'ride':
        return 'くじらライド！';
      case 'blowhole':
        return '潮吹き穴へ！';
      case 'times':
        return banner.pays > 0 ? `${timesOf(banner.pays)} +${medalsFor(bet, banner.pays).toLocaleString('ja-JP')}` : 'はずれ';
      case 'none':
        return '';
    }
  },
  status: {
    first: 'ベットを選んで、サイコロをふろう。',
    idle: (name) => `船は「${name}」にいます。ベットを選んでサイコロをふろう。`,
    rolling: 'サイコロをふっています…',
    sailing: (face) => `${face}が出た！`,
    arrow: (name) => `${name}！`,
    lamp: 'ランプチャンス：ランプが回る…',
    jp: 'JPチャンス：星は光るか？',
    final: `JPファイナル：${JP_FACE}でジャックポット！`,
    ride: 'くじらライド：無料で3回ふれる！',
  },
  outcome: jaOutcome,
  outOfMedals: '持ちメダルがありません。',
  notEnough: 'そのベットには持ちメダルが足りません。',
  tooFew: (medals, least) => `サイコロは${least}枚から。のこりの${medals}枚はほかのマシンで遊べます。`,
  unsaved: 'このブラウザの保存領域がいっぱいで、サイコロの結果を記録できませんでした。サイコロはふっていません。もう一度どうぞ。',
  unfinished: '前のサイコロの続きを先に進めます。',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  cardAway: '持ちメダルは別のタブのマシンで遊ばれています。',
  playHere: 'ここで遊ぶ',
  resumed: '続きから再開',
  keysHint: 'キー：Space か Enter でサイコロ（演出中はスキップ）・S でスキップ・B でベット変更',
  notMoney: NOT_MONEY.ja,
  centerNote: '持ちメダルはメダルゲームセンターのもので、どのマシンでも共通です。',
  centerNoteLink: 'デイリーボーナスと補充は入口で',
  historyTitle: '最近のサイコロ',
  historyEmpty: 'まだふっていません。',
  historyEntry: (face, won) => (won > 0 ? `${face}：+${won.toLocaleString('ja-JP')}` : `${face}：—`),
  historyJackpot: 'JP',
  sessionTitle: '今回の記録',
  // The figures' labels carry their phrase breaks (U+200B, a zero-width space): Safari and Firefox have no
  // `word-break: auto-phrase`, and under keep-all a label breaks only where its words say (「長い目の｜還元率」).
  rolls: 'ふった\u200b回数',
  played: '使った\u200bメダル',
  won: '当たった\u200bメダル',
  net: '差し引き',
  rides: 'くじら\u200bライド',
  jackpots: 'ジャックポット',
  cameBack: '戻り',
  longRun: '長い目の\u200b還元率',
  sayRoll: (bet) => `${jaMedals(bet)}ベット。サイコロが転がります。`,
  sayResumed: '再読み込み前のサイコロです。同じ結果を最後まで見せて、一度だけ払います。',
  sayRestart: 'メダルゲームセンターでメダルがリセットされたので、船はスタートに戻りました。',
  sayRefill: (medals) => `${medals}枚追加しました。`,
  infoBody: (best, longRun) => [
    'ベットを2・4・6・10枚から選んで「サイコロをふる」を押すと、ベットが入ってドームの中でサイコロが転がります。船は出た目の数だけくじら島のまわりを進み、次にふるまでそのマスにとどまります。再読み込みしても、別のタブで開いても、船は同じマスにいます。',
    'マスの数字はすべてベット2枚あたりなので、10枚ベットなら2枚ベットの5倍になります。盤のマスには今のベットでの枚数が出ます。貝がらはベットの半分、真珠はベットと同じ枚数、ヤシの木はひとやすみ。追い風は先へ進み、引き潮と嵐は戻り、うずしおはふりだし（スタート）に戻ります（このとき周回ボーナスはありません）。スタートを通過すると周回ボーナスとしてベットの半分。',
    'ランプチャンス：ドームのまわりの12個のランプが回って、ベットの×1〜×10のどれかで止まります。JPチャンス：同じランプにJPの星がまじり、星で止まるとJPファイナル。サイコロで6が出ればジャックポット、ベットの100倍（10枚ベットなら1,000枚）。ほかの目なら×4です。',
    'くじらライド：くじらの背中を無料で3回ふって進み、止まったマスでベットの×½か×1。10マスめの先は潮吹き穴で、JPチャンスに挑戦できます。ライドはそれを始めたサイコロの一部で、終わると船は入口のマスに戻ります。',
    `特別なマスはどれも平均すると同じ価値なので、ほとんどのマスで次のサイコロの戻りは、いくらベットしても${best}。ふつうに遊び続けた長い目で見た戻りは${longRun}です。「確率」タブで、マスごとの数字と計算のしかたを見られます。`,
    NOT_MONEY.ja,
  ],
  oddsIntro: [
    'ここの数字はすべて、遊んで数えたものではなく分数で正確に計算したものです。次のサイコロに関係するのは船がいるマスだけなので、このマシンは30マスのマルコフ連鎖です。マスごとに、そこからのサイコロのあらゆる結果（サイコロ・ランプ・JPファイナル・くじらの3回分、全部で93,312通り）を数えて、戻りの枚数と船の行き先を出しています。',
    'ベットを選ぶ前に船の位置が見えるので、大きくベットすれば長い目で得をするマスがあってはいけません。どのマスからでも、次のサイコロの戻りはベットより少なくなっています。',
  ],
  longRunLabel: 'ふつうに\u200b遊ぶと',
  longRunNote: 'が\u200bベットに\u200b対して\u200b戻ります（長い目で\u200b見て、どのベットでも）',
  bestLabel: 'いちばん\u200b良いマス',
  bestNote: (count) => `${count}マスの\u200bどこからでも、次の\u200bサイコロで`,
  worstLabel: 'いちばん\u200b静かなマス',
  worstNote: 'JPチャンス：周回ボーナスしか\u200bない\u200bスタートが\u200b次の\u200b6マスに\u200b入るため',
  bettingLabel: 'マスで\u200bベットを\u200b変えると',
  bettingNote: 'スタート\u200b手前の\u200b6マスだけ\u200b2枚、それ以外は\u200b10枚。ベットの\u200b変え方で\u200bいちばん\u200b良い戻り',
  jackpotLabel: 'ジャックポット',
  jackpotNote: (rolls) => `長い目で\u200b見て${rolls}回に\u200b1回`,
  rulesTitle: 'このマシンのルール',
  rules: [
    'サイコロ：6面のサイコロ1個。どの目も毎回6分の1。結果は「サイコロをふる」を押した瞬間に決まります。',
    '盤：30マスのループ。船は次にふるまでとどまり、再読み込みや別のタブでもそのまま。メダルゲームセンターでリセットするとスタートに戻ります。',
    'ベット：1回2・4・6・10枚。マスの数字はすべてベット2枚あたり。',
    '周回ボーナス：スタートを通過するか止まると×½。うずしおでふりだしに戻ったときはなし。',
    '矢印のマス（追い風・引き潮・嵐・うずしお）で船は1回だけ動き、着いたマスの効果があります。',
    'チャンスとくじらライドは、それを始めたサイコロの一部です。メダルは別にかかりません。',
  ],
  squaresTitle: 'すべてのマス',
  squaresNote: 'それぞれのマスから次のサイコロでベット1枚あたりに戻る枚数と、長い目で見て船がそのマスにいる割合です。矢印のマスはすぐ船を動かすので、そこにとどまることはありません。',
  colSquare: 'マス',
  colWhat: '種類',
  colNext: '次のサイコロの戻り',
  colThere: '船がいる割合',
  never: '—',
  arrowTo: (name, to) => `${name} → ${to}`,
  chancesTitle: 'チャンス',
  lampTitle: 'ランプチャンス：12個のランプ',
  jpTitle: 'JPチャンス：12個のランプとJPファイナル',
  colLamps: 'ランプ',
  colPays: '払い',
  colChance: '確率',
  starRow: 'JPの星 → JPファイナル',
  finalRow: (face) => `JPファイナルで${face}：ジャックポット`,
  finalMiss: 'JPファイナルでほかの目',
  noPrize: 'はずれ',
  rideTitle: 'くじらライド：無料で3回',
  rideNote: (blowhole) => `くじらの背中はどのマスも×½か×1。潮吹き穴まで行ってJPチャンスに挑戦できるのは${blowhole}です。`,
  worthNote: (each) => `特別なマス（ランプチャンス・JPチャンス・くじらライド）は、どれも平均でちょうどベットの${each}の価値です。`,
  whyTitle: 'どのマスも同じ価値になるわけ',
  why: [
    'あるマスからのサイコロは、その先の6マスのどれかに6分の1ずつ止まるので、戻りはその6マスの平均になります。盤は6マスごとのくり返しで、特別なマス・貝がら・真珠・ヤシの木・貝がら・貝がらの順。どの連続した6マスにもそれぞれが1つずつ入るので、どのマスからでも次のサイコロの戻りは同じです。',
    '特別なマスはどれも平均で同じ価値に作ってあり、矢印は代わりにいる種類と同じマスにしか船を運びません。6マスがそろわないのはスタートの手前だけ。スタートは周回ボーナスしか払わないので、その手前の6マスは少し静かになります。',
  ],
  chainTitle: '長い目で見ると',
  chain: [
    '長い目で見て船がそれぞれのマスにいる割合は、マルコフ連鎖の定常分布として正確に解いています。矢印やうずしおのせいで、船がいやすいマスといにくいマスがあります。ふつうに遊んだときの戻りは、各マスの次のサイコロの戻りを、船がそこにいる割合で平均したものです。',
    '船の位置を見てベットを変えても、ほとんど変わりません。スタート手前の6マスだけ2枚、ほかは10枚というのがベットの変え方でいちばん良い方法ですが、それでも戻りはベットより少なくなります。',
  ],
  oftenTitle: '長い目で見た回数',
  colEvent: 'できごと',
  colEvery: '何回に1回',
  oftenRows: {
    paid: '何かしらの当たり',
    lap: '周回ボーナス',
    lamp: 'ランプチャンス',
    jpChance: 'JPチャンス（盤上か潮吹き穴）',
    ride: 'くじらライド',
    blowhole: '潮吹き穴',
    jackpot: 'ジャックポット',
    moved: '矢印で船が動く',
  },
  inRolls: (n) => `${n}回`,
  compareTitle: '本物のマシンとくらべると',
  compare: [
    'すごろくのメダルゲームは昔から日本のメダルフロアにあります。番号つきのチェッカーに入ったメダルや、プッシャーのフィールドから落ちたサイコロボールで、画面の盤のコマが進むもの。ボールの色やデジタルのサイコロで進むマス数が決まるもの。マスはメダルを払ったり、抽選やミニゲームを始めたり、コマを進めたりスタートに戻したりし、ゴールやジャックポットのマスに着くと、もう一度の抽選で決まるジャックポットチャンスがもらえます。キッズ向けのマシンはベットが小さく、盤も短めです。',
    'このマシンは新しいマシンのようにベットでサイコロを買い、ほかはそのまま受けついでいます。払うマス、船を動かすマス、チャンスのマス、スタートの周回ボーナス、ボーナスレーン、そして最後のサイコロで決まるジャックポット。島もくじらもマスも、すべてこのフロアのオリジナルです。数字は、ふつうに遊ぶと約90%が戻るように（メダルゲームでよくある設定です）、そしてどのマスでも大きくベットして得をしないように決めています。',
  ],
  checkTitle: '確かめる',
  checkButton: '10万回ふってみる',
  checkRunning: 'ふっています…',
  checkResult: (rolls) => `スタートから同じベットで${rolls}回：`,
  checkBack: (seen, exact) => `戻り：${seen}（正確には${exact}）`,
  checkLaps: (seen, expected) => `周回ボーナス：${seen}回（期待値${expected}回）`,
  checkRides: (seen, expected) => `くじらライド：${seen}回（期待値${expected}回）`,
  checkJackpots: (seen, expected) => `ジャックポット：${seen}回（期待値${expected}回）`,
};

export const getStrings = (language: 'en' | 'ja'): SugorokuStrings => (language === 'ja' ? ja : en);
