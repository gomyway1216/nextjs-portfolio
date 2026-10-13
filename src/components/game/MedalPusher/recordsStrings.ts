/**
 * Local ja/en strings for the Medal Pusher's daily bonus and record book, consumed via useGameLanguage().
 * They are kept apart from the cabinet's own strings so that the two can grow without getting in each other's way.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { AchievementId, Day } from './records';

/** The numbers the achievements' conditions quote, so that the words follow the game's own tables. */
export interface AchievementNumbers {
  hold: number;
  chest: number;
  run: number;
  medals: number;
  days: number;
}

/** The rows of the record board, in the order it lists them under each heading. */
export const BOARD_ROWS = {
  medals: ['fed', 'won', 'lost', 'return', 'bonus', 'refills'],
  slot: ['hits', 'wasted', 'fulls', 'spins', 'reaches', 'reachWins', 'supers', 'superWins', 'small', 'big', 'seven'],
  games: ['fevers', 'chests', 'topChests', 'towers', 'balls', 'run', 'challenges', 'jackpots', 'jackpot', 'prize'],
  days: ['days', 'streakNow', 'streak', 'claims'],
} as const;
export type BoardGroup = keyof typeof BOARD_ROWS;
export type BoardRow = (typeof BOARD_ROWS)[BoardGroup][number];
export const BOARD_GROUPS = Object.keys(BOARD_ROWS) as BoardGroup[];

export interface RecordStrings {
  // The bonus, beside the cabinet and on its card
  bonusTitle: string;
  bonusWaiting: string;
  bonusReady: (square: number, medals: number) => string;
  bonusRestarted: string;
  bonusTake: (medals: number) => string;
  /** What the button's name goes on to say to someone who cannot see where it is. */
  bonusTakeMore: string;
  bonusTaken: (medals: number) => string;
  bonusTomorrow: (medals: number) => string;
  bonusNewCard: (medals: number) => string;
  bonusLater: (date: string, medals: number) => string;
  bonusNoDay: string;
  bonusNotKept: string;
  bonusNoMachine: string;
  pipsAria: (stamped: number, squares: number) => string;

  // The stamp card
  cardTitle: string;
  cardLead: (week: number) => string;
  dayN: (square: number) => string;
  today: string;
  medals: (medals: number | string) => string;
  squareBlank: (square: number, medals: number) => string;
  squareToday: (square: number, medals: number) => string;
  squareStamped: (square: number, medals: number, date: string) => string;
  cardNote: string;
  clockNote: string;

  // The record board
  boardTitle: string;
  boardLead: string;
  bigWon: string;
  bigReturn: string;
  bigPrize: string;
  bigJackpots: string;
  group: Record<BoardGroup, string>;
  row: Record<BoardRow, string>;
  inARow: (count: number | string) => string;
  times: (count: number | string) => string;
  daysCount: (count: number | string) => string;
  topChestRow: (medals: number) => string;
  none: string;

  // The achievements
  sheetTitle: string;
  sheetCount: (earned: number, all: number) => string;
  achievement: (numbers: AchievementNumbers) => Record<AchievementId, { name: string; how: string }>;
  stampedOn: (date: string) => string;
  notYet: string;
  toastTitle: string;
  sayStamp: (name: string) => string;

  // Keeping and clearing
  keptNote: string;
  notKeptNote: string;
  clear: string;
  clearConfirm: string;
  clearNote: string;
  sayCleared: string;
  sayClearOff: string;

  /** A day written out in full. */
  date: (day: Day) => string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A day's year, month and day of the month. It is read off the text itself, so no time zone comes into it. */
const parts = (day: Day): [number, number, number] => [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];

const en: RecordStrings = {
  bonusTitle: 'DAILY BONUS',
  bonusWaiting: 'Looking at your stamp card…',
  bonusReady: (square, medals) => `Day ${square} is ready: ${medals} medals.`,
  bonusRestarted: 'A day was missed, so this is a new card.',
  bonusTake: (medals) => `TAKE +${medals}`,
  bonusTakeMore: ' medals: today’s daily bonus',
  bonusTaken: (medals) => `Stamped today: +${medals} medals.`,
  bonusTomorrow: (medals) => `Tomorrow: +${medals}.`,
  bonusNewCard: (medals) => `The card is full! A new one starts tomorrow: +${medals}.`,
  bonusLater: (date, medals) => `The card is stamped ahead of today. The next bonus is on ${date}: +${medals}.`,
  bonusNoDay: 'This device’s date is off the calendar, so there is no bonus today.',
  bonusNotKept: 'No daily bonus here: this browser is not keeping the record book.',
  bonusNoMachine: 'The machine is not running, so there is nowhere to pay today’s bonus.',
  pipsAria: (stamped, squares) => `${stamped} of ${squares} stamped`,

  cardTitle: 'Daily stamp card',
  cardLead: (week) =>
    `One stamp a day, and medals with each. Every day in a row gives more, day ${week} gives the most, and then a new card begins. Miss a day and the card starts again.`,
  dayN: (square) => `DAY ${square}`,
  today: 'TODAY',
  medals: (medals) => `+${medals}`,
  squareBlank: (square, medals) => `Day ${square}: ${medals} medals.`,
  squareToday: (square, medals) => `Day ${square}: ${medals} medals. Ready today.`,
  squareStamped: (square, medals, date) => `Day ${square}: ${medals} medals. Stamped ${date}.`,
  cardNote:
    'Bonus medals are free. They go straight into your medals and are not counted as fed, won or paid, so they change no return on this page: not the machine’s, not the lifetime one below, and not the odds.',
  clockNote:
    'A day is a day on this device’s own calendar and changes at its midnight. Each day is stamped once: putting the clock forward takes that day’s stamp early, and then nothing is ready until the day after it really comes.',

  boardTitle: 'Record board',
  boardLead: 'Everything you have done at this cabinet, on every machine. Resetting the machine does not touch it.',
  bigWon: 'MEDALS WON',
  bigReturn: 'RETURN',
  bigPrize: 'BIGGEST PRIZE',
  bigJackpots: 'JACKPOTS',
  group: { medals: 'Medals', slot: 'The slot', games: 'Games and prizes', days: 'Days' },
  row: {
    fed: 'Medals fed',
    won: 'Won over the front',
    lost: 'Lost out of the sides',
    return: 'Lifetime return',
    bonus: 'Bonus medals taken',
    refills: 'Refills taken',
    hits: 'Medals through a START pocket',
    wasted: 'Of those, lost to a full hold',
    fulls: 'Times the hold filled up',
    spins: 'Spins',
    reaches: 'Reaches seen',
    reachWins: 'Reaches that hit',
    supers: 'Super reaches seen',
    superWins: 'Super reaches that hit',
    small: 'Sugoroku lines (even digits)',
    big: 'Treasure lines (odd digits)',
    seven: 'Three sevens',
    fevers: 'Fever squares',
    chests: 'Chests opened',
    topChests: 'Chests that held the most',
    towers: 'Towers pushed over the lip',
    balls: 'Prize balls over the front',
    run: 'Longest roulette run',
    challenges: 'Jackpot challenges',
    jackpots: 'Jackpots won',
    jackpot: 'Biggest jackpot',
    prize: 'Biggest prize from one game',
    days: 'Days played',
    streakNow: 'Days in a row, now',
    streak: 'Longest run of days',
    claims: 'Daily bonuses taken',
  },
  inARow: (count) => `${count} in a row`,
  times: (count) => `${count}`,
  daysCount: (count) => `${count}`,
  topChestRow: (medals) => `Chests that held ${medals}`,
  none: '—',

  sheetTitle: 'Achievement stamps',
  sheetCount: (earned, all) => `${earned} of ${all} stamped`,
  achievement: ({ hold, chest, run, medals, days }) => ({
    firstLine: { name: 'First Line', how: 'Line up three digits on the slot.' },
    holdFull: { name: 'Full Hold', how: `Fill the hold: ${hold} spins waiting.` },
    superWin: { name: 'Super Reach!', how: 'Win a spin that showed a super reach.' },
    fever: { name: 'Fever', how: 'Land on the sugoroku board’s fever square.' },
    treasure: { name: 'Treasure Eye', how: `Open the chest that holds ${chest}.` },
    tower: { name: 'Timber!', how: 'Push a medal tower over the lip.' },
    sevens: { name: 'Triple Seven', how: 'Line up 7·7·7.' },
    ball: { name: 'Ball Out', how: 'Push a prize ball over the front.' },
    fullRun: { name: 'Perfect Run', how: `Hit ${run} numbers in a row on the roulette.` },
    jackpot: { name: 'Jackpot!', how: 'Win the jackpot.' },
    thousand: { name: 'Thousand Club', how: `Win ${medals.toLocaleString('en-US')} medals in all.` },
    week: { name: 'Regular', how: `Play ${days} days in a row.` },
  }),
  stampedOn: (date) => `Stamped ${date}`,
  notYet: 'Not yet',
  toastTitle: 'STAMP!',
  sayStamp: (name) => `Achievement stamped: ${name}.`,

  keptNote: 'The record book is kept on this device, apart from the machine.',
  notKeptNote: 'This browser is not keeping the record book: it lasts until the page is closed, and there is no daily bonus.',
  clear: 'Clear the records',
  clearConfirm: 'Press again to clear the records',
  clearNote: 'Clearing wipes the board and the achievement stamps. The daily stamp card stays, so clearing is not a way to take a day’s bonus twice.',
  sayCleared: 'The records have been cleared.',
  sayClearOff: 'The records were not cleared.',

  date: (day) => {
    const [year, month, date] = parts(day);
    return `${MONTHS[month - 1] ?? '?'} ${date}, ${year}`;
  },
};

const ja: RecordStrings = {
  bonusTitle: 'デイリーボーナス',
  bonusWaiting: 'スタンプカードを確認しています…',
  bonusReady: (square, medals) => `${square}日目のボーナスを受け取れます: ${medals}枚`,
  bonusRestarted: '1日あいたので、新しいカードになりました。',
  bonusTake: (medals) => `受け取る +${medals}`,
  bonusTakeMore: '枚: 今日のデイリーボーナス',
  bonusTaken: (medals) => `今日のスタンプ済み: +${medals}枚`,
  bonusTomorrow: (medals) => `明日は +${medals}枚`,
  bonusNewCard: (medals) => `カードがいっぱいになりました！ 明日から新しいカード: +${medals}枚`,
  bonusLater: (date, medals) => `カードには今日より先の日付のスタンプがあります。次のボーナスは${date}: +${medals}枚`,
  bonusNoDay: 'この端末の日付がカレンダーの範囲外のため、今日のボーナスはありません。',
  bonusNotKept: 'このブラウザでは記録を保存できないため、デイリーボーナスはありません。',
  bonusNoMachine: 'マシンが動いていないため、ボーナスを受け取れません。',
  pipsAria: (stamped, squares) => `${squares}個中${stamped}個スタンプ済み`,

  cardTitle: 'デイリースタンプカード',
  cardLead: (week) =>
    `1日1回、スタンプと一緒にメダルがもらえます。続けて来るほど増え、${week}日目がいちばん多く、そのあと新しいカードになります。1日あくとカードは最初からです。`,
  dayN: (square) => `${square}日目`,
  today: '今日',
  medals: (medals) => `+${medals}`,
  squareBlank: (square, medals) => `${square}日目: ${medals}枚`,
  squareToday: (square, medals) => `${square}日目: ${medals}枚。今日受け取れます。`,
  squareStamped: (square, medals, date) => `${square}日目: ${medals}枚。${date}にスタンプ済み。`,
  cardNote:
    'ボーナスのメダルは無料です。そのまま手持ちのメダルに入り、投入・獲得・払い出しのどれにも数えません。このページの還元率（マシンの還元率、下の通算の還元率、確率の表）は変わりません。',
  clockNote:
    '1日は、この端末のカレンダーの1日で、端末の午前0時に変わります。スタンプは1日に1回だけです。時計を進めるとその日のスタンプを先に押せますが、本当にその翌日になるまで次は受け取れません。',

  boardTitle: '記録ボード',
  boardLead: 'このキャビネットで遊んだ、すべてのマシンの通算記録です。マシンをリセットしても消えません。',
  bigWon: '獲得メダル',
  bigReturn: '還元率',
  bigPrize: '最高配当',
  bigJackpots: 'ジャックポット',
  group: { medals: 'メダル', slot: 'スロット', games: 'ゲームと配当', days: '遊んだ日' },
  row: {
    fed: '投入したメダル',
    won: '手前に落として獲得',
    lost: '横から落ちたメダル',
    return: '通算の還元率',
    bonus: 'ボーナスでもらったメダル',
    refills: 'メダルを補充した回数',
    hits: 'STARTポケットを通ったメダル',
    wasted: 'うち、ホールド満杯で無効',
    fulls: 'ホールドが満杯になった回数',
    spins: '抽選した回数',
    reaches: 'リーチの回数',
    reachWins: 'リーチからの当たり',
    supers: 'スーパーリーチの回数',
    superWins: 'スーパーリーチからの当たり',
    small: 'すごろく揃い（偶数）',
    big: '宝箱揃い（奇数）',
    seven: 'スリーセブン',
    fevers: 'フィーバーマス',
    chests: '開けた宝箱',
    topChests: 'いちばん多い宝箱',
    towers: '倒したタワー',
    balls: '手前に落としたボール',
    run: 'ルーレットの最長連続',
    challenges: 'ジャックポットチャレンジ',
    jackpots: 'ジャックポット獲得',
    jackpot: '最高ジャックポット',
    prize: '1ゲームの最高配当',
    days: '遊んだ日数',
    streakNow: '現在の連続日数',
    streak: '最長の連続日数',
    claims: '受け取ったデイリーボーナス',
  },
  inARow: (count) => `${count}連続`,
  times: (count) => `${count}回`,
  daysCount: (count) => `${count}日`,
  topChestRow: (medals) => `${medals}枚入りの宝箱`,
  none: '—',

  sheetTitle: '実績スタンプ',
  sheetCount: (earned, all) => `${all}個中${earned}個`,
  achievement: ({ hold, chest, run, medals, days }) => ({
    firstLine: { name: '初ヒット', how: 'スロットで数字を3つそろえる。' },
    holdFull: { name: 'ホールド満タン', how: `ホールドを${hold}個ためる。` },
    superWin: { name: 'スーパーリーチ的中', how: 'スーパーリーチから当てる。' },
    fever: { name: 'フィーバー', how: 'すごろくのフィーバーマスに止まる。' },
    treasure: { name: 'お宝発見', how: `${chest}枚入りの宝箱を開ける。` },
    tower: { name: 'タワー倒し', how: 'メダルタワーを倒す。' },
    sevens: { name: 'スリーセブン', how: '7を3つそろえる。' },
    ball: { name: 'ボールゲット', how: '景品ボールを手前に落とす。' },
    fullRun: { name: 'パーフェクトラン', how: `ルーレットで数字を${run}回続ける。` },
    jackpot: { name: 'ジャックポット', how: 'ジャックポットを獲得する。' },
    thousand: { name: '1000枚クラブ', how: `通算${medals.toLocaleString('ja-JP')}枚を獲得する。` },
    week: { name: '常連さん', how: `${days}日続けて遊ぶ。` },
  }),
  stampedOn: (date) => `${date} 達成`,
  notYet: '未達成',
  toastTitle: 'スタンプ獲得！',
  sayStamp: (name) => `実績スタンプを獲得しました: ${name}`,

  keptNote: '記録は、マシンとは別に、この端末に保存しています。',
  notKeptNote: 'このブラウザでは記録を保存できません。ページを閉じると消え、デイリーボーナスもありません。',
  clear: '記録を消去',
  clearConfirm: 'もう一度押すと記録を消去します',
  clearNote: '消去すると記録ボードと実績スタンプが消えます。デイリースタンプカードは残るので、消去しても同じ日のボーナスを2回受け取ることはできません。',
  sayCleared: '記録を消去しました。',
  sayClearOff: '記録の消去を取りやめました。',

  date: (day) => {
    const [year, month, date] = parts(day);
    return `${year}年${month}月${date}日`;
  },
};

export const getRecordStrings = (language: GameLanguage): RecordStrings => (language === 'ja' ? ja : en);
