/**
 * Local bilingual strings for TicTacToe.
 * Kept in the component dir per the revamp spec (no new shared keys).
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from '../common/types';

export interface TicTacToeCopy {
  title: string;
  subtitle: string;
  selectDifficulty: string;
  start: string;
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
}

const en: TicTacToeCopy = {
  title: 'Tic-Tac-Toe',
  subtitle: 'Line up three marks before the AI does.',
  selectDifficulty: 'Choose your opponent',
  start: 'Start Game',
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
    'Master never blunders. Against it, a draw is a win.'
  ],
  difficulties: {
    easy: { label: 'Easy', description: 'Plays mostly random moves' },
    medium: { label: 'Medium', description: 'Often slips up' },
    hard: { label: 'Hard', description: 'Sharp, with rare mistakes' },
    expert: { label: 'Expert', description: 'Almost never errs' },
    master: { label: 'Master', description: 'Perfect — unbeatable' }
  }
};

const ja: TicTacToeCopy = {
  title: '三目並べ',
  subtitle: 'AIより先に3つ並べよう。',
  selectDifficulty: '相手を選ぶ',
  start: 'ゲーム開始',
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
    'マスターはミスをしません。引き分けなら上出来です。'
  ],
  difficulties: {
    easy: { label: '初級', description: 'ほぼランダムに打つ' },
    medium: { label: '中級', description: 'よくミスをする' },
    hard: { label: '上級', description: '鋭いがたまにミス' },
    expert: { label: '達人', description: 'ほとんどミスなし' },
    master: { label: 'マスター', description: '完璧・負けなし' }
  }
};

export const getTicTacToeCopy = (language: GameLanguage): TicTacToeCopy =>
  language === 'ja' ? ja : en;
