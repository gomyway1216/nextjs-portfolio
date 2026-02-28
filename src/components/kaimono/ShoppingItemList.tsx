'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingBasket } from 'lucide-react';
import type { ShoppingItem, Store } from '@/types/kaimono';
import { ITEM_CATEGORY_LABELS, ItemCategory } from '@/types/kaimono';
import { ShoppingItemCard } from './ShoppingItemCard';
import { useTranslation } from 'react-i18next';

interface ShoppingItemListProps {
  items: ShoppingItem[];
  stores: Store[];
  currency: string;
  groupBy?: 'store' | 'category' | 'none';
  onToggle: (itemId: string) => void;
  onEdit: (item: ShoppingItem) => void;
  onDelete: (itemId: string) => void;
  loading?: boolean;
}

export function ShoppingItemList({
  items,
  stores,
  currency,
  groupBy = 'none',
  onToggle,
  onEdit,
  onDelete,
  loading,
}: ShoppingItemListProps) {
  const { t } = useTranslation();

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // Purchased items go to the bottom
      if (a.isPurchased !== b.isPurchased) return a.isPurchased ? 1 : -1;
      return a.order - b.order;
    });
  }, [items]);

  const groupedItems = useMemo(() => {
    if (groupBy === 'store') {
      const groups = new Map<string, ShoppingItem[]>();
      groups.set('', []); // No store
      stores.forEach((s) => groups.set(s.name, []));

      sortedItems.forEach((item) => {
        const key = item.store || '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      });

      // Remove empty groups
      for (const [key, items] of groups) {
        if (items.length === 0) groups.delete(key);
      }

      return groups;
    }

    if (groupBy === 'category') {
      const groups = new Map<string, ShoppingItem[]>();
      sortedItems.forEach((item) => {
        const key = item.category;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      });
      return groups;
    }

    return new Map([['all', sortedItems]]);
  }, [sortedItems, groupBy, stores]);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <ShoppingBasket className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {t('kaimono.list.emptyItems', 'No items yet. Add items to start your shopping list!')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const purchasedCount = items.filter((i) => i.isPurchased).length;
  const totalCount = items.length;

  return (
    <div className="space-y-3">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>{purchasedCount}/{totalCount} {t('kaimono.list.purchased', 'purchased')}</span>
        <div className="w-32 bg-muted rounded-full h-1.5">
          <div
            className="bg-emerald-500 h-1.5 rounded-full transition-all"
            style={{ width: `${totalCount > 0 ? (purchasedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {Array.from(groupedItems.entries()).map(([groupKey, groupItems]) => (
        <div key={groupKey}>
          {groupBy !== 'none' && (
            <div className="flex items-center gap-2 px-1 py-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {groupBy === 'category'
                  ? ITEM_CATEGORY_LABELS[groupKey as ItemCategory] || groupKey
                  : groupKey || t('kaimono.list.noStore', 'No store')}
              </span>
              <span className="text-xs text-muted-foreground">({groupItems.length})</span>
            </div>
          )}
          <Card className="py-0 gap-0">
            <CardContent className="px-0 py-1">
              <div className="divide-y">
                {groupItems.map((item) => (
                  <ShoppingItemCard
                    key={item.id}
                    item={item}
                    currency={currency}
                    onToggle={() => onToggle(item.id)}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                    loading={loading}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
