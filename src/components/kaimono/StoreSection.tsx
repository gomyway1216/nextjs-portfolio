'use client';

import type { ShoppingItem,Store as StoreType } from '@/types/kaimono';
import { ChevronDown,ChevronRight,Store } from 'lucide-react';
import { useState } from 'react';
import { ShoppingItemCard } from './ShoppingItemCard';

interface StoreSectionProps {
  store: StoreType;
  items: ShoppingItem[];
  currency: string;
  onToggle: (itemId: string) => void;
  onEdit: (item: ShoppingItem) => void;
  onDelete: (itemId: string) => void;
  loading?: boolean;
}

export function StoreSection({
  store,
  items,
  currency,
  onToggle,
  onEdit,
  onDelete,
  loading,
}: StoreSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const purchasedCount = items.filter((i) => i.isPurchased).length;

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/50 hover:bg-muted transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <Store className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1 text-left">{store.name}</span>
        <span className="text-xs text-muted-foreground">
          {purchasedCount}/{items.length}
        </span>
      </button>
      {!collapsed && (
        <div className="divide-y">
          {items.map((item) => (
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
      )}
    </div>
  );
}
