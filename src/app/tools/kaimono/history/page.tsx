'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  History,
  Loader2,
  ShoppingBasket,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { KaimonoLogo } from '@/components/kaimono';
import { useKaimonoHistory } from '@/hooks/useKaimono';
import { KAIMONO_CURRENCY_SYMBOLS, KaimonoCurrency } from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

export default function KaimonoHistoryPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { history, loading } = useKaimonoHistory();

  if (!currentUser) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <KaimonoLogo size={48} className="mx-auto mb-6" />
        <h2 className="text-xl font-semibold mb-2">
          {t('kaimono.history.loginRequired', 'Login Required')}
        </h2>
        <p className="text-muted-foreground mb-6">
          {t('kaimono.history.loginDescription', 'Sign in to view your shopping history.')}
        </p>
        <Link href="/signin">
          <Button className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600" style={{ borderRadius: '9999px' }}>
            {t('kaimono.common.signIn', 'Sign In')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/tools/kaimono">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <KaimonoLogo size={32} />
          <h1 className="text-2xl font-bold">{t('kaimono.history.title', 'Shopping History')}</h1>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : history.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {t('kaimono.history.empty', 'No shopping history yet. Create your first list!')}
            </p>
            <Link href="/tools/kaimono/new">
              <Button className="mt-4" style={{ borderRadius: '9999px' }}>
                {t('kaimono.page.hero.createList', 'Create List')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-xl border overflow-hidden">
          {history.map((entry) => {
            const symbol = KAIMONO_CURRENCY_SYMBOLS[entry.currency as KaimonoCurrency] || entry.currency;
            return (
              <Link
                key={entry.id}
                href={`/tools/kaimono/${entry.listId}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{entry.listName}</span>
                    {entry.isCompleted && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                        {t('kaimono.common.completedBadge', 'Done')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-0.5">
                      <ShoppingBasket className="h-3 w-3" />
                      {entry.itemCount} {t('kaimono.common.itemsSuffix', 'items')}
                    </span>
                    {entry.totalSpent > 0 && (
                      <span className="font-medium text-foreground">
                        {symbol}{Math.round(entry.totalSpent).toLocaleString()}
                      </span>
                    )}
                    <span>{entry.date}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
