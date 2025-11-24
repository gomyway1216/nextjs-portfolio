/**
 * Shared games data
 */

export interface Game {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  path: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
}

export const games: Game[] = [
  {
    id: 'jump-game',
    title: 'Jump Game',
    description: 'A classic jump-and-dodge arcade game. Press any key to jump over obstacles and rack up points!',
    thumbnail: '🎮',
    path: '/games/jump-game',
    difficulty: 'Easy',
    category: 'Arcade',
  },
  {
    id: 'tic-tac-toe',
    title: 'Tic Tac Toe',
    description: 'Challenge the AI in this classic strategy game! Choose from Easy, Medium, or Hard difficulty and test your skills.',
    thumbnail: '⭕',
    path: '/games/tic-tac-toe',
    difficulty: 'Medium',
    category: 'Strategy',
  },
  {
    id: 'gomoku',
    title: 'Gomoku',
    description: 'Five in a Row! Strategic board game with AI using minimax and alpha-beta pruning. Can you outsmart the algorithm?',
    thumbnail: '⚫',
    path: '/games/gomoku',
    difficulty: 'Hard',
    category: 'Strategy',
  },
  {
    id: 'tetris',
    title: 'Tetris',
    description: 'Classic block-stacking puzzle game. Clear lines by completing horizontal rows. Speed increases as you level up!',
    thumbnail: '🟦',
    path: '/games/tetris',
    difficulty: 'Medium',
    category: 'Puzzle',
  },
];
