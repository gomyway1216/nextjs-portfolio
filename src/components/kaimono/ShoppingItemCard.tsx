'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, StickyNote } from 'lucide-react';
import type { ShoppingItem } from '@/types/kaimono';
import {
  ITEM_CATEGORY_EMOJI,
  ITEM_PRIORITY_LABELS,
  ItemPriority,
  KAIMONO_CURRENCY_SYMBOLS,
  KaimonoCurrency,
} from '@/types/kaimono';

interface ShoppingItemCardProps {
  item: ShoppingItem;
  currency: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  loading?: boolean;
}

export function ShoppingItemCard({
  item,
  currency,
  onToggle,
  onEdit,
  onDelete,
  loading,
}: ShoppingItemCardProps) {
  const symbol = KAIMONO_CURRENCY_SYMBOLS[currency as KaimonoCurrency] || currency;
  const isNiceTohave = item.priority === ItemPriority.NICE_TO_HAVE;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 group transition-colors ${
        item.isPurchased ? 'opacity-50' : ''
      }`}
    >
      {/* Checkbox */}
      <Checkbox
        checked={item.isPurchased}
        onCheckedChange={onToggle}
        disabled={loading}
        className="shrink-0"
      />

      {/* Category emoji */}
      <span className="text-base shrink-0">
        {ITEM_CATEGORY_EMOJI[item.category]}
      </span>

      {/* Item info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium truncate ${
              item.isPurchased ? 'line-through text-muted-foreground' : ''
            }`}
          >
            {item.name}
          </span>
          {isNiceTohave && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
              {ITEM_PRIORITY_LABELS[ItemPriority.NICE_TO_HAVE]}
            </Badge>
          )}
          {item.note && (
            <StickyNote className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {item.quantity > 1 && (
            <span>{item.quantity}{item.unit ? item.unit : 'x'}</span>
          )}
          {item.quantity === 1 && item.unit && (
            <span>1{item.unit}</span>
          )}
          {item.price !== undefined && item.price > 0 && (
            <span className="font-medium">{symbol}{item.price.toLocaleString()}</span>
          )}
          {item.store && (
            <span className="truncate">@ {item.store}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onEdit}
          disabled={loading}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={loading}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
