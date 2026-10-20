/**
 * The words of the medal center's "my page", in English and Japanese. The
 * medal center's rule holds here too (strings.ts): nothing may read as money.
 * The medals are "your medals" (持ちメダル); there is no bank, deposit,
 * withdrawal or balance, and in Japanese no 預け・預かり・引き出し・残高・お金.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Status } from '../MedalPusher/account';
import { NOT_MONEY } from './strings';

export interface MyPageStrings {
  title: string;
  sign: string;
  signSub: string;
  lead: string;
  backToCenter: string;
  jumpLabel: string;
  // The medals
  counterLabel: string;
  unit: string;
  medals: (count: string) => string;
  memberGuest: string;
  memberAccount: string;
  memberChecking: string;
  whose: { guest: string; account: string };
  where: Record<Status['where'], string>;
  notKept: string;
  signInInvite: string;
  notMoney: string;
  // The chart
  chartTitle: string;
  chartSays: (first: string, firstDate: string, last: string, high: string) => string;
  chartNow: string;
  chartEmpty: string;
  // The records
  recordsTitle: string;
  recordsLead: (since: string) => string;
  totalsTitle: string;
  rounds: string;
  bet: string;
  fed: string;
  won: string;
  return: string;
  top: string;
  topPrize: string;
  best: string;
  last: string;
  inARow: (count: number, shown: string) => string;
  notPlayedTitle: string;
  // The floor jackpot's records
  floorTitle: string;
  floorLead: string;
  floorWins: string;
  floorMedals: string;
  floorBiggest: string;
  floorLast: string;
  notPlayed: string;
  play: string;
  none: string;
  // The Medal Pusher's own record book
  bookTitle: string;
  bookLead: string;
  bookWon: string;
  bookReturn: string;
  bookPrize: string;
  bookJackpots: string;
  bookStamps: string;
  stampsOf: (earned: number, all: number) => string;
  bookOpen: string;
  // The history
  historyTitle: string;
  since: (date: string) => string;
  sinceUnknown: string;
  empty: string;
  centerName: string;
  round: (bet: string, won: string) => string;
  playVisit: (fed: string, won: string) => string;
  jackpot: (medals: string) => string;
  bonus: (medals: string) => string;
  refill: (medals: string) => string;
  reset: (thrown: string, start: string) => string;
  /** Where a floor jackpot was won, where a machine's name would go: the floor itself. */
  floorName: string;
  /** A floor jackpot paid into the medals. */
  floorJackpot: (medals: string) => string;
  up: (count: string) => string;
  down: (count: string) => string;
  even: string;
  after: (count: string) => string;
  showMore: (count: number) => string;
  shownOf: (shown: number, all: number) => string;
  olderTitle: string;
  /** The days kept by their totals: the latest `days` with anything in them. */
  olderLead: (days: number) => string;
  dayLine: (bet: string, won: string, free: string, rounds: string) => string;
  /** Under the oldest day the list reaches, once it may have lost its earlier things: what the day's totals (`dayLine`) after it are. */
  dayCut: string;
  dayLeft: (count: string) => string;
}

const en: MyPageStrings = {
  title: 'My Page',
  sign: 'MY PAGE',
  signSub: 'マイページ',
  lead: 'Your medals, what happened to them, and your records at every machine of the medal game center.',
  backToCenter: 'Medal Game Center',
  jumpLabel: 'On this page',
  counterLabel: 'YOUR MEDALS',
  unit: 'medals',
  medals: (count) => `${count} medals`,
  memberGuest: 'Guest',
  memberAccount: 'Member',
  memberChecking: 'Checking…',
  whose: { guest: 'This device’s history and records.', account: 'Your account’s history and records.' },
  where: {
    device: 'Kept on this device.',
    account: 'Kept on your account, and on every device you sign in on.',
    offline: 'Your account cannot be reached just now: kept on this device, and sent when it can be.',
    unreadable: 'The history on your account was saved by a newer version of the site: it is left as it is, and this device keeps its own.',
    checking: 'Looking for the history on your account…',
  },
  notKept: 'This browser is not keeping anything: the history starts again when the page is reloaded.',
  signInInvite: 'Sign in to keep your history and records on your account, and see them on every device.',
  notMoney: NOT_MONEY.en,
  chartTitle: 'MEDALS OVER TIME',
  chartSays: (first, firstDate, last, high) => `Your medals went from ${first} on ${firstDate} to ${last} now. The most you had was ${high}.`,
  chartNow: 'now',
  chartEmpty: 'The chart fills in as you play.',
  recordsTitle: 'RECORDS',
  recordsLead: (since) => `Counted on every machine since ${since}, when your history began.`,
  totalsTitle: 'All machines',
  rounds: 'Rounds played',
  bet: 'Medals bet',
  fed: 'Medals fed',
  won: 'Medals won',
  return: 'Return',
  top: 'Biggest win in one round',
  topPrize: 'Biggest prize',
  best: 'Best streak',
  last: 'Last played',
  inARow: (count, shown) => `${shown} ${count === 1 ? 'round' : 'rounds'} won in a row`,
  notPlayedTitle: 'Not played yet',
  floorTitle: 'FLOOR JACKPOT',
  floorLead: 'The medal floor’s shared jackpot, won while playing a linked machine on the floor. It is not counted in the machines’ figures above.',
  floorWins: 'Times won',
  floorMedals: 'Medals won',
  floorBiggest: 'Biggest',
  floorLast: 'Last won',
  notPlayed: 'Not played since your history began.',
  play: 'Play',
  none: '—',
  bookTitle: 'THE MEDAL PUSHER’S RECORD BOOK',
  bookLead: 'The cabinet keeps a board and a sheet of stamps of its own, counted since the book was last cleared. They are shown here as the cabinet has them.',
  bookWon: 'Medals won',
  bookReturn: 'Return',
  bookPrize: 'Biggest prize',
  bookJackpots: 'Jackpots',
  bookStamps: 'Stamps',
  stampsOf: (earned, all) => `${earned} of ${all}`,
  bookOpen: 'Open the record book',
  historyTitle: 'HISTORY',
  since: (date) => `Your history begins on ${date}. What was played before then is not in it.`,
  sinceUnknown: 'What was played before this history began is not in it.',
  empty: 'Nothing yet. Play a machine, and what happens to your medals shows up here.',
  centerName: 'Medal Game Center',
  round: (bet, won) => `Bet ${bet} · won ${won}`,
  playVisit: (fed, won) => `Fed ${fed} · won ${won}`,
  jackpot: (medals) => `JACKPOT! ${medals} medals`,
  bonus: (medals) => `Daily bonus: ${medals} medals`,
  refill: (medals) => `Free medals from the attendant: ${medals}`,
  reset: (thrown, start) => `Medals reset: ${thrown} thrown away, started again with ${start}`,
  floorName: 'Medal floor',
  floorJackpot: (medals) => `FLOOR JACKPOT +${medals}`,
  up: (count) => `${count} medals up`,
  down: (count) => `${count} medals down`,
  even: 'even',
  after: (count) => `medals after: ${count}`,
  showMore: (count) => `Show ${count} more`,
  shownOf: (shown, all) => `Showing ${shown} of ${all}.`,
  olderTitle: 'EARLIER DAYS',
  olderLead: (days) => `Each day’s totals, for the days the list above no longer reaches. The latest ${days} days with anything in them are kept.`,
  dayLine: (bet, won, free, rounds) => `Bet ${bet} · won ${won} · given ${free} · ${rounds} ${rounds === '1' ? 'round' : 'rounds'}`,
  dayCut: 'The whole day, with what the list no longer holds:',
  dayLeft: (count) => `${count} medals at the end of the day`,
};

const ja: MyPageStrings = {
  title: 'マイページ',
  sign: 'MY PAGE',
  signSub: 'マイページ',
  lead: 'メダルゲームセンターでの持ちメダルと、その動きの履歴、各マシンの記録をまとめて見られます。',
  backToCenter: 'メダルゲームセンター',
  jumpLabel: 'このページの内容',
  counterLabel: '持ちメダル',
  unit: '枚',
  medals: (count) => `${count}枚`,
  memberGuest: 'ゲスト',
  memberAccount: '会員',
  memberChecking: '確認中…',
  whose: { guest: 'この端末の履歴と記録です。', account: 'アカウントの履歴と記録です。' },
  where: {
    device: 'この端末に保存しています。',
    account: 'アカウントに保存しています。サインインしたどの端末でも見られます。',
    offline: 'いまアカウントに接続できません。この端末に保存し、接続できしだい送ります。',
    unreadable: 'アカウントの履歴は新しい版のサイトで保存されています。そのまま残し、この端末では端末の分を使います。',
    checking: 'アカウントの履歴を確認しています…',
  },
  notKept: 'このブラウザには保存できません。ページを読み込み直すと、履歴は最初からになります。',
  signInInvite: 'サインインすると、履歴と記録をアカウントに保存して、どの端末でも見られます。',
  notMoney: NOT_MONEY.ja,
  chartTitle: 'メダルの推移',
  chartSays: (first, firstDate, last, high) => `持ちメダルは${firstDate}の${first}から、いまは${last}です。いちばん多かったときは${high}でした。`,
  chartNow: 'いま',
  chartEmpty: '遊ぶとグラフができていきます。',
  recordsTitle: '記録',
  recordsLead: (since) => `履歴が始まった${since}から、すべてのマシンで数えています。`,
  totalsTitle: 'すべてのマシン',
  rounds: 'プレイ回数',
  bet: 'ベットしたメダル',
  fed: '投入したメダル',
  won: '獲得したメダル',
  return: '還元率',
  top: '1回の最高獲得',
  topPrize: '最高配当',
  best: '最高連勝',
  last: '最後に遊んだ日',
  inARow: (_count, shown) => `${shown}連勝`,
  notPlayedTitle: 'まだ遊んでいないマシン',
  floorTitle: 'フロアジャックポット',
  floorLead: 'メダルフロアみんなのジャックポットです。フロアの対象のマシンで遊んでいるときに当たります。上のマシンの記録には含みません。',
  floorWins: '当たった回数',
  floorMedals: '獲得したメダル',
  floorBiggest: '最高',
  floorLast: '最後に当たった日',
  notPlayed: '履歴が始まってから、まだ遊んでいません。',
  play: '遊ぶ',
  none: '—',
  bookTitle: 'メダルプッシャーの記録',
  bookLead: '筐体は、記録を最後にクリアしてからの記録ボードとスタンプを、それぞれ自分でも持っています。ここには筐体のものをそのまま表示しています。',
  bookWon: '獲得メダル',
  bookReturn: '還元率',
  bookPrize: '最高配当',
  bookJackpots: 'ジャックポット',
  bookStamps: 'スタンプ',
  stampsOf: (earned, all) => `${earned} / ${all}`,
  bookOpen: '記録を開く',
  historyTitle: '履歴',
  since: (date) => `履歴は${date}から始まります。それより前に遊んだ分は入っていません。`,
  sinceUnknown: '履歴が始まる前に遊んだ分は入っていません。',
  empty: 'まだありません。マシンで遊ぶと、持ちメダルの動きがここに表示されます。',
  centerName: 'メダルゲームセンター',
  round: (bet, won) => `ベット${bet}枚・獲得${won}枚`,
  playVisit: (fed, won) => `投入${fed}枚・獲得${won}枚`,
  jackpot: (medals) => `ジャックポット！ ${medals}枚`,
  bonus: (medals) => `デイリーボーナス：${medals}枚`,
  refill: (medals) => `店員さんから無料のメダル：${medals}枚`,
  reset: (thrown, start) => `メダルをリセット：${thrown}枚を捨てて、${start}枚からやり直し`,
  floorName: 'メダルフロア',
  floorJackpot: (medals) => `フロアジャックポット +${medals}枚`,
  up: (count) => `${count}枚プラス`,
  down: (count) => `${count}枚マイナス`,
  even: 'プラスマイナスなし',
  after: (count) => `その後の持ちメダル ${count}枚`,
  showMore: (count) => `さらに${count}件を表示`,
  shownOf: (shown, all) => `${all}件のうち${shown}件を表示しています。`,
  olderTitle: 'それより前の日',
  olderLead: (days) => `上の一覧に入りきらない日の、1日ごとの合計です。記録のある日のうち、新しい${days}日分まで残ります。`,
  dayLine: (bet, won, free, rounds) => `ベット${bet}枚・獲得${won}枚・無料${free}枚・${rounds}回`,
  dayCut: 'この日の合計（一覧にない分も含む）：',
  dayLeft: (count) => `その日の終わりの持ちメダル ${count}枚`,
};

export const getMyPageStrings = (language: GameLanguage): MyPageStrings => (language === 'ja' ? ja : en);
