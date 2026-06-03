'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  Activity,
  ArrowLeft,
  Circle,
  Clock,
  MapPin,
  Plus,
  RotateCcw,
  Train,
  Trash2,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import styles from './railway-planner.module.css';

const MAP_WIDTH = 620;
const MAP_HEIGHT = 760;

type TerrainType = 'plain' | 'urban' | 'mountain' | 'coastal';
type TrackType = 'single' | 'double' | 'quad';
type ServiceType = 'local' | 'rapid' | 'express' | 'limited';
type MapScope = 'tokyo' | 'national';

interface Station {
  id: string;
  name: string;
  region: string;
  x: number;
  y: number;
  demand: number;
  terrain: TerrainType;
  labelDx?: number;
  labelDy?: number;
  custom?: boolean;
  scope?: MapScope;
}

interface Segment {
  from: Station;
  to: Station;
  distance: number;
  terrainFactor: number;
}

interface PresetRoute {
  id: string;
  name: string;
  lineName: string;
  stationIds: string[];
}

const terrainCostFactor: Record<TerrainType, number> = {
  plain: 1,
  urban: 1.32,
  mountain: 1.62,
  coastal: 1.12,
};

const NATIONAL_STATIONS: Station[] = [
  { id: 'sapporo', name: '札幌', region: '北海道', x: 522, y: 88, demand: 190, terrain: 'urban', labelDx: 12, labelDy: -8 },
  { id: 'hakodate', name: '函館', region: '北海道', x: 493, y: 166, demand: 105, terrain: 'coastal', labelDx: -42, labelDy: 0 },
  { id: 'aomori', name: '青森', region: '東北', x: 482, y: 226, demand: 96, terrain: 'coastal', labelDx: 10, labelDy: -8 },
  { id: 'morioka', name: '盛岡', region: '東北', x: 499, y: 284, demand: 110, terrain: 'mountain', labelDx: 12, labelDy: 2 },
  { id: 'sendai', name: '仙台', region: '東北', x: 489, y: 340, demand: 170, terrain: 'urban', labelDx: 12, labelDy: -6 },
  { id: 'niigata', name: '新潟', region: '北陸', x: 430, y: 344, demand: 128, terrain: 'coastal', labelDx: -42, labelDy: 1 },
  { id: 'kanazawa', name: '金沢', region: '北陸', x: 362, y: 406, demand: 118, terrain: 'coastal', labelDx: -43, labelDy: -2 },
  { id: 'tokyo', name: '東京', region: '関東', x: 470, y: 454, demand: 320, terrain: 'urban', labelDx: 12, labelDy: -10 },
  { id: 'yokohama', name: '横浜', region: '関東', x: 452, y: 477, demand: 245, terrain: 'urban', labelDx: 12, labelDy: 12 },
  { id: 'shizuoka', name: '静岡', region: '中部', x: 413, y: 490, demand: 112, terrain: 'coastal', labelDx: 8, labelDy: 16 },
  { id: 'nagoya', name: '名古屋', region: '中部', x: 378, y: 504, demand: 210, terrain: 'urban', labelDx: -55, labelDy: 0 },
  { id: 'kyoto', name: '京都', region: '関西', x: 337, y: 520, demand: 175, terrain: 'urban', labelDx: 8, labelDy: -18 },
  { id: 'osaka', name: '大阪', region: '関西', x: 320, y: 540, demand: 255, terrain: 'urban', labelDx: -50, labelDy: 6 },
  { id: 'kobe', name: '神戸', region: '関西', x: 302, y: 548, demand: 154, terrain: 'coastal', labelDx: -42, labelDy: 16 },
  { id: 'okayama', name: '岡山', region: '中国', x: 264, y: 558, demand: 116, terrain: 'plain', labelDx: -43, labelDy: -8 },
  { id: 'hiroshima', name: '広島', region: '中国', x: 216, y: 574, demand: 152, terrain: 'coastal', labelDx: -45, labelDy: 4 },
  { id: 'matsuyama', name: '松山', region: '四国', x: 248, y: 616, demand: 92, terrain: 'coastal', labelDx: 9, labelDy: 14 },
  { id: 'fukuoka', name: '福岡', region: '九州', x: 156, y: 608, demand: 198, terrain: 'urban', labelDx: -45, labelDy: -5 },
  { id: 'kumamoto', name: '熊本', region: '九州', x: 139, y: 658, demand: 112, terrain: 'plain', labelDx: 10, labelDy: 8 },
  { id: 'kagoshima', name: '鹿児島', region: '九州', x: 123, y: 710, demand: 104, terrain: 'coastal', labelDx: 10, labelDy: 8 },
  { id: 'naha', name: '那覇', region: '沖縄', x: 78, y: 718, demand: 132, terrain: 'coastal', labelDx: 10, labelDy: -10 },
];

const TOKYO_STATIONS: Station[] = [
  { id: 'akabane', name: '赤羽', region: '北区', x: 214, y: 126, demand: 166, terrain: 'urban', labelDx: -34, labelDy: -8 },
  { id: 'oji', name: '王子', region: '北区', x: 250, y: 174, demand: 120, terrain: 'urban', labelDx: -32, labelDy: 4 },
  { id: 'tabata', name: '田端', region: '北区', x: 298, y: 224, demand: 118, terrain: 'urban', labelDx: -38, labelDy: -2 },
  { id: 'komagome', name: '駒込', region: '豊島区', x: 262, y: 236, demand: 104, terrain: 'urban', labelDx: -42, labelDy: 12 },
  { id: 'ikebukuro', name: '池袋', region: '豊島区', x: 204, y: 282, demand: 255, terrain: 'urban', labelDx: -42, labelDy: -10 },
  { id: 'nippori', name: '日暮里', region: '荒川区', x: 330, y: 264, demand: 142, terrain: 'urban', labelDx: 10, labelDy: -12 },
  { id: 'nishi-nippori', name: '西日暮里', region: '荒川区', x: 310, y: 242, demand: 126, terrain: 'urban', labelDx: 9, labelDy: -20 },
  { id: 'minami-senju', name: '南千住', region: '荒川区', x: 382, y: 220, demand: 112, terrain: 'urban', labelDx: 12, labelDy: -10 },
  { id: 'kita-senju', name: '北千住', region: '足立区', x: 448, y: 190, demand: 170, terrain: 'urban', labelDx: 11, labelDy: -7 },
  { id: 'ayase', name: '綾瀬', region: '足立区', x: 500, y: 170, demand: 126, terrain: 'urban', labelDx: 10, labelDy: -2 },
  { id: 'kameari', name: '亀有', region: '葛飾区', x: 552, y: 162, demand: 104, terrain: 'urban', labelDx: -4, labelDy: 22 },
  { id: 'matsudo', name: '松戸', region: '千葉県', x: 586, y: 118, demand: 128, terrain: 'urban', labelDx: -34, labelDy: -14 },
  { id: 'ueno', name: '上野', region: '台東区', x: 336, y: 318, demand: 180, terrain: 'urban', labelDx: 10, labelDy: -8 },
  { id: 'asakusa', name: '浅草', region: '台東区', x: 398, y: 334, demand: 116, terrain: 'urban', labelDx: 10, labelDy: -4 },
  { id: 'oshiage', name: '押上', region: '墨田区', x: 462, y: 356, demand: 122, terrain: 'urban', labelDx: 10, labelDy: -4 },
  { id: 'akihabara', name: '秋葉原', region: '千代田区', x: 324, y: 382, demand: 176, terrain: 'urban', labelDx: -50, labelDy: 2 },
  { id: 'ochanomizu', name: '御茶ノ水', region: '千代田区', x: 288, y: 374, demand: 126, terrain: 'urban', labelDx: -58, labelDy: -12 },
  { id: 'ryogoku', name: '両国', region: '墨田区', x: 392, y: 414, demand: 86, terrain: 'urban', labelDx: 11, labelDy: 2 },
  { id: 'kinshicho', name: '錦糸町', region: '墨田区', x: 452, y: 420, demand: 126, terrain: 'urban', labelDx: 10, labelDy: 0 },
  { id: 'tokyo', name: '東京', region: '千代田区', x: 318, y: 452, demand: 320, terrain: 'urban', labelDx: 12, labelDy: -8 },
  { id: 'shimbashi', name: '新橋', region: '港区', x: 296, y: 504, demand: 152, terrain: 'urban', labelDx: -36, labelDy: 8 },
  { id: 'tamachi', name: '田町', region: '港区', x: 290, y: 560, demand: 116, terrain: 'urban', labelDx: -34, labelDy: 4 },
  { id: 'shinagawa', name: '品川', region: '港区', x: 278, y: 626, demand: 205, terrain: 'urban', labelDx: -38, labelDy: 6 },
  { id: 'shinjuku', name: '新宿', region: '新宿区', x: 176, y: 404, demand: 284, terrain: 'urban', labelDx: -34, labelDy: -10 },
  { id: 'shibuya', name: '渋谷', region: '渋谷区', x: 188, y: 526, demand: 224, terrain: 'urban', labelDx: -34, labelDy: 8 },
  { id: 'ebisu', name: '恵比寿', region: '渋谷区', x: 214, y: 568, demand: 116, terrain: 'urban', labelDx: -40, labelDy: 2 },
];

const TRACK_OPTIONS: Record<TrackType, {
  label: string;
  description: string;
  costFactor: number;
  speedBonus: number;
  trainCapacity: number;
  color: string;
}> = {
  single: {
    label: '単線',
    description: '地方線向け。安いが本数と速度に制約。',
    costFactor: 0.72,
    speedBonus: -8,
    trainCapacity: 540,
    color: '#0f766e',
  },
  double: {
    label: '複線',
    description: '幹線の標準。快速や急行を安定運行。',
    costFactor: 1,
    speedBonus: 0,
    trainCapacity: 920,
    color: '#2563eb',
  },
  quad: {
    label: '複々線',
    description: '都市圏向け。緩急分離で高頻度運行。',
    costFactor: 1.62,
    speedBonus: 9,
    trainCapacity: 1480,
    color: '#be123c',
  },
};

const SERVICE_OPTIONS: Record<ServiceType, {
  label: string;
  shortLabel: string;
  speed: number;
  stopPenalty: number;
  demandMultiplier: number;
  color: string;
  dashArray?: string;
}> = {
  local: {
    label: '普通',
    shortLabel: '普',
    speed: 70,
    stopPenalty: 2.4,
    demandMultiplier: 0.88,
    color: '#334155',
  },
  rapid: {
    label: '快速',
    shortLabel: '快',
    speed: 88,
    stopPenalty: 2,
    demandMultiplier: 1,
    color: '#f97316',
    dashArray: '12 7',
  },
  express: {
    label: '急行',
    shortLabel: '急',
    speed: 106,
    stopPenalty: 1.65,
    demandMultiplier: 1.08,
    color: '#dc2626',
    dashArray: '18 8',
  },
  limited: {
    label: '特急',
    shortLabel: '特',
    speed: 124,
    stopPenalty: 1.25,
    demandMultiplier: 1.18,
    color: '#7c3aed',
    dashArray: '3 8',
  },
};

const NATIONAL_PRESET_ROUTES: PresetRoute[] = [
  {
    id: 'tokaido',
    name: '東海道軸',
    lineName: '新東海道メトロライナー',
    stationIds: ['tokyo', 'yokohama', 'shizuoka', 'nagoya', 'kyoto', 'osaka', 'kobe', 'okayama', 'hiroshima', 'fukuoka'],
  },
  {
    id: 'nihonkai',
    name: '日本海縦貫',
    lineName: '日本海リンク',
    stationIds: ['sapporo', 'hakodate', 'aomori', 'niigata', 'kanazawa', 'kyoto', 'osaka'],
  },
  {
    id: 'kyushu',
    name: '九州南北',
    lineName: '九州クロスライン',
    stationIds: ['fukuoka', 'kumamoto', 'kagoshima', 'naha'],
  },
];

const TOKYO_PRESET_ROUTES: PresetRoute[] = [
  {
    id: 'joban-hibiya',
    name: '常磐・日比谷軸',
    lineName: '荒川アーバンライン',
    stationIds: ['tokyo', 'akihabara', 'ueno', 'minami-senju', 'kita-senju', 'ayase', 'kameari', 'matsudo'],
  },
  {
    id: 'yamanote-east',
    name: '山手東側',
    lineName: '東都リング東線',
    stationIds: ['shinagawa', 'tamachi', 'shimbashi', 'tokyo', 'akihabara', 'ueno', 'nippori', 'nishi-nippori', 'tabata', 'komagome', 'ikebukuro'],
  },
  {
    id: 'sumida-link',
    name: '隅田川連絡',
    lineName: '隅田川クロスライン',
    stationIds: ['shimbashi', 'tokyo', 'ryogoku', 'kinshicho', 'oshiage', 'asakusa', 'minami-senju', 'kita-senju'],
  },
];

const PRESET_ROUTES_BY_SCOPE: Record<MapScope, PresetRoute[]> = {
  tokyo: TOKYO_PRESET_ROUTES,
  national: NATIONAL_PRESET_ROUTES,
};

const DEFAULT_PRESET_BY_SCOPE: Record<MapScope, PresetRoute> = {
  tokyo: TOKYO_PRESET_ROUTES[0],
  national: NATIONAL_PRESET_ROUTES[0],
};

const MAP_SCOPE_OPTIONS: Array<{ id: MapScope; label: string; description: string }> = [
  { id: 'tokyo', label: '東京近郊', description: '南千住・北千住など、都市内の駅間まで細かく設計。' },
  { id: 'national', label: '全国', description: '主要都市をつなぐ広域路線を設計。' },
];

const initialMapScope: MapScope = 'tokyo';
const initialPreset = DEFAULT_PRESET_BY_SCOPE[initialMapScope];
const railwayTheme = {
  '--railway-accent': '#0f766e',
  '--railway-accent-strong': '#0f5f59',
  '--railway-accent-soft': '#f59e0b',
} as CSSProperties;

function getDistance(from: Station, to: Station, mapScope: MapScope): number {
  const dx = (to.x - from.x) * 1.08;
  const dy = (to.y - from.y) * 1.24;
  return Math.hypot(dx, dy) * (mapScope === 'tokyo' ? 0.085 : 1.88);
}

function createSegments(routeStations: Station[], mapScope: MapScope): Segment[] {
  return routeStations.slice(0, -1).map((from, index) => {
    const to = routeStations[index + 1];
    return {
      from,
      to,
      distance: getDistance(from, to, mapScope),
      terrainFactor: (terrainCostFactor[from.terrain] + terrainCostFactor[to.terrain]) / 2,
    };
  });
}

function isRouteStop(
  station: Station,
  index: number,
  stationCount: number,
  serviceType: ServiceType,
): boolean {
  const isTerminal = index === 0 || index === stationCount - 1;
  if (isTerminal || serviceType === 'local') return true;
  if (serviceType === 'rapid') return station.demand >= 120 || index % 2 === 0;
  if (serviceType === 'express') return station.demand >= 165 || index % 3 === 0;
  return station.demand >= 210;
}

function getTrackOffsets(trackType: TrackType): number[] {
  if (trackType === 'single') return [0];
  if (trackType === 'double') return [-4, 4];
  return [-9, -3, 3, 9];
}

function getOffsetSegment(from: Station, to: Station, offset: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const offsetX = (-dy / length) * offset;
  const offsetY = (dx / length) * offset;
  return {
    x1: from.x + offsetX,
    y1: from.y + offsetY,
    x2: to.x + offsetX,
    y2: to.y + offsetY,
  };
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0分';
  if (minutes < 95) return `${Math.round(minutes)}分`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `${hours}時間${rest}分`;
}

function formatOku(value: number): string {
  const rounded = Math.round(value);
  return `${compactNumber(rounded)}億円`;
}

function getStationById(stations: Station[], id: string): Station | undefined {
  return stations.find((station) => station.id === id);
}

export default function RailwayPlannerPage() {
  const lifecycle = useFeatureLifecycle('tool.railway-planner');
  const svgRef = useRef<SVGSVGElement>(null);
  const [mapScope, setMapScope] = useState<MapScope>(initialMapScope);
  const [lineName, setLineName] = useState(initialPreset.lineName);
  const [routeStationIds, setRouteStationIds] = useState<string[]>(initialPreset.stationIds);
  const [customStations, setCustomStations] = useState<Station[]>([]);
  const [trackType, setTrackType] = useState<TrackType>('double');
  const [serviceType, setServiceType] = useState<ServiceType>('rapid');
  const [frequency, setFrequency] = useState(6);
  const [addMode, setAddMode] = useState(false);
  const [stationDraft, setStationDraft] = useState('新駅');
  const [showDemand, setShowDemand] = useState(true);

  const baseStations = mapScope === 'tokyo' ? TOKYO_STATIONS : NATIONAL_STATIONS;
  const activePresetRoutes = PRESET_ROUTES_BY_SCOPE[mapScope];
  const selectedScope = MAP_SCOPE_OPTIONS.find((option) => option.id === mapScope) ?? MAP_SCOPE_OPTIONS[0];
  const currentCustomStations = customStations.filter((station) => station.scope === mapScope);

  const allStations = useMemo(
    () => [
      ...(mapScope === 'tokyo' ? TOKYO_STATIONS : NATIONAL_STATIONS),
      ...customStations.filter((station) => station.scope === mapScope),
    ],
    [customStations, mapScope],
  );

  const routeStations = useMemo(
    () => routeStationIds
      .map((id) => getStationById(allStations, id))
      .filter((station): station is Station => Boolean(station)),
    [allStations, routeStationIds],
  );

  const routeSegments = useMemo(() => createSegments(routeStations, mapScope), [mapScope, routeStations]);

  const routeMetrics = useMemo(() => {
    const totalDistance = routeSegments.reduce((sum, segment) => sum + segment.distance, 0);
    const weightedTerrain = routeSegments.length && totalDistance > 0
      ? routeSegments.reduce((sum, segment) => sum + segment.terrainFactor * segment.distance, 0) / totalDistance
      : 1;
    const stopCount = routeStations.filter((station, index) => (
      isRouteStop(station, index, routeStations.length, serviceType)
    )).length;
    const service = SERVICE_OPTIONS[serviceType];
    const track = TRACK_OPTIONS[trackType];
    const effectiveSpeed = Math.max(42, service.speed + track.speedBonus);
    const singleTrackDelay = trackType === 'single' ? totalDistance / 92 : 0;
    const travelMinutes = totalDistance > 0
      ? (totalDistance / effectiveSpeed) * 60 + stopCount * service.stopPenalty + singleTrackDelay
      : 0;
    const constructionCostOku = totalDistance * 28 * track.costFactor * weightedTerrain;
    const dailyDemand = routeStations.reduce((sum, station, index) => {
      const stopWeight = isRouteStop(station, index, routeStations.length, serviceType) ? 1 : 0.42;
      return sum + station.demand * 96 * stopWeight;
    }, 0) * service.demandMultiplier * Math.min(1.45, 0.72 + frequency * 0.075);
    const capacityDaily = frequency * track.trainCapacity * 16 * 2;
    const congestionRate = capacityDaily > 0 ? (dailyDemand / capacityDaily) * 100 : 0;
    const averageFare = 210 + totalDistance * 5.2;
    const annualRevenueOku = (dailyDemand * averageFare * 365) / 100000000;
    const annualOperationOku = totalDistance * frequency * 0.0017 * 365 + routeStations.length * 0.72;
    const annualCapitalOku = constructionCostOku * 0.035;
    const annualBalanceOku = annualRevenueOku - annualOperationOku - annualCapitalOku;
    const score = Math.max(
      0,
      Math.min(
        100,
        38
          + Math.min(22, routeStations.length * 2.3)
          + Math.min(18, dailyDemand / 18000)
          + Math.min(14, effectiveSpeed / 9)
          - Math.max(0, (congestionRate - 115) / 4)
          + Math.max(-18, Math.min(8, annualBalanceOku / 45)),
      ),
    );

    return {
      totalDistance,
      weightedTerrain,
      stopCount,
      travelMinutes,
      constructionCostOku,
      dailyDemand,
      capacityDaily,
      congestionRate,
      annualRevenueOku,
      annualOperationOku,
      annualCapitalOku,
      annualBalanceOku,
      score,
    };
  }, [frequency, routeSegments, routeStations, serviceType, trackType]);

  const handleStationToggle = (stationId: string) => {
    const exists = routeStationIds.includes(stationId);
    lifecycle.trackEvent(exists ? 'station_remove' : 'station_add', { station_id: stationId });
    setRouteStationIds((current) => (
      current.includes(stationId)
        ? current.filter((id) => id !== stationId)
        : [...current, stationId]
    ));
  };

  const handleStationKeyDown = (event: KeyboardEvent<SVGGElement>, stationId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleStationToggle(stationId);
  };

  const handleMapCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!addMode) return;
    const stationName = stationDraft.trim();
    if (!stationName || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;
    const nextStation: Station = {
      id: `custom-${Date.now()}`,
      name: stationName.slice(0, 12),
      region: '計画駅',
      x: Math.max(18, Math.min(MAP_WIDTH - 18, x)),
      y: Math.max(18, Math.min(MAP_HEIGHT - 18, y)),
      demand: 118,
      terrain: 'urban',
      labelDx: 10,
      labelDy: -10,
      custom: true,
      scope: mapScope,
    };

    lifecycle.trackEvent('custom_station_add', { station_name_len: nextStation.name.length });
    setCustomStations((current) => [...current, nextStation]);
    setRouteStationIds((current) => [...current, nextStation.id]);
    const nextCustomNumber = currentCustomStations.length + 2;
    setStationDraft(`新駅${nextCustomNumber}`);
  };

  const handlePresetSelect = (preset: PresetRoute) => {
    lifecycle.trackEvent('preset_select', { preset_id: preset.id });
    setRouteStationIds(preset.stationIds);
    setLineName(preset.lineName);
  };

  const handleScopeChange = (nextScope: MapScope) => {
    if (nextScope === mapScope) return;
    const nextPreset = DEFAULT_PRESET_BY_SCOPE[nextScope];
    lifecycle.trackEvent('scope_change', { map_scope: nextScope });
    setMapScope(nextScope);
    setRouteStationIds(nextPreset.stationIds);
    setLineName(nextPreset.lineName);
    setAddMode(false);
    setStationDraft('新駅');
  };

  const handleClearRoute = () => {
    lifecycle.trackEvent('route_clear', { station_count: routeStationIds.length });
    setRouteStationIds([]);
  };

  const handleReset = () => {
    lifecycle.trackEvent('reset');
    setMapScope(initialMapScope);
    setLineName(initialPreset.lineName);
    setRouteStationIds(initialPreset.stationIds);
    setCustomStations([]);
    setTrackType('double');
    setServiceType('rapid');
    setFrequency(6);
    setAddMode(false);
    setStationDraft('新駅');
    setShowDemand(true);
  };

  const handleRemoveCustomStations = () => {
    lifecycle.trackEvent('custom_station_clear', { custom_station_count: currentCustomStations.length });
    const baseStationIds = new Set(baseStations.map((station) => station.id));
    setCustomStations((current) => current.filter((station) => station.scope !== mapScope));
    setRouteStationIds((current) => current.filter((id) => baseStationIds.has(id)));
  };

  const selectedTrack = TRACK_OPTIONS[trackType];
  const selectedService = SERVICE_OPTIONS[serviceType];

  return (
    <main className={styles.page} style={railwayTheme}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <Link href="/#tools" className={styles.backLink} aria-label="Toolsへ戻る">
              <ArrowLeft size={18} />
            </Link>
            <div className={styles.logoTile}>
              <Train size={28} />
            </div>
            <div>
              <p className={styles.eyebrow}>Tool / Railway Simulator</p>
              <h1 className={styles.title}>架空鉄道路線プランナー</h1>
              <p className={styles.subtitle}>
                日本地図に駅を置き、線路規格と列車種別を変えながら路線図と概算指標を確認できます。
              </p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Button
              type="button"
              variant="outline"
              className={styles.iconButton}
              onClick={handleReset}
            >
              <RotateCcw size={16} />
              初期化
            </Button>
          </div>
        </header>

        <section className={styles.metricsBar} aria-label="路線の主要指標">
          <div className={styles.metricTile}>
            <Activity size={18} />
            <span>評価</span>
            <strong>{Math.round(routeMetrics.score)}</strong>
          </div>
          <div className={styles.metricTile}>
            <Clock size={18} />
            <span>所要時間</span>
            <strong>{formatMinutes(routeMetrics.travelMinutes)}</strong>
          </div>
          <div className={styles.metricTile}>
            <Users size={18} />
            <span>需要</span>
            <strong>{(routeMetrics.dailyDemand / 10000).toFixed(1)}万人/日</strong>
          </div>
          <div className={styles.metricTile}>
            <Wallet size={18} />
            <span>年次収支</span>
            <strong className={routeMetrics.annualBalanceOku >= 0 ? styles.positive : styles.negative}>
              {formatOku(routeMetrics.annualBalanceOku)}
            </strong>
          </div>
        </section>

        <section className={styles.workspace}>
          <aside className={styles.controlPanel} aria-label="路線設定">
            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <Train size={17} />
                路線設定
              </div>
              <div className={styles.controlGroup}>
                <span className={styles.groupLabel}>表示範囲</span>
                <div className={styles.scopeButtons}>
                  {MAP_SCOPE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.segmentButton} ${mapScope === option.id ? styles.segmentButtonActive : ''}`}
                      onClick={() => handleScopeChange(option.id)}
                      aria-pressed={mapScope === option.id}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className={styles.helperText}>{selectedScope.description}</p>
              </div>
              <label className={styles.field}>
                <span>路線名</span>
                <Input
                  value={lineName}
                  onChange={(event) => setLineName(event.target.value)}
                  className={styles.textInput}
                  maxLength={32}
                />
              </label>

              <div className={styles.controlGroup}>
                <span className={styles.groupLabel}>線路規格</span>
                <div className={styles.segmented}>
                  {(Object.keys(TRACK_OPTIONS) as TrackType[]).map((optionId) => (
                    <button
                      key={optionId}
                      type="button"
                      className={`${styles.segmentButton} ${trackType === optionId ? styles.segmentButtonActive : ''}`}
                      onClick={() => {
                        lifecycle.trackEvent('track_change', { track_type: optionId });
                        setTrackType(optionId);
                      }}
                      aria-pressed={trackType === optionId}
                    >
                      <Circle size={13} fill={TRACK_OPTIONS[optionId].color} color={TRACK_OPTIONS[optionId].color} />
                      {TRACK_OPTIONS[optionId].label}
                    </button>
                  ))}
                </div>
                <p className={styles.helperText}>{selectedTrack.description}</p>
              </div>

              <div className={styles.controlGroup}>
                <span className={styles.groupLabel}>列車種別</span>
                <div className={styles.segmented}>
                  {(Object.keys(SERVICE_OPTIONS) as ServiceType[]).map((optionId) => (
                    <button
                      key={optionId}
                      type="button"
                      className={`${styles.segmentButton} ${serviceType === optionId ? styles.segmentButtonActive : ''}`}
                      onClick={() => {
                        lifecycle.trackEvent('service_change', { service_type: optionId });
                        setServiceType(optionId);
                      }}
                      aria-pressed={serviceType === optionId}
                    >
                      <Zap size={14} color={SERVICE_OPTIONS[optionId].color} />
                      {SERVICE_OPTIONS[optionId].label}
                    </button>
                  ))}
                </div>
              </div>

              <label className={styles.rangeField}>
                <span>
                  運転本数
                  <strong>{frequency}本/時</strong>
                </span>
                <input
                  type="range"
                  min="1"
                  max="18"
                  value={frequency}
                  className={styles.rangeInput}
                  onChange={(event) => setFrequency(Number(event.target.value))}
                />
              </label>
            </section>

            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <MapPin size={17} />
                駅とルート
              </div>
              <div className={styles.presetGrid}>
                {activePresetRoutes.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={styles.presetButton}
                    onClick={() => handlePresetSelect(preset)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              <div className={styles.addStationBox}>
                <label className={styles.field}>
                  <span>追加する駅名</span>
                  <Input
                    value={stationDraft}
                    onChange={(event) => setStationDraft(event.target.value)}
                    className={styles.textInput}
                    maxLength={12}
                  />
                </label>
                <Button
                  type="button"
                  variant={addMode ? 'default' : 'outline'}
                  className={addMode ? styles.primaryButton : styles.secondaryButton}
                  onClick={() => setAddMode((current) => !current)}
                >
                  <Plus size={16} />
                  地図に駅を置く
                </Button>
              </div>

              <div className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.toggleButton} ${showDemand ? styles.toggleButtonActive : ''}`}
                  onClick={() => setShowDemand((current) => !current)}
                  aria-pressed={showDemand}
                >
                  需要ヒート表示
                </button>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={handleClearRoute}
                >
                  <Trash2 size={15} />
                  ルート消去
                </button>
              </div>

              {currentCustomStations.length > 0 && (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={handleRemoveCustomStations}
                >
                  <Trash2 size={15} />
                  追加駅をすべて削除
                </button>
              )}
            </section>

            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <MapPin size={17} />
                選択中の駅
              </div>
              {routeStations.length === 0 ? (
                <p className={styles.emptyText}>地図上の駅をクリックすると、ここにルート順で追加されます。</p>
              ) : (
                <ol className={styles.stationOrder}>
                  {routeStations.map((station, index) => (
                    <li key={station.id}>
                      <span className={styles.stationIndex}>{index + 1}</span>
                      <span className={styles.stationOrderName}>{station.name}</span>
                      <button
                        type="button"
                        aria-label={`${station.name}を外す`}
                        onClick={() => handleStationToggle(station.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>

          <section className={styles.mapPanel} aria-label={mapScope === 'tokyo' ? '東京近郊地図' : '日本地図'}>
            <div className={styles.mapHeader}>
              <div>
                <h2>{lineName || '無名路線'}</h2>
                <p>
                  {selectedScope.label} / {selectedTrack.label} / {selectedService.label} / {routeStations.length}駅
                </p>
              </div>
              {addMode && <span className={styles.addModeBadge}>地図クリックで駅追加</span>}
            </div>

            <svg
              ref={svgRef}
              className={styles.mapSvg}
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              role="img"
              aria-label={mapScope === 'tokyo' ? '東京近郊地図上の架空鉄道路線' : '日本地図上の架空鉄道路線'}
              onClick={handleMapCanvasClick}
            >
              <defs>
                <pattern id="railway-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" className={styles.gridLine} />
                </pattern>
                <linearGradient id="land-gradient" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ecfdf5" />
                  <stop offset="52%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#fff7ed" />
                </linearGradient>
              </defs>
              <rect width={MAP_WIDTH} height={MAP_HEIGHT} className={styles.mapOcean} />
              <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#railway-grid)" opacity="0.42" />
              {mapScope === 'national' ? (
                <g className={styles.landLayer}>
                  <path d="M482 61 C517 37 565 51 585 82 C604 112 576 153 537 165 C497 178 458 153 452 118 C448 92 462 75 482 61 Z" />
                  <path d="M493 212 C526 257 520 323 489 372 C506 399 511 428 492 456 C477 478 457 493 433 504 C397 520 356 528 318 542 C282 558 246 575 207 575 C181 574 178 548 205 532 C249 506 300 500 333 477 C366 455 383 415 410 383 C438 350 455 312 450 275 C445 242 464 220 493 212 Z" />
                  <path d="M235 590 C277 576 315 584 331 606 C313 628 263 631 228 613 C218 603 224 594 235 590 Z" />
                  <path d="M121 594 C158 574 198 590 210 627 C221 662 196 708 157 725 C119 741 88 716 93 676 C97 641 100 611 121 594 Z" />
                  <path d="M61 708 C82 694 107 701 118 719 C105 739 72 746 51 729 C43 721 48 713 61 708 Z" />
                </g>
              ) : (
                <>
                  <g className={styles.landLayer}>
                    <path d="M62 72 C141 16 256 34 330 74 C410 118 492 96 566 142 C627 181 621 274 580 340 C548 392 550 461 585 520 C608 560 586 626 532 662 C460 710 358 724 268 696 C187 671 115 626 75 551 C34 474 26 371 46 288 C62 220 18 127 62 72 Z" />
                    <path className={styles.bayShape} d="M346 475 C398 463 453 481 491 519 C452 560 393 592 326 596 C306 554 309 504 346 475 Z" />
                  </g>
                  <g className={styles.tokyoGuideLayer}>
                    <path className={styles.riverLine} d="M190 92 C254 166 323 217 382 220 C432 223 486 195 591 119" />
                    <path className={styles.riverLine} d="M345 266 C365 314 374 374 392 414 C415 463 447 513 491 552" />
                    <path className={styles.wardBoundary} d="M156 382 C239 352 329 356 432 378 C508 396 560 440 595 506" />
                    <text x="392" y="205" className={styles.mapAreaLabel}>荒川</text>
                    <text x="410" y="386" className={styles.mapAreaLabel}>隅田川</text>
                    <text x="412" y="556" className={styles.mapAreaLabel}>東京湾</text>
                  </g>
                </>
              )}

              <g className={styles.routeLayer}>
                {routeSegments.map((segment, index) => (
                  <g key={`${segment.from.id}-${segment.to.id}-${index}`}>
                    <line
                      x1={segment.from.x}
                      y1={segment.from.y}
                      x2={segment.to.x}
                      y2={segment.to.y}
                      className={styles.routeHalo}
                    />
                    {getTrackOffsets(trackType).map((offset) => {
                      const line = getOffsetSegment(segment.from, segment.to, offset);
                      return (
                        <line
                          key={offset}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                          className={styles.trackLine}
                          style={{ stroke: selectedTrack.color }}
                        />
                      );
                    })}
                    <line
                      x1={segment.from.x}
                      y1={segment.from.y}
                      x2={segment.to.x}
                      y2={segment.to.y}
                      className={styles.serviceLine}
                      stroke={selectedService.color}
                      strokeDasharray={selectedService.dashArray}
                    />
                  </g>
                ))}
              </g>

              <g className={styles.stationLayer}>
                {allStations.map((station) => {
                  const routeIndex = routeStationIds.indexOf(station.id);
                  const inRoute = routeIndex >= 0;
                  const isTerminal = routeIndex === 0 || routeIndex === routeStationIds.length - 1;
                  const stopsHere = inRoute && isRouteStop(station, routeIndex, routeStations.length, serviceType);
                  const labelX = station.x + (station.labelDx ?? 10);
                  const labelY = station.y + (station.labelDy ?? -10);
                  return (
                    <g
                      key={station.id}
                      role="button"
                      tabIndex={0}
                      className={`${styles.stationButton} ${inRoute ? styles.stationSelected : ''}`}
                      aria-label={`${station.name}を${inRoute ? 'ルートから外す' : 'ルートに追加'}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleStationToggle(station.id);
                      }}
                      onKeyDown={(event) => handleStationKeyDown(event, station.id)}
                    >
                      {showDemand && (
                        <circle
                          cx={station.x}
                          cy={station.y}
                          r={Math.max(10, Math.min(24, station.demand / 12))}
                          className={styles.demandCircle}
                        />
                      )}
                      <circle
                        cx={station.x}
                        cy={station.y}
                        r={inRoute ? (isTerminal ? 8.5 : 6.8) : 4.5}
                        className={styles.stationDot}
                      />
                      {stopsHere && (
                        <circle
                          cx={station.x}
                          cy={station.y}
                          r={inRoute ? 12 : 8}
                          className={styles.stopRing}
                        />
                      )}
                      {inRoute && (
                        <text x={station.x} y={station.y + 3.5} className={styles.routeIndexText}>
                          {routeIndex + 1}
                        </text>
                      )}
                      <text x={labelX} y={labelY} className={styles.stationLabel}>
                        {station.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </section>

          <aside className={styles.diagramPanel} aria-label="路線図と採算">
            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <Train size={17} />
                路線図
              </div>
              <div className={styles.diagramMeta}>
                <span style={{ '--service-color': selectedService.color } as CSSProperties}>
                  {selectedService.shortLabel}
                </span>
                <strong>{lineName || '無名路線'}</strong>
              </div>
              {routeStations.length < 2 ? (
                <p className={styles.emptyText}>2駅以上を選ぶと路線図が表示されます。</p>
              ) : (
                <ol className={styles.routeDiagram}>
                  {routeStations.map((station, index) => {
                    const stopsHere = isRouteStop(station, index, routeStations.length, serviceType);
                    return (
                      <li key={station.id} className={stopsHere ? styles.stopStation : styles.passStation}>
                        <span className={styles.diagramLine} />
                        <span className={styles.diagramMarker}>
                          {stopsHere ? selectedService.shortLabel : ''}
                        </span>
                        <span className={styles.diagramName}>{station.name}</span>
                        <span className={styles.diagramRegion}>{station.region}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <Activity size={17} />
                シミュレーション
              </div>
              <div className={styles.simRows}>
                <div>
                  <span>総延長</span>
                  <strong>{compactNumber(routeMetrics.totalDistance)}km</strong>
                </div>
                <div>
                  <span>停車駅</span>
                  <strong>{routeMetrics.stopCount}/{routeStations.length}駅</strong>
                </div>
                <div>
                  <span>建設費</span>
                  <strong>{formatOku(routeMetrics.constructionCostOku)}</strong>
                </div>
                <div>
                  <span>年間売上</span>
                  <strong>{formatOku(routeMetrics.annualRevenueOku)}</strong>
                </div>
              </div>

              <div className={styles.progressGroup}>
                <div className={styles.progressHeader}>
                  <span>混雑率</span>
                  <strong>{Math.round(routeMetrics.congestionRate)}%</strong>
                </div>
                <div className={styles.progressTrack}>
                  <span
                    className={styles.progressFill}
                    style={{ width: `${Math.min(100, routeMetrics.congestionRate)}%` }}
                  />
                </div>
              </div>

              <div className={styles.balanceBox}>
                <span>年次収支</span>
                <strong className={routeMetrics.annualBalanceOku >= 0 ? styles.positive : styles.negative}>
                  {formatOku(routeMetrics.annualBalanceOku)}
                </strong>
                <p>
                  売上から運行費と建設費の年換算分を引いた概算です。停車駅を増やすと需要は拾えますが、所要時間が伸びます。
                </p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
