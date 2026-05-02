import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import {
  KAIMONO_LISTS_COLLECTION,
  KAIMONO_USER_HISTORY_COLLECTION,
} from '../../constants';
import type { ShoppingList, CreateShoppingListInput, ListMember, ShoppingItem, Store } from '@/types/kaimono';
import { ItemCategory, ItemPriority, StoreType } from '@/types/kaimono';
import { v4 as uuidv4 } from 'uuid';
import { generateShareCode } from '@/lib/settliAlgorithm';
import * as crypto from 'crypto';

function simpleHash(passcode: string): string {
  return crypto.createHash('sha256').update(passcode).digest('hex');
}

// GET /api/kaimono/lists - Get user's lists (requires auth)
export const GET = withActivityLog('next_api.kaimono.lists.GET', async (request: NextRequest) => {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to view lists' },
        { status: 401 }
      );
    }

    const db = getFirestore();

    const historySnapshot = await db
      .collection(KAIMONO_USER_HISTORY_COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('updatedAt', 'desc')
      .get();

    const listIds = historySnapshot.docs.map((doc) => doc.data().listId);

    if (listIds.length === 0) {
      return NextResponse.json({ lists: [], total: 0 });
    }

    const lists: ShoppingList[] = [];
    for (const listId of listIds) {
      const listDoc = await db.collection(KAIMONO_LISTS_COLLECTION).doc(listId).get();
      if (listDoc.exists) {
        const data = listDoc.data()!;
        lists.push({
          id: listDoc.id,
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
        });
      }
    }

    return NextResponse.json({ lists, total: lists.length });
  } catch (error) {
    console.error('Error fetching kaimono lists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shopping lists' },
      { status: 500 }
    );
  }
});

// POST /api/kaimono/lists - Create a new shopping list
export const POST = withActivityLog('next_api.kaimono.lists.POST', async (request: NextRequest) => {
  try {
    const user = await getOptionalUser(request);
    const body: CreateShoppingListInput = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: 'List name is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Generate unique share code
    let shareCode = generateShareCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db
        .collection(KAIMONO_LISTS_COLLECTION)
        .where('shareCode', '==', shareCode)
        .get();
      if (existing.empty) break;
      shareCode = generateShareCode();
      attempts++;
    }

    // Create initial stores
    const stores: Store[] = (body.stores || []).map((s, i) => ({
      id: uuidv4(),
      name: s.name,
      type: s.type || StoreType.OTHER,
      order: i,
    }));

    // Create initial items
    const items: ShoppingItem[] = (body.items || []).map((item, i) => ({
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
      order: i,
    }));

    // Create members list
    const members: ListMember[] = [];
    if (user) {
      members.push({
        id: uuidv4(),
        name: user.email?.split('@')[0] || 'Me',
        userId: user.uid,
        email: user.email,
        joinedAt: new Date().toISOString(),
        isActive: true,
      });
    }

    const hasPasscode = !!body.passcode;
    const passcodeHash = body.passcode ? simpleHash(body.passcode) : null;

    const newList = {
      name: body.name,
      date: body.date || new Date().toISOString().split('T')[0],
      budget: body.budget || null,
      currency: body.currency || 'JPY',
      createdBy: user?.uid || null,
      shareCode,
      hasPasscode,
      passcodeHash,
      members,
      items,
      stores,
      isCompleted: false,
      totalSpent: 0,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    };

    const docRef = await db.collection(KAIMONO_LISTS_COLLECTION).add(newList);

    // Add to user history if logged in
    if (user) {
      await db.collection(KAIMONO_USER_HISTORY_COLLECTION).add({
        userId: user.uid,
        listId: docRef.id,
        listName: body.name,
        date: body.date || new Date().toISOString().split('T')[0],
        totalSpent: 0,
        itemCount: items.length,
        currency: body.currency || 'JPY',
        isCompleted: false,
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp(),
      });
    }

    return NextResponse.json(
      { id: docRef.id, shareCode, message: 'Shopping list created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating kaimono list:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create shopping list', details: errorMessage },
      { status: 500 }
    );
  }
});
