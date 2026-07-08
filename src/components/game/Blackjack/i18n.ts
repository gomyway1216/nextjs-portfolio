/**
 * Local bilingual strings for the Blackjack game. Kept in the component dir so
 * we don't touch the shared locale JSON. Resolved via `useGameLanguage()`.
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface BlackjackStrings {
  title: string;
  subtitle: string;
  tabs: { play: string; sim: string };

  play: {
    dealer: string;
    you: string;
    upcard: string;
    total: string;
    soft: string;
    hard: string;
    bust: string;
    blackjack: string;
    hidden: string;
    deal: string; // interpolate {bet}
    hit: string;
    stand: string;
    double: string;
    split: string;
    nextHand: string;
    recommend: string; // interpolate {action}
    hintOn: string;
    insurancePrompt: string;
    insuranceTake: string;
    insuranceDecline: string;
    insuranceAdvice: string;
    hand: string; // interpolate {n}
    status: string;
    resetSession: string;
    outcomes: { win: string; lose: string; push: string; blackjack: string };
    stats: {
      bankroll: string;
      sessionNet: string;
      hands: string;
      winRate: string;
      blackjacks: string;
      followRate: string;
    };
    rulesTitle: string;
    rules: string[];
    broke: string;
  };

  actionNames: { hit: string; stand: string; double: string; split: string };

  sim: {
    handsPerStrategy: string;
    startingBankroll: string;
    betPerHand: string;
    runButton: string;
    running: string; // interpolate {strategy} {done} {total}
    runNote: string;
    introTitle: string;
    introBody: string;
    introBasic: string;
    introMimic: string;
    introStand: string;
    introFooter: string;
    edgeTitle: string;
    edgeNote: string;
    edgeGain: string; // interpolate {value}
    edgeLoss: string; // interpolate {value}
    trajectoryTitle: string;
    detailsTitle: string;
    baselineLabel: string;
    handsAxis: string;
    table: { strategy: string; winRate: string; edge: string; totalNet: string };
    strategyLabels: { basic: string; mimic: string; stand: string };
  };
}

const en: BlackjackStrings = {
  title: 'Blackjack — Basic Strategy',
  subtitle: 'Play a full round with live Basic-Strategy hints, then run a Monte-Carlo simulation to see how the strategies compare over thousands of hands.',
  tabs: { play: 'Play', sim: 'Simulate' },

  play: {
    dealer: 'Dealer',
    you: 'You',
    upcard: 'Upcard',
    total: 'Total',
    soft: 'soft',
    hard: 'hard',
    bust: 'Bust',
    blackjack: 'Blackjack!',
    hidden: 'Hidden card',
    deal: 'Deal (${{bet}})',
    hit: 'Hit',
    stand: 'Stand',
    double: 'Double',
    split: 'Split',
    nextHand: 'Next hand',
    recommend: 'Basic Strategy: {{action}}',
    hintOn: 'Show strategy hint',
    insurancePrompt: 'Dealer shows an Ace — take insurance?',
    insuranceTake: 'Take insurance',
    insuranceDecline: 'No insurance',
    insuranceAdvice: 'Basic Strategy: decline (insurance is a losing bet).',
    hand: 'Hand {{n}}',
    status: 'Session',
    resetSession: 'Reset session',
    outcomes: { win: 'You win', lose: 'You lose', push: 'Push', blackjack: 'Blackjack! (pays 3:2)' },
    stats: {
      bankroll: 'Bankroll',
      sessionNet: 'Session net',
      hands: 'Hands',
      winRate: 'Win rate',
      blackjacks: 'Blackjacks',
      followRate: 'Strategy match',
    },
    rulesTitle: 'House rules',
    rules: [
      '6-deck shoe, reshuffled each round. Dealer stands on all 17 (S17).',
      'Blackjack pays 3:2. Double on any two cards; double after split allowed.',
      'Split pairs up to 4 hands; split Aces get one card each. Insurance pays 2:1.',
      'The 💡 marks the Basic-Strategy move. Follow it to keep the house edge near 0.5%.',
    ],
    broke: 'Out of chips — reset the session to keep playing.',
  },

  actionNames: { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split' },

  sim: {
    handsPerStrategy: 'Hands per strategy',
    startingBankroll: 'Starting bankroll',
    betPerHand: 'Bet per hand',
    runButton: 'Run simulation',
    running: '{{strategy}} — {{done}} / {{total}}',
    runNote: 'Runs three strategies over the same conditions.',
    introTitle: 'What this shows.',
    introBody: 'Each strategy plays the chosen number of hands under identical rules. Compare the long-run house edge and bankroll trajectory:',
    introBasic: 'the optimal chart (hit/stand/double/split). House edge ≈ 0.5%.',
    introMimic: 'copy the dealer — hit ≤16, stand on 17+. No doubles or splits.',
    introStand: 'never take a card. Shows how costly passivity is.',
    introFooter: 'Larger hand counts converge closer to the true edge. Results use a fresh 6-deck shoe every round.',
    edgeTitle: 'House edge by strategy',
    edgeNote: 'Bars show edge magnitude. Green = player advantage, red = house advantage.',
    edgeGain: '+{{value}}% you',
    edgeLoss: '−{{value}}% house',
    trajectoryTitle: 'Bankroll over time',
    detailsTitle: 'Details',
    baselineLabel: 'Start',
    handsAxis: 'hands',
    table: { strategy: 'Strategy', winRate: 'Win %', edge: 'Edge', totalNet: 'Net' },
    strategyLabels: { basic: 'Basic Strategy', mimic: 'Mimic Dealer', stand: 'Always Stand' },
  },
};

const ja: BlackjackStrings = {
  title: 'ブラックジャック — ベーシックストラテジー',
  subtitle: 'ヒント付きで1ラウンドをプレイし、モンテカルロシミュレーションで各戦略を数千ハンドにわたり比較できます。',
  tabs: { play: 'プレイ', sim: 'シミュレーション' },

  play: {
    dealer: 'ディーラー',
    you: 'あなた',
    upcard: 'アップカード',
    total: '合計',
    soft: 'ソフト',
    hard: 'ハード',
    bust: 'バスト',
    blackjack: 'ブラックジャック！',
    hidden: '伏せ札',
    deal: 'ディール（${{bet}}）',
    hit: 'ヒット',
    stand: 'スタンド',
    double: 'ダブル',
    split: 'スプリット',
    nextHand: '次のハンド',
    recommend: 'ベーシックストラテジー：{{action}}',
    hintOn: 'ヒントを表示',
    insurancePrompt: 'ディーラーがエース — インシュランスを取りますか？',
    insuranceTake: 'インシュランスを取る',
    insuranceDecline: '取らない',
    insuranceAdvice: 'ベーシックストラテジー：取らない（インシュランスは損な賭け）。',
    hand: 'ハンド {{n}}',
    status: 'セッション',
    resetSession: 'セッションをリセット',
    outcomes: { win: 'あなたの勝ち', lose: 'あなたの負け', push: '引き分け', blackjack: 'ブラックジャック！（3:2）' },
    stats: {
      bankroll: '残高',
      sessionNet: 'セッション収支',
      hands: 'ハンド数',
      winRate: '勝率',
      blackjacks: 'BJ回数',
      followRate: '戦略一致率',
    },
    rulesTitle: 'ハウスルール',
    rules: [
      '6デッキ、毎回シャッフル。ディーラーは17でスタンド（S17）。',
      'ブラックジャックは3:2。任意の2枚でダブル可、スプリット後のダブルも可。',
      'ペアは最大4ハンドまでスプリット可。エースのスプリットは1枚ずつ。インシュランスは2:1。',
      '💡 がベーシックストラテジーの手。従えばハウスエッジは約0.5%に。',
    ],
    broke: 'チップ切れ — セッションをリセットして続行してください。',
  },

  actionNames: { hit: 'ヒット', stand: 'スタンド', double: 'ダブル', split: 'スプリット' },

  sim: {
    handsPerStrategy: '戦略ごとのハンド数',
    startingBankroll: '開始残高',
    betPerHand: '1ハンドの賭け金',
    runButton: 'シミュレーション実行',
    running: '{{strategy}} — {{done}} / {{total}}',
    runNote: '同じ条件で3つの戦略を実行します。',
    introTitle: 'このシミュレーションの内容。',
    introBody: '各戦略が同一ルールで指定ハンド数をプレイします。長期のハウスエッジと残高推移を比較：',
    introBasic: '最適チャート（ヒット/スタンド/ダブル/スプリット）。ハウスエッジ約0.5%。',
    introMimic: 'ディーラーの真似 — 16以下でヒット、17以上でスタンド。ダブル・スプリットなし。',
    introStand: '一切引かない。受け身の代償がわかります。',
    introFooter: 'ハンド数が多いほど真のエッジに収束します。毎回新しい6デッキを使用。',
    edgeTitle: '戦略別ハウスエッジ',
    edgeNote: 'バーはエッジの大きさ。緑＝プレイヤー有利、赤＝ハウス有利。',
    edgeGain: '+{{value}}% 有利',
    edgeLoss: '−{{value}}% ハウス',
    trajectoryTitle: '残高の推移',
    detailsTitle: '詳細',
    baselineLabel: '開始',
    handsAxis: 'ハンド',
    table: { strategy: '戦略', winRate: '勝率', edge: 'エッジ', totalNet: '収支' },
    strategyLabels: { basic: 'ベーシック', mimic: 'ディーラー模倣', stand: '常にスタンド' },
  },
};

export function getBlackjackStrings(language: GameLanguage): BlackjackStrings {
  return language === 'ja' ? ja : en;
}

/** Minimal interpolation for `{{key}}` placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
}
