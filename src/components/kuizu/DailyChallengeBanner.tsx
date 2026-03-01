'use client';

import { useTranslation } from 'react-i18next';
import { Calendar, CheckCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DailyChallenge, DailyChallengeEntry, QUIZ_CATEGORY_EMOJI } from '@/types/kuizu';

interface DailyChallengeBannerProps {
  challenge?: DailyChallenge;
  userEntry?: DailyChallengeEntry;
  onPlay: () => void;
  loading?: boolean;
}

export function DailyChallengeBanner({
  challenge,
  userEntry,
  onPlay,
  loading = false,
}: DailyChallengeBannerProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card className="border-orange-300 bg-gradient-to-r from-orange-100 to-amber-100">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-orange-600 animate-pulse" />
            <CardTitle className="text-orange-900">{t('kuizu.dailyChallenge')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            <div className="h-6 bg-orange-200 rounded w-3/4"></div>
            <div className="h-4 bg-orange-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!challenge) {
    return (
      <Card className="border-orange-300 bg-gradient-to-r from-orange-100 to-amber-100">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-orange-600" />
            <CardTitle className="text-orange-900">{t('kuizu.dailyChallenge')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-orange-700">{t('kuizu.noChallengeToday')}</p>
        </CardContent>
      </Card>
    );
  }

  const categoryEmoji = QUIZ_CATEGORY_EMOJI[challenge.category];
  const difficultyColors = {
    easy: 'bg-green-100 text-green-800 border-green-300',
    normal: 'bg-blue-100 text-blue-800 border-blue-300',
    hard: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <Card className="border-orange-300 bg-gradient-to-r from-orange-100 to-amber-100 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-orange-600" />
            <CardTitle className="text-orange-900">{t('kuizu.dailyChallenge')}</CardTitle>
          </div>
          {userEntry && (
            <Badge className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-3 w-3 mr-1" />
              {t('kuizu.completed')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Challenge Info */}
          <div className="flex items-center gap-3">
            <span className="text-4xl">{categoryEmoji}</span>
            <div className="flex-1">
              <p className="font-semibold text-orange-900">
                {t(`kuizu.categories.${challenge.category}`)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={difficultyColors[challenge.difficulty]}
                >
                  {t(`kuizu.difficulty.${challenge.difficulty}`)}
                </Badge>
                <span className="text-sm text-orange-700">
                  {challenge.questionCount} {t('kuizu.questions')}
                </span>
              </div>
            </div>
          </div>

          {/* User Entry or Play Button */}
          {userEntry ? (
            <div className="bg-white/50 rounded-lg p-3 border border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-700">{t('kuizu.yourScore')}</p>
                  <p className="text-2xl font-bold text-orange-900">{userEntry.score}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-orange-700">{t('kuizu.accuracy')}</p>
                  <p className="text-lg font-semibold text-orange-800">
                    {userEntry.accuracy.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={onPlay}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold"
              size="lg"
            >
              <Play className="h-5 w-5 mr-2" />
              {t('kuizu.playNow')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
