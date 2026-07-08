/**
 * Local bilingual (ja/en) strings for Mirror Othello. Kept in the component
 * dir per the revamp spec — no new keys added to shared gameTranslations.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty, DifficultyOption } from '../common';

export interface MirrorOthelloStrings {
  title: string;
  subtitle: string;
  selectDifficulty: string;
  start: string;
  restart: string;
  playAgain: string;
  yourTurn: string;
  aiThinking: string;
  youPass: string;
  aiPass: string;
  mirrored: string;
  you: string;
  ai: string;
  turn: string;
  untilMirror: (n: number) => string;
  youWin: string;
  aiWins: string;
  draw: string;
  gameOver: (you: number, ai: number) => string;
  played: (who: string, cell: string) => string;
  legalHint: string;
  infoTitle: string;
  howToPlay: string[];
  difficultyOptions: DifficultyOption[];
}

const en: MirrorOthelloStrings = {
  title: 'Mirror Othello',
  subtitle: 'Othello where the board flips left-right every 4 moves — corner plans keep collapsing.',
  selectDifficulty: 'Select difficulty',
  start: 'Start Game',
  restart: 'Restart',
  playAgain: 'Play Again',
  yourTurn: 'Your turn',
  aiThinking: 'AI is thinking…',
  youPass: 'You have no move — pass.',
  aiPass: 'AI has no move — pass.',
  mirrored: 'Board mirrored!',
  you: 'You',
  ai: 'AI',
  turn: 'Turn',
  untilMirror: (n) => (n === 1 ? 'Mirror next move!' : `Mirror in ${n} moves`),
  youWin: 'You win!',
  aiWins: 'AI wins',
  draw: 'Draw',
  gameOver: (you, ai) => `Game over — You ${you} : ${ai} AI`,
  played: (who, cell) => `${who} played ${cell}.`,
  legalHint: 'Legal move',
  infoTitle: 'How to play Mirror Othello',
  howToPlay: [
    'Standard Othello rules: place a disc so it traps a line of the opponent between your discs, flipping them all to your color.',
    'The twist: every 4 moves (by either side) the whole board flips left ↔ right. Corners swap sides, so a "safe" corner can suddenly be exposed.',
    'Dots mark your legal moves. Watch the "Mirror in N moves" counter and plan for the flip.',
    'You play the dark discs. Most discs when the board fills up wins.',
    'Pick a difficulty: higher tiers search deeper and see through the mirror further ahead.',
  ],
  difficultyOptions: [
    { value: 'easy', label: 'Easy', description: 'Shallow search, plays some random moves' },
    { value: 'medium', label: 'Medium', description: 'Looks 3 moves ahead through the mirror' },
    { value: 'hard', label: 'Hard', description: 'Looks 5 moves ahead — a real challenge' },
    { value: 'expert', label: 'Expert', description: 'Looks 7 moves ahead, plays sharp' },
    { value: 'master', label: 'Master', description: 'Deep 9-ply search with exact endgame' },
  ],
};

const ja: MirrorOthelloStrings = {
  title: 'ミラーオセロ',
  subtitle: '4手ごとに盤面が左右反転するオセロ。角取り戦略が突然崩れる。',
  selectDifficulty: '難易度を選択',
  start: 'ゲーム開始',
  restart: 'リスタート',
  playAgain: 'もう一度',
  yourTurn: 'あなたの番',
  aiThinking: 'AI思考中…',
  youPass: '置ける場所がないためパス。',
  aiPass: 'AIは置けないためパス。',
  mirrored: '盤面が反転！',
  you: 'あなた',
  ai: 'AI',
  turn: '手番',
  untilMirror: (n) => (n === 1 ? '次の手で反転！' : `あと${n}手で反転`),
  youWin: 'あなたの勝ち！',
  aiWins: 'AIの勝ち',
  draw: '引き分け',
  gameOver: (you, ai) => `ゲーム終了 — あなた ${you} : ${ai} AI`,
  played: (who, cell) => `${who}が ${cell} に着手。`,
  legalHint: '着手可能',
  infoTitle: 'ミラーオセロの遊び方',
  howToPlay: [
    '基本ルールはオセロと同じ。相手の石を自分の石で挟むように置くと、挟んだ石が全て自分の色に変わります。',
    '仕掛け：どちらかが4手打つごとに盤面全体が左右反転します。角も左右入れ替わるので、確保したはずの角が急に危険になります。',
    '点で示された場所が着手可能マスです。「あと◯手で反転」の表示を見ながら反転に備えましょう。',
    'あなたは黒石です。盤が埋まったとき石が多い方が勝ちです。',
    '難易度を選択：上位ほど深く読み、反転の先まで見通します。',
  ],
  difficultyOptions: [
    { value: 'easy', label: '初級', description: '浅い読み。時々ランダムに打ちます' },
    { value: 'medium', label: '中級', description: '反転を含め3手先まで読みます' },
    { value: 'hard', label: '上級', description: '5手先まで読む手強い相手' },
    { value: 'expert', label: '達人', description: '7手先まで読み鋭く打ちます' },
    { value: 'master', label: '名人', description: '9手先読み＋終盤は完全読み' },
  ],
};

export const getMirrorOthelloStrings = (
  language: GameLanguage,
): MirrorOthelloStrings => (language === 'ja' ? ja : en);

export type { Difficulty };
