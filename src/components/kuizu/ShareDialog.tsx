'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Share2, QrCode, Link as LinkIcon, Check } from 'lucide-react';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareCode?: string;
  quizId?: string;
  roomId?: string;
  onGenerateQR?: () => Promise<string>;
  type: 'quiz' | 'room';
}

export default function ShareDialog({
  open,
  onOpenChange,
  shareCode,
  quizId,
  roomId,
  onGenerateQR,
  type,
}: ShareDialogProps) {
  const { t } = useTranslation();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [generatingQR, setGeneratingQR] = useState(false);

  const shareLink =
    type === 'quiz'
      ? `${window.location.origin}/tools/kuizu/custom/${quizId}`
      : `${window.location.origin}/tools/kuizu/multiplayer/${roomId}`;

  const handleCopyCode = () => {
    if (shareCode || roomId) {
      navigator.clipboard.writeText((shareCode || roomId)!);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleGenerateQR = async () => {
    if (!onGenerateQR) return;

    setGeneratingQR(true);
    try {
      const url = await onGenerateQR();
      setQrCodeUrl(url);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    } finally {
      setGeneratingQR(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-orange-500" />
            {type === 'quiz' ? t('kuizu.share.shareQuiz') : t('kuizu.share.shareRoom')}
          </DialogTitle>
          <DialogDescription>
            {type === 'quiz'
              ? t('kuizu.share.shareQuizDescription')
              : t('kuizu.share.shareRoomDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Share Code */}
          {(shareCode || roomId) && (
            <div className="space-y-2">
              <Label htmlFor="shareCode">
                {type === 'quiz' ? t('kuizu.share.quizCode') : t('kuizu.share.roomCode')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="shareCode"
                  value={shareCode || roomId}
                  readOnly
                  className="font-mono text-lg font-bold bg-gray-50"
                />
                <Button
                  onClick={handleCopyCode}
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                >
                  {copiedCode ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Share Link */}
          <div className="space-y-2">
            <Label htmlFor="shareLink" className="flex items-center gap-1">
              <LinkIcon className="w-4 h-4" />
              {t('kuizu.share.shareableLink')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="shareLink"
                value={shareLink}
                readOnly
                className="bg-gray-50 text-sm"
              />
              <Button
                onClick={handleCopyLink}
                variant="outline"
                size="sm"
                className="flex-shrink-0"
              >
                {copiedLink ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* QR Code Section */}
          {onGenerateQR && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <QrCode className="w-4 h-4" />
                {t('kuizu.share.qrCode')}
              </Label>

              {!qrCodeUrl ? (
                <Button
                  onClick={handleGenerateQR}
                  disabled={generatingQR}
                  variant="outline"
                  className="w-full border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  {generatingQR
                    ? t('kuizu.share.generatingQR')
                    : t('kuizu.share.generateQR')}
                </Button>
              ) : (
                <div className="flex flex-col items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code"
                    className="w-48 h-48 border-4 border-white shadow-md"
                  />
                  <p className="text-xs text-gray-500 text-center">
                    {t('kuizu.share.scanQRCode')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="pt-2 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              {type === 'quiz'
                ? t('kuizu.share.quizInstructions')
                : t('kuizu.share.roomInstructions')}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
