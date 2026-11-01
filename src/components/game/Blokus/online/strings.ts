/**
 * Bilingual (ja/en) strings for playing Blokus online. Colour names come from
 * the game's own strings, so a colour is called the same thing on the board.
 */

import type { GameLanguage } from '../../constants/gameTranslations';
import type { Mode } from '../engine';

export interface BlokusOnlineStrings {
  title: string;
  subtitle: string;
  back: string;
  yourName: string;
  board: string;
  modes: Record<Mode, { label: string; description: string }>;
  createTitle: string;
  create: string;
  creating: string;
  joinTitle: string;
  roomCode: string;
  roomPassword: string;
  join: string;
  joining: string;
  reconnecting: string;
  invitedTo: (code: string) => string;
  waitingTitle: string;
  boardIs: (board: string) => string;
  inviteTitle: string;
  inviteHint: string;
  inviteLink: string;
  copyLink: string;
  linkCopied: string;
  copyFailed: string;
  share: string;
  shareText: string;
  seatsTitle: (players: number, most: number) => string;
  you: string;
  host: string;
  ready: string;
  notReady: string;
  connected: string;
  away: string;
  openSeat: string;
  sharedColor: (color: string) => string;
  sharedHint: string;
  twoColorHint: string;
  oneColorHint: string;
  colorTitle: string;
  holder: { you: string; shared: string; open: string };
  takeColor: (color: string, holder: string) => string;
  setReady: string;
  cancelReady: string;
  start: string;
  needPlayers: string;
  needReady: string;
  waitingForHost: string;
  leave: string;
  leaveAsk: string;
  leaveYes: string;
  stay: string;
  turnOf: (name: string) => string;
  yourTurn: string;
  timeLeft: (seconds: number) => string;
  leftGame: string;
  roomLabel: (code: string) => string;
  seatsLabel: string;
  win: string;
  tie: string;
  lose: string;
  winnerIs: (name: string) => string;
  points: (score: number) => string;
  rematch: string;
  rematchWait: string;
  errors: Record<string, string>;
  errorFallback: string;
}

const en: BlokusOnlineStrings = {
  title: 'Play online with friends',
  subtitle: 'Two to four players. Send a link, pick colours, and play from anywhere.',
  back: 'Back',
  yourName: 'Your name',
  board: 'Board',
  modes: {
    classic: { label: 'Classic', description: '20×20, for 2, 3 or 4 players' },
    duo: { label: 'Duo', description: '14×14, for exactly 2 players' },
  },
  createTitle: 'Start a room',
  create: 'Create room',
  creating: 'Creating the room…',
  joinTitle: 'Join with a code',
  roomCode: 'Room code',
  roomPassword: 'Password',
  join: 'Join',
  joining: 'Joining the room…',
  reconnecting: 'Getting back to your room…',
  invitedTo: (code) => `You're invited to room ${code}.`,
  waitingTitle: 'Waiting room',
  boardIs: (board) => `Board: ${board}`,
  inviteTitle: 'Invite your friends',
  inviteHint: 'Send them the link. Or read out the code and password below.',
  inviteLink: 'Invite link',
  copyLink: 'Copy link',
  linkCopied: 'Link copied.',
  copyFailed: "Couldn't copy. Select the link and copy it by hand.",
  share: 'Share',
  shareText: 'Join my Blokus game',
  seatsTitle: (players, most) => `Players (${players} of up to ${most})`,
  you: 'You',
  host: 'Host',
  ready: 'Ready',
  notReady: 'Not ready',
  connected: 'Connected',
  away: 'Not connected',
  openSeat: 'Waiting for a player…',
  sharedColor: (color) => `Shared colour: ${color}`,
  sharedHint: 'Three players take turns with the fourth colour. It scores for nobody.',
  twoColorHint: 'Two players play two colours each, on opposite corners, added together.',
  oneColorHint: 'One colour each.',
  colorTitle: 'Your colour',
  holder: { you: 'You', shared: 'Shared', open: 'Free' },
  takeColor: (color, holder) => `${color}, now ${holder}`,
  setReady: "I'm ready",
  cancelReady: 'Not ready yet',
  start: 'Start the game',
  needPlayers: 'It takes at least two players.',
  needReady: 'Everyone has to be ready first.',
  waitingForHost: 'Waiting for the host to start…',
  leave: 'Leave room',
  leaveAsk: 'Leave for good? Your colours will pass for the rest of the game.',
  leaveYes: 'Yes, leave',
  stay: 'Stay',
  turnOf: (name) => `${name}'s turn`,
  yourTurn: 'Your turn',
  timeLeft: (seconds) => `${seconds} seconds left in this turn`,
  leftGame: 'Left the game',
  roomLabel: (code) => `Room ${code}`,
  seatsLabel: 'Players',
  win: 'You win!',
  tie: 'A tie for first',
  lose: 'Game over',
  winnerIs: (name) => `${name} wins`,
  points: (score) => `${score > 0 ? '+' : ''}${score}`,
  rematch: 'Play again',
  rematchWait: 'The host can start another game.',
  errors: {
    'Room not found': 'No room has that code.',
    'Incorrect password': "That password doesn't match the room.",
    'Game already in progress': 'That game has already started.',
    'Room is full': 'That room is full.',
    'Room was closed': 'The room has closed.',
    'All players must be ready': 'Everyone has to be ready first.',
    'Network error': "Couldn't reach the server. Check your connection and try again.",
    'stale-turn': 'The board moved on before that arrived. Have another look.',
    'not-your-turn': "It isn't your turn.",
    'illegal-move': "That piece can't go there.",
    'too-early': 'This turn still has time left.',
    'not-host': 'Only the host can do that.',
    'not-member': "You aren't in this room any more.",
    'not-playing': 'The game is not in play.',
    'not-waiting': 'The game has already started.',
    'not-finished': 'The game is still going.',
    'bad-color': "That colour can't be picked.",
  },
  errorFallback: 'Something went wrong. Please try again.',
};

const ja: BlokusOnlineStrings = {
  title: '友だちとオンライン対戦',
  subtitle: '2〜4人で遊べます。リンクを送って色を選べば、離れていても対戦できます。',
  back: '戻る',
  yourName: 'あなたの名前',
  board: '盤',
  modes: {
    classic: { label: 'クラシック', description: '20×20、2〜4人' },
    duo: { label: 'デュオ', description: '14×14、ちょうど2人' },
  },
  createTitle: 'ルームを作る',
  create: 'ルームを作成',
  creating: 'ルームを作っています…',
  joinTitle: 'コードで参加',
  roomCode: 'ルームコード',
  roomPassword: 'パスワード',
  join: '参加する',
  joining: 'ルームに参加しています…',
  reconnecting: 'ルームに戻っています…',
  invitedTo: (code) => `ルーム ${code} に招待されています。`,
  waitingTitle: '待合室',
  boardIs: (board) => `盤：${board}`,
  inviteTitle: '友だちを招待',
  inviteHint: 'リンクを送ってください。下のコードとパスワードを伝えても参加できます。',
  inviteLink: '招待リンク',
  copyLink: 'リンクをコピー',
  linkCopied: 'リンクをコピーしました。',
  copyFailed: 'コピーできませんでした。リンクを選択して手動でコピーしてください。',
  share: '共有',
  shareText: 'ブロックスで対戦しよう',
  seatsTitle: (players, most) => `プレイヤー（${players}人／最大${most}人）`,
  you: 'あなた',
  host: 'ホスト',
  ready: '準備OK',
  notReady: '準備中',
  connected: '接続中',
  away: '未接続',
  openSeat: 'プレイヤーを待っています…',
  sharedColor: (color) => `共有の色：${color}`,
  sharedHint: '3人のときは、4色目を順番に動かします。この色の点は誰にも入りません。',
  twoColorHint: '2人のときは、向かい合う角の2色ずつを動かし、点を合計します。',
  oneColorHint: '1人1色です。',
  colorTitle: 'あなたの色',
  holder: { you: 'あなた', shared: '共有', open: '空き' },
  takeColor: (color, holder) => `${color}、現在は${holder}`,
  setReady: '準備OK',
  cancelReady: '準備を取り消す',
  start: 'ゲームを始める',
  needPlayers: '2人以上そろうと始められます。',
  needReady: '全員の準備が整うと始められます。',
  waitingForHost: 'ホストの開始を待っています…',
  leave: 'ルームを出る',
  leaveAsk: '本当に抜けますか？あなたの色は残りのゲームでパスになります。',
  leaveYes: '抜ける',
  stay: '続ける',
  turnOf: (name) => `${name}の番`,
  yourTurn: 'あなたの番',
  timeLeft: (seconds) => `この番の残り${seconds}秒`,
  leftGame: '退出しました',
  roomLabel: (code) => `ルーム ${code}`,
  seatsLabel: 'プレイヤー',
  win: 'あなたの勝ち！',
  tie: '同点で1位',
  lose: 'ゲーム終了',
  winnerIs: (name) => `${name}の勝ち`,
  points: (score) => `${score > 0 ? '+' : ''}${score}点`,
  rematch: 'もう一度遊ぶ',
  rematchWait: 'ホストが次のゲームを始められます。',
  errors: {
    'Room not found': 'そのコードのルームはありません。',
    'Incorrect password': 'パスワードが違います。',
    'Game already in progress': 'このゲームはすでに始まっています。',
    'Room is full': 'このルームは満員です。',
    'Room was closed': 'ルームが閉じられました。',
    'All players must be ready': '全員の準備が整うと始められます。',
    'Network error': 'サーバーに接続できません。通信を確認してもう一度お試しください。',
    'stale-turn': '届く前に盤面が進みました。もう一度確認してください。',
    'not-your-turn': 'あなたの番ではありません。',
    'illegal-move': 'そこには置けません。',
    'too-early': 'この番にはまだ時間が残っています。',
    'not-host': 'ホストだけが操作できます。',
    'not-member': 'このルームから退出しています。',
    'not-playing': 'ゲームは進行中ではありません。',
    'not-waiting': 'ゲームはすでに始まっています。',
    'not-finished': 'ゲームはまだ続いています。',
    'bad-color': 'その色は選べません。',
  },
  errorFallback: 'うまくいきませんでした。もう一度お試しください。',
};

export const getBlokusOnlineStrings = (language: GameLanguage): BlokusOnlineStrings => (language === 'ja' ? ja : en);

/** The words for a code or message from the hook's `error`. */
export const errorText = (t: BlokusOnlineStrings, error: string): string => t.errors[error] ?? t.errorFallback;
