'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Flame, ChevronRight } from 'lucide-react';
import { KuizuPlayer } from '@/types/kuizu';

interface MultiplayerScoreboardProps {
  players: KuizuPlayer[];
  playerScores: Record<string, number>;
  playerStreaks: Record<string, number>;
  currentPlayerId: string;
  onContinue?: () => void;
  isHost: boolean;
}

export default function MultiplayerScoreboard({
  players,
  playerScores,
  playerStreaks,
  currentPlayerId,
  onContinue,
  isHost,
}: MultiplayerScoreboardProps) {
  const { t } = useTranslation();

  // Sort players by score
  const sortedPlayers = [...players].sort((a, b) => {
    const scoreA = playerScores[a.id] || 0;
    const scoreB = playerScores[b.id] || 0;
    return scoreB - scoreA;
  });

  const getMedalColor = (rank: number) => {
    switch (rank) {
      case 0:
        return 'text-yellow-500';
      case 1:
        return 'text-gray-400';
      case 2:
        return 'text-amber-700';
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div className="container max-w-3xl mx-auto p-4">
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle className="text-center text-2xl flex items-center justify-center gap-2">
            <Trophy className="w-7 h-7 text-orange-500" />
            {t('kuizu.multiplayer.scoreboard')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Player Rankings */}
          <div className="space-y-3">
            {sortedPlayers.map((player, index) => {
              const score = playerScores[player.id] || 0;
              const streak = playerStreaks[player.id] || 0;
              const isCurrentPlayer = player.id === currentPlayerId;

              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                    isCurrentPlayer
                      ? 'bg-orange-50 border-orange-400 shadow-md'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  {/* Rank */}
                  <div className="flex items-center justify-center w-12 h-12 flex-shrink-0">
                    {index < 3 ? (
                      <Trophy className={`w-8 h-8 ${getMedalColor(index)}`} />
                    ) : (
                      <span className="text-xl font-bold text-gray-400">
                        #{index + 1}
                      </span>
                    )}
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg truncate">
                        {player.name}
                      </span>
                      {isCurrentPlayer && (
                        <Badge className="bg-orange-500">
                          {t('common.you')}
                        </Badge>
                      )}
                    </div>
                    {streak > 0 && (
                      <div className="flex items-center gap-1 text-orange-600 text-sm font-medium mt-1">
                        <Flame className="w-4 h-4" />
                        <span>
                          {streak} {t('kuizu.streak')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-orange-600">
                      {score}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('kuizu.points')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Continue Button (Host Only) */}
          {isHost && onContinue && (
            <div className="pt-4">
              <Button
                onClick={onContinue}
                className="w-full bg-orange-500 hover:bg-orange-600"
                size="lg"
              >
                {t('kuizu.multiplayer.nextQuestion')}
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          )}

          {!isHost && (
            <p className="text-center text-sm text-gray-500 pt-4">
              {t('kuizu.multiplayer.waitingForHost')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
