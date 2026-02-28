import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KAIMONO_USER_HISTORY_COLLECTION } from '../../constants';
import type { KaimonoUserHistory } from '@/types/kaimono';

// GET /api/kaimono/history - Get user's shopping history (requires auth)
export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const db = getFirestore();

    const snapshot = await db
      .collection(KAIMONO_USER_HISTORY_COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('updatedAt', 'desc')
      .get();

    const history: KaimonoUserHistory[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        listId: data.listId,
        listName: data.listName,
        date: data.date,
        totalSpent: data.totalSpent || 0,
        itemCount: data.itemCount || 0,
        currency: data.currency,
        isCompleted: data.isCompleted || false,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      };
    });

    return NextResponse.json({
      history,
      total: history.length,
    });
  } catch (error) {
    console.error('Error fetching kaimono history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shopping history' },
      { status: 500 }
    );
  }
}
