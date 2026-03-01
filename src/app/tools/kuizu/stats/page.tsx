'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, BarChart3 } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import StatsOverview from '@/components/kuizu/StatsOverview';
import CategoryAccuracyChart from '@/components/kuizu/CategoryAccuracyChart';
import { useKuizuStats } from '@/hooks/useKuizu';

export default function KuizuStatsPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { stats, loading, error } = useKuizuStats();

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
        <div className="container mx-auto px-4 py-8 max-w-md text-center space-y-4">
          <KuizuLogo size={48} showText />
          <p className="text-muted-foreground">{t('kuizu.stats.signInRequired', 'Sign in to view your stats')}</p>
          <Link href="/signin"><Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600" style={{ borderRadius: '9999px' }}>{t('common.signIn', 'Sign In')}</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-orange-500" />
            <h1 className="text-2xl font-bold text-orange-900">{t('kuizu.stats.title', 'Your Stats')}</h1>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>
        ) : error ? (
          <div className="text-center py-12 text-muted-foreground">{error}</div>
        ) : !stats ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">{t('kuizu.stats.noStats', 'No stats yet. Start playing!')}</p>
            <Link href="/tools/kuizu/play"><Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600" style={{ borderRadius: '9999px' }}>{t('kuizu.playNow', 'Play Now')}</Button></Link>
          </div>
        ) : (
          <>
            <StatsOverview stats={stats} />
            <CategoryAccuracyChart categoryStats={stats.categoryStats} />
          </>
        )}
      </div>
    </div>
  );
}
