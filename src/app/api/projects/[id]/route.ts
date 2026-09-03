import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { PROJECTS_COLLECTION } from '@/app/api/constants';
import { resolveProjectRouteId } from '@/lib/projectRoutes';
import { getProjectServer } from '@/lib/projects/getProjectsServer';
import { revalidateTag } from 'next/cache';
import { HOME_PROJECTS_CACHE_TAG } from '@/lib/home/cacheTags';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/projects/[id]
 * Get a single project by ID
 */
export const GET = withActivityLog('next_api.projects.id.GET', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const project = await getProjectServer(id);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/projects/[id]
 * Update a project
 * Requires authentication
 */
export const PUT = withActivityLog('next_api.projects.id.PUT', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { id: routeId } = await params;
    const id = resolveProjectRouteId(routeId);
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
    revalidateTag(HOME_PROJECTS_CACHE_TAG, 'max');

    return NextResponse.json({ message: 'Project updated successfully' });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/projects/[id]
 * Delete a project
 * Requires authentication
 */
export const DELETE = withActivityLog('next_api.projects.id.DELETE', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { id: routeId } = await params;
    const id = resolveProjectRouteId(routeId);
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
    revalidateTag(HOME_PROJECTS_CACHE_TAG, 'max');

    return NextResponse.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
});
