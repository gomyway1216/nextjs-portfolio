'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Target, Calendar, Trophy } from 'lucide-react';
import {
  KuizuHistoryEntry,
  QUIZ_CATEGORY_LABELS,
  QUIZ_CATEGORY_EMOJI,
  QUIZ_DIFFICULTY_LABELS,
} from '@/types/kuizu';

interface HistoryCardProps {
  entry: KuizuHistoryEntry;
  onClick?: () => void;
}

export default function HistoryCard({ entry, onClick }: HistoryCardProps) {
  const { t } = useTranslation();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return t('common.today');
    } else if (diffDays === 1) {
      return t('common.yesterday');
    } else if (diffDays < 7) {
      return t('common.daysAgo', { count: diffDays });
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'normal':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'hard':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 80) return 'text-green-600';
    if (accuracy >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <Card
      className={`border-orange-200 transition-all ${
        onClick
          ? 'cursor-pointer hover:shadow-md hover:border-orange-300'
          : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">
                  {QUIZ_CATEGORY_EMOJI[entry.category]}
                </span>
                <h3 className="font-semibold text-lg truncate">
                  {entry.quizTitle}
                </h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600">
                  {QUIZ_CATEGORY_LABELS[entry.category]}
                </span>
                <span className="text-gray-300">•</span>
                <Badge
                  variant="outline"
                  className={`text-xs ${getDifficultyColor(entry.difficulty)}`}
                >
                  {QUIZ_DIFFICULTY_LABELS[entry.difficulty]}
                </Badge>
                <span className="text-gray-300">•</span>
                <span className="text-xs text-gray-500 capitalize">
                  {entry.mode}
                </span>
              </div>
            </div>

            {/* Score Badge */}
            <div className="flex-shrink-0 text-right">
              <div className="flex items-center gap-1 text-orange-600">
                <Trophy className="w-4 h-4" />
                <span className="text-xl font-bold">{entry.score}</span>
              </div>
              <div className="text-xs text-gray-500">{t('kuizu.points')}</div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-100">
            {/* Accuracy */}
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-gray-400" />
              <div>
                <div className={`text-sm font-semibold ${getAccuracyColor(entry.accuracy)}`}>
                  {Math.round(entry.accuracy)}%
                </div>
                <div className="text-xs text-gray-500">
                  {t('kuizu.accuracy')}
                </div>
              </div>
            </div>

            {/* Correct Count */}
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-gray-400" />
              <div>
                <div className="text-sm font-semibold">
                  {entry.correctCount}/{entry.questionCount}
                </div>
                <div className="text-xs text-gray-500">
                  {t('kuizu.correct')}
                </div>
              </div>
            </div>

            {/* Time */}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <div>
                <div className="text-sm font-semibold">
                  {formatTime(entry.timeTaken)}
                </div>
                <div className="text-xs text-gray-500">
                  {t('kuizu.time')}
                </div>
              </div>
            </div>
          </div>

          {/* Date */}
          <div className="flex items-center gap-1 text-xs text-gray-500 pt-2 border-t border-gray-100">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(entry.createdAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
