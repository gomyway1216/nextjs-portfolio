/**
 * Bigger Number — local UI strings (ja / en).
 *
 * New copy introduced by the revamp lives here so we don't touch the shared
 * `constants/gameTranslations.ts`. Use with `useGameLanguage()`.
 */

import type { AIDifficulty } from './types';
import type { RoundWinner } from './roundHistory';

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
  opponentTiles: string;
  tileInHand: (label: string) => string;
  tilePlayed: (label: string) => string;
  roundLog: string;
  roundLogOrder: string;
  roundLogEmpty: string;
  resultMark: Record<RoundWinner, string>;
  roundLogEntry: (
    round: number,
    you: string,
    opponent: string,
    winner: RoundWinner,
    returned: boolean,
  ) => string;
  summaryHeading: string;
  summaryRecord: (wins: number, losses: number, ties: number) => string;
  avgMargin: string;
  avgMarginHint: string;
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
      master: ja ? '達人' : 'Master',
    },
    difficultyDescriptions: {
      easy: ja ? 'ランダムに出す' : 'Plays at random',
      medium: ja ? '期待値で最善手を狙う' : 'Greedy expected value',
      hard: ja ? '混合戦略で読みづらい最適手' : 'Unexploitable Nash strategy',
      master: ja ? 'あなたの癖を学習して的確に突く' : 'Learns and punishes your habits',
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
          '札は1回ずつしか使えません。相手の残り札とラウンド履歴は対戦中いつでも確認できます。',
        ]
      : [
          'Each round, secretly pick one tile; both reveal at once.',
          'The higher number wins the round.',
          'The Dragon loses only to 1 and beats everything else (configurable).',
          'First to the target number of round wins takes the match.',
          'Timing your strong tiles is everything.',
          "Each tile can be used once. The opponent's remaining tiles and the round log stay visible during the match.",
        ],
    cardsPlayed: ja ? '出した札' : 'Played',
    opponentTiles: ja ? '相手の残り札' : "Opponent's remaining tiles",
    tileInHand: (label: string) => (ja ? `${label}（手札にあり）` : `${label} (in hand)`),
    tilePlayed: (label: string) => (ja ? `${label}（使用済み）` : `${label} (played)`),
    roundLog: ja ? 'ラウンド履歴' : 'Round log',
    roundLogOrder: ja ? 'あなた – 相手' : 'you – opponent',
    roundLogEmpty: ja ? 'まだ勝負なし' : 'No rounds played yet',
    resultMark: {
      you: ja ? '勝' : 'W',
      opponent: ja ? '負' : 'L',
      tie: ja ? '分' : 'T',
    },
    roundLogEntry: (round, you, opponent, winner, returned) => {
      const result =
        winner === 'you'
          ? ja ? 'あなたの勝ち' : 'you won'
          : winner === 'opponent'
            ? ja ? '相手の勝ち' : 'opponent won'
            : returned
              ? ja ? '引き分け（札は手札に戻る）' : 'tie, tiles returned'
              : ja ? '引き分け' : 'tie';
      return ja
        ? `ラウンド${round}：あなた ${you}、相手 ${opponent}、${result}`
        : `Round ${round}: you ${you}, opponent ${opponent}, ${result}`;
    },
    summaryHeading: ja ? '試合のまとめ' : 'Match summary',
    summaryRecord: (wins, losses, ties) =>
      ja ? `${wins}勝 ${losses}敗 ${ties}分` : `${wins}W – ${losses}L – ${ties}T`,
    avgMargin: ja
      ? '平均勝ち幅（数字同士のラウンド）'
      : 'Avg. winning margin (number-vs-number rounds)',
    avgMarginHint: ja
      ? '勝ったラウンドでの2枚の数字の差の平均です。小さいほど、少ない差で勝っています。'
      : 'Mean gap between the two numbers in the rounds that side won. Smaller means winning with less to spare.',
  };
}
