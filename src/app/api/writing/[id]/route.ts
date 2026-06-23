import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { WRITING_COLLECTION } from '@/app/api/constants';
import { parseWritingDoc } from '@/lib/writing';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/writing/[id]
 */
export const GET = withActivityLog('next_api.writing.id.GET', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const db = getFirestore();
    const doc = await db.collection(WRITING_COLLECTION).doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Writing not found' }, { status: 404 });
    }

    return NextResponse.json({ writing: parseWritingDoc(doc.id, doc.data()!) });
  } catch (error) {
    console.error('Error fetching writing:', error);
    return NextResponse.json({ error: 'Failed to fetch writing' }, { status: 500 });
  }
});

/**
 * PUT /api/writing/[id]
 * Update a writing entry. Admin only.
 */
export const PUT = withActivityLog('next_api.writing.id.PUT', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { id } = await params;
    const body = await request.json();
    const { title, source, url, date, summaryEn, summaryJa, isPublic, order } = body;

    if (!title || !source || !url) {
      return NextResponse.json(
        { error: 'Missing required fields: title, source, url' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const docRef = db.collection(WRITING_COLLECTION).doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Writing not found' }, { status: 404 });
    }

    await docRef.update({
      title,
      source,
      url,
      date: date ? new Date(date) : null,
      summaryEn: summaryEn || '',
      summaryJa: summaryJa || '',
      isPublic: isPublic !== false,
      order: typeof order === 'number' ? order : 0,
    });

    revalidateTag('writing', 'max');

    return NextResponse.json({ message: 'Writing updated successfully' });
  } catch (error) {
    console.error('Error updating writing:', error);
    return NextResponse.json({ error: 'Failed to update writing' }, { status: 500 });
  }
});

/**
 * DELETE /api/writing/[id]
 * Delete a writing entry. Admin only.
 */
export const DELETE = withActivityLog('next_api.writing.id.DELETE', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { id } = await params;
    const db = getFirestore();
    const docRef = db.collection(WRITING_COLLECTION).doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Writing not found' }, { status: 404 });
    }

    await docRef.delete();

    revalidateTag('writing', 'max');

    return NextResponse.json({ message: 'Writing deleted successfully' });
  } catch (error) {
    console.error('Error deleting writing:', error);
    return NextResponse.json({ error: 'Failed to delete writing' }, { status: 500 });
  }
});
