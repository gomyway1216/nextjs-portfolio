'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Pencil, Trash2, AlertCircle } from 'lucide-react';
import type { RecurringItem } from '@/types/kaimono';
import {
  ITEM_CATEGORY_EMOJI,
  RECURRING_INTERVAL_LABELS,
  RecurringInterval,
} from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

interface RecurringItemListProps {
  items: RecurringItem[];
  dueItems?: RecurringItem[];
  onEdit: (item: RecurringItem) => void;
  onDelete: (itemId: string) => void;
  loading?: boolean;
}

export function RecurringItemList({
  items,
  dueItems = [],
  onEdit,
  onDelete,
  loading,
}: RecurringItemListProps) {
  const { t } = useTranslation();
  const dueIds = new Set(dueItems.map((i) => i.id));

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <RefreshCw className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {t('kaimono.recurring.empty', 'No recurring items yet. Add items that you buy regularly!')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0 gap-0">
      <CardContent className="px-0 py-1">
        <div className="divide-y">
          {items.map((item) => {
            const isDue = dueIds.has(item.id);
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 group"
              >
                <span className="text-base shrink-0">
                  {ITEM_CATEGORY_EMOJI[item.category]}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{item.name}</span>
                    {isDue && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                        <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                        {t('kaimono.recurring.due', 'Due')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{RECURRING_INTERVAL_LABELS[item.interval as RecurringInterval]}</span>
                    {item.quantity > 1 && <span>{item.quantity}{item.unit || 'x'}</span>}
                    {item.store && <span>@ {item.store}</span>}
                    <span>{t('kaimono.recurring.nextLabel', 'Next')}: {item.nextDueDate}</span>
                  </div>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)} disabled={loading}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(item.id)} disabled={loading}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
