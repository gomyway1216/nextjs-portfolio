import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser, getOptionalUser } from '@/lib/auth-utils';
import { POSTS_COLLECTION } from '@/app/api/constants';

/**
 * GET /api/posts
 * Get paginated posts with optional filtering by category and public status
 * Query params:
 * - category: string (default: 'all')
 * - isPublic: boolean (default: true)
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - lastVisibleTimestamp: number (optional, for pagination)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'all';
    const isPublic = searchParams.get('isPublic') === 'false' ? false : true;
    const page = parseInt(searchParams.get('page') || '1');
    const limitNumber = parseInt(searchParams.get('limit') || '10');
    const lastVisibleTimestamp = searchParams.get('lastVisibleTimestamp');

    // If fetching non-public posts, require authentication
    if (!isPublic) {
      const { user, response } = await ensureValidUser(request);
      if (!user) {
        return response!;
      }
    }

    const db = getFirestore();
    let query;

    if (category === 'all') {
      // Query all posts across categories using collectionGroup
      if (!lastVisibleTimestamp) {
        query = db.collectionGroup('posts')
          .where('isPublic', '==', isPublic)
          .orderBy('lastUpdated', 'desc')
          .limit(limitNumber);
      } else {
        const lastVisible = new Date(Number(lastVisibleTimestamp) * 1000);
        query = db.collectionGroup('posts')
          .where('isPublic', '==', isPublic)
          .orderBy('lastUpdated', 'desc')
          .startAfter(lastVisible)
          .limit(limitNumber);
      }
    } else {
      // Query posts from specific category
      if (!lastVisibleTimestamp) {
        query = db.collection(`${POSTS_COLLECTION}/${category}/posts`)
          .where('isPublic', '==', isPublic)
          .orderBy('lastUpdated', 'desc')
          .limit(limitNumber);
      } else {
        const lastVisible = new Date(Number(lastVisibleTimestamp) * 1000);
        query = db.collection(`${POSTS_COLLECTION}/${category}/posts`)
          .where('isPublic', '==', isPublic)
          .orderBy('lastUpdated', 'desc')
          .startAfter(lastVisible)
          .limit(limitNumber);
      }
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      return NextResponse.json({ posts: [], lastVisibleTimestamp: null });
    }

    const posts = snapshot.docs.map(doc => {
      const data = doc.data();
      // Determine the post's category based on the reference's path
      const postCategory = category !== 'all' ? category : doc.ref.path.split('/')[1];

      return {
        id: doc.id,
        title: data.title,
        body: data.body,
        isPublic: data.isPublic,
        category: postCategory,
        image: data.image,
        language: data.language,
        created: data.created?.toDate?.()?.toISOString() || data.created,
        lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || data.lastUpdated,
      };
    });

    // Get the last document's timestamp for pagination
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const newLastVisibleTimestamp = lastDoc.data().lastUpdated?.seconds ||
      Math.floor(new Date(lastDoc.data().lastUpdated).getTime() / 1000);

    return NextResponse.json({
      posts,
      lastVisibleTimestamp: newLastVisibleTimestamp,
      hasMore: snapshot.docs.length === limitNumber,
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/posts
 * Create a new post
 * Requires authentication
 */
export async function POST(request: NextRequest) {
  try {
    const { user, response } = await ensureValidUser(request);
    if (!user) {
      return response!;
    }

    const body = await request.json();
    const { title, isPublic, body: postBody, category, image, language } = body;

    if (!title || !category || !postBody) {
      return NextResponse.json(
        { error: 'Missing required fields: title, category, body' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const now = new Date();

    const docRef = await db.collection(`${POSTS_COLLECTION}/${category}/posts`).add({
      title,
      isPublic: isPublic ?? true,
      body: postBody,
      created: now,
      lastUpdated: now,
      image: image || null,
      language: language || 'en',
    });

    return NextResponse.json(
      { id: docRef.id, message: 'Post created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}
