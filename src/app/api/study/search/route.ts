// Study Search API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';
import { logCloudFunctionError } from '../../utils/errorLogger';

const endpoint = '/api/study/search';

// GET /api/study/search - Search study content
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(getCloudFunctionUrl('searchStudyContent'));

    const q = searchParams.get('q');
    const type = searchParams.get('type');

    if (q) url.searchParams.set('q', q);
    if (type) url.searchParams.set('type', type);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'searchStudyContent',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { query: q, type },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error searching content:', error);
    await logCloudFunctionError({
      functionName: 'searchStudyContent',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to search' },
      { status: 500 }
    );
  }
}
