// Audio generation/deletion for a study article
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';

// POST /api/study/articles/[id]/audio - Generate audio for an article
export const POST = withActivityLog(
  'next_api.study.articles.id.audio.POST',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({} as Record<string, unknown>));
      const authHeader = request.headers.get('authorization');

      const response = await fetch(getCloudFunctionUrl('generateStudyArticleAudio'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader && { Authorization: authHeader }),
        },
        body: JSON.stringify({ id, ...body }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        await logCloudFunctionError({
          functionName: 'generateStudyArticleAudio',
          endpoint: `/api/study/articles/${id}/audio`,
          response: { status: response.status, error: data.error, details: data.details, message: data.message },
          metadata: { articleId: id },
        });
      }

      return NextResponse.json(data, { status: response.status });
    } catch (error) {
      console.error('Error generating article audio:', error);
      await logCloudFunctionError({
        functionName: 'generateStudyArticleAudio',
        endpoint: '/api/study/articles/[id]/audio',
        response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
      });
      return NextResponse.json(
        { success: false, error: 'Failed to generate audio' },
        { status: 500 },
      );
    }
  },
);

// DELETE /api/study/articles/[id]/audio - Delete the audio for an article
export const DELETE = withActivityLog(
  'next_api.study.articles.id.audio.DELETE',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const authHeader = request.headers.get('authorization');

      const response = await fetch(getCloudFunctionUrl('deleteStudyArticleAudio'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader && { Authorization: authHeader }),
        },
        body: JSON.stringify({ id }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        await logCloudFunctionError({
          functionName: 'deleteStudyArticleAudio',
          endpoint: `/api/study/articles/${id}/audio`,
          response: { status: response.status, error: data.error, details: data.details, message: data.message },
          metadata: { articleId: id },
        });
      }

      return NextResponse.json(data, { status: response.status });
    } catch (error) {
      console.error('Error deleting article audio:', error);
      await logCloudFunctionError({
        functionName: 'deleteStudyArticleAudio',
        endpoint: '/api/study/articles/[id]/audio',
        response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
      });
      return NextResponse.json(
        { success: false, error: 'Failed to delete audio' },
        { status: 500 },
      );
    }
  },
);
