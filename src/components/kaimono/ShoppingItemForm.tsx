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
import { Plus, X } from 'lucide-react';
import type {
  CreateShoppingItemInput,
  Store,
  FrequentItem,
  ShoppingItem,
} from '@/types/kaimono';
import {
  ItemCategory,
  ItemPriority,
  ITEM_CATEGORY_LABELS,
  ITEM_PRIORITY_LABELS,
  ITEM_CATEGORY_EMOJI,
} from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

interface ShoppingItemFormProps {
  stores?: Store[];
  frequentItems?: FrequentItem[];
  initialItem?: ShoppingItem;
  onSubmit: (items: CreateShoppingItemInput[]) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function ShoppingItemForm({
  stores = [],
  frequentItems = [],
  initialItem,
  onSubmit,
  onCancel,
  loading,
}: ShoppingItemFormProps) {
  const { t } = useTranslation();
  const isEditing = !!initialItem;

  const [name, setName] = useState(initialItem?.name || '');
  const [category, setCategory] = useState<ItemCategory>(initialItem?.category as ItemCategory || ItemCategory.OTHER);
  const [priority, setPriority] = useState<ItemPriority>(initialItem?.priority as ItemPriority || ItemPriority.MUST_BUY);
  const [quantity, setQuantity] = useState(String(initialItem?.quantity || 1));
  const [unit, setUnit] = useState(initialItem?.unit || '');
  const [price, setPrice] = useState(initialItem?.price ? String(initialItem.price) : '');
  const [note, setNote] = useState(initialItem?.note || '');
  const [store, setStore] = useState(initialItem?.store || '');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredSuggestions = frequentItems
    .filter((item) => item.name.toLowerCase().includes(name.toLowerCase()) && name.length > 0)
    .slice(0, 5);

  const handleSelectSuggestion = (item: FrequentItem) => {
    setName(item.name);
    setCategory(item.category);
    if (item.unit) setUnit(item.unit);
    if (item.averagePrice) setPrice(String(Math.round(item.averagePrice)));
    if (item.preferredStore) setStore(item.preferredStore);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await onSubmit([{
      name: name.trim(),
      category,
      priority,
      quantity: parseInt(quantity) || 1,
      unit: unit || undefined,
      price: price ? parseFloat(price) : undefined,
      note: note || undefined,
      store: store || undefined,
    }]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          {isEditing ? t('kaimono.item.editItem', 'Edit Item') : t('kaimono.item.addItem', 'Add Item')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name with suggestions */}
          <div className="space-y-2 relative">
            <Label htmlFor="itemName">{t('kaimono.item.name', 'Item Name')} *</Label>
            <Input
              id="itemName"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder={t('kaimono.item.namePlaceholder', 'e.g. Milk')}
              required
              disabled={loading}
              autoFocus
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-popover border rounded-lg shadow-lg mt-1 py-1">
                {filteredSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between"
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    <span>{ITEM_CATEGORY_EMOJI[item.category]} {item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.purchaseCount}x
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Category */}
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

            {/* Priority */}
            <div className="space-y-2">
              <Label>{t('kaimono.item.priority', 'Priority')}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as ItemPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ITEM_PRIORITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Quantity */}
            <div className="space-y-2">
              <Label>{t('kaimono.item.quantity', 'Qty')}</Label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                disabled={loading}
              />
            </div>

            {/* Unit */}
            <div className="space-y-2">
              <Label>{t('kaimono.item.unit', 'Unit')}</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={t('kaimono.item.unitPlaceholder', 'pc')}
                disabled={loading}
              />
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label>{t('kaimono.item.price', 'Price')}</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t('kaimono.item.pricePlaceholder', 'Est.')}
                min="0"
                disabled={loading}
              />
            </div>
          </div>

          {/* Store */}
          {stores.length > 0 && (
            <div className="space-y-2">
              <Label>{t('kaimono.item.store', 'Store')}</Label>
              <Select value={store} onValueChange={setStore}>
                <SelectTrigger>
                  <SelectValue placeholder={t('kaimono.item.selectStore', 'Select store')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('kaimono.item.noStore', 'No store')}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Note */}
          <div className="space-y-2">
            <Label>{t('kaimono.item.note', 'Note')}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('kaimono.item.notePlaceholder', 'Brand, sale info, etc.')}
              disabled={loading}
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-1" />
              {t('kaimono.common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={loading || !name.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              {isEditing ? t('kaimono.item.save', 'Save') : t('kaimono.item.add', 'Add')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
