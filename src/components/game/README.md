# Game Components Architecture

This directory contains all game components following best engineering practices.

## Structure

```
game/
├── common/                    # Shared components and utilities
│   ├── types.ts              # Common types (Difficulty, GameStatus, GameStats)
│   ├── utils.ts              # Utility functions (getDifficultyColor, buttonStyles)
│   ├── GameTopBar.tsx        # Reusable top bar with stats
│   ├── DifficultySelector.tsx # Reusable difficulty selection UI
│   ├── InfoModal.tsx         # Reusable info modal wrapper
│   └── index.ts              # Exports
│
├── Gomoku/                   # Gomoku game (example of good structure)
│   ├── types.ts              # Gomoku-specific types
│   ├── GomokuAI.ts          # AI logic separated from UI
│   ├── Gomoku.tsx           # Main component (to be refactored)
│   └── index.ts             # Exports
│
├── TicTacToe/               # To be organized
│   ├── types.ts             # TicTacToe-specific types
│   ├── TicTacToeAI.ts      # AI logic
│   ├── TicTacToe.tsx       # Main component
│   └── index.ts            # Exports
│
├── JumpGame/                # To be organized
│   ├── types.ts             # JumpGame-specific types
│   ├── gameLogic.ts        # Game logic
│   ├── JumpGame.tsx        # Main component
│   └── index.ts            # Exports
│
├── JumpGame.tsx            # Legacy (to be refactored)
├── TicTacToe.tsx          # Legacy (to be refactored)
└── Gomoku.tsx             # Legacy (to be refactored)
```

## Common Components

### GameTopBar
Reusable top bar with back link, stats display, and info button.

**Props:**
- `stats`: GameStats object
- `onInfoClick`: Function to handle info button click
- `additionalContent?`: Optional React node for extra content (e.g., stage indicator)

**Usage:**
```tsx
<GameTopBar
  stats={stats}
  onInfoClick={() => setShowInfo(true)}
  additionalContent={<StageIndicator stage={currentStage} />}
/>
```

### DifficultySelector
Reusable difficulty selection screen.

**Props:**
- `title`: Game title
- `subtitle?`: Optional subtitle text
- `icon?`: Optional icon/emoji
- `selectedDifficulty`: Currently selected difficulty
- `onSelectDifficulty`: Function to handle difficulty selection
- `options`: Array of difficulty options with labels and descriptions
- `onStart`: Function to handle game start

**Usage:**
```tsx
<DifficultySelector
  title="Gomoku"
  subtitle="Five in a Row - Challenge the AI!"
  icon={<>⚫⚪</>}
  selectedDifficulty={difficulty}
  onSelectDifficulty={setDifficulty}
  options={[
    { value: 'easy', label: 'Easy', description: 'AI searches 2 moves ahead' },
    { value: 'medium', label: 'Medium', description: 'AI searches 3 moves ahead' },
    { value: 'hard', label: 'Hard', description: 'AI searches 4 moves ahead' }
  ]}
  onStart={startGame}
/>
```

### InfoModal
Reusable modal for "How to Play" content.

**Props:**
- `isOpen`: Boolean to control visibility
- `onClose`: Function to handle modal close
- `title`: Modal title
- `children`: Modal content

**Usage:**
```tsx
<InfoModal
  isOpen={showInfo}
  onClose={() => setShowInfo(false)}
  title="How to Play Gomoku"
>
  <InfoContent />
</InfoModal>
```

## Common Types

### Difficulty
```typescript
type Difficulty = 'easy' | 'medium' | 'hard';
```

### GameStatus
```typescript
type GameStatus = 'playing' | 'win' | 'lose' | 'draw';
```

### GameStats
```typescript
interface GameStats {
  wins: number;
  losses: number;
  draws: number;
}
```

## Common Utilities

### getDifficultyColor
Returns color scheme for a difficulty level.

```typescript
const colors = getDifficultyColor('easy');
// Returns: { bg: string, border: string, text: string }
```

### buttonStyles
Pre-defined button styles for primary and secondary buttons.

```typescript
const primaryStyle = buttonStyles.primary;
const secondaryStyle = buttonStyles.secondary;
```

## Refactoring Guidelines

When refactoring a game component:

1. **Extract Types**
   - Create `types.ts` in game subfolder
   - Define game-specific types
   - Export constants

2. **Separate Logic**
   - Extract AI logic to separate file (e.g., `GomokuAI.ts`)
   - Extract game rules/physics to utility file
   - Keep UI component focused on rendering

3. **Use Common Components**
   - Replace custom top bar with `<GameTopBar />`
   - Replace difficulty selection with `<DifficultySelector />`
   - Replace info modal with `<InfoModal />`

4. **Import from Common**
   - Use common types instead of redefining
   - Use `getDifficultyColor()` utility
   - Use common button styles

5. **Create Index File**
   - Export default component
   - Export types and utilities
   - Clean public API

## Example Refactor

Before:
```typescript
// JumpGame.tsx (1200+ lines, everything mixed together)
const JumpGame = () => {
  // Types defined inline
  // Game logic mixed with UI
  // Custom difficulty selector
  // Custom top bar
  // Custom modal
}
```

After:
```typescript
// JumpGame/types.ts
export type Enemy = { x: number; y: number; /* ... */ };
export const GAME_CONSTANTS = { /* ... */ };

// JumpGame/gameLogic.ts
export const createEnemy = (/* ... */) => { /* ... */ };
export const checkCollision = (/* ... */) => { /* ... */ };

// JumpGame/JumpGame.tsx
import { GameTopBar, DifficultySelector, InfoModal } from '../common';
import { Enemy, GAME_CONSTANTS } from './types';
import { createEnemy, checkCollision } from './gameLogic';

const JumpGame = () => {
  // Clean, focused component
  return (
    <>
      <GameTopBar stats={stats} onInfoClick={handleInfo} />
      {/* Game canvas */}
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)}>
        {/* Content */}
      </InfoModal>
    </>
  );
};

// JumpGame/index.ts
export { default } from './JumpGame';
export * from './types';
```

## Benefits

1. **Reusability**: Common components used across all games
2. **Maintainability**: Clear separation of concerns
3. **Testability**: Logic separated from UI
4. **Consistency**: Shared styles and behavior
5. **Scalability**: Easy to add new games
6. **Type Safety**: Centralized type definitions
7. **Code Organization**: Clear file structure

## Next Steps

1. Refactor `TicTacToe.tsx` → `TicTacToe/` folder
2. Refactor `JumpGame.tsx` → `JumpGame/` folder
3. Update `Gomoku.tsx` to use common components
4. Remove legacy files after migration
5. Update imports in page files
