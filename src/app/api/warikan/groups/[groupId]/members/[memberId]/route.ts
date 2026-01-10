import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { WARIKAN_GROUPS_COLLECTION, WARIKAN_PAYMENTS_COLLECTION } from '../../../../../constants';
import type { UpdateMemberInput, Member } from '@/types/warikan';

interface RouteParams {
  params: Promise<{ groupId: string; memberId: string }>;
}

// PUT /api/warikan/groups/[groupId]/members/[memberId] - Update a member
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId, memberId } = await params;
    const body: UpdateMemberInput = await request.json();
    const db = getFirestore();

    const groupRef = db.collection(WARIKAN_GROUPS_COLLECTION).doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const groupData = groupDoc.data()!;
    const members: Member[] = groupData.members || [];

    const memberIndex = members.findIndex((m) => m.id === memberId);
    if (memberIndex === -1) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Update member fields
    if (body.name !== undefined) members[memberIndex].name = body.name;
    if (body.email !== undefined) members[memberIndex].email = body.email;
    if (body.weight !== undefined) members[memberIndex].weight = body.weight;
    if (body.isActive !== undefined) members[memberIndex].isActive = body.isActive;

    await groupRef.update({
      members,
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json({ message: 'Member updated successfully' });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json(
      { error: 'Failed to update member' },
      { status: 500 }
    );
  }
}

// DELETE /api/warikan/groups/[groupId]/members/[memberId] - Remove a member
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId, memberId } = await params;
    const db = getFirestore();

    const groupRef = db.collection(WARIKAN_GROUPS_COLLECTION).doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const groupData = groupDoc.data()!;
    const members: Member[] = groupData.members || [];

    const memberIndex = members.findIndex((m) => m.id === memberId);
    if (memberIndex === -1) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Check if member has any payments
    const paymentsSnapshot = await db
      .collection(WARIKAN_PAYMENTS_COLLECTION)
      .where('groupId', '==', groupId)
      .get();

    const memberHasPayments = paymentsSnapshot.docs.some((doc) => {
      const payment = doc.data();
      return (
        payment.payerId === memberId ||
        payment.participants.some((p: { memberId: string }) => p.memberId === memberId)
      );
    });

    if (memberHasPayments) {
      // Instead of deleting, mark as inactive
      members[memberIndex].isActive = false;
      await groupRef.update({
        members,
        updatedAt: getServerTimestamp(),
      });
      return NextResponse.json({
        message: 'Member marked as inactive (has existing payments)',
      });
    }

    // Remove the member entirely if no payments
    members.splice(memberIndex, 1);

    await groupRef.update({
      members,
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    );
  }
}
