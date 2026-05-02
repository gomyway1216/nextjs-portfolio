import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { KAIMONO_LISTS_COLLECTION } from '../../../constants';
import type { ShoppingList } from '@/types/kaimono';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
interface RouteParams {
  params: Promise<{ shareCode: string }>;
}

// GET /api/kaimono/share/[shareCode] - Get list by share code
export const GET = withActivityLog('next_api.kaimono.share.shareCode.GET', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { shareCode } = await params;
    const db = getFirestore();

    const snapshot = await db
      .collection(KAIMONO_LISTS_COLLECTION)
      .where('shareCode', '==', shareCode)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        { error: 'List not found with this share code' },
        { status: 404 }
      );
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    const list: ShoppingList = {
      id: doc.id,
      name: data.name,
      date: data.date,
      budget: data.budget,
      currency: data.currency,
      createdBy: data.createdBy,
      shareCode: data.shareCode,
      hasPasscode: data.hasPasscode || false,
      members: data.members || [],
      items: data.items || [],
      stores: data.stores || [],
      isCompleted: data.isCompleted || false,
      completedAt: data.completedAt?.toDate?.()?.toISOString(),
      totalSpent: data.totalSpent || 0,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
    };

    return NextResponse.json(list);
  } catch (error) {
    console.error('Error fetching kaimono list by share code:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shopping list' },
      { status: 500 }
    );
  }
});
