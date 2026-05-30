import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

// Fields the PUT/POST endpoints accept. companyName is the lookup key
// for PUT and a required field for POST; the rest are optional updates.
const EDITABLE_STRING_FIELDS = [
  'companyName',
  'jobPosition',
  'jobPositionJa',
  'jobDuration',
  'jobType',
  'jobTypeJa',
  'jobDescription',
  'jobDescriptionJa',
] as const;

type EditableStringField = (typeof EDITABLE_STRING_FIELDS)[number];

function extractUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const field of EDITABLE_STRING_FIELDS) {
    const value = body[field as EditableStringField];
    if (value !== undefined) {
      // Allow empty string to clear a field
      updates[field] = typeof value === 'string' ? value : '';
    }
  }

  if (Array.isArray(body.technologies)) {
    updates.technologies = body.technologies;
  }
  if (body.hidden !== undefined) {
    updates.hidden = !!body.hidden;
  }
  if (typeof body.order === 'number' && Number.isFinite(body.order)) {
    updates.order = body.order;
  }

  return updates;
}

/**
 * GET /api/job
 * Get all jobs
 */
export const GET = withActivityLog('next_api.job.GET', async (request: NextRequest) => {
  try {
    const db = getFirestore();
    console.log('[API /job] Attempting to fetch jobs from Firestore...');

    const snapshot = await db.collection('job').get();
    console.log(`[API /job] Found ${snapshot.docs.length} job documents`);

    const jobs = snapshot.docs.map(doc => {
      const data = doc.data();
      console.log(`[API /job] Job: ${data.companyName || 'Unknown'}`);
      return {
        id: doc.id,
        ...data,
      };
    });

    console.log('[API /job] Successfully returning jobs');
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[API /job] Error fetching jobs:', error);
    console.error('[API /job] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: 'Failed to fetch jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/job
 * Create a new job entry. Admin-only.
 * Body: at minimum { companyName, jobPosition }.
 */
export const POST = withActivityLog('next_api.job.POST', async (request: NextRequest) => {
  const { user, response: authResponse } = await ensureAdmin(request);
  if (!user) return authResponse;

  try {
    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const jobPosition = typeof body.jobPosition === 'string' ? body.jobPosition.trim() : '';

    if (!companyName || !jobPosition) {
      return NextResponse.json(
        { error: 'companyName and jobPosition are required' },
        { status: 400 }
      );
    }

    const updates = extractUpdates(body);
    updates.companyName = companyName;
    updates.jobPosition = jobPosition;
    if (updates.order === undefined) updates.order = 0;
    if (updates.hidden === undefined) updates.hidden = false;

    const db = getFirestore();
    const docRef = await db.collection('job').add(updates);

    return NextResponse.json(
      { id: docRef.id, message: `Created job for ${companyName}` },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/job
 * Update a job's editable fields.
 *
 * The job is located by `id` (preferred) or by `companyName` for
 * backwards compatibility with the older toggle-hidden / edit-tech
 * handlers.
 */
export const PUT = withActivityLog('next_api.job.PUT', async (request: NextRequest) => {
  const { user, response: authResponse } = await ensureAdmin(request);
  if (!user) return authResponse;

  try {
    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const id = typeof body.id === 'string' ? body.id : undefined;
    const companyName = typeof body.companyName === 'string' ? body.companyName : undefined;

    if (!id && !companyName) {
      return NextResponse.json(
        { error: 'id or companyName is required' },
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

    const db = getFirestore();

    if (id) {
      const docRef = db.collection('job').doc(id);
      const snap = await docRef.get();
      if (!snap.exists) {
        return NextResponse.json(
          { error: `Job not found for id: ${id}` },
          { status: 404 }
        );
      }
      await docRef.update(updates);
      return NextResponse.json({ success: true, message: `Updated job ${id}` });
    }

    // Fallback: lookup by companyName (legacy toggle/tech-edit calls).
    const snapshot = await db
      .collection('job')
      .where('companyName', '==', companyName)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        { error: `Job not found for company: ${companyName}` },
        { status: 404 }
      );
    }

    const doc = snapshot.docs[0];
    await doc.ref.update(updates);

    return NextResponse.json({
      success: true,
      message: `Updated job for ${companyName}`
    });
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { error: 'Failed to update job' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/job?id=...
 * Delete a job entry by id. Admin-only.
 */
export const DELETE = withActivityLog('next_api.job.DELETE', async (request: NextRequest) => {
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
    const docRef = db.collection('job').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: `Job not found for id: ${id}` },
        { status: 404 }
      );
    }

    await docRef.delete();
    return NextResponse.json({ success: true, message: `Deleted job ${id}` });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
});
