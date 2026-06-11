import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { getOptionalUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import {
  SETTLI_GROUPS_COLLECTION,
  SETTLI_PAYMENTS_COLLECTION,
  SETTLI_USER_HISTORY_COLLECTION,
} from '../../../constants';
import type { SettliGroup, UpdateGroupInput, Member } from '@/types/settli';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

function isCreatorOrMember(
  uid: string | undefined,
  groupData: { createdBy?: string | null; members?: Member[] }
): boolean {
  if (!uid) return false;
  if (groupData.createdBy === uid) return true;
  return (groupData.members || []).some((m) => m.userId === uid);
}

// GET /api/settli/groups/[groupId] - Get a specific group
export const GET = withActivityLog(
  'next_api.settli.groups.groupId.GET',
  async (request: NextRequest, { params }: RouteParams) => {
    try {
      const { groupId } = await params;
      const db = getFirestore();

      const groupDoc = await db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId).get();

      if (!groupDoc.exists) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }

      const data = groupDoc.data()!;

      // Check passcode. The proof is the passcode itself, sent on every
      // request and hash-compared server-side — the previous
      // `?verified=true` query param trusted the client's claim and
      // could simply be appended to bypass the passcode entirely.
      const hasPasscode = data.hasPasscode || false;
      const suppliedPasscode = request.headers.get('x-share-passcode');
      const passcodeOk =
        !hasPasscode ||
        !data.passcodeHash ||
        (typeof suppliedPasscode === 'string' &&
          suppliedPasscode.length > 0 &&
          crypto.createHash('sha256').update(suppliedPasscode).digest('hex') === data.passcodeHash);

      // If passcode is set and not proven, return limited info
      if (!passcodeOk) {
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
);

// PUT /api/settli/groups/[groupId] - Update a group
// Requires the caller to be authenticated AND the creator or a linked member.
export const PUT = withActivityLog(
  'next_api.settli.groups.groupId.PUT',
  async (request: NextRequest, { params }: RouteParams) => {
    try {
      const { groupId } = await params;
      const user = await getOptionalUser(request);

      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      const db = getFirestore();
      const groupRef = db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }

      const groupData = groupDoc.data()!;

      if (!isCreatorOrMember(user.uid, groupData as { createdBy?: string | null; members?: Member[] })) {
        return NextResponse.json(
          { error: 'Only the creator or a member can update this group' },
          { status: 403 }
        );
      }

      const body: UpdateGroupInput = await request.json();
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

      // Apply the group update and any history-row renames in a single batch
      // so a partial rename (e.g. group renamed but a history doc update fails)
      // can't leave the data in an inconsistent state.
      const batch = db.batch();
      batch.update(groupRef, updateData);

      if (body.name) {
        const historySnapshot = await db
          .collection(SETTLI_USER_HISTORY_COLLECTION)
          .where('groupId', '==', groupId)
          .get();

        historySnapshot.docs.forEach((doc) => {
          batch.update(doc.ref, {
            groupName: body.name,
            updatedAt: getServerTimestamp(),
          });
        });
      }

      await batch.commit();

      return NextResponse.json({ message: 'Group updated successfully' });
    } catch (error) {
      console.error('Error updating settli group:', error);
      return NextResponse.json(
        { error: 'Failed to update settli group' },
        { status: 500 }
      );
    }
  }
);

// DELETE /api/settli/groups/[groupId] - Delete a group
// Only the authenticated creator can delete. Anonymous-created groups
// (createdBy === null) cannot be deleted via this endpoint.
export const DELETE = withActivityLog(
  'next_api.settli.groups.groupId.DELETE',
  async (request: NextRequest, { params }: RouteParams) => {
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

      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (!groupData.createdBy) {
        return NextResponse.json(
          { error: 'This group has no recorded creator and cannot be deleted via the API' },
          { status: 403 }
        );
      }

      if (user.uid !== groupData.createdBy) {
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
);
