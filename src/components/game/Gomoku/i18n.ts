/**
 * Local bilingual (ja/en) strings for the Gomoku UI.
 * New strings live here so we don't touch the shared gameTranslations.ts.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from '../common/types';

export interface GomokuStrings {
  title: string;
  subtitle: string;
  selectDifficulty: string;
  start: string;
  yourTurn: string;
  aiTurn: string;
  aiThinking: string;
  youAre: string; // "You are Black · AI is White"
  youWin: string;
  youWinSub: string;
  aiWins: string;
  aiWinsSub: string;
  draw: string;
  drawSub: string;
  newGame: string;
  changeDifficulty: string;
  black: string;
  white: string;
  /** Accessible board label, given the board size (e.g. 15). */
  boardLabel: (size: number) => string;
  /** Accessible label for a single intersection. */
  cellLabel: (row: number, col: number, stone: string | null) => string;
  infoTitle: string;
  objectiveTitle: string;
  objectiveBody: string;
  howToTitle: string;
  howToBody: string;
  tipsTitle: string;
  tips: string[];
  difficulties: Record<Difficulty, { label: string; description: string }>;
}

const en: GomokuStrings = {
  title: 'Gomoku',
  subtitle: 'Five in a Row — outsmart the AI on a 15×15 board.',
  selectDifficulty: 'Select Difficulty',
  start: 'Start Game',
  yourTurn: 'Your Turn',
  aiTurn: "AI's Turn",
  aiThinking: 'AI is thinking…',
  youAre: 'You are Black ⚫ · AI is White ⚪',
  youWin: 'You Win! 🎉',
  youWinSub: 'Five in a row — brilliant play!',
  aiWins: 'AI Wins',
  aiWinsSub: 'Good game — want a rematch?',
  draw: "It's a Draw",
  drawSub: 'The board is full.',
  newGame: 'New Game',
  changeDifficulty: 'Change Difficulty',
  black: 'Black',
  white: 'White',
  boardLabel: (size) => `Gomoku ${size} by ${size} board`,
  cellLabel: (row, col, stone) =>
    `row ${row}, column ${col}${stone ? ` — ${stone}` : ''}`,
  infoTitle: 'How to Play Gomoku',
  objectiveTitle: 'Objective',
  objectiveBody:
    'Be the first to line up five of your stones (black) in a row — horizontally, vertically, or diagonally.',
  howToTitle: 'How to Play',
  howToBody:
    'Click any intersection to place a black stone. The AI answers with white. Your last move gets a blue ring; a winning line is highlighted in green.',
  tipsTitle: 'Pro Tips',
  tips: [
    'Open threes (three in a row with both ends free) create unstoppable pressure.',
    'Always block the opponent’s four — it wins next turn otherwise.',
    'Aim for a double threat (two open threes at once); one can’t be blocked.',
    'Control the center: it touches the most winning lines.',
  ],
  difficulties: {
    easy: { label: 'Easy', description: 'Shallow search, sometimes forgiving' },
    medium: { label: 'Medium', description: 'Solid tactical play' },
    hard: { label: 'Hard', description: 'Deep search — a real challenge' },
    expert: { label: 'Expert', description: 'Very deep, threat-aware search' },
    master: { label: 'Master', description: 'Maximum depth — merciless' },
  },
};

const ja: GomokuStrings = {
  title: '五目並べ',
  subtitle: '15×15の盤面でAIと五目並べ。先に5つ並べよう。',
  selectDifficulty: '難易度を選択',
  start: 'ゲーム開始',
  yourTurn: 'あなたの番',
  aiTurn: 'AIの番',
  aiThinking: 'AIが考えています…',
  youAre: 'あなたは黒 ⚫ ・ AIは白 ⚪',
  youWin: '勝ち！🎉',
  youWinSub: '5つ並べました。お見事！',
  aiWins: 'AIの勝ち',
  aiWinsSub: 'いい勝負でした。もう一局？',
  draw: '引き分け',
  drawSub: '盤面が埋まりました。',
  newGame: '新しいゲーム',
  changeDifficulty: '難易度を変更',
  black: '黒',
  white: '白',
  boardLabel: (size) => `五目並べ ${size}×${size} の盤面`,
  cellLabel: (row, col, stone) =>
    `${row}行 ${col}列${stone ? ` — ${stone}` : ''}`,
  infoTitle: '五目並べの遊び方',
  objectiveTitle: '目的',
  objectiveBody:
    '黒石を縦・横・斜めのいずれかに先に5つ並べれば勝ちです。',
  howToTitle: '遊び方',
  howToBody:
    '交点をクリックして黒石を置きます。AIは白石で応じます。最後に置いた石は青い枠、勝利ラインは緑で表示されます。',
  tipsTitle: 'コツ',
  tips: [
    '両端が空いた「活三（オープンスリー）」は強力な脅威になります。',
    '相手の「四」は必ず止めましょう。放置すると次で負けます。',
    '「二重の脅威」（活三を同時に2つ）を作れば防ぎきれません。',
    '中央を制すると、より多くの勝ち筋に絡めます。',
  ],
  difficulties: {
    easy: { label: '初級', description: '浅い読み・時々甘い手' },
    medium: { label: '中級', description: '堅実な戦術' },
    hard: { label: '上級', description: '深い読み・手応えあり' },
    expert: { label: '達人', description: '非常に深く脅威を読む' },
    master: { label: '名人', description: '最大の深さ・容赦なし' },
  },
};

export const getGomokuStrings = (language: GameLanguage): GomokuStrings =>
  language === 'ja' ? ja : en;
