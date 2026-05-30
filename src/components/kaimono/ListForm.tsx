'use client';

import { Button } from '@/components/ui/button';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { CreateShoppingListInput,CreateStoreInput } from '@/types/kaimono';
import { KAIMONO_CURRENCY_NAMES,STORE_TYPE_LABELS,StoreType } from '@/types/kaimono';
import { Lock,Plus,Store,X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ListFormProps {
  onSubmit: (input: CreateShoppingListInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function ListForm({ onSubmit, onCancel, loading }: ListFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState<string>('JPY');
  const [usePasscode, setUsePasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [stores, setStores] = useState<CreateStoreInput[]>([]);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreType, setNewStoreType] = useState<StoreType>(StoreType.SUPERMARKET);

  const addStore = () => {
    if (newStoreName.trim()) {
      setStores([...stores, { name: newStoreName.trim(), type: newStoreType }]);
      setNewStoreName('');
    }
  };

  const removeStore = (index: number) => {
    setStores(stores.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name: name.trim(),
      date,
      budget: budget ? parseFloat(budget) : undefined,
      currency,
      passcode: usePasscode && passcode ? passcode : undefined,
      stores: stores.length > 0 ? stores : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('kaimono.new.listInfo', 'List Info')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('kaimono.new.listName', 'List Name')} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('kaimono.new.listNamePlaceholder', "e.g. Today's groceries")}
              required
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">{t('kaimono.new.date', 'Date')}</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">{t('kaimono.new.budget', 'Budget')}</Label>
              <Input
                id="budget"
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder={t('kaimono.new.budgetPlaceholder', 'Optional')}
                min="0"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">{t('kaimono.new.currency', 'Currency')}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KAIMONO_CURRENCY_NAMES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {key} - {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Passcode */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="usePasscode">{t('kaimono.new.protectWithPasscode', 'Protect with passcode')}</Label>
              </div>
              <Switch
                id="usePasscode"
                checked={usePasscode}
                onCheckedChange={setUsePasscode}
                disabled={loading}
              />
            </div>
            {usePasscode && (
              <div className="space-y-2">
                <Label htmlFor="passcode">{t('kaimono.new.passcode', 'Passcode')}</Label>
                <Input
                  id="passcode"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder={t('kaimono.new.passcodePlaceholder', '4+ characters')}
                  minLength={4}
                  disabled={loading}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stores */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            {t('kaimono.new.stores', 'Stores')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('kaimono.new.storesHint', 'Add stores to group items by location (optional)')}
          </p>

          {stores.map((store, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-sm flex-1">{store.name}</span>
              <span className="text-xs text-muted-foreground">{STORE_TYPE_LABELS[store.type || StoreType.OTHER]}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeStore(index)} disabled={loading}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex gap-2">
            <Input
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              placeholder={t('kaimono.new.storeNamePlaceholder', 'Store name')}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addStore();
                }
              }}
            />
            <Select value={newStoreType} onValueChange={(v) => setNewStoreType(v as StoreType)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STORE_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={addStore} disabled={loading || !newStoreName.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex gap-4">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
          {t('kaimono.common.cancel', 'Cancel')}
        </Button>
        <Button type="submit" className="flex-1" disabled={loading || !name.trim()}>
          {loading ? t('kaimono.new.creating', 'Creating...') : t('kaimono.new.createList', 'Create List')}
        </Button>
      </div>
    </form>
  );
}
