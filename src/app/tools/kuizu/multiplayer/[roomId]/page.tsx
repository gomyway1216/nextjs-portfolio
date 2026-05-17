'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import MultiplayerLobby from '@/components/kuizu/MultiplayerLobby';
import MultiplayerGame from '@/components/kuizu/MultiplayerGame';
import MultiplayerScoreboard from '@/components/kuizu/MultiplayerScoreboard';
import MultiplayerResults from '@/components/kuizu/MultiplayerResults';
import { useKuizuMultiplayer } from '@/hooks/useKuizu';

export default function KuizuGameRoomPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useAuth();
  const roomId = params.roomId as string;
  const playerId = currentUser?.uid || `anon_${Date.now()}`;

  const {
    gameState, players, isHost, lobbyState, error,
    leaveRoom, setReady, submitAnswer, nextQuestion,
  } = useKuizuMultiplayer(playerId, roomId);

  const handleLeave = async () => {
    await leaveRoom();
    router.push('/tools/kuizu/multiplayer');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <KuizuLogo size={48} showText />
        <p className="text-muted-foreground">{t('kuizu.multiplayer.signInRequired', 'Sign in to join multiplayer rooms')}</p>
        <Link href="/signin"><Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600">{t('common.signIn', 'Sign In')}</Button></Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error}</p>
        <Link href="/tools/kuizu/multiplayer"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />{t('kuizu.multiplayer.backToLobby', 'Back to Lobby')}</Button></Link>
      </div>
    );
  }

  if (lobbyState === 'creating' || lobbyState === 'joining') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto" />
          <p className="text-muted-foreground">
            {lobbyState === 'creating' ? t('kuizu.multiplayer.creatingRoom', 'Creating room...') : t('kuizu.multiplayer.joiningRoom', 'Joining room...')}
          </p>
        </div>
      </div>
    );
  }

  // Results phase
  if (gameState?.phase === 'results' || lobbyState === 'finished') {
    return (
      <MultiplayerResults players={players} playerScores={gameState?.playerScores || {}}
        currentPlayerId={playerId} onLeave={handleLeave} isHost={isHost} />
    );
  }

  // Scoreboard phase
  if (gameState?.phase === 'scoreboard' || gameState?.phase === 'answer_reveal') {
    return (
      <div className="container max-w-4xl mx-auto p-4">
        <MultiplayerScoreboard players={players} playerScores={gameState.playerScores}
          playerStreaks={gameState.playerStreaks} currentPlayerId={playerId}
          onContinue={isHost ? nextQuestion : undefined} isHost={isHost} />
      </div>
    );
  }

  // Game phase
  if (gameState?.phase === 'question' || gameState?.phase === 'countdown') {
    return <MultiplayerGame gameState={gameState} playerId={playerId} onAnswer={submitAnswer} players={players} />;
  }

  // Lobby (default)
  return (
    <div>
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/tools/kuizu/multiplayer"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <KuizuLogo size={32} showText />
        </div>
      </div>
      <MultiplayerLobby players={players} isHost={isHost} roomId={roomId}
        onReady={setReady} onStart={() => {}} onLeave={handleLeave} />
    </div>
  );
}
