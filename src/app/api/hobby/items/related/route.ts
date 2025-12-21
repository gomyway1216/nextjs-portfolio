import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, isAdmin } from '@/lib/auth-utils';
import { HOBBY_ITEMS_COLLECTION } from '../../../constants';
import type { HobbyItem } from '@/types/hobby';

// Helper to extract token from request
function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// GET /api/hobby/items/related - Get related items
// Query params:
// - hobbyId: The hobby category containing the items that reference another item
// - fieldName: The name of the RELATION field (e.g., 'animeId', 'voiceActorId')
// - targetItemId: The ID of the item being referenced
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hobbyId = searchParams.get('hobbyId');
    const fieldName = searchParams.get('fieldName');
    const targetItemId = searchParams.get('targetItemId');
    const includePrivate = searchParams.get('includePrivate') === 'true';

    if (!hobbyId || !fieldName || !targetItemId) {
      return NextResponse.json(
        { error: 'hobbyId, fieldName, and targetItemId query parameters are required' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Check if user is admin
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

    // Fetch all items for the hobby
    const snapshot = await db.collection(HOBBY_ITEMS_COLLECTION)
      .where('hobbyId', '==', hobbyId)
      .get();

    let items: HobbyItem[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Check if this item has the RELATION field pointing to the target
      const customFields = data.customFields || {};
      const relationValue = customFields[fieldName];

      // Handle both single and multiple relations
      let matchesTarget = false;
      if (Array.isArray(relationValue)) {
        matchesTarget = relationValue.includes(targetItemId);
      } else {
        matchesTarget = relationValue === targetItemId;
      }

      if (matchesTarget) {
        items.push({
          id: doc.id,
          hobbyId: data.hobbyId,
          title: data.title,
          description: data.description,
          images: data.images || [],
          thumbImage: data.thumbImage || '',
          isPublic: data.isPublic,
          order: data.order ?? 0,
          customFields: data.customFields || {},
          tags: data.tags || [],
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        });
      }
    });

    // Filter by public unless admin
    if (!isAdminUser) {
      items = items.filter(item => item.isPublic);
    }

    // Sort by order
    items.sort((a, b) => a.order - b.order);

    return NextResponse.json({
      items,
      total: items.length,
    });
  } catch (error) {
    console.error('Error fetching related items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch related items' },
      { status: 500 }
    );
  }
}
