import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import {
  SETTLI_GROUPS_COLLECTION,
  SETTLI_USER_HISTORY_COLLECTION,
} from '../../constants';
import type { SettliGroup, CreateGroupInput, Member } from '@/types/settli';
import { v4 as uuidv4 } from 'uuid';
import { generateShareCode } from '@/lib/settliAlgorithm';
import * as crypto from 'crypto';

// Simple hash function for passcode
function simpleHash(passcode: string): string {
  return crypto.createHash('sha256').update(passcode).digest('hex');
}

// Verify passcode against hash
export function verifyPasscode(passcode: string, hash: string): boolean {
  return simpleHash(passcode) === hash;
}

// GET /api/settli/groups - Get user's groups (requires auth)
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
      .collection(SETTLI_USER_HISTORY_COLLECTION)
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
    const groups: SettliGroup[] = [];
    for (const groupId of groupIds) {
      const groupDoc = await db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId).get();
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
          hasPasscode: data.hasPasscode || false,
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
    console.error('Error fetching settli groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settli groups' },
      { status: 500 }
    );
  }
}

// POST /api/settli/groups - Create a new group
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
        .collection(SETTLI_GROUPS_COLLECTION)
        .where('shareCode', '==', shareCode)
        .get();

      if (existingCode.empty) break;
      shareCode = generateShareCode();
      attempts++;
    }

    // Create initial members from input
    // Note: Firestore doesn't accept undefined values, so we omit email if not provided
    const members: Member[] = (body.members || []).map((m) => {
      const member: Member = {
        id: uuidv4(),
        name: m.name,
        weight: m.weight ?? 1,
        joinedAt: new Date().toISOString(),
        isActive: true,
      };
      if (m.email) {
        member.email = m.email;
      }
      return member;
    });

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

    // Hash passcode if provided (simple hash for now)
    const hasPasscode = !!body.passcode;
    const passcodeHash = body.passcode ? simpleHash(body.passcode) : null;

    const newGroup = {
      name: body.name,
      description: body.description || '',
      currency: body.currency || 'JPY',
      exchangeRates: {},
      createdBy: user?.uid || null,
      shareCode,
      hasPasscode,
      passcodeHash,
      members,
      isSettled: false,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    };

    const docRef = await db.collection(SETTLI_GROUPS_COLLECTION).add(newGroup);

    // If user is logged in, add to their history
    if (user) {
      await db.collection(SETTLI_USER_HISTORY_COLLECTION).add({
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
        message: 'Settli group created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating settli group:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create settli group', details: errorMessage },
      { status: 500 }
    );
  }
}
