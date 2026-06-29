import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { PROJECTS_COLLECTION } from '@/app/api/constants';
import { logApiError } from '../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';
import { getProjectsServer } from '@/lib/projects/getProjectsServer';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/projects
 * Get all projects
 */
export const GET = withActivityLog('next_api.projects.GET', async () => {
  const endpoint = '/api/projects';
  try {
    const projects = await getProjectsServer();

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'ProjectsAPI:FetchError',
      message: 'Failed to fetch projects',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/projects
 * Create a new project
 * Requires authentication
 */
export const POST = withActivityLog('next_api.projects.POST', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

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

    const docRef = await db.collection(PROJECTS_COLLECTION).add({
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

    return NextResponse.json(
      { id: docRef.id, message: 'Project created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating project:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'ProjectsAPI:CreateError',
      message: 'Failed to create project',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/projects',
    });
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
});
