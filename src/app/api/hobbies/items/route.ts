import { ensureAdmin } from '@/lib/auth-utils';
import { getFirestore,getServerTimestamp } from '@/lib/firebase-admin';
import type { CreateHobbyItemInput } from '@/types/hobby';
import { NextRequest,NextResponse } from 'next/server';
import { HOBBIES_COLLECTION,HOBBY_ITEMS_COLLECTION,getCloudFunctionUrl } from '../../constants';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// Helper to extract token from request
function _getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// GET /api/hobbies/items - Get hobby items (proxies to Cloud Function)
export const GET = withActivityLog('next_api.hobbies.items.GET', async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(getCloudFunctionUrl('getHobbyItems'));

    // Forward query parameters to Cloud Function
    const params = ['hobbyId', 'sortType', 'search', 'limit', 'lastId', 'includePrivate'];
    params.forEach((param) => {
      const value = searchParams.get(param);
      if (value) url.searchParams.set(param, value);
    });

    console.log('[Hobby API] GET items:', url.toString());

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[Hobby API] Error from Cloud Function:', {
        status: response.status,
        error: data.error,
      });
      return NextResponse.json(
        { error: data.error || 'Failed to fetch hobby items' },
        { status: response.status }
      );
    }

    // Return in the format expected by the frontend
    return NextResponse.json({
      items: data.items,
      total: data.total,
      hasMore: data.hasMore,
      hobbyId: searchParams.get('hobbyId'),
    });
  } catch (error) {
    console.error('Error fetching hobby items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hobby items' },
      { status: 500 }
    );
  }
});

// POST /api/hobbies/items - Create a new hobby item
export const POST = withActivityLog('next_api.hobbies.items.POST', async (request: NextRequest) => {
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

    // Get the next order number (fetch all items for this hobby to avoid composite index)
    const existingItems = await db.collection(HOBBY_ITEMS_COLLECTION)
      .where('hobbyId', '==', body.hobbyId)
      .get();

    let maxOrder = 0;
    existingItems.forEach(doc => {
      const order = doc.data().order || 0;
      if (order > maxOrder) maxOrder = order;
    });
    const nextOrder = maxOrder + 1;

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
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
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
});
