import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getStorage } from '@/lib/firebase-admin';
import { PROFILE_COLLECTION } from '@/app/api/constants';
import { ensureAdmin } from '@/lib/auth-utils';

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

/**
 * POST /api/profile/resume
 * Upload a new resume PDF and update the Firestore link.
 * Admin-only. Stores the file under resume/{timestamp}-resume.pdf in
 * Firebase Storage and updates (or creates) the profile doc whose
 * `name` field is `resume`.
 */
export const POST = withActivityLog('next_api.profile.resume.POST', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      );
    }

    const storage = getStorage();
    const bucket = storage.bucket();
    const filePath = `resume/${Date.now()}-resume.pdf`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const fileRef = bucket.file(filePath);
    await fileRef.save(fileBuffer, {
      metadata: { contentType: 'application/pdf' },
    });
    await fileRef.makePublic();

    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    const db = getFirestore();
    const snapshot = await db
      .collection(PROFILE_COLLECTION)
      .where('name', '==', 'resume')
      .limit(1)
      .get();

    if (snapshot.empty) {
      await db.collection(PROFILE_COLLECTION).add({
        name: 'resume',
        value: downloadURL,
      });
    } else {
      await snapshot.docs[0].ref.update({ value: downloadURL });
    }

    return NextResponse.json(
      { downloadURL, message: 'Resume uploaded successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading resume:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to upload resume: ${errorMessage}` },
      { status: 500 }
    );
  }
});
