'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Users, ArrowRight } from 'lucide-react';
import { useSettliGroupByShareCode } from '@/hooks/useSettli';
import { useTranslation } from 'react-i18next';

export default function JoinSettliGroupPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const shareCode = params.shareCode as string;

  const { group, loading, error } = useSettliGroupByShareCode(shareCode);

  // Redirect to group page once loaded
  useEffect(() => {
    if (group && !loading) {
      // Small delay to show the success state
      const timer = setTimeout(() => {
        router.push(`/tools/settli/${group.id}`);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [group, loading, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('settli.join.loading')}</p>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t('settli.join.notFoundTitle')}</h2>
            <p className="text-muted-foreground mb-6">
              {t('settli.join.notFoundDescription')}
            </p>
            <Link href="/tools/settli">
              <Button>{t('settli.join.backToTop')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{t('settli.join.successTitle')}</h2>
          <p className="text-2xl font-bold mb-2">{group.name}</p>
          <p className="text-muted-foreground mb-6">
            {t('settli.join.memberCount', { count: group.members.filter((m) => m.isActive !== false).length })}
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('settli.join.redirecting')}
          </div>
        </CardContent>
      </Card>

      <Link href={`/tools/settli/${group.id}`}>
        <Button variant="ghost">
          {t('settli.join.goNow')}
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </Link>
    </div>
  );
}
