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
  {
    id: 'shogi',
    title: 'Shogi',
    description: 'Japanese Chess! Strategic board game with piece drops and promotions. Challenge the AI in this classic strategy game!',
    thumbnail: '☗',
    path: '/games/shogi',
    difficulty: 'Hard',
    category: 'Strategy',
  },
  {
    id: 'othello',
    title: 'Othello',
    description: 'Classic strategy board game with AI using alpha-beta search. Flip your opponent\'s discs to win!',
    thumbnail: '⚫',
    path: '/games/othello',
    difficulty: 'Medium',
    category: 'Strategy',
  },
  {
    id: 'mini-adventure',
    title: 'Mini Adventure',
    description: 'Roguelike dungeon crawler! Descend 10 floors, manage your torch, and defeat the Dragon boss!',
    thumbnail: '🗡️',
    path: '/games/mini-adventure',
    difficulty: 'Hard',
    category: 'RPG',
  },
  {
    id: 'breakout',
    title: 'Breakout',
    description: 'Classic brick-breaking arcade game! Use your paddle to bounce the ball and destroy all bricks. Collect power-ups!',
    thumbnail: '🧱',
    path: '/games/breakout',
    difficulty: 'Easy',
    category: 'Arcade',
  },
  {
    id: 'space-invaders',
    title: 'Space Invaders',
    description: 'Defend Earth from alien invasion! Destroy waves of enemies, use shields for cover, and shoot the mystery UFO for bonus points.',
    thumbnail: '👾',
    path: '/games/space-invaders',
    difficulty: 'Medium',
    category: 'Arcade',
  },
];
