/**
 * The medal center's own words, in English and Japanese. A Japanese arcade's
 * medal counter speaks of 預け入れ (depositing), 引き出し (drawing out) and
 * 預かりメダル (medals held for you); those are the words used here.
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
  sayRefill: (medals: number) => string;
  sayBonus: (medals: number) => string;
  // The floor
  floorTitle: string;
  floorLead: string;
  open: string;
  soon: string;
  play: string;
  playsFromBank: string;
  soonNote: string;
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
}

const en: CenterStrings = {
  title: 'Medal Game Center',
  sign: 'MEDAL GAME CENTER',
  signSub: 'メダルゲームセンター',
  lead: 'Your medals are kept here, in the medal bank, and every machine on the floor plays from them. What you win at one machine you can play at another.',
  backToGames: 'All games',
  counterLabel: 'MEDALS IN THE BANK',
  unit: 'medals',
  owed: (count) => `${count} medals short: two devices played the same medals at once. Your next wins pay it back.`,
  memberGuest: 'Guest',
  memberAccount: 'Member',
  memberChecking: 'Looking for your bank…',
  where: {
    device: 'Kept on this device.',
    account: 'Kept on your account, and on every device you sign in on.',
    offline: 'Your account cannot be reached just now: kept on this device, and sent when it can be.',
    unreadable: 'The bank on your account was saved by a newer version of the site: it is left as it is, and this device keeps its own.',
    checking: 'Looking for the bank on your account…',
  },
  notKept: 'This browser is not keeping anything: the bank starts again when the page is reloaded.',
  signInInvite: 'Sign in to keep your medals on your account.',
  refill: (medals) => `Out of medals — take ${medals} more`,
  sayRefill: (medals) => `${medals} medals put into your bank.`,
  sayBonus: (medals) => `Daily bonus: ${medals} medals put into your bank.`,
  floorTitle: 'THE FLOOR',
  floorLead: 'Every open machine draws its medals straight from your bank, and pays what it wins back into it.',
  open: 'OPEN',
  soon: 'COMING SOON',
  play: 'Play',
  playsFromBank: 'Plays from your medal bank.',
  soonNote: 'These casino games are coming onto the medal floor one by one. Until each does, it keeps its own chips on its own page, apart from your medals.',
  rulesTitle: 'THE MEDAL BANK',
  rules: [
    'Every medal you win at a machine goes back into the bank as it lands, and every medal you drop is taken out of it. Nothing is held at the machine.',
    'Medals stay in the bank until you reset them here. They do not run out after 30 days as a real shop’s do.',
    'Run out, and the attendant brings a free cupful of 100. Once a day there is the daily bonus.',
    'Your medals can be played at one machine at a time, like a member’s card in one cabinet: open a machine in another tab and the first one waits.',
  ],
  resetTitle: 'RESET',
  resetLead: 'Throws away every medal in the bank and starts every machine over. The daily bonus card is kept.',
  resetButton: 'Reset medals',
  resetDialogTitle: 'Reset your medals?',
  resetDialogBody: (medals, account) =>
    `The ${medals} medals in your bank are thrown away, and the bank starts again with 100 medals, as a new member’s. Every machine starts over, with a new field and its jackpot back at the start.${account ? ' This is your account’s bank: it is reset on every device you sign in on.' : ''}`,
  resetKeeps: 'Your daily bonus card and your record book are kept. This cannot be undone.',
  resetCancel: 'Keep my medals',
  resetConfirm: 'Reset medals',
  sayReset: (medals) => `Your medals have been reset. The bank holds ${medals} medals, and every machine has started over.`,
};

const ja: CenterStrings = {
  title: 'メダルゲームセンター',
  sign: 'MEDAL GAME CENTER',
  signSub: 'メダルゲームセンター',
  lead: 'メダルはここのメダルバンクに預けてあり、フロアのどのマシンもそこから遊びます。あるマシンで勝ったメダルを、別のマシンで遊べます。',
  backToGames: 'ゲーム一覧',
  counterLabel: '預かりメダル',
  unit: '枚',
  owed: (count) => `${count}枚足りません。2つの端末で同じメダルを同時に遊んだためです。次に勝ったメダルで埋まります。`,
  memberGuest: 'ゲスト',
  memberAccount: '会員',
  memberChecking: 'メダルバンクを確認しています…',
  where: {
    device: 'この端末に預けてあります。',
    account: 'アカウントに預けてあります。サインインしたどの端末でも使えます。',
    offline: 'いまアカウントに接続できません。この端末に預けてあり、接続できしだい送ります。',
    unreadable: 'アカウントのメダルバンクは新しい版のサイトで保存されています。そのまま残し、この端末では端末の分を使います。',
    checking: 'アカウントのメダルバンクを確認しています…',
  },
  notKept: 'このブラウザには保存できません。ページを読み込み直すと、メダルバンクは最初からになります。',
  signInInvite: 'サインインすると、メダルをアカウントに預けておけます。',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  sayRefill: (medals) => `メダルバンクに${medals}枚入りました。`,
  sayBonus: (medals) => `デイリーボーナス: メダルバンクに${medals}枚入りました。`,
  floorTitle: 'フロア',
  floorLead: '遊べるマシンは、メダルバンクから直接メダルを引き出し、勝った分をそのまま預け入れます。',
  open: '営業中',
  soon: '準備中',
  play: '遊ぶ',
  playsFromBank: 'メダルバンクのメダルで遊べます。',
  soonNote: 'これらのカジノゲームは、順番にメダルフロアに入る予定です。それまでは各ゲームのページで、メダルとは別のそのゲームのチップで遊びます。',
  rulesTitle: 'メダルバンクのご案内',
  rules: [
    'マシンで勝ったメダルは落ちたそばからバンクに預け入れられ、投入したメダルはバンクから引き出されます。マシンに残しておくメダルはありません。',
    'メダルは、ここでリセットしない限りバンクに残ります。実際のお店のように30日で期限切れになることはありません。',
    'メダルがなくなったら、店員さんが100枚を無料で持ってきます。1日1回、デイリーボーナスもあります。',
    'メダルを遊べるマシンは一度に1台です。会員カードを1台の筐体に差すのと同じで、別のタブでマシンを開くと、先のマシンは待機します。',
  ],
  resetTitle: 'リセット',
  resetLead: 'バンクのメダルをすべて捨て、すべてのマシンを最初からにします。デイリーボーナスのカードは残ります。',
  resetButton: 'メダルをリセット',
  resetDialogTitle: 'メダルをリセットしますか？',
  resetDialogBody: (medals, account) =>
    `メダルバンクの${medals}枚を捨てて、新規会員と同じ100枚からやり直します。すべてのマシンも、フィールドもジャックポットも最初からになります。${account ? 'これはアカウントのメダルバンクです。サインインしているすべての端末でリセットされます。' : ''}`,
  resetKeeps: 'デイリーボーナスのカードと記録は残ります。元には戻せません。',
  resetCancel: 'メダルを残す',
  resetConfirm: 'リセットする',
  sayReset: (medals) => `メダルをリセットしました。バンクは${medals}枚で、すべてのマシンが最初からになりました。`,
};

export const getCenterStrings = (language: GameLanguage): CenterStrings => (language === 'ja' ? ja : en);
