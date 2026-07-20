import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';

/**
 * POST /api/post/[id]/view
 * Record one view of a public post. Called as a fire-and-forget beacon
 * from the post page after render, so it must never interfere with the
 * cached server-render path: it only writes the counter and does not
 * revalidate any cache tags (viewCount is read fresh by the admin list,
 * not from the cached public payload).
 *
 * Unauthenticated by design — views come from anonymous readers. Only
 * public posts are counted, so drafts can't be probed through this
 * endpoint, and a bad id is a cheap single-doc read.
 */
export async function POST(_request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Post id is required' }, { status: 400 });
    }

    const docRef = getFirestore().collection(POSTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists || !doc.data()?.isPublic) {
      // 204 either way: the beacon caller can't act on errors, and a
      // distinct status for private posts would leak draft existence.
      return new NextResponse(null, { status: 204 });
    }

    await docRef.update({ viewCount: FieldValue.increment(1) });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error recording post view:', error);
    // Still a quiet response — a lost view is not worth surfacing.
    return new NextResponse(null, { status: 204 });
  }
}
