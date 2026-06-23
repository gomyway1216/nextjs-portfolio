import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { WRITING_COLLECTION } from '@/app/api/constants';
import { parseWritingDoc } from '@/lib/writing';
import { logApiError } from '../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/writing
 * Public callers get published entries only; an admin token returns all
 * (including hidden drafts) so the admin table can manage them.
 */
export const GET = withActivityLog('next_api.writing.GET', async (request: NextRequest) => {
  try {
    // ensureAdmin never throws — a null user just means "not admin", which we
    // treat as the public view rather than returning its 401.
    const { user } = await ensureAdmin(request);
    const db = getFirestore();
    const snapshot = await db.collection(WRITING_COLLECTION).get();

    let writings = snapshot.docs.map((doc) => parseWritingDoc(doc.id, doc.data()));
    if (!user) {
      writings = writings.filter((w) => w.isPublic);
    }
    writings.sort((a, b) => a.order - b.order);

    return NextResponse.json({ writings });
  } catch (error) {
    console.error('Error fetching writing:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'WritingAPI:FetchError',
      message: 'Failed to fetch writing',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/writing',
    });
    return NextResponse.json({ error: 'Failed to fetch writing' }, { status: 500 });
  }
});

/**
 * POST /api/writing
 * Create a writing entry. Admin only.
 */
export const POST = withActivityLog('next_api.writing.POST', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const body = await request.json();
    const { title, source, url, date, summaryEn, summaryJa, isPublic, order } = body;

    if (!title || !source || !url) {
      return NextResponse.json(
        { error: 'Missing required fields: title, source, url' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const docRef = await db.collection(WRITING_COLLECTION).add({
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

    return NextResponse.json(
      { id: docRef.id, message: 'Writing created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating writing:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'WritingAPI:CreateError',
      message: 'Failed to create writing',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/writing',
    });
    return NextResponse.json({ error: 'Failed to create writing' }, { status: 500 });
  }
});
