'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useKaimonoMutations } from '@/hooks/useKaimono';
import { KaimonoLogo, ListForm } from '@/components/kaimono';
import type { CreateShoppingListInput } from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

export default function NewKaimonoListPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { createList, loading } = useKaimonoMutations();

  const handleSubmit = async (input: CreateShoppingListInput) => {
    if (!input.name.trim()) {
      toast.error(t('kaimono.new.toast.enterListName', 'Please enter a list name'));
      return;
    }

    try {
      const result = await createList(input);
      toast.success(t('kaimono.new.toast.created', 'List created!'));
      router.push(`/tools/kaimono/${result.id}`);
    } catch {
      toast.error(t('kaimono.new.toast.createFailed', 'Failed to create list'));
    }
  };

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
          <h1 className="text-2xl font-bold">{t('kaimono.new.title', 'New Shopping List')}</h1>
        </div>
      </div>

      <ListForm
        onSubmit={handleSubmit}
        onCancel={() => router.push('/tools/kaimono')}
        loading={loading}
      />
    </div>
  );
}
