import { NOT_MONEY } from '../MedalCenter/strings';
import type { BetId, BetInfo, Dice, Face, RollKind } from './engine';

/**
 * Every word Moonlit Sic Bo shows, in English and Japanese.
 *
 * Medals are not money, and nothing here may read as money (no bank,
 * deposit, withdraw, balance, cash, wager, payout or $; no 預け, 残高, お金,
 * 換金, 賭け): the medals are "your medals" / 「持ちメダル」, and `notMoney`
 * says outright that they are not money.
 */

/** The layout's sections, as a phone shows them one at a time. */
export type Section = 'bigSmall' | 'triples' | 'totals' | 'pairs' | 'singles';
export const SECTIONS: readonly Section[] = ['bigSmall', 'triples', 'totals', 'pairs', 'singles'];

const enDice = (dice: Dice) => dice.join(' · ');
const jaDice = (dice: Dice) => dice.join('・');
const enMedals = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'medal' : 'medals'}`;

const enArea = (info: BetInfo): string => {
  switch (info.kind) {
    case 'small':
      return 'Small';
    case 'big':
      return 'Big';
    case 'any-triple':
      return 'Any triple';
    case 'triple':
      return `Triple ${info.face}s`;
    case 'double':
      return `Double ${info.face}s`;
    case 'total':
      return `Total ${info.total}`;
    case 'pair':
      return `${info.pair![0]} and ${info.pair![1]}`;
    case 'single':
      return `Single ${info.face}`;
  }
};
const jaArea = (info: BetInfo): string => {
  switch (info.kind) {
    case 'small':
      return '小';
    case 'big':
      return '大';
    case 'any-triple':
      return 'ゾロ目どれでも';
    case 'triple':
      return `${info.face}のゾロ目`;
    case 'double':
      return `${info.face}のダブル`;
    case 'total':
      return `合計${info.total}`;
    case 'pair':
      return `${info.pair![0]}と${info.pair![1]}`;
    case 'single':
      return `${info.face}の目`;
  }
};

const en = {
  title: 'Moonlit Sic Bo',
  /** The title in the pieces it may be broken between on a narrow screen. */
  titleParts: ['Moonlit', 'Sic Bo'],
  subtitle: 'Three dice under a glass dome: put medals on the layout, shake, and every area the dice win lights up.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabTable: 'Table',
  tabOdds: 'Odds',
  sign: 'SIC BO',
  signSub: '月夜の大小',
  domeLabel: (state: string) => `The dice dome: ${state}`,
  domeIdle: (dice: Dice) => `the dice show ${enDice(dice)}`,
  domeShaking: 'shaking',
  medals: 'MEDALS',
  bet: 'BET',
  win: 'WIN',
  layoutTitle: 'Put medals on the layout',
  areaName: (info: BetInfo) => enArea(info),
  areaAria: (info: BetInfo, pays: string, onIt: number) => `${enArea(info)}, pays ${pays}: ${onIt} ${onIt === 1 ? 'medal' : 'medals'} on it`,
  smallRange: '4 to 10',
  bigRange: '11 to 17',
  losesOnTriples: 'loses on triples',
  anyTriple: 'ANY TRIPLE',
  singleRule: 'pays 1:1 a die',
  /** The phone's section picker: each section's name, and what it holds. */
  sectionGroup: 'Part of the layout',
  sectionName: { bigSmall: 'Small and Big', triples: 'Doubles and triples', totals: 'Totals', pairs: 'Two-dice combinations', singles: 'Single numbers' } as Record<Section, string>,
  sectionNote: {
    bigSmall: 'Small 4–10 · Big 11–17 · Any triple',
    triples: 'Doubles 10:1 · Triples 180:1',
    totals: 'The three dice’s total, 4 to 17',
    pairs: 'Two different numbers, 5:1',
    singles: 'One number: 1:1 for each die',
  } as Record<Section, string>,
  sectionMedals: (n: number) => (n > 0 ? `${n} on it` : ''),
  stepGroup: 'Medals a tap',
  stepAria: (step: number) => `${step} ${step === 1 ? 'medal' : 'medals'} a tap`,
  shake: 'SHAKE',
  skip: 'Skip',
  clear: 'Clear',
  rebet: 'Same bets',
  undo: 'Undo',
  status: {
    idle: 'Put medals on the layout, then SHAKE.',
    ready: (total: number) => `${enMedals(total)} on the layout. SHAKE!`,
    shake: 'The dome is shaking…',
    settle: 'The dice are coming to rest…',
  },
  kindWord: { small: 'SMALL', big: 'BIG', triple: 'TRIPLE' } as Record<RollKind, string>,
  banner: (dice: Dice, total: number, kind: RollKind) => (kind === 'triple' ? `TRIPLE ${dice[0]}` : `${total} ${kind === 'big' ? 'BIG' : 'SMALL'}`),
  resultWin: (dice: Dice, total: number, kind: RollKind, won: number) =>
    `${enDice(dice)}: ${kind === 'triple' ? `triple ${dice[0]}s` : `${total}, ${kind}`}. ${enMedals(won)} back!`,
  resultLose: (dice: Dice, total: number, kind: RollKind) => `${enDice(dice)}: ${kind === 'triple' ? `triple ${dice[0]}s` : `${total}, ${kind}`}. Nothing back this time.`,
  outOfMedals: 'No medals left.',
  notEnough: 'Not enough medals for that.',
  spotFull: (max: number) => `An area holds ${max} medals at most.`,
  noneLeft: 'All your medals are on the layout.',
  rebetShort: 'Not enough medals for the same bets.',
  notKept: 'This browser could not keep the table, so nothing was changed.',
  refill: (medals: number) => `Out of medals — take ${medals} more`,
  cardAway: 'Your medals are in a machine in another tab.',
  playHere: 'Play here',
  keysHint: 'Keys: Space or Enter shakes · S skips · R same bets · U undo · C clears',
  notMoney: NOT_MONEY.en,
  centerNote: 'Your medals are the Medal Game Center’s, shared by every machine there.',
  centerNoteLink: 'Daily bonus and refills at the front',
  // The board of results
  boardTitle: 'Last 20 rolls',
  boardEmpty: 'No rolls yet.',
  boardEntry: (dice: Dice, total: number, kind: RollKind) => `${enDice(dice)}, ${kind === 'triple' ? 'triple' : `${total} ${kind}`}`,
  boardCounts: (big: number, small: number, triples: number) => `Big ${big} · Small ${small} · Triples ${triples}`,
  facesTitle: 'Each number, last 20 rolls',
  faceCount: (face: Face, n: number) => `${face}: ${n}`,
  lastTitle: 'Last roll',
  lastNone: 'No bets settled yet.',
  lastWon: (back: number) => `+${back.toLocaleString('en-US')}`,
  lastLost: 'lost',
  statsTitle: 'This table',
  rolls: 'Rolls',
  played: 'Medals played',
  won: 'Medals won',
  net: 'Net',
  biggest: 'Biggest win',
  triples: 'Triples',
  cameBack: 'Came back',
  bestReturn: 'Best area’s return',
  sayShake: (total: number) => `${enMedals(total)} on the layout. The dome shakes.`,
  sayRestart: 'The medals were reset at the medal center: the table starts over.',
  sayRefill: (medals: number) => `${medals} medals added.`,
  infoBody: (most: number) => [
    'Put medals on any area of the layout: a tap adds the medals you choose (1, 5, 10 or 50), up to 99 on an area. Press SHAKE and the three dice are shaken under the glass dome until they come to rest.',
    'Every area the dice win lights up, and pays: Small (a total of 4 to 10) and Big (11 to 17) 1 to 1, both losing on a triple; a total 6 to 1 up to 60 to 1; a double 10 to 1; a triple of your number 180 to 1; any triple 30 to 1; a combination of two numbers 5 to 1; and a single number 1 to 1 for each die that shows it. The medals on a winning area come back too.',
    'The bets are settled on every roll and the layout is cleared; Same bets puts the last roll’s bets back. Bets left on the layout stay there through a reload, with their medals.',
    `Where the dice land is drawn the moment you press SHAKE; the dome only shows it, and Skip goes straight to the end. The paytable is a real casino’s (Atlantic City), and no area brings back more than it takes: Small and Big bring back the most, 97.2%. One roll can bring back at most ${most.toLocaleString('en-US')} medals. The Odds tab shows every figure.`,
    NOT_MONEY.en,
  ],
  // ── The Odds tab ──
  oddsIntro: [
    'Every figure here is worked out exactly over the 216 equally likely ways three dice can fall, and checked by adding them all up.',
    'The paytable is one a real casino uses: the Atlantic City table, as the Wizard of Odds lists it. Every area brings back less than the medals put on it, as at a real table.',
  ],
  bestLabel: 'Best return: Small or Big',
  bestNote: (num: number, den: number) => `${num}/${den} of every medal`,
  leastLabel: 'Least: a total of 9 or 12',
  tripleLabel: 'A triple, a roll',
  tripleNote: 'once in 36 rolls',
  drawsTitle: 'How a roll is drawn',
  draws: [
    'Three random numbers are drawn the moment SHAKE is pressed, one for each die, in order.',
    'Each die shows any of its six numbers as likely as any other, so the 216 ways three dice can fall are all equally likely.',
    'The dome shows the roll that was drawn: the dice are shaken by a small physics model that comes to rest on those three numbers.',
  ],
  areasTitle: 'Every area',
  colArea: 'Area',
  colPays: 'Pays',
  colWins: 'Wins, of 216',
  colChance: 'Chance',
  colReturn: 'Return',
  colKeeps: 'Kept',
  colSpread: 'σ',
  rowName: (group: string) => group,
  groups: {
    smallBig: 'Small or Big',
    total: (a: number, b: number) => `Total ${a} or ${b}`,
    triple: 'A triple (one number)',
    anyTriple: 'Any triple',
    double: 'A double',
    pair: 'A combination',
    single: 'A single number',
  },
  singleNote: (one: number, two: number, three: number) =>
    `A single number: on one die in ${one} of the 216 rolls (1:1), on two in ${two} (2:1), on all three in ${three} (3:1). It brings back 199/216.`,
  spreadNote: 'σ: how far what one medal brings back spreads round its average on a roll. Small and Big are steady; a triple swings, and takes far more rolls to settle near its return.',
  sourceTitle: 'Where the paytable comes from',
  source: [
    'The Wizard of Odds lists the Sic Bo paytables of Macau, Atlantic City and Australia, with each bet’s house edge. This table uses Atlantic City’s, figure for figure.',
    'Macau’s pays less on several bets: a total of 5 or 16 pays 18 to 1 there (the house keeps 47.2%), a triple 150 to 1, any triple 24 to 1 and a double 8 to 1.',
  ],
  sourceLink: 'Wizard of Odds: Sic Bo',
  checkTitle: 'Check it',
  checkButton: 'Roll 100,000 times',
  checkRunning: 'Rolling…',
  checkResult: (rolls: string) => `${rolls} rolls, one medal on each of these every roll:`,
  checkTriples: (seen: string, expected: string) => `Triples: ${seen} (exactly: ${expected})`,
};

export type SicBoStrings = typeof en;

const ja: SicBoStrings = {
  title: '月夜のシックボー',
  titleParts: ['月夜の', 'シックボー'],
  subtitle: 'ガラスのドームで3つのサイコロを振る大小のテーブル。レイアウトにメダルを置いてシェイクすると、当たったエリアが光ります。',
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabTable: 'テーブル',
  tabOdds: '確率',
  sign: 'SIC BO',
  signSub: '月夜の大小',
  domeLabel: (state) => `サイコロのドーム：${state}`,
  domeIdle: (dice) => `出目は${jaDice(dice)}`,
  domeShaking: 'シェイク中',
  medals: '持ちメダル',
  bet: 'ベット',
  win: '獲得',
  layoutTitle: 'レイアウトにメダルを置く',
  areaName: (info) => jaArea(info),
  areaAria: (info, pays, onIt) => `${jaArea(info)}（${pays}）：${onIt}枚`,
  smallRange: '4〜10',
  bigRange: '11〜17',
  losesOnTriples: 'ゾロ目は負け',
  anyTriple: 'ゾロ目どれでも',
  singleRule: '1個につき1:1',
  sectionGroup: 'レイアウトの場所',
  sectionName: { bigSmall: '小と大', triples: 'ダブルとゾロ目', totals: '合計', pairs: '2つの目', singles: '1つの目' },
  sectionNote: {
    bigSmall: '小 4〜10・大 11〜17・ゾロ目どれでも',
    triples: 'ダブル10:1・ゾロ目180:1',
    totals: '3つのサイコロの合計、4〜17',
    pairs: 'ちがう2つの目、5:1',
    singles: '1つの目、出たサイコロ1個につき1:1',
  },
  sectionMedals: (n) => (n > 0 ? `${n}枚` : ''),
  stepGroup: '1タップの枚数',
  stepAria: (step) => `1タップ${step}枚`,
  shake: 'シェイク',
  skip: 'スキップ',
  clear: 'クリア',
  rebet: '同じベット',
  undo: '戻す',
  status: {
    idle: 'メダルを置いて、シェイク！',
    ready: (total) => `レイアウトに${total}枚。シェイク！`,
    shake: 'ドームをシェイク中…',
    settle: 'サイコロが止まります…',
  },
  kindWord: { small: '小', big: '大', triple: 'ゾロ目' },
  banner: (dice, total, kind) => (kind === 'triple' ? `${dice[0]}のゾロ目` : `${total} ${kind === 'big' ? '大' : '小'}`),
  resultWin: (dice, total, kind, won) => `${jaDice(dice)}：${kind === 'triple' ? `${dice[0]}のゾロ目` : `合計${total}、${kind === 'big' ? '大' : '小'}`}。${won.toLocaleString('ja-JP')}枚！`,
  resultLose: (dice, total, kind) => `${jaDice(dice)}：${kind === 'triple' ? `${dice[0]}のゾロ目` : `合計${total}、${kind === 'big' ? '大' : '小'}`}。今回は当たりなし。`,
  outOfMedals: '持ちメダルがありません。',
  notEnough: '持ちメダルが足りません。',
  spotFull: (max) => `1つのエリアに置けるのは${max}枚までです。`,
  noneLeft: '持ちメダルはすべてレイアウトの上です。',
  rebetShort: '同じベットには持ちメダルが足りません。',
  notKept: 'このブラウザーにテーブルを記録できなかったので、何も変えていません。',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  cardAway: '持ちメダルは別のタブのマシンで使われています。',
  playHere: 'ここで遊ぶ',
  keysHint: 'キー：Space か Enter でシェイク・S でスキップ・R で同じベット・U で戻す・C でクリア',
  notMoney: NOT_MONEY.ja,
  centerNote: '持ちメダルはメダルゲームセンターのもので、すべてのマシンで共通です。',
  centerNoteLink: 'デイリーボーナスと補充は入口で',
  boardTitle: '直近20回の結果',
  boardEmpty: 'まだ振っていません。',
  boardEntry: (dice, total, kind) => `${jaDice(dice)}、${kind === 'triple' ? 'ゾロ目' : `合計${total} ${kind === 'big' ? '大' : '小'}`}`,
  boardCounts: (big, small, triples) => `大 ${big}・小 ${small}・ゾロ目 ${triples}`,
  facesTitle: '目の出た数（直近20回）',
  faceCount: (face, n) => `${face}：${n}`,
  lastTitle: '前回のロール',
  lastNone: 'まだ決まったベットはありません。',
  lastWon: (back) => `+${back.toLocaleString('ja-JP')}`,
  lastLost: '負け',
  statsTitle: 'このテーブル',
  rolls: 'ロール数',
  // The figures' labels carry their phrase breaks (U+200B, a zero-width space): Safari and Firefox have no
  // `word-break: auto-phrase`, and under keep-all a label breaks only where its words say (「いちばん｜戻る｜エリア」).
  played: '使った\u200bメダル',
  won: '当たった\u200bメダル',
  net: '差し引き',
  biggest: '最大の\u200b当たり',
  triples: 'ゾロ目',
  cameBack: '戻った\u200b割合',
  bestReturn: 'いちばん\u200b戻る\u200bエリア',
  sayShake: (total) => `レイアウトに${total}枚。ドームをシェイクします。`,
  sayRestart: 'メダルゲームセンターでメダルがリセットされました。テーブルも最初からです。',
  sayRefill: (medals) => `${medals}枚を補充しました。`,
  infoBody: (most) => [
    'レイアウトの好きなエリアにメダルを置きます。1タップで選んだ枚数（1・5・10・50枚）、1つのエリアに99枚まで。シェイクを押すと、ガラスのドームの中で3つのサイコロが振られて止まります。',
    '当たったエリアはすべて光り、メダルが戻ります：小（合計4〜10）と大（11〜17）は1:1で、どちらもゾロ目では負け。合計は6:1〜60:1、ダブルは10:1、選んだ数のゾロ目は180:1、ゾロ目どれでもは30:1、2つの目の組み合わせは5:1、1つの目は出たサイコロ1個につき1:1。当たったエリアに置いたメダルも戻ります。',
    'ベットは毎回のロールで決まり、レイアウトは空になります。「同じベット」で前回と同じベットを置き直せます。レイアウトに置いたままのベットは、再読み込みしてもメダルごとそのまま残ります。',
    `出目はシェイクを押した瞬間に決まり、ドームはそれを見せているだけです。スキップで結果まで飛ばせます。倍率表は実際のカジノのもの（アトランティックシティ）で、置いたメダルより多く戻るエリアはありません。いちばん戻るのは小と大で97.2％。1回のロールで戻るのは最大${most.toLocaleString('ja-JP')}枚です。数字はすべて「確率」タブにあります。`,
    NOT_MONEY.ja,
  ],
  oddsIntro: [
    'ここの数字はすべて、3つのサイコロの出方216通り（どれも同じ確率）から正確に計算し、すべて足し合わせて確かめています。',
    '倍率表は実際のカジノが使っているもの：Wizard of Odds が載せているアトランティックシティの表です。実際のテーブルと同じく、どのエリアも置いたメダルより少なく戻ります。',
  ],
  bestLabel: 'いちばん戻る：小か大',
  bestNote: (num, den) => `使ったメダルの${num}/${den}`,
  leastLabel: 'いちばん少ない：合計9か12',
  tripleLabel: 'ゾロ目（1ロール）',
  tripleNote: '36回に1回',
  drawsTitle: '出目の決まり方',
  draws: [
    'シェイクを押した瞬間に乱数を3つ、サイコロ1個に1つずつ、順に引きます。',
    'どのサイコロも6つの目が同じ確率で出るので、3つのサイコロの出方216通りはどれも同じ確率です。',
    'ドームは決まった出目を見せています。サイコロは小さな物理モデルで振られ、その3つの目で止まります。',
  ],
  areasTitle: 'エリアごと',
  colArea: 'エリア',
  colPays: '倍率',
  colWins: '216通り中',
  colChance: '確率',
  colReturn: '戻り',
  colKeeps: '取り分',
  colSpread: 'σ',
  rowName: (group) => group,
  groups: {
    smallBig: '小か大',
    total: (a, b) => `合計${a}か${b}`,
    triple: 'ゾロ目（数を選ぶ）',
    anyTriple: 'ゾロ目どれでも',
    double: 'ダブル',
    pair: '2つの目',
    single: '1つの目',
  },
  singleNote: (one, two, three) => `1つの目：216通りのうち、1個に出るのが${one}通り（1:1）、2個が${two}通り（2:1）、3個すべてが${three}通り（3:1）。戻りは199/216です。`,
  spreadNote: 'σは、メダル1枚の戻りが1ロールで平均のまわりにどれだけばらつくか。小と大は安定、ゾロ目は大きく振れ、戻りに近づくまでずっと多くのロールがかかります。',
  sourceTitle: '倍率表の出どころ',
  source: [
    'Wizard of Odds は、マカオ、アトランティックシティ、オーストラリアのシックボーの倍率表を、ベットごとのハウスエッジとともに載せています。このテーブルはアトランティックシティの表をそのまま使っています。',
    'マカオの表はいくつかのベットで倍率が低く、合計5か16は18:1（ハウスの取り分47.2％）、ゾロ目は150:1、ゾロ目どれでもは24:1、ダブルは8:1です。',
  ],
  sourceLink: 'Wizard of Odds：シックボー',
  checkTitle: '確かめる',
  checkButton: '10万回ロール',
  checkRunning: 'ロール中…',
  checkResult: (rolls) => `${rolls}ロール、毎回それぞれに1枚ずつ：`,
  checkTriples: (seen, expected) => `ゾロ目：${seen}（正確な値：${expected}）`,
};

export const getStrings = (language: 'en' | 'ja'): SicBoStrings => (language === 'ja' ? ja : en);

/** An area's name in the page's language. */
export const areaNameOf = (t: SicBoStrings, info: BetInfo): string => t.areaName(info);

/** The ids of an area kind, for the strings' tests. */
export type { BetId };
