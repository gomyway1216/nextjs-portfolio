import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { WARIKAN_GROUPS_COLLECTION, WARIKAN_USER_HISTORY_COLLECTION } from '../../../../constants';
import type { CreateMemberInput, Member } from '@/types/warikan';
import { v4 as uuidv4 } from 'uuid';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/warikan/groups/[groupId]/members - Add a new member
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId } = await params;
    const body: CreateMemberInput = await request.json();
    const user = await getOptionalUser(request);
    const db = getFirestore();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Member name is required' },
        { status: 400 }
      );
    }

    const groupRef = db.collection(WARIKAN_GROUPS_COLLECTION).doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const groupData = groupDoc.data()!;
    const members: Member[] = groupData.members || [];

    // Check if email already exists
    if (body.email) {
      const existingMember = members.find((m) => m.email === body.email);
      if (existingMember) {
        return NextResponse.json(
          { error: 'A member with this email already exists' },
          { status: 400 }
        );
      }
    }

    const newMember: Member = {
      id: uuidv4(),
      name: body.name,
      email: body.email,
      weight: body.weight ?? 1,
      joinedAt: new Date().toISOString(),
      isActive: true,
    };

    // If logged in user is adding themselves
    if (user && body.email === user.email) {
      newMember.userId = user.uid;
    }

    members.push(newMember);

    await groupRef.update({
      members,
      updatedAt: getServerTimestamp(),
    });

    // If user added themselves and they're logged in, add to history
    if (user && body.email === user.email) {
      const existingHistory = await db
        .collection(WARIKAN_USER_HISTORY_COLLECTION)
        .where('userId', '==', user.uid)
        .where('groupId', '==', groupId)
        .get();

      if (existingHistory.empty) {
        await db.collection(WARIKAN_USER_HISTORY_COLLECTION).add({
          userId: user.uid,
          groupId,
          groupName: groupData.name,
          role: 'member',
          totalPaid: 0,
          totalOwed: 0,
          currency: groupData.currency,
          isSettled: groupData.isSettled || false,
          createdAt: getServerTimestamp(),
          updatedAt: getServerTimestamp(),
        });
      }
    }

    return NextResponse.json(
      {
        id: newMember.id,
        message: 'Member added successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding member:', error);
    return NextResponse.json(
      { error: 'Failed to add member' },
      { status: 500 }
    );
  }
}
