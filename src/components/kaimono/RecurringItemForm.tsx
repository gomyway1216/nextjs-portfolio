'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, X } from 'lucide-react';
import type { CreateRecurringItemInput, RecurringItem } from '@/types/kaimono';
import {
  ItemCategory,
  RecurringInterval,
  ITEM_CATEGORY_LABELS,
  ITEM_CATEGORY_EMOJI,
  RECURRING_INTERVAL_LABELS,
} from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

interface RecurringItemFormProps {
  initialItem?: RecurringItem;
  onSubmit: (input: CreateRecurringItemInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function RecurringItemForm({
  initialItem,
  onSubmit,
  onCancel,
  loading,
}: RecurringItemFormProps) {
  const { t } = useTranslation();
  const isEditing = !!initialItem;

  const [name, setName] = useState(initialItem?.name || '');
  const [category, setCategory] = useState<ItemCategory>(initialItem?.category as ItemCategory || ItemCategory.OTHER);
  const [interval, setInterval] = useState<RecurringInterval>(initialItem?.interval as RecurringInterval || RecurringInterval.WEEKLY);
  const [quantity, setQuantity] = useState(String(initialItem?.quantity || 1));
  const [unit, setUnit] = useState(initialItem?.unit || '');
  const [price, setPrice] = useState(initialItem?.price ? String(initialItem.price) : '');
  const [store, setStore] = useState(initialItem?.store || '');
  const [note, setNote] = useState(initialItem?.note || '');
  const [nextDueDate, setNextDueDate] = useState(
    initialItem?.nextDueDate || new Date().toISOString().split('T')[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await onSubmit({
      name: name.trim(),
      category,
      interval,
      quantity: parseInt(quantity) || 1,
      unit: unit || undefined,
      price: price ? parseFloat(price) : undefined,
      store: store || undefined,
      note: note || undefined,
      nextDueDate,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          {isEditing ? t('kaimono.recurring.editItem', 'Edit Recurring Item') : t('kaimono.recurring.addItem', 'Add Recurring Item')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('kaimono.item.name', 'Item Name')} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('kaimono.item.namePlaceholder', 'e.g. Milk')}
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('kaimono.item.category', 'Category')}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ItemCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ITEM_CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {ITEM_CATEGORY_EMOJI[key as ItemCategory]} {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('kaimono.recurring.interval', 'Interval')} *</Label>
              <Select value={interval} onValueChange={(v) => setInterval(v as RecurringInterval)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRING_INTERVAL_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('kaimono.item.quantity', 'Qty')}</Label>
              <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>{t('kaimono.item.unit', 'Unit')}</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pc" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>{t('kaimono.item.price', 'Price')}</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} min="0" disabled={loading} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('kaimono.item.store', 'Store')}</Label>
              <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder={t('kaimono.store.namePlaceholder', 'Store name')} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>{t('kaimono.recurring.nextDue', 'Next Due')}</Label>
              <Input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} disabled={loading} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('kaimono.item.note', 'Note')}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('kaimono.item.notePlaceholder', 'Brand, sale info, etc.')} disabled={loading} rows={2} />
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-1" /> {t('kaimono.common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={loading || !name.trim()}>
              {isEditing ? t('kaimono.recurring.save', 'Save') : t('kaimono.recurring.add', 'Add')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
