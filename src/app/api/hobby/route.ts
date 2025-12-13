import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin, getOptionalUser, verifyIdToken } from '@/lib/auth-utils';
import { HOBBIES_COLLECTION } from '../constants';
import type { HobbyCategory, CreateHobbyCategoryInput, CustomField } from '@/types/hobby';
import { v4 as uuidv4 } from 'uuid';

// GET /api/hobby - Get all hobby categories
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includePrivate = searchParams.get('includePrivate') === 'true';

    const db = getFirestore();
    let query = db.collection(HOBBIES_COLLECTION).orderBy('order', 'asc');

    // Only show public hobbies unless admin requests private ones
    if (!includePrivate) {
      query = query.where('isPublic', '==', true);
    } else {
      // Verify admin for private hobbies
      const { user } = await ensureAdmin(request);
      if (!user) {
        query = db.collection(HOBBIES_COLLECTION)
          .where('isPublic', '==', true)
          .orderBy('order', 'asc');
      }
    }

    const snapshot = await query.get();
    const categories: HobbyCategory[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      categories.push({
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
      });
    });

    return NextResponse.json({
      categories,
      total: categories.length,
    });
  } catch (error) {
    console.error('Error fetching hobby categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hobby categories' },
      { status: 500 }
    );
  }
}

// POST /api/hobby - Create a new hobby category
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const body: CreateHobbyCategoryInput = await request.json();

    // Validate required fields
    if (!body.name || !body.slug || !body.description || !body.templateType) {
      return NextResponse.json(
        { error: 'Missing required fields: name, slug, description, templateType' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    // Check if slug already exists
    const existingSlug = await db.collection(HOBBIES_COLLECTION)
      .where('slug', '==', body.slug)
      .get();

    if (!existingSlug.empty) {
      return NextResponse.json(
        { error: 'A hobby with this slug already exists' },
        { status: 400 }
      );
    }

    // Get the next order number
    const lastDoc = await db.collection(HOBBIES_COLLECTION)
      .orderBy('order', 'desc')
      .limit(1)
      .get();

    const nextOrder = lastDoc.empty ? 1 : (lastDoc.docs[0].data().order || 0) + 1;

    // Process fields to add IDs
    const fieldsWithIds: CustomField[] = (body.fields || []).map((field, index) => ({
      ...field,
      id: uuidv4(),
      order: field.order ?? index + 1,
    }));

    const newHobby = {
      name: body.name,
      slug: body.slug,
      description: body.description,
      icon: body.icon || '',
      coverImage: body.coverImage || '',
      templateType: body.templateType,
      isPublic: body.isPublic ?? false,
      order: body.order ?? nextOrder,
      fields: fieldsWithIds,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection(HOBBIES_COLLECTION).add(newHobby);

    return NextResponse.json({
      id: docRef.id,
      message: 'Hobby category created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating hobby category:', error);
    return NextResponse.json(
      { error: 'Failed to create hobby category' },
      { status: 500 }
    );
  }
}
