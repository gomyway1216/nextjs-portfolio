/**
 * Bigger Number — local UI strings (ja / en).
 *
 * New copy introduced by the revamp lives here so we don't touch the shared
 * `constants/gameTranslations.ts`. Use with `useGameLanguage()`.
 */

import type { AIDifficulty } from './types';

export interface BiggerNumberStrings {
  vsAi: string;
  modeSelect: string;
  backToMenu: string;
  difficulty: string;
  difficultyLabels: Record<AIDifficulty, string>;
  difficultyDescriptions: Record<AIDifficulty, string>;
  startMatch: string;
  you: string;
  opponent: string;
  wins: string;
  round: string;
  target: (n: number) => string;
  toWin: (n: number) => string;
  pickPrompt: string;
  locking: string;
  reveal: string;
  yourCard: string;
  aiThinking: string;
  leave: string;
  playAgain: string;
  noCardsLeft: string;
  handLabel: string;
  youWinRound: string;
  aiWinRound: string;
  tie: string;
  tieReturned: string;
  matchYouWin: string;
  matchAiWin: string;
  matchDraw: string;
  scoreboard: string;
  dragonCard: string;
  cardN: (n: number) => string;
  rulesHeading: string;
  ruleLines: string[];
  cardsPlayed: string;
}

export function getStrings(language: 'ja' | 'en'): BiggerNumberStrings {
  const ja = language === 'ja';
  return {
    vsAi: ja ? 'AI対戦' : 'Play vs AI',
    modeSelect: ja ? 'モード選択' : 'Mode select',
    backToMenu: ja ? 'メニューへ' : 'Menu',
    difficulty: ja ? 'AI 難易度' : 'AI difficulty',
    difficultyLabels: {
      easy: ja ? '弱い' : 'Easy',
      medium: ja ? '普通' : 'Medium',
      hard: ja ? '強い' : 'Hard',
    },
    difficultyDescriptions: {
      easy: ja ? 'ランダムに出す' : 'Plays at random',
      medium: ja ? '期待値で最善手を狙う' : 'Greedy expected value',
      hard: ja ? '混合戦略で読みづらい最適手' : 'Unexploitable Nash strategy',
    },
    startMatch: ja ? '対戦開始' : 'Start match',
    you: ja ? 'あなた' : 'You',
    opponent: ja ? '相手' : 'Opponent',
    wins: ja ? '勝' : 'Wins',
    round: ja ? 'ラウンド' : 'Round',
    target: (n: number) => (ja ? `${n}勝先取` : `First to ${n}`),
    toWin: (n: number) => (ja ? `あと${n}勝` : `${n} to win`),
    pickPrompt: ja ? '手札から1枚選んでオープン！' : 'Pick a tile to reveal!',
    locking: ja ? '札を伏せました' : 'Card locked in',
    reveal: ja ? 'オープン！' : 'Reveal!',
    yourCard: ja ? 'あなた' : 'You',
    aiThinking: ja ? 'AIが選んでいます…' : 'AI is choosing…',
    leave: ja ? '退室' : 'Leave',
    playAgain: ja ? 'もう一度' : 'Play again',
    noCardsLeft: ja ? '手札を使い切りました' : 'No cards left',
    handLabel: ja ? 'あなたの手札' : 'Your hand',
    youWinRound: ja ? 'あなたの勝ち！' : 'You win!',
    aiWinRound: ja ? 'AIの勝ち' : 'AI wins',
    tie: ja ? '引き分け' : 'Tie',
    tieReturned: ja ? '引き分け、カードを戻します' : 'Tie — cards returned',
    matchYouWin: ja ? '🎉 あなたの勝利！' : '🎉 You won the match!',
    matchAiWin: ja ? '😢 AIの勝利' : '😢 AI won the match',
    matchDraw: ja ? '🤝 引き分け' : '🤝 Draw',
    scoreboard: ja ? 'スコア' : 'Score',
    dragonCard: ja ? '龍タイル' : 'Dragon tile',
    cardN: (n: number) => (ja ? `${n}のタイル` : `Tile ${n}`),
    rulesHeading: ja ? '遊び方' : 'How to play',
    ruleLines: ja
      ? [
          '毎ラウンド、手札から1枚を選んで同時にオープン。',
          '大きい数字を出した方がそのラウンドの勝ち。',
          '龍タイルは1にだけ負け、他のすべてに勝ちます（設定変更可）。',
          '先に規定数を勝ち取った方が試合の勝者。',
          '強い札をいつ切るか——読み合いが鍵。',
        ]
      : [
          'Each round, secretly pick one tile; both reveal at once.',
          'The higher number wins the round.',
          'The Dragon loses only to 1 and beats everything else (configurable).',
          'First to the target number of round wins takes the match.',
          'Timing your strong tiles is everything.',
        ],
    cardsPlayed: ja ? '出した札' : 'Played',
  };
}
