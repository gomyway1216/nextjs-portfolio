import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

// POST /api/kuizu/qrcode - Generate QR code for sharing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quizId } = body;

    if (!quizId) {
      return NextResponse.json(
        { error: 'Quiz ID is required' },
        { status: 400 }
      );
    }

    // Build the share URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://yudai-yaguchi.com';
    const shareUrl = `${baseUrl}/tools/kuizu/custom/${quizId}`;

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
    console.error('Error generating kuizu QR code:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}
