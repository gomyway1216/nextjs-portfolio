'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Plus } from 'lucide-react';
import type { FrequentItem, CreateShoppingItemInput } from '@/types/kaimono';
import { ITEM_CATEGORY_EMOJI } from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

interface FrequentItemsSuggestionProps {
  items: FrequentItem[];
  onAddItem: (items: CreateShoppingItemInput[]) => Promise<void>;
  loading?: boolean;
}

export function FrequentItemsSuggestion({
  items,
  onAddItem,
  loading,
}: FrequentItemsSuggestionProps) {
  const { t } = useTranslation();

  if (items.length === 0) return null;

  const handleAdd = async (item: FrequentItem) => {
    await onAddItem([{
      name: item.name,
      category: item.category,
      quantity: 1,
      unit: item.unit,
      price: item.averagePrice ? Math.round(item.averagePrice) : undefined,
      store: item.preferredStore,
    }]);
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          {t('kaimono.frequent.title', 'Frequently Bought')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 10).map((item) => (
            <Button
              key={item.id}
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => handleAdd(item)}
              disabled={loading}
            >
              <span className="mr-1">{ITEM_CATEGORY_EMOJI[item.category]}</span>
              {item.name}
              <Plus className="h-3 w-3 ml-1" />
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
