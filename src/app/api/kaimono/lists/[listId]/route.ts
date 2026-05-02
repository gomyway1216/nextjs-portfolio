import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import {
  KAIMONO_LISTS_COLLECTION,
  KAIMONO_USER_HISTORY_COLLECTION,
} from '../../../constants';
import type { ShoppingList, UpdateShoppingListInput } from '@/types/kaimono';
import * as crypto from 'crypto';

function simpleHash(passcode: string): string {
  return crypto.createHash('sha256').update(passcode).digest('hex');
}

interface RouteParams {
  params: Promise<{ listId: string }>;
}

// GET /api/kaimono/lists/[listId]
export const GET = withActivityLog('next_api.kaimono.lists.listId.GET', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { listId } = await params;
    const db = getFirestore();

    const listDoc = await db.collection(KAIMONO_LISTS_COLLECTION).doc(listId).get();

    if (!listDoc.exists) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const data = listDoc.data()!;

    // Check passcode
    const hasPasscode = data.hasPasscode || false;
    const { searchParams } = new URL(request.url);
    const verified = searchParams.get('verified') === 'true';

    if (hasPasscode && !verified) {
      return NextResponse.json({
        id: listDoc.id,
        name: data.name,
        hasPasscode: true,
        requiresPasscode: true,
      });
    }

    const list: ShoppingList = {
      id: listDoc.id,
      name: data.name,
      date: data.date,
      budget: data.budget,
      currency: data.currency,
      createdBy: data.createdBy,
      shareCode: data.shareCode,
      hasPasscode,
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
    console.error('Error fetching kaimono list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shopping list' },
      { status: 500 }
    );
  }
});

// PUT /api/kaimono/lists/[listId]
export const PUT = withActivityLog('next_api.kaimono.lists.listId.PUT', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { listId } = await params;
    const body: UpdateShoppingListInput = await request.json();
    const db = getFirestore();

    const listRef = db.collection(KAIMONO_LISTS_COLLECTION).doc(listId);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: getServerTimestamp(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.date !== undefined) updateData.date = body.date;
    if (body.budget !== undefined) updateData.budget = body.budget;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.stores !== undefined) updateData.stores = body.stores;
    if (body.isCompleted !== undefined) {
      updateData.isCompleted = body.isCompleted;
      if (body.isCompleted) {
        updateData.completedAt = getServerTimestamp();
      }
    }
    if (body.passcode !== undefined) {
      if (body.passcode === null) {
        updateData.hasPasscode = false;
        updateData.passcodeHash = null;
      } else {
        updateData.hasPasscode = true;
        updateData.passcodeHash = simpleHash(body.passcode);
      }
    }

    await listRef.update(updateData);

    // Update user history if list name changed
    if (body.name) {
      const historySnapshot = await db
        .collection(KAIMONO_USER_HISTORY_COLLECTION)
        .where('listId', '==', listId)
        .get();

      const batch = db.batch();
      historySnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          listName: body.name,
          updatedAt: getServerTimestamp(),
        });
      });
      await batch.commit();
    }

    return NextResponse.json({ message: 'List updated successfully' });
  } catch (error) {
    console.error('Error updating kaimono list:', error);
    return NextResponse.json(
      { error: 'Failed to update shopping list' },
      { status: 500 }
    );
  }
});

// DELETE /api/kaimono/lists/[listId]
export const DELETE = withActivityLog('next_api.kaimono.lists.listId.DELETE', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { listId } = await params;
    const user = await getOptionalUser(request);
    const db = getFirestore();

    const listRef = db.collection(KAIMONO_LISTS_COLLECTION).doc(listId);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const listData = listDoc.data()!;

    // Only creator can delete
    if (listData.createdBy && user?.uid !== listData.createdBy) {
      return NextResponse.json(
        { error: 'Only the creator can delete this list' },
        { status: 403 }
      );
    }

    const batch = db.batch();

    // Delete user history entries
    const historySnapshot = await db
      .collection(KAIMONO_USER_HISTORY_COLLECTION)
      .where('listId', '==', listId)
      .get();

    historySnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete the list
    batch.delete(listRef);
    await batch.commit();

    return NextResponse.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Error deleting kaimono list:', error);
    return NextResponse.json(
      { error: 'Failed to delete shopping list' },
      { status: 500 }
    );
  }
});
