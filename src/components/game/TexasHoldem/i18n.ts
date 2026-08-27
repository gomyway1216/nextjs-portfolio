import type { GameLanguage } from '../constants/gameTranslations';
import type { HandCategoryName, Street } from './engine';

export interface HoldemStrings {
  title: string;
  eyebrow: string;
  subtitle: string;
  gtoBadge: string;
  setup: {
    title: string;
    copy: string;
    players: string;
    decreasePlayers: string;
    increasePlayers: string;
    totalSeats: string;
    stack: string;
    blinds: string;
    start: string;
  };
  table: {
    pot: string;
    hand: string;
    dealer: string;
    smallBlind: string;
    bigBlind: string;
    you: string;
    thinking: string;
    runout: string;
    folded: string;
    allIn: string;
    actionLog: string;
    trainingHud: string;
    potOdds: string;
    toCall: string;
    stackToPot: string;
    noBet: string;
  };
  actions: {
    fold: string;
    check: string;
    call: string;
    bet: string;
    raise: string;
    raiseTo: string;
    allIn: string;
    nextHand: string;
    newTable: string;
    rules: string;
    soundOn: string;
    soundOff: string;
  };
  result: {
    title: string;
    winner: string;
    wins: string;
    split: string;
    uncontested: string;
    mainPot: string;
    sidePot: string;
  };
  info: {
    title: string;
    intro: string;
    bullets: string[];
    honestyTitle: string;
    honesty: string;
  };
  streets: Record<Street, string>;
  hands: Record<HandCategoryName, string>;
  log: {
    hand: string;
    posts: string;
    checks: string;
    folds: string;
    calls: string;
    bets: string;
    raises: string;
    street: string;
    collects: string;
  };
}

const en: HoldemStrings = {
  title: "Texas Hold'em",
  eyebrow: 'NO-LIMIT CASH LAB',
  subtitle: 'Play 100bb cash against up to seven range-aware CPU opponents.',
  gtoBadge: 'GTO-inspired mixed strategy',
  setup: {
    title: 'Build the table',
    copy: 'You always take seat 1. Add one to seven CPU seats for heads-up through 8-max play.',
    players: 'Players',
    decreasePlayers: 'Remove a CPU seat',
    increasePlayers: 'Add a CPU seat',
    totalSeats: 'total seats',
    stack: 'Starting stack',
    blinds: 'Blinds',
    start: 'Take a seat',
  },
  table: {
    pot: 'Pot',
    hand: 'Hand',
    dealer: 'Dealer',
    smallBlind: 'Small blind',
    bigBlind: 'Big blind',
    you: 'You',
    thinking: 'Calculating range…',
    runout: 'Running the board one card at a time…',
    folded: 'Folded',
    allIn: 'All-in',
    actionLog: 'Action log',
    trainingHud: 'Decision HUD',
    potOdds: 'Pot odds',
    toCall: 'To call',
    stackToPot: 'SPR',
    noBet: 'Free option',
  },
  actions: {
    fold: 'Fold',
    check: 'Check',
    call: 'Call',
    bet: 'Bet',
    raise: 'Raise',
    raiseTo: 'Raise to',
    allIn: 'All-in',
    nextHand: 'Deal next hand',
    newTable: 'New table',
    rules: 'Model & rules',
    soundOn: 'Sound on',
    soundOff: 'Mute sound',
  },
  result: {
    title: 'Hand complete',
    winner: 'Winner',
    wins: 'wins',
    split: 'split the pot',
    uncontested: 'Everyone else folded',
    mainPot: 'Main pot',
    sidePot: 'Side pot',
  },
  info: {
    title: 'Model & table rules',
    intro: 'A complete local no-limit Hold’em table with one human and up to seven CPU players.',
    bullets: [
      '100bb starting stacks, 1 / 2 blinds, no ante and no rake.',
      'Correct dealer and blind rotation, heads-up rules, minimum raises, short all-ins and side pots.',
      'CPU cards stay private. Decisions use only public actions, the board and that CPU’s own cards.',
      'CPU play combines position ranges, mixed frequencies, pot odds, sampled equity, SPR and polarized sizing.',
    ],
    honestyTitle: 'What “GTO-inspired” means',
    honesty: 'Exact 8-max no-limit Hold’em is not solved. This CPU follows solver principles and balanced frequencies, but it is not a commercial solver or a claim of perfect GTO play.',
  },
  streets: { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', complete: 'Showdown' },
  hands: {
    'straight-flush': 'Straight flush',
    'four-of-a-kind': 'Four of a kind',
    'full-house': 'Full house',
    flush: 'Flush',
    straight: 'Straight',
    'three-of-a-kind': 'Three of a kind',
    'two-pair': 'Two pair',
    'one-pair': 'One pair',
    'high-card': 'High card',
  },
  log: {
    hand: 'Hand #{{amount}} begins',
    posts: '{{player}} posts {{blind}} {{amount}}',
    checks: '{{player}} checks',
    folds: '{{player}} folds',
    calls: '{{player}} calls {{amount}}',
    bets: '{{player}} bets {{amount}}',
    raises: '{{player}} raises to {{amount}}',
    street: '{{street}} dealt',
    collects: '{{player}} collects {{amount}}',
  },
};

const ja: HoldemStrings = {
  title: 'テキサスホールデム',
  eyebrow: 'ノーリミット・キャッシュラボ',
  subtitle: 'レンジを意識するCPU最大7人と、100BBの本格キャッシュゲーム。',
  gtoBadge: 'GTO原則に基づく混合戦略',
  setup: {
    title: 'テーブルを作る',
    copy: 'あなたは常にシート1。CPUを1〜7人追加し、ヘッズアップから8-maxまで遊べます。',
    players: '参加人数',
    decreasePlayers: 'CPU席を1つ減らす',
    increasePlayers: 'CPU席を1つ増やす',
    totalSeats: '席（あなたを含む）',
    stack: '開始スタック',
    blinds: 'ブラインド',
    start: '着席する',
  },
  table: {
    pot: 'ポット',
    hand: 'ハンド',
    dealer: 'ディーラー',
    smallBlind: 'スモールブラインド',
    bigBlind: 'ビッグブラインド',
    you: 'あなた',
    thinking: 'レンジを計算中…',
    runout: 'ボードを1枚ずつ公開中…',
    folded: 'フォールド',
    allIn: 'オールイン',
    actionLog: 'アクションログ',
    trainingHud: '判断HUD',
    potOdds: 'ポットオッズ',
    toCall: 'コール額',
    stackToPot: 'SPR',
    noBet: 'チェック可能',
  },
  actions: {
    fold: 'フォールド',
    check: 'チェック',
    call: 'コール',
    bet: 'ベット',
    raise: 'レイズ',
    raiseTo: 'レイズ額',
    allIn: 'オールイン',
    nextHand: '次のハンド',
    newTable: '新しいテーブル',
    rules: 'AIモデルとルール',
    soundOn: 'サウンドON',
    soundOff: 'ミュート',
  },
  result: {
    title: 'ハンド終了',
    winner: '勝者',
    wins: '獲得',
    split: 'ポットを分配',
    uncontested: '全員がフォールド',
    mainPot: 'メインポット',
    sidePot: 'サイドポット',
  },
  info: {
    title: 'AIモデルとテーブルルール',
    intro: 'ユーザー1人とCPU最大7人で遊べる、ローカル完結のノーリミット・ホールデムです。',
    bullets: [
      '開始100BB、ブラインド1 / 2、アンティなし、レーキなし。',
      'ディーラー・ブラインド移動、ヘッズアップ規則、最小レイズ、ショートオールイン、サイドポットに対応。',
      'CPUは相手の伏せ札を参照しません。公開アクション、ボード、自分のホールカードだけで判断します。',
      'ポジション別レンジ、混合頻度、ポットオッズ、推定エクイティ、SPR、ポラライズしたサイズを組み合わせます。',
    ],
    honestyTitle: '「GTO原則に基づく」の意味',
    honesty: '8-maxノーリミットホールデムは厳密には解かれていません。このCPUはソルバー由来の原則と頻度を使いますが、商用ソルバーそのものでも、完全なGTOを保証するものでもありません。',
  },
  streets: { preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー', complete: 'ショーダウン' },
  hands: {
    'straight-flush': 'ストレートフラッシュ',
    'four-of-a-kind': 'フォーカード',
    'full-house': 'フルハウス',
    flush: 'フラッシュ',
    straight: 'ストレート',
    'three-of-a-kind': 'スリーカード',
    'two-pair': 'ツーペア',
    'one-pair': 'ワンペア',
    'high-card': 'ハイカード',
  },
  log: {
    hand: 'ハンド #{{amount}} 開始',
    posts: '{{player}} が{{blind}} {{amount}}',
    checks: '{{player}} がチェック',
    folds: '{{player}} がフォールド',
    calls: '{{player}} が {{amount}} をコール',
    bets: '{{player}} が {{amount}} をベット',
    raises: '{{player}} が {{amount}} へレイズ',
    street: '{{street}}を公開',
    collects: '{{player}} が {{amount}} を獲得',
  },
};

export function getHoldemStrings(language: GameLanguage): HoldemStrings {
  return language === 'ja' ? ja : en;
}
