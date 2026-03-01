'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, History } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import HistoryCard from '@/components/kuizu/HistoryCard';
import { useKuizuHistory } from '@/hooks/useKuizu';

export default function KuizuHistoryPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { history, loading, error } = useKuizuHistory();

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
        <div className="container mx-auto px-4 py-8 max-w-md text-center space-y-4">
          <KuizuLogo size={48} showText />
          <p className="text-muted-foreground">{t('kuizu.history.signInRequired', 'Sign in to view your quiz history')}</p>
          <Link href="/signin"><Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600" style={{ borderRadius: '9999px' }}>{t('common.signIn', 'Sign In')}</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div className="flex items-center gap-2">
            <History className="h-6 w-6 text-orange-500" />
            <h1 className="text-2xl font-bold text-orange-900">{t('kuizu.history.title', 'Quiz History')}</h1>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>
        ) : error ? (
          <div className="text-center py-12 text-muted-foreground">{error}</div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">{t('kuizu.history.noHistory', 'No quiz history yet. Start playing!')}</p>
            <Link href="/tools/kuizu/play"><Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600" style={{ borderRadius: '9999px' }}>{t('kuizu.playNow', 'Play Now')}</Button></Link>
          </div>
        ) : (
          <div className="space-y-3">{history.map((entry) => <HistoryCard key={entry.id} entry={entry} />)}</div>
        )}
      </div>
    </div>
  );
}
