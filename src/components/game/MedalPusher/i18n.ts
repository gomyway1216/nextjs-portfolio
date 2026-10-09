/**
 * Local ja/en strings for the Medal Pusher game, consumed via useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { AimId } from './sim';

/** The parts of the field the Odds tab's diagram points at. */
export const PART_IDS = ['chute', 'gates', 'pusher', 'table', 'sides', 'front'] as const;
export type PartId = (typeof PART_IDS)[number];

export interface PusherStrings {
  title: string;
  subtitle: string;
  tabMachine: string;
  tabOdds: string;
  tabSim: string;
  howToPlay: string;
  infoBody: string[];

  // The cabinet
  jackpot: string;
  stock: string;
  stockAria: (held: number, max: number) => string;
  legendSeven: string;
  legendOdd: string;
  legendEven: string;
  reach: string;
  spinWin: (medals: number) => string;
  towerWin: (medals: number) => string;
  feverWin: (medals: number) => string;
  feverTag: string;
  ballWin: string;
  chance: string;
  slotName: string;
  sugorokuTitle: string;
  sugorokuRolling: string;
  sugorokuMove: (squares: number) => string;
  boardAria: (square: number, medals: number) => string;
  chestTitle: string;
  chestPrompt: string;
  chestName: (chest: number) => string;
  chestHeld: (chest: number, medals: number) => string;
  chestCountdown: (seconds: number) => string;
  jackpotWon: (medals: number) => string;
  pocketJackpot: string;
  screenAria: string;
  fieldAria: string;
  medals: string;
  aim: string;
  aimValue: (percent: number) => string;
  drop: string;
  dropHint: string;
  auto: string;
  autoHint: string;
  sound: string;
  refill: (medals: number) => string;
  // Announcements for screen readers
  saySugorokuStart: (digits: string) => string;
  saySugoroku: (medals: number) => string;
  sayFever: (medals: number) => string;
  sayChestStart: (digits: string) => string;
  sayChest: (chest: number, medals: number, towers: boolean) => string;
  saySevens: string;
  sayBall: string;
  sayToppled: string;
  sayPrize: (medals: number) => string;
  sayJackpot: (medals: number) => string;
  sayEmpty: string;
  // Tally
  tallyTitle: string;
  tallyPlayed: string;
  tallyWon: string;
  tallyLost: string;
  tallySpins: string;
  tallyPaid: string;
  tallyReturn: string;
  tallyNote: string;

  // Odds
  oddsIntro: string;
  fieldTitle: string;
  diagramAria: string;
  partName: Record<PartId, string>;
  partText: Record<PartId, string>;
  slotTitle: string;
  slotIntro: (held: number) => string;
  slotCaption: string;
  colLine: string;
  colChance: string;
  colOneIn: string;
  colPays: string;
  lineSeven: string;
  lineOdd: string;
  lineEven: string;
  lineMiss: string;
  paysBall: string;
  paysSugoroku: string;
  paysChest: string;
  colAverage: string;
  boardTitle: string;
  boardIntro: (squares: number) => string;
  boardCaption: string;
  colSquare: string;
  squareName: (square: number) => string;
  squareFever: string;
  boardNote: (average: string, rolls: number, spread: string) => string;
  chestOddsTitle: string;
  chestOddsIntro: (seconds: number) => string;
  chestOddsCaption: string;
  colChest: string;
  chestPaidLoose: string;
  chestPaidTowers: (towers: number) => string;
  chestOddsNote: (average: string) => string;
  paysMedals: (medals: number | string) => string;
  towerNote: string;
  oneIn: (n: string) => string;
  reachNote: (percent: string) => string;
  rouletteTitle: string;
  rouletteIntro: (pockets: number) => string;
  rouletteCaption: string;
  colPocket: string;
  colPockets: string;
  colPaidAs: string;
  paidLoose: string;
  paidTowers: (towers: number) => string;
  pocketJackpotName: string;
  jackpotNote: (start: number, step: number, oneIn: string) => string;
  valueTitle: string;
  valueIntro: string;
  valueCaption: string;
  colJackpotAt: string;
  colRouletteAverage: string;
  colSpinValue: string;
  valueNote: (value: string) => string;
  edgeTitle: string;
  edgeBody: string[];
  edgeFormula: string;
  calcFront: string;
  calcSpins: string;
  calcJackpot: string;
  calcReturn: string;
  calcBreakEven: (percent: string) => string;
  calcNever: string;
  calcNote: string;

  // Simulation
  simTitle: string;
  simIntro: (warmUp: number) => string;
  paceLabel: string;
  paceOption: (perSecond: number) => string;
  medalsLabel: string;
  run: string;
  running: (pct: number) => string;
  cancel: string;
  aimName: Record<AimId, string>;
  resultTitle: (medals: string, pace: number) => string;
  simCaption: string;
  colAim: string;
  colReturn: string;
  colSteady: string;
  colFront: string;
  colGate: string;
  colWasted: string;
  colSpins: string;
  chartTitle: string;
  chartAria: string;
  chartX: string;
  chartCaption: string;
  simNotes: (exactPerSpin: string) => string[];
  slotCheckTitle: string;
  slotCheckIntro: (spins: string) => string;
  slotCheckCaption: string;
  colSeen: string;
  colExact: string;
}

const en: PusherStrings = {
  title: 'Medal Pusher',
  subtitle: 'Drop medals, let the pusher shove them over the edge, and feed the gates to spin the slot: sugoroku, treasure chests, medal towers and a jackpot roulette.',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  tabSim: 'Simulation',
  howToPlay: 'How to play',
  infoBody: [
    'You start with 100 medals. Choose where to aim and drop them: each one comes down the back panel, lands on the pusher a little to one side of your aim, and gets shoved forward with the rest.',
    'Medals pushed over the front edge are yours. Near the front the sides of the table are open, and medals squeezed out there are gone.',
    'A medal that comes down through one of the three gates starts a spin on the screen. The machine holds up to four spins at a time.',
    'Three even digits roll the die on the sugoroku board along the bottom of the screen: the piece moves on and you are paid what its square says, 3 to 15 medals, or a fever of 30.',
    'Three odd digits open the treasure chance: pick one of three chests. They hold 10, 20 and 30 medals, and the bigger two are stacked on the pusher as medal towers.',
    'A tower rides the pusher like any medal. Push it over the lip and it comes down across the lower table, shoving a wave of medals ahead of it.',
    'Three sevens drop a prize ball onto the field.',
    'Push a ball over the front edge and the jackpot chance starts: a roulette of twelve pockets. 30 medals rain down, 50 and 100 go up as towers, and one pocket is the jackpot, which begins at 300 medals and grows as the machine is played. Two balls are already lying on the field.',
    'The Odds tab lists the exact chances on the screen, and the Simulation tab measures what cannot be calculated: how much of what you drop comes back, depending on where and how fast you drop it.',
  ],

  jackpot: 'JACKPOT',
  stock: 'HOLD',
  stockAria: (held, max) => `${held} of ${max} spins held`,
  legendSeven: '7·7·7 ▸ BALL',
  legendOdd: '1·3·5·9 ▸ TREASURE',
  legendEven: '2·4·6·8 ▸ SUGOROKU',
  reach: 'REACH!',
  spinWin: (medals) => `+${medals} MEDALS`,
  towerWin: (medals) => `TOWER +${medals}`,
  feverWin: (medals) => `FEVER! +${medals}`,
  feverTag: 'FEVER',
  ballWin: 'BALL GET!',
  chance: 'JACKPOT CHANCE',
  slotName: 'NUMBER SLOT',
  sugorokuTitle: 'SUGOROKU CHANCE',
  sugorokuRolling: 'Rolling…',
  sugorokuMove: (squares) => `MOVE ${squares}`,
  boardAria: (square, medals) => `Sugoroku board: the piece is on square ${square} of 12, which pays ${medals} medals`,
  chestTitle: 'TREASURE CHANCE',
  chestPrompt: 'Pick one of the three chests',
  chestName: (chest) => `Chest ${chest}`,
  chestHeld: (chest, medals) => `Chest ${chest} held ${medals} medals`,
  chestCountdown: (seconds) => `PICK ONE!  ${seconds}`,
  jackpotWon: (medals) => `JACKPOT! +${medals}`,
  pocketJackpot: 'JP',
  screenAria: 'The screen',
  fieldAria: 'The field. Click or tap where a medal should drop.',
  medals: 'MEDALS',
  aim: 'Aim',
  aimValue: (percent) => `${percent}% across`,
  drop: 'DROP',
  dropHint: 'Hold to keep dropping',
  auto: 'Auto',
  autoHint: 'Drops two medals a second at your aim',
  sound: 'Sound',
  refill: (medals) => `Out of medals — take ${medals} more`,
  saySugorokuStart: (digits) => `${digits}. Sugoroku chance: the die is rolling.`,
  saySugoroku: (medals) => `The piece landed on ${medals} medals.`,
  sayFever: (medals) => `Fever! ${medals} medals rain onto the field.`,
  sayChestStart: (digits) => `${digits}. Treasure chance: pick one of the three chests.`,
  sayChest: (chest, medals, towers) => `Chest ${chest} held ${medals} medals${towers ? ', stacked on the pusher as towers' : ''}.`,
  saySevens: 'Seven, seven, seven. A prize ball drops onto the field.',
  sayBall: 'A ball went over the front edge. The jackpot chance starts.',
  sayToppled: 'A tower came down onto the lower table.',
  sayPrize: (medals) => `The roulette pays ${medals} medals.`,
  sayJackpot: (medals) => `Jackpot. ${medals} medals.`,
  sayEmpty: 'You are out of medals.',
  tallyTitle: 'This machine so far',
  tallyPlayed: 'Dropped',
  tallyWon: 'Won',
  tallyLost: 'Lost off the sides',
  tallySpins: 'Spins',
  tallyPaid: 'Paid by the screen',
  tallyReturn: 'Return',
  tallyNote: 'Medals won per medal dropped. Medals still lying on the field are not counted yet.',

  oddsIntro:
    'This is two machines in one cabinet. The screen is a lottery, and its odds can be written down exactly. The field is physics: no table of odds, just a place where medals can go missing.',
  fieldTitle: 'The field',
  diagramAria: 'The field from above: the chute and the gates at the back, the pusher, the lower table with its open sides, and the front edge',
  partName: {
    chute: 'Chute',
    gates: 'Gates',
    pusher: 'Pusher',
    table: 'Lower table',
    sides: 'Open sides',
    front: 'Front edge',
  },
  partText: {
    chute: 'Lets a medal go where you aim. It bounces on the way down and lands up to 12% of the width to either side, most often close to the aim.',
    gates: 'Three of them at the foot of the back panel. A medal you dropped that comes through one starts a spin. Medals the machine pays out do not count.',
    pusher: 'Slides back and forth under the back panel. The panel scrapes the rearmost medals forward, and the front ones tip over the lip.',
    table: 'The pusher’s face shoves these medals toward you, a row at a time.',
    sides: 'The last fifth of the table has no side walls. A medal squeezed out there is lost: this is the only place the machine takes anything. A ball does not fit through.',
    front: 'Whatever goes over is yours.',
  },
  slotTitle: 'The slot on the screen',
  slotIntro: (held) =>
    `Every medal through a gate starts one spin. While the reels are busy the machine holds up to ${held} more; a medal through a gate when all ${held} are held starts nothing.`,
  slotCaption: 'Each line the slot can stop on, its chance on one spin and what it pays',
  colLine: 'Line',
  colChance: 'Chance',
  colOneIn: 'About',
  colPays: 'Pays',
  lineSeven: '7 · 7 · 7',
  lineOdd: 'Three of 1, 3, 5 or 9',
  lineEven: 'Three of 2, 4, 6 or 8',
  lineMiss: 'Anything else',
  paysBall: 'A prize ball on the field',
  paysSugoroku: 'A roll on the sugoroku board',
  paysChest: 'A choice of three chests',
  colAverage: 'Worth, on average',
  boardTitle: 'The sugoroku board',
  boardIntro: (squares) =>
    `A loop of ${squares} squares along the bottom of the screen. Three even digits roll one die, the piece moves that many squares, and you are paid what the square it lands on says. The piece stays there until the next roll.`,
  boardCaption: 'What each square of the board pays',
  colSquare: 'Square',
  squareName: (square) => `Square ${square}`,
  squareFever: 'Fever',
  boardNote: (average, rolls, spread) =>
    `In the long run the piece lands on every square equally often, so a roll is worth the average of the board: ${average} medals. That is exact, and it takes hold fast: after ${rolls} rolls from the start, no square is more than ${spread} away from its even share.`,
  chestOddsTitle: 'The treasure chance',
  chestOddsIntro: (seconds) =>
    `Three odd digits put three chests on the screen. You have ${seconds} seconds to pick one; after that the machine picks for you. Which chest holds which prize is shuffled before you choose.`,
  chestOddsCaption: 'What the three chests hold and how each prize is paid',
  colChest: 'A chest holds',
  chestPaidLoose: 'Medals thrown onto the field',
  chestPaidTowers: (towers) => (towers === 1 ? 'One tower on the pusher' : `${towers} towers on the pusher`),
  chestOddsNote: (average) =>
    `Each prize is behind your chest one time in three, whichever chest you pick, so the choice is worth ${average} medals on average. There is no better chest.`,
  paysMedals: (medals) => `${medals} medals`,
  towerNote:
    'A tower is stacked on the pusher a little behind its lip and rides it like any medal, only harder to push. When it goes over the lip its medals come down across the lower table. Drop medals behind it to bring it down sooner.',
  oneIn: (n) => `1 in ${n}`,
  reachNote: (percent) =>
    `The result is drawn the moment a spin starts, and the reels only act it out. About ${percent} of losing spins stop the two outer reels alike first — a “reach” — before the centre misses. It looks close. It changes nothing: the spin was lost before the reels moved.`,
  rouletteTitle: 'The jackpot chance',
  rouletteIntro: (pockets) =>
    `A ball pushed over the front edge lights a roulette of ${pockets} pockets, each as likely as the next. A ball is never lost: it does not fit through the open sides, so sooner or later it goes over the front.`,
  rouletteCaption: 'The roulette’s pockets and the chance of each',
  colPocket: 'Pocket',
  colPockets: 'Pockets',
  colPaidAs: 'Paid as',
  paidLoose: 'Medals thrown onto the field',
  paidTowers: (towers) => `${towers} towers on the pusher`,
  pocketJackpotName: 'Jackpot',
  jackpotNote: (start, step, oneIn) =>
    `The jackpot starts at ${start} medals and grows by one for every ${step} medals dropped on this machine. One spin in ${oneIn} leads to it: three sevens for the ball, then the one pocket once the ball goes over.`,
  valueTitle: 'What a spin is worth',
  valueIntro: 'Each prize times its chance, added up, with a ball counted as the roulette it will start. The jackpot is the only thing that moves it.',
  valueCaption: 'The average roulette prize and the average a spin pays, by the size of the jackpot',
  colJackpotAt: 'Jackpot at',
  colRouletteAverage: 'Average roulette prize',
  colSpinValue: 'A spin pays, on average',
  valueNote: (value) =>
    `So a medal through a gate is worth about ${value} more medals — and those land on the field, not in your tray. They still have to make it over the front.`,
  edgeTitle: 'Where the machine keeps its share',
  edgeBody: [
    'Every medal that reaches the field — one you dropped or one the screen paid — leaves it sooner or later, over the front or off a side. So what comes back to you is the front’s share of everything that went in:',
    'Two of those three numbers are physics. They depend on where the medals lie and where you drop the next one, and no formula gives them. Try your own:',
  ],
  edgeFormula: 'return = front’s share × (1 + spins per medal × medals per spin)',
  calcFront: 'Share of medals that leave by the front',
  calcSpins: 'Spins started per medal dropped',
  calcJackpot: 'Jackpot',
  calcReturn: 'Return',
  calcBreakEven: (percent) => `At this front share you would break even if ${percent} of your medals started a spin.`,
  calcNever: 'At this front share you could not break even even if every medal started a spin.',
  calcNote:
    'The Simulation tab measures both. Aimed at a gate, about 78% of medals leave by the front and about 22% come through a gate — fewer start a spin if you drop faster than the screen can keep up.',

  simTitle: 'Where to drop, measured',
  simIntro: (warmUp) =>
    `Four ways of aiming, each on a machine of its own that starts from the same field. Each plays the same number of medals at the same pace, after ${warmUp} uncounted medals to fill its tables.`,
  paceLabel: 'Pace',
  paceOption: (perSecond) => `${perSecond} medals a second`,
  medalsLabel: 'Medals per aim',
  run: 'Run',
  running: (pct) => `Running… ${pct}%`,
  cancel: 'Cancel',
  aimName: {
    centre: 'Over the centre gate',
    anywhere: 'Anywhere at all',
    between: 'Between two gates',
    edges: 'At the two edges',
  },
  resultTitle: (medals, pace) => `${medals} medals per aim, ${pace} a second`,
  simCaption: 'What each way of aiming returned and how its medals left the field',
  colAim: 'Aim',
  colReturn: 'Return, this run',
  colSteady: 'With average luck',
  colFront: 'Left by the front',
  colGate: 'Through a gate',
  colWasted: 'Gate hits wasted',
  colSpins: 'Spins',
  chartTitle: 'Medals won per medal dropped, as the run goes on',
  chartAria: 'Medals won per medal dropped against medals dropped, one line per aim',
  chartX: 'Medals dropped',
  chartCaption: 'Medals won per medal dropped at points along the run, for each aim',
  simNotes: (exactPerSpin) => [
    '“Return, this run” is what the machine actually handed back. It swings with the screen: one roulette can pay more than a hundred medals, and a ball still lying on the field has paid nothing yet.',
    `“With average luck” takes the luck out. It keeps what this run measured — the share of medals that left by the front and the spins started per medal — and pays each spin its exact average of ${exactPerSpin} medals.`,
    'A gate hit is wasted when four spins are already held. Dropping faster than the screen can spin does that.',
  ],
  slotCheckTitle: 'The screen in this run, against its exact odds',
  slotCheckIntro: (spins) => `All four machines together spun ${spins} times.`,
  slotCheckCaption: 'How often each line came up in this run, next to its exact chance',
  colSeen: 'This run',
  colExact: 'Exact',
};

const ja: PusherStrings = {
  title: 'メダルプッシャー',
  subtitle: 'メダルを落としてプッシャーに押し出させ、チャッカーに通してスロットを回します。すごろく、宝箱、メダルタワー、ジャックポットルーレットがあります。',
  tabMachine: 'マシン',
  tabOdds: '確率',
  tabSim: 'シミュレーション',
  howToPlay: '遊び方',
  infoBody: [
    'メダル100枚から始めます。狙う位置を決めて落とすと、メダルは奥のパネルを転がり落ち、狙いから少しずれてプッシャーの上に乗り、ほかのメダルと一緒に前へ押し出されます。',
    '手前の端から落ちたメダルがあなたのものです。テーブルの手前側は両脇が開いていて、そこから押し出されたメダルは戻りません。',
    '落としたメダルが3つのチャッカーのどれかを通ると、中央画面のスロットが1回まわります。抽選は4回分までためられます。',
    '偶数が3つそろうと「すごろくチャンス」です。画面の下のすごろく盤でサイコロを振り、コマが止まったマスの枚数（3〜15枚、フィーバーなら30枚）がもらえます。',
    '奇数が3つそろうと「宝箱チャンス」です。3つの宝箱から1つ選びます。中身は10枚・20枚・30枚で、20枚と30枚はプッシャーの上にメダルタワーとして積まれます。',
    'タワーはほかのメダルと同じようにプッシャーに乗って進みます。縁の向こうへ押し出すと崩れて下のテーブルに雪崩れ込み、その先のメダルをまとめて押し出します。',
    '7が3つそろうと、ボールが1個フィールドに落ちてきます。',
    'ボールを手前の端から落とすとジャックポットチャンスが始まります。12個のポケットがあるルーレットで、30枚ならメダルが降り、50枚と100枚はタワーになり、1つがジャックポットです。ジャックポットは300枚から始まり、遊ぶほど増えていきます。ボールは最初から2個フィールドに置いてあります。',
    '「確率」タブには画面の抽選の正確な確率を載せています。「シミュレーション」タブでは計算では出せないもの、つまり落とす場所と速さによって何割戻ってくるかを実測します。',
  ],

  jackpot: 'JACKPOT',
  stock: '保留',
  stockAria: (held, max) => `保留 ${held}／${max}`,
  legendSeven: '7·7·7 ▸ ボール',
  legendOdd: '1·3·5·9 ▸ 宝箱',
  legendEven: '2·4·6·8 ▸ すごろく',
  reach: 'リーチ！',
  spinWin: (medals) => `${medals}枚 GET`,
  towerWin: (medals) => `タワー ${medals}枚`,
  feverWin: (medals) => `フィーバー！ ${medals}枚`,
  feverTag: 'フィーバー',
  ballWin: 'ボール GET！',
  chance: 'ジャックポットチャンス',
  slotName: 'ナンバースロット',
  sugorokuTitle: 'すごろくチャンス',
  sugorokuRolling: 'サイコロを振っています…',
  sugorokuMove: (squares) => `${squares}マス進む`,
  boardAria: (square, medals) => `すごろく盤：コマは12マス中${square}マス目（${medals}枚）にいます`,
  chestTitle: '宝箱チャンス',
  chestPrompt: '3つの宝箱から1つ選んでください',
  chestName: (chest) => `宝箱${chest}`,
  chestHeld: (chest, medals) => `宝箱${chest}の中身は${medals}枚でした`,
  chestCountdown: (seconds) => `1つ選んでね！ あと${seconds}秒`,
  jackpotWon: (medals) => `JACKPOT！ ${medals}枚`,
  pocketJackpot: 'JP',
  screenAria: '中央画面',
  fieldAria: 'フィールド。クリックまたはタップした位置にメダルを落とします。',
  medals: 'メダル',
  aim: '狙う位置',
  aimValue: (percent) => `左から${percent}%`,
  drop: '落とす',
  dropHint: '押し続けると連続で落とします',
  auto: 'オート',
  autoHint: '狙った位置に毎秒2枚落とします',
  sound: '音',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  saySugorokuStart: (digits) => `${digits}。すごろくチャンスです。サイコロを振ります。`,
  saySugoroku: (medals) => `コマが${medals}枚のマスに止まりました。`,
  sayFever: (medals) => `フィーバーです。メダルが${medals}枚降ってきます。`,
  sayChestStart: (digits) => `${digits}。宝箱チャンスです。3つの宝箱から1つ選んでください。`,
  sayChest: (chest, medals, towers) => `宝箱${chest}の中身は${medals}枚でした。${towers ? 'プッシャーの上にタワーとして積まれます。' : ''}`,
  saySevens: '7が3つそろいました。ボールがフィールドに落ちてきます。',
  sayBall: 'ボールが手前から落ちました。ジャックポットチャンスが始まります。',
  sayToppled: 'タワーが崩れて下のテーブルに落ちました。',
  sayPrize: (medals) => `ルーレットで${medals}枚当たりました。`,
  sayJackpot: (medals) => `ジャックポットです。${medals}枚。`,
  sayEmpty: 'メダルがなくなりました。',
  tallyTitle: 'このマシンのここまで',
  tallyPlayed: '落とした',
  tallyWon: '獲得',
  tallyLost: '脇から落ちた',
  tallySpins: '抽選',
  tallyPaid: '画面からの払い出し',
  tallyReturn: '還元率',
  tallyNote: '落としたメダル1枚あたりの獲得枚数です。フィールドに残っているメダルはまだ数えていません。',

  oddsIntro:
    'この筐体には2つの機械が入っています。画面は抽選で、その確率は正確に書き出せます。フィールドは物理です。確率表はなく、メダルが消える場所があるだけです。',
  fieldTitle: 'フィールド',
  diagramAria: '上から見たフィールド。奥に投入口とチャッカー、その手前にプッシャー、両脇が開いた下のテーブル、そして手前の端',
  partName: {
    chute: '投入口',
    gates: 'チャッカー',
    pusher: 'プッシャー',
    table: '下のテーブル',
    sides: '開いた両脇',
    front: '手前の端',
  },
  partText: {
    chute: '狙った位置でメダルを放します。落ちる途中で跳ねるので、左右に幅の12%までずれますが、多くは狙いの近くに落ちます。',
    gates: '奥のパネルの下に3つあります。自分で落としたメダルがここを通ると抽選が1回始まります。払い出されたメダルは数えません。',
    pusher: '奥のパネルの下を前後に動きます。引くときにパネルが奥のメダルを前へかき出し、先頭のメダルが縁から落ちます。',
    table: 'プッシャーの前面が、ここのメダルを一列ずつ手前へ押します。',
    sides: 'テーブルの手前5分の1には脇の壁がありません。ここから押し出されたメダルは失われます。機械が取り分を得るのはここだけです。ボールはここを通れません。',
    front: 'ここを越えたメダルがあなたのものです。',
  },
  slotTitle: '画面のスロット',
  slotIntro: (held) =>
    `チャッカーを通ったメダル1枚につき、抽選が1回始まります。リールが回っている間は${held}回分までためられ、${held}回分たまっているときにチャッカーを通っても何も起きません。`,
  slotCaption: 'スロットが止まる並びごとの、1回の抽選での確率と払い出し',
  colLine: '並び',
  colChance: '確率',
  colOneIn: 'およそ',
  colPays: '払い出し',
  lineSeven: '7 · 7 · 7',
  lineOdd: '1・3・5・9 のどれかが3つ',
  lineEven: '2・4・6・8 のどれかが3つ',
  lineMiss: 'それ以外',
  paysBall: 'ボール1個がフィールドへ',
  paysSugoroku: 'すごろく盤でサイコロを1回振る',
  paysChest: '3つの宝箱から1つ選ぶ',
  colAverage: '平均の価値',
  boardTitle: 'すごろく盤',
  boardIntro: (squares) =>
    `画面の下にある、${squares}マスが輪になった盤です。偶数が3つそろうとサイコロを1個振り、コマがその数だけ進んで、止まったマスに書かれた枚数がもらえます。コマは次に振るまでそのマスに残ります。`,
  boardCaption: 'すごろく盤の各マスでもらえる枚数',
  colSquare: 'マス',
  squareName: (square) => `${square}マス目`,
  squareFever: 'フィーバー',
  boardNote: (average, rolls, spread) =>
    `長い目で見ると、コマはどのマスにも同じ回数だけ止まります。だからサイコロ1回の価値は盤の平均の${average}枚です。これは正確な値で、すぐにそうなります。スタートから${rolls}回振っただけで、どのマスも均等な割合から${spread}以内に収まります。`,
  chestOddsTitle: '宝箱チャンス',
  chestOddsIntro: (seconds) =>
    `奇数が3つそろうと、画面に宝箱が3つ出ます。${seconds}秒以内に1つ選びます。選ばなければ機械が代わりに選びます。どの箱に何が入っているかは、選ぶ前にシャッフルされています。`,
  chestOddsCaption: '3つの宝箱の中身と、それぞれの出方',
  colChest: '中身',
  chestPaidLoose: 'メダルがフィールドに降る',
  chestPaidTowers: (towers) => `プッシャーの上にタワー${towers}本`,
  chestOddsNote: (average) => `どの箱を選んでも、それぞれの賞が入っている確率は3分の1です。だから選択の価値は平均${average}枚です。当たりやすい箱はありません。`,
  paysMedals: (medals) => `${medals}枚`,
  towerNote:
    'タワーはプッシャーの縁の少し奥に積まれ、ほかのメダルと同じようにプッシャーに乗って進みます。ただし普通のメダルより押しにくくなっています。縁を越えると崩れて、メダルが下のテーブルに広がります。タワーの後ろにメダルを落とすと早く崩せます。',
  oneIn: (n) => `${n}回に1回`,
  reachNote: (percent) =>
    `結果は抽選が始まった瞬間に決まっていて、リールはそれを演じているだけです。はずれの約${percent}では、左右のリールが先に同じ数字で止まり（リーチ）、最後に中央がはずれます。惜しく見えますが、確率は何も変わりません。リールが動く前にはずれは決まっています。`,
  rouletteTitle: 'ジャックポットチャンス',
  rouletteIntro: (pockets) =>
    `ボールを手前の端から落とすと、${pockets}個のポケットがあるルーレットが始まります。どのポケットも同じ確率です。ボールが失われることはありません。開いた両脇は通れないので、いつかは必ず手前から落ちます。`,
  rouletteCaption: 'ルーレットのポケットと、それぞれの確率',
  colPocket: 'ポケット',
  colPockets: '個数',
  colPaidAs: '出方',
  paidLoose: 'メダルがフィールドに降る',
  paidTowers: (towers) => `プッシャーの上にタワー${towers}本`,
  pocketJackpotName: 'ジャックポット',
  jackpotNote: (start, step, oneIn) =>
    `ジャックポットは${start}枚から始まり、このマシンに${step}枚落とされるごとに1枚増えます。抽選${oneIn}回に1回がジャックポットにつながります。7が3つそろってボールが出て、そのボールが落ちたあとのルーレットで1つのポケットに入った場合です。`,
  valueTitle: '抽選1回の価値',
  valueIntro: 'それぞれの賞に確率を掛けて足し合わせます。ボールは、落ちたあとに始まるルーレットの分として数えます。変わるのはジャックポットの大きさだけです。',
  valueCaption: 'ジャックポットの大きさごとの、ルーレットの平均の賞と抽選1回あたりの平均払い出し',
  colJackpotAt: 'ジャックポット',
  colRouletteAverage: 'ルーレットの平均',
  colSpinValue: '抽選1回の平均払い出し',
  valueNote: (value) =>
    `つまり、チャッカーを通ったメダル1枚にはおよそ${value}枚分の価値があります。ただし払い出されるのは受け皿ではなくフィールドの上です。そのメダルも、手前の端まで押し出されなければ手に入りません。`,
  edgeTitle: '機械の取り分はどこにあるか',
  edgeBody: [
    'フィールドに乗ったメダルは、自分で落としたものも画面から払い出されたものも、いつかは手前か脇から出ていきます。だから戻ってくるのは、入ったメダル全体のうち手前から出た割合です。',
    'この3つの数のうち2つは物理です。メダルの積もり方と次に落とす場所で決まり、式では求められません。自分で数を入れて確かめられます。',
  ],
  edgeFormula: '還元率 = 手前から出る割合 ×（1 + メダル1枚あたりの抽選回数 × 抽選1回の払い出し）',
  calcFront: '手前から出るメダルの割合',
  calcSpins: '落としたメダル1枚あたりの抽選回数',
  calcJackpot: 'ジャックポット',
  calcReturn: '還元率',
  calcBreakEven: (percent) => `この割合なら、落としたメダルの${percent}が抽選を始めれば収支がゼロになります。`,
  calcNever: 'この割合では、すべてのメダルが抽選を始めても収支はゼロに届きません。',
  calcNote:
    'どちらも「シミュレーション」タブで実測できます。チャッカーを狙うと、約78%が手前から出て、約22%がチャッカーを通ります。画面が追いつかない速さで落とすと、抽選が始まる割合はそれより下がります。',

  simTitle: 'どこに落とすかを実測する',
  simIntro: (warmUp) =>
    `4通りの狙い方を、同じフィールドから始めた別々のマシンで試します。どれも同じ枚数を同じ速さで落とします。数え始める前に、テーブルを満たすためのメダルを${warmUp}枚落とします。`,
  paceLabel: '速さ',
  paceOption: (perSecond) => `毎秒${perSecond}枚`,
  medalsLabel: '狙い方ごとの枚数',
  run: '実行',
  running: (pct) => `実行中… ${pct}%`,
  cancel: '中止',
  aimName: {
    centre: '中央のチャッカーの真上',
    anywhere: '場所を決めずに',
    between: 'チャッカーの間',
    edges: '左右の端',
  },
  resultTitle: (medals, pace) => `狙い方ごとに${medals}枚・毎秒${pace}枚`,
  simCaption: '狙い方ごとの還元率と、メダルがフィールドから出ていった先',
  colAim: '狙い方',
  colReturn: '今回の還元率',
  colSteady: '運を平均にすると',
  colFront: '手前から出た',
  colGate: 'チャッカー通過',
  colWasted: '無駄になった通過',
  colSpins: '抽選',
  chartTitle: '落としたメダル1枚あたりの獲得枚数の推移',
  chartAria: '落とした枚数に対する、メダル1枚あたりの獲得枚数（狙い方ごとに1本）',
  chartX: '落とした枚数',
  chartCaption: '実行の途中の各時点での、落としたメダル1枚あたりの獲得枚数（狙い方ごと）',
  simNotes: (exactPerSpin) => [
    '「今回の還元率」は、マシンが実際に返した枚数です。画面の運で大きく振れます。ルーレット1回で100枚以上払い出されることもあれば、フィールドに残ったボールはまだ1枚も払い出していません。',
    `「運を平均にすると」は、その運を取り除いた値です。今回実測した「手前から出た割合」と「メダル1枚あたりの抽選回数」はそのまま使い、抽選1回の払い出しを正確な平均の${exactPerSpin}枚に置き換えています。`,
    '保留が4回分たまっているときにチャッカーを通ると、その通過は無駄になります。画面の抽選より速く落とすとそうなります。',
  ],
  slotCheckTitle: '今回の画面の抽選と、正確な確率',
  slotCheckIntro: (spins) => `4台のマシンを合わせて${spins}回抽選しました。`,
  slotCheckCaption: '今回それぞれの並びが出た割合と、正確な確率',
  colSeen: '今回',
  colExact: '厳密値',
};

export const getStrings = (language: GameLanguage): PusherStrings => (language === 'ja' ? ja : en);
