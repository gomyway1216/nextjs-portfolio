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
  slot: ['hits', 'wasted', 'golds', 'fulls', 'chances', 'spins', 'reaches', 'reachWins', 'supers', 'superWins', 'small', 'big', 'seven'],
  games: ['fevers', 'chests', 'topChests', 'pours', 'raised', 'towers', 'balls', 'run', 'challenges', 'jackpots', 'jackpot', 'prize'],
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
  bonusNotApart: string;
  bonusNoMachine: string;
  /** While the account is asked whether another device has taken today's bonus. */
  bonusAsking: string;
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

  // Keeping and clearing. Where the book is kept is two things, the account and this device, and there is a note for
  // every pairing of them (recordsNote.ts): the first two are a guest's, whose book is this device's alone.
  keptNote: string;
  notKeptNote: string;
  accountKeptNote: string;
  accountNotKeptNote: string;
  offlineKeptNote: string;
  offlineNotKeptNote: string;
  unreadableKeptNote: string;
  unreadableNotKeptNote: string;
  checkingKeptNote: string;
  checkingNotKeptNote: string;
  clear: string;
  clearConfirm: string;
  /** The same, for a player who is signed in: the book on their account is cleared too. */
  clearConfirmAccount: string;
  clearNote: string;
  clearNoteAccount: string;
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
  bonusNotApart: 'No daily bonus in this browser: it has no way to keep two tabs of the game from each being paid for the same day.',
  bonusNoMachine: 'The machine is not running, so there is nowhere to pay today’s bonus.',
  bonusAsking: 'Asking your account whether today’s bonus has been taken on another device…',
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
    wasted: 'Of those, found the hold full',
    golds: 'Held spins turned gold',
    fulls: 'Times the hold filled up',
    chances: 'Chance times',
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
    pours: 'Prizes poured by the hopper',
    raised: 'Towers raised on their lifts',
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
  accountKeptNote:
    'The record book is kept on your account, apart from the machine, so it follows you to your other devices: what each one has counted is added together. It is sent when a stamp is earned or the bonus is taken, and otherwise every five minutes while it is changing. This device keeps a copy, and whatever has not been sent when the page is closed goes the next time the game is opened here.',
  accountNotKeptNote:
    'The record book is kept on your account, apart from the machine, so it follows you to your other devices. This device could not keep a copy of its own: the browser is blocking storage, or it is full. So there is no daily bonus here, and what is counted here is lost if the page is closed before it is sent.',
  offlineKeptNote: 'Could not reach your account just now. The record book is kept on this device, and will be joined with the one on your account when it can be reached again.',
  offlineNotKeptNote:
    'Could not reach your account just now, and this device could not keep the record book either: the browser is blocking storage, or it is full. There is no daily bonus here, and what is counted is lost if the page is closed before the account can be reached.',
  unreadableKeptNote:
    'The record book on your account cannot be read by this page; it may come from a newer version of the game. It has been left as it is, and the book here is kept on this device only. Reloading the page may help.',
  unreadableNotKeptNote:
    'The record book on your account cannot be read by this page; it may come from a newer version of the game. It has been left as it is. The book here is not kept anywhere: this device could not keep it, because the browser is blocking storage or it is full. Reloading the page may help.',
  checkingKeptNote: 'Looking for the record book on your account… Until it is found, the book shown is the one kept on this device.',
  checkingNotKeptNote: 'Looking for the record book on your account… Meanwhile this device could not keep the book here: the browser is blocking storage, or it is full.',
  clear: 'Clear the records',
  clearConfirm: 'Press again to clear the records',
  clearConfirmAccount: 'Press again to clear the records on your account',
  clearNote: 'Clearing wipes the board and the achievement stamps. The daily stamp card stays, so clearing is not a way to take a day’s bonus twice.',
  clearNoteAccount: 'You are signed in, so the records on your account are cleared too, and those on your other devices the next time each of them reaches it.',
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
  bonusNotApart: 'このブラウザでは、2つのタブが同じ日のボーナスを重ねて受け取るのを防げないため、デイリーボーナスはありません。',
  bonusNoMachine: 'マシンが動いていないため、ボーナスを受け取れません。',
  bonusAsking: 'ほかの端末で今日のボーナスを受け取っていないか、アカウントに確認しています…',
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
    wasted: 'うち、保留が満杯だったメダル',
    golds: '金の抽選に変わった保留',
    fulls: '保留が満杯になった回数',
    chances: 'チャンスタイム',
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
    pours: 'ホッパーから流れ落ちた当たり',
    raised: 'リフトで組み上がったタワー',
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
    holdFull: { name: '保留満タン', how: `保留を${hold}個ためる。` },
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
  accountKeptNote:
    '記録は、マシンとは別に、アカウントに預けてあります。ほかの端末でも続きが見られ、それぞれの端末で数えた分は合算されます。スタンプを獲得したときとボーナスを受け取ったとき、それ以外は変更があるあいだ5分ごとに送られます。この端末にも控えが残り、ページを閉じたときにまだ送っていない分は、次にこの端末でゲームを開いたときに送られます。',
  accountNotKeptNote:
    '記録は、マシンとは別に、アカウントに預けてあります。ほかの端末でも続きが見られます。この端末には控えを保存できませんでした。ブラウザが保存を許可していないか、空き容量がありません。そのため、この端末ではデイリーボーナスを受け取れず、送る前にページを閉じると、ここで数えた分は失われます。',
  offlineKeptNote: 'いまアカウントに接続できません。記録はこの端末に保存してあり、接続できしだいアカウントの記録と合わせます。',
  offlineNotKeptNote:
    'いまアカウントに接続できず、この端末にも記録を保存できませんでした。ブラウザが保存を許可していないか、空き容量がありません。デイリーボーナスは受け取れず、接続できる前にページを閉じると、ここで数えた分は失われます。',
  unreadableKeptNote:
    'アカウントに預けてある記録を、このページでは読み取れません（新しい版のゲームで保存された可能性があります）。アカウント側はそのまま残し、ここの記録はこの端末にだけ保存しています。ページを読み込み直すと直ることがあります。',
  unreadableNotKeptNote:
    'アカウントに預けてある記録を、このページでは読み取れません（新しい版のゲームで保存された可能性があります）。アカウント側はそのまま残してあります。ここの記録はどこにも保存されていません。この端末には保存できませんでした（ブラウザが保存を許可していないか、空き容量がありません）。ページを読み込み直すと直ることがあります。',
  checkingKeptNote: 'アカウントに預けた記録を確認しています… 見つかるまでは、この端末に保存してある記録を表示しています。',
  checkingNotKeptNote: 'アカウントに預けた記録を確認しています… その間、この端末には記録を保存できませんでした。ブラウザが保存を許可していないか、空き容量がありません。',
  clear: '記録を消去',
  clearConfirm: 'もう一度押すと記録を消去します',
  clearConfirmAccount: 'もう一度押すと、アカウントの記録を消去します',
  clearNote: '消去すると記録ボードと実績スタンプが消えます。デイリースタンプカードは残るので、消去しても同じ日のボーナスを2回受け取ることはできません。',
  clearNoteAccount: 'サインイン中のため、アカウントの記録も消去されます。ほかの端末の記録も、その端末が次にアカウントに接続したときに消去されます。',
  sayCleared: '記録を消去しました。',
  sayClearOff: '記録の消去を取りやめました。',

  date: (day) => {
    const [year, month, date] = parts(day);
    return `${year}年${month}月${date}日`;
  },
};

export const getRecordStrings = (language: GameLanguage): RecordStrings => (language === 'ja' ? ja : en);
