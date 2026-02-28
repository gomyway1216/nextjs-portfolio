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
  listName: string;
  onVerify: (passcode: string) => Promise<boolean>;
  onCancel: () => void;
}

export function PasscodeDialog({
  open,
  listName,
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
      setError(t('kaimono.passcode.errors.required', 'Passcode is required'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const success = await onVerify(passcode);
      if (!success) {
        setError(t('kaimono.passcode.errors.invalid', 'Invalid passcode'));
        setPasscode('');
      }
    } catch {
      setError(t('kaimono.passcode.errors.verifyFailed', 'Failed to verify'));
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
            {t('kaimono.passcode.title', 'Enter Passcode')}
          </DialogTitle>
          <DialogDescription>
            {t('kaimono.passcode.description', { listName, defaultValue: `Enter the passcode to access "${listName}"` })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="passcode">{t('kaimono.passcode.label', 'Passcode')}</Label>
            <Input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => { setPasscode(e.target.value); setError(''); }}
              placeholder={t('kaimono.passcode.placeholder', 'Enter passcode')}
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
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
              {t('kaimono.common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? t('kaimono.passcode.verifying', 'Verifying...') : t('kaimono.passcode.confirm', 'Confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
