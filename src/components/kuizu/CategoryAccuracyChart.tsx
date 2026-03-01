'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KuizuUserStats, QUIZ_CATEGORY_LABELS, QUIZ_CATEGORY_EMOJI } from '@/types/kuizu';

interface CategoryAccuracyChartProps {
  categoryStats: KuizuUserStats['categoryStats'];
}

export default function CategoryAccuracyChart({
  categoryStats,
}: CategoryAccuracyChartProps) {
  const { t } = useTranslation();

  // Sort categories by quizzes taken (descending)
  const sortedCategories = Object.entries(categoryStats)
    .filter(([_, stats]) => stats.quizzesTaken > 0)
    .sort(([_, a], [__, b]) => b.quizzesTaken - a.quizzesTaken);

  if (sortedCategories.length === 0) {
    return (
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle>{t('kuizu.stats.categoryAccuracy')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            {t('kuizu.stats.noDataYet')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxAccuracy = 100;

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 80) return 'from-green-500 to-emerald-500';
    if (accuracy >= 60) return 'from-orange-500 to-amber-500';
    return 'from-red-500 to-rose-500';
  };

  const getAccuracyTextColor = (accuracy: number) => {
    if (accuracy >= 80) return 'text-green-600';
    if (accuracy >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle>{t('kuizu.stats.categoryAccuracy')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {sortedCategories.map(([category, stats]) => (
            <div key={category} className="space-y-2">
              {/* Category Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    {QUIZ_CATEGORY_EMOJI[category as keyof typeof QUIZ_CATEGORY_EMOJI]}
                  </span>
                  <span className="font-medium text-sm">
                    {QUIZ_CATEGORY_LABELS[category as keyof typeof QUIZ_CATEGORY_LABELS]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {stats.quizzesTaken} {t('kuizu.quizzes')}
                  </span>
                  <span
                    className={`text-lg font-bold ${getAccuracyTextColor(
                      stats.accuracy
                    )}`}
                  >
                    {Math.round(stats.accuracy)}%
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative">
                <div className="w-full h-8 bg-gray-100 rounded-lg overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${getAccuracyColor(
                      stats.accuracy
                    )} transition-all duration-500 ease-out`}
                    style={{ width: `${(stats.accuracy / maxAccuracy) * 100}%` }}
                  />
                </div>

                {/* Stats Overlay */}
                <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-medium">
                  <span className="text-white drop-shadow-md">
                    {stats.correctAnswers} / {stats.totalQuestions} {t('kuizu.correct')}
                  </span>
                  {stats.bestScore > 0 && (
                    <span className="text-white drop-shadow-md">
                      {t('kuizu.stats.best')}: {stats.bestScore}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-r from-green-500 to-emerald-500" />
              <span className="text-gray-600">80%+ {t('kuizu.stats.excellent')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-r from-orange-500 to-amber-500" />
              <span className="text-gray-600">60-79% {t('kuizu.stats.good')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-r from-red-500 to-rose-500" />
              <span className="text-gray-600">&lt;60% {t('kuizu.stats.needsWork')}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
