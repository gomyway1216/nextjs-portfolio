// Flashcard Decks API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';

// GET /api/study/learning/flashcards/decks - Get flashcard decks
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('getFlashcardDecks'), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching flashcard decks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch flashcard decks' },
      { status: 500 }
    );
  }
}

// POST /api/study/learning/flashcards/decks - Create a new flashcard deck
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('createFlashcardDeck'), {
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
    console.error('[Learning API] Error creating flashcard deck:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create flashcard deck' },
      { status: 500 }
    );
  }
}
