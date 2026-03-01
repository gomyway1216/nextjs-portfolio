import { NextRequest, NextResponse } from 'next/server';
import { getRandomQuestions } from '@/lib/kuizuQuestionBank';
import type { Quiz, QuizCategory, QuizDifficulty, QuestionType } from '@/types/kuizu';
import { v4 as uuidv4 } from 'uuid';

// POST /api/kuizu/generate - Generate quiz from question bank
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      category,
      difficulty,
      questionCount = 10,
      timePerQuestion = 30,
      questionTypes,
    } = body;

    // Validate required fields
    if (!category || !difficulty) {
      return NextResponse.json(
        { error: 'Missing required fields: category, difficulty' },
        { status: 400 }
      );
    }

    // Get random questions from the question bank
    const questions = getRandomQuestions(
      questionCount,
      category as QuizCategory,
      difficulty as QuizDifficulty,
      questionTypes as QuestionType[] | undefined,
    );

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'No questions found matching the criteria' },
        { status: 404 }
      );
    }

    // Generate quiz object
    const quizId = uuidv4();
    const now = new Date().toISOString();

    const quiz: Quiz = {
      id: quizId,
      title: `${category} - ${difficulty}`,
      category: category as QuizCategory,
      difficulty: difficulty as QuizDifficulty,
      questionCount: questions.length,
      questions,
      timePerQuestion,
      createdBy: null,
      isCustom: false,
      hasPasscode: false,
      createdAt: now,
      updatedAt: now,
    };

    return NextResponse.json({
      quiz,
    });
  } catch (error) {
    console.error('Error generating kuizu quiz:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate quiz', details: errorMessage },
      { status: 500 }
    );
  }
}
