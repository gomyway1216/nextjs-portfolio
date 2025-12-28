import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureAdmin, verifyIdToken, isAdmin } from '@/lib/auth-utils';
import { HOBBIES_COLLECTION, HOBBY_ITEMS_COLLECTION } from '../../constants';
import type { HobbyCategory, UpdateHobbyCategoryInput, CustomField } from '@/types/hobby';
import { v4 as uuidv4 } from 'uuid';

interface RouteParams {
  params: Promise<{ hobbyId: string }>;
}

// Helper to extract token from request
function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// GET /api/hobbies/[hobbyId] - Get a single hobby category
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { hobbyId } = await params;
    const db = getFirestore();

    const docRef = db.collection(HOBBIES_COLLECTION).doc(hobbyId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Hobby not found' }, { status: 404 });
    }

    const data = doc.data()!;

    // Check if private and user is not admin
    if (!data.isPublic) {
      const token = getTokenFromRequest(request);
      if (!token) {
        return NextResponse.json({ error: 'Hobby not found' }, { status: 404 });
      }
      const decodedToken = await verifyIdToken(token);
      if (!decodedToken || !isAdmin(decodedToken)) {
        return NextResponse.json({ error: 'Hobby not found' }, { status: 404 });
      }
    }

    const hobby: HobbyCategory = {
      id: doc.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      icon: data.icon,
      coverImage: data.coverImage,
      templateType: data.templateType,
      isPublic: data.isPublic,
      order: data.order,
      fields: data.fields || [],
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
    };

    return NextResponse.json(hobby);
  } catch (error) {
    console.error('Error fetching hobby category:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hobby category' },
      { status: 500 }
    );
  }
}

// PUT /api/hobbies/[hobbyId] - Update a hobby category
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Verify admin authentication
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { hobbyId } = await params;
    const body: UpdateHobbyCategoryInput = await request.json();

    const db = getFirestore();
    const docRef = db.collection(HOBBIES_COLLECTION).doc(hobbyId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Hobby not found' }, { status: 404 });
    }

    // If slug is being changed, check for duplicates
    if (body.slug) {
      const existingSlug = await db.collection(HOBBIES_COLLECTION)
        .where('slug', '==', body.slug)
        .get();

      const duplicates = existingSlug.docs.filter(d => d.id !== hobbyId);
      if (duplicates.length > 0) {
        return NextResponse.json(
          { error: 'A hobby with this slug already exists' },
          { status: 400 }
        );
      }
    }

    // Process fields to ensure IDs
    let processedFields = body.fields;
    if (body.fields) {
      processedFields = body.fields.map((field, index) => ({
        ...field,
        id: field.id || uuidv4(),
        order: field.order ?? index + 1,
      })) as CustomField[];
    }

    const updateData: Record<string, unknown> = {
      updatedAt: getServerTimestamp(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.coverImage !== undefined) updateData.coverImage = body.coverImage;
    if (body.templateType !== undefined) updateData.templateType = body.templateType;
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic;
    if (body.order !== undefined) updateData.order = body.order;
    if (processedFields !== undefined) updateData.fields = processedFields;

    await docRef.update(updateData);

    return NextResponse.json({ message: 'Hobby category updated successfully' });
  } catch (error) {
    console.error('Error updating hobby category:', error);
    return NextResponse.json(
      { error: 'Failed to update hobby category' },
      { status: 500 }
    );
  }
}

// DELETE /api/hobbies/[hobbyId] - Delete a hobby category
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Verify admin authentication
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { hobbyId } = await params;
    const db = getFirestore();

    const docRef = db.collection(HOBBIES_COLLECTION).doc(hobbyId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Hobby not found' }, { status: 404 });
    }

    // Delete all items in this hobby category
    const itemsSnapshot = await db.collection(HOBBY_ITEMS_COLLECTION)
      .where('hobbyId', '==', hobbyId)
      .get();

    const batch = db.batch();
    itemsSnapshot.forEach((itemDoc) => {
      batch.delete(itemDoc.ref);
    });

    // Delete the hobby category
    batch.delete(docRef);

    await batch.commit();

    return NextResponse.json({ message: 'Hobby category and all items deleted successfully' });
  } catch (error) {
    console.error('Error deleting hobby category:', error);
    return NextResponse.json(
      { error: 'Failed to delete hobby category' },
      { status: 500 }
    );
  }
}
