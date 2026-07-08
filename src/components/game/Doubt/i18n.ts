/**
 * Doubt (ダウト) - Local UI strings (ja / en).
 *
 * Kept inside the component directory so we don't touch the shared
 * constants/gameTranslations.ts. Use with useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface DoubtStrings {
  title: string;
  subtitle: string;
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
}

const en: DoubtStrings = {
  title: 'Doubt',
  subtitle: 'Bluff, read your opponents, and empty your hand first.',
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
};

const ja: DoubtStrings = {
  title: 'ダウト',
  subtitle: 'ブラフと読み合いで、いち早く手札を出し切ろう。',
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
};

export function getDoubtStrings(language: GameLanguage): DoubtStrings {
  return language === 'ja' ? ja : en;
}
