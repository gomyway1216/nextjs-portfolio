'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';

interface MemberFormProps {
  initialName?: string;
  initialEmail?: string;
  initialWeight?: number;
  onSubmit: (name: string, email?: string, weight?: number) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  isEdit?: boolean;
}

export function MemberForm({
  initialName = '',
  initialEmail = '',
  initialWeight = 1,
  onSubmit,
  onCancel,
  loading,
  isEdit,
}: MemberFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [weight, setWeight] = useState(initialWeight);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit(name.trim(), email.trim() || undefined, weight);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 border rounded-lg bg-background space-y-3"
    >
      <div className="space-y-2">
        <Label htmlFor="member-name">{t('settli.member.name')} *</Label>
        <Input
          id="member-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('settli.member.namePlaceholder')}
          required
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="member-email">{t('settli.member.email')} ({t('settli.common.optional')})</Label>
        <Input
          id="member-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@email.com"
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="member-weight">{t('settli.member.weight')}</Label>
        <Input
          id="member-weight"
          type="number"
          min="0.1"
          max="10"
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(parseFloat(e.target.value) || 1)}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          {t('settli.member.weightHint')}
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          {t('settli.common.cancel')}
        </Button>
        <Button type="submit" disabled={loading || !name.trim()}>
          {isEdit ? t('settli.common.update') : t('settli.common.add')}
        </Button>
      </div>
    </form>
  );
}
