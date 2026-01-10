import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import {
  WARIKAN_GROUPS_COLLECTION,
  WARIKAN_USER_HISTORY_COLLECTION,
} from '../../../../constants';
import type { WarikanGroup } from '@/types/warikan';

interface RouteParams {
  params: Promise<{ shareCode: string }>;
}

// GET /api/warikan/groups/share/[shareCode] - Get group by share code
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { shareCode } = await params;
    const user = await getOptionalUser(request);
    const db = getFirestore();

    const snapshot = await db
      .collection(WARIKAN_GROUPS_COLLECTION)
      .where('shareCode', '==', shareCode)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const groupDoc = snapshot.docs[0];
    const data = groupDoc.data();

    const group: WarikanGroup = {
      id: groupDoc.id,
      name: data.name,
      description: data.description,
      currency: data.currency,
      exchangeRates: data.exchangeRates,
      createdBy: data.createdBy,
      shareCode: data.shareCode,
      members: data.members || [],
      isSettled: data.isSettled || false,
      settledAt: data.settledAt?.toDate?.()?.toISOString(),
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
    };

    // If user is logged in and not already in history, add them
    if (user) {
      const existingHistory = await db
        .collection(WARIKAN_USER_HISTORY_COLLECTION)
        .where('userId', '==', user.uid)
        .where('groupId', '==', groupDoc.id)
        .get();

      if (existingHistory.empty) {
        await db.collection(WARIKAN_USER_HISTORY_COLLECTION).add({
          userId: user.uid,
          groupId: groupDoc.id,
          groupName: data.name,
          role: 'member',
          totalPaid: 0,
          totalOwed: 0,
          currency: data.currency,
          isSettled: data.isSettled || false,
          createdAt: getServerTimestamp(),
          updatedAt: getServerTimestamp(),
        });

        // Also link the user to their member entry if email matches
        const members = data.members || [];
        const matchingMember = members.find(
          (m: { email?: string }) => m.email === user.email
        );
        if (matchingMember && !matchingMember.userId) {
          matchingMember.userId = user.uid;
          await groupDoc.ref.update({
            members,
            updatedAt: getServerTimestamp(),
          });
        }
      }
    }

    return NextResponse.json(group);
  } catch (error) {
    console.error('Error fetching warikan group by share code:', error);
    return NextResponse.json(
      { error: 'Failed to fetch warikan group' },
      { status: 500 }
    );
  }
}
