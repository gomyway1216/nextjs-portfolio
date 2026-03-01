'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Trophy,
  Target,
  Award,
  Flame,
  Calendar,
  Users,
  TrendingUp,
} from 'lucide-react';
import { KuizuUserStats, QUIZ_CATEGORY_LABELS, QUIZ_CATEGORY_EMOJI } from '@/types/kuizu';

interface StatsOverviewProps {
  stats: KuizuUserStats;
}

export default function StatsOverview({ stats }: StatsOverviewProps) {
  const { t } = useTranslation();

  const overallAccuracy =
    stats.totalQuizzesTaken > 0
      ? Math.round(
          (stats.totalCorrect /
            (stats.totalQuizzesTaken *
              Object.values(stats.categoryStats).reduce(
                (sum, cat) => sum + cat.totalQuestions,
                0
              ) /
              Object.keys(stats.categoryStats).length)) *
            100
        )
      : 0;

  const statCards = [
    {
      icon: Trophy,
      label: t('kuizu.stats.totalQuizzes'),
      value: stats.totalQuizzesTaken,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
    },
    {
      icon: Target,
      label: t('kuizu.stats.totalCorrect'),
      value: stats.totalCorrect,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
    {
      icon: Award,
      label: t('kuizu.stats.totalPoints'),
      value: stats.totalPoints.toLocaleString(),
      color: 'text-amber-500',
      bgColor: 'bg-amber-50',
    },
    {
      icon: Flame,
      label: t('kuizu.stats.bestStreak'),
      value: stats.bestStreak,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
    },
    {
      icon: Calendar,
      label: t('kuizu.stats.dailyChallenges'),
      value: stats.dailyChallengesCompleted,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      icon: Users,
      label: t('kuizu.stats.multiplayerGames'),
      value: stats.multiplayerGamesPlayed,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      icon: Trophy,
      label: t('kuizu.stats.multiplayerWins'),
      value: stats.multiplayerWins,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
    },
    {
      icon: TrendingUp,
      label: t('kuizu.stats.overallAccuracy'),
      value: `${overallAccuracy}%`,
      color: 'text-teal-500',
      bgColor: 'bg-teal-50',
    },
  ];

  // Sort categories by quizzes taken
  const sortedCategories = Object.entries(stats.categoryStats)
    .filter(([_, catStats]) => catStats.quizzesTaken > 0)
    .sort(([_, a], [__, b]) => b.quizzesTaken - a.quizzesTaken);

  return (
    <div className="space-y-6">
      {/* Overview Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className="border-orange-200">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-2">
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category Breakdown */}
      {sortedCategories.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle>{t('kuizu.stats.categoryBreakdown')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sortedCategories.map(([category, catStats]) => (
                <div
                  key={category}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">
                        {QUIZ_CATEGORY_EMOJI[category as keyof typeof QUIZ_CATEGORY_EMOJI]}
                      </span>
                      <span className="font-semibold">
                        {QUIZ_CATEGORY_LABELS[category as keyof typeof QUIZ_CATEGORY_LABELS]}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-orange-600">
                        {Math.round(catStats.accuracy)}%
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('kuizu.accuracy')}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">
                        {t('kuizu.stats.quizzesTaken')}
                      </div>
                      <div className="font-semibold">{catStats.quizzesTaken}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">
                        {t('kuizu.stats.correctAnswers')}
                      </div>
                      <div className="font-semibold">
                        {catStats.correctAnswers} / {catStats.totalQuestions}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">
                        {t('kuizu.stats.bestScore')}
                      </div>
                      <div className="font-semibold">{catStats.bestScore}</div>
                    </div>
                  </div>

                  {/* Accuracy Progress Bar */}
                  <div className="mt-3">
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-amber-500"
                        style={{ width: `${catStats.accuracy}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
