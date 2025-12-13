import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin, verifyIdToken, isAdmin } from '@/lib/auth-utils';
import { HOBBIES_COLLECTION, HOBBY_ITEMS_COLLECTION } from '../../constants';
import type { HobbyItem, CreateHobbyItemInput } from '@/types/hobby';

// Helper to extract token from request
function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// GET /api/hobby/items - Get hobby items
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hobbyId = searchParams.get('hobbyId');
    const includePrivate = searchParams.get('includePrivate') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!hobbyId) {
      return NextResponse.json(
        { error: 'hobbyId query parameter is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Verify the hobby exists
    const hobbyDoc = await db.collection(HOBBIES_COLLECTION).doc(hobbyId).get();
    if (!hobbyDoc.exists) {
      return NextResponse.json({ error: 'Hobby not found' }, { status: 404 });
    }

    let query = db.collection(HOBBY_ITEMS_COLLECTION)
      .where('hobbyId', '==', hobbyId)
      .orderBy('order', 'asc');

    // Only show public items unless admin requests private ones
    let isAdminUser = false;
    if (includePrivate) {
      const token = getTokenFromRequest(request);
      if (token) {
        const decodedToken = await verifyIdToken(token);
        if (decodedToken && isAdmin(decodedToken)) {
          isAdminUser = true;
        }
      }
    }

    if (!isAdminUser) {
      query = query.where('isPublic', '==', true);
    }

    const snapshot = await query.offset(offset).limit(limit).get();
    const items: HobbyItem[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        hobbyId: data.hobbyId,
        title: data.title,
        description: data.description,
        images: data.images || [],
        thumbImage: data.thumbImage || '',
        isPublic: data.isPublic,
        order: data.order,
        customFields: data.customFields || {},
        tags: data.tags || [],
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      });
    });

    // Get total count
    const countQuery = isAdminUser
      ? db.collection(HOBBY_ITEMS_COLLECTION).where('hobbyId', '==', hobbyId)
      : db.collection(HOBBY_ITEMS_COLLECTION)
          .where('hobbyId', '==', hobbyId)
          .where('isPublic', '==', true);

    const countSnapshot = await countQuery.count().get();
    const total = countSnapshot.data().count;

    return NextResponse.json({
      items,
      total,
      hobbyId,
    });
  } catch (error) {
    console.error('Error fetching hobby items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hobby items' },
      { status: 500 }
    );
  }
}

// POST /api/hobby/items - Create a new hobby item
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const body: CreateHobbyItemInput = await request.json();

    // Validate required fields
    if (!body.hobbyId || !body.title) {
      return NextResponse.json(
        { error: 'Missing required fields: hobbyId, title' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Verify the hobby exists
    const hobbyDoc = await db.collection(HOBBIES_COLLECTION).doc(body.hobbyId).get();
    if (!hobbyDoc.exists) {
      return NextResponse.json({ error: 'Hobby not found' }, { status: 404 });
    }

    // Get the next order number
    const lastDoc = await db.collection(HOBBY_ITEMS_COLLECTION)
      .where('hobbyId', '==', body.hobbyId)
      .orderBy('order', 'desc')
      .limit(1)
      .get();

    const nextOrder = lastDoc.empty ? 1 : (lastDoc.docs[0].data().order || 0) + 1;

    const newItem = {
      hobbyId: body.hobbyId,
      title: body.title,
      description: body.description || '',
      images: body.images || [],
      thumbImage: body.thumbImage || '',
      isPublic: body.isPublic ?? false,
      order: body.order ?? nextOrder,
      customFields: body.customFields || {},
      tags: body.tags || [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection(HOBBY_ITEMS_COLLECTION).add(newItem);

    return NextResponse.json({
      id: docRef.id,
      message: 'Hobby item created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating hobby item:', error);
    return NextResponse.json(
      { error: 'Failed to create hobby item' },
      { status: 500 }
    );
  }
}
