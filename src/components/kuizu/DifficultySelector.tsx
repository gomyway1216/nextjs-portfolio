'use client';

import { QuizDifficulty, QUIZ_DIFFICULTY_LABELS } from '@/types/kuizu';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface DifficultySelectorProps {
  selected: QuizDifficulty;
  onSelect: (difficulty: QuizDifficulty) => void;
  disabled?: boolean;
}

export function DifficultySelector({ selected, onSelect, disabled }: DifficultySelectorProps) {
  const { t } = useTranslation();

  const difficulties = [
    QuizDifficulty.EASY,
    QuizDifficulty.NORMAL,
    QuizDifficulty.HARD,
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {difficulties.map((difficulty) => {
        const isSelected = selected === difficulty;

        return (
          <Button
            key={difficulty}
            variant={isSelected ? 'default' : 'outline'}
            className={`
              transition-all duration-200
              ${isSelected ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'hover:border-amber-300'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            onClick={() => !disabled && onSelect(difficulty)}
            disabled={disabled}
          >
            {QUIZ_DIFFICULTY_LABELS[difficulty]}
          </Button>
        );
      })}
    </div>
  );
}
