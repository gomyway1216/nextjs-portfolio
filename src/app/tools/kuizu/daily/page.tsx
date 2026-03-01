'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import { DailyChallengePlayer } from '@/components/kuizu/DailyChallengePlayer';
import { DailyLeaderboard } from '@/components/kuizu/DailyLeaderboard';
import { DailyChallengeBanner } from '@/components/kuizu/DailyChallengeBanner';
import { useKuizuDaily, useKuizuMutations } from '@/hooks/useKuizu';
import type { DailyChallengeEntry } from '@/types/kuizu';
import * as kuizuService from '@/services/kuizuService';

type DailyState = 'overview' | 'playing' | 'completed';

export default function KuizuDailyPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { challenge, userEntry, loading, refetch } = useKuizuDaily();
  const { submitDailyResult } = useKuizuMutations();

  const [dailyState, setDailyState] = useState<DailyState>('overview');
  const [leaderboard, setLeaderboard] = useState<DailyChallengeEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [completionScore, setCompletionScore] = useState(0);
  const [completionAccuracy, setCompletionAccuracy] = useState(0);

  const fetchLeaderboard = async () => {
    if (!challenge) return;
    setLeaderboardLoading(true);
    try {
      const data = await kuizuService.getDailyLeaderboard(challenge.id);
      setLeaderboard(data.entries);
    } catch { /* ignore */ } finally {
      setLeaderboardLoading(false);
    }
  };

  const handlePlay = () => {
    if (userEntry) {
      toast.info(t('kuizu.daily.alreadyCompleted', "You already completed today's challenge!"));
      return;
    }
    setDailyState('playing');
  };

  const handleComplete = async (score: number, accuracy: number, timeTaken: number) => {
    setCompletionScore(score);
    setCompletionAccuracy(accuracy);
    setDailyState('completed');

    if (currentUser && challenge) {
      try {
        await submitDailyResult({
          challengeId: challenge.id, userId: currentUser.uid,
          displayName: currentUser.displayName || 'Anonymous',
          score, accuracy, timeTaken,
        });
        await refetch();
        await fetchLeaderboard();
      } catch {
        toast.error(t('kuizu.daily.submitFailed', 'Failed to submit result'));
      }
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>;
  }

  if (dailyState === 'playing' && challenge) {
    return <DailyChallengePlayer challenge={challenge} onComplete={handleComplete} onExit={() => setDailyState('overview')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <KuizuLogo size={32} showText />
        </div>

        <DailyChallengeBanner challenge={challenge ?? undefined} userEntry={userEntry ?? undefined} onPlay={handlePlay} loading={loading} />

        {dailyState === 'completed' && (
          <div className="bg-gradient-to-r from-orange-100 to-amber-100 border border-orange-300 rounded-lg p-6 text-center space-y-3">
            <Trophy className="h-12 w-12 mx-auto text-orange-600" />
            <h3 className="text-xl font-bold text-orange-900">{t('kuizu.daily.challengeComplete', 'Challenge Complete!')}</h3>
            <div className="flex justify-center gap-8">
              <div>
                <p className="text-2xl font-bold text-orange-900">{completionScore}</p>
                <p className="text-sm text-orange-700">{t('kuizu.points', 'Points')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-900">{completionAccuracy.toFixed(1)}%</p>
                <p className="text-sm text-orange-700">{t('kuizu.accuracy', 'Accuracy')}</p>
              </div>
            </div>
            {!currentUser && <p className="text-sm text-orange-700">{t('kuizu.daily.signInToSave', 'Sign in to save your score')}</p>}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-orange-900">{t('kuizu.daily.leaderboard', 'Leaderboard')}</h2>
            <Button variant="outline" size="sm" onClick={fetchLeaderboard} disabled={leaderboardLoading} className="border-orange-300">
              {leaderboardLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('kuizu.daily.refresh', 'Refresh')}
            </Button>
          </div>
          <DailyLeaderboard entries={leaderboard} currentUserId={currentUser?.uid} loading={leaderboardLoading} />
        </div>
      </div>
    </div>
  );
}
