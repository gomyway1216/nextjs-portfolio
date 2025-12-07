// AI Generation API for Learning System
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';

// POST /api/study/learning/ai - AI generation endpoints
// Body should include 'action' field: 'flashcards', 'terms', 'summary', 'quiz'
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const { action, ...params } = body;

    let functionName: string;
    switch (action) {
      case 'flashcards':
        functionName = 'generateFlashcardsFromContent';
        break;
      case 'terms':
        functionName = 'extractTermsFromContent';
        break;
      case 'summary':
        functionName = 'generateSummaryFromContent';
        break;
      case 'quiz':
        functionName = 'generateQuizFromLearningEntries';
        break;
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Must be: flashcards, terms, summary, or quiz' },
          { status: 400 }
        );
    }

    const response = await fetch(getCloudFunctionUrl(functionName), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error with AI generation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate AI content' },
      { status: 500 }
    );
  }
}
