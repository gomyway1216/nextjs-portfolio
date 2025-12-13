// Study Article Chat API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

// GET /api/study/articles/[id]/chat - Get chat history for an article
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const url = new URL(getCloudFunctionUrl('getArticleChat'));
    url.searchParams.set('articleId', id);

    const response = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getArticleChat',
        endpoint: `/api/study/articles/${id}/chat`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching chat:', error);
    await logCloudFunctionError({
      functionName: 'getArticleChat',
      endpoint: '/api/study/articles/[id]/chat',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch chat' },
      { status: 500 }
    );
  }
}

// POST /api/study/articles/[id]/chat - Send a message in article chat
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('chatWithArticle'), {
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
        functionName: 'chatWithArticle',
        endpoint: `/api/study/articles/${id}/chat`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error sending chat message:', error);
    await logCloudFunctionError({
      functionName: 'chatWithArticle',
      endpoint: '/api/study/articles/[id]/chat',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
