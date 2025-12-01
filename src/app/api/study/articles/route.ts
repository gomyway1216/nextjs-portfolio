// Study Articles API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';

// GET /api/study/articles - Get articles with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(getCloudFunctionUrl('getStudyArticles'));

    // Forward query parameters
    const params = ['categoryId', 'topicId', 'status', 'limit', 'lastId', 'listView'];
    params.forEach((param) => {
      const value = searchParams.get(param);
      if (value) url.searchParams.set(param, value);
    });

    console.log('[Study API] GET articles:', url.toString());

    const response = await fetch(url.toString());
    const data = await response.json();

    // Log error details from Cloud Function
    if (!response.ok || !data.success) {
      console.error('[Study API] Error from Cloud Function:', {
        status: response.status,
        error: data.error,
        details: data.details || data.message,
      });
    } else {
      console.log('[Study API] Fetched', data.articles?.length || 0, 'articles');
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Study API] Error fetching articles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch articles' },
      { status: 500 }
    );
  }
}

// POST /api/study/articles - Generate a new article
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const url = getCloudFunctionUrl('generateStudyArticle');

    console.log('[DEBUG] Generating article:', {
      url,
      body,
      hasAuth: !!authHeader,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    console.log('[DEBUG] Response status:', response.status);

    const responseText = await response.text();
    console.log('[DEBUG] Response text:', responseText.substring(0, 500));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[DEBUG] Failed to parse response as JSON');
      return NextResponse.json(
        { success: false, error: 'Invalid response from server', details: responseText.substring(0, 200) },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error generating article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate article', details: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/study/articles - Update an article
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('updateStudyArticle'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error updating article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update article' },
      { status: 500 }
    );
  }
}

// DELETE /api/study/articles - Delete an article
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('deleteStudyArticle'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error deleting article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete article' },
      { status: 500 }
    );
  }
}
