import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// POST /api/kaimono/qrcode - Generate QR code for sharing
export const POST = withActivityLog('next_api.kaimono.qrcode.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { groupId } = body; // groupId is actually listId, matching Settli pattern

    if (!groupId) {
      return NextResponse.json(
        { error: 'List ID is required' },
        { status: 400 }
      );
    }

    // Build the share URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://yudai-yaguchi.com';
    const shareUrl = `${baseUrl}/tools/kaimono/${groupId}`;

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    return NextResponse.json({
      qrCodeDataUrl,
      shareUrl,
    });
  } catch (error) {
    console.error('Error generating kaimono QR code:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
});
