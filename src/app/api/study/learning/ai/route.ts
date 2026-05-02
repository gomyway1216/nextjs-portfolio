// AI Generation API for Learning System
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const endpoint = '/api/study/learning/ai';

// POST /api/study/learning/ai - AI generation endpoints
// Body should include 'action' field: 'flashcards', 'terms', 'summary', 'quiz'
export const POST = withActivityLog('next_api.study.learning.ai.POST', async (request: NextRequest) => {
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

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName,
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { action },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error with AI generation:', error);
    await logCloudFunctionError({
      functionName: 'learningAI',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to generate AI content' },
      { status: 500 }
    );
  }
});
