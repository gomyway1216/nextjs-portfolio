'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Users, LogOut, Play, CheckCircle2, Circle } from 'lucide-react';
import { KuizuPlayer } from '@/types/kuizu';

interface MultiplayerLobbyProps {
  players: KuizuPlayer[];
  isHost: boolean;
  roomId?: string;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  loading?: boolean;
}

export default function MultiplayerLobby({
  players,
  isHost,
  roomId,
  onReady,
  onStart,
  onLeave,
  loading = false,
}: MultiplayerLobbyProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const currentPlayer = players[0]; // Assuming current player is first
  const allPlayersReady = players.length > 1 && players.every((p) => p.ready);

  const handleCopyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6">
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-6 h-6 text-orange-500" />
            {t('kuizu.multiplayer.lobby')}
          </CardTitle>
          {roomId && (
            <CardDescription className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold">{roomId}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyRoomId}
                className="h-8"
              >
                <Copy className="w-4 h-4 mr-1" />
                {copied ? t('common.copied') : t('common.copy')}
              </Button>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Player List */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-gray-500 uppercase">
              {t('kuizu.multiplayer.players')} ({players.length})
            </h3>
            <div className="space-y-2">
              {players.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200"
                >
                  <div className="flex items-center gap-3">
                    {player.ready ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300" />
                    )}
                    <span className="font-medium">{player.name}</span>
                    {index === 0 && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                        {t('kuizu.multiplayer.host')}
                      </Badge>
                    )}
                  </div>
                  <Badge
                    variant={player.ready ? 'default' : 'secondary'}
                    className={player.ready ? 'bg-green-500' : ''}
                  >
                    {player.ready ? t('kuizu.multiplayer.ready') : t('kuizu.multiplayer.notReady')}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            {isHost ? (
              <>
                <Button
                  onClick={onStart}
                  disabled={!allPlayersReady || loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600"
                  size="lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  {t('kuizu.multiplayer.startGame')}
                </Button>
                <Button
                  onClick={onLeave}
                  variant="outline"
                  disabled={loading}
                  size="lg"
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  {t('common.leave')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => onReady(!currentPlayer?.ready)}
                  disabled={loading}
                  variant={currentPlayer?.ready ? 'outline' : 'default'}
                  className={!currentPlayer?.ready ? 'flex-1 bg-orange-500 hover:bg-orange-600' : 'flex-1'}
                  size="lg"
                >
                  {currentPlayer?.ready ? t('kuizu.multiplayer.notReady') : t('kuizu.multiplayer.ready')}
                </Button>
                <Button
                  onClick={onLeave}
                  variant="outline"
                  disabled={loading}
                  size="lg"
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  {t('common.leave')}
                </Button>
              </>
            )}
          </div>

          {/* Waiting Message */}
          {!allPlayersReady && players.length > 1 && (
            <p className="text-center text-sm text-gray-500">
              {t('kuizu.multiplayer.waitingForPlayers')}
            </p>
          )}

          {players.length === 1 && (
            <p className="text-center text-sm text-gray-500">
              {t('kuizu.multiplayer.waitingForOthersToJoin')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
