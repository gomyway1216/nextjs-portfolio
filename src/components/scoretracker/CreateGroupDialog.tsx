'use client';

import { useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled owner name; user can still override. */
  defaultOwnerName?: string;
  /** Whether the resulting group will be cloud-saved (only true when logged in). */
  isCloud: boolean;
  onSubmit: (input: {
    name: string;
    description: string;
    ownerName: string;
    extraMembers: { name: string }[];
  }) => Promise<void>;
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  defaultOwnerName = '',
  isCloud,
  onSubmit,
}: CreateGroupDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerName, setOwnerName] = useState(defaultOwnerName);
  const [extra, setExtra] = useState<string[]>(['', '', '']);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName('');
    setDescription('');
    setOwnerName(defaultOwnerName);
    setExtra(['', '', '']);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ownerName.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        ownerName: ownerName.trim(),
        extraMembers: extra.filter((s) => s.trim()).map((s) => ({ name: s.trim() })),
      });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>新しいグループを作成</DialogTitle>
            <DialogDescription>
              {isCloud
                ? 'クラウドに保存され、招待コードで共有できます。'
                : 'この端末のみに保存されます。共有するにはログインしてください。'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">グループ名 *</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="金曜麻雀会"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="group-description">メモ（任意）</Label>
              <Textarea
                id="group-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ルール・場所など"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner-name">あなたの表示名 *</Label>
              <Input
                id="owner-name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="ユウダイ"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>その他のメンバー（任意）</Label>
              <div className="space-y-2">
                {extra.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={v}
                      onChange={(e) => {
                        const next = [...extra];
                        next[i] = e.target.value;
                        setExtra(next);
                      }}
                      placeholder={`メンバー ${i + 1}`}
                    />
                    {extra.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setExtra(extra.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExtra([...extra, ''])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  メンバーを追加
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {isCloud
                  ? 'ここで追加するメンバーはゲスト扱いです。本人がログインして招待コードで参加するとアカウントが紐づきます。'
                  : 'セッション追加時にもゲストを自由に追加できます。'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={submitting || !name.trim() || !ownerName.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              作成
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
