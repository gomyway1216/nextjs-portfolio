import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';

export const dynamic = 'force-dynamic';

const FORWARDED_PARAMS = [
  'q',
  'query',
  'limit',
  'prefecture',
  'kind',
  'kinds',
  'includeExternal',
  'external',
];

interface RailwayPlaceProxyResponse {
  success?: boolean;
  query?: string;
  normalizedQuery?: string;
  results?: unknown[];
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

function buildRailwayPlacesUrl(searchParams: URLSearchParams, queryOverride?: string): URL {
  const url = new URL(getCloudFunctionUrl('searchRailwayPlaces'));
  for (const param of FORWARDED_PARAMS) {
    const value = searchParams.get(param);
    if (value) url.searchParams.set(param, value);
  }
  if (queryOverride) {
    url.searchParams.set('q', queryOverride);
    url.searchParams.delete('query');
  }
  if (!url.searchParams.has('limit')) url.searchParams.set('limit', '8');

  return url;
}

function getFallbackPlaceQueries(query: string): string[] {
  const compactQuery = query.trim().replace(/\s+/g, '');
  const fallbackQueries = new Set<string>();

  for (const marker of ['区', '市', '町', '村']) {
    const markerIndex = compactQuery.lastIndexOf(marker);
    if (markerIndex >= 0 && markerIndex < compactQuery.length - 1) {
      fallbackQueries.add(compactQuery.slice(markerIndex + 1));
    }
  }

  for (const length of [7, 6, 5, 4, 3, 2]) {
    if (compactQuery.length > length) {
      fallbackQueries.add(compactQuery.slice(-length));
    }
  }

  fallbackQueries.delete(compactQuery);

  return Array.from(fallbackQueries)
    .filter((fallbackQuery) => fallbackQuery.length >= 2 && !/^[0-9０-９]+丁目?$/u.test(fallbackQuery))
    .slice(0, 4);
}

async function fetchRailwayPlaces(url: URL): Promise<{ data: RailwayPlaceProxyResponse; status: number }> {
  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });
  const data = await response.json() as RailwayPlaceProxyResponse;

  return { data, status: response.status };
}

export const GET = withActivityLog('next_api.railway.places.GET', async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') ?? searchParams.get('query');
  if (!query?.trim()) {
    return NextResponse.json({ success: false, error: 'q is required' }, { status: 400 });
  }

  try {
    const { data, status } = await fetchRailwayPlaces(buildRailwayPlacesUrl(searchParams));
    if (status === 200 && data.success && data.results?.length === 0) {
      for (const fallbackQuery of getFallbackPlaceQueries(query)) {
        const fallback = await fetchRailwayPlaces(buildRailwayPlacesUrl(searchParams, fallbackQuery));
        if (fallback.status === 200 && fallback.data.success && fallback.data.results?.length) {
          return NextResponse.json({
            ...fallback.data,
            query,
            normalizedQuery: data.normalizedQuery ?? query.trim(),
            fallbackQuery,
            meta: {
              ...(fallback.data.meta ?? {}),
              originalQuery: query,
              fallbackQuery,
            },
          }, { status: fallback.status });
        }
      }
    }

    return NextResponse.json(data, { status });
  } catch (error) {
    console.error('Error searching railway places:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search railway places' },
      { status: 500 },
    );
  }
});
