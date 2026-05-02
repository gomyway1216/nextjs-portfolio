import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KAIMONO_RECURRING_ITEMS_COLLECTION } from '../../constants';
import type { RecurringItem, CreateRecurringItemInput } from '@/types/kaimono';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/kaimono/recurring - Get recurring items (requires auth)
export const GET = withActivityLog('next_api.kaimono.recurring.GET', async (request: NextRequest) => {
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
      .collection(KAIMONO_RECURRING_ITEMS_COLLECTION)
      .where('userId', '==', user.uid)
      .where('isActive', '==', true)
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
    console.error('Error fetching recurring items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recurring items' },
      { status: 500 }
    );
  }
});

// POST /api/kaimono/recurring - Create recurring item (requires auth)
export const POST = withActivityLog('next_api.kaimono.recurring.POST', async (request: NextRequest) => {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body: CreateRecurringItemInput = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: 'Item name is required' },
        { status: 400 }
      );
    }

    if (!body.interval) {
      return NextResponse.json(
        { error: 'Interval is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    const newItem = {
      userId: user.uid,
      name: body.name,
      category: body.category || 'other',
      interval: body.interval,
      quantity: body.quantity || 1,
      unit: body.unit || null,
      price: body.price || null,
      store: body.store || null,
      note: body.note || null,
      lastAddedDate: null,
      nextDueDate: body.nextDueDate || new Date().toISOString().split('T')[0],
      isActive: true,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    };

    const docRef = await db.collection(KAIMONO_RECURRING_ITEMS_COLLECTION).add(newItem);

    return NextResponse.json(
      { id: docRef.id, message: 'Recurring item created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating recurring item:', error);
    return NextResponse.json(
      { error: 'Failed to create recurring item' },
      { status: 500 }
    );
  }
});
