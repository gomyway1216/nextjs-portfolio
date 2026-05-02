// Learning Paths API
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getCloudFunctionUrl } from '../../../constants';
import { logApiError, logCloudFunctionError } from '../../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const endpoint = '/api/study/learning/paths';
const RESPONSE_SNIPPET_LIMIT = 300;
const REQUEST_ID_HEADER = 'x-request-id';

function createRequestId() {
  try {
    return randomUUID();
  } catch {
    return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function buildResponseMeta(response: Response, requestId: string, durationMs: number) {
  const cloudTrace = response.headers.get('x-cloud-trace-context');
  const via = response.headers.get('via');
  return {
    requestId,
    durationMs,
    status: response.status,
    statusText: response.statusText,
    cloudTrace,
    via,
  };
}

function parseResponseBody(bodyText: string): {
  data: any | null;
  parseError?: string;
  snippet: string;
} {
  const snippet = bodyText.slice(0, RESPONSE_SNIPPET_LIMIT);
  if (!bodyText) {
    return { data: null, snippet };
  }
  try {
    return { data: JSON.parse(bodyText), snippet };
  } catch (error) {
    return {
      data: null,
      parseError: error instanceof Error ? error.message : String(error),
      snippet,
    };
  }
}

// GET /api/study/learning/paths - Get learning paths
export const GET = withActivityLog('next_api.study.learning.paths.GET', async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('getLearningPaths'));

    // Forward query parameters
    const params = ['status', 'limit'];
    params.forEach((param) => {
      const value = searchParams.get(param);
      if (value) url.searchParams.set(param, value);
    });

    const requestId = createRequestId();
    const start = Date.now();
    const responseWithTiming = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
        [REQUEST_ID_HEADER]: requestId,
      },
    });
    const durationMs = Date.now() - start;
    const responseMeta = buildResponseMeta(responseWithTiming, requestId, durationMs);
    const { data, parseError, snippet } = parseResponseBody(await responseWithTiming.text());

    if (parseError || !data) {
      await logCloudFunctionError({
        functionName: 'getLearningPaths',
        endpoint,
        response: {
          status: responseWithTiming.status,
          error: 'Cloud Function returned invalid JSON',
          details: parseError ? `${parseError} | ${snippet}` : 'Empty response body',
        },
        metadata: { responseSnippet: snippet, ...responseMeta },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Cloud Function returned invalid JSON',
          details: snippet || 'Empty response body',
          source: 'cloud_function',
          requestId,
        },
        { status: responseWithTiming.status, headers: { [REQUEST_ID_HEADER]: requestId } }
      );
    }

    if (!responseWithTiming.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getLearningPaths',
        endpoint,
        response: { status: responseWithTiming.status, error: data.error, details: data.details, message: data.message },
        metadata: responseMeta,
      });
    }

    return NextResponse.json(data, { status: responseWithTiming.status, headers: { [REQUEST_ID_HEADER]: requestId } });
  } catch (error) {
    console.error('[Learning Paths API] Error fetching paths:', error);
    await logCloudFunctionError({
      functionName: 'getLearningPaths',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning paths' },
      { status: 500 }
    );
  }
});

// POST /api/study/learning/paths - Create a new learning path (AI generated)
export const POST = withActivityLog('next_api.study.learning.paths.POST', async (request: NextRequest) => {
  let requestMeta: Record<string, unknown> = {};
  try {
    const requestId = createRequestId();
    const start = Date.now();
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    if (body?.goal) {
      const goalText = String(body.goal);
      requestMeta = {
        goalPreview: goalText.slice(0, 120),
        goalLength: goalText.length,
        hasContext: !!body.context,
      };
    }

    const response = await fetch(getCloudFunctionUrl('createLearningPath'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
        [REQUEST_ID_HEADER]: requestId,
      },
      body: JSON.stringify(body),
    });
    const durationMs = Date.now() - start;
    const responseMeta = buildResponseMeta(response, requestId, durationMs);

    const { data, parseError, snippet } = parseResponseBody(await response.text());

    if (parseError || !data) {
      await logCloudFunctionError({
        functionName: 'createLearningPath',
        endpoint,
        response: {
          status: response.status,
          error: 'Cloud Function returned invalid JSON',
          details: parseError ? `${parseError} | ${snippet}` : 'Empty response body',
        },
        metadata: { ...requestMeta, responseSnippet: snippet, ...responseMeta },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Cloud Function returned invalid JSON',
          details: snippet || 'Empty response body',
          source: 'cloud_function',
          requestId,
        },
        { status: response.status, headers: { [REQUEST_ID_HEADER]: requestId } }
      );
    }

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'createLearningPath',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { ...requestMeta, ...responseMeta },
      });
    }

    return NextResponse.json(
      response.ok && data.success ? { ...data, requestId } : { ...data, source: 'cloud_function', requestId },
      { status: response.status, headers: { [REQUEST_ID_HEADER]: requestId } }
    );
  } catch (error) {
    console.error('[Learning Paths API] Error creating path:', error);
    await logApiError({
      severity: ErrorSeverity.MEDIUM,
      errorType: 'LearningPathsAPI:CreateError',
      message: 'Failed to create learning path',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
      metadata: requestMeta,
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create learning path',
        source: 'api_route',
      },
      { status: 500 }
    );
  }
});

// PUT /api/study/learning/paths - Update a learning path
export const PUT = withActivityLog('next_api.study.learning.paths.PUT', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const pathId = request.nextUrl.searchParams.get('pathId');

    const url = new URL(getCloudFunctionUrl('updateLearningPath'));
    if (pathId) url.searchParams.set('pathId', pathId);

    const requestId = createRequestId();
    const start = Date.now();
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
        [REQUEST_ID_HEADER]: requestId,
      },
      body: JSON.stringify(body),
    });
    const durationMs = Date.now() - start;
    const responseMeta = buildResponseMeta(response, requestId, durationMs);

    const { data, parseError, snippet } = parseResponseBody(await response.text());

    if (parseError || !data) {
      await logCloudFunctionError({
        functionName: 'updateLearningPath',
        endpoint,
        response: {
          status: response.status,
          error: 'Cloud Function returned invalid JSON',
          details: parseError ? `${parseError} | ${snippet}` : 'Empty response body',
        },
        metadata: { pathId, responseSnippet: snippet, ...responseMeta },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Cloud Function returned invalid JSON',
          details: snippet || 'Empty response body',
          source: 'cloud_function',
          requestId,
        },
        { status: response.status, headers: { [REQUEST_ID_HEADER]: requestId } }
      );
    }

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'updateLearningPath',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { pathId, ...responseMeta },
      });
    }

    return NextResponse.json({ ...data, requestId }, { status: response.status, headers: { [REQUEST_ID_HEADER]: requestId } });
  } catch (error) {
    console.error('[Learning Paths API] Error updating path:', error);
    await logCloudFunctionError({
      functionName: 'updateLearningPath',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update learning path' },
      { status: 500 }
    );
  }
});

// DELETE /api/study/learning/paths - Delete a learning path
export const DELETE = withActivityLog('next_api.study.learning.paths.DELETE', async (request: NextRequest) => {
  try {
    const authHeader = request.headers.get('authorization');
    const pathId = request.nextUrl.searchParams.get('pathId');

    const url = new URL(getCloudFunctionUrl('deleteLearningPath'));
    if (pathId) url.searchParams.set('pathId', pathId);

    const requestId = createRequestId();
    const start = Date.now();
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
        [REQUEST_ID_HEADER]: requestId,
      },
    });
    const durationMs = Date.now() - start;
    const responseMeta = buildResponseMeta(response, requestId, durationMs);

    const { data, parseError, snippet } = parseResponseBody(await response.text());

    if (parseError || !data) {
      await logCloudFunctionError({
        functionName: 'deleteLearningPath',
        endpoint,
        response: {
          status: response.status,
          error: 'Cloud Function returned invalid JSON',
          details: parseError ? `${parseError} | ${snippet}` : 'Empty response body',
        },
        metadata: { pathId, responseSnippet: snippet, ...responseMeta },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Cloud Function returned invalid JSON',
          details: snippet || 'Empty response body',
          source: 'cloud_function',
          requestId,
        },
        { status: response.status, headers: { [REQUEST_ID_HEADER]: requestId } }
      );
    }

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'deleteLearningPath',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { pathId, ...responseMeta },
      });
    }

    return NextResponse.json({ ...data, requestId }, { status: response.status, headers: { [REQUEST_ID_HEADER]: requestId } });
  } catch (error) {
    console.error('[Learning Paths API] Error deleting path:', error);
    await logCloudFunctionError({
      functionName: 'deleteLearningPath',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete learning path' },
      { status: 500 }
    );
  }
});
