import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { KAIMONO_LISTS_COLLECTION } from '../../../../constants';
import type { ShoppingItem, CreateShoppingItemInput } from '@/types/kaimono';
import { ItemCategory, ItemPriority } from '@/types/kaimono';
import { v4 as uuidv4 } from 'uuid';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
interface RouteParams {
  params: Promise<{ listId: string }>;
}

// POST /api/kaimono/lists/[listId]/items - Add items to list
export const POST = withActivityLog('next_api.kaimono.lists.listId.items.POST', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { listId } = await params;
    const body = await request.json();
    const db = getFirestore();

    const listRef = db.collection(KAIMONO_LISTS_COLLECTION).doc(listId);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const listData = listDoc.data()!;
    const existingItems: ShoppingItem[] = listData.items || [];
    const maxOrder = existingItems.reduce((max, item) => Math.max(max, item.order), -1);

    const inputItems: CreateShoppingItemInput[] = body.items || [body];

    // Reject negative / non-finite prices and quantities: totalSpent is
    // sum(price * quantity) over purchased items, so either side being
    // NaN/Infinity/negative corrupts the budget UI.
    for (const item of inputItems) {
      if (item.price !== undefined && item.price !== null &&
          (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0)) {
        return NextResponse.json(
          { error: 'price must be a non-negative finite number' },
          { status: 400 }
        );
      }
      if (item.quantity !== undefined &&
          (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
        return NextResponse.json(
          { error: 'quantity must be a finite number greater than 0' },
          { status: 400 }
        );
      }
    }

    const newItems: ShoppingItem[] = inputItems.map((item, i) => ({
      id: uuidv4(),
      name: item.name,
      category: item.category || ItemCategory.OTHER,
      priority: item.priority || ItemPriority.MUST_BUY,
      quantity: item.quantity || 1,
      unit: item.unit,
      price: item.price,
      isPurchased: false,
      note: item.note,
      store: item.store,
      recurringId: item.recurringId,
      order: maxOrder + 1 + i,
    }));

    await listRef.update({
      items: [...existingItems, ...newItems],
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json(
      {
        ids: newItems.map((item) => item.id),
        message: 'Items added successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding kaimono items:', error);
    return NextResponse.json(
      { error: 'Failed to add items' },
      { status: 500 }
    );
  }
});
