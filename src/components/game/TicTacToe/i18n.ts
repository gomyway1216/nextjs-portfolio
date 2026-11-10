/**
 * Local bilingual strings for TicTacToe.
 * Kept in the component dir per the revamp spec (no new shared keys).
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from '../common/types';
import type { MoveGrade, MoveReview, Outcome } from './analysis';

export interface TicTacToeCopy {
  title: string;
  subtitle: string;
  gameSetup: string;
  selectDifficulty: string;
  start: string;
  cellLabel: (n: number) => string;
  firstMove: string;
  youFirst: string;
  aiFirst: string;
  yourTurn: string;
  aiThinking: string;
  youAre: string;
  aiIs: string;
  youWin: string;
  youWinSub: string;
  aiWins: string;
  aiWinsSub: string;
  draw: string;
  drawSub: string;
  playAgain: string;
  changeDifficulty: string;
  howToPlay: string;
  objectiveTitle: string;
  objectiveBody: string;
  tipsTitle: string;
  tips: string[];
  difficulties: Record<Difficulty, { label: string; description: string }>;
  /** Names of the nine cells, in board order. */
  cellNames: readonly string[];
  undo: string;
  hint: string;
  hintText: (cell: string, outcome: Outcome) => string;
  hintCellLabel: (cell: string) => string;
  betterCellLabel: (cell: string) => string;
  you: string;
  ai: string;
  reviewTitle: string;
  reviewIntro: string;
  reviewSummary: (slips: number) => string;
  reviewingMove: (n: number, total: number) => string;
  finalPosition: string;
  grades: Record<MoveGrade, string>;
  /** One sentence on a reviewed move; `cells` are the names of the moves that kept the result. */
  verdict: (review: Pick<MoveReview, 'grade' | 'before'>, cells: string[]) => string;
}

const en: TicTacToeCopy = {
  title: 'Tic-Tac-Toe',
  subtitle: 'Line up three marks before the AI does.',
  gameSetup: 'Game setup',
  selectDifficulty: 'Choose your opponent',
  start: 'Start Game',
  cellLabel: (n) => `Cell ${n}, empty`,
  firstMove: 'Who moves first?',
  youFirst: 'You (X)',
  aiFirst: 'AI (O)',
  yourTurn: 'Your turn',
  aiThinking: 'AI is thinking…',
  youAre: 'You are X',
  aiIs: 'AI is O',
  youWin: 'You win! 🎉',
  youWinSub: 'Nicely played.',
  aiWins: 'AI wins',
  aiWinsSub: 'Rematch?',
  draw: "It's a draw",
  drawSub: 'A perfect standoff.',
  playAgain: 'Play again',
  changeDifficulty: 'Change opponent',
  howToPlay: 'How to play',
  objectiveTitle: 'Objective',
  objectiveBody:
    'Get three of your marks (X) in a row — horizontally, vertically, or diagonally — before the AI (O) does.',
  tipsTitle: 'Pro tips',
  tips: [
    'Open in the center or a corner for the strongest start.',
    'Always block when the opponent has two in a row.',
    'Build a "fork" — a move that threatens two wins at once.',
    'Master never blunders. Against it, a draw is a win.',
    'Hint shows the strongest move and Undo takes back your last one. After the game, every move is graded against perfect play.'
  ],
  difficulties: {
    easy: { label: 'Easy', description: 'Plays mostly random moves' },
    medium: { label: 'Medium', description: 'Often slips up' },
    hard: { label: 'Hard', description: 'Sharp, with rare mistakes' },
    expert: { label: 'Expert', description: 'Almost never errs' },
    master: { label: 'Master', description: 'Perfect — unbeatable' }
  },
  cellNames: ['Top left', 'Top', 'Top right', 'Left', 'Center', 'Right', 'Bottom left', 'Bottom', 'Bottom right'],
  undo: 'Undo',
  hint: 'Hint',
  hintText: (cell, outcome) =>
    outcome === 'win'
      ? `Hint: ${cell} — wins even against perfect play.`
      : outcome === 'draw'
        ? `Hint: ${cell} — holds the draw against perfect play.`
        : `Hint: ${cell} — every move loses to perfect play; this one lasts longest.`,
  hintCellLabel: (cell) => `${cell}, empty, suggested move`,
  betterCellLabel: (cell) => `${cell}, empty, a move that kept the result`,
  you: 'You',
  ai: 'AI',
  reviewTitle: 'Game review',
  reviewIntro:
    'Every move is compared with perfect play from both sides. Select a move to see the board at that point.',
  reviewSummary: (slips) =>
    slips === 0
      ? 'None of your moves gave anything away.'
      : slips === 1
        ? 'One of your moves gave something away.'
        : `${slips} of your moves gave something away.`,
  reviewingMove: (n, total) => `Position after move ${n} of ${total}`,
  finalPosition: 'Back to final position',
  grades: { good: 'Good', missedWin: 'Missed win', blunder: 'Blunder' },
  verdict: ({ grade, before }, cells) => {
    const list = cells.join(' or ');
    if (grade === 'missedWin') return `Only draws against perfect play. ${list} would have kept a forced win.`;
    if (grade === 'blunder') {
      return before === 'win'
        ? `Lets the opponent force a win. ${list} would have kept a forced win.`
        : `Lets the opponent force a win. ${list} would have held the draw.`;
    }
    if (before === 'win') return 'Keeps a forced win.';
    if (before === 'draw') return 'Holds the draw. No move here forced a win.';
    return 'Already lost against perfect play. No move here saved it.';
  }
};

const ja: TicTacToeCopy = {
  title: '三目並べ',
  subtitle: 'AIより先に3つ並べよう。',
  gameSetup: 'ゲーム設定',
  selectDifficulty: '相手を選ぶ',
  start: 'ゲーム開始',
  cellLabel: (n) => `マス${n}・空き`,
  firstMove: '先手はどっち？',
  youFirst: 'あなた (X)',
  aiFirst: 'AI (O)',
  yourTurn: 'あなたの番',
  aiThinking: 'AIが考え中…',
  youAre: 'あなたは X',
  aiIs: 'AI は O',
  youWin: 'あなたの勝ち！🎉',
  youWinSub: 'お見事。',
  aiWins: 'AIの勝ち',
  aiWinsSub: 'もう一度？',
  draw: '引き分け',
  drawSub: '互角の勝負。',
  playAgain: 'もう一度',
  changeDifficulty: '相手を変える',
  howToPlay: '遊び方',
  objectiveTitle: '目的',
  objectiveBody:
    'AI (O) より先に、自分の印 (X) を縦・横・斜めのいずれかに3つ並べましょう。',
  tipsTitle: 'コツ',
  tips: [
    '中央か角から始めると有利です。',
    '相手が2つ並べたら必ず止めましょう。',
    '2方向同時に狙う「フォーク」を作ろう。',
    'マスターはミスをしません。引き分けなら上出来です。',
    '「ヒント」で最善手を表示、「一手戻す」で直前の手を取り消せます。対局後はすべての手を最善手と比べて振り返れます。'
  ],
  difficulties: {
    easy: { label: '初級', description: 'ほぼランダムに打つ' },
    medium: { label: '中級', description: 'よくミスをする' },
    hard: { label: '上級', description: '鋭いがたまにミス' },
    expert: { label: '達人', description: 'ほとんどミスなし' },
    master: { label: 'マスター', description: '完璧・負けなし' }
  },
  cellNames: ['左上', '上', '右上', '左', '中央', '右', '左下', '下', '右下'],
  undo: '一手戻す',
  hint: 'ヒント',
  hintText: (cell, outcome) =>
    outcome === 'win'
      ? `ヒント：${cell} — 相手が最善を尽くしても勝てます。`
      : outcome === 'draw'
        ? `ヒント：${cell} — 相手が最善を尽くしても引き分けにできます。`
        : `ヒント：${cell} — 最善を尽くされるとどこに打っても負け。ここが一番粘れます。`,
  hintCellLabel: (cell) => `${cell}・空き・おすすめの手`,
  betterCellLabel: (cell) => `${cell}・空き・結果を保てた手`,
  you: 'あなた',
  ai: 'AI',
  reviewTitle: '対局の振り返り',
  reviewIntro: 'すべての手を、双方が最善を尽くした場合と比べています。手を選ぶと、その時点の盤面を表示します。',
  reviewSummary: (slips) =>
    slips === 0 ? 'あなたの手に損をした手はありませんでした。' : `あなたの手のうち${slips}手が損をしました。`,
  reviewingMove: (n, total) => `${total}手中${n}手目の局面`,
  finalPosition: '最終局面に戻る',
  grades: { good: '好手', missedWin: '勝ち逃し', blunder: '悪手' },
  verdict: ({ grade, before }, cells) => {
    const list = cells.join('か');
    if (grade === 'missedWin') return `最善を尽くされると引き分け止まり。${list}なら勝ちを保てました。`;
    if (grade === 'blunder') {
      return before === 'win'
        ? `相手に勝ち筋を与える手。${list}なら勝ちを保てました。`
        : `相手に勝ち筋を与える手。${list}なら引き分けを保てました。`;
    }
    if (before === 'win') return '勝ち筋を保つ手です。';
    if (before === 'draw') return '引き分けを保つ手です。ここで勝ちが確定する手はありませんでした。';
    return '最善を尽くされるとすでに負けの局面。どこに打っても救えませんでした。';
  }
};

export const getTicTacToeCopy = (language: GameLanguage): TicTacToeCopy =>
  language === 'ja' ? ja : en;
