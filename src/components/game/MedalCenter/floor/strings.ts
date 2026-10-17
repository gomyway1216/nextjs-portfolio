/**
 * The medal floor's words, in English and Japanese: the live feed, the
 * rankings and a player's place on the floor. As everywhere in the medal
 * center, nothing may read as money: medals are medals (「メダル」), and no
 * bank's or cashier's word is used.
 */

import type { GameLanguage } from '../../constants/gameTranslations';
import type { NameRefusal } from '@/lib/medalFloor/names';

export interface FloorStrings {
  title: string;
  lead: string;
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
    default:
      return `${medals}枚の当たり`;
  }
};

const en: FloorStrings = {
  title: 'TOGETHER ON THE FLOOR',
  lead: 'Big wins from everyone playing right now, and today’s and this week’s rankings.',
  feedTitle: 'Just now on the floor',
  feedEmpty: 'Quiet for now. The next big win shows up here.',
  feedUnavailable: 'The floor cannot be reached just now.',
  live: 'Live',
  polling: 'Updated every 30 seconds',
  moment: enMoment,
  defaultName: (tag) => `Player ${tag}`,
  ago: (seconds) => {
    if (seconds < 45) return 'just now';
    if (seconds < 3_600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
    if (seconds < 86_400) return `${Math.round(seconds / 3_600)} h ago`;
    return `${Math.round(seconds / 86_400)} d ago`;
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
};

const ja: FloorStrings = {
  title: 'みんなのフロア',
  lead: 'いま遊んでいるみんなの大当たりと、今日と今週のランキングです。',
  feedTitle: 'フロアのいま',
  feedEmpty: 'いまは静かです。次の大当たりがここに出ます。',
  feedUnavailable: 'いまフロアに接続できません。',
  live: 'ライブ',
  polling: '30秒ごとに更新',
  moment: jaMoment,
  defaultName: (tag) => `プレイヤー${tag}`,
  ago: (seconds) => {
    if (seconds < 45) return 'たったいま';
    if (seconds < 3_600) return `${Math.max(1, Math.round(seconds / 60))}分前`;
    if (seconds < 86_400) return `${Math.round(seconds / 3_600)}時間前`;
    return `${Math.round(seconds / 86_400)}日前`;
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
};

export const getFloorStrings = (language: GameLanguage): FloorStrings => (language === 'ja' ? ja : en);
