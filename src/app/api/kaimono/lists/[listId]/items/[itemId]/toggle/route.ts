import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import {
  KAIMONO_LISTS_COLLECTION,
  KAIMONO_FREQUENT_ITEMS_COLLECTION,
} from '../../../../../../constants';
import type { ShoppingItem } from '@/types/kaimono';
import { getOptionalUser } from '@/lib/auth-utils';

interface RouteParams {
  params: Promise<{ listId: string; itemId: string }>;
}

// PATCH /api/kaimono/lists/[listId]/items/[itemId]/toggle - Toggle purchased
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { listId, itemId } = await params;
    const user = await getOptionalUser(request);
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

    const item = items[itemIndex];
    item.isPurchased = !item.isPurchased;
    item.purchasedAt = item.isPurchased ? new Date().toISOString() : undefined;
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

    // Update frequent items for logged-in users when marking as purchased
    if (user && item.isPurchased) {
      try {
        const frequentRef = db.collection(KAIMONO_FREQUENT_ITEMS_COLLECTION);
        const existing = await frequentRef
          .where('userId', '==', user.uid)
          .where('name', '==', item.name)
          .limit(1)
          .get();

        if (existing.empty) {
          await frequentRef.add({
            userId: user.uid,
            name: item.name,
            category: item.category,
            purchaseCount: 1,
            lastPurchasedAt: new Date().toISOString(),
            averagePrice: item.price || null,
            preferredStore: item.store || null,
            unit: item.unit || null,
          });
        } else {
          const doc = existing.docs[0];
          const data = doc.data();
          const newCount = (data.purchaseCount || 0) + 1;
          const avgPrice = item.price
            ? ((data.averagePrice || 0) * (newCount - 1) + item.price) / newCount
            : data.averagePrice;

          await doc.ref.update({
            purchaseCount: newCount,
            lastPurchasedAt: new Date().toISOString(),
            averagePrice: avgPrice,
            preferredStore: item.store || data.preferredStore,
            category: item.category,
          });
        }
      } catch (freqError) {
        console.error('Error updating frequent items:', freqError);
        // Don't fail the toggle operation
      }
    }

    return NextResponse.json({
      isPurchased: item.isPurchased,
      message: `Item ${item.isPurchased ? 'purchased' : 'unpurchased'}`,
    });
  } catch (error) {
    console.error('Error toggling kaimono item:', error);
    return NextResponse.json(
      { error: 'Failed to toggle item' },
      { status: 500 }
    );
  }
}
