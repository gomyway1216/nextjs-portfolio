import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { PROJECTS_COLLECTION } from '@/app/api/constants';

/**
 * GET /api/projects/[id]
 * Get a single project by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const db = getFirestore();

    const docRef = db.collection(PROJECTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const data = doc.data()!;

    const project = {
      id: doc.id,
      title: data.title,
      date: data.date?.toDate?.()?.toISOString() || data.date,
      description: data.description,
      client: data.client,
      industry: data.industry,
      thumbImage: data.thumbImage,
      images: data.images || [],
      urls: data.urls || [],
      technologies: data.technologies || [],
      categories: data.categories || [],
    };

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]
 * Update a project
 * Requires authentication
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, response } = await ensureValidUser(request);
    if (!user) {
      return response!;
    }

    const { id } = params;
    const body = await request.json();
    const {
      title,
      date,
      description,
      client,
      industry,
      thumbImage,
      images,
      urls,
      technologies,
      categories,
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const docRef = db.collection(PROJECTS_COLLECTION).doc(id);

    // Check if project exists
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    await docRef.update({
      title,
      date: date ? new Date(date) : new Date(),
      description,
      client: client || '',
      industry: industry || '',
      thumbImage: thumbImage || null,
      images: images || [],
      urls: urls || [],
      technologies: technologies || [],
      categories: categories || [],
    });

    return NextResponse.json({ message: 'Project updated successfully' });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Delete a project
 * Requires authentication
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, response } = await ensureValidUser(request);
    if (!user) {
      return response!;
    }

    const { id } = params;
    const db = getFirestore();
    const docRef = db.collection(PROJECTS_COLLECTION).doc(id);

    // Check if project exists
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    await docRef.delete();

    return NextResponse.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
