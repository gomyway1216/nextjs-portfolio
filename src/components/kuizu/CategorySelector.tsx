'use client';

import { QuizCategory, QUIZ_CATEGORY_LABELS, QUIZ_CATEGORY_EMOJI } from '@/types/kuizu';
import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

interface CategorySelectorProps {
  selected?: QuizCategory;
  onSelect: (category: QuizCategory) => void;
  disabled?: boolean;
}

export function CategorySelector({ selected, onSelect, disabled }: CategorySelectorProps) {
  const { t } = useTranslation();

  // Get all categories except CUSTOM
  const categories = Object.values(QuizCategory).filter(
    (cat) => cat !== QuizCategory.CUSTOM
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {categories.map((category) => {
        const isSelected = selected === category;

        return (
          <Card
            key={category}
            className={`
              cursor-pointer transition-all duration-200 p-4
              hover:shadow-md hover:scale-105
              ${isSelected ? 'ring-2 ring-amber-500 bg-amber-50' : 'hover:border-amber-200'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            onClick={() => !disabled && onSelect(category)}
          >
            <div className="flex flex-col items-center justify-center gap-2 text-center">
              <span className="text-3xl">{QUIZ_CATEGORY_EMOJI[category]}</span>
              <span className={`text-sm font-medium ${isSelected ? 'text-amber-600' : 'text-gray-700'}`}>
                {QUIZ_CATEGORY_LABELS[category]}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
