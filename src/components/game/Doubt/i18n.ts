/**
 * Doubt (ダウト) - Local UI strings (ja / en).
 *
 * Kept inside the component directory so we don't touch the shared
 * constants/gameTranslations.ts. Use with useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface DoubtStrings {
  // Mode select
  menuBackToGames: string;
  menuTitle: string;
  menuChooseMode: string;
  menuVsAi: string;
  menuOnline: string;
  menuDescription: string;

  title: string;
  subtitle: string;
  gameSetup: string;
  tagline: string;

  // setup
  playVsAi: string;
  yourName: string;
  yourNamePlaceholder: string;
  aiPlayers: string;
  totalPlayers: string;
  difficulty: string;
  startGame: string;
  restart: string;
  back: string;
  newGame: string;

  // difficulty options
  diffEasyLabel: string;
  diffEasyDesc: string;
  diffMediumLabel: string;
  diffMediumDesc: string;
  diffHardLabel: string;
  diffHardDesc: string;
  diffExpertLabel: string;
  diffExpertDesc: string;

  // table / status
  yourTurn: string;
  turnOf: (name: string) => string;
  finished: string;
  nextRank: string;
  phasePlay: string;
  phaseChallenge: string;
  pile: string;
  cards: string;
  cardsCount: (n: number) => string;
  noPileYet: string;
  lastClaim: string;
  claimText: (name: string, count: number, rank: string) => string;
  noClaim: string;

  // controls
  accept: string;
  doubt: string;
  play: string;
  clear: string;
  selected: (n: number) => string;
  dropHint: string;
  decideHint: string;
  playAreaTitle: (rank: string) => string;
  yourHand: string;
  truthHighlight: (rank: string) => string;

  // opponents
  active: string;
  out: string;
  place: (n: number) => string;
  handOf: (n: number) => string;

  // log
  log: string;
  noActions: string;
  logPlayed: (name: string, count: number, rank: string) => string;
  logAccept: (name: string) => string;
  logDoubt: (name: string) => string;
  logTruth: (doubter: string) => string;
  logLie: (claimant: string) => string;
  logFinished: (name: string) => string;

  // results
  results: string;
  youWon: string;
  youPlaced: (n: number) => string;

  // info modal
  howToTitle: string;
  goalTitle: string;
  goalBody: string;
  playTitle: string;
  playBody: string;
  challengeTitle: string;
  challengeBody: string;
  tip: string;

  errorSelectCards: string;
  errorGeneric: string;

  youSuffix: string;
  verdictTruth: string;
  verdictBluff: string;

  // post-game bluff report
  reportTitle: string;
  reportIntro: string;
  reportYourBluffs: string;
  reportBluffsValue: (passed: number, caught: number) => string;
  reportYourDoubts: string;
  reportDoubtsValue: (right: number, wrong: number) => string;
  reportMissed: string;
  reportMissedValue: (n: number) => string;
  reportColPlayer: string;
  reportColClaims: string;
  reportColBluffs: string;
  reportColCaught: string;
  reportColDoubts: string;
  reportColPickedUp: string;
  reportShowClaims: (n: number) => string;
  reportHideClaims: string;
  reportBluffsOnly: string;
  reportNoBluffs: string;
  reportClaimed: (count: number, rank: string) => string;
  reportActualCards: string;
  reportAcceptedBy: (name: string) => string;
  reportDoubtedBy: (doubter: string, taker: string, count: number) => string;
  reportUnchallenged: string;
}

const en: DoubtStrings = {
  menuBackToGames: '← Back to Games',
  menuTitle: 'Doubt (ダウト)',
  menuChooseMode: 'Choose a mode to start playing.',
  menuVsAi: 'Play vs AI (3–6 players)',
  menuOnline: 'Online Room (3–6 players)',
  menuDescription: 'Place 1–4 cards face-down and claim the required rank. If you suspect a bluff, call Doubt!',

  title: 'Doubt',
  subtitle: 'Bluff, read your opponents, and empty your hand first.',
  gameSetup: 'Game setup',
  tagline: 'Place cards face-down, claim a rank — get caught and you eat the pile.',

  playVsAi: 'Play vs AI',
  yourName: 'Your name',
  yourNamePlaceholder: 'You',
  aiPlayers: 'AI opponents',
  totalPlayers: 'total',
  difficulty: 'AI difficulty',
  startGame: 'Start Game',
  restart: 'Restart',
  back: 'Back',
  newGame: 'New Game',

  diffEasyLabel: 'Easy',
  diffEasyDesc: 'Rarely bluffs, seldom doubts. Great for learning.',
  diffMediumLabel: 'Medium',
  diffMediumDesc: 'Bluffs sometimes and challenges obvious lies.',
  diffHardLabel: 'Hard',
  diffHardDesc: 'Counts cards and doubts on probability.',
  diffExpertLabel: 'Expert',
  diffExpertDesc: 'Ruthless card counter, times bluffs to go out.',

  yourTurn: 'Your turn',
  turnOf: (name) => `${name}'s turn`,
  finished: 'Finished',
  nextRank: 'Required rank',
  phasePlay: 'Play',
  phaseChallenge: 'Challenge',
  pile: 'Pile',
  cards: 'cards',
  cardsCount: (n) => `${n} ${n === 1 ? 'card' : 'cards'}`,
  noPileYet: 'No cards on the pile yet',
  lastClaim: 'Last claim',
  claimText: (name, count, rank) => `${name} claimed ${count} × ${rank}`,
  noClaim: '—',

  accept: 'Accept',
  doubt: 'Doubt!',
  play: 'Play',
  clear: 'Clear',
  selected: (n) => `Selected ${n}/4`,
  dropHint: 'Drag cards here or tap to select',
  decideHint: 'Accept the claim, or call Doubt!',
  playAreaTitle: (rank) => `Play area — declare ${rank}`,
  yourHand: 'Your hand',
  truthHighlight: (rank) => `Truthful ${rank}s highlighted`,

  active: 'Active',
  out: 'Out',
  place: (n) => `#${n}`,
  handOf: (n) => `${n} ${n === 1 ? 'card' : 'cards'}`,

  log: 'Game log',
  noActions: 'No actions yet',
  logPlayed: (name, count, rank) => `${name} played ${count} claiming ${rank}`,
  logAccept: (name) => `${name} accepted`,
  logDoubt: (name) => `${name} called DOUBT!`,
  logTruth: (doubter) => `Truth — ${doubter} takes the pile`,
  logLie: (claimant) => `Lie! — ${claimant} takes the pile`,
  logFinished: (name) => `${name} went out`,

  results: 'Results',
  youWon: 'You won! 🏆',
  youPlaced: (n) => `You finished #${n}`,

  howToTitle: 'How to Play Doubt',
  goalTitle: 'Goal',
  goalBody: 'Be the first to get rid of all your cards.',
  playTitle: 'Playing',
  playBody: 'On your turn, place 1–4 cards face-down and declare them as the required rank. The required rank climbs A → 2 → … → K → A each turn, no matter what you actually play.',
  challengeTitle: 'Challenging',
  challengeBody: 'The next player may Accept or call Doubt. If the hidden cards really were the claimed rank, the doubter takes the whole pile. If it was a bluff, the bluffer takes it. Whoever picks up the pile plays next.',
  tip: 'Tip: drag cards from your hand into the play area, or just tap them.',

  errorSelectCards: 'Select 1–4 cards',
  errorGeneric: 'That move is not allowed right now.',

  youSuffix: ' (You)',
  verdictTruth: 'TRUTH',
  verdictBluff: 'BLUFF',

  reportTitle: 'Bluff report',
  reportIntro: 'Every face-down claim of the game, turned face-up.',
  reportYourBluffs: 'Your bluffs',
  reportBluffsValue: (passed, caught) => `${passed} got through · ${caught} caught`,
  reportYourDoubts: 'Your doubts',
  reportDoubtsValue: (right, wrong) => `${right} right · ${wrong} wrong`,
  reportMissed: 'Bluffs you let through',
  reportMissedValue: (n) => `${n}`,
  reportColPlayer: 'Player',
  reportColClaims: 'Claims',
  reportColBluffs: 'Bluffs',
  reportColCaught: 'Caught',
  reportColDoubts: 'Doubts right',
  reportColPickedUp: 'Cards picked up',
  reportShowClaims: (n) => `Show all ${n} claims`,
  reportHideClaims: 'Hide claims',
  reportBluffsOnly: 'Bluffs only',
  reportNoBluffs: 'Nobody bluffed this game.',
  reportClaimed: (count, rank) => `claimed ${count} × ${rank}`,
  reportActualCards: 'Actual cards',
  reportAcceptedBy: (name) => `Accepted by ${name}`,
  reportDoubtedBy: (doubter, taker, count) => `Doubted by ${doubter} — ${taker} picked up ${count}`,
  reportUnchallenged: 'Nobody left to challenge',
};

const ja: DoubtStrings = {
  menuBackToGames: '← ゲーム一覧へ',
  menuTitle: 'ダウト',
  menuChooseMode: 'モードを選んでプレイ開始',
  menuVsAi: 'AI対戦 (3〜6人)',
  menuOnline: 'オンライン対戦 (3〜6人)',
  menuDescription: 'カードを1〜4枚、裏向きに出して決められたランクを宣言します。ブラフだと思ったら「ダウト！」と宣言しましょう。',

  title: 'ダウト',
  subtitle: 'ブラフと読み合いで、いち早く手札を出し切ろう。',
  gameSetup: 'ゲーム設定',
  tagline: 'カードを裏向きに出してランクを宣言。見破られたら山札を引き取り。',

  playVsAi: 'AI と対戦',
  yourName: 'あなたの名前',
  yourNamePlaceholder: 'あなた',
  aiPlayers: 'AI の人数',
  totalPlayers: '合計',
  difficulty: 'AI の強さ',
  startGame: 'ゲーム開始',
  restart: 'リスタート',
  back: '戻る',
  newGame: '新しいゲーム',

  diffEasyLabel: 'かんたん',
  diffEasyDesc: 'ほぼブラフせず、あまり疑わない。練習向け。',
  diffMediumLabel: 'ふつう',
  diffMediumDesc: '時々ブラフし、明らかな嘘は疑う。',
  diffHardLabel: 'むずかしい',
  diffHardDesc: 'カウンティングし、確率で疑う。',
  diffExpertLabel: 'エキスパート',
  diffExpertDesc: '徹底カウンティング。上がり際のブラフが冷酷。',

  yourTurn: 'あなたの番',
  turnOf: (name) => `${name} の番`,
  finished: '終了',
  nextRank: '宣言ランク',
  phasePlay: '出す',
  phaseChallenge: '判定',
  pile: '山札',
  cards: '枚',
  cardsCount: (n) => `${n} 枚`,
  noPileYet: 'まだ山札はありません',
  lastClaim: '直前の宣言',
  claimText: (name, count, rank) => `${name} は ${rank} を ${count} 枚と宣言`,
  noClaim: '—',

  accept: '受け入れる',
  doubt: 'ダウト！',
  play: '出す',
  clear: 'クリア',
  selected: (n) => `選択 ${n}/4`,
  dropHint: 'カードをここにドラッグ、またはタップで選択',
  decideHint: '宣言を受け入れるか、ダウト！を宣言',
  playAreaTitle: (rank) => `プレイエリア — ${rank} を宣言`,
  yourHand: 'あなたの手札',
  truthHighlight: (rank) => `本物の ${rank} を強調表示`,

  active: 'プレイ中',
  out: '上がり',
  place: (n) => `${n} 位`,
  handOf: (n) => `${n} 枚`,

  log: 'ログ',
  noActions: 'まだ操作はありません',
  logPlayed: (name, count, rank) => `${name} が ${rank} を ${count} 枚出した`,
  logAccept: (name) => `${name} が受け入れた`,
  logDoubt: (name) => `${name} がダウト！`,
  logTruth: (doubter) => `本物 — ${doubter} が山札を引き取り`,
  logLie: (claimant) => `嘘！ — ${claimant} が山札を引き取り`,
  logFinished: (name) => `${name} が上がり`,

  results: '結果',
  youWon: 'あなたの勝ち！🏆',
  youPlaced: (n) => `あなたは ${n} 位`,

  howToTitle: 'ダウトの遊び方',
  goalTitle: '目的',
  goalBody: '誰よりも早く手札をすべて出し切りましょう。',
  playTitle: 'カードを出す',
  playBody: '自分の番では 1〜4 枚を裏向きに出し、宣言ランクとして申告します。宣言ランクは実際に出した札に関係なく A → 2 → … → K → A と毎ターン進みます。',
  challengeTitle: '判定',
  challengeBody: '次のプレイヤーは受け入れるか、ダウト！を宣言できます。裏の札が本当に宣言どおりなら、疑った側が山札を全部引き取ります。ブラフだった場合はブラフした側が引き取ります。山札を引き取った人が次に出します。',
  tip: 'ヒント：手札をプレイエリアにドラッグ、またはタップで選べます。',

  errorSelectCards: '1〜4 枚を選んでください',
  errorGeneric: 'その操作は今はできません。',

  youSuffix: '（あなた）',
  verdictTruth: '本物',
  verdictBluff: 'ブラフ',

  reportTitle: 'ブラフの答え合わせ',
  reportIntro: 'このゲームで裏向きに出された札を、すべて表にしました。',
  reportYourBluffs: 'あなたのブラフ',
  reportBluffsValue: (passed, caught) => `成功 ${passed} 回 · 見破られた ${caught} 回`,
  reportYourDoubts: 'あなたのダウト',
  reportDoubtsValue: (right, wrong) => `的中 ${right} 回 · 外れ ${wrong} 回`,
  reportMissed: '見逃したブラフ',
  reportMissedValue: (n) => `${n} 回`,
  reportColPlayer: 'プレイヤー',
  reportColClaims: '宣言',
  reportColBluffs: 'ブラフ',
  reportColCaught: '見破られた',
  reportColDoubts: 'ダウト的中',
  reportColPickedUp: '引き取った枚数',
  reportShowClaims: (n) => `全 ${n} 回の宣言を見る`,
  reportHideClaims: '宣言を閉じる',
  reportBluffsOnly: 'ブラフのみ',
  reportNoBluffs: 'このゲームでは誰もブラフしませんでした。',
  reportClaimed: (count, rank) => `${rank} を ${count} 枚と宣言`,
  reportActualCards: '実際の札',
  reportAcceptedBy: (name) => `${name} が受け入れた`,
  reportDoubtedBy: (doubter, taker, count) => `${doubter} がダウト — ${taker} が ${count} 枚引き取り`,
  reportUnchallenged: '判定する相手なし',
};

/**
 * True when a player's name is just the default "You" / "あなた" (the name used when the field is left empty), so the
 * "(You)" marker next to it would only repeat it.
 */
export function isDefaultYouName(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  return [en, ja].some((s) => s.yourNamePlaceholder.toLowerCase() === trimmed);
}

export function getDoubtStrings(language: GameLanguage): DoubtStrings {
  return language === 'ja' ? ja : en;
}

/** The online lobby (create / join / waiting room). */
export interface DoubtLobbyStrings {
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
  /** Closes the online how-to-play. */
  hostNote: string;
  /** The messages the room hook itself reports, by their English text. A server's own message is shown as sent. */
  errors: Record<string, string>;
}

const LOBBY_STRINGS: Record<GameLanguage, DoubtLobbyStrings> = {
  en: {
    title: 'Doubt (ダウト)',
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
    shareCode: 'Share this code with your friends',
    players: 'Players',
    youSuffix: ' (You)',
    host: 'Host',
    guest: () => 'Guest',
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
    hostNote: 'Note: the host’s device runs the game. Keep the host’s tab open during play.',
    errors: {},
  },
  ja: {
    title: 'ダウト',
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
    guest: () => 'ゲスト',
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
    hostNote: '注: ゲームの進行はホストの端末が管理します。対戦中はホストのタブを開いたままにしてください。',
    errors: {
      'Room was closed': 'ルームが閉じられました',
      'Network error': '通信エラーが発生しました',
      'Failed to create room': 'ルームを作成できませんでした',
      'Failed to join room': 'ルームに参加できませんでした',
    },
  },
};

export function getDoubtLobbyStrings(language: GameLanguage): DoubtLobbyStrings {
  return LOBBY_STRINGS[language] ?? LOBBY_STRINGS.en;
}
