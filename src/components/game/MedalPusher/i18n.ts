/**
 * Local ja/en strings for the Medal Pusher game, consumed via useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { AimId } from './sim';

/** The parts of the field the Odds tab's diagram points at. */
export const PART_IDS = ['arms', 'pusher', 'chuckers', 'table', 'sides', 'front'] as const;
export type PartId = (typeof PART_IDS)[number];

export interface PusherStrings {
  title: string;
  subtitle: string;
  tabMachine: string;
  tabOdds: string;
  tabSim: string;
  tabRecords: string;
  howToPlay: string;
  infoBody: (held: number) => string[];

  // The cabinet
  jackpot: string;
  stock: string;
  stockAria: (held: number, max: number) => string;
  legendSeven: string;
  legendOdd: string;
  legendEven: string;
  reach: string;
  superReach: string;
  // Odds: how far to trust a reach
  reachCaption: string;
  colReach: string;
  colReachShare: string;
  colReachHits: string;
  reachName: Record<'normal' | 'long' | 'any', string>;
  reachTrustNote: (long: string, normal: string, times: string, afterWin: string, afterMiss: string) => string;
  spinWin: (medals: number) => string;
  towerWin: (medals: number) => string;
  feverWin: (medals: number) => string;
  feverTag: string;
  finishWin: (medals: number) => string;
  chainTotal: (medals: number) => string;
  ballWin: string;
  chance: string;
  // The jackpot challenge: the ball in the bowl
  challenge: string;
  sayGoal: (medals: number, level: number) => string;
  sayHole: (bowl: number, medals: number, poured: number, total: number) => string;
  bowlIntro: (bowls: number) => string;
  bowlCaption: string;
  colHole: string;
  holeJackpot: string;
  holeJackpotPaid: (poured: number, towers: number, start: number) => string;
  bowlNote: (start: number, average: string, perBall: string, poured: string) => string;
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
  screenAria: string;
  fieldAria: string;
  medals: string;
  aimValue: (percent: number) => string;
  auto: string;
  autoHint: string;
  sound: string;
  refill: (medals: number) => string;
  // The machine is saved in the browser, and can be reset
  reset: string;
  resetConfirm: string;
  savedNote: string;
  sayReset: (medals: number) => string;
  sayResetOff: string;
  unsavedNote: string;
  // A player who is signed in has the machine on the account as well
  signInInvite: string;
  accountNote: string;
  offlineNote: string;
  unreadableNote: string;
  checkingNote: string;
  resetConfirmAccount: string;
  // The same four when this device could not keep its own copy
  accountUnsavedNote: string;
  offlineUnsavedNote: string;
  unreadableUnsavedNote: string;
  checkingUnsavedNote: string;
  // Announcements for screen readers
  saySugorokuStart: (digits: string) => string;
  saySugoroku: (medals: number) => string;
  sayFever: (medals: number) => string;
  sayChestStart: (digits: string) => string;
  sayChest: (chest: number, medals: number, towers: boolean) => string;
  saySevens: string;
  sayBall: string;
  sayToppled: string;
  sayStep: (medals: number, level: number) => string;
  sayFinish: (medals: number) => string;
  sayJackpot: (medals: number, poured: number) => string;
  sayEmpty: string;
  sayBonus: (medals: number) => string;
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
  rouletteIntro: (pockets: number, goal: number) => string;
  rouletteCaption: string;
  colPocket: string;
  colPockets: string;
  colPaidAs: string;
  pocketStopName: string;
  pocketTower: (medals: number) => string;
  chainCaption: string;
  colInARow: string;
  colGetsThere: string;
  jackpotNote: (start: number, step: number, perBall: string, perSpin: string, average: string) => string;
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
  calcNote: (held: number) => string;

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
  simNotes: (exactPerSpin: string, held: number) => string[];
  slotCheckTitle: string;
  slotCheckIntro: (spins: string) => string;
  slotCheckCaption: string;
  colSeen: string;
  colExact: string;
  /** What is written on each rail's feed button, the left one's first, and what the button is called. */
  feedName: [string, string];
  feedAria: [string, string];
  feedHint: (key: string) => string;
  /** The label of each rail's aim slider, the left one's first. */
  aimLabel: [string, string];
  /** The line under the controls that says what the keys do. */
  keysNote: string;
  /** The sound settings: what the button that opens them is called, and the two things in them. */
  soundSettings: string;
  volume: string;
  /** What a volume is called at its two marks, silent and the level the cabinet was made at. Nothing anywhere else. */
  volumeMark: (percent: number) => string;
  /** A volume as it is read out to someone who cannot see the slider: the percent, and its mark where it has one. */
  volumeValue: (percent: number) => string;
  music: string;
  /** The switch for the room the cabinet stands in, and what it says when it is pointed at. */
  arcade: string;
  arcadeHint: string;
  /** Chance time: what the screen writes while a gold spin is still to come, and what is said when it begins and ends. */
  chanceTitle: string;
  chanceLeft: (spins: number) => string;
  sayChance: string;
  sayChanceEnd: string;
  /** Chance time on the Odds tab: its rule, and the table of what a gold spin is worth. */
  chanceOddsTitle: string;
  chanceOddsBody: (held: number, times: number) => string;
  chanceCaption: string;
  colChanceValue: string;
  colChanceMore: string;
  chanceOddsNote: (more: string) => string;
  /** The Simulation table's column of gold spins. */
  colGold: string;
  /**
   * The switches of feel under the controls: what the row is called, and each switch's name and what it does. The
   * first is the aim that swings by itself, which the cabinet calls Swing.
   */
  feelLabel: string;
  swing: string;
  swingHint: string;
  /** The line shown while the rails swing, and what is said when Swing goes on, goes off, and gives way to a hand on an aim. */
  swingNote: string;
  saySwingOn: string;
  saySwingOff: string;
  saySwingTaken: string;
  vibration: string;
  vibrationHint: string;
  fullscreen: string;
  fullscreenHint: string;
  // The jackpot challenge as three bowls
  sayDrop: (bowl: number, bowls: number) => string;
  colInBowl: string;
  colOverall: string;
  /** The row that names a bowl in the table of holes, with how many holes it has. */
  bowlHead: (bowl: number, holes: number) => string;
  /** How many of a bowl's holes do the same thing. */
  holeShare: (count: number, holes: number) => string;
  holeDown: string;
  holeDownPaid: string;
  bowlPaid: (poured: number, towers: number) => string;
  // Jewels
  /** The jewel lamps, for anyone who cannot see them on the cabinet: how many of them are lit. */
  jewelLamps: (lit: number, of: number) => string;
  sayJewelDrop: string;
  sayJewel: (medals: number, lit: number, of: number) => string;
  sayJewelBonus: (medals: number, of: number) => string;
  /** What a treasure line pays, in the table of lines: its chests, and the jewel that comes with it. */
  paysJewel: string;
  jewelTitle: string;
  jewelIntro: (lamps: number) => string;
  jewelCaption: string;
  colJewel: string;
  jewelEarly: (to: number) => string;
  jewelLast: (of: number) => string;
  jewelPrizeEach: (medals: number) => string;
  jewelNote: (perThousand: number, sum: string, set: number, average: string, perSpin: string, start: number) => string;
  /**
   * The lucky lamp: what is said when a medal is held through a lit START slot, and the lamp's rule at the end of
   * the Odds tab's chance time, with what an ordinary spin and a gold one are worth and how often the light steps.
   */
  sayLucky: string;
  luckyOddsNote: (ordinary: string, gold: string, seconds: string) => string;
}

const en: PusherStrings = {
  title: 'Medal Pusher',
  subtitle: 'Drop medals, let the pusher shove them over the edge, and get them through the START slots to spin the reels: sugoroku, treasure chests, medal towers and a jackpot roulette.',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  tabSim: 'Simulation',
  tabRecords: 'Records',
  howToPlay: 'How to play',
  infoBody: (held) => [
    'You start with 100 medals. Two rails feed them in, one from each side: the L button feeds the left rail and the R button the right, and both can be pressed at once. A medal goes in at the slot by that button, rolls along its feed arm’s rail to the back of the cabinet, drops off the tip onto the pusher a little to one side of where that rail is aimed, and gets shoved forward with the rest.',
    'Press a button to feed one medal and hold it to keep feeding: each rail takes a medal about every fifth of a second. Aiming is separate. Press or drag on the left half of the field to move the left rail’s tip, and on the right half to move the right rail’s, or use the slider under each button. Nothing is fed from the field. On a keyboard, F feeds the left rail and J the right, held like the buttons, while S and D move the left rail’s aim and K and L the right rail’s. Auto feeds two medals a second, the two rails by turns.',
    'Medals pile two deep. One that comes down where there is no room lies on top of the others, rides along with them, slides over them when it is pushed, and drops in as soon as a gap opens under it.',
    'Medals pushed over the front edge are yours. Near the front the sides of the table are open, and medals squeezed out there are gone.',
    'A medal that goes over the pusher’s lip through one of the three START slots starts a spin on the screen, on its way down to the lower table. Any medal does: one you dropped, one the screen paid, or one off a tower. Under the lip is a sloped face that leans toward you, and the START slots are three narrow openings in it, each a medal wide and a little more. A medal that comes over the lip slides down the slope lying flat, face up, and one that is in line with a START slot goes into it. One that catches a slot’s edge rattles on its frame and slides off the foot of the slope, and one that comes down between the slots slides off the foot too: neither starts anything. The START slots sit side by side under the middle of the lip and ride out and back with it, so the place to feed is the middle of the pusher: what you drop there pushes the pile out through them. A medal you feed takes most of a second to go in at its slot and roll the length of its arm, and about half a second more to fall, and it drops wherever the arm is pointing when it gets to the tip.',
    `The machine holds up to ${held} spins at a time and plays them one after another. One of the three START slots is lit gold at a time: the lucky lamp. The light steps one slot along with every stroke of the pusher. A medal that is held through the lit slot holds a gold spin. Gold spins are played first and fast, and the sugoroku square or the chest a gold spin leads to pays double. The lamp cannot be chased by aiming: a medal takes half a minute and more to get from the rail to the lip, and by then the light has moved many times. Which START slot is lit when your medal gets there is luck.`,
    'A medal through a START slot when the hold is full starts no spin of its own, but turns one of the held spins gold: that is CHANCE TIME. While it lasts the wings of the START slots are open: flaps on the slope that swing out and funnel medals toward the slots. All three slots are lit, they take medals more easily, and every medal that is held holds a gold spin. Chance time ends when the last gold spin has been played.',
    'Three even digits, the ones drawn as ways of travelling (a car, a boat, a balloon and a rocket), roll the die on the sugoroku board that lies across the front of the screen: the piece hops on and you are paid what its square says, 3 to 15 medals, or a fever of 30.',
    'Three odd digits, the ones drawn as treasures (a medal, a jewel, a crown and a sack of gold), open the treasure chance: pick one of three chests. They hold 10, 20 and 30 medals, and the bigger two are stacked on the pusher as medal towers.',
    'A tower rides the pusher like any medal. Push it over the lip and it comes down across the lower table, shoving a wave of medals ahead of it. If it goes over at a START slot, every medal in it drops through.',
    'Three sevens drop a prize ball onto the field.',
    'Push a ball over the front edge and the jackpot chance starts: a roulette that keeps turning. Every number it stops on is stacked on the pusher as a medal tower, and it turns again until it stops on a cross. Four numbers in a row start the jackpot challenge: three bowls, one under another. The ball rolls round the top bowl and drops into one of its three holes: two let it down into the middle bowl, and one ends it with 50 medals. The middle bowl has two holes, one down to the bottom bowl and one worth 100. The bottom bowl has a single hole, and it is the jackpot, which begins at 300 medals and grows as the machine is played. Two balls are already lying on the field.',
    'A treasure line also lets a jewel go: the hatch throws it over the pusher onto the middle of the lower table. It is pushed along like a medal, but it does not fit through the open sides, so it can only leave over the front. Push it over and it lights one of the five jewel lamps on the front of the table and pays 1 medal at once. The fifth jewel pays the jewel bonus instead, 3 medals stacked as a tower, and the lamps go out. Two jewels are already lying on the field.',
    'The Odds tab lists the exact chances on the screen, and the Simulation tab measures what cannot be calculated: how much of what you drop comes back, depending on where and how fast you drop it.',
  ],

  jackpot: 'JACKPOT',
  stock: 'HOLD',
  stockAria: (held, max) => `${held} of ${max} spins held`,
  legendSeven: '7·7·7 ▸ BALL',
  legendOdd: '1·3·5·9 ▸ TREASURE',
  legendEven: '2·4·6·8 ▸ SUGOROKU',
  reach: 'REACH!',
  superReach: 'SUPER REACH!',
  reachCaption: 'How often each kind of reach comes up, and the chance that it then hits',
  colReach: 'Reach',
  colReachShare: 'Share of spins',
  colReachHits: 'Chance it hits',
  reachName: { normal: 'Reach', long: 'Super reach (the long one)', any: 'Any reach' },
  reachTrustNote: (long, normal, times, afterWin, afterMiss) =>
    `How far to trust a reach: a super reach goes on to hit ${long} of the time and an ordinary reach ${normal}, so the long one is about ${times} times as likely to hit. The reach is not changing your luck. It is a hint: a spin that has already won is played with the long reach ${afterWin} of the time, and a spin that has already lost with a reach only ${afterMiss} of the time, so a long reach is more often a win being acted out. These chances are exact.`,
  spinWin: (medals) => `+${medals} MEDALS`,
  towerWin: (medals) => `TOWER +${medals}`,
  feverWin: (medals) => `FEVER! +${medals}`,
  feverTag: 'FEVER',
  finishWin: (medals) => (medals > 0 ? `FINISH! TOTAL ${medals}` : 'FINISH…'),
  chainTotal: (medals) => `TOWER ${medals}`,
  ballWin: 'BALL GET!',
  chance: 'JACKPOT CHANCE',
  challenge: 'JACKPOT CHALLENGE',
  sayGoal: (medals, level) =>
    `${medals} medals go up as a tower. Level ${level}: the jackpot challenge. The ball goes into the top one of three bowls, and the jackpot is at the bottom of them.`,
  sayHole: (bowl, medals, poured, total) =>
    `The ball dropped into the ${medals} hole of bowl ${bowl}. ${
      poured >= medals ? `All ${medals} medals are poured onto the field: the pusher has no room for a tower.` : `${poured} of those ${medals} medals are poured onto the field and the rest go up as towers.`
    } The run is over: it paid ${total} medals.`,
  bowlIntro: (bowls) =>
    `The jackpot challenge is ${bowls} bowls, one under another. The ball circles under the rim of a bowl, spirals in as it slows and drops into one of that bowl’s holes, each as likely as the next. A hole either lets it down into the bowl below or ends the challenge with a prize. The bottom bowl is a funnel with one hole in the middle, and that hole is the jackpot’s. The ball only acts it out: the whole way down is drawn before it is let go.`,
  bowlCaption: 'The holes of each bowl: what they do, the chance of each in its own bowl and overall, and how it is paid',
  colHole: 'The ball drops into',
  holeJackpot: 'The jackpot',
  holeJackpotPaid: (poured, towers, start) => `${poured} poured onto the field and ${towers} towers on the pusher when it stands at ${start}`,
  bowlNote: (start, average, perBall, poured) =>
    `With the jackpot at ${start} medals the bowls pay ${average} medals on average: the three ways the challenge can end are as likely as each other, so it is the three prizes added up, divided by three. About ${perBall} of all balls get this far. Of whatever the bowls pay, ${poured} is poured onto the field loose and the rest is stacked as towers; what the free places on the pusher cannot hold is poured as well.`,
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
  screenAria: 'The screen',
  fieldAria: 'The field. Press or drag on its left half to aim the left rail, and on its right half to aim the right rail. This feeds no medals: the L and R buttons do.',
  medals: 'MEDALS',
  aimValue: (percent) => `${percent}% across`,
  auto: 'Auto',
  autoHint: 'Feeds two medals a second, the left and right rails by turns, each at its own aim',
  sound: 'Sound',
  refill: (medals) => `Out of medals — take ${medals} more`,
  reset: 'Reset the machine',
  resetConfirm: 'Press again to reset',
  savedNote: 'This machine is saved on this device. Your medals, the jackpot and the field are as you left them when you come back.',
  sayReset: (medals) => `The machine has been reset. You have ${medals} medals.`,
  sayResetOff: 'Reset cancelled.',
  unsavedNote: 'This machine could not be saved on this device: the browser is blocking storage, or it is full. It will start again when the page is reloaded.',
  signInInvite: 'Sign in to keep it on your account.',
  accountNote: 'This machine is saved to your account, so it follows you to your other devices. It is sent about once a minute and when you leave, and this device keeps a copy.',
  offlineNote: 'Could not reach your account just now. The machine is kept on this device and will be sent when the account can be reached again.',
  unreadableNote:
    'The machine saved to your account cannot be read by this page; it may come from a newer version of the game. It has been left as it is, and the machine here is kept on this device only. Reloading the page may help.',
  checkingNote: 'Looking for the machine saved to your account…',
  resetConfirmAccount: 'Press again to reset the machine on your account',
  accountUnsavedNote:
    'This machine is saved to your account, so it follows you to your other devices. It is sent about once a minute and when you leave. This device could not keep a copy of its own: the browser is blocking storage, or it is full.',
  offlineUnsavedNote:
    'Could not reach your account just now, and this device could not save the machine either: the browser is blocking storage, or it is full. It will be sent when the account can be reached again; if the page is closed before then, what you have played since it was last sent is lost.',
  unreadableUnsavedNote:
    'The machine saved to your account cannot be read by this page; it may come from a newer version of the game. It has been left as it is. The machine here is not saved anywhere: this device could not keep it, because the browser is blocking storage or it is full. Reloading the page may help.',
  checkingUnsavedNote: 'Looking for the machine saved to your account… Meanwhile this device could not save the machine here: the browser is blocking storage, or it is full.',
  saySugorokuStart: (digits) => `${digits}. Sugoroku chance: the die is rolling.`,
  saySugoroku: (medals) => `The piece landed on ${medals} medals.`,
  sayFever: (medals) => `Fever! ${medals} medals rain onto the field.`,
  sayChestStart: (digits) => `${digits}. Treasure chance: pick one of the three chests.`,
  sayChest: (chest, medals, towers) => `Chest ${chest} held ${medals} medals${towers ? ', stacked on the pusher as towers' : ''}.`,
  saySevens: 'Seven, seven, seven. A prize ball drops onto the field.',
  sayBall: 'A ball went over the front edge. The jackpot chance starts.',
  sayToppled: 'A tower came down onto the lower table.',
  sayStep: (medals, level) => `${medals} medals go up as a tower. Level ${level}. The roulette turns again.`,
  sayFinish: (medals) => `A cross. The run is over: ${medals} medals in towers.`,
  sayJackpot: (medals, poured) =>
    `The ball dropped into the jackpot hole. Jackpot: ${medals} medals. ${
      poured >= medals ? 'All of them are poured onto the field: the pusher has no room for a tower.' : `${poured} of them are poured onto the field and the rest go up as towers.`
    }`,
  sayEmpty: 'You are out of medals.',
  sayBonus: (medals) => `Daily bonus: ${medals} medals added to your medals.`,
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
  diagramAria: 'The field from above: the feed arms running back from the front corners, the pusher with the three START slots under its lip, the lower table with its open sides, and the front edge',
  partName: {
    arms: 'Feed arms',
    pusher: 'Pusher',
    chuckers: 'START slots',
    table: 'Lower table',
    sides: 'Open sides',
    front: 'Front edge',
  },
  partText: {
    arms: 'One runs back from each front corner, where its slot is, to end over the pusher. A medal goes in at the slot of the rail you feed, rolls along the rail and drops off the tip. Each arm has an aim of its own and swings after it, each to a little past the middle, though the two never cross; an arm crosses its whole reach in under a fifth of a second. A medal is let go wherever its arm’s tip is when it gets there. It lands up to 12% of the width to either side of that, most often close to it.',
    pusher: 'Slides back and forth under the back panel, carrying a heap two medals deep. The panel scrapes the rearmost medals forward, and the front ones tip over the lip.',
    chuckers: 'Three of them side by side in the middle of the pusher’s lip. They ride out and back with it and do not move along it. Each is a narrow opening with a frame round it, in the sloped face that leans toward you under the lip. A medal that goes over the lip slides down that slope lying flat, face up, and any medal in line with a START slot goes into it and starts a spin: one you dropped, one the screen paid, or one off a tower, which sends every medal in it through if it goes over there. A START slot’s opening is as wide as a medal and 1.13% of the field’s width more on either side. A medal that comes over a little further to the side catches the slot’s edge, rattles on its frame and slides off the foot of the slope, and so does one that comes down between the slots. One of the three is lit gold at a time, the lucky lamp, and the light steps one slot along with every stroke of the pusher, every 3.6 seconds. During chance time their wings are open: flaps on the slope that swing out and funnel medals toward the slots, so that each takes medals up to 1.7% of the width to either side. A ball does not fit.',
    table: 'The pusher’s face shoves these medals toward you, a row at a time. Here too they lie two deep, and the ones on top slide forward over the rest.',
    sides: 'The last fifth of the table has no side walls. A medal squeezed out there is lost: this is the only place the machine takes anything. A ball does not fit through.',
    front: 'Whatever goes over is yours.',
  },
  slotTitle: 'The slot on the screen',
  slotIntro: (held) =>
    `Every medal through a START slot starts one spin. While the reels are busy the machine holds up to ${held} more; a medal through a START slot when all ${held} are held starts no spin of its own, but turns one of the held spins gold. A medal that is held through the slot the lucky lamp is on holds a gold spin from the start.`,
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
    `A loop of ${squares} squares lying across the front of the screen, each with a stack of medals on it that is taller the more it pays. Three even digits roll one die, the piece moves that many squares, and you are paid what the square it lands on says. The piece stays there until the next roll.`,
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
  rouletteIntro: (pockets, goal) =>
    `A ball pushed over the front edge starts the roulette. Each turn it stops on one of ${pockets} pockets, each as likely as the next. A number is stacked on the pusher as a medal tower and the roulette turns again; a cross ends the run. ${goal} numbers in a row start the jackpot challenge. A ball is never lost: it does not fit through the open sides, so sooner or later it goes over the front.`,
  rouletteCaption: 'The roulette’s pockets and the chance of each on one turn',
  colPocket: 'Pocket',
  colPockets: 'Pockets',
  colPaidAs: 'Paid as',
  pocketStopName: 'A cross: the run ends',
  pocketTower: (medals) => `A tower of ${medals} medals`,
  chainCaption: 'The chance that a run gets as far as each number of pockets in a row',
  colInARow: 'Numbers in a row',
  colGetsThere: 'Chance of getting there',
  jackpotNote: (start, step, perBall, perSpin, average) =>
    `A numbered pocket pays ${average} medals on average. The jackpot starts at ${start} medals and grows by one for every ${step} medals dropped on this machine. One ball in ${perBall} wins it, and one spin in ${perSpin} leads to it: three sevens for the ball, a full run once the ball goes over, and then a hole that leads down in each of the two upper bowls.`,
  valueTitle: 'What a spin is worth',
  valueIntro: 'Each prize times its chance, added up, with a ball counted as the roulette it will start. The jackpot is the only thing that moves it.',
  valueCaption: 'The average roulette prize and the average a spin pays, by the size of the jackpot',
  colJackpotAt: 'Jackpot at',
  colRouletteAverage: 'Average roulette prize',
  colSpinValue: 'A spin pays, on average',
  valueNote: (value) =>
    `So a medal through a START slot is worth about ${value} more medals, and more than that through the lit one, where its spin is gold — and those land on the field, not in your tray. They still have to make it over the front, and on their way off the pusher some of them go through a START slot themselves.`,
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
  calcBreakEven: (percent) => `At this front share you would break even with a spin for ${percent} of the medals you drop.`,
  calcNever: 'At this front share you could not break even even with a spin for every medal you drop.',
  calcNote: (held) =>
    `The Simulation tab measures both. Feeding both rails down the middle of the pusher, two medals a second between them, about 80% of medals leave by the front and a spin starts about 12 times for every 100 medals dropped. About a third of those spins are gold, their medals having come through the lit START slot. The sum above counts every spin as an ordinary one: with what being gold adds, about 95% of the medals come back. They are not all your own medals’ doing: what the screen pays lands on the pusher as well, and about a seventh of the medals that go over the lip are ones it paid. Those come down all over the pusher, so few of them find a START slot: more than nine in ten of the medals through one are medals you dropped. The machine holds up to ${held} spins, so at that pace hardly any medal through a START slot finds the hold full: it happens when a tower goes over through one and all its medals arrive at once. Drop anywhere at all instead and a spin starts about 7 times. At five a second the screen cannot keep up: about three in ten of the medals through a START slot find the hold full. Hold both buttons down, which feeds about eleven a second, and about half of them find the hold full. The first of them starts chance time, which opens the wings and makes every spin that is held while it lasts a gold one, so about 96% of the medals come back at five a second and about 94% with both buttons held. Dropping more slowly than two a second gains a point or two, and no more than that. Aiming at the lit START slot does not pay. A medal takes from 19 to 94 seconds to get from the rail to the lip, half of them between 23 and 49, and the pile carries it about a fifth of the field’s width to one side or the other on the way, so the light has moved many times before it arrives. With both rails aimed at the lit slot’s column about 94% came back, and aimed at the column the light would be on half a minute later about 93%: both less than feeding the middle, because fewer medals reach a START slot at all.`,

  simTitle: 'Where to drop, measured',
  simIntro: (warmUp) =>
    `Four ways of aiming the two rails, each on a machine of its own that starts from the same field. Each plays the same number of medals at the same pace, counted between the two rails, after ${warmUp} uncounted medals to fill its tables.`,
  paceLabel: 'Pace',
  paceOption: (perSecond) => `${perSecond} medals a second`,
  medalsLabel: 'Medals per aim',
  run: 'Run',
  running: (pct) => `Running… ${pct}%`,
  cancel: 'Cancel',
  aimName: {
    centre: 'Both rails down the middle, behind the START slots',
    anywhere: 'Anywhere at all, from the rail on that side',
    beside: 'Each rail at its fixed spot beside the START slots',
    edges: 'Each rail at its own edge',
  },
  resultTitle: (medals, pace) => `${medals} medals per aim, ${pace} a second`,
  simCaption: 'What each way of aiming returned and how its medals left the field',
  colAim: 'Aim',
  colReturn: 'Return, this run',
  colSteady: 'With average luck',
  colFront: 'Left by the front',
  colGate: 'Through a START slot',
  colWasted: 'START slot hits wasted',
  colSpins: 'Spins',
  chartTitle: 'Medals won per medal dropped, as the run goes on',
  chartAria: 'Medals won per medal dropped against medals dropped, one line per aim',
  chartX: 'Medals dropped',
  chartCaption: 'Medals won per medal dropped at points along the run, for each aim',
  simNotes: (exactPerSpin, held) => [
    '“Return, this run” is what the machine actually handed back. It swings with the screen: one roulette can pay more than a hundred medals, and a ball still lying on the field has paid nothing yet.',
    `“With average luck” takes the luck out. It keeps what this run measured — the share of medals that left by the front and the spins started per medal — and pays each spin its exact average of ${exactPerSpin} medals.`,
    `A medal through a START slot is wasted when ${held} spins are already held. It is not all lost: it turns one of the held spins gold, if one is left to turn, and with that chance time begins. Until the last gold spin has been played the wings of the START slots are open, and every medal that is held holds a gold spin. Dropping faster than the screen can spin fills the hold, and so does a tower that goes over through a START slot: all its medals arrive at once. A spin is gold without any of that when its medal came through the slot the lucky lamp was on. “Gold spins” counts the gold spins that were played in the run, however they came to be gold, and “With average luck” pays each of them its own exact average.`,
    'A medal drops where its arm is pointing when it leaves the tip, so every aim here keeps each arm on its spot until the medal has gone. Three of the four feed the left and the right rail by turns and never move them; the fourth picks a new spot for every medal and feeds it from the rail on that side. The START slots do not move, so an aim is only a choice of column for each rail. The lucky lamp does move, and no aim here goes after it: a medal takes half a minute and more to reach the lip, so the slot that is lit when it is fed says nothing about the one that will be lit when it arrives. “Through a START slot” counts every medal that dropped through one, whoever put it on the field, against the medals dropped: what the screen pays goes over the lip too. The fixed spots beside the START slots lie as far outside the outer two as those are from the middle one. By the time a medal reaches the lip the pile has carried it well to one side or the other, which is why even medals dropped at the edges find a START slot now and then.',
  ],
  slotCheckTitle: 'The screen in this run, against its exact odds',
  slotCheckIntro: (spins) => `All four machines together spun ${spins} times.`,
  slotCheckCaption: 'How often each line came up in this run, next to its exact chance',
  colSeen: 'This run',
  colExact: 'Exact',
  feedName: ['L', 'R'],
  feedAria: ['Feed the left rail', 'Feed the right rail'],
  feedHint: (key) => `Hold to keep feeding. Key: ${key}`,
  aimLabel: ['Left rail aim', 'Right rail aim'],
  keysNote: 'Keys: F and J feed the left and right rails, and can be held together. S and D aim the left rail, K and L the right.',
  soundSettings: 'Sound settings',
  volume: 'Volume',
  volumeMark: (percent) => (percent === 0 ? 'silent' : percent === 100 ? 'usual' : ''),
  volumeValue: (percent) => (percent === 0 ? '0%, silent' : percent === 100 ? '100%, the usual level' : `${percent}%`),
  music: 'Music',
  arcade: 'Arcade',
  arcadeHint: 'The sound of the arcade around this machine',
  chanceTitle: 'CHANCE TIME',
  chanceLeft: (spins) => `${spins} left`,
  sayChance: 'Chance time. The hold is full: the wings of the START slots swing out to funnel medals in, and every spin held from now on is gold. Gold spins pay double on the board and the chests.',
  sayChanceEnd: 'Chance time is over.',
  chanceOddsTitle: 'Chance time',
  chanceOddsBody: (held, times) =>
    `When all ${held} spins are held, the next medal through a START slot starts no spin of its own. It turns one of the held spins gold, and with that chance time begins. While it lasts the wings of the START slots are open: flaps on the slope under the lip that swing out and funnel the medals sliding down it toward the slots. So the slots take medals more easily, every medal that is held holds a gold spin, and each medal that finds the hold full turns another held spin gold while one is left to turn. Chance time ends when the last gold spin has been played. Gold spins are played before the others and their reels are quick. A gold spin is drawn from the same table as any spin; the sugoroku square or the chest it leads to pays ${times} times over, and a ball is a ball.`,
  chanceCaption: 'What an ordinary spin and a gold spin pay on average, by the size of the jackpot',
  colChanceValue: 'A gold spin pays, on average',
  colChanceMore: 'More than an ordinary spin',
  chanceOddsNote: (more) =>
    `A spin that a full hold turned gold has cost two medals through a START slot, the one that was held and the one that turned it gold, and it is worth ${more} medals more than one ordinary spin, which is less than the two spins those medals would have been with room in the hold. What a full hold gives back is the rest of chance time: wings that funnel more medals into the START slots, and every spin held while it lasts gold for the one medal it cost. Measured on the Simulation tab, holding both buttons down returns about 94%, a little less than feeding the middle at two medals a second.`,
  colGold: 'Gold spins',
  feelLabel: 'Ways to play',
  swing: 'Swing',
  swingHint: 'The rails swing left and right by themselves, and you only time L and R. Touch a slider or the field to aim by hand again.',
  swingNote: 'Swing: the rails move by themselves. Press L or R when the ▼ over a slider is where the medal should drop.',
  saySwingOn: 'Swing is on: the rails are swinging. Press L or R to feed a medal.',
  saySwingOff: 'Swing is off.',
  saySwingTaken: 'Swing is off: you are aiming by hand.',
  vibration: 'Vibrate',
  vibrationHint: 'The phone ticks when a medal goes in and buzzes for a win.',
  fullscreen: 'Fullscreen',
  fullscreenHint: 'The cabinet and its controls fill the screen.',
  sayDrop: (bowl, bowls) =>
    bowl === bowls ? 'The ball dropped through into the last bowl, where the only hole is the jackpot’s.' : `The ball dropped through into bowl ${bowl} of ${bowls}.`,
  colInBowl: 'Chance in that bowl',
  colOverall: 'Chance overall',
  bowlHead: (bowl, holes) => `${['Top bowl', 'Middle bowl', 'Bottom bowl'][bowl - 1] ?? `Bowl ${bowl}`}: ${holes === 1 ? 'one hole' : `${holes} holes`}`,
  holeShare: (count, holes) => (holes === 1 ? 'Its only hole' : `${count} of its ${holes} holes`),
  holeDown: 'A hole down to the next bowl',
  holeDownPaid: 'Nothing yet: the ball rolls on in the bowl below',
  bowlPaid: (poured, towers) => `${poured} poured onto the field and ${towers === 1 ? 'one tower' : `${towers} towers`} on the pusher`,
  jewelLamps: (lit, of) => `Jewel lamps: ${lit} of ${of} lit.`,
  sayJewelDrop: 'The hatch throws a jewel onto the lower table.',
  sayJewel: (medals, lit, of) => `A jewel went over the front edge: ${medals === 1 ? '1 medal' : `${medals} medals`}. ${lit} of ${of} jewel lamps are lit.`,
  sayJewelBonus: (medals, of) => `A jewel went over the front edge and made the set of ${of}. Jewel bonus: ${medals} medals go up as a tower, and the lamps go out.`,
  paysJewel: 'A choice of three chests, and a jewel',
  jewelTitle: 'Jewels',
  jewelIntro: (lamps) =>
    `Every treasure line also lets a jewel go: a cut stone about a medal across, which the hatch throws over the pusher onto the middle of the lower table. It is pushed along like a medal, but nothing lies on it or under it, and it stands too tall for the open sides: the only way off the field is over the front. There it is collected, and lights one of the ${lamps} jewel lamps on the front of the table.`,
  jewelCaption: 'What each jewel of a set pays',
  colJewel: 'Jewel of a set',
  jewelEarly: (to) => `1st to ${to}th`,
  jewelLast: (of) => `${of}th: the jewel bonus, and the lamps go out`,
  jewelPrizeEach: (medals) => (medals === 1 ? '1 medal each' : `${medals} medals each`),
  jewelNote: (perThousand, sum, set, average, perSpin, start) =>
    `A jewel comes with every treasure line, so with ${perThousand} spins in 1,000. A set pays ${sum} = ${set} medals, which is ${average} medals a jewel and ${perSpin} medals a spin. That is counted in what the treasure line is worth in the first table, and in what a spin is worth below. A gold spin’s treasure line lets one jewel go like any other, and a jewel pays the same whichever spin it came with: chance time doubles the chest, not the jewel. No jewel is lost: every one the machine lets go is collected sooner or later, so the figure is exact. What the medals it pays do next is the field’s business, as with any others. A new machine has ${start} jewels lying on it already, which these figures leave out.`,
  sayLucky: 'A medal slid down the slope into a lit START slot. Its spin is gold.',
  luckyOddsNote: (ordinary, gold, seconds) =>
    `The lucky lamp: one of the three START slots is lit gold at a time, and the light steps one slot along, from the left, with every stroke of the pusher, which is every ${seconds} seconds. A medal that is held through the lit slot holds a gold spin from the start, for the one medal. An ordinary spin is worth ${ordinary} medals on average, and a gold spin ${gold}. The lamp cannot be chased by aiming: a medal takes half a minute and more to get from the rail to the lip, and the light has moved many times by then. Which START slot is lit when a medal arrives is luck.`,
};

const ja: PusherStrings = {
  title: 'メダルプッシャー',
  subtitle: 'メダルを落としてプッシャーに押し出させ、チャッカーに通してスロットを回します。すごろく、宝箱、メダルタワー、ジャックポットルーレットがあります。',
  tabMachine: 'マシン',
  tabOdds: '確率',
  tabSim: 'シミュレーション',
  tabRecords: '記録',
  howToPlay: '遊び方',
  infoBody: (held) => [
    'メダル100枚から始めます。メダルは左右2本のレールから入れます。Lボタンで左のレール、Rボタンで右のレールに入り、両方を同時に押すこともできます。メダルはそのボタンのそばの入り口から入り、アームのレールを奥まで転がって先端から落ち、そのレールの狙いから少しずれてプッシャーの上に乗り、ほかのメダルと一緒に前へ押し出されます。',
    'ボタンを押すと1枚入り、押し続けると連続で入ります。1本のレールが受け取るのは約0.2秒に1枚です。狙いは別に決めます。フィールドの左半分を押すかドラッグすると左のレールの先端が、右半分なら右のレールの先端が動きます。ボタンの下のスライダーでも動かせます。フィールドを押してもメダルは入りません。キーボードでは、Fで左、Jで右のレールにメダルが入り（押し続けると連続）、SとDで左のレール、KとLで右のレールの狙いが動きます。オートは左右のレールに交互に、毎秒2枚入れます。',
    'メダルは2段まで重なります。置く場所がないところに落ちたメダルはほかのメダルの上に乗り、下のメダルと一緒に運ばれ、押されるとその上を滑り、下にすき間ができると落ち込みます。',
    '手前の端から落ちたメダルがあなたのものです。テーブルの手前側は両脇が開いていて、そこから押し出されたメダルは戻りません。',
    'プッシャーの縁から下のテーブルへ落ちるメダルが、縁の下にある3つのチャッカーのどれかを通ると、中央画面のスロットが1回まわります。自分で落としたメダルでも、払い出されたメダルでも、タワーから崩れたメダルでも同じです。縁の下には手前に傾いた斜面があり、チャッカーはその斜面に開いた細長い口です。幅はメダル1枚分より少し広いだけです。縁を越えたメダルは、表を上にして寝たまま斜面を滑り落ち、チャッカーの正面に来たものがそのまま中に入ります。口の端に引っかかったメダルは、枠の上でカタカタ揺れてから斜面の下の端へ滑り落ちます。チャッカーのあいだを滑ってきたメダルも、そのまま下の端から落ちます。どちらも抽選は始まりません。チャッカーは縁の中央の下に3つ並んでいて、プッシャーと一緒に前後に動きます。だから狙い目はプッシャーの中央です。そこに落としたメダルが、山をチャッカーのほうへ押し出します。自分で入れたメダルは、入り口から入ってアームのレールを奥まで転がるのに1秒近く、先端から落ちるのにもう0.5秒ほどかかります。落ちる場所は、メダルが先端に着いたときにアームが向いている位置で決まります。',
    `抽選は${held}回分までためられ、順番に回ります。3つのチャッカーのうち1つは金色に光っています。これがラッキーランプです。光は、プッシャーが1往復するたびに、となりのチャッカーへ移ります。光っているチャッカーを通って保留されたメダルは、金の抽選になります。金の抽選は先に、速く回り、当たったときのすごろくのマスや宝箱の払い出しが2倍になります。ランプに合わせて狙うことはできません。メダルがレールから縁に着くまでには30秒以上かかり、そのあいだに光は何度も移ってしまうからです。メダルが着いたときにどのチャッカーが光っているかは、運しだいです。`,
    '保留が満杯のときにチャッカーを通ったメダルは、自分の抽選を始めるかわりに、保留中の抽選を1つ金色に変えます。これがチャンスタイムです。チャンスタイムのあいだは、チャッカーの羽根が開きます。羽根は斜面についた板で、外へ開いて、滑ってくるメダルをチャッカーのほうへ寄せます。3つのチャッカーがすべて金色に光り、メダルが入りやすくなり、保留されたメダルはすべて金の抽選になります。最後の金の抽選が回り終わると、チャンスタイムは終わります。',
    '偶数（車・ヨット・気球・ロケットの、乗り物の絵柄）が3つそろうと「すごろくチャンス」です。画面の手前に置かれたすごろく盤でサイコロを振り、コマが止まったマスの枚数（3〜15枚、フィーバーなら30枚）がもらえます。',
    '奇数（メダル・宝石・王冠・金貨の袋の、宝物の絵柄）が3つそろうと「宝箱チャンス」です。3つの宝箱から1つ選びます。中身は10枚・20枚・30枚で、20枚と30枚はプッシャーの上にメダルタワーとして積まれます。',
    'タワーはほかのメダルと同じようにプッシャーに乗って進みます。縁の向こうへ押し出すと崩れて下のテーブルに雪崩れ込み、その先のメダルをまとめて押し出します。チャッカーのところで縁を越えると、タワーのメダルが全部チャッカーを通ります。',
    '7が3つそろうと、ボールが1個フィールドに落ちてきます。',
    'ボールを手前の端から落とすとジャックポットチャンスが始まります。ルーレットが回り続け、止まった数字の枚数がプッシャーの上にメダルタワーとして積まれ、×に止まるまで続きます。数字が4回続くと「ジャックポットチャレンジ」です。クルーン（すり鉢状の皿）が3段に重なっています。ボールはまずいちばん上の皿を転がり、3つの穴のどれかに落ちます。2つは下の段へ進む穴、1つは50枚で終わる穴です。2段目は穴が2つで、1つは最後の段へ進み、もう1つは100枚です。最後の段の穴は1つだけで、それがジャックポットです。ジャックポットは300枚から始まり、遊ぶほど増えていきます。ボールは最初から2個フィールドに置いてあります。',
    '宝箱チャンスのそろい目が出ると、宝石も1個出てきます。ハッチからプッシャーを越えて、下のテーブルの中央あたりに飛んできます。宝石はメダルと同じように押されて進みますが、開いている脇は通らないので、出口は手前の端だけです。手前から落とすと、テーブルの手前にある5個の宝石ランプが1つ点灯し、すぐにメダル1枚が払い出されます。5個目は「宝石ボーナス」で、代わりにメダル3枚がタワーとして積まれ、ランプは消えます。宝石は最初から2個フィールドに置いてあります。',
    '「確率」タブには画面の抽選の正確な確率を載せています。「シミュレーション」タブでは計算では出せないもの、つまり落とす場所と速さによって何割戻ってくるかを実測します。',
  ],

  jackpot: 'JACKPOT',
  stock: '保留',
  stockAria: (held, max) => `保留 ${held}／${max}`,
  legendSeven: '7·7·7 ▸ ボール',
  legendOdd: '1·3·5·9 ▸ 宝箱',
  legendEven: '2·4·6·8 ▸ すごろく',
  reach: 'リーチ！',
  superReach: 'スーパーリーチ！',
  reachCaption: 'リーチの種類ごとの出現率と信頼度',
  colReach: 'リーチ',
  colReachShare: '出現率',
  colReachHits: '信頼度',
  reachName: { normal: 'ノーマルリーチ', long: 'スーパーリーチ', any: 'リーチ全体' },
  reachTrustNote: (long, normal, times, afterWin, afterMiss) =>
    `リーチの信頼度（そのリーチが当たりになる確率）は、スーパーリーチが${long}、ノーマルリーチが${normal}です。スーパーリーチのほうが約${times}倍当たりやすくなっています。ただし、リーチが運を変えているわけではありません。結果のヒントが出ているだけです。当たりが決まった抽選の${afterWin}、リーチはずれが決まった抽選の${afterMiss}がスーパーリーチに発展するので、スーパーリーチが出たときは当たりである可能性が高くなります。どれも正確な値です。`,
  spinWin: (medals) => `${medals}枚 GET`,
  towerWin: (medals) => `タワー ${medals}枚`,
  feverWin: (medals) => `フィーバー！ ${medals}枚`,
  feverTag: 'フィーバー',
  finishWin: (medals) => (medals > 0 ? `終了！ 合計${medals}枚` : '終了…'),
  chainTotal: (medals) => `タワー ${medals}枚`,
  ballWin: 'ボール GET！',
  chance: 'ジャックポットチャンス',
  challenge: 'ジャックポットチャレンジ',
  sayGoal: (medals, level) =>
    `${medals}枚がタワーに積まれます。レベル${level}。ジャックポットチャレンジです。ボールが3段のクルーンのいちばん上に入ります。いちばん下がジャックポットです。`,
  sayHole: (bowl, medals, poured, total) =>
    `ボールが${bowl}段目のクルーンで${medals}枚の穴に落ちました。${
      poured >= medals ? `プッシャーにタワーを積む場所がないため、${medals}枚すべてがフィールドに降ります。` : `${medals}枚のうち${poured}枚がフィールドに降り、残りはタワーに積まれます。`
    }終了です。払い出しは合計${total}枚です。`,
  bowlIntro: (bowls) =>
    `ジャックポットチャレンジは、${bowls}段に重なったクルーン（すり鉢状の皿）での抽選です。ボールは皿の縁の内側を回り、勢いが落ちるにつれて内側へ寄っていき、その皿の穴のどれか1つに落ちます。同じ皿の穴はどれも同じ確率です。穴は、下の段へ進む穴か、賞を払ってそこで終わる穴のどちらかです。いちばん下の段は真ん中に穴が1つだけ開いたじょうご型で、その穴がジャックポットです。ボールは結果を演じているだけで、どの穴を通って落ちるかはボールが放たれる前に決まっています。`,
  bowlCaption: 'クルーンの段ごとの穴：穴の役割、その段での確率、全体での確率、出方',
  colHole: 'ボールが落ちる穴',
  holeJackpot: 'ジャックポット',
  holeJackpotPaid: (poured, towers, start) => `${start}枚のとき、${poured}枚がフィールドに降り、プッシャーの上にタワー${towers}本`,
  bowlNote: (start, average, perBall, poured) =>
    `ジャックポットが${start}枚のとき、クルーンの払い出しは平均${average}枚です。3通りの結末はどれも同じ確率なので、3つの賞の枚数を足して3で割った値です。ここまで届くのは、ボール全体の約${perBall}です。クルーンの払い出しは、その${poured}がそのままフィールドに降り、残りがタワーとして積まれます。プッシャーの空いた場所に積みきれない分も、フィールドに降ります。`,
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
  screenAria: '中央画面',
  fieldAria: 'フィールド。左半分を押すかドラッグすると左のレール、右半分なら右のレールの狙いが動きます。メダルは入りません。メダルを入れるのはLとRのボタンです。',
  medals: 'メダル',
  aimValue: (percent) => `左から${percent}%`,
  auto: 'オート',
  autoHint: '左右のレールに交互に、毎秒2枚入れます。それぞれのレールの狙いに落ちます',
  sound: '音',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  reset: 'マシンをリセット',
  resetConfirm: 'もう一度押すとリセットします',
  savedNote: 'メダルはこの端末に預けてあります。次に来たときも、メダル・ジャックポット・フィールドはそのまま残っています。',
  sayReset: (medals) => `マシンをリセットしました。メダルは${medals}枚です。`,
  sayResetOff: 'リセットを取り消しました。',
  unsavedNote: 'この端末には保存できませんでした。ブラウザが保存を許可していないか、空き容量がありません。ページを読み込み直すと、マシンは最初からになります。',
  signInInvite: 'サインインすると、アカウントに預けておけます。',
  accountNote: 'このマシンはアカウントに預けてあります。ほかの端末でも続きから遊べます。およそ1分ごとと、ページを離れるときに送られ、この端末にも控えが残ります。',
  offlineNote: 'いまアカウントに接続できません。マシンはこの端末に預けてあり、接続できしだい送り直します。',
  unreadableNote:
    'アカウントに預けてあるマシンを、このページでは読み取れません（新しい版のゲームで保存された可能性があります）。アカウント側はそのまま残し、ここのマシンはこの端末にだけ預けています。ページを読み込み直すと直ることがあります。',
  checkingNote: 'アカウントに預けたマシンを確認しています…',
  resetConfirmAccount: 'もう一度押すと、アカウントのマシンをリセットします',
  accountUnsavedNote:
    'このマシンはアカウントに預けてあります。ほかの端末でも続きから遊べます。およそ1分ごとと、ページを離れるときに送られます。この端末には控えを保存できませんでした。ブラウザが保存を許可していないか、空き容量がありません。',
  offlineUnsavedNote:
    'いまアカウントに接続できず、この端末にも保存できませんでした。ブラウザが保存を許可していないか、空き容量がありません。接続できしだい送り直しますが、その前にページを閉じると、最後に送ったあとに遊んだ分は失われます。',
  unreadableUnsavedNote:
    'アカウントに預けてあるマシンを、このページでは読み取れません（新しい版のゲームで保存された可能性があります）。アカウント側はそのまま残してあります。ここのマシンはどこにも保存されていません。この端末には保存できませんでした（ブラウザが保存を許可していないか、空き容量がありません）。ページを読み込み直すと直ることがあります。',
  checkingUnsavedNote: 'アカウントに預けたマシンを確認しています… その間、ここのマシンはこの端末に保存できませんでした。ブラウザが保存を許可していないか、空き容量がありません。',
  saySugorokuStart: (digits) => `${digits}。すごろくチャンスです。サイコロを振ります。`,
  saySugoroku: (medals) => `コマが${medals}枚のマスに止まりました。`,
  sayFever: (medals) => `フィーバーです。メダルが${medals}枚降ってきます。`,
  sayChestStart: (digits) => `${digits}。宝箱チャンスです。3つの宝箱から1つ選んでください。`,
  sayChest: (chest, medals, towers) => `宝箱${chest}の中身は${medals}枚でした。${towers ? 'プッシャーの上にタワーとして積まれます。' : ''}`,
  saySevens: '7が3つそろいました。ボールがフィールドに落ちてきます。',
  sayBall: 'ボールが手前から落ちました。ジャックポットチャンスが始まります。',
  sayToppled: 'タワーが崩れて下のテーブルに落ちました。',
  sayStep: (medals, level) => `${medals}枚がタワーに積まれます。レベル${level}。ルーレットがもう一度回ります。`,
  sayFinish: (medals) => `×に止まりました。終了です。タワーは合計${medals}枚です。`,
  sayJackpot: (medals, poured) =>
    `ボールがジャックポットの穴に落ちました。ジャックポット、${medals}枚です。${
      poured >= medals ? 'プッシャーにタワーを積む場所がないため、すべてフィールドに降ります。' : `そのうち${poured}枚がフィールドに降り、残りはタワーに積まれます。`
    }`,
  sayEmpty: 'メダルがなくなりました。',
  sayBonus: (medals) => `デイリーボーナス: メダルが${medals}枚増えました。`,
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
  diagramAria: '上から見たフィールド。手前の角から奥へ伸びる左右の投入アーム、縁に3つのチャッカーが並んだプッシャー、両脇が開いた下のテーブル、そして手前の端',
  partName: {
    arms: '投入アーム',
    pusher: 'プッシャー',
    chuckers: 'チャッカー',
    table: '下のテーブル',
    sides: '開いた両脇',
    front: '手前の端',
  },
  partText: {
    arms: '手前の左右の角にある入り口から、プッシャーの上まで1本ずつ伸びています。メダルは入れたほうのレールの入り口から入り、レールを転がって先端から落ちます。アームにはそれぞれ自分の狙いがあり、それを追って動きます。どちらも中央を少し越えるところまで届きますが、2本が交差することはありません。端から端まで動くのに0.2秒かかりません。メダルが放されるのは、先端に着いたときにアームの先端がある位置です。そこから左右に幅の12%までずれますが、多くは近くに落ちます。',
    pusher: '2段に積もったメダルを乗せて、奥のパネルの下を前後に動きます。引くときにパネルが奥のメダルを前へかき出し、先頭のメダルが縁から落ちます。',
    chuckers: '3つがプッシャーの縁の中央に並んでいます。プッシャーと一緒に前後に動き、左右には動きません。縁の下の、手前に傾いた斜面に開いた細長い口で、まわりに枠がついています。縁を越えたメダルは、表を上にして寝たまま斜面を滑り落ち、チャッカーの正面に来たものが中に入って、抽選が1回始まります。自分で落としたメダルでも、払い出されたメダルでも、タワーから崩れたメダルでも数えます。タワーがそこで縁を越えると、タワーのメダルが全部通ります。チャッカーの口は、メダル1枚分に左右それぞれ幅の1.13%を足した広さです。それより少し横にずれたメダルは、口の端に引っかかって枠の上でカタカタ揺れ、斜面の下の端から滑り落ちます。チャッカーのあいだを滑ってきたメダルも同じです。3つのうち1つは金色に光っていて（ラッキーランプ）、プッシャーが1往復する3.6秒ごとに、光がとなりのチャッカーへ移ります。チャンスタイムのあいだは羽根が開きます。羽根は斜面についた板で、外へ開いて、滑ってくるメダルをチャッカーのほうへ寄せるので、左右それぞれ幅の1.7%までのメダルが入ります。ボールは通れません。',
    table: 'プッシャーの前面が、ここのメダルを一列ずつ手前へ押します。ここでもメダルは2段に重なり、上のメダルは下のメダルの上を滑って前へ進みます。',
    sides: 'テーブルの手前5分の1には脇の壁がありません。ここから押し出されたメダルは失われます。機械が取り分を得るのはここだけです。ボールはここを通れません。',
    front: 'ここを越えたメダルがあなたのものです。',
  },
  slotTitle: '画面のスロット',
  slotIntro: (held) =>
    `チャッカーを通ったメダル1枚につき、抽選が1回始まります。リールが回っている間は${held}回分までためられ、${held}回分たまっているときにチャッカーを通ると、新しい抽選は始まらず、保留中の抽選が1つ金色に変わります。ラッキーランプが光っているチャッカーを通って保留されたメダルは、はじめから金の抽選です。`,
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
    `画面の手前に置かれた、${squares}マスが輪になった盤です。各マスには、もらえる枚数が多いほど高いメダルの山が載っています。偶数が3つそろうとサイコロを1個振り、コマがその数だけ進んで、止まったマスに書かれた枚数がもらえます。コマは次に振るまでそのマスに残ります。`,
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
  rouletteIntro: (pockets, goal) =>
    `ボールを手前の端から落とすとルーレットが始まります。1回ごとに${pockets}個のポケットのどれかに止まり、どのポケットも同じ確率です。数字に止まるとその枚数がプッシャーの上にメダルタワーとして積まれ、もう一度回ります。×に止まると終了です。数字が${goal}回続くとジャックポットチャレンジが始まります。ボールが失われることはありません。開いた両脇は通れないので、いつかは必ず手前から落ちます。`,
  rouletteCaption: 'ルーレットのポケットと、1回あたりのそれぞれの確率',
  colPocket: 'ポケット',
  colPockets: '個数',
  colPaidAs: '出方',
  pocketStopName: '×（ここで終了）',
  pocketTower: (medals) => `${medals}枚のタワー`,
  chainCaption: '数字が何回続くところまで届くかの確率',
  colInARow: '数字が続いた回数',
  colGetsThere: 'そこまで届く確率',
  jackpotNote: (start, step, perBall, perSpin, average) =>
    `数字のポケットの平均は${average}枚です。ジャックポットは${start}枚から始まり、このマシンに${step}枚落とされるごとに1枚増えます。ボール${perBall}個に1個がジャックポットを獲得し、抽選では${perSpin}回に1回がそこにつながります。7が3つそろってボールが出て、そのボールが落ちたあとに数字が最後まで続き、クルーンの上の2段でどちらも下へ進む穴に落ちた場合です。`,
  valueTitle: '抽選1回の価値',
  valueIntro: 'それぞれの賞に確率を掛けて足し合わせます。ボールは、落ちたあとに始まるルーレットの分として数えます。変わるのはジャックポットの大きさだけです。',
  valueCaption: 'ジャックポットの大きさごとの、ルーレットの平均の賞と抽選1回あたりの平均払い出し',
  colJackpotAt: 'ジャックポット',
  colRouletteAverage: 'ルーレットの平均',
  colSpinValue: '抽選1回の平均払い出し',
  valueNote: (value) =>
    `つまり、チャッカーを通ったメダル1枚にはおよそ${value}枚分の価値があります。光っているチャッカーを通れば金の抽選になるので、価値はそれより上がります。ただし払い出されるのは受け皿ではなくフィールドの上です。そのメダルも、手前の端まで押し出されなければ手に入りません。プッシャーから落ちるときに、その一部がまたチャッカーを通ります。`,
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
  calcBreakEven: (percent) => `この割合なら、落としたメダルの${percent}にあたる回数の抽選があれば収支がゼロになります。`,
  calcNever: 'この割合では、落としたメダルと同じ回数の抽選があっても収支はゼロに届きません。',
  calcNote: (held) =>
    `どちらも「シミュレーション」タブで実測できます。左右のレールを両方ともプッシャーの中央に向け、合わせて毎秒2枚入れると、約80%が手前から出て、落としたメダル100枚につき約12回の抽選が始まります。そのうち約3分の1は、光っているチャッカーを通ったメダルによる金の抽選です。上の式はすべてをふつうの抽選として数えています。金の抽選の上乗せ分を入れると、戻ってくるのは約95%です。すべてが自分のメダルによるものではありません。払い出されたメダルもプッシャーの上に乗るので、縁を越えるメダルの約7分の1は払い出されたメダルです。ただし払い出されたメダルはプッシャーのあちこちに落ちるので、チャッカーを通るものは多くありません。チャッカーを通るメダルの10枚に9枚以上は、自分で落としたメダルです。保留は${held}回分までためられるので、この速さなら、チャッカーを通ったメダルが満杯の保留に当たることはほとんどありません。当たるのは、タワーがチャッカーのところで崩れて、メダルが一度に通るときです。場所を決めずに落とすと、抽選は約7回になります。毎秒5枚で落とすと画面が追いつかず、チャッカーを通ったメダルの約3割は保留が満杯で抽選を始められません。両方のボタンを押し続けると毎秒11枚ほど入り、約半分が満杯の保留に当たります。その最初の1枚でチャンスタイムが始まり、羽根が開いて、そのあいだに保留された抽選がすべて金の抽選になるので、戻ってくるのは毎秒5枚で約96%、両方のボタンを押し続けて約94%です。毎秒2枚よりゆっくり落とすと還元率は1〜2ポイント上がりますが、それ以上は上がりません。光っているチャッカーを狙っても得にはなりません。メダルがレールから縁に着くまでには19秒から94秒（半数は23秒から49秒）かかり、そのあいだに山に押されて左右に幅の5分の1ほどずれるので、着くころには光は何度も移っています。両方のレールを光っているチャッカーの列に向けると戻ってくるのは約94%、30秒後に光っているはずの列に向けると約93%で、どちらも中央に落とし続ける場合に届きません。チャッカーまで届くメダルが減るからです。`,

  simTitle: 'どこに落とすかを実測する',
  simIntro: (warmUp) =>
    `2本のレールの4通りの狙い方を、同じフィールドから始めた別々のマシンで試します。どれも同じ枚数を同じ速さで落とします。速さは2本のレールを合わせた枚数です。数え始める前に、テーブルを満たすためのメダルを${warmUp}枚落とします。`,
  paceLabel: '速さ',
  paceOption: (perSecond) => `毎秒${perSecond}枚`,
  medalsLabel: '狙い方ごとの枚数',
  run: '実行',
  running: (pct) => `実行中… ${pct}%`,
  cancel: '中止',
  aimName: {
    centre: '両方のレールをチャッカーの奥、中央に',
    anywhere: '場所を決めずに、その側のレールから',
    beside: '左右のレールをチャッカーの両脇に固定',
    edges: '左右のレールをそれぞれの端に',
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
  simNotes: (exactPerSpin, held) => [
    '「今回の還元率」は、マシンが実際に返した枚数です。画面の運で大きく振れます。ルーレット1回で100枚以上払い出されることもあれば、フィールドに残ったボールはまだ1枚も払い出していません。',
    `「運を平均にすると」は、その運を取り除いた値です。今回実測した「手前から出た割合」と「メダル1枚あたりの抽選回数」はそのまま使い、抽選1回の払い出しを正確な平均の${exactPerSpin}枚に置き換えています。`,
    `保留が${held}回分たまっているときにチャッカーを通ると、その通過は無駄になります。ただし全部が無駄になるわけではありません。まだ金色でない保留があれば、そのうち1つが金の抽選に変わります。そこからチャンスタイムが始まり、最後の金の抽選が回り終わるまでチャッカーの羽根が開いて、そのあいだに保留されたメダルはすべて金の抽選になります。画面の抽選より速く落とすと、保留は満杯になります。タワーがチャッカーのところで崩れて、メダルが一度に通るときもそうです。これとは別に、ラッキーランプが光っているチャッカーを通ったメダルの抽選も、金の抽選です。「金の抽選」は、金色になった理由を問わず、今回の計測中に回った金の抽選の回数です。「運を平均にすると」は、金の抽選をその正確な平均で計算します。`,
    'メダルは先端を離れるときにアームが向いている位置に落ちるので、どの狙い方でも、メダルが離れるまでアームをその位置に合わせておきます。4通りのうち3通りは左右のレールに交互に入れ、レールは動かしません。残りの1通りは1枚ごとに場所を選び、その側のレールから入れます。チャッカーは動かないので、狙い方の違いは、それぞれのレールで落とす列の違いだけです。ラッキーランプの光は移っていきますが、ここではどの狙い方もランプには合わせません。メダルが縁に着くまでに30秒以上かかるので、入れたときに光っているチャッカーは、着いたときに光っているチャッカーの手がかりになりません。「チャッカー通過」は、だれがフィールドに乗せたメダルかを問わず、チャッカーを通ったメダルをすべて数え、落とした枚数に対する割合で示します。払い出されたメダルも縁を越えるからです。「チャッカーの両脇に固定」の位置は、外側の2つのチャッカーから、チャッカーどうしの間隔と同じだけ外にあります。メダルは縁に着くまでに山に押されて左右に大きくずれるので、端に落としたメダルもときどきチャッカーを通ります。',
  ],
  slotCheckTitle: '今回の画面の抽選と、正確な確率',
  slotCheckIntro: (spins) => `4台のマシンを合わせて${spins}回抽選しました。`,
  slotCheckCaption: '今回それぞれの並びが出た割合と、正確な確率',
  colSeen: '今回',
  colExact: '厳密値',
  feedName: ['L', 'R'],
  feedAria: ['左のレールにメダルを入れる', '右のレールにメダルを入れる'],
  feedHint: (key) => `押し続けると連続で入ります。キー: ${key}`,
  aimLabel: ['左のレールの狙い', '右のレールの狙い'],
  keysNote: 'キー操作: FとJで左右のレールにメダルを入れます（同時に押せます）。SとDで左のレール、KとLで右のレールの狙いを動かします。',
  soundSettings: '音の設定',
  volume: '音量',
  volumeMark: (percent) => (percent === 0 ? '無音' : percent === 100 ? '標準' : ''),
  volumeValue: (percent) => (percent === 0 ? '0%（無音）' : percent === 100 ? '100%（標準）' : `${percent}%`),
  music: 'BGM',
  arcade: '店内の音',
  arcadeHint: 'まわりの台のメダルの音や、店内のざわめき',
  chanceTitle: 'チャンスタイム',
  chanceLeft: (spins) => `あと${spins}回`,
  sayChance: 'チャンスタイム。保留が満杯です。チャッカーの羽根が開いてメダルを寄せ、ここから保留される抽選はすべて金の抽選になります。金の抽選は、すごろくと宝箱の払い出しが2倍になります。',
  sayChanceEnd: 'チャンスタイム終了。',
  chanceOddsTitle: 'チャンスタイム',
  chanceOddsBody: (held, times) =>
    `保留が${held}回分たまっているときに次のメダルがチャッカーを通ると、新しい抽選は始まらず、保留中の抽選が1つ金色に変わります。ここからチャンスタイムです。チャンスタイムのあいだは、チャッカーの羽根が開きます。羽根は縁の下の斜面についた板で、外へ開いて、斜面を滑ってくるメダルをチャッカーのほうへ寄せます。そのためメダルが入りやすくなり、保留されたメダルはすべて金の抽選になります。保留が満杯のときに通ったメダルは、金色でない保留が残っていれば、それを1つ金色に変えます。最後の金の抽選が回り終わると、チャンスタイムは終わります。金の抽選はほかの抽選より先に回り、リールも速く止まります。抽選の確率はふつうの抽選と同じです。当たったときのすごろくのマスと宝箱の払い出しが${times}倍になり、ボールはボールのままです。`,
  chanceCaption: 'ジャックポットの大きさごとの、ふつうの抽選と金の抽選の平均払い出し',
  colChanceValue: '金の抽選1回の平均払い出し',
  colChanceMore: 'ふつうの抽選との差',
  chanceOddsNote: (more) =>
    `満杯の保留で金色に変わった抽選1回には、チャッカーを通ったメダルが2枚かかっています。保留されていた1枚と、それを金色に変えた1枚です。金の抽選はふつうの抽選より${more}枚多く払い出しますが、保留に空きがあればその2枚は抽選2回になっていたので、それには及びません。満杯にして得られるのは、そのあとのチャンスタイムです。羽根がメダルをチャッカーへ寄せ、そのあいだに保留された抽選は、メダル1枚で金の抽選になります。「シミュレーション」タブで実測すると、両方のボタンを押し続けたときに戻ってくるのは約94%で、中央に毎秒2枚ずつ落とす場合を少し下回ります。`,
  colGold: '金の抽選',
  feelLabel: '遊び方の設定',
  swing: 'スイング',
  swingHint: 'レールが自動で左右に振れます。LとRを押すタイミングだけで狙います。スライダーかフィールドに触れると、手動の狙いに戻ります。',
  swingNote: 'スイング中: レールが自動で振れます。スライダーの上の▼が落としたい位置に来たら、LかRを押します。',
  saySwingOn: 'スイングをオンにしました。レールが左右に振れています。LかRを押してメダルを入れてください。',
  saySwingOff: 'スイングをオフにしました。',
  saySwingTaken: 'スイングをオフにしました。手動で狙います。',
  vibration: '振動',
  vibrationHint: 'メダルを入れたときや当たったときに、スマートフォンが振動します。',
  fullscreen: '全画面',
  fullscreenHint: '筐体と操作パネルを画面いっぱいに表示します。',
  sayDrop: (bowl, bowls) =>
    bowl === bowls ? 'ボールが穴を抜けて、最後の段のクルーンに落ちました。穴はジャックポットだけです。' : `ボールが穴を抜けて、${bowls}段のうち${bowl}段目のクルーンに落ちました。`,
  colInBowl: 'その段での確率',
  colOverall: '全体での確率',
  bowlHead: (bowl, holes) => `${bowl}段目：穴${holes}つ`,
  holeShare: (count, holes) => (holes === 1 ? 'この段の穴はこれだけ' : `${holes}つの穴のうち${count}つ`),
  holeDown: '下の段へ進む穴',
  holeDownPaid: 'まだ払い出しなし（ボールは下の段で転がり続けます）',
  bowlPaid: (poured, towers) => `${poured}枚がフィールドに降り、プッシャーの上にタワー${towers}本`,
  jewelLamps: (lit, of) => `宝石ランプ：${of}個中${lit}個点灯`,
  sayJewelDrop: '宝石がハッチから下のテーブルに飛んできました。',
  sayJewel: (medals, lit, of) => `宝石が手前の端から落ちました。メダル${medals}枚。宝石ランプは${of}個中${lit}個点灯しています。`,
  sayJewelBonus: (medals, of) => `宝石が手前の端から落ちて、${of}個そろいました。宝石ボーナス：メダル${medals}枚がタワーとして積まれ、ランプは消えます。`,
  paysJewel: '3つの宝箱から1つ選ぶ＋宝石1個',
  jewelTitle: '宝石',
  jewelIntro: (lamps) =>
    `宝箱チャンスのそろい目が出ると、宝石も1個出てきます。宝石はメダルくらいの大きさの、カットされた石で、ハッチからプッシャーを越えて、下のテーブルの中央あたりに飛んできます。メダルと同じように押されて進みますが、上にも下にもメダルは重なりません。背が高いので、開いている両脇も通りません。出口は手前の端だけです。そこから落ちると獲得となり、テーブルの手前にある${lamps}個の宝石ランプが1つ点灯します。`,
  jewelCaption: 'セットの何個目の宝石がいくら払うか',
  colJewel: 'セットの何個目',
  jewelEarly: (to) => `1〜${to}個目`,
  jewelLast: (of) => `${of}個目：宝石ボーナス（ランプは消える）`,
  jewelPrizeEach: (medals) => `各${medals}枚`,
  jewelNote: (perThousand, sum, set, average, perSpin, start) =>
    `宝石は宝箱チャンスのそろい目のたびに1個出るので、抽選1,000回につき${perThousand}個です。1セットの払い出しは ${sum} = ${set}枚、つまり宝石1個あたり${average}枚、抽選1回あたり${perSpin}枚です。この分は、最初の表の宝箱のそろい目の「平均の価値」と、下の「抽選1回の価値」に含めてあります。金の抽選で宝箱チャンスがそろったときも、出てくる宝石は1個で、宝石の払い出しは変わりません。チャンスタイムで2倍になるのは宝箱で、宝石ではありません。宝石は失われません。出てきた宝石はいずれ必ず獲得できるので、この数字は正確です。払い出されたメダルがその後どうなるかは、ほかのメダルと同じくフィールドしだいです。新しいマシンには最初から宝石が${start}個置いてありますが、ここの数字には入れていません。`,
  sayLucky: 'メダルが斜面を滑って、光っているチャッカーに入りました。金の抽選です。',
  luckyOddsNote: (ordinary, gold, seconds) =>
    `ラッキーランプ：3つのチャッカーのうち1つが金色に光り、プッシャーが1往復する${seconds}秒ごとに、光が左から順にとなりのチャッカーへ移ります。光っているチャッカーを通って保留されたメダルは、その1枚ではじめから金の抽選になります。ふつうの抽選1回の価値は平均${ordinary}枚、金の抽選1回は平均${gold}枚です。ランプに合わせて狙うことはできません。メダルがレールから縁に着くまでには30秒以上かかり、そのあいだに光は何度も移るからです。メダルが着いたときにどのチャッカーが光っているかは、運しだいです。`,
};

export const getStrings = (language: GameLanguage): PusherStrings => (language === 'ja' ? ja : en);
