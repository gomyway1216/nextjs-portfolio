import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { PROFILE_COLLECTION } from '@/app/api/constants';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/profile/resume
 * Get resume link from profile
 */
export const GET = withActivityLog('next_api.profile.resume.GET', async (request: NextRequest) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(PROFILE_COLLECTION).get();

    let resumeLink = '';

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Check if the document's 'name' field is 'resume'
      if (data.name === 'resume') {
        // Assign the value of the 'value' field to resumeLink
        resumeLink = data.value;
      }
    });

    if (!resumeLink) {
      return NextResponse.json(
        { error: 'Resume link not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ resumeLink });
  } catch (error) {
    console.error('Error fetching resume link:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resume link' },
      { status: 500 }
    );
  }
});
