import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { validateParticipantSplits } from '../../../_lib/validatePayment';
import {
  SETTLI_GROUPS_COLLECTION,
  SETTLI_PAYMENTS_COLLECTION,
} from '../../../../constants';
import type { Payment, CreatePaymentInput } from '@/types/settli';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/settli/groups/[groupId]/payments - Get all payments for a group
export const GET = withActivityLog('next_api.settli.groups.groupId.payments.GET', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { groupId } = await params;
    const db = getFirestore();

    // Verify group exists
    const groupDoc = await db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId).get();
    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const snapshot = await db
      .collection(SETTLI_PAYMENTS_COLLECTION)
      .where('groupId', '==', groupId)
      .orderBy('date', 'desc')
      .get();

    const payments: Payment[] = snapshot.docs.map((doc) => {
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

    return NextResponse.json({
      payments,
      total: payments.length,
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
});

// POST /api/settli/groups/[groupId]/payments - Add a new payment
export const POST = withActivityLog('next_api.settli.groups.groupId.payments.POST', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { groupId } = await params;
    const body: CreatePaymentInput = await request.json();
    const user = await getOptionalUser(request);
    const db = getFirestore();

    // Validate required fields. `amount` is intentionally excluded from
    // this falsy check — `!0` is true, which would mask 0 with the
    // generic message instead of the specific finite/positive validator
    // below.
    if (!body.payerId || body.amount === undefined || body.amount === null || !body.description || !body.splitType) {
      return NextResponse.json(
        { error: 'Missing required fields: payerId, amount, description, splitType' },
        { status: 400 }
      );
    }

    // Number.isFinite rejects NaN/Infinity/strings, which `amount <= 0`
    // silently let through (NaN <= 0 is false) and broke settlement math.
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a finite number greater than 0' },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.participants) || body.participants.length === 0) {
      return NextResponse.json(
        { error: 'participants must be a non-empty array' },
        { status: 400 }
      );
    }

    const splitError = validateParticipantSplits(body.participants);
    if (splitError) {
      return NextResponse.json({ error: splitError }, { status: 400 });
    }

    // Verify group exists and get currency
    const groupDoc = await db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId).get();
    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const groupData = groupDoc.data()!;
    const members = groupData.members || [];

    // Validate payer exists
    const payerExists = members.some((m: { id: string }) => m.id === body.payerId);
    if (!payerExists) {
      return NextResponse.json({ error: 'Payer not found in group' }, { status: 400 });
    }

    // Validate participants exist
    const participantIds = body.participants.map((p) => p.memberId);
    const allParticipantsExist = participantIds.every((id) =>
      members.some((m: { id: string }) => m.id === id)
    );
    if (!allParticipantsExist) {
      return NextResponse.json(
        { error: 'One or more participants not found in group' },
        { status: 400 }
      );
    }

    const newPayment = {
      groupId,
      payerId: body.payerId,
      amount: body.amount,
      currency: body.currency || groupData.currency,
      description: body.description,
      category: body.category || null,
      date: body.date ? new Date(body.date) : getServerTimestamp(),
      splitType: body.splitType,
      participants: body.participants,
      createdBy: user?.uid || null,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    };

    const docRef = await db.collection(SETTLI_PAYMENTS_COLLECTION).add(newPayment);

    // Update group's updatedAt
    await db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId).update({
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json(
      {
        id: docRef.id,
        message: 'Payment added successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding payment:', error);
    return NextResponse.json(
      { error: 'Failed to add payment' },
      { status: 500 }
    );
  }
});
