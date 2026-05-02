import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { KAIMONO_RECURRING_ITEMS_COLLECTION } from '../../../constants';
import type { UpdateRecurringItemInput } from '@/types/kaimono';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
interface RouteParams {
  params: Promise<{ itemId: string }>;
}

// PUT /api/kaimono/recurring/[itemId] - Update recurring item
export const PUT = withActivityLog('next_api.kaimono.recurring.itemId.PUT', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { itemId } = await params;
    const body: UpdateRecurringItemInput = await request.json();
    const db = getFirestore();

    const itemRef = db.collection(KAIMONO_RECURRING_ITEMS_COLLECTION).doc(itemId);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });
    }

    const itemData = itemDoc.data()!;

    // Only owner can update
    if (itemData.userId !== user.uid) {
      return NextResponse.json(
        { error: 'Not authorized to update this item' },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {
      updatedAt: getServerTimestamp(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.interval !== undefined) updateData.interval = body.interval;
    if (body.quantity !== undefined) updateData.quantity = body.quantity;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.store !== undefined) updateData.store = body.store;
    if (body.note !== undefined) updateData.note = body.note;
    if (body.nextDueDate !== undefined) updateData.nextDueDate = body.nextDueDate;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    await itemRef.update(updateData);

    return NextResponse.json({ message: 'Recurring item updated successfully' });
  } catch (error) {
    console.error('Error updating recurring item:', error);
    return NextResponse.json(
      { error: 'Failed to update recurring item' },
      { status: 500 }
    );
  }
});

// DELETE /api/kaimono/recurring/[itemId] - Delete recurring item
export const DELETE = withActivityLog('next_api.kaimono.recurring.itemId.DELETE', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { itemId } = await params;
    const db = getFirestore();

    const itemRef = db.collection(KAIMONO_RECURRING_ITEMS_COLLECTION).doc(itemId);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });
    }

    const itemData = itemDoc.data()!;

    if (itemData.userId !== user.uid) {
      return NextResponse.json(
        { error: 'Not authorized to delete this item' },
        { status: 403 }
      );
    }

    await itemRef.delete();

    return NextResponse.json({ message: 'Recurring item deleted successfully' });
  } catch (error) {
    console.error('Error deleting recurring item:', error);
    return NextResponse.json(
      { error: 'Failed to delete recurring item' },
      { status: 500 }
    );
  }
});
