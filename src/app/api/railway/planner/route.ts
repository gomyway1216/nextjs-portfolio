import { NextRequest, NextResponse } from 'next/server';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { RAILWAY_PLANNER_DRAFTS_COLLECTION } from '@/app/api/constants';
import { ensureValidUser } from '@/lib/auth-utils';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';

const MAX_DRAFT_BYTES = 400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (isRecord(value) && typeof value.toDate === 'function') {
    const date = value.toDate() as unknown;
    return date instanceof Date ? date.toISOString() : null;
  }
  return typeof value === 'string' ? value : null;
}

async function getUserOrResponse(request: NextRequest) {
  const { user, response } = await ensureValidUser(request);
  if (response) return { user: null, response };
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }
  return { user, response: null };
}

export const GET = withActivityLog('next_api.railway.planner.GET', async (request: NextRequest) => {
  try {
    const { user, response } = await getUserOrResponse(request);
    if (response) return response;
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const db = getFirestore();
    const draftDoc = await db.collection(RAILWAY_PLANNER_DRAFTS_COLLECTION).doc(user.uid).get();
    if (!draftDoc.exists) {
      return NextResponse.json({ draft: null });
    }

    const data = draftDoc.data() ?? {};
    return NextResponse.json({
      draft: isRecord(data.draft) ? data.draft : null,
      updatedAt: toIsoString(data.updatedAt),
    });
  } catch (error) {
    console.error('Error fetching railway planner draft:', error);
    return NextResponse.json(
      { error: 'Failed to fetch railway planner draft' },
      { status: 500 },
    );
  }
});

export const PUT = withActivityLog('next_api.railway.planner.PUT', async (request: NextRequest) => {
  try {
    const { user, response } = await getUserOrResponse(request);
    if (response) return response;
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json() as { draft?: unknown };
    if (!isRecord(body.draft)) {
      return NextResponse.json({ error: 'Draft object is required' }, { status: 400 });
    }

    const draftJson = JSON.stringify(body.draft);
    if (new TextEncoder().encode(draftJson).length > MAX_DRAFT_BYTES) {
      return NextResponse.json({ error: 'Draft is too large' }, { status: 413 });
    }

    const db = getFirestore();
    const draftRef = db.collection(RAILWAY_PLANNER_DRAFTS_COLLECTION).doc(user.uid);
    const draftDoc = await draftRef.get();
    const timestamp = getServerTimestamp();

    await draftRef.set({
      userId: user.uid,
      draft: JSON.parse(draftJson) as Record<string, unknown>,
      schemaVersion: 2,
      updatedAt: timestamp,
      ...(draftDoc.exists ? {} : { createdAt: timestamp }),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving railway planner draft:', error);
    return NextResponse.json(
      { error: 'Failed to save railway planner draft' },
      { status: 500 },
    );
  }
});

export const DELETE = withActivityLog('next_api.railway.planner.DELETE', async (request: NextRequest) => {
  try {
    const { user, response } = await getUserOrResponse(request);
    if (response) return response;
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const db = getFirestore();
    await db.collection(RAILWAY_PLANNER_DRAFTS_COLLECTION).doc(user.uid).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting railway planner draft:', error);
    return NextResponse.json(
      { error: 'Failed to delete railway planner draft' },
      { status: 500 },
    );
  }
});
