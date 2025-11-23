import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';

/**
 * GET /api/job
 * Get all jobs
 */
export async function GET(request: NextRequest) {
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
}

/**
 * PUT /api/job
 * Update a job by company name
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyName, technologies } = body;

    if (!companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
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
    await doc.ref.update({ technologies });

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
}
