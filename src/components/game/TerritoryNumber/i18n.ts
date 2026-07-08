/**
 * Territory Number — LOCAL UI strings (ja/en).
 *
 * Shared game copy (title / howToPlay) still comes from
 * `constants/gameTranslations.ts`. Everything added by the revamped VS-AI UI
 * lives here so we don't touch the shared translations file.
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface TerritoryNumberStrings {
  vsAi: string;
  modeSelect: string;
  backToGames: string;
  aiDifficulty: string;
  firstMove: string;
  you: string;
  ai: string;
  random: string;
  startMatch: string;
  gameSetup: string;
  selectDifficulty: string;
  setupHint: string;
  easy: string;
  medium: string;
  hard: string;
  easyDesc: string;
  mediumDesc: string;
  hardDesc: string;
  firstMoveYou: string;
  firstMoveAi: string;
  firstMoveRandom: string;
  // In-match
  leave: string;
  playAgain: string;
  newMatch: string;
  yourTurn: string;
  oppTurn: string;
  finished: string;
  remaining: string;
  lines: string;
  pickCard: string;
  tapToPlace: (card: number) => string;
  aiThinking: string;
  youWon: string;
  aiWon: string;
  draw: string;
  used: string;
  selectCard: (card: number) => string;
  emptyCell: (row: number, col: number) => string;
  filledCell: (value: number, owner: string) => string;
  // Line labels
  lineLabels: string[];
  // Info modal
  howToPlayTitle: string;
  strategyTitle: string;
  strategyBody: string[];
  legendYou: string;
  legendAi: string;
  legendTie: string;
}

export function getTerritoryNumberStrings(lang: GameLanguage): TerritoryNumberStrings {
  const ja = lang === 'ja';
  return {
    vsAi: ja ? 'AI対戦' : 'Play vs AI',
    modeSelect: ja ? 'モード選択' : 'Mode select',
    backToGames: ja ? 'ゲーム一覧へ' : 'Back to Games',
    aiDifficulty: ja ? 'AIの強さ' : 'AI difficulty',
    firstMove: ja ? '先手' : 'First move',
    you: ja ? 'あなた' : 'You',
    ai: 'AI',
    random: ja ? 'ランダム' : 'Random',
    startMatch: ja ? '対戦開始' : 'Start match',
    gameSetup: ja ? 'ゲーム設定' : 'Game setup',
    selectDifficulty: ja ? '難易度を選ぶ' : 'Select difficulty',
    setupHint: ja
      ? '中央マスは4ライン、コーナーは3ライン、辺は2ライン。9を温存するか早めに通すか、読み合おう。'
      : 'Centre hits 4 lines, corners 3, edges 2. When to spend your 9 and when to hold it — read the AI.',
    easy: ja ? '弱い' : 'Easy',
    medium: ja ? '普通' : 'Medium',
    hard: ja ? '強い' : 'Hard',
    easyDesc: ja ? 'ほぼランダム。気軽に。' : 'Mostly random. Casual.',
    mediumDesc: ja ? '一手先を読む定石派。' : 'Reads one move ahead.',
    hardDesc: ja ? '終盤は完全読み切り。' : 'Solves the endgame exactly.',
    firstMoveYou: ja ? 'あなた' : 'You',
    firstMoveAi: 'AI',
    firstMoveRandom: ja ? 'ランダム' : 'Random',
    leave: ja ? '退室' : 'Leave',
    playAgain: ja ? 'もう一度' : 'Play again',
    newMatch: ja ? '新しい対戦' : 'New match',
    yourTurn: ja ? 'あなたの番' : 'Your turn',
    oppTurn: ja ? '相手の番' : "Opponent's turn",
    finished: ja ? '終了' : 'Finished',
    remaining: ja ? '残りカード' : 'Remaining cards',
    lines: ja ? '獲得ライン' : 'Lines',
    pickCard: ja ? 'カードを1枚選んでください' : 'Pick a card to play',
    tapToPlace: (card: number) =>
      ja ? `${card} を置くマスをタップ` : `Tap a cell to place ${card}`,
    aiThinking: ja ? 'AIが考えています…' : 'AI is thinking…',
    youWon: ja ? '🎉 あなたの勝利！' : '🎉 You won!',
    aiWon: ja ? '😤 AIの勝ち' : '😤 The AI won',
    draw: ja ? '🤝 引き分け' : '🤝 Draw',
    used: ja ? '使用済み' : 'used',
    selectCard: (card: number) =>
      ja ? `カード ${card} を選ぶ` : `Select card ${card}`,
    emptyCell: (row: number, col: number) =>
      ja ? `${row}行${col}列 空マス` : `Empty cell row ${row} column ${col}`,
    filledCell: (value: number, owner: string) =>
      ja ? `${owner}の ${value}` : `${owner}'s ${value}`,
    lineLabels: ja
      ? ['1行目', '2行目', '3行目', '1列目', '2列目', '3列目', '＼対角', '／対角']
      : ['Row 1', 'Row 2', 'Row 3', 'Col 1', 'Col 2', 'Col 3', '＼ Diag', '／ Diag'],
    howToPlayTitle: ja ? '遊び方' : 'How to play',
    strategyTitle: ja ? '戦略のヒント' : 'Strategy tips',
    strategyBody: ja
      ? [
          '共有プール（1〜9）から交互に1枚選び、空きマスに自分の色で置く。',
          '9マス埋まると8ライン（行3・列3・斜め2）を採点。各ラインは合計が大きい方が獲得。',
          '獲得ライン数が多い方が勝ち。同数なら引き分け。',
          '中央は4ライン、コーナーは3ライン、辺は2ライン。強い数字を高レバレッジのマスへ。',
          '9を早く使うと主導権を握れるが、相手に上を取られると一気に不利。温存も一手。',
        ]
      : [
          'Take turns picking any unused number 1–9 from the shared pool and place it in your colour.',
          'When all 9 cells are full, 8 lines are scored (3 rows, 3 cols, 2 diagonals). Higher sum takes the line.',
          'Most captured lines wins; equal captures is a draw.',
          'Centre touches 4 lines, corners 3, edges 2. Put strong numbers where they do the most work.',
          'Spending your 9 early seizes the initiative, but if the AI answers it you can fall behind — holding it is also an option.',
        ],
    legendYou: ja ? 'あなた' : 'You',
    legendAi: ja ? 'AI' : 'AI',
    legendTie: ja ? '引き分けライン' : 'Tied line',
  };
}
