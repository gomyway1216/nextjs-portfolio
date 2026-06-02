'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Share2, Copy, Check, QrCode, Link } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import type { QRCodeResponse } from '@/types/settli';
import { useTranslation } from 'react-i18next';

interface ShareDialogProps {
  groupId: string;
  groupName: string;
  shareCode: string;
  onGenerateQR: () => Promise<QRCodeResponse>;
}

export function ShareDialog({
  groupName,
  shareCode,
  onGenerateQR,
}: ShareDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrData, setQrData] = useState<QRCodeResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BASE_URL || '';
  const shareUrl = `${baseUrl}/tools/settli/join/${shareCode}`;

  useEffect(() => {
    if (open && !qrData) {
      generateQR();
    }
  }, [open]);

  const generateQR = async () => {
    setLoading(true);
    try {
      const data = await onGenerateQR();
      setQrData(data);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t('settli.share.toast.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('settli.share.toast.copyFailed'));
    }
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('settli.share.native.title', { groupName }),
          text: t('settli.share.native.text', { groupName }),
          url: shareUrl,
        });
      } catch (error) {
        // User cancelled share
        if ((error as Error).name !== 'AbortError') {
          console.error('Share failed:', error);
        }
      }
    } else {
      copyToClipboard();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" style={{ borderRadius: '9999px' }}>
          <Share2 className="h-4 w-4 mr-2" />
          {t('settli.share.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settli.share.title')}</DialogTitle>
          <DialogDescription>
            {t('settli.share.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* QR Code */}
          <div className="flex flex-col items-center gap-4">
            {loading ? (
              <div className="w-48 h-48 bg-muted animate-pulse rounded-lg flex items-center justify-center">
                <QrCode className="h-8 w-8 text-muted-foreground" />
              </div>
            ) : qrData?.qrCodeDataUrl ? (
              <Image
                src={qrData.qrCodeDataUrl}
                alt="Share QR Code"
                width={192}
                height={192}
                unoptimized
                className="w-48 h-48 rounded-lg border"
              />
            ) : (
              <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center">
                <QrCode className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center">
              {t('settli.share.scanQr')}
            </p>
          </div>

          {/* Share Link */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Link className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('settli.share.linkLabel')}</span>
            </div>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={copyToClipboard}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Share Code */}
          <div className="p-4 bg-muted rounded-lg text-center">
            <p className="text-sm text-muted-foreground mb-1">{t('settli.share.codeLabel')}</p>
            <p className="text-2xl font-mono font-bold tracking-widest">
              {shareCode}
            </p>
          </div>

          {/* Share Button */}
          <Button onClick={shareNative} className="w-full">
            <Share2 className="h-4 w-4 mr-2" />
            {t('settli.share.shareNow')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
