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

interface PrefectureArea {
  id: string;
  label: string;
  aliases: string[];
  lat: number;
  lon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const PREFECTURE_AREAS: PrefectureArea[] = [
  { id: 'hokkaido', label: '北海道', aliases: ['北海道'], lat: 43.064, lon: 141.347, minLat: 41.2, maxLat: 45.7, minLon: 139.2, maxLon: 146.2 },
  { id: 'aomori', label: '青森県', aliases: ['青森', '青森県'], lat: 40.824, lon: 140.741, minLat: 40.2, maxLat: 41.7, minLon: 139.4, maxLon: 141.7 },
  { id: 'iwate', label: '岩手県', aliases: ['岩手', '岩手県'], lat: 39.704, lon: 141.153, minLat: 38.7, maxLat: 40.5, minLon: 140.6, maxLon: 142.2 },
  { id: 'miyagi', label: '宮城県', aliases: ['宮城', '宮城県'], lat: 38.269, lon: 140.872, minLat: 37.7, maxLat: 38.9, minLon: 140.3, maxLon: 141.7 },
  { id: 'akita', label: '秋田県', aliases: ['秋田', '秋田県'], lat: 39.719, lon: 140.103, minLat: 38.8, maxLat: 40.6, minLon: 139.5, maxLon: 141.1 },
  { id: 'yamagata', label: '山形県', aliases: ['山形', '山形県'], lat: 38.24, lon: 140.364, minLat: 37.7, maxLat: 39.3, minLon: 139.5, maxLon: 140.8 },
  { id: 'fukushima', label: '福島県', aliases: ['福島', '福島県'], lat: 37.751, lon: 140.468, minLat: 36.7, maxLat: 38.0, minLon: 139.1, maxLon: 141.1 },
  { id: 'ibaraki', label: '茨城県', aliases: ['茨城', '茨城県'], lat: 36.342, lon: 140.447, minLat: 35.7, maxLat: 37.0, minLon: 139.65, maxLon: 140.9 },
  { id: 'tochigi', label: '栃木県', aliases: ['栃木', '栃木県'], lat: 36.566, lon: 139.884, minLat: 36.2, maxLat: 37.2, minLon: 139.3, maxLon: 140.4 },
  { id: 'gunma', label: '群馬県', aliases: ['群馬', '群馬県'], lat: 36.391, lon: 139.061, minLat: 35.9, maxLat: 37.1, minLon: 138.4, maxLon: 139.7 },
  { id: 'saitama', label: '埼玉県', aliases: ['埼玉', '埼玉県'], lat: 35.857, lon: 139.649, minLat: 35.7, maxLat: 36.3, minLon: 138.7, maxLon: 139.9 },
  { id: 'chiba', label: '千葉県', aliases: ['千葉', '千葉県'], lat: 35.605, lon: 140.123, minLat: 34.85, maxLat: 36.15, minLon: 139.7, maxLon: 140.95 },
  { id: 'tokyo', label: '東京都', aliases: ['東京', '東京都'], lat: 35.69, lon: 139.692, minLat: 35.45, maxLat: 35.9, minLon: 139.0, maxLon: 140.0 },
  { id: 'kanagawa', label: '神奈川県', aliases: ['神奈川', '神奈川県'], lat: 35.448, lon: 139.643, minLat: 35.1, maxLat: 35.7, minLon: 138.9, maxLon: 139.85 },
  { id: 'niigata', label: '新潟県', aliases: ['新潟', '新潟県'], lat: 37.902, lon: 139.023, minLat: 36.7, maxLat: 38.7, minLon: 137.6, maxLon: 139.9 },
  { id: 'toyama', label: '富山県', aliases: ['富山', '富山県'], lat: 36.695, lon: 137.211, minLat: 36.2, maxLat: 36.95, minLon: 136.75, maxLon: 137.8 },
  { id: 'ishikawa', label: '石川県', aliases: ['石川', '石川県'], lat: 36.594, lon: 136.626, minLat: 36.0, maxLat: 37.9, minLon: 136.0, maxLon: 137.4 },
  { id: 'fukui', label: '福井県', aliases: ['福井', '福井県'], lat: 36.066, lon: 136.222, minLat: 35.3, maxLat: 36.4, minLon: 135.3, maxLon: 136.9 },
  { id: 'yamanashi', label: '山梨県', aliases: ['山梨', '山梨県'], lat: 35.664, lon: 138.568, minLat: 35.1, maxLat: 35.95, minLon: 138.1, maxLon: 139.2 },
  { id: 'nagano', label: '長野県', aliases: ['長野', '長野県'], lat: 36.651, lon: 138.181, minLat: 35.1, maxLat: 37.1, minLon: 137.3, maxLon: 139.0 },
  { id: 'gifu', label: '岐阜県', aliases: ['岐阜', '岐阜県'], lat: 35.391, lon: 136.722, minLat: 35.1, maxLat: 36.5, minLon: 136.2, maxLon: 137.7 },
  { id: 'shizuoka', label: '静岡県', aliases: ['静岡', '静岡県'], lat: 34.977, lon: 138.383, minLat: 34.55, maxLat: 35.65, minLon: 137.4, maxLon: 139.2 },
  { id: 'aichi', label: '愛知県', aliases: ['愛知', '愛知県'], lat: 35.18, lon: 136.907, minLat: 34.5, maxLat: 35.5, minLon: 136.65, maxLon: 137.85 },
  { id: 'mie', label: '三重県', aliases: ['三重', '三重県'], lat: 34.73, lon: 136.509, minLat: 33.7, maxLat: 35.3, minLon: 135.8, maxLon: 136.95 },
  { id: 'shiga', label: '滋賀県', aliases: ['滋賀', '滋賀県'], lat: 35.005, lon: 135.869, minLat: 34.75, maxLat: 35.75, minLon: 135.75, maxLon: 136.45 },
  { id: 'kyoto', label: '京都府', aliases: ['京都', '京都府'], lat: 35.021, lon: 135.756, minLat: 34.65, maxLat: 35.8, minLon: 134.8, maxLon: 136.1 },
  { id: 'osaka', label: '大阪府', aliases: ['大阪', '大阪府'], lat: 34.686, lon: 135.52, minLat: 34.25, maxLat: 35.0, minLon: 135.0, maxLon: 135.75 },
  { id: 'hyogo', label: '兵庫県', aliases: ['兵庫', '兵庫県'], lat: 34.692, lon: 135.183, minLat: 34.15, maxLat: 35.75, minLon: 134.2, maxLon: 135.55 },
  { id: 'nara', label: '奈良県', aliases: ['奈良', '奈良県'], lat: 34.685, lon: 135.833, minLat: 33.85, maxLat: 34.85, minLon: 135.5, maxLon: 136.25 },
  { id: 'wakayama', label: '和歌山県', aliases: ['和歌山', '和歌山県'], lat: 34.226, lon: 135.168, minLat: 33.4, maxLat: 34.4, minLon: 135.0, maxLon: 136.1 },
  { id: 'tottori', label: '鳥取県', aliases: ['鳥取', '鳥取県'], lat: 35.504, lon: 134.238, minLat: 35.05, maxLat: 35.65, minLon: 133.1, maxLon: 134.6 },
  { id: 'shimane', label: '島根県', aliases: ['島根', '島根県'], lat: 35.472, lon: 133.051, minLat: 34.3, maxLat: 36.4, minLon: 131.65, maxLon: 133.5 },
  { id: 'okayama', label: '岡山県', aliases: ['岡山', '岡山県'], lat: 34.662, lon: 133.934, minLat: 34.25, maxLat: 35.35, minLon: 133.25, maxLon: 134.5 },
  { id: 'hiroshima', label: '広島県', aliases: ['広島', '広島県'], lat: 34.397, lon: 132.459, minLat: 34.0, maxLat: 35.1, minLon: 132.0, maxLon: 133.5 },
  { id: 'yamaguchi', label: '山口県', aliases: ['山口', '山口県'], lat: 34.186, lon: 131.471, minLat: 33.7, maxLat: 34.8, minLon: 130.7, maxLon: 132.6 },
  { id: 'tokushima', label: '徳島県', aliases: ['徳島', '徳島県'], lat: 34.066, lon: 134.559, minLat: 33.5, maxLat: 34.3, minLon: 133.5, maxLon: 134.85 },
  { id: 'kagawa', label: '香川県', aliases: ['香川', '香川県'], lat: 34.34, lon: 134.043, minLat: 34.0, maxLat: 34.65, minLon: 133.4, maxLon: 134.5 },
  { id: 'ehime', label: '愛媛県', aliases: ['愛媛', '愛媛県'], lat: 33.842, lon: 132.766, minLat: 32.8, maxLat: 34.35, minLon: 132.0, maxLon: 133.8 },
  { id: 'kochi', label: '高知県', aliases: ['高知', '高知県'], lat: 33.559, lon: 133.531, minLat: 32.7, maxLat: 34.1, minLon: 132.5, maxLon: 134.4 },
  { id: 'fukuoka', label: '福岡県', aliases: ['福岡', '福岡県'], lat: 33.607, lon: 130.418, minLat: 33.0, maxLat: 34.3, minLon: 129.9, maxLon: 131.35 },
  { id: 'saga', label: '佐賀県', aliases: ['佐賀', '佐賀県'], lat: 33.249, lon: 130.299, minLat: 32.9, maxLat: 33.7, minLon: 129.7, maxLon: 130.55 },
  { id: 'nagasaki', label: '長崎県', aliases: ['長崎', '長崎県'], lat: 32.745, lon: 129.874, minLat: 31.9, maxLat: 34.8, minLon: 128.0, maxLon: 130.5 },
  { id: 'kumamoto', label: '熊本県', aliases: ['熊本', '熊本県'], lat: 32.79, lon: 130.742, minLat: 32.0, maxLat: 33.3, minLon: 129.9, maxLon: 131.4 },
  { id: 'oita', label: '大分県', aliases: ['大分', '大分県'], lat: 33.238, lon: 131.613, minLat: 32.6, maxLat: 33.8, minLon: 130.8, maxLon: 132.1 },
  { id: 'miyazaki', label: '宮崎県', aliases: ['宮崎', '宮崎県'], lat: 31.911, lon: 131.424, minLat: 31.3, maxLat: 32.9, minLon: 130.7, maxLon: 132.0 },
  { id: 'kagoshima', label: '鹿児島県', aliases: ['鹿児島', '鹿児島県'], lat: 31.56, lon: 130.558, minLat: 27.0, maxLat: 32.4, minLon: 128.3, maxLon: 131.3 },
  { id: 'okinawa', label: '沖縄県', aliases: ['沖縄', '沖縄県'], lat: 26.212, lon: 127.681, minLat: 24.0, maxLat: 27.2, minLon: 122.8, maxLon: 131.4 },
];

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

  return candidates.reduce<PrefectureArea | null>((best, area) => {
    if (!best) return area;
    return getDistanceScore(latitude, longitude, area) < getDistanceScore(latitude, longitude, best)
      ? area
      : best;
  }, null);
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
