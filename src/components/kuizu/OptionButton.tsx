'use client';

import { QuestionOption } from '@/types/kuizu';
import { Card } from '@/components/ui/card';
import { CheckCircle, XCircle } from 'lucide-react';
import Image from 'next/image';

interface OptionButtonProps {
  option: QuestionOption;
  isSelected: boolean;
  isCorrect?: boolean;
  isIncorrect?: boolean;
  showResult: boolean;
  onClick: () => void;
  disabled: boolean;
  index: number;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export function OptionButton({
  option,
  isSelected,
  isCorrect = false,
  isIncorrect = false,
  showResult,
  onClick,
  disabled,
  index,
}: OptionButtonProps) {
  const label = OPTION_LABELS[index] || String(index + 1);

  const getCardStyles = () => {
    if (isCorrect) {
      return 'bg-green-100 border-green-500 border-2';
    }
    if (isIncorrect) {
      return 'bg-red-100 border-red-500 border-2';
    }
    if (isSelected && !showResult) {
      return 'border-amber-500 border-2 bg-amber-50';
    }
    return 'hover:border-amber-300 hover:shadow-md';
  };

  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200 p-4
        ${getCardStyles()}
        ${disabled ? 'cursor-not-allowed opacity-50' : ''}
      `}
      onClick={() => !disabled && onClick()}
    >
      <div className="flex items-center gap-3">
        <div
          className={`
            w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0
            ${isCorrect ? 'bg-green-500 text-white' : ''}
            ${isIncorrect ? 'bg-red-500 text-white' : ''}
            ${!isCorrect && !isIncorrect && isSelected ? 'bg-amber-500 text-white' : ''}
            ${!isCorrect && !isIncorrect && !isSelected ? 'bg-gray-200 text-gray-700' : ''}
          `}
        >
          {label}
        </div>

        <div className="flex-1">
          {option.imageUrl ? (
            <Image
              src={option.imageUrl}
              alt={option.text}
              width={640}
              height={256}
              unoptimized
              className="w-full h-32 object-cover rounded"
            />
          ) : null}
          <div className={`
            ${option.imageUrl ? 'mt-2 text-sm' : 'text-base'}
            ${isCorrect ? 'text-green-900 font-semibold' : ''}
            ${isIncorrect ? 'text-red-900' : ''}
            ${!isCorrect && !isIncorrect ? 'text-gray-800' : ''}
          `}>
            {option.text}
          </div>
        </div>

        {showResult && (
          <div className="flex-shrink-0">
            {isCorrect && <CheckCircle className="w-6 h-6 text-green-600" />}
            {isIncorrect && <XCircle className="w-6 h-6 text-red-600" />}
          </div>
        )}
      </div>
    </Card>
  );
}
