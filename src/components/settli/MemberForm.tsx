'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
        <Label htmlFor="member-name">名前 *</Label>
        <Input
          id="member-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="山田 太郎"
          required
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="member-email">メール (任意)</Label>
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
        <Label htmlFor="member-weight">
          負担割合 (デフォルト: 1)
        </Label>
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
          1より大きいと多く負担、小さいと少なく負担
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={loading || !name.trim()}>
          {isEdit ? '更新' : '追加'}
        </Button>
      </div>
    </form>
  );
}
