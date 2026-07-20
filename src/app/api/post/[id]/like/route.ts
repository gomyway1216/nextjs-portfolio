import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';

/**
 * POST /api/post/[id]/like
 * Body: { action: 'like' | 'unlike' }
 * Anonymous likes for public posts — no account required, mirroring the
 * view beacon. The client keeps its own "have I liked this" state in
 * localStorage; the server just moves the counter. Like the view route,
 * it never revalidates cache tags: the button reads its count fresh and
 * the cached article payload doesn't carry it.
 *
 * A determined client can obviously inflate this. That's accepted for a
 * personal blog — the clamp below only guards the counter against going
 * negative, not against enthusiasm.
 */
export async function POST(request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Post id is required' }, { status: 400 });
    }

    let action: unknown;
    try {
      ({ action } = await request.json());
    } catch {
      action = 'like';
    }
    if (action !== 'like' && action !== 'unlike') {
      return NextResponse.json({ error: 'action must be "like" or "unlike"' }, { status: 400 });
    }

    const db = getFirestore();
    const docRef = db.collection(POSTS_COLLECTION).doc(id);

    const likeCount = await db.runTransaction(async (tx) => {
      const doc = await tx.get(docRef);
      // Same shape for missing and private: don't confirm draft existence.
      if (!doc.exists || !doc.data()?.isPublic) return null;

      const current = typeof doc.data()?.likeCount === 'number' ? doc.data()!.likeCount : 0;
      if (action === 'unlike' && current <= 0) return 0;

      tx.update(docRef, {
        likeCount: FieldValue.increment(action === 'like' ? 1 : -1),
      });
      return current + (action === 'like' ? 1 : -1);
    });

    if (likeCount === null) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ likeCount });
  } catch (error) {
    console.error('Error updating post likes:', error);
    return NextResponse.json({ error: 'Failed to update likes' }, { status: 500 });
  }
}

/**
 * GET /api/post/[id]/like
 * Current like count for a public post. Fetched by the button on mount so
 * the number stays live even though the article body is served from cache.
 */
export async function GET(_request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Post id is required' }, { status: 400 });
    }

    const doc = await getFirestore().collection(POSTS_COLLECTION).doc(id).get();
    if (!doc.exists || !doc.data()?.isPublic) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const likeCount = typeof doc.data()?.likeCount === 'number' ? doc.data()!.likeCount : 0;
    return NextResponse.json({ likeCount });
  } catch (error) {
    console.error('Error fetching post likes:', error);
    return NextResponse.json({ error: 'Failed to fetch likes' }, { status: 500 });
  }
}
