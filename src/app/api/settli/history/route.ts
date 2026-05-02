import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { SETTLI_USER_HISTORY_COLLECTION } from '../../constants';
import type { UserHistory } from '@/types/settli';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/settli/history - Get user's settli history
export const GET = withActivityLog('next_api.settli.history.GET', async (request: NextRequest) => {
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
      .collection(SETTLI_USER_HISTORY_COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('updatedAt', 'desc')
      .get();

    const history: UserHistory[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        groupId: data.groupId,
        groupName: data.groupName,
        role: data.role,
        totalPaid: data.totalPaid,
        totalOwed: data.totalOwed,
        currency: data.currency,
        isSettled: data.isSettled || false,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      };
    });

    return NextResponse.json({
      history,
      total: history.length,
    });
  } catch (error) {
    console.error('Error fetching settli history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settli history' },
      { status: 500 }
    );
  }
});
