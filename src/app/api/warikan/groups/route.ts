import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import {
  WARIKAN_GROUPS_COLLECTION,
  WARIKAN_USER_HISTORY_COLLECTION,
} from '../../constants';
import type { WarikanGroup, CreateGroupInput, Member, Currency } from '@/types/warikan';
import { v4 as uuidv4 } from 'uuid';
import { generateShareCode } from '@/lib/warikanAlgorithm';

// GET /api/warikan/groups - Get user's groups (requires auth)
export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to view history' },
        { status: 401 }
      );
    }

    const db = getFirestore();

    // Get user's group history
    const historySnapshot = await db
      .collection(WARIKAN_USER_HISTORY_COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('updatedAt', 'desc')
      .get();

    const groupIds = historySnapshot.docs.map((doc) => doc.data().groupId);

    if (groupIds.length === 0) {
      return NextResponse.json({
        groups: [],
        total: 0,
      });
    }

    // Fetch the actual groups
    const groups: WarikanGroup[] = [];
    for (const groupId of groupIds) {
      const groupDoc = await db.collection(WARIKAN_GROUPS_COLLECTION).doc(groupId).get();
      if (groupDoc.exists) {
        const data = groupDoc.data()!;
        groups.push({
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
        });
      }
    }

    return NextResponse.json({
      groups,
      total: groups.length,
    });
  } catch (error) {
    console.error('Error fetching warikan groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch warikan groups' },
      { status: 500 }
    );
  }
}

// POST /api/warikan/groups - Create a new group
export async function POST(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);
    const body: CreateGroupInput = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Generate unique share code
    let shareCode = generateShareCode();
    let attempts = 0;
    while (attempts < 10) {
      const existingCode = await db
        .collection(WARIKAN_GROUPS_COLLECTION)
        .where('shareCode', '==', shareCode)
        .get();

      if (existingCode.empty) break;
      shareCode = generateShareCode();
      attempts++;
    }

    // Create initial members from input
    const members: Member[] = (body.members || []).map((m) => ({
      id: uuidv4(),
      name: m.name,
      email: m.email,
      weight: m.weight ?? 1,
      joinedAt: new Date().toISOString(),
      isActive: true,
    }));

    // If user is logged in, add them as the first member if not already included
    if (user) {
      const userEmail = user.email;
      const userAlreadyMember = members.some((m) => m.email === userEmail);
      if (!userAlreadyMember && userEmail) {
        members.unshift({
          id: uuidv4(),
          name: user.email?.split('@')[0] || 'Me',
          userId: user.uid,
          email: userEmail,
          weight: 1,
          joinedAt: new Date().toISOString(),
          isActive: true,
        });
      } else {
        // Link existing member to user
        const existingMember = members.find((m) => m.email === userEmail);
        if (existingMember) {
          existingMember.userId = user.uid;
        }
      }
    }

    const newGroup = {
      name: body.name,
      description: body.description || '',
      currency: body.currency || 'JPY',
      exchangeRates: {},
      createdBy: user?.uid || null,
      shareCode,
      members,
      isSettled: false,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    };

    const docRef = await db.collection(WARIKAN_GROUPS_COLLECTION).add(newGroup);

    // If user is logged in, add to their history
    if (user) {
      await db.collection(WARIKAN_USER_HISTORY_COLLECTION).add({
        userId: user.uid,
        groupId: docRef.id,
        groupName: body.name,
        role: 'creator',
        totalPaid: 0,
        totalOwed: 0,
        currency: body.currency || 'JPY',
        isSettled: false,
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp(),
      });
    }

    return NextResponse.json(
      {
        id: docRef.id,
        shareCode,
        message: 'Warikan group created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating warikan group:', error);
    return NextResponse.json(
      { error: 'Failed to create warikan group' },
      { status: 500 }
    );
  }
}
