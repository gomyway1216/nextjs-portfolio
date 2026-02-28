'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import {
  KaimonoLogo,
  RecurringItemForm,
  RecurringItemList,
} from '@/components/kaimono';
import { useKaimonoRecurring, useKaimonoMutations } from '@/hooks/useKaimono';
import type { CreateRecurringItemInput, RecurringItem, UpdateRecurringItemInput } from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

export default function KaimonoRecurringPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { items, dueItems, loading, refetch } = useKaimonoRecurring();
  const { createRecurring, updateRecurring, deleteRecurring, loading: mutationLoading } = useKaimonoMutations();

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringItem | null>(null);

  if (!currentUser) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <KaimonoLogo size={48} className="mx-auto mb-6" />
        <h2 className="text-xl font-semibold mb-2">
          {t('kaimono.recurring.loginRequired', 'Login Required')}
        </h2>
        <p className="text-muted-foreground mb-6">
          {t('kaimono.recurring.loginDescription', 'Sign in to manage recurring items.')}
        </p>
        <Link href="/signin">
          <Button className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600" style={{ borderRadius: '9999px' }}>
            {t('kaimono.common.signIn', 'Sign In')}
          </Button>
        </Link>
      </div>
    );
  }

  const handleCreate = async (input: CreateRecurringItemInput) => {
    try {
      await createRecurring(input);
      await refetch();
      setShowForm(false);
      toast.success(t('kaimono.recurring.toast.created', 'Recurring item created'));
    } catch {
      toast.error(t('kaimono.recurring.toast.createFailed', 'Failed to create'));
    }
  };

  const handleUpdate = async (input: CreateRecurringItemInput) => {
    if (!editingItem) return;
    try {
      const updateInput: UpdateRecurringItemInput = {
        name: input.name,
        category: input.category,
        interval: input.interval,
        quantity: input.quantity,
        unit: input.unit,
        price: input.price,
        store: input.store,
        note: input.note,
        nextDueDate: input.nextDueDate,
      };
      await updateRecurring(editingItem.id, updateInput);
      await refetch();
      setEditingItem(null);
      toast.success(t('kaimono.recurring.toast.updated', 'Recurring item updated'));
    } catch {
      toast.error(t('kaimono.recurring.toast.updateFailed', 'Failed to update'));
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteRecurring(itemId);
      await refetch();
      toast.success(t('kaimono.recurring.toast.deleted', 'Recurring item deleted'));
    } catch {
      toast.error(t('kaimono.recurring.toast.deleteFailed', 'Failed to delete'));
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/tools/kaimono">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <KaimonoLogo size={32} />
            <h1 className="text-2xl font-bold">{t('kaimono.recurring.title', 'Recurring Items')}</h1>
          </div>
        </div>
        {!showForm && !editingItem && (
          <Button onClick={() => setShowForm(true)} style={{ borderRadius: '9999px' }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('kaimono.recurring.add', 'Add')}
          </Button>
        )}
      </div>

      {/* Due Items Alert */}
      {dueItems.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {t('kaimono.recurring.dueAlert', { count: dueItems.length, defaultValue: `${dueItems.length} item(s) due for purchase` })}
          </p>
        </div>
      )}

      {/* Form */}
      {(showForm || editingItem) && (
        <RecurringItemForm
          initialItem={editingItem || undefined}
          onSubmit={editingItem ? handleUpdate : handleCreate}
          onCancel={() => { setShowForm(false); setEditingItem(null); }}
          loading={mutationLoading}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <RecurringItemList
          items={items}
          dueItems={dueItems}
          onEdit={(item) => setEditingItem(item)}
          onDelete={handleDelete}
          loading={mutationLoading}
        />
      )}
    </div>
  );
}
