'use client';

import { Quiz, QUIZ_CATEGORY_EMOJI, QUIZ_CATEGORY_LABELS, QUIZ_DIFFICULTY_LABELS } from '@/types/kuizu';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Share2, Lock, Clock, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface QuizCardProps {
  quiz: Quiz;
  onClick?: () => void;
  onShare?: () => void;
  compact?: boolean;
}

export function QuizCard({ quiz, onClick, onShare, compact = false }: QuizCardProps) {
  const { t } = useTranslation();

  const getDifficultyColor = () => {
    switch (quiz.difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'normal':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'hard':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  if (compact) {
    return (
      <Card
        className="p-4 cursor-pointer hover:shadow-md transition-all duration-200 hover:border-amber-300"
        onClick={onClick}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-2xl flex-shrink-0">
              {QUIZ_CATEGORY_EMOJI[quiz.category]}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {quiz.title}
              </h3>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                <HelpCircle className="w-3 h-3" />
                <span>{quiz.questionCount} questions</span>
              </div>
            </div>
          </div>
          <Badge variant="outline" className={getDifficultyColor()}>
            {QUIZ_DIFFICULTY_LABELS[quiz.difficulty]}
          </Badge>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 hover:shadow-lg transition-all duration-200 hover:border-amber-300">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-4xl flex-shrink-0">
              {QUIZ_CATEGORY_EMOJI[quiz.category]}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-xl text-gray-900 mb-1">
                {quiz.title}
              </h3>
              {quiz.description && (
                <p className="text-sm text-gray-600 line-clamp-2">
                  {quiz.description}
                </p>
              )}
            </div>
          </div>
          {quiz.hasPasscode && (
            <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            {QUIZ_CATEGORY_LABELS[quiz.category]}
          </Badge>
          <Badge variant="outline" className={getDifficultyColor()}>
            {QUIZ_DIFFICULTY_LABELS[quiz.difficulty]}
          </Badge>
          {quiz.isCustom && (
            <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
              {t('kuizu.custom', 'Custom')}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <HelpCircle className="w-4 h-4" />
            <span>{quiz.questionCount} questions</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{quiz.timePerQuestion}s per question</span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          {onClick && (
            <Button
              className="flex-1 bg-gradient-to-r from-amber-600 to-amber-400 hover:from-amber-700 hover:to-amber-500"
              onClick={onClick}
            >
              {t('kuizu.startQuiz', 'Start Quiz')}
            </Button>
          )}
          {onShare && quiz.shareCode && (
            <Button
              variant="outline"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              className="hover:bg-amber-50 hover:border-amber-300"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
