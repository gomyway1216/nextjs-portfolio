import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * POST /api/images
 * Upload an image to Firebase Storage
 * Required form data:
 * - file: File (the image file)
 * - type: string (e.g., 'project', 'post')
 * - id: string (the ID of the entity)
 * Requires authentication
 */
export const POST = withActivityLog('next_api.image.POST', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    const id = formData.get('id') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!type || !id) {
      return NextResponse.json(
        { error: 'Missing required parameters: type, id' },
        { status: 400 }
      );
    }

    const storage = getStorage();
    const bucket = storage.bucket();

    // Create a unique file path
    const filePath = `${type}/${id}/${file.name}`;
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
      { downloadURL, message: 'Image uploaded successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to upload image: ${errorMessage}` },
      { status: 500 }
    );
  }
});
