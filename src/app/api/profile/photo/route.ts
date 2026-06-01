import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { ensureAdmin } from '@/lib/auth-utils';
import { getFirestore, getStorage } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

const PROFILE_DOC_ID = 'main';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const extensionFromFile = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension;

  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
};

/**
 * POST /api/profile/photo
 * Upload a profile photo to Firebase Storage and update profile/main.
 */
export const POST = withActivityLog('next_api.profile.photo.POST', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'File must be a JPG, PNG, WebP, or GIF image' },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'Image must be smaller than 8MB' },
        { status: 400 }
      );
    }

    const storage = getStorage();
    const bucket = storage.bucket();
    const extension = extensionFromFile(file);
    const filePath = `profile/profile-photo-${Date.now()}.${extension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const fileRef = bucket.file(filePath);
    await fileRef.save(fileBuffer, {
      metadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    await fileRef.makePublic();

    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    const db = getFirestore();
    await db.collection('profile').doc(PROFILE_DOC_ID).set(
      {
        profileImageUrl: downloadURL,
        profileImageUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json(
      { downloadURL, message: 'Profile photo uploaded successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading profile photo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to upload profile photo: ${errorMessage}` },
      { status: 500 }
    );
  }
});
