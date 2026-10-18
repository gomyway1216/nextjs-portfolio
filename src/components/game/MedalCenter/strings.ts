/**
 * The medal center's own words, in English and Japanese. Nothing here may read
 * as money: the owner's rule is that no player should take the medals for real
 * money. So the medals are "your medals" (持ちメダル), and none of a bank's or a
 * money counter's words is used: no bank, deposit or withdrawal, no balance,
 * and in Japanese no 預け・預かり・引き出し・残高. `NOT_MONEY` says it outright, and
 * every game that plays with the medals shows it.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Status } from '../MedalPusher/account';

export interface CenterStrings {
  title: string;
  sign: string;
  signSub: string;
  lead: string;
  backToGames: string;
  // The counter
  counterLabel: string;
  unit: string;
  owed: (count: string) => string;
  memberGuest: string;
  memberAccount: string;
  memberChecking: string;
  where: Record<Status['where'], string>;
  notKept: string;
  signInInvite: string;
  refill: (medals: number) => string;
  /** Why no refill is offered to a player with no medals: some are out on a round at the machines put where `{games}` is. */
  outAt: string;
  /** What goes between two machines' names in `outAt`. */
  outJoin: string;
  sayRefill: (medals: number) => string;
  sayBonus: (medals: number) => string;
  // The player's own page
  myPage: string;
  myPageNote: string;
  // The floor
  floorTitle: string;
  floorLead: string;
  soon: string;
  play: string;
  soonNote: string;
  // The machines' plates
  /** The sticker on a machine new to the floor, and what it says to a screen reader. */
  newBadge: string;
  newSay: string;
  /** The sticker on a machine linked to the floor jackpot, and what it says to a screen reader. */
  jpBadge: string;
  jpSay: string;
  /** A machine's best return, as its Odds tab publishes it. */
  bestReturn: (percent: string) => string;
  /** How many machines stand in a corner. */
  machineCount: (count: number) => string;
  /** The key to the plates, under the floor's lead. */
  legendTitle: string;
  legendJp: string;
  legendNew: string;
  legendReturn: string;
  // How the bank works
  rulesTitle: string;
  rules: string[];
  // The reset
  resetTitle: string;
  resetLead: string;
  resetButton: string;
  resetDialogTitle: string;
  resetDialogBody: (medals: string, account: boolean) => string;
  resetKeeps: string;
  resetCancel: string;
  resetConfirm: string;
  sayReset: (medals: number) => string;
  // That medals are not money
  notMoney: string;
}

/**
 * That the medals are not money, said outright. Every game that plays with the
 * medals shows it, in the player's language, by its medal counter or its help.
 */
export const NOT_MONEY: Record<GameLanguage, string> = {
  en: 'Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.',
  ja: 'メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。',
};

const en: CenterStrings = {
  title: 'Medal Game Center',
  sign: 'MEDAL GAME CENTER',
  signSub: 'メダルゲームセンター',
  lead: 'Your medals are shared by every machine on the floor. What you win at one machine you can play at another.',
  backToGames: 'All games',
  counterLabel: 'YOUR MEDALS',
  unit: 'medals',
  owed: (count) => `${count} medals short: two devices played the same medals at once. Your next wins pay it back.`,
  memberGuest: 'Guest',
  memberAccount: 'Member',
  memberChecking: 'Looking for your medals…',
  where: {
    device: 'Kept on this device.',
    account: 'Kept on your account, and on every device you sign in on.',
    offline: 'Your account cannot be reached just now: kept on this device, and sent when it can be.',
    unreadable: 'The medals on your account were saved by a newer version of the site: they are left as they are, and this device keeps its own.',
    checking: 'Looking for the medals on your account…',
  },
  notKept: 'This browser is not keeping anything: your medals start again when the page is reloaded.',
  signInInvite: 'Sign in to keep your medals on your account.',
  refill: (medals) => `Out of medals — take ${medals} more`,
  outAt: 'Some of your medals are still on a round at {games}. Finish it there and they come back to you; the free refill is for when none are left anywhere.',
  outJoin: ', ',
  sayRefill: (medals) => `${medals} medals added to yours.`,
  sayBonus: (medals) => `Daily bonus: ${medals} medals added to yours.`,
  myPage: 'MY PAGE',
  myPageNote: 'Your history and records at every machine',
  floorTitle: 'THE FLOOR',
  floorLead: 'Every open machine plays with your medals, and the medals it wins come straight back to you.',
  soon: 'COMING SOON',
  play: 'PLAY',
  soonNote: 'These casino games are coming onto the medal floor one by one. Until each does, it keeps its own chips on its own page, apart from your medals.',
  newBadge: 'NEW',
  newSay: 'New on the floor.',
  jpBadge: 'FLOOR JP',
  jpSay: 'Linked to the floor jackpot.',
  bestReturn: (percent) => `Best return ${percent}`,
  machineCount: (count) => (count === 1 ? '1 machine' : `${count} machines`),
  legendTitle: 'On the plates',
  legendJp: 'linked to the floor jackpot',
  legendNew: 'new on the floor',
  legendReturn: 'Best return: the medals a machine brings back for every 100 played, at its best play, in the long run.',
  rulesTitle: 'ABOUT YOUR MEDALS',
  rules: [
    'Every medal you drop at a machine comes out of your medals, and every medal you win is added to them as it lands. Nothing is left behind at the machine.',
    'Your medals stay until you reset them here. They do not run out after 30 days as a real arcade’s do.',
    'Run out, and the attendant brings a free cupful of 100, once none of your medals are still on a round at a machine. Once a day there is the daily bonus.',
    'Your medals can be played at one machine at a time, like a member’s card in one cabinet: open a machine in another tab and the first one waits.',
  ],
  resetTitle: 'RESET',
  resetLead: 'Throws away all your medals and starts every machine over. The daily bonus card is kept.',
  resetButton: 'Reset medals',
  resetDialogTitle: 'Reset your medals?',
  resetDialogBody: (medals, account) =>
    `Your ${medals} medals are thrown away, and you start again with 100 medals, as a new member does. Every machine starts over, with a new field and its jackpot back at the start.${account ? ' These are your account’s medals: they are reset on every device you sign in on.' : ''}`,
  resetKeeps: 'Your daily bonus card and your record book are kept. This cannot be undone.',
  resetCancel: 'Keep my medals',
  resetConfirm: 'Reset medals',
  sayReset: (medals) => `Your medals have been reset. You have ${medals} medals, and every machine has started over.`,
  notMoney: NOT_MONEY.en,
};

const ja: CenterStrings = {
  title: 'メダルゲームセンター',
  sign: 'MEDAL GAME CENTER',
  signSub: 'メダルゲームセンター',
  lead: 'メダルはフロアのすべてのマシンで共通です。あるマシンで勝ったメダルを、別のマシンで遊べます。',
  backToGames: 'ゲーム一覧',
  counterLabel: '持ちメダル',
  unit: '枚',
  owed: (count) => `${count}枚足りません。2つの端末で同じメダルを同時に遊んだためです。次に勝ったメダルで埋まります。`,
  memberGuest: 'ゲスト',
  memberAccount: '会員',
  memberChecking: 'メダルを確認しています…',
  where: {
    device: 'この端末に保存しています。',
    account: 'アカウントに保存しています。サインインしたどの端末でも使えます。',
    offline: 'いまアカウントに接続できません。この端末に保存し、接続できしだい送ります。',
    unreadable: 'アカウントのメダルは新しい版のサイトで保存されています。そのまま残し、この端末では端末の分を使います。',
    checking: 'アカウントのメダルを確認しています…',
  },
  notKept: 'このブラウザには保存できません。ページを読み込み直すと、メダルは最初からになります。',
  signInInvite: 'サインインすると、メダルをアカウントに保存できます。',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  outAt: '{games}で、まだメダルが勝負に出ています。そこで勝負を終えるとメダルが戻ります。無料のメダルは、どこにもメダルが残っていないときにもらえます。',
  outJoin: '、',
  sayRefill: (medals) => `メダルが${medals}枚増えました。`,
  sayBonus: (medals) => `デイリーボーナス: メダルが${medals}枚増えました。`,
  myPage: 'マイページ',
  myPageNote: '持ちメダルの履歴と、各マシンの記録',
  floorTitle: 'フロア',
  floorLead: '遊べるマシンは持ちメダルで遊べ、勝ったメダルはそのまま持ちメダルに加わります。',
  soon: '準備中',
  play: '遊ぶ',
  soonNote: 'これらのカジノゲームは、順番にメダルフロアに入る予定です。それまでは各ゲームのページで、メダルとは別のそのゲームのチップで遊びます。',
  newBadge: '新台',
  newSay: '新台です。',
  jpBadge: 'JP対象',
  jpSay: 'フロアジャックポットの対象です。',
  bestReturn: (percent) => `最高還元率${percent}`,
  machineCount: (count) => `${count}台`,
  legendTitle: '台の見かた',
  legendJp: 'フロアジャックポットの対象',
  legendNew: '新しく入った台',
  legendReturn: '最高還元率：いちばん良い遊び方で、遊んだメダル100枚につき長い目で見て戻ってくる枚数です。',
  rulesTitle: 'メダルについて',
  rules: [
    'マシンに入れたメダルは持ちメダルから減り、勝ったメダルは落ちたそばから持ちメダルに加わります。マシンに残しておくメダルはありません。',
    'メダルは、ここでリセットしない限り残ります。実際のお店のように30日で期限切れになることはありません。',
    'メダルがなくなったら、店員さんが100枚を無料で持ってきます（マシンで勝負中のメダルが残っていないとき）。1日1回、デイリーボーナスもあります。',
    'メダルを遊べるマシンは一度に1台です。会員カードを1台の筐体に差すのと同じで、別のタブでマシンを開くと、先のマシンは待機します。',
  ],
  resetTitle: 'リセット',
  resetLead: '持ちメダルをすべて捨て、すべてのマシンを最初からにします。デイリーボーナスのカードは残ります。',
  resetButton: 'メダルをリセット',
  resetDialogTitle: 'メダルをリセットしますか？',
  resetDialogBody: (medals, account) =>
    `持ちメダル${medals}枚を捨てて、新規会員と同じ100枚からやり直します。すべてのマシンも、フィールドもジャックポットも最初からになります。${account ? 'これはアカウントのメダルです。サインインしているすべての端末でリセットされます。' : ''}`,
  resetKeeps: 'デイリーボーナスのカードと記録は残ります。元には戻せません。',
  resetCancel: 'メダルを残す',
  resetConfirm: 'リセットする',
  sayReset: (medals) => `メダルをリセットしました。持ちメダルは${medals}枚で、すべてのマシンが最初からになりました。`,
  notMoney: NOT_MONEY.ja,
};

export const getCenterStrings = (language: GameLanguage): CenterStrings => (language === 'ja' ? ja : en);
