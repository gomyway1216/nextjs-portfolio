import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import {
  WARIKAN_GROUPS_COLLECTION,
  WARIKAN_PAYMENTS_COLLECTION,
} from '../../../../../constants';
import type { UpdatePaymentInput, Payment } from '@/types/warikan';

interface RouteParams {
  params: Promise<{ groupId: string; paymentId: string }>;
}

// GET /api/warikan/groups/[groupId]/payments/[paymentId] - Get a specific payment
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId, paymentId } = await params;
    const db = getFirestore();

    const paymentDoc = await db.collection(WARIKAN_PAYMENTS_COLLECTION).doc(paymentId).get();

    if (!paymentDoc.exists) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const data = paymentDoc.data()!;

    // Verify payment belongs to this group
    if (data.groupId !== groupId) {
      return NextResponse.json({ error: 'Payment not found in this group' }, { status: 404 });
    }

    const payment: Payment = {
      id: paymentDoc.id,
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

    return NextResponse.json(payment);
  } catch (error) {
    console.error('Error fetching payment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment' },
      { status: 500 }
    );
  }
}

// PUT /api/warikan/groups/[groupId]/payments/[paymentId] - Update a payment
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId, paymentId } = await params;
    const body: UpdatePaymentInput = await request.json();
    const db = getFirestore();

    const paymentRef = db.collection(WARIKAN_PAYMENTS_COLLECTION).doc(paymentId);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const paymentData = paymentDoc.data()!;

    // Verify payment belongs to this group
    if (paymentData.groupId !== groupId) {
      return NextResponse.json({ error: 'Payment not found in this group' }, { status: 404 });
    }

    // If updating payer or participants, validate they exist in the group
    if (body.payerId || body.participants) {
      const groupDoc = await db.collection(WARIKAN_GROUPS_COLLECTION).doc(groupId).get();
      if (!groupDoc.exists) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }
      const members = groupDoc.data()!.members || [];

      if (body.payerId) {
        const payerExists = members.some((m: { id: string }) => m.id === body.payerId);
        if (!payerExists) {
          return NextResponse.json({ error: 'Payer not found in group' }, { status: 400 });
        }
      }

      if (body.participants) {
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
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: getServerTimestamp(),
    };

    if (body.payerId !== undefined) updateData.payerId = body.payerId;
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.date !== undefined) updateData.date = new Date(body.date);
    if (body.splitType !== undefined) updateData.splitType = body.splitType;
    if (body.participants !== undefined) updateData.participants = body.participants;

    await paymentRef.update(updateData);

    // Update group's updatedAt
    await db.collection(WARIKAN_GROUPS_COLLECTION).doc(groupId).update({
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json({ message: 'Payment updated successfully' });
  } catch (error) {
    console.error('Error updating payment:', error);
    return NextResponse.json(
      { error: 'Failed to update payment' },
      { status: 500 }
    );
  }
}

// DELETE /api/warikan/groups/[groupId]/payments/[paymentId] - Delete a payment
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId, paymentId } = await params;
    const db = getFirestore();

    const paymentRef = db.collection(WARIKAN_PAYMENTS_COLLECTION).doc(paymentId);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const paymentData = paymentDoc.data()!;

    // Verify payment belongs to this group
    if (paymentData.groupId !== groupId) {
      return NextResponse.json({ error: 'Payment not found in this group' }, { status: 404 });
    }

    await paymentRef.delete();

    // Update group's updatedAt
    await db.collection(WARIKAN_GROUPS_COLLECTION).doc(groupId).update({
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment' },
      { status: 500 }
    );
  }
}
