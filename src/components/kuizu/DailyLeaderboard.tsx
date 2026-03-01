'use client';

import { useTranslation } from 'react-i18next';
import { Trophy, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DailyChallengeEntry } from '@/types/kuizu';

interface DailyLeaderboardProps {
  entries: DailyChallengeEntry[];
  currentUserId?: string;
  loading?: boolean;
}

export function DailyLeaderboard({
  entries,
  currentUserId,
  loading = false,
}: DailyLeaderboardProps) {
  const { t } = useTranslation();

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0
      ? `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
      : `${seconds}s`;
  };

  const getTrophyIcon = (position: number) => {
    const trophyColors = {
      1: 'text-yellow-500',
      2: 'text-gray-400',
      3: 'text-orange-600',
    };

    if (position <= 3) {
      return <Trophy className={`h-5 w-5 ${trophyColors[position as 1 | 2 | 3]}`} />;
    }
    return null;
  };

  if (loading) {
    return (
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle className="text-orange-900 flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {t('kuizu.leaderboard')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-orange-100 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle className="text-orange-900 flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {t('kuizu.leaderboard')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Trophy className="h-12 w-12 mx-auto mb-3 text-orange-300" />
            <p className="text-orange-600">{t('kuizu.noEntriesYet')}</p>
            <p className="text-sm text-orange-500 mt-1">
              {t('kuizu.beTheFirstToComplete')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort entries by score (descending), then by time (ascending)
  const sortedEntries = [...entries].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.timeTaken - b.timeTaken;
  });

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle className="text-orange-900 flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          {t('kuizu.leaderboard')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sortedEntries.map((entry, index) => {
            const position = index + 1;
            const isCurrentUser = currentUserId && entry.userId === currentUserId;

            return (
              <div
                key={entry.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  isCurrentUser
                    ? 'bg-orange-100 border-orange-400 shadow-md'
                    : 'bg-white border-orange-200 hover:bg-orange-50'
                }`}
              >
                {/* Position and Trophy */}
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 text-orange-900 font-bold">
                  {getTrophyIcon(position) || position}
                </div>

                {/* Display Name */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-semibold truncate ${
                      isCurrentUser ? 'text-orange-900' : 'text-gray-900'
                    }`}
                  >
                    {entry.displayName}
                    {isCurrentUser && (
                      <Badge className="ml-2 bg-orange-600 hover:bg-orange-700 text-xs">
                        {t('kuizu.you')}
                      </Badge>
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                    <span className="flex items-center gap-1">
                      <Trophy className="h-3 w-3" />
                      {entry.score}
                    </span>
                    <span>•</span>
                    <span>{entry.accuracy.toFixed(1)}%</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(entry.timeTaken)}
                    </span>
                  </div>
                </div>

                {/* Score Badge */}
                <div className="text-right">
                  <Badge
                    variant="outline"
                    className={
                      position === 1
                        ? 'bg-yellow-100 text-yellow-900 border-yellow-300'
                        : position === 2
                        ? 'bg-gray-100 text-gray-900 border-gray-300'
                        : position === 3
                        ? 'bg-orange-100 text-orange-900 border-orange-300'
                        : 'bg-orange-50 text-orange-800 border-orange-200'
                    }
                  >
                    #{position}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
