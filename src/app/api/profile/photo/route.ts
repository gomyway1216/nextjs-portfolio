import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { ensureAdmin } from '@/lib/auth-utils';
import { getFirestore, getStorage } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

const PROFILE_DOC_ID = 'main';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const extensionFromFile = (file: File) => {
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
};

const getManagedProfilePhotoPath = (imageUrl: unknown, bucketName: string) => {
  if (typeof imageUrl !== 'string' || !imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    let filePath: string | null = null;

    if (url.hostname === 'storage.googleapis.com') {
      const storagePrefix = `/${bucketName}/`;
      if (url.pathname.startsWith(storagePrefix)) {
        filePath = decodeURIComponent(url.pathname.slice(storagePrefix.length));
      }
    }

    if (url.hostname === 'firebasestorage.googleapis.com') {
      const firebasePrefix = `/v0/b/${bucketName}/o/`;
      if (url.pathname.startsWith(firebasePrefix)) {
        filePath = decodeURIComponent(url.pathname.slice(firebasePrefix.length));
      }
    }

    return filePath?.startsWith('profile/profile-photo-') ? filePath : null;
  } catch {
    return null;
  }
};

const deleteOldProfilePhoto = async (oldImageUrl: unknown, bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>) => {
  const oldPath = getManagedProfilePhotoPath(oldImageUrl, bucket.name);
  if (!oldPath) return;

  try {
    await bucket.file(oldPath).delete();
  } catch (error) {
    const maybeStorageError = error as { code?: number; message?: string };
    if (maybeStorageError.code !== 404) {
      console.warn('Failed to delete old profile photo:', maybeStorageError.message || error);
    }
  }
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
    const downloadToken = randomUUID();
    const db = getFirestore();
    const docRef = db.collection('profile').doc(PROFILE_DOC_ID);
    const existingProfile = await docRef.get();
    const previousProfileImageUrl = existingProfile.data()?.profileImageUrl;

    const fileRef = bucket.file(filePath);
    await fileRef.save(fileBuffer, {
      metadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;

    await docRef.set(
      {
        profileImageUrl: downloadURL,
        profileImageUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await deleteOldProfilePhoto(previousProfileImageUrl, bucket);

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
