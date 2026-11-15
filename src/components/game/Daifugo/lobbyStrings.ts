/**
 * Daifugo (大富豪) - the online lobby's own strings (ja / en), kept in the component directory.
 * Use with useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';

/** The online lobby (create / join / waiting room). */
export interface DaifugoLobbyStrings {
  title: string;
  intro: (min: number, max: number) => string;
  createRoom: string;
  joinRoom: string;
  yourName: string;
  roomPassword: string;
  roomCode: string;
  back: string;
  create: string;
  creating: string;
  join: string;
  joining: string;
  waitingRoom: string;
  shareCode: string;
  players: string;
  youSuffix: string;
  host: string;
  /** The seat's label under a player who is not the host. */
  guest: (seat: number) => string;
  ready: string;
  notReady: string;
  /** The button that takes "ready" back. */
  cancelReady: string;
  needMore: (missing: number, min: number, max: number) => string;
  roomFull: (max: number) => string;
  leave: string;
  startGame: string;
  waitingForHost: string;
  creatingRoom: string;
  joiningRoom: string;
  backToMenu: string;
  /** The messages the room hook itself reports, by their English text. A server's own message is shown as sent. */
  errors: Record<string, string>;
}

const LOBBY_STRINGS: Record<GameLanguage, DaifugoLobbyStrings> = {
  en: {
    title: 'Daifugo (大富豪)',
    intro: (min, max) => `Online mode (${min}–${max} players). Create a room, share the code, and play together.`,
    createRoom: 'Create Room',
    joinRoom: 'Join Room',
    yourName: 'Your Name',
    roomPassword: 'Room Password',
    roomCode: 'Room Code',
    back: 'Back',
    create: 'Create',
    creating: 'Creating...',
    join: 'Join',
    joining: 'Joining...',
    waitingRoom: 'Waiting Room',
    shareCode: 'Share this code with your friend',
    players: 'Players',
    youSuffix: ' (You)',
    host: 'Host',
    guest: (seat) => `Player ${seat}`,
    ready: 'Ready',
    notReady: 'Not Ready',
    cancelReady: 'Not Ready',
    needMore: (missing, min, max) => `Need ${missing} more player(s) (min ${min}, max ${max})`,
    roomFull: (max) => `Room is full (${max}/${max})`,
    leave: 'Leave',
    startGame: 'Start Game',
    waitingForHost: 'Waiting for host to start...',
    creatingRoom: 'Creating room...',
    joiningRoom: 'Joining room...',
    backToMenu: 'Back to Menu',
    errors: {},
  },
  ja: {
    title: '大富豪',
    intro: (min, max) => `オンライン対戦（${min}〜${max}人）。ルームを作ってコードを共有し、一緒に遊びましょう。`,
    createRoom: 'ルームを作る',
    joinRoom: 'ルームに参加',
    yourName: 'あなたの名前',
    roomPassword: 'ルームのパスワード',
    roomCode: 'ルームコード',
    back: '戻る',
    create: '作成',
    creating: '作成中…',
    join: '参加',
    joining: '参加中…',
    waitingRoom: '待合室',
    shareCode: 'このコードを友達に伝えてください',
    players: 'プレイヤー',
    youSuffix: '（あなた）',
    host: 'ホスト',
    guest: (seat) => `プレイヤー${seat}`,
    ready: '準備OK',
    notReady: '準備中',
    cancelReady: '準備を取り消す',
    needMore: (missing, min, max) => `あと${missing}人必要です（${min}〜${max}人）`,
    roomFull: (max) => `満員です（${max}/${max}）`,
    leave: '退出',
    startGame: 'ゲーム開始',
    waitingForHost: 'ホストの開始を待っています…',
    creatingRoom: 'ルームを作成中…',
    joiningRoom: 'ルームに参加中…',
    backToMenu: 'メニューに戻る',
    errors: {
      'Room was closed': 'ルームが閉じられました',
      'Network error': '通信エラーが発生しました',
      'Failed to create room': 'ルームを作成できませんでした',
      'Failed to join room': 'ルームに参加できませんでした',
    },
  },
};

export function getDaifugoLobbyStrings(language: GameLanguage): DaifugoLobbyStrings {
  return LOBBY_STRINGS[language] ?? LOBBY_STRINGS.en;
}
