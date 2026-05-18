import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
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
 * PUT /api/job
 * Update a job by company name
 * SECURITY: Requires authentication
 */
export const PUT = withActivityLog('next_api.job.PUT', async (request: NextRequest) => {
  // SECURITY: Require admin for job updates
  const { user, response: authResponse } = await ensureAdmin(request);
  if (!user) {
    return authResponse;
  }

  try {
    const body = await request.json();
    const { companyName, technologies, hidden } = body;

    if (!companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (technologies !== undefined) updates.technologies = technologies;
    if (hidden !== undefined) updates.hidden = !!hidden;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updatable fields provided' },
        { status: 400 }
      );
    }

    const db = getFirestore();
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

    // Update the first matching document
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
