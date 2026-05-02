import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { KAIMONO_LISTS_COLLECTION } from '../../../../../constants';
import type { ShoppingItem, UpdateShoppingItemInput } from '@/types/kaimono';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
interface RouteParams {
  params: Promise<{ listId: string; itemId: string }>;
}

// PUT /api/kaimono/lists/[listId]/items/[itemId] - Update an item
export const PUT = withActivityLog('next_api.kaimono.lists.listId.items.itemId.PUT', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { listId, itemId } = await params;
    const body: UpdateShoppingItemInput = await request.json();
    const db = getFirestore();

    const listRef = db.collection(KAIMONO_LISTS_COLLECTION).doc(listId);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const listData = listDoc.data()!;
    const items: ShoppingItem[] = listData.items || [];
    const itemIndex = items.findIndex((item) => item.id === itemId);

    if (itemIndex === -1) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Update item fields
    const item = items[itemIndex];
    if (body.name !== undefined) item.name = body.name;
    if (body.category !== undefined) item.category = body.category;
    if (body.priority !== undefined) item.priority = body.priority;
    if (body.quantity !== undefined) item.quantity = body.quantity;
    if (body.unit !== undefined) item.unit = body.unit;
    if (body.price !== undefined) item.price = body.price;
    if (body.isPurchased !== undefined) {
      item.isPurchased = body.isPurchased;
      item.purchasedAt = body.isPurchased ? new Date().toISOString() : undefined;
    }
    if (body.note !== undefined) item.note = body.note;
    if (body.store !== undefined) item.store = body.store;
    if (body.order !== undefined) item.order = body.order;

    items[itemIndex] = item;

    // Recalculate totalSpent
    const totalSpent = items
      .filter((i) => i.isPurchased && i.price)
      .reduce((sum, i) => sum + (i.price || 0) * i.quantity, 0);

    await listRef.update({
      items,
      totalSpent,
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json({ message: 'Item updated successfully' });
  } catch (error) {
    console.error('Error updating kaimono item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
});

// DELETE /api/kaimono/lists/[listId]/items/[itemId] - Remove an item
export const DELETE = withActivityLog('next_api.kaimono.lists.listId.items.itemId.DELETE', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { listId, itemId } = await params;
    const db = getFirestore();

    const listRef = db.collection(KAIMONO_LISTS_COLLECTION).doc(listId);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const listData = listDoc.data()!;
    const items: ShoppingItem[] = listData.items || [];
    const filtered = items.filter((item) => item.id !== itemId);

    if (filtered.length === items.length) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Recalculate totalSpent
    const totalSpent = filtered
      .filter((i) => i.isPurchased && i.price)
      .reduce((sum, i) => sum + (i.price || 0) * i.quantity, 0);

    await listRef.update({
      items: filtered,
      totalSpent,
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting kaimono item:', error);
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    );
  }
});
