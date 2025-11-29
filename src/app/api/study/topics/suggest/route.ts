// Study Topics Suggestion API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';

// POST /api/study/topics/suggest - Get AI-suggested topics
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('suggestStudyTopics'), {
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
    console.error('Error suggesting topics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to suggest topics' },
      { status: 500 }
    );
  }
}
