import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureAdmin, verifyIdToken, isAdmin } from '@/lib/auth-utils';
import { HOBBY_ITEMS_COLLECTION } from '../../../constants';
import type { HobbyItem, UpdateHobbyItemInput } from '@/types/hobby';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

// Helper to extract token from request
function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// GET /api/hobbies/items/[itemId] - Get a single hobby item
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { itemId } = await params;
    const db = getFirestore();

    const docRef = db.collection(HOBBY_ITEMS_COLLECTION).doc(itemId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const data = doc.data()!;

    // Check if private and user is not admin
    if (!data.isPublic) {
      const token = getTokenFromRequest(request);
      if (!token) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }
      const decodedToken = await verifyIdToken(token);
      if (!decodedToken || !isAdmin(decodedToken)) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }
    }

    const item: HobbyItem = {
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
    };

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching hobby item:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hobby item' },
      { status: 500 }
    );
  }
}

// PUT /api/hobbies/items/[itemId] - Update a hobby item
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Verify admin authentication
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { itemId } = await params;
    const body: UpdateHobbyItemInput = await request.json();

    const db = getFirestore();
    const docRef = db.collection(HOBBY_ITEMS_COLLECTION).doc(itemId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: getServerTimestamp(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.images !== undefined) updateData.images = body.images;
    if (body.thumbImage !== undefined) updateData.thumbImage = body.thumbImage;
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic;
    if (body.order !== undefined) updateData.order = body.order;
    if (body.customFields !== undefined) updateData.customFields = body.customFields;
    if (body.tags !== undefined) updateData.tags = body.tags;

    await docRef.update(updateData);

    return NextResponse.json({ message: 'Hobby item updated successfully' });
  } catch (error) {
    console.error('Error updating hobby item:', error);
    return NextResponse.json(
      { error: 'Failed to update hobby item' },
      { status: 500 }
    );
  }
}

// DELETE /api/hobbies/items/[itemId] - Delete a hobby item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Verify admin authentication
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { itemId } = await params;
    const db = getFirestore();

    const docRef = db.collection(HOBBY_ITEMS_COLLECTION).doc(itemId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ message: 'Hobby item deleted successfully' });
  } catch (error) {
    console.error('Error deleting hobby item:', error);
    return NextResponse.json(
      { error: 'Failed to delete hobby item' },
      { status: 500 }
    );
  }
}
