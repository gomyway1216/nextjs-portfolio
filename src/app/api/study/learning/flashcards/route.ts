// Flashcards API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

const endpoint = '/api/study/learning/flashcards';

// GET /api/study/learning/flashcards - Get flashcards
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('getFlashcards'));

    // Forward query parameters
    const params = ['deckId', 'categoryId', 'dueOnly', 'limit'];
    params.forEach((param) => {
      const value = searchParams.get(param);
      if (value) url.searchParams.set(param, value);
    });

    const response = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getFlashcards',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching flashcards:', error);
    await logCloudFunctionError({
      functionName: 'getFlashcards',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch flashcards' },
      { status: 500 }
    );
  }
}

// POST /api/study/learning/flashcards - Create a new flashcard
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('createFlashcard'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'createFlashcard',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error creating flashcard:', error);
    await logCloudFunctionError({
      functionName: 'createFlashcard',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to create flashcard' },
      { status: 500 }
    );
  }
}

// DELETE /api/study/learning/flashcards - Delete a flashcard
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const flashcardId = request.nextUrl.searchParams.get('flashcardId');

    const url = new URL(getCloudFunctionUrl('deleteFlashcard'));
    if (flashcardId) url.searchParams.set('flashcardId', flashcardId);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'deleteFlashcard',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { flashcardId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error deleting flashcard:', error);
    await logCloudFunctionError({
      functionName: 'deleteFlashcard',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete flashcard' },
      { status: 500 }
    );
  }
}
