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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passcode.trim()) {
      setError(t('settli.passcode.errors.required'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const success = await onVerify(passcode);
      if (!success) {
        setError(t('settli.passcode.errors.invalid'));
        setPasscode('');
      }
    } catch {
      setError(t('settli.passcode.errors.verifyFailed'));
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
            {t('settli.passcode.title')}
          </DialogTitle>
          <DialogDescription>
            {t('settli.passcode.description', { groupName })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="passcode">{t('settli.passcode.label')}</Label>
            <Input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                setError('');
              }}
              placeholder={t('settli.passcode.placeholder')}
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
              {t('settli.common.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? t('settli.passcode.verifying') : t('settli.passcode.confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
