import { ensureAdmin } from '@/lib/auth-utils';
import { getFirestore } from '@/lib/firebase-admin';
import { NextRequest,NextResponse } from 'next/server';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

const EDITABLE_STRING_FIELDS = [
  'passingYear',
  'degreeTitle',
  'instituteName',
  'duration',
  'degree',
  'school',
] as const;

type EditableStringField = (typeof EDITABLE_STRING_FIELDS)[number];

function extractUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const field of EDITABLE_STRING_FIELDS) {
    const value = body[field as EditableStringField];
    if (value !== undefined) {
      updates[field] = typeof value === 'string' ? value : '';
    }
  }

  if (typeof body.order === 'number' && Number.isFinite(body.order)) {
    updates.order = body.order;
  }

  return updates;
}

async function parseRequestBody(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
    }
    return parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}

/**
 * GET /api/education
 * Get all education entries
 */
export const GET = withActivityLog('next_api.education.GET', async (_request: NextRequest) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('education').get();

    const education = snapshot.docs.map(doc => {
      return {
        id: doc.id,
        ...doc.data(),
      };
    });

    return NextResponse.json({ education });
  } catch (error) {
    console.error('Error fetching education:', error);
    return NextResponse.json(
      { error: 'Failed to fetch education' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/education
 * Create a new education entry. Admin-only.
 */
export const POST = withActivityLog('next_api.education.POST', async (request: NextRequest) => {
  const { user, response: authResponse } = await ensureAdmin(request);
  if (!user) return authResponse;

  const body = await parseRequestBody(request);
  if (body instanceof NextResponse) return body;

  const degreeTitle = typeof body.degreeTitle === 'string'
    ? body.degreeTitle.trim()
    : typeof body.degree === 'string'
      ? body.degree.trim()
      : '';
  const instituteName = typeof body.instituteName === 'string'
    ? body.instituteName.trim()
    : typeof body.school === 'string'
      ? body.school.trim()
      : '';

  if (!degreeTitle || !instituteName) {
    return NextResponse.json(
      { error: 'degreeTitle and instituteName are required' },
      { status: 400 }
    );
  }

  try {
    const updates = extractUpdates(body);
    updates.degreeTitle = degreeTitle;
    updates.instituteName = instituteName;
    if (updates.passingYear === undefined && typeof body.duration === 'string') {
      updates.passingYear = body.duration;
    }
    if (updates.order === undefined) updates.order = 0;

    const db = getFirestore();
    const docRef = await db.collection('education').add(updates);

    return NextResponse.json(
      { id: docRef.id, message: `Created education entry for ${instituteName}` },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating education:', error);
    return NextResponse.json(
      { error: 'Failed to create education' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/education
 * Update an education entry by id. Admin-only.
 */
export const PUT = withActivityLog('next_api.education.PUT', async (request: NextRequest) => {
  const { user, response: authResponse } = await ensureAdmin(request);
  if (!user) return authResponse;

  const body = await parseRequestBody(request);
  if (body instanceof NextResponse) return body;

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return NextResponse.json(
      { error: 'id is required' },
      { status: 400 }
    );
  }

  const updates = extractUpdates(body);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No updatable fields provided' },
      { status: 400 }
    );
  }

  try {
    const db = getFirestore();
    const docRef = db.collection('education').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: `Education entry not found for id: ${id}` },
        { status: 404 }
      );
    }

    await docRef.update(updates);
    return NextResponse.json({ success: true, message: `Updated education entry ${id}` });
  } catch (error) {
    console.error('Error updating education:', error);
    return NextResponse.json(
      { error: 'Failed to update education' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/education?id=...
 * Delete an education entry by id. Admin-only.
 */
export const DELETE = withActivityLog('next_api.education.DELETE', async (request: NextRequest) => {
  const { user, response: authResponse } = await ensureAdmin(request);
  if (!user) return authResponse;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'id query param is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const docRef = db.collection('education').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: `Education entry not found for id: ${id}` },
        { status: 404 }
      );
    }

    await docRef.delete();
    return NextResponse.json({ success: true, message: `Deleted education entry ${id}` });
  } catch (error) {
    console.error('Error deleting education:', error);
    return NextResponse.json(
      { error: 'Failed to delete education' },
      { status: 500 }
    );
  }
});
