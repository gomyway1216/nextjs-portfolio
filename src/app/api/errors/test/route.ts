// Test Error Logging API - Use this to verify error tracking is working
import { NextRequest, NextResponse } from 'next/server';
import { logApiError } from '../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';

// GET /api/errors/test - Trigger a test error to verify error logging
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'simple';
  const endpoint = '/api/errors/test';

  try {
    if (type === 'exception') {
      // Simulate an unhandled exception
      throw new Error('Test exception - This is an intentional error for testing');
    }

    if (type === 'async') {
      // Simulate an async error
      await Promise.reject(new Error('Test async error - This is an intentional async error'));
    }

    // Default: Log a simple test error
    await logApiError({
      severity: ErrorSeverity.LOW,
      errorType: 'TestError',
      message: 'Test error logged successfully',
      details: 'This is a test error to verify the error logging system is working correctly.',
      endpoint,
      metadata: {
        testType: type,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Test error logged successfully. Check the Error Monitoring panel in /admin.',
      type,
    });
  } catch (error) {
    // Log the caught error
    await logApiError({
      severity: ErrorSeverity.MEDIUM,
      errorType: `TestError:${type}`,
      message: error instanceof Error ? error.message : 'Unknown test error',
      details: error instanceof Error ? error.stack : String(error),
      endpoint,
      metadata: {
        testType: type,
        caught: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Test ${type} error logged successfully. Check the Error Monitoring panel in /admin.`,
      type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
