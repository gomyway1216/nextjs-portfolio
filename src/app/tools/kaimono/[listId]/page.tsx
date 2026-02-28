'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Plus,
  Loader2,
  LayoutGrid,
  Store,
  List,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useKaimonoList,
  useKaimonoFrequentItems,
  useKaimonoMutations,
} from '@/hooks/useKaimono';
import {
  KaimonoLogo,
  ShoppingItemForm,
  ShoppingItemList,
  BudgetSummary,
  ShareDialog,
  PasscodeDialog,
  FrequentItemsSuggestion,
} from '@/components/kaimono';
import { useAuth } from '@/providers/AuthProvider';
import type { CreateShoppingItemInput, UpdateShoppingItemInput, ShoppingItem } from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

const LOCAL_STORAGE_KEY = 'kaimono_recent_lists';
const MAX_LOCAL_LISTS = 10;

interface LocalListEntry {
  id: string;
  name: string;
  accessedAt: string;
}

function saveToLocalStorage(listId: string, listName: string) {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    let lists: LocalListEntry[] = stored ? JSON.parse(stored) : [];
    lists = lists.filter((l) => l.id !== listId);
    lists.unshift({ id: listId, name: listName, accessedAt: new Date().toISOString() });
    lists = lists.slice(0, MAX_LOCAL_LISTS);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lists));
  } catch {
    // Ignore
  }
}

export default function KaimonoListPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useAuth();
  const listId = params.listId as string;

  const { list, loading: listLoading, refetch: refetchList, requiresPasscode, verifyPasscode } = useKaimonoList(listId);
  const { items: frequentItems } = useKaimonoFrequentItems();
  const {
    addItems, updateItem, deleteItem, toggleItem, generateQRCode,
    loading: mutationLoading,
  } = useKaimonoMutations();

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [groupBy, setGroupBy] = useState<'none' | 'store' | 'category'>('none');

  // Save to localStorage for anonymous users when list is loaded
  useEffect(() => {
    if (list && !requiresPasscode && !currentUser) {
      saveToLocalStorage(list.id, list.name);
    }
  }, [list, requiresPasscode, currentUser]);

  const handleAddItems = async (items: CreateShoppingItemInput[]) => {
    try {
      await addItems(listId, items);
      await refetchList();
      setShowItemForm(false);
      toast.success(t('kaimono.list.toast.itemAdded', 'Item added'));
    } catch {
      toast.error(t('kaimono.list.toast.itemAddFailed', 'Failed to add item'));
    }
  };

  const handleUpdateItem = async (items: CreateShoppingItemInput[]) => {
    if (!editingItem) return;
    try {
      const input: UpdateShoppingItemInput = {
        name: items[0].name,
        category: items[0].category,
        priority: items[0].priority,
        quantity: items[0].quantity,
        unit: items[0].unit,
        price: items[0].price,
        note: items[0].note,
        store: items[0].store,
      };
      await updateItem(listId, editingItem.id, input);
      await refetchList();
      setEditingItem(null);
      toast.success(t('kaimono.list.toast.itemUpdated', 'Item updated'));
    } catch {
      toast.error(t('kaimono.list.toast.itemUpdateFailed', 'Failed to update item'));
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteItem(listId, itemId);
      await refetchList();
      toast.success(t('kaimono.list.toast.itemDeleted', 'Item deleted'));
    } catch {
      toast.error(t('kaimono.list.toast.itemDeleteFailed', 'Failed to delete item'));
    }
  };

  const handleToggleItem = async (itemId: string) => {
    try {
      await toggleItem(listId, itemId);
      await refetchList();
    } catch {
      toast.error(t('kaimono.list.toast.toggleFailed', 'Failed to update item'));
    }
  };

  const handleGenerateQR = async () => {
    return await generateQRCode(listId);
  };

  if (listLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show passcode dialog if required
  if (requiresPasscode && list) {
    return (
      <PasscodeDialog
        open={true}
        listName={list.name}
        onVerify={verifyPasscode}
        onCancel={() => router.push('/tools/kaimono')}
      />
    );
  }

  if (!list) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <KaimonoLogo size={48} className="mx-auto mb-6" />
        <h2 className="text-xl font-semibold mb-2">{t('kaimono.list.notFoundTitle', 'List Not Found')}</h2>
        <p className="text-muted-foreground mb-6">
          {t('kaimono.list.notFoundDescription', 'This shopping list does not exist or has been deleted.')}
        </p>
        <Link href="/tools/kaimono">
          <Button className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600" style={{ borderRadius: '9999px' }}>
            {t('kaimono.list.backToTop', 'Back to Kaimono')}
          </Button>
        </Link>
      </div>
    );
  }

  const purchasedCount = list.items.filter((i) => i.isPurchased).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/tools/kaimono">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <KaimonoLogo size={28} />
              <h1 className="text-2xl font-bold">{list.name}</h1>
            </div>
            <p className="text-sm text-muted-foreground ml-9">{list.date}</p>
          </div>
        </div>
        <ShareDialog
          listId={list.id}
          listName={list.name}
          shareCode={list.shareCode}
          onGenerateQR={handleGenerateQR}
        />
      </div>

      {/* Budget Summary */}
      <BudgetSummary
        budget={list.budget}
        totalSpent={list.totalSpent}
        currency={list.currency}
        itemCount={list.items.length}
        purchasedCount={purchasedCount}
      />

      {/* Frequent Items Suggestions (logged in users only) */}
      {currentUser && frequentItems.length > 0 && !showItemForm && !editingItem && (
        <FrequentItemsSuggestion
          items={frequentItems}
          onAddItem={handleAddItems}
          loading={mutationLoading}
        />
      )}

      {/* Group By Selector + Add Button */}
      <div className="flex items-center justify-between">
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'none' | 'store' | 'category')}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none"><List className="h-3 w-3 inline mr-1" />{t('kaimono.list.groupNone', 'No grouping')}</SelectItem>
            <SelectItem value="store"><Store className="h-3 w-3 inline mr-1" />{t('kaimono.list.groupStore', 'By store')}</SelectItem>
            <SelectItem value="category"><LayoutGrid className="h-3 w-3 inline mr-1" />{t('kaimono.list.groupCategory', 'By category')}</SelectItem>
          </SelectContent>
        </Select>

        {!showItemForm && !editingItem && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowItemForm(true)}
            className="hidden md:flex"
            style={{ borderRadius: '9999px' }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('kaimono.list.addItem', 'Add Item')}
          </Button>
        )}
      </div>

      {/* Add/Edit Item Form */}
      {(showItemForm || editingItem) && (
        <ShoppingItemForm
          stores={list.stores}
          frequentItems={currentUser ? frequentItems : []}
          initialItem={editingItem || undefined}
          onSubmit={editingItem ? handleUpdateItem : handleAddItems}
          onCancel={() => { setShowItemForm(false); setEditingItem(null); }}
          loading={mutationLoading}
        />
      )}

      {/* Items List */}
      <ShoppingItemList
        items={list.items}
        stores={list.stores}
        currency={list.currency}
        groupBy={groupBy}
        onToggle={handleToggleItem}
        onEdit={(item) => setEditingItem(item)}
        onDelete={handleDeleteItem}
        loading={mutationLoading}
      />

      {/* Mobile FAB */}
      {!showItemForm && !editingItem && (
        <Button
          onClick={() => setShowItemForm(true)}
          size="icon"
          className="md:hidden fixed bottom-6 right-6 z-50 h-14 w-14 shadow-lg bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 [&_svg]:size-6"
          style={{ borderRadius: '9999px' }}
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
