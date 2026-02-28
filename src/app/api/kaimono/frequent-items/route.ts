import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KAIMONO_FREQUENT_ITEMS_COLLECTION } from '../../constants';
import type { FrequentItem } from '@/types/kaimono';

// GET /api/kaimono/frequent-items - Get frequently purchased items (requires auth)
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
      .collection(KAIMONO_FREQUENT_ITEMS_COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('purchaseCount', 'desc')
      .limit(50)
      .get();

    const items: FrequentItem[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        name: data.name,
        category: data.category,
        purchaseCount: data.purchaseCount,
        lastPurchasedAt: data.lastPurchasedAt,
        averagePrice: data.averagePrice,
        preferredStore: data.preferredStore,
        unit: data.unit,
      };
    });

    return NextResponse.json({
      items,
      total: items.length,
    });
  } catch (error) {
    console.error('Error fetching frequent items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frequent items' },
      { status: 500 }
    );
  }
}
