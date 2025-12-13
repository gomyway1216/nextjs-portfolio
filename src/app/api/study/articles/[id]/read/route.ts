// Mark Article as Read API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

// POST /api/study/articles/[id]/read - Mark article as read
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('markArticleAsRead'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify({ articleId: id, ...body }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'markArticleAsRead',
        endpoint: `/api/study/articles/${id}/read`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error marking article as read:', error);
    await logCloudFunctionError({
      functionName: 'markArticleAsRead',
      endpoint: '/api/study/articles/[id]/read',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to mark as read' },
      { status: 500 }
    );
  }
}
