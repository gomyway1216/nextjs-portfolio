import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/projects/categories
 * Get all project categories (static list)
 */
export async function GET(request: NextRequest) {
  try {
    const categories = ['Web App', 'Mobile', 'AI/ML', 'Console'];
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error fetching project categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project categories' },
      { status: 500 }
    );
  }
}
