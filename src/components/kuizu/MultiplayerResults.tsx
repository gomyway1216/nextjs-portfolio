'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Crown, Medal, RotateCcw, LogOut } from 'lucide-react';
import { KuizuPlayer } from '@/types/kuizu';

interface MultiplayerResultsProps {
  players: KuizuPlayer[];
  playerScores: Record<string, number>;
  currentPlayerId: string;
  onPlayAgain?: () => void;
  onLeave: () => void;
  isHost: boolean;
}

export default function MultiplayerResults({
  players,
  playerScores,
  currentPlayerId,
  onPlayAgain,
  onLeave,
  isHost,
}: MultiplayerResultsProps) {
  const { t } = useTranslation();

  // Sort players by score
  const sortedPlayers = [...players].sort((a, b) => {
    const scoreA = playerScores[a.id] || 0;
    const scoreB = playerScores[b.id] || 0;
    return scoreB - scoreA;
  });

  const winner = sortedPlayers[0];
  const top3 = sortedPlayers.slice(0, 3);

  const getPodiumHeight = (rank: number) => {
    switch (rank) {
      case 0:
        return 'h-32';
      case 1:
        return 'h-24';
      case 2:
        return 'h-20';
      default:
        return 'h-16';
    }
  };

  const getPodiumIcon = (rank: number) => {
    switch (rank) {
      case 0:
        return <Crown className="w-8 h-8 text-yellow-500" />;
      case 1:
        return <Medal className="w-7 h-7 text-gray-400" />;
      case 2:
        return <Medal className="w-6 h-6 text-amber-700" />;
      default:
        return null;
    }
  };

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6">
      {/* Winner Announcement */}
      <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
        <CardContent className="pt-6 text-center">
          <Trophy className="w-16 h-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-2">
            {winner.id === currentPlayerId
              ? t('kuizu.multiplayer.youWon')
              : t('kuizu.multiplayer.playerWon', { name: winner.name })}
          </h2>
          <p className="text-xl text-gray-600">
            {t('kuizu.finalScore')}: {playerScores[winner.id] || 0} {t('kuizu.points')}
          </p>
        </CardContent>
      </Card>

      {/* Podium Display */}
      {top3.length >= 2 && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="text-center">
              {t('kuizu.multiplayer.topPlayers')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-center gap-4 mb-6">
              {/* 2nd Place */}
              {top3[1] && (
                <div className="flex flex-col items-center">
                  <div className="mb-2">{getPodiumIcon(1)}</div>
                  <div className="text-center mb-2">
                    <div className="font-semibold">{top3[1].name}</div>
                    <div className="text-sm text-gray-500">
                      {playerScores[top3[1].id] || 0} {t('kuizu.points')}
                    </div>
                  </div>
                  <div className={`${getPodiumHeight(1)} w-24 bg-gradient-to-t from-gray-300 to-gray-200 rounded-t-lg flex items-center justify-center`}>
                    <span className="text-2xl font-bold text-white">2</span>
                  </div>
                </div>
              )}

              {/* 1st Place */}
              {top3[0] && (
                <div className="flex flex-col items-center">
                  <div className="mb-2">{getPodiumIcon(0)}</div>
                  <div className="text-center mb-2">
                    <div className="font-bold text-lg">{top3[0].name}</div>
                    <div className="text-sm text-orange-600 font-semibold">
                      {playerScores[top3[0].id] || 0} {t('kuizu.points')}
                    </div>
                  </div>
                  <div className={`${getPodiumHeight(0)} w-28 bg-gradient-to-t from-yellow-500 to-yellow-400 rounded-t-lg flex items-center justify-center`}>
                    <span className="text-3xl font-bold text-white">1</span>
                  </div>
                </div>
              )}

              {/* 3rd Place */}
              {top3[2] && (
                <div className="flex flex-col items-center">
                  <div className="mb-2">{getPodiumIcon(2)}</div>
                  <div className="text-center mb-2">
                    <div className="font-semibold">{top3[2].name}</div>
                    <div className="text-sm text-gray-500">
                      {playerScores[top3[2].id] || 0} {t('kuizu.points')}
                    </div>
                  </div>
                  <div className={`${getPodiumHeight(2)} w-24 bg-gradient-to-t from-amber-800 to-amber-700 rounded-t-lg flex items-center justify-center`}>
                    <span className="text-2xl font-bold text-white">3</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Rankings */}
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle>{t('kuizu.multiplayer.finalRankings')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedPlayers.map((player, index) => {
            const score = playerScores[player.id] || 0;
            const isCurrentPlayer = player.id === currentPlayerId;

            return (
              <div
                key={player.id}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  isCurrentPlayer
                    ? 'bg-orange-50 border-2 border-orange-300'
                    : 'bg-gray-50 border border-gray-200'
                }`}
              >
                <div className="w-8 text-center font-bold text-lg text-gray-600">
                  #{index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{player.name}</span>
                    {isCurrentPlayer && (
                      <Badge className="bg-orange-500">{t('common.you')}</Badge>
                    )}
                  </div>
                </div>
                <div className="text-lg font-bold text-orange-600">
                  {score} {t('kuizu.points')}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {isHost && onPlayAgain && (
          <Button
            onClick={onPlayAgain}
            className="flex-1 bg-orange-500 hover:bg-orange-600"
            size="lg"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            {t('kuizu.playAgain')}
          </Button>
        )}
        <Button
          onClick={onLeave}
          variant="outline"
          className={isHost && onPlayAgain ? '' : 'flex-1'}
          size="lg"
        >
          <LogOut className="w-5 h-5 mr-2" />
          {t('common.leave')}
        </Button>
      </div>
    </div>
  );
}
