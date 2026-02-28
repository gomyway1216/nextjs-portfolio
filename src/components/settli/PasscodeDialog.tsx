'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, AlertCircle } from 'lucide-react';

interface PasscodeDialogProps {
  open: boolean;
  groupName: string;
  onVerify: (passcode: string) => Promise<boolean>;
  onCancel: () => void;
}

export function PasscodeDialog({
  open,
  groupName,
  onVerify,
  onCancel,
}: PasscodeDialogProps) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passcode.trim()) {
      setError('パスコードを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const success = await onVerify(passcode);
      if (!success) {
        setError('パスコードが正しくありません');
        setPasscode('');
      }
    } catch {
      setError('確認に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            パスコードを入力
          </DialogTitle>
          <DialogDescription>
            「{groupName}」はパスコードで保護されています
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="passcode">パスコード</Label>
            <Input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                setError('');
              }}
              placeholder="パスコードを入力"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onCancel}
              disabled={loading}
            >
              キャンセル
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? '確認中...' : '確認'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
