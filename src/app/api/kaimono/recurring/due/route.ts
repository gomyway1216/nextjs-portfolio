import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KAIMONO_RECURRING_ITEMS_COLLECTION } from '../../../constants';
import type { RecurringItem } from '@/types/kaimono';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/kaimono/recurring/due - Get items due today or overdue (requires auth)
export const GET = withActivityLog('next_api.kaimono.recurring.due.GET', async (request: NextRequest) => {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const db = getFirestore();
    const today = new Date().toISOString().split('T')[0];

    const snapshot = await db
      .collection(KAIMONO_RECURRING_ITEMS_COLLECTION)
      .where('userId', '==', user.uid)
      .where('isActive', '==', true)
      .where('nextDueDate', '<=', today)
      .orderBy('nextDueDate', 'asc')
      .get();

    const items: RecurringItem[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        name: data.name,
        category: data.category,
        interval: data.interval,
        quantity: data.quantity || 1,
        unit: data.unit,
        price: data.price,
        store: data.store,
        note: data.note,
        lastAddedDate: data.lastAddedDate,
        nextDueDate: data.nextDueDate,
        isActive: data.isActive,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      };
    });

    return NextResponse.json({
      items,
      total: items.length,
    });
  } catch (error) {
    console.error('Error fetching due recurring items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch due recurring items' },
      { status: 500 }
    );
  }
});
