import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import {
  SETTLI_GROUPS_COLLECTION,
  SETTLI_PAYMENTS_COLLECTION,
  SETTLI_USER_HISTORY_COLLECTION,
} from '../../../constants';
import type { SettliGroup, UpdateGroupInput } from '@/types/settli';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/settli/groups/[groupId] - Get a specific group
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId } = await params;
    const db = getFirestore();

    const groupDoc = await db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId).get();

    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const data = groupDoc.data()!;

    // Check if passcode verification is needed
    const hasPasscode = data.hasPasscode || false;
    const { searchParams } = new URL(request.url);
    const verified = searchParams.get('verified') === 'true';

    // If passcode is set and not verified, return limited info
    if (hasPasscode && !verified) {
      return NextResponse.json({
        id: groupDoc.id,
        name: data.name,
        hasPasscode: true,
        requiresPasscode: true,
      });
    }

    const group: SettliGroup = {
      id: groupDoc.id,
      name: data.name,
      description: data.description,
      currency: data.currency,
      exchangeRates: data.exchangeRates,
      createdBy: data.createdBy,
      shareCode: data.shareCode,
      hasPasscode,
      members: data.members || [],
      isSettled: data.isSettled || false,
      settledAt: data.settledAt?.toDate?.()?.toISOString(),
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
    };

    return NextResponse.json(group);
  } catch (error) {
    console.error('Error fetching settli group:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settli group' },
      { status: 500 }
    );
  }
}

// PUT /api/settli/groups/[groupId] - Update a group
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId } = await params;
    const body: UpdateGroupInput = await request.json();
    const db = getFirestore();

    const groupRef = db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: getServerTimestamp(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.exchangeRates !== undefined) updateData.exchangeRates = body.exchangeRates;
    if (body.isSettled !== undefined) {
      updateData.isSettled = body.isSettled;
      if (body.isSettled) {
        updateData.settledAt = getServerTimestamp();
      }
    }

    await groupRef.update(updateData);

    // Update user history if group name changed
    if (body.name) {
      const historySnapshot = await db
        .collection(SETTLI_USER_HISTORY_COLLECTION)
        .where('groupId', '==', groupId)
        .get();

      const batch = db.batch();
      historySnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          groupName: body.name,
          updatedAt: getServerTimestamp(),
        });
      });
      await batch.commit();
    }

    return NextResponse.json({ message: 'Group updated successfully' });
  } catch (error) {
    console.error('Error updating settli group:', error);
    return NextResponse.json(
      { error: 'Failed to update settli group' },
      { status: 500 }
    );
  }
}

// DELETE /api/settli/groups/[groupId] - Delete a group
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId } = await params;
    const user = await getOptionalUser(request);
    const db = getFirestore();

    const groupRef = db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const groupData = groupDoc.data()!;

    // Only creator can delete (if there is one)
    if (groupData.createdBy && user?.uid !== groupData.createdBy) {
      return NextResponse.json(
        { error: 'Only the creator can delete this group' },
        { status: 403 }
      );
    }

    // Delete all related payments
    const paymentsSnapshot = await db
      .collection(SETTLI_PAYMENTS_COLLECTION)
      .where('groupId', '==', groupId)
      .get();

    const batch = db.batch();

    paymentsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete all user history entries
    const historySnapshot = await db
      .collection(SETTLI_USER_HISTORY_COLLECTION)
      .where('groupId', '==', groupId)
      .get();

    historySnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete the group itself
    batch.delete(groupRef);

    await batch.commit();

    return NextResponse.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting settli group:', error);
    return NextResponse.json(
      { error: 'Failed to delete settli group' },
      { status: 500 }
    );
  }
}
