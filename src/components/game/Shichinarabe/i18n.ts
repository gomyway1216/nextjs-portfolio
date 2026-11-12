/**
 * Shichinarabe (七並べ) - local UI strings for the Vs-AI revamp.
 * Kept in the component dir (not the shared gameTranslations) per the revamp spec.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { ShichinarabeAIDifficulty } from './ShichinarabeAI';
import type { ShichinarabeHintReason } from './ShichinarabeHint';

export interface ShichinarabeStrings {
  // Mode select
  menuBackToGames: string;
  menuTitle: string;
  menuChooseMode: string;
  menuVsAi: string;
  menuOnline: string;
  menuDescription: string;
  title: string;
  subtitle: string;
  yourName: string;
  namePlaceholder: string;
  opponents: string;
  totalPlayers: (n: number) => string;
  difficulty: string;
  start: string;
  back: string;
  newGame: string;
  restart: string;
  pass: string;
  play: string;
  clear: string;
  yourTurn: string;
  waitingTurn: (name: string) => string;
  finished: string;
  results: string;
  table: string;
  yourHand: string;
  selectCard: string;
  selected: (label: string) => string;
  activityLog: string;
  noActions: string;
  cardsLeft: (n: number) => string;
  passesLabel: (used: number, max: number) => string;
  statusActive: string;
  statusFinished: string;
  statusEliminated: string;
  place: (n: number) => string;
  you: string;
  noLegalMove: string;
  legalHint: string;
  notYourTurn: string;
  selectCardFirst: string;
  playerCountError: string;
  aiThinking: (name: string) => string;
  hint: string;
  hintPlay: (card: string) => string;
  hintPass: string;
  hintReasons: Record<ShichinarabeHintReason, (ownCardsBehind: number) => string>;
  // Log verbs
  logPlayed: (name: string, card: string) => string;
  logPassed: (name: string, used: number, max: number) => string;
  logEliminated: (name: string) => string;
  logRevealed: (name: string, card: string) => string;
  logStart: string;
  logFinish: string;
  winnerBanner: (name: string) => string;
  youWin: string;
  youPlaced: (n: number) => string;
  // Info modal
  howToTitle: string;
  goalHeading: string;
  goalBody: string;
  setupHeading: string;
  setupBody: string;
  playHeading: string;
  playBody: string;
  passHeading: string;
  passBody: (max: number) => string;
  tipHeading: string;
  tipBody: string;
  difficultyNames: Record<ShichinarabeAIDifficulty, string>;
  difficultyDescs: Record<ShichinarabeAIDifficulty, string>;
}

export const STRINGS: Record<GameLanguage, ShichinarabeStrings> = {
  en: {
    menuBackToGames: '← Back to Games',
    menuTitle: 'Shichinarabe (七並べ)',
    menuChooseMode: 'Choose a mode to start playing.',
    menuVsAi: 'Play vs AI (3–6 players)',
    menuOnline: 'Online Room (3–6 players)',
    menuDescription: 'AI mode lets you choose how many AI opponents to include (minimum 2, maximum 5). Online mode uses room codes to play with friends (3–6 players).',
    title: 'Sevens vs AI',
    subtitle: 'Empty your hand first. Build each suit outward from the seven.',
    yourName: 'Your name',
    namePlaceholder: 'You',
    opponents: 'AI opponents',
    totalPlayers: (n) => `${n} players total`,
    difficulty: 'AI difficulty',
    start: 'Start game',
    back: 'Back',
    newGame: 'New game',
    restart: 'Restart',
    pass: 'Pass',
    play: 'Play card',
    clear: 'Clear',
    yourTurn: 'Your turn',
    waitingTurn: (name) => `${name}'s turn`,
    finished: 'Game over',
    results: 'Final standings',
    table: 'Tableau',
    yourHand: 'Your hand',
    selectCard: 'Tap a highlighted card to play it',
    selected: (label) => `Selected ${label}`,
    activityLog: 'Activity',
    noActions: 'No moves yet',
    cardsLeft: (n) => `${n} ${n === 1 ? 'card' : 'cards'}`,
    passesLabel: (used, max) => `Pass ${used}/${max}`,
    statusActive: 'Active',
    statusFinished: 'Out (won)',
    statusEliminated: 'Eliminated',
    place: (n) => `#${n}`,
    you: 'You',
    noLegalMove: 'No legal move — you must pass',
    legalHint: 'Green cards are legal to play',
    notYourTurn: 'Not your turn',
    selectCardFirst: 'Select a card',
    playerCountError: 'Total players must be between 3 and 6.',
    aiThinking: (name) => `${name} is thinking…`,
    hint: 'Hint',
    hintPlay: (card) => `Hint: play ${card}.`,
    hintPass: 'Hint: pass.',
    hintReasons: {
      forcedPass: () => 'None of your cards fits the table.',
      hold: () => 'Every card you could play would hand an opponent their next move, and you have passes to spare.',
      onlyMove: () => 'It is your only legal card, and playing beats spending a pass.',
      unblocksOwn: (n) => `It opens the way for ${n} more of your own ${n === 1 ? 'card' : 'cards'} in that suit.`,
      deadEnd: () => 'It ends that row, so nobody gains a new place to play.',
      safe: () => 'No opponent is likely to hold the card that follows it.',
      leastHarm: () => 'It may open a slot for an opponent, but of your legal cards it costs you the least.',
    },
    logPlayed: (name, card) => `${name} played ${card}`,
    logPassed: (name, used, max) => `${name} passed (${used}/${max})`,
    logEliminated: (name) => `${name} was eliminated`,
    logRevealed: (name, card) => `${name}'s ${card} revealed`,
    logStart: 'Game started',
    logFinish: 'Game finished',
    winnerBanner: (name) => `${name} goes out first!`,
    youWin: 'You win! 🎉',
    youPlaced: (n) => `You finished #${n}`,
    howToTitle: 'How to play Sevens',
    goalHeading: 'Goal',
    goalBody: 'Be the first to play every card in your hand.',
    setupHeading: 'Setup',
    setupBody: 'All four 7s start on the table. Each suit grows outward from its 7.',
    playHeading: 'Playing',
    playBody: 'On your turn, play one card that sits directly next to a suit’s current run (a 6 or 8 beside a 7, then 5 or 9, and so on).',
    passHeading: 'Passing',
    passBody: (max) => `If you can’t (or choose not to) play, you pass. Passing ${max} times eliminates you and your remaining cards are revealed onto the table.`,
    tipHeading: 'Strategy',
    tipBody: 'Holding a card near a 7 stalls opponents who are waiting behind it — but every pass spends toward your own elimination.',
    difficultyNames: {
      easy: 'Beginner',
      medium: 'Casual',
      hard: 'Skilled',
      expert: 'Expert',
      master: 'Master',
    },
    difficultyDescs: {
      easy: 'Plays randomly, never blocks.',
      medium: 'Greedily extends its own runs.',
      hard: 'Avoids gifting opponents easy plays.',
      expert: 'Holds back key blocking cards.',
      master: 'Ruthless blocking and end-game racing.',
    },
  },
  ja: {
    menuBackToGames: '← ゲーム一覧へ',
    menuTitle: '七並べ',
    menuChooseMode: 'モードを選んでプレイ開始',
    menuVsAi: 'AI対戦 (3〜6人)',
    menuOnline: 'オンライン対戦 (3〜6人)',
    menuDescription: 'AIモードではAI対戦相手の人数を選べます（2〜5人）。オンラインモードではルームコードを共有して友達と対戦できます（3〜6人）。',
    title: '七並べ vs AI',
    subtitle: '手札を最初になくそう。7から外側へ各スートを並べていきます。',
    yourName: 'あなたの名前',
    namePlaceholder: 'あなた',
    opponents: 'AIの人数',
    totalPlayers: (n) => `合計 ${n} 人`,
    difficulty: 'AIの強さ',
    start: 'ゲーム開始',
    back: '戻る',
    newGame: '新しいゲーム',
    restart: 'もう一度',
    pass: 'パス',
    play: 'カードを出す',
    clear: '選択解除',
    yourTurn: 'あなたの番',
    waitingTurn: (name) => `${name} の番`,
    finished: 'ゲーム終了',
    results: '最終順位',
    table: '場',
    yourHand: 'あなたの手札',
    selectCard: '光っているカードをタップして出します',
    selected: (label) => `選択中：${label}`,
    activityLog: '履歴',
    noActions: 'まだ手はありません',
    cardsLeft: (n) => `残り ${n} 枚`,
    passesLabel: (used, max) => `パス ${used}/${max}`,
    statusActive: 'プレイ中',
    statusFinished: 'あがり',
    statusEliminated: '脱落',
    place: (n) => `${n}位`,
    you: 'あなた',
    noLegalMove: '出せるカードがありません。パスしてください',
    legalHint: '緑のカードが出せます',
    notYourTurn: 'あなたの番ではありません',
    selectCardFirst: 'カードを選んでください',
    playerCountError: '合計人数は3〜6人にしてください。',
    aiThinking: (name) => `${name} が考えています…`,
    hint: 'ヒント',
    hintPlay: (card) => `ヒント：${card} を出しましょう。`,
    hintPass: 'ヒント：パスしましょう。',
    hintReasons: {
      forcedPass: () => '場に出せるカードがありません。',
      hold: () => 'どのカードを出しても相手の次の一手を助けてしまいます。パスにはまだ余裕があります。',
      onlyMove: () => '出せるのはこの1枚だけです。パスを使うより出すほうが得です。',
      unblocksOwn: (n) => `同じスートの自分のカードがあと ${n} 枚、出せるようになっていきます。`,
      deadEnd: () => 'その列はここで終わるので、誰にも新しい出し場所を与えません。',
      safe: () => '次に続くカードを相手が持っている可能性は低いです。',
      leastHarm: () => '相手に出し場所を与えるかもしれませんが、出せるカードの中ではいちばん損が少ない手です。',
    },
    logPlayed: (name, card) => `${name} が ${card} を出しました`,
    logPassed: (name, used, max) => `${name} がパス（${used}/${max}）`,
    logEliminated: (name) => `${name} が脱落しました`,
    logRevealed: (name, card) => `${name} の ${card} が場に出ました`,
    logStart: 'ゲーム開始',
    logFinish: 'ゲーム終了',
    winnerBanner: (name) => `${name} が最初にあがりました！`,
    youWin: 'あなたの勝ち！🎉',
    youPlaced: (n) => `あなたは ${n} 位でした`,
    howToTitle: '七並べの遊び方',
    goalHeading: '目的',
    goalBody: '手札をいちばん早くすべて出しきることを目指します。',
    setupHeading: '準備',
    setupBody: '4枚の7が最初から場に置かれます。各スートは7から外側へ伸びていきます。',
    playHeading: '出し方',
    playBody: '自分の番に、場のスートの列の隣に続くカードを1枚出します（7の隣に6か8、次に5か9…）。',
    passHeading: 'パス',
    passBody: (max) => `出せない、または出したくないときはパスします。${max} 回パスすると脱落し、残りの手札は場に公開されます。`,
    tipHeading: '戦略',
    tipBody: '7の近くのカードを止めると、その先を待つ相手を足止めできます。ただしパスは自分の脱落にも近づきます。',
    difficultyNames: {
      easy: '初級',
      medium: 'カジュアル',
      hard: '中級',
      expert: '上級',
      master: '達人',
    },
    difficultyDescs: {
      easy: 'ランダムに出し、止めません。',
      medium: '自分の列を貪欲に伸ばします。',
      hard: '相手に楽な手を与えないよう配慮します。',
      expert: '要となるカードを止めて足止めします。',
      master: '容赦ない足止めと終盤の駆け引き。',
    },
  },
};

/**
 * True when a player's name is just the default "You" / "あなた" (the name used when the field is left empty), so a
 * "(You)" marker next to it would only repeat it.
 */
export function isDefaultYouName(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  return Object.values(STRINGS).some((s) => s.namePlaceholder.toLowerCase() === trimmed || s.you.toLowerCase() === trimmed);
}

export function getShichinarabeStrings(language: GameLanguage): ShichinarabeStrings {
  return STRINGS[language] ?? STRINGS.en;
}

export const DIFFICULTY_ORDER: ShichinarabeAIDifficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

/** The online lobby (create / join / waiting room). */
export interface ShichinarabeLobbyStrings {
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

const LOBBY_STRINGS: Record<GameLanguage, ShichinarabeLobbyStrings> = {
  en: {
    title: 'Shichinarabe (七並べ)',
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
    title: '七並べ',
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

export function getShichinarabeLobbyStrings(language: GameLanguage): ShichinarabeLobbyStrings {
  return LOBBY_STRINGS[language] ?? LOBBY_STRINGS.en;
}
