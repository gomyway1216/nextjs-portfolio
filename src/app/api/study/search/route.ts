// Study Search API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';

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
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error searching content:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search' },
      { status: 500 }
    );
  }
}
