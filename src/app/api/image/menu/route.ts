import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * POST /api/images/menu
 * Upload a menu/post image to Firebase Storage
 * Required form data:
 * - file: File (the image file)
 * Requires authentication
 */
export const POST = withActivityLog('next_api.image.menu.POST', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureValidUser(request);
    if (!user) {
      return response!;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const storage = getStorage();
    const bucket = storage.bucket();

    // Create a file path in the 'post' directory
    const filePath = `post/${file.name}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Upload the file
    const fileRef = bucket.file(filePath);
    await fileRef.save(fileBuffer, {
      metadata: {
        contentType: file.type,
      },
    });

    // Make the file publicly accessible
    await fileRef.makePublic();

    // Get the public URL
    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return NextResponse.json(
      { downloadURL, message: 'Menu image uploaded successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading menu image:', error);
    return NextResponse.json(
      { error: 'Failed to upload menu image' },
      { status: 500 }
    );
  }
});
