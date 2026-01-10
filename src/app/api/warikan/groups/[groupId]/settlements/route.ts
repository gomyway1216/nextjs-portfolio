import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import {
  WARIKAN_GROUPS_COLLECTION,
  WARIKAN_PAYMENTS_COLLECTION,
} from '../../../../constants';
import type { Payment, Member, SettlementCalculation } from '@/types/warikan';
import { calculateFullSettlement } from '@/lib/warikanAlgorithm';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/warikan/groups/[groupId]/settlements - Calculate settlements
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId } = await params;
    const db = getFirestore();

    // Get group
    const groupDoc = await db.collection(WARIKAN_GROUPS_COLLECTION).doc(groupId).get();
    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const groupData = groupDoc.data()!;
    const members: Member[] = groupData.members || [];

    // Get all payments for this group
    const paymentsSnapshot = await db
      .collection(WARIKAN_PAYMENTS_COLLECTION)
      .where('groupId', '==', groupId)
      .get();

    const payments: Payment[] = paymentsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        groupId: data.groupId,
        payerId: data.payerId,
        amount: data.amount,
        currency: data.currency,
        description: data.description,
        category: data.category,
        date: data.date?.toDate?.()?.toISOString() || data.date,
        splitType: data.splitType,
        participants: data.participants || [],
        createdBy: data.createdBy,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      };
    });

    // Calculate settlements using the algorithm
    const calculation: SettlementCalculation = calculateFullSettlement(
      payments,
      members,
      groupData.currency
    );

    return NextResponse.json(calculation);
  } catch (error) {
    console.error('Error calculating settlements:', error);
    return NextResponse.json(
      { error: 'Failed to calculate settlements' },
      { status: 500 }
    );
  }
}
