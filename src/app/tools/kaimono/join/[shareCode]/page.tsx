'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as kaimonoService from '@/services/kaimonoService';
import { useTranslation } from 'react-i18next';

export default function JoinKaimonoListPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const shareCode = params.shareCode as string;

  useEffect(() => {
    const joinByShareCode = async () => {
      try {
        const list = await kaimonoService.getListByShareCode(shareCode);
        router.replace(`/tools/kaimono/${list.id}`);
      } catch {
        toast.error(t('kaimono.join.notFound', 'Shopping list not found'));
        router.replace('/tools/kaimono');
      }
    };

    if (shareCode) {
      joinByShareCode();
    }
  }, [shareCode, router, t]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground">
        {t('kaimono.join.loading', 'Looking for shopping list...')}
      </p>
    </div>
  );
}
