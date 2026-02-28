'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import type { Store, CreateStoreInput } from '@/types/kaimono';
import { StoreType, STORE_TYPE_LABELS } from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

interface StoreSelectorProps {
  stores: Store[];
  onAdd: (store: CreateStoreInput) => void;
  onRemove: (storeId: string) => void;
  disabled?: boolean;
}

export function StoreSelector({ stores, onAdd, onRemove, disabled }: StoreSelectorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState<StoreType>(StoreType.SUPERMARKET);

  const handleAdd = () => {
    if (name.trim()) {
      onAdd({ name: name.trim(), type });
      setName('');
    }
  };

  return (
    <div className="space-y-3">
      {stores.map((store) => (
        <div key={store.id} className="flex items-center gap-2 text-sm">
          <span className="flex-1">{store.name}</span>
          <span className="text-xs text-muted-foreground">{STORE_TYPE_LABELS[store.type]}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(store.id)} disabled={disabled}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('kaimono.store.namePlaceholder', 'Store name')}
          disabled={disabled}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
        />
        <Select value={type} onValueChange={(v) => setType(v as StoreType)}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STORE_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={handleAdd} disabled={disabled || !name.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
