'use client';

import { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
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

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareCode: string;
  groupName: string;
}

export function ShareDialog({ open, onOpenChange, shareCode, groupName }: ShareDialogProps) {
  const [copiedField, setCopiedField] = useState<'code' | 'link' | null>(null);

  const link = typeof window !== 'undefined'
    ? `${window.location.origin}/tools/score-tracker?code=${shareCode}`
    : `/tools/score-tracker?code=${shareCode}`;

  async function copy(value: string, field: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Clipboard API may be unavailable; user can select+copy manually from the input.
    }
  }

  async function nativeShare() {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: `${groupName} に参加`,
        text: `スコアトラッカー「${groupName}」に参加しよう。招待コード: ${shareCode}`,
        url: link,
      });
    } catch {
      // user cancelled
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>グループを共有</DialogTitle>
          <DialogDescription>
            招待コードまたはリンクを共有して、他の人をこのグループに招待します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>招待コード</Label>
            <div className="flex gap-2">
              <Input
                value={shareCode}
                readOnly
                className="font-mono text-center text-lg tracking-widest"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copy(shareCode, 'code')}
                aria-label="招待コードをコピー"
              >
                {copiedField === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>招待リンク</Label>
            <div className="flex gap-2">
              <Input value={link} readOnly className="text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copy(link, 'link')}
                aria-label="招待リンクをコピー"
              >
                {copiedField === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button type="button" variant="outline" className="w-full" onClick={nativeShare}>
              <Share2 className="h-4 w-4 mr-2" />
              端末で共有
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
