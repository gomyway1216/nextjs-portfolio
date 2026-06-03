import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';
import { PREFECTURE_AREAS, type PrefectureArea } from './prefectureAreas';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNumberValue(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getStringArrayValue(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function getDistanceScore(lat: number, lon: number, area: PrefectureArea): number {
  const latWeight = 111;
  const lonWeight = Math.cos((lat * Math.PI) / 180) * 111;
  return ((lat - area.lat) * latWeight) ** 2 + ((lon - area.lon) * lonWeight) ** 2;
}

function inferPrefecture(latitude: number | null, longitude: number | null): PrefectureArea | null {
  if (latitude === null || longitude === null) return null;

  const containingAreas = PREFECTURE_AREAS.filter((area) => (
    latitude >= area.minLat
    && latitude <= area.maxLat
    && longitude >= area.minLon
    && longitude <= area.maxLon
  ));
  const candidates = containingAreas.length ? containingAreas : PREFECTURE_AREAS;

  let best: PrefectureArea | null = null;
  let minScore = Number.POSITIVE_INFINITY;

  for (const area of candidates) {
    const score = getDistanceScore(latitude, longitude, area);
    if (score < minScore) {
      minScore = score;
      best = area;
    }
  }

  return best;
}

function isGenericJapanLocation(value: string | null): boolean {
  return !value || value === '日本' || value === '日本国';
}

function isGenericAddress(address: string | null, name: string | null): boolean {
  if (!address) return true;
  return address === '日本' || (name !== null && address === `日本${name}`);
}

function parseRailwayAlias(record: Record<string, unknown>): { operatorName?: string; lineName?: string } {
  const name = getStringValue(record, 'name');
  if (!name) return {};

  const alias = getStringArrayValue(record, 'aliases')
    .find((item) => item.includes('/') && !item.includes('国土数値情報'));
  if (!alias) return {};

  const [operatorName, lineAndStationName] = alias.split('/');
  const lineName = lineAndStationName?.endsWith(name)
    ? lineAndStationName.slice(0, -name.length)
    : lineAndStationName;

  return {
    operatorName: operatorName?.trim() || undefined,
    lineName: lineName?.trim() || undefined,
  };
}

function getQueryPrefectureHints(query: string): PrefectureArea[] {
  const compactQuery = query.trim().replace(/\s+/g, '');
  return PREFECTURE_AREAS.filter((area) => (
    area.aliases.some((alias) => compactQuery.includes(alias))
  ));
}

function enrichPlaceResult(result: unknown): unknown {
  if (!isRecord(result)) return result;

  const latitude = getNumberValue(result, 'latitude');
  const longitude = getNumberValue(result, 'longitude');
  const inferredPrefecture = inferPrefecture(latitude, longitude);
  const name = getStringValue(result, 'name');
  const prefecture = getStringValue(result, 'prefecture');
  const municipality = getStringValue(result, 'municipality');
  const address = getStringValue(result, 'address');
  const railway = parseRailwayAlias(result);
  const displayPrefecture = isGenericJapanLocation(prefecture) ? inferredPrefecture?.label : prefecture;
  const displayLocation = [
    displayPrefecture,
    municipality,
  ].filter((item): item is string => typeof item === 'string' && !isGenericJapanLocation(item)).join(' / ');
  const railwayDetail = [railway.operatorName, railway.lineName].filter(Boolean).join(' / ');
  const coordinateDetail = latitude !== null && longitude !== null
    ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
    : '';
  const displayDetail = [railwayDetail, coordinateDetail].filter(Boolean).join(' / ');

  return {
    ...result,
    prefecture: displayPrefecture ?? prefecture,
    displayLocation: displayLocation || (!isGenericAddress(address, name) ? address : undefined),
    displayDetail: displayDetail || undefined,
    ...railway,
  };
}

function prepareRailwayPlacesResponse(data: RailwayPlaceProxyResponse, query: string): RailwayPlaceProxyResponse {
  if (!Array.isArray(data.results)) return data;

  const hints = getQueryPrefectureHints(query);
  const enrichedResults = data.results.map(enrichPlaceResult);
  if (!hints.length) return { ...data, results: enrichedResults };

  return {
    ...data,
    results: enrichedResults.sort((a, b) => {
      if (!isRecord(a) || !isRecord(b)) return 0;
      const aPrefecture = getStringValue(a, 'prefecture');
      const bPrefecture = getStringValue(b, 'prefecture');
      const aScore = getNumberValue(a, 'score') ?? 0;
      const bScore = getNumberValue(b, 'score') ?? 0;
      const aHintBoost = hints.some((hint) => hint.label === aPrefecture || hint.aliases.includes(aPrefecture ?? '')) ? 1000 : 0;
      const bHintBoost = hints.some((hint) => hint.label === bPrefecture || hint.aliases.includes(bPrefecture ?? '')) ? 1000 : 0;
      return (bHintBoost + bScore) - (aHintBoost + aScore);
    }),
  };
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
            ...prepareRailwayPlacesResponse(fallback.data, query),
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

    return NextResponse.json(prepareRailwayPlacesResponse(data, query), { status });
  } catch (error) {
    console.error('Error searching railway places:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search railway places' },
      { status: 500 },
    );
  }
});
