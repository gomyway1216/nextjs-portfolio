/**
 * The medal floor's words, in English and Japanese: the live feed, the
 * rankings, a player's place on the floor and the floor jackpot. As everywhere in the medal
 * center, nothing may read as money: medals are medals (「メダル」), and no
 * bank's or cashier's word is used.
 */

import type { GameLanguage } from '../../constants/gameTranslations';
import type { NameRefusal } from '@/lib/medalFloor/names';

export interface FloorStrings {
  title: string;
  lead: string;
  /** The medal center's front: the board by the door with the floor jackpot and the latest big wins, and the rankings further in. */
  nowTitle: string;
  togetherLead: string;
  moreMoments: string;
  // The feed
  feedTitle: string;
  feedEmpty: string;
  feedUnavailable: string;
  live: string;
  polling: string;
  /** What a moment says after the player's name. */
  moment: (label: string | null, medals: string) => string;
  /** "Player 1234": a player who has not chosen a name. */
  defaultName: (tag: string) => string;
  /**
   * How long ago, in whole units gone by, as a clock reads them: 59 min, then 1 h; 23 h, then 1 d; 36 h is 1 d. (Rounded,
   * 59.6 minutes read "60 min ago" and a day and a half "2 d ago".)
   */
  ago: (seconds: number) => string;
  // The boards
  rankingsTitle: string;
  today: string;
  thisWeek: string;
  wonBoard: string;
  wonNote: string;
  bestBoard: string;
  bestNote: string;
  boardEmpty: string;
  medals: (medals: string) => string;
  rank: (rank: number) => string;
  allRankings: string;
  backToCenter: string;
  periodNote: (start: string) => string;
  honesty: string;
  // A player's place
  placeTitle: string;
  signInToJoin: string;
  checking: string;
  offIntro: string;
  nameLabel: string;
  nameHint: string;
  namePlaceholder: string;
  join: string;
  joined: (name: string) => string;
  rename: string;
  leave: string;
  leaveNote: string;
  blocked: string;
  saving: string;
  failed: string;
  refusals: Record<NameRefusal, string>;
  joinedSay: (name: string) => string;
  leftSay: string;
  // The owner
  ownerTitle: string;
  hide: string;
  show: string;
  block: string;
  unblock: string;
  hidden: string;
  hideMoment: string;
  // The floor jackpot
  jackpotTitle: string;
  jackpotUnit: string;
  jackpotLead: string;
  /** For a guest: how to play for it. */
  jackpotGuest: string;
  /** For a signed-in player not on the floor, on the medal center's front (the place card is below) and at a machine. */
  jackpotJoinHere: string;
  jackpotJoinThere: string;
  /** For a player on the floor. */
  jackpotIn: string;
  jackpotUnavailable: string;
  jackpotLast: (name: string, medals: string, ago: string) => string;
  jackpotNever: string;
  /** Said when this page has just put a floor jackpot into the player's medals. */
  jackpotPaid: (medals: string) => string;
  /** The Odds tabs' line: the share, one medal for every `per`, the chance, the seed, what it brings back for every 100 played, and the day's most. */
  jackpotRules: (share: string, per: string, oneIn: string, seed: string, back: string, daily: string) => string[];
  /** The machines linked to the floor jackpot, by name. */
  jackpotLinked: (machines: string) => string;
  /** Over a machine that is not linked: play there neither feeds nor wins it. */
  jackpotNotLinked: string;
  /** The Odds tab of a machine that is not linked. */
  jackpotRulesOut: string;
  jackpotHonesty: string;
  jackpotWinsTitle: string;
  jackpotMore: string;
  // The owner's floor jackpot
  jackpotVoid: string;
  jackpotState: Record<'pending' | 'paid' | 'void', string>;
  jackpotVoidNote: string;
}

const enMoment = (label: string | null, medals: string): string => {
  switch (label) {
    case 'jackpot':
      return `hit the JACKPOT: ${medals} medals`;
    case 'bowl':
      return `won ${medals} medals from the bowls`;
    case 'seven3':
      return `lined up three sevens: ${medals} medals`;
    case 'bar3':
      return `lined up three bars: ${medals} medals`;
    case 'double-up':
      return `won a ${medals}-medal double-up`;
    case 'royal':
      return `drew a royal flush: ${medals} medals`;
    case 'straight-flush':
      return `drew a straight flush: ${medals} medals`;
    case 'four-kind':
      return `drew four of a kind: ${medals} medals`;
    case 'floor-jackpot':
      return `hit the FLOOR JACKPOT: ${medals} medals`;
    case 'harbor-lord':
      return `landed the Harbor Lord: ${medals} medals`;
    case 'treasure':
      return `fished up a treasure chest: ${medals} medals`;
    case 'full-card':
      return `filled the whole bingo card: ${medals} medals`;
    case 'wheel-400':
      return `hit ×400 on the big wheel: ${medals} medals`;
    case 'wheel-bonus':
      return `won on the big wheel’s second chance: ${medals} medals`;
    case 'ladder-top':
      return `climbed the High & Low ladder to the top: ${medals} medals`;
    case 'sicbo-triple':
      return `rolled a triple at Sic Bo: ${medals} medals`;
    case 'sicbo-any-triple':
      return `won Any Triple at Sic Bo: ${medals} medals`;
    case 'sugoroku-jp':
      // From the JP Chance square on the board, or at the whale's blowhole after a ride.
      return `hit the jackpot on Whale Isle Sugoroku: ${medals} medals`;
    case 'whale-ride':
      return `rode the whale on Whale Isle: ${medals} medals`;
    case 'maze-big':
      return `flicked a medal into BIG WIN in the candy shop maze: ${medals} medals`;
    case 'maze-win':
      return `flicked a medal into WIN in the candy shop maze: ${medals} medals`;
    case 'keno-all':
      return `caught every spot at Video Keno: ${medals} medals`;
    case 'smart-triple':
      return `lit three BINGO lines at Hot Spring Smart Ball: ${medals} medals`;
    case 'smart-double':
      return `lit two BINGO lines at Hot Spring Smart Ball: ${medals} medals`;
    case 'smart-line':
      return `made a BINGO at Hot Spring Smart Ball: ${medals} medals`;
    case 'pachinko-rush':
      return `ran a string of big hits at Goldfish Lantern Pachinko: ${medals} medals’ worth`;
    case 'pachinko-10r':
      return `hit a 10-round big hit at Goldfish Lantern Pachinko: ${medals} medals’ worth`;
    case 'pachinko-4r':
      return `hit a big hit at Goldfish Lantern Pachinko: ${medals} medals’ worth`;
    default:
      return `won ${medals} medals`;
  }
};

const jaMoment = (label: string | null, medals: string): string => {
  switch (label) {
    case 'jackpot':
      return `ジャックポット！${medals}枚`;
    case 'bowl':
      return `ボウルの当たりで${medals}枚`;
    case 'seven3':
      return `7が3つそろって${medals}枚`;
    case 'bar3':
      return `BARが3つそろって${medals}枚`;
    case 'double-up':
      return `ダブルアップで${medals}枚`;
    case 'royal':
      return `ロイヤルフラッシュで${medals}枚`;
    case 'straight-flush':
      return `ストレートフラッシュで${medals}枚`;
    case 'four-kind':
      return `フォーカードで${medals}枚`;
    case 'floor-jackpot':
      return `フロアジャックポット！${medals}枚`;
    case 'harbor-lord':
      return `港のヌシを釣り上げて${medals}枚`;
    case 'treasure':
      return `宝箱を釣り上げて${medals}枚`;
    case 'full-card':
      return `ビンゴカードが全部そろって${medals}枚`;
    case 'wheel-400':
      return `ビッグホイールで×400！${medals}枚`;
    case 'wheel-bonus':
      return `ビッグホイールのセカンドチャンスで${medals}枚`;
    case 'ladder-top':
      return `ハイ＆ローのラダーをトップまで上って${medals}枚`;
    case 'sicbo-triple':
      // 「ゾロ目が」, not 「ゾロ目的中」, which reads as 「ゾロ・目的・中」.
      return `シックボーでゾロ目が的中！${medals}枚`;
    case 'sicbo-any-triple':
      return `シックボーの「ゾロ目どれでも」で${medals}枚`;
    case 'sugoroku-jp':
      return `くじら島すごろくでジャックポット！${medals}枚`;
    case 'whale-ride':
      return `くじら島すごろくのくじらライドで${medals}枚`;
    case 'maze-big':
      return `駄菓子屋メダルめいろで大当たり！${medals}枚`;
    case 'maze-win':
      return `駄菓子屋メダルめいろで当たり！${medals}枚`;
    case 'keno-all':
      return `ビデオキノで全部的中！${medals}枚`;
    case 'smart-triple':
      return `湯けむりスマートボールでビンゴ3列！${medals}枚`;
    case 'smart-double':
      return `湯けむりスマートボールでビンゴ2列！${medals}枚`;
    case 'smart-line':
      return `湯けむりスマートボールでビンゴ！${medals}枚`;
    case 'pachinko-rush':
      return `金魚ちょうちんパチンコで連チャン！${medals}枚分`;
    case 'pachinko-10r':
      return `金魚ちょうちんパチンコで10R大当たり！${medals}枚分`;
    case 'pachinko-4r':
      return `金魚ちょうちんパチンコで大当たり！${medals}枚分`;
    default:
      return `${medals}枚の当たり`;
  }
};

const en: FloorStrings = {
  title: 'TOGETHER ON THE FLOOR',
  lead: 'Big wins from everyone playing right now, and today’s and this week’s rankings.',
  nowTitle: 'LIVE FROM THE FLOOR',
  togetherLead: 'Today’s and this week’s rankings, and your own place on the floor.',
  moreMoments: 'Every big win and ranking',
  feedTitle: 'Just now on the floor',
  feedEmpty: 'Quiet for now. The next big win shows up here.',
  feedUnavailable: 'The floor cannot be reached just now.',
  live: 'Live',
  polling: 'Updated every 30 seconds',
  moment: enMoment,
  defaultName: (tag) => `Player ${tag}`,
  ago: (seconds) => {
    if (seconds < 45) return 'just now';
    if (seconds < 3_600) return `${Math.max(1, Math.floor(seconds / 60))} min ago`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} h ago`;
    return `${Math.floor(seconds / 86_400)} d ago`;
  },
  rankingsTitle: 'RANKINGS',
  today: 'Today',
  thisWeek: 'This week',
  wonBoard: 'Medals won',
  wonNote: 'Every medal the machines paid out, on every machine.',
  bestBoard: 'Biggest win at each machine',
  bestNote: 'The most one round or one prize paid.',
  boardEmpty: 'Nobody yet — it could be you.',
  medals: (medals) => `${medals} medals`,
  rank: (rank) => `#${rank}`,
  allRankings: 'All rankings',
  backToCenter: 'Medal Center',
  periodNote: (start) => `Days start at midnight Japan time (${start} where you are); weeks start on Monday.`,
  honesty:
    'The rankings are for fun. Medals are kept in each player’s own browser, so every win here is what a player’s browser reported. The site checks each one against what that machine can pay and how fast it can be played, but it cannot prove it.',
  placeTitle: 'Your place on the floor',
  signInToJoin: 'Sign in to show your big wins on the floor and appear in the rankings.',
  checking: 'Looking for your place on the floor…',
  offIntro:
    'You are not on the floor: nothing about your play is sent anywhere. Join to show your big wins and appear in the rankings. Others see only your nickname, your wins and when.',
  nameLabel: 'Nickname',
  nameHint: '2 to 12 letters or numbers. Leave it empty to go by “Player” and four digits. Please don’t use your real name or email.',
  namePlaceholder: 'Player and four digits',
  join: 'Join the floor',
  joined: (name) => `You are on the floor as ${name}.`,
  rename: 'Save nickname',
  leave: 'Leave the floor',
  leaveNote: 'Leaving forgets your nickname and takes your lines off the rankings and your wins off the floor.',
  blocked: 'The site’s owner has taken this account off the floor.',
  saving: 'Saving…',
  failed: 'That did not go through. Please try again.',
  refusals: {
    empty: 'Type a nickname, or leave it empty to go by four digits.',
    short: 'A nickname needs at least 2 characters.',
    long: 'A nickname can have at most 12 characters.',
    characters: 'Use letters, numbers, spaces and - _ . only.',
    contact: 'A nickname cannot be an email, a link or a phone number.',
    reserved: 'That nickname could be mistaken for the site, its owner or another player.',
    abuse: 'Please choose a different nickname.',
  },
  joinedSay: (name) => `You joined the floor as ${name}.`,
  leftSay: 'You left the floor.',
  ownerTitle: 'Owner',
  hide: 'Hide',
  show: 'Show',
  block: 'Block player',
  unblock: 'Unblock player',
  hidden: 'Hidden',
  hideMoment: 'Take off the floor',
  jackpotTitle: 'FLOOR JACKPOT',
  jackpotUnit: 'medals',
  jackpotLead: 'One pool for the whole floor. Every medal the players on the floor play at a linked machine adds to it, and any one of those medals can win all of it.',
  jackpotGuest: 'Sign in and join the floor to play for it.',
  jackpotJoinHere: 'Join the floor below to play for it.',
  jackpotJoinThere: 'Join the floor at the Medal Center to play for it.',
  jackpotIn: 'You are on the floor: every medal you play feeds it, and could win it.',
  jackpotUnavailable: 'The floor jackpot cannot be reached just now.',
  jackpotLast: (name, medals, ago) => `Last won by ${name}: ${medals} medals, ${ago}`,
  jackpotNever: 'Nobody has won it yet.',
  jackpotPaid: (medals) => `FLOOR JACKPOT! ${medals} medals are in your medals now.`,
  jackpotRules: (share, per, oneIn, seed, back, daily) => [
    `+ ${share} of every medal played goes to the floor jackpot: the site adds 1 medal for every ${per} you play, on top of what you play. Nothing is taken out of it, so this machine’s own return is exactly as shown.`,
    `Each medal played is also a 1 in ${oneIn} chance to win the whole pool, which starts again at ${seed} medals once it is won. In the long run it brings back ${back} medals for every 100 played, but only in the long run: most players never win it.`,
    `It is for players who are signed in and have joined the floor, on the first ${daily} medals each plays in a day (Japan time) at the linked machines, with one floor jackpot a day at most.`,
  ],
  jackpotLinked: (machines) => `Linked machines: ${machines}.`,
  jackpotNotLinked: 'This table isn’t linked to the floor jackpot: play here doesn’t feed it or win it.',
  jackpotRulesOut:
    'This table isn’t linked to the floor jackpot. Its best play already brings back nearly every medal played, so play here neither feeds the floor jackpot nor draws for it. As on a real floor, not every cabinet is on the progressive.',
  jackpotHonesty:
    'Like the rankings, the floor jackpot is for fun. The medals played that feed it are what players’ browsers report: the site checks each report against what that machine allows, but it cannot prove it. The draw itself is made on the site’s server, never in a browser.',
  jackpotWinsTitle: 'Last floor jackpots',
  jackpotMore: 'How it works',
  jackpotVoid: 'Void',
  jackpotState: { pending: 'Not in their medals yet', paid: 'In their medals', void: 'Voided' },
  jackpotVoidNote: 'Voiding gives the pool back what the win took over its starting medals, and takes it off the floor. Medals already in that player’s browser stay there.',
};

const ja: FloorStrings = {
  title: 'みんなのフロア',
  lead: 'いま遊んでいるみんなの大当たりと、今日と今週のランキングです。',
  nowTitle: 'フロア速報',
  togetherLead: '今日と今週のランキングと、あなたのフロアへの参加です。',
  moreMoments: 'すべての大当たりとランキング',
  feedTitle: 'フロアのいま',
  feedEmpty: 'いまは静かです。次の大当たりがここに出ます。',
  feedUnavailable: 'いまフロアに接続できません。',
  live: 'ライブ',
  polling: '30秒ごとに更新',
  moment: jaMoment,
  defaultName: (tag) => `プレイヤー${tag}`,
  ago: (seconds) => {
    if (seconds < 45) return 'たったいま';
    if (seconds < 3_600) return `${Math.max(1, Math.floor(seconds / 60))}分前`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}時間前`;
    return `${Math.floor(seconds / 86_400)}日前`;
  },
  rankingsTitle: 'ランキング',
  today: '今日',
  thisWeek: '今週',
  wonBoard: '獲得メダル',
  wonNote: 'すべてのマシンで払い出されたメダルの合計です。',
  bestBoard: 'マシンごとの最大獲得',
  bestNote: '1回の勝負、または1回の当たりで出た最大の枚数です。',
  boardEmpty: 'まだだれもいません。次はあなたかも。',
  medals: (medals) => `${medals}枚`,
  rank: (rank) => `${rank}位`,
  allRankings: 'すべてのランキング',
  backToCenter: 'メダルゲームセンター',
  periodNote: (start) => `1日は日本時間の0時（あなたの時刻で${start}）に始まり、1週間は月曜日に始まります。`,
  honesty:
    'ランキングはお楽しみ用です。メダルは各プレイヤーのブラウザーに保存されているため、ここに出る当たりはプレイヤーのブラウザーからの報告です。マシンが払える枚数や遊べる速さと照らし合わせて確かめていますが、証明はできません。',
  placeTitle: 'フロアへの参加',
  signInToJoin: 'サインインすると、大当たりをフロアに出し、ランキングに参加できます。',
  checking: 'フロアへの参加状況を確認しています…',
  offIntro: 'いまはフロアに参加していません。遊んだ内容はどこにも送られません。参加すると、大当たりがフロアに出て、ランキングに載ります。ほかの人に見えるのは、ニックネームと当たりとその時刻だけです。',
  nameLabel: 'ニックネーム',
  nameHint: '2〜12文字の文字や数字。空のままなら「プレイヤー」と4桁の数字になります。本名やメールアドレスは使わないでください。',
  namePlaceholder: 'プレイヤーと4桁の数字',
  join: 'フロアに参加する',
  joined: (name) => `${name}としてフロアに参加しています。`,
  rename: 'ニックネームを保存',
  leave: 'フロアから抜ける',
  leaveNote: '抜けると、ニックネームは消え、ランキングとフロアからあなたの記録が消えます。',
  blocked: 'このアカウントは、サイトの管理者によってフロアから外されています。',
  saving: '保存しています…',
  failed: 'うまくいきませんでした。もう一度お試しください。',
  refusals: {
    empty: 'ニックネームを入力するか、空のままにして4桁の数字にしてください。',
    short: 'ニックネームは2文字以上にしてください。',
    long: 'ニックネームは12文字までです。',
    characters: '使えるのは文字、数字、スペースと - _ . ・ ー だけです。',
    contact: 'メールアドレス、リンク、電話番号はニックネームにできません。',
    reserved: 'サイトや管理者、ほかのプレイヤーとまぎらわしいニックネームです。',
    abuse: '別のニックネームにしてください。',
  },
  joinedSay: (name) => `${name}としてフロアに参加しました。`,
  leftSay: 'フロアから抜けました。',
  ownerTitle: '管理者',
  hide: '隠す',
  show: '表示',
  block: 'プレイヤーを外す',
  unblock: '外すのをやめる',
  hidden: '非表示',
  hideMoment: 'フロアから外す',
  jackpotTitle: 'フロアジャックポット',
  jackpotUnit: '枚',
  jackpotLead: 'フロア全体でひとつのジャックポットです。フロアに参加しているプレイヤーが対象のマシンで遊んだメダルで増えていき、そのメダルのどれか1枚が全部を当てます。',
  jackpotGuest: 'サインインしてフロアに参加すると、ねらえます。',
  jackpotJoinHere: '下でフロアに参加すると、ねらえます。',
  jackpotJoinThere: 'メダルゲームセンターでフロアに参加すると、ねらえます。',
  jackpotIn: 'フロアに参加中：遊んだメダルがジャックポットを増やし、当たるチャンスにもなります。',
  jackpotUnavailable: 'いまフロアジャックポットに接続できません。',
  jackpotLast: (name, medals, ago) => `前回の当たり：${name}・${medals}枚（${ago}）`,
  jackpotNever: 'まだだれも当てていません。',
  jackpotPaid: (medals) => `フロアジャックポット！${medals}枚が持ちメダルに入りました。`,
  jackpotRules: (share, per, oneIn, seed, back, daily) => [
    `遊んだメダルの${share}がフロアジャックポットに入ります。遊んだメダル${per}枚につき1枚を、サイトが上乗せします。遊んだメダルから引くのではないので、このマシンの還元率は表示のとおりです。`,
    `さらに、遊んだメダル1枚1枚が${oneIn}分の1の確率でジャックポット全部を当てます。当たると${seed}枚からやり直しです。長い目で見ると、遊んだメダル100枚につき${back}枚が戻りますが、それは長い目で見た話で、ほとんどのプレイヤーは当てずに終わります。`,
    `対象は、サインインしてフロアに参加しているプレイヤーが対象のマシンで1日（日本時間）に遊んだメダルの${daily}枚まで。フロアジャックポットは1日1回までです。`,
  ],
  jackpotLinked: (machines) => `対象のマシン：${machines}`,
  jackpotNotLinked: 'このテーブルはフロアジャックポットの対象外です。ここで遊んでも、ジャックポットは増えず、当たりもしません。',
  jackpotRulesOut:
    'このテーブルはフロアジャックポットの対象外です。いちばん良い遊び方では、すでに遊んだメダルのほとんどが戻るため、ここで遊んでもジャックポットは増えず、抽選もありません。本物のフロアと同じく、すべての台がジャックポットにつながっているわけではありません。',
  jackpotHonesty:
    'フロアジャックポットもランキングと同じくお楽しみ用です。ジャックポットを増やす「遊んだメダル」は、プレイヤーのブラウザーからの報告です。マシンが受け付けられる量と照らし合わせて確かめていますが、証明はできません。抽選そのものはサイトのサーバーで行い、ブラウザーでは行いません。',
  jackpotWinsTitle: '最近のフロアジャックポット',
  jackpotMore: 'しくみ',
  jackpotVoid: '無効にする',
  jackpotState: { pending: '持ちメダルに未反映', paid: '持ちメダルに反映済み', void: '無効' },
  jackpotVoidNote: '無効にすると、当たりが始まりの枚数を超えて持っていった分がジャックポットに戻り、フロアからも外れます。そのプレイヤーのブラウザーにすでに入ったメダルはそのままです。',
};

export const getFloorStrings = (language: GameLanguage): FloorStrings => (language === 'ja' ? ja : en);
