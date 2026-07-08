/**
 * Shichinarabe (七並べ) - local UI strings for the Vs-AI revamp.
 * Kept in the component dir (not the shared gameTranslations) per the revamp spec.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { ShichinarabeAIDifficulty } from './ShichinarabeAI';

export interface ShichinarabeStrings {
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
  aiThinking: (name: string) => string;
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
    aiThinking: (name) => `${name} is thinking…`,
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
    aiThinking: (name) => `${name} が考えています…`,
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

export function getShichinarabeStrings(language: GameLanguage): ShichinarabeStrings {
  return STRINGS[language] ?? STRINGS.en;
}

export const DIFFICULTY_ORDER: ShichinarabeAIDifficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];
