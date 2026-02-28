import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { SETTLI_GROUPS_COLLECTION } from '../../constants';
import QRCode from 'qrcode';

// POST /api/settli/qrcode - Generate QR code for a group
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId } = body;

    if (!groupId) {
      return NextResponse.json(
        { error: 'Group ID is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Get group to verify it exists and get share code
    const groupDoc = await db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId).get();

    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const groupData = groupDoc.data()!;
    const shareCode = groupData.shareCode;

    // Build the share URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://yudaiyaguchi.com';
    const shareUrl = `${baseUrl}/tools/settli/join/${shareCode}`;

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });

    return NextResponse.json({
      qrCodeDataUrl,
      shareUrl,
      shareCode,
      groupName: groupData.name,
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}
