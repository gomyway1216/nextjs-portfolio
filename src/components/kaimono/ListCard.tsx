'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ShoppingBasket, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { ShoppingList } from '@/types/kaimono';
import { KAIMONO_CURRENCY_SYMBOLS, KaimonoCurrency } from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

interface ListCardProps {
  list: ShoppingList;
}

export function ListCard({ list }: ListCardProps) {
  const { t } = useTranslation();
  const symbol = KAIMONO_CURRENCY_SYMBOLS[list.currency as KaimonoCurrency] || list.currency;
  const purchasedCount = list.items.filter((i) => i.isPurchased).length;
  const totalCount = list.items.length;

  return (
    <Link
      href={`/tools/kaimono/${list.id}`}
      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{list.name}</span>
          {list.isCompleted && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
              {t('kaimono.common.completedBadge', 'Done')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span className="flex items-center gap-0.5">
            <ShoppingBasket className="h-3 w-3" />
            {purchasedCount}/{totalCount}
          </span>
          {list.totalSpent > 0 && (
            <span className="font-medium text-foreground">
              {symbol}{Math.round(list.totalSpent).toLocaleString()}
            </span>
          )}
          <span>{list.date}</span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
