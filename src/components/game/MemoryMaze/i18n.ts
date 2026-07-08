/**
 * Local ja/en strings for Memory Maze. Kept in the component dir so we don't
 * touch the shared gameTranslations.ts.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from '../common/types';

export interface MemoryMazeStrings {
  title: string;
  subtitle: string;
  selectDifficulty: string;
  start: string;
  restart: string;
  nextStage: string;
  playAgain: string;
  howToPlay: string;
  // HUD
  stage: string;
  time: string;
  moves: string;
  lives: string;
  score: string;
  best: string;
  hideIn: string;
  // Phase messages
  memorize: string;
  recall: string;
  wall: string;
  keepGoing: string;
  stageClear: string;
  timeUp: string;
  outOfLives: string;
  // Difficulty option labels/descriptions
  difficulty: Record<Difficulty, { label: string; description: string }>;
  // Info modal
  howToTitle: string;
  howToBody: string[];
  controls: string;
  controlsDetail: string;
  // Grid cell aria-labels (for screen readers)
  cellPlayer: string;
  cellGoal: string;
  cellWall: string;
  cellPath: string;
}

const en: MemoryMazeStrings = {
  title: 'Memory Maze',
  subtitle: 'Memorize the maze while it flashes, then navigate to the goal from memory.',
  selectDifficulty: 'Select Difficulty',
  start: 'Start',
  restart: 'Restart',
  nextStage: 'Next Stage',
  playAgain: 'Play Again',
  howToPlay: 'How to play',
  stage: 'Stage',
  time: 'Time',
  moves: 'Moves',
  lives: 'Lives',
  score: 'Score',
  best: 'Best',
  hideIn: 'Hides in',
  memorize: 'Memorize the maze and the glowing path...',
  recall: 'Maze hidden — reach the goal from memory!',
  wall: 'Wall! You lost a life.',
  keepGoing: 'Keep going...',
  stageClear: 'Stage clear!',
  timeUp: "Time's up!",
  outOfLives: 'Out of lives!',
  difficulty: {
    easy: { label: 'Easy', description: 'Small grid, long peek, 5 lives' },
    medium: { label: 'Medium', description: 'Bigger grid, 4 lives' },
    hard: { label: 'Hard', description: 'Dense walls, short peek, 3 lives' },
    expert: { label: 'Expert', description: 'Large maze, quick flash, 3 lives' },
    master: { label: 'Master', description: 'Huge maze, blink-and-miss, 2 lives' },
  },
  howToTitle: 'How to play',
  howToBody: [
    'The maze flashes for a few seconds with the shortest path glowing. Memorize it.',
    'When the maze hides, move from the start (top-left) to the goal (bottom-right).',
    'Bumping into a hidden wall costs a life. Run out of lives or time and the stage ends.',
    'Score rewards efficient routing, leftover time, and saved lives. Clear stages to level up.',
  ],
  controls: 'Controls',
  controlsDetail: 'Arrow keys / WASD, on-screen D-pad, or swipe on touch devices.',
  cellPlayer: 'player',
  cellGoal: 'goal',
  cellWall: 'wall',
  cellPath: 'path',
};

const ja: MemoryMazeStrings = {
  title: 'メモリーメイズ',
  subtitle: '一瞬だけ表示される迷路を記憶し、暗闇の中で記憶を頼りにゴールを目指す。',
  selectDifficulty: '難易度を選択',
  start: 'スタート',
  restart: 'リスタート',
  nextStage: '次のステージ',
  playAgain: 'もう一度',
  howToPlay: '遊び方',
  stage: 'ステージ',
  time: '残り時間',
  moves: '手数',
  lives: 'ライフ',
  score: 'スコア',
  best: 'ベスト',
  hideIn: '消えるまで',
  memorize: '迷路と光る最短経路を記憶しよう...',
  recall: '迷路が消えた — 記憶を頼りにゴールへ！',
  wall: '壁だ！ライフが1つ減った。',
  keepGoing: 'その調子...',
  stageClear: 'ステージクリア！',
  timeUp: '時間切れ！',
  outOfLives: 'ライフ切れ！',
  difficulty: {
    easy: { label: 'かんたん', description: '小さい迷路・長い表示・ライフ5' },
    medium: { label: 'ふつう', description: '少し大きい迷路・ライフ4' },
    hard: { label: 'むずかしい', description: '壁が多い・短い表示・ライフ3' },
    expert: { label: 'エキスパート', description: '大きい迷路・一瞬表示・ライフ3' },
    master: { label: 'マスター', description: '巨大迷路・瞬き厳禁・ライフ2' },
  },
  howToTitle: '遊び方',
  howToBody: [
    '迷路が数秒間だけ表示され、最短経路が光ります。しっかり記憶しましょう。',
    '迷路が消えたら、スタート（左上）からゴール（右下）まで進みます。',
    '見えない壁にぶつかるとライフが減ります。ライフか時間が尽きるとステージ終了です。',
    'スコアは効率的な経路・残り時間・残ったライフで加算。クリアするとレベルアップします。',
  ],
  controls: '操作',
  controlsDetail: '矢印キー / WASD、画面上の十字キー、タッチではスワイプで移動。',
  cellPlayer: 'プレイヤー',
  cellGoal: 'ゴール',
  cellWall: '壁',
  cellPath: '通路',
};

export const getStrings = (language: GameLanguage): MemoryMazeStrings =>
  language === 'ja' ? ja : en;
