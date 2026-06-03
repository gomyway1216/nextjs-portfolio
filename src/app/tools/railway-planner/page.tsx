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
  Minus,
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
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { NATIONAL_LAND_PATHS } from './nationalLandPaths';
import styles from './railway-planner.module.css';

const MAP_WIDTH = 620;
const MAP_HEIGHT = 760;
const MAP_ASPECT_RATIO = MAP_HEIGHT / MAP_WIDTH;
const MAX_MAP_ZOOM = 24;
const MIN_MAP_VIEW_WIDTH = MAP_WIDTH / MAX_MAP_ZOOM;
const GUIDE_LABEL_FONT_SIZE = 13;
const STATION_LABEL_FONT_SIZE = 12;
const DETAIL_STATION_LABEL_FONT_SIZE = 10;
const ROUTE_INDEX_FONT_SIZE = 8;
const NATIONAL_ROUTE_DENSE_LABEL_ZOOM = 6.4;
const NATIONAL_DETAIL_LABEL_ZOOM = 8.2;
const NATIONAL_MAJOR_ROUTE_LABEL_DEMAND = 170;
const DEFAULT_MAP_VIEW: MapViewBox = {
  x: 0,
  y: 0,
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
};

type TerrainType = 'plain' | 'urban' | 'mountain' | 'coastal';
type TrackType = 'single' | 'double' | 'quad';
type ServiceType = 'local' | 'rapid' | 'express' | 'limited';
type MapScope = 'prefecture' | 'national';
type RailwayPlaceKind = 'station' | 'city' | 'town' | 'district' | 'landmark';

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
  minZoom?: number;
  labelMinZoom?: number;
  custom?: boolean;
  scope?: MapScope;
  prefectureId?: string;
}

interface RailwayPlaceSearchResult {
  id: string;
  name: string;
  kind: RailwayPlaceKind;
  prefecture: string;
  municipality?: string;
  address: string;
  latitude: number;
  longitude: number;
  source: string;
  sourceLayer: 'seed' | 'firestore' | 'external';
  confidence?: number;
}

interface RailwayPlaceSearchResponse {
  success: boolean;
  results?: RailwayPlaceSearchResult[];
  error?: string;
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
  distanceScale?: number;
}

interface MapViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MapDragState {
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
  pointerId: number;
}

interface PrefectureZoom {
  id: string;
  label: string;
  description: string;
  distanceScale: number;
  stations: Station[];
  presets: PresetRoute[];
}

interface PrefectureDefinition {
  id: string;
  label: string;
  lineName: string;
  stationNames: readonly [string, string, string, string, string];
  defaultTerrain?: TerrainType;
  distanceScale?: number;
}

type RailTranslate = (key: string, options?: Record<string, number | string>) => string;

const terrainCostFactor: Record<TerrainType, number> = {
  plain: 1,
  urban: 1.32,
  mountain: 1.62,
  coastal: 1.12,
};

const JAPAN_GEO_BOUNDS = {
  minLon: 123.679785,
  maxLon: 145.833008,
  minLat: 24.266064,
  maxLat: 45.509521,
};
const JAPAN_GEO_PADDING_X = 38;
const JAPAN_GEO_PADDING_Y = 42;
const MERCATOR_MIN_X = (JAPAN_GEO_BOUNDS.minLon * Math.PI) / 180;
const MERCATOR_MAX_X = (JAPAN_GEO_BOUNDS.maxLon * Math.PI) / 180;
const MERCATOR_MIN_Y = getMercatorY(JAPAN_GEO_BOUNDS.minLat);
const MERCATOR_MAX_Y = getMercatorY(JAPAN_GEO_BOUNDS.maxLat);
const JAPAN_GEO_SCALE = Math.min(
  (MAP_WIDTH - JAPAN_GEO_PADDING_X * 2) / (MERCATOR_MAX_X - MERCATOR_MIN_X),
  (MAP_HEIGHT - JAPAN_GEO_PADDING_Y * 2) / (MERCATOR_MAX_Y - MERCATOR_MIN_Y),
);
const JAPAN_GEO_USED_WIDTH = (MERCATOR_MAX_X - MERCATOR_MIN_X) * JAPAN_GEO_SCALE;
const JAPAN_GEO_USED_HEIGHT = (MERCATOR_MAX_Y - MERCATOR_MIN_Y) * JAPAN_GEO_SCALE;
const JAPAN_GEO_OFFSET_X = (MAP_WIDTH - JAPAN_GEO_USED_WIDTH) / 2;
const JAPAN_GEO_OFFSET_Y = (MAP_HEIGHT - JAPAN_GEO_USED_HEIGHT) / 2;

const NATIONAL_OVERVIEW_STATION_IDS = new Set([
  'sapporo',
  'sendai',
  'tokyo',
  'yokohama',
  'nagoya',
  'osaka',
  'fukuoka',
  'naha',
]);
const NATIONAL_OVERVIEW_ZOOM = 1.6;

function getMercatorY(latitude: number): number {
  const radians = (latitude * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function projectJapanCoordinate(longitude: number, latitude: number): { x: number; y: number } {
  const x = JAPAN_GEO_OFFSET_X + (((longitude * Math.PI) / 180) - MERCATOR_MIN_X) * JAPAN_GEO_SCALE;
  const y = JAPAN_GEO_OFFSET_Y + (MERCATOR_MAX_Y - getMercatorY(latitude)) * JAPAN_GEO_SCALE;

  return {
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1)),
  };
}

function createNationalStation(station: Omit<Station, 'x' | 'y'> & { longitude: number; latitude: number }): Station {
  const { longitude, latitude, ...stationData } = station;
  return {
    ...stationData,
    ...projectJapanCoordinate(longitude, latitude),
  };
}

function getTerrainForPlaceKind(kind: RailwayPlaceKind): TerrainType {
  if (kind === 'station' || kind === 'city' || kind === 'district') return 'urban';
  if (kind === 'landmark') return 'plain';
  return 'plain';
}

function getDemandForPlaceKind(kind: RailwayPlaceKind): number {
  if (kind === 'station') return 128;
  if (kind === 'city') return 142;
  if (kind === 'town' || kind === 'district') return 108;
  return 92;
}

function formatPlaceRegion(place: RailwayPlaceSearchResult): string {
  return [place.prefecture, place.municipality].filter(Boolean).join(' / ') || place.address;
}

function isDefaultStationSearchDraft(value: string, defaultDraft: string): boolean {
  const query = value.trim();
  return (
    !query
    || query === defaultDraft.trim()
    || /^新駅\d*$/u.test(query)
    || /^New Station\s*\d*$/iu.test(query)
  );
}

const NATIONAL_STATIONS: Station[] = [
  createNationalStation({ id: 'sapporo', name: '札幌', region: '北海道', longitude: 141.3545, latitude: 43.0618, demand: 190, terrain: 'urban', labelDx: 12, labelDy: -8 }),
  createNationalStation({ id: 'hakodate', name: '函館', region: '北海道', longitude: 140.7288, latitude: 41.7687, demand: 105, terrain: 'coastal', labelDx: -42, labelDy: 0 }),
  createNationalStation({ id: 'aomori', name: '青森', region: '東北', longitude: 140.7347, latitude: 40.8222, demand: 96, terrain: 'coastal', labelDx: 10, labelDy: -8 }),
  createNationalStation({ id: 'morioka', name: '盛岡', region: '東北', longitude: 141.1527, latitude: 39.7036, demand: 110, terrain: 'mountain', labelDx: 12, labelDy: 2 }),
  createNationalStation({ id: 'sendai', name: '仙台', region: '東北', longitude: 140.8719, latitude: 38.2682, demand: 170, terrain: 'urban', labelDx: 12, labelDy: -6 }),
  createNationalStation({ id: 'niigata', name: '新潟', region: '北陸', longitude: 139.0236, latitude: 37.9161, demand: 128, terrain: 'coastal', labelDx: -42, labelDy: 1 }),
  createNationalStation({ id: 'kanazawa', name: '金沢', region: '北陸', longitude: 136.6562, latitude: 36.5613, demand: 118, terrain: 'coastal', labelDx: -43, labelDy: -2 }),
  createNationalStation({ id: 'tokyo', name: '東京', region: '関東', longitude: 139.7671, latitude: 35.6812, demand: 320, terrain: 'urban', labelDx: 12, labelDy: -10 }),
  createNationalStation({ id: 'yokohama', name: '横浜', region: '関東', longitude: 139.638, latitude: 35.4437, demand: 245, terrain: 'urban', labelDx: 12, labelDy: 12 }),
  createNationalStation({ id: 'shizuoka', name: '静岡', region: '中部', longitude: 138.3831, latitude: 34.9756, demand: 112, terrain: 'coastal', labelDx: 8, labelDy: 16 }),
  createNationalStation({ id: 'nagoya', name: '名古屋', region: '中部', longitude: 136.8815, latitude: 35.1709, demand: 210, terrain: 'urban', labelDx: -55, labelDy: 0 }),
  createNationalStation({ id: 'kyoto', name: '京都', region: '関西', longitude: 135.7588, latitude: 34.9858, demand: 175, terrain: 'urban', labelDx: 8, labelDy: -18 }),
  createNationalStation({ id: 'osaka', name: '大阪', region: '関西', longitude: 135.4959, latitude: 34.7025, demand: 255, terrain: 'urban', labelDx: -50, labelDy: 6 }),
  createNationalStation({ id: 'kobe', name: '神戸', region: '関西', longitude: 135.1955, latitude: 34.6901, demand: 154, terrain: 'coastal', labelDx: -42, labelDy: 16 }),
  createNationalStation({ id: 'okayama', name: '岡山', region: '中国', longitude: 133.917, latitude: 34.665, demand: 116, terrain: 'plain', labelDx: -43, labelDy: -8 }),
  createNationalStation({ id: 'hiroshima', name: '広島', region: '中国', longitude: 132.475, latitude: 34.397, demand: 152, terrain: 'coastal', labelDx: -45, labelDy: 4 }),
  createNationalStation({ id: 'matsuyama', name: '松山', region: '四国', longitude: 132.765, latitude: 33.839, demand: 92, terrain: 'coastal', labelDx: 9, labelDy: 14 }),
  createNationalStation({ id: 'fukuoka', name: '福岡', region: '九州', longitude: 130.421, latitude: 33.59, demand: 198, terrain: 'urban', labelDx: -45, labelDy: -5 }),
  createNationalStation({ id: 'kumamoto', name: '熊本', region: '九州', longitude: 130.707, latitude: 32.789, demand: 112, terrain: 'plain', labelDx: 10, labelDy: 8 }),
  createNationalStation({ id: 'kagoshima', name: '鹿児島', region: '九州', longitude: 130.541, latitude: 31.596, demand: 104, terrain: 'coastal', labelDx: 10, labelDy: 8 }),
  createNationalStation({ id: 'naha', name: '那覇', region: '沖縄', longitude: 127.679, latitude: 26.212, demand: 132, terrain: 'coastal', labelDx: 10, labelDy: -10 }),
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

const NATIONAL_DETAIL_STATIONS: Station[] = [
  createNationalStation({ id: 'kanda', name: '神田', region: '山手線', longitude: 139.7709, latitude: 35.6917, demand: 142, terrain: 'urban', labelDx: 4, labelDy: -4, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'akihabara', name: '秋葉原', region: '山手線', longitude: 139.773, latitude: 35.6984, demand: 176, terrain: 'urban', labelDx: -28, labelDy: -4, minZoom: 3.8, labelMinZoom: 4.8 }),
  createNationalStation({ id: 'okachimachi', name: '御徒町', region: '山手線', longitude: 139.7745, latitude: 35.7074, demand: 106, terrain: 'urban', labelDx: 4, labelDy: -4, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'ueno', name: '上野', region: '山手線・常磐線', longitude: 139.777, latitude: 35.7138, demand: 180, terrain: 'urban', labelDx: 4, labelDy: -4, minZoom: 2.4, labelMinZoom: 3.2 }),
  createNationalStation({ id: 'uguisudani', name: '鶯谷', region: '山手線', longitude: 139.778, latitude: 35.7215, demand: 74, terrain: 'urban', labelDx: 4, labelDy: -4, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'nippori', name: '日暮里', region: '山手線・常磐線', longitude: 139.7714, latitude: 35.7278, demand: 142, terrain: 'urban', labelDx: 4, labelDy: -4, minZoom: 3.2, labelMinZoom: 4.2 }),
  createNationalStation({ id: 'nishi-nippori', name: '西日暮里', region: '山手線', longitude: 139.7669, latitude: 35.7319, demand: 126, terrain: 'urban', labelDx: -34, labelDy: -4, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'tabata', name: '田端', region: '山手線', longitude: 139.7612, latitude: 35.738, demand: 118, terrain: 'urban', labelDx: -28, labelDy: 2, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'komagome', name: '駒込', region: '山手線', longitude: 139.748, latitude: 35.7365, demand: 104, terrain: 'urban', labelDx: -30, labelDy: 4, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'sugamo', name: '巣鴨', region: '山手線', longitude: 139.7393, latitude: 35.7335, demand: 112, terrain: 'urban', labelDx: -26, labelDy: 4, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'otsuka', name: '大塚', region: '山手線', longitude: 139.7286, latitude: 35.7314, demand: 98, terrain: 'urban', labelDx: -26, labelDy: 4, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'ikebukuro', name: '池袋', region: '山手線', longitude: 139.7109, latitude: 35.7295, demand: 255, terrain: 'urban', labelDx: -26, labelDy: -5, minZoom: 2.8, labelMinZoom: 3.5 }),
  createNationalStation({ id: 'mejiro', name: '目白', region: '山手線', longitude: 139.7062, latitude: 35.7212, demand: 88, terrain: 'urban', labelDx: -26, labelDy: 5, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'takadanobaba', name: '高田馬場', region: '山手線', longitude: 139.7037, latitude: 35.7123, demand: 154, terrain: 'urban', labelDx: -42, labelDy: 4, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'shin-okubo', name: '新大久保', region: '山手線', longitude: 139.7003, latitude: 35.7013, demand: 86, terrain: 'urban', labelDx: -38, labelDy: 5, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'shinjuku', name: '新宿', region: '山手線', longitude: 139.7005, latitude: 35.6909, demand: 284, terrain: 'urban', labelDx: -27, labelDy: 4, minZoom: 2.4, labelMinZoom: 3.2 }),
  createNationalStation({ id: 'yoyogi', name: '代々木', region: '山手線', longitude: 139.702, latitude: 35.6831, demand: 94, terrain: 'urban', labelDx: -28, labelDy: 8, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'harajuku', name: '原宿', region: '山手線', longitude: 139.7026, latitude: 35.6702, demand: 96, terrain: 'urban', labelDx: -28, labelDy: 8, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'shibuya', name: '渋谷', region: '山手線', longitude: 139.7016, latitude: 35.658, demand: 224, terrain: 'urban', labelDx: -27, labelDy: 8, minZoom: 2.8, labelMinZoom: 3.5 }),
  createNationalStation({ id: 'ebisu', name: '恵比寿', region: '山手線', longitude: 139.7101, latitude: 35.6467, demand: 116, terrain: 'urban', labelDx: -32, labelDy: 8, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'meguro', name: '目黒', region: '山手線', longitude: 139.7154, latitude: 35.6339, demand: 112, terrain: 'urban', labelDx: -27, labelDy: 10, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'gotanda', name: '五反田', region: '山手線', longitude: 139.7238, latitude: 35.6264, demand: 118, terrain: 'urban', labelDx: 4, labelDy: 12, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'osaki', name: '大崎', region: '山手線', longitude: 139.7284, latitude: 35.6197, demand: 126, terrain: 'urban', labelDx: 4, labelDy: 10, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'shinagawa', name: '品川', region: '山手線', longitude: 139.7388, latitude: 35.6285, demand: 205, terrain: 'urban', labelDx: 4, labelDy: 9, minZoom: 2.8, labelMinZoom: 3.5 }),
  createNationalStation({ id: 'takanawa-gateway', name: '高輪ゲートウェイ', region: '山手線', longitude: 139.7407, latitude: 35.6355, demand: 84, terrain: 'urban', labelDx: 4, labelDy: 8, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'tamachi', name: '田町', region: '山手線', longitude: 139.7476, latitude: 35.6457, demand: 116, terrain: 'urban', labelDx: 5, labelDy: 6, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'hamamatsucho', name: '浜松町', region: '山手線', longitude: 139.7571, latitude: 35.6553, demand: 112, terrain: 'urban', labelDx: 5, labelDy: 4, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'shimbashi', name: '新橋', region: '山手線', longitude: 139.7586, latitude: 35.6663, demand: 152, terrain: 'urban', labelDx: 5, labelDy: 2, minZoom: 3.8, labelMinZoom: 4.8 }),
  createNationalStation({ id: 'yurakucho', name: '有楽町', region: '山手線', longitude: 139.763, latitude: 35.675, demand: 132, terrain: 'urban', labelDx: 5, labelDy: 8, minZoom: 5.2, labelMinZoom: 6.2 }),
  createNationalStation({ id: 'minami-senju', name: '南千住', region: '常磐線', longitude: 139.799, latitude: 35.733, demand: 112, terrain: 'urban', labelDx: 5, labelDy: -5, minZoom: 3.8, labelMinZoom: 4.8 }),
  createNationalStation({ id: 'kita-senju', name: '北千住', region: '常磐線', longitude: 139.805, latitude: 35.749, demand: 170, terrain: 'urban', labelDx: 5, labelDy: -5, minZoom: 2.8, labelMinZoom: 3.5 }),
  createNationalStation({ id: 'ayase', name: '綾瀬', region: '常磐線各駅停車', longitude: 139.825, latitude: 35.762, demand: 126, terrain: 'urban', labelDx: 5, labelDy: -5, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'kameari', name: '亀有', region: '常磐線各駅停車', longitude: 139.847, latitude: 35.766, demand: 104, terrain: 'urban', labelDx: 5, labelDy: -5, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'kanamachi', name: '金町', region: '常磐線各駅停車', longitude: 139.87, latitude: 35.769, demand: 108, terrain: 'urban', labelDx: 5, labelDy: -5, minZoom: 4.4, labelMinZoom: 5.4 }),
  createNationalStation({ id: 'matsudo', name: '松戸', region: '常磐線', longitude: 139.9, latitude: 35.784, demand: 128, terrain: 'urban', labelDx: 5, labelDy: -5, minZoom: 2.8, labelMinZoom: 3.5 }),
  createNationalStation({ id: 'kashiwa', name: '柏', region: '常磐線', longitude: 139.97, latitude: 35.862, demand: 142, terrain: 'urban', labelDx: 5, labelDy: -5, minZoom: 3.2, labelMinZoom: 4.2 }),
  createNationalStation({ id: 'abiko', name: '我孫子', region: '常磐線', longitude: 140.012, latitude: 35.872, demand: 98, terrain: 'urban', labelDx: 5, labelDy: -5, minZoom: 4.0, labelMinZoom: 5.0 }),
  createNationalStation({ id: 'toride', name: '取手', region: '常磐線', longitude: 140.063, latitude: 35.897, demand: 92, terrain: 'plain', labelDx: 5, labelDy: -5, minZoom: 4.0, labelMinZoom: 5.0 }),
  createNationalStation({ id: 'ushiku', name: '牛久', region: '常磐線', longitude: 140.142, latitude: 35.975, demand: 74, terrain: 'plain', labelDx: 5, labelDy: -5, minZoom: 4.8, labelMinZoom: 5.8 }),
  createNationalStation({ id: 'tsuchiura', name: '土浦', region: '常磐線', longitude: 140.207, latitude: 36.078, demand: 82, terrain: 'plain', labelDx: 5, labelDy: -5, minZoom: 4.0, labelMinZoom: 5.0 }),
  createNationalStation({ id: 'mito', name: '水戸', region: '常磐線', longitude: 140.476, latitude: 36.371, demand: 118, terrain: 'plain', labelDx: 5, labelDy: -6, minZoom: 2.8, labelMinZoom: 3.5 }),
];

const NATIONAL_BASE_STATIONS = [...NATIONAL_STATIONS, ...NATIONAL_DETAIL_STATIONS];

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
    id: 'joban-national',
    name: '常磐線例',
    lineName: '常磐線シミュレーション',
    stationIds: ['tokyo', 'ueno', 'nippori', 'minami-senju', 'kita-senju', 'matsudo', 'kashiwa', 'abiko', 'toride', 'ushiku', 'tsuchiura', 'mito'],
    distanceScale: 1.04,
  },
  {
    id: 'yamanote-loop',
    name: '山手線',
    lineName: '山手線シミュレーション',
    stationIds: ['tokyo', 'kanda', 'akihabara', 'okachimachi', 'ueno', 'uguisudani', 'nippori', 'nishi-nippori', 'tabata', 'komagome', 'sugamo', 'otsuka', 'ikebukuro', 'mejiro', 'takadanobaba', 'shin-okubo', 'shinjuku', 'yoyogi', 'harajuku', 'shibuya', 'ebisu', 'meguro', 'gotanda', 'osaki', 'shinagawa', 'takanawa-gateway', 'tamachi', 'hamamatsucho', 'shimbashi', 'yurakucho', 'tokyo'],
    distanceScale: 0.34,
  },
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

const PREFECTURE_STATION_LAYOUT = [
  { x: 316, y: 382, demandFactor: 1.35, labelDx: 12, labelDy: -8 },
  { x: 258, y: 236, demandFactor: 0.92, labelDx: -48, labelDy: -8 },
  { x: 454, y: 298, demandFactor: 0.88, labelDx: 10, labelDy: -4 },
  { x: 382, y: 540, demandFactor: 0.84, labelDx: 12, labelDy: 12 },
  { x: 176, y: 452, demandFactor: 0.8, labelDx: -48, labelDy: 8 },
] as const;

const PREFECTURE_DEFINITIONS: PrefectureDefinition[] = [
  { id: 'hokkaido', label: '北海道', lineName: '北海道クロスライン', stationNames: ['札幌', '小樽', '岩見沢', '千歳', '苫小牧'], defaultTerrain: 'plain', distanceScale: 0.42 },
  { id: 'aomori', label: '青森県', lineName: '青森りんごライン', stationNames: ['青森', '弘前', '八戸', '新青森', '五所川原'], defaultTerrain: 'coastal', distanceScale: 0.2 },
  { id: 'iwate', label: '岩手県', lineName: '岩手銀河ライン', stationNames: ['盛岡', '花巻', '北上', '一ノ関', '宮古'], defaultTerrain: 'mountain', distanceScale: 0.25 },
  { id: 'miyagi', label: '宮城県', lineName: '仙台ベイライン', stationNames: ['仙台', '石巻', '古川', '白石', '名取'], defaultTerrain: 'coastal', distanceScale: 0.18 },
  { id: 'akita', label: '秋田県', lineName: '秋田こまちライン', stationNames: ['秋田', '大曲', '横手', '能代', '角館'], defaultTerrain: 'plain', distanceScale: 0.2 },
  { id: 'yamagata', label: '山形県', lineName: '山形盆地ライン', stationNames: ['山形', '米沢', '天童', '新庄', '酒田'], defaultTerrain: 'mountain', distanceScale: 0.21 },
  { id: 'fukushima', label: '福島県', lineName: '福島トライライン', stationNames: ['福島', '郡山', 'いわき', '会津若松', '白河'], defaultTerrain: 'mountain', distanceScale: 0.24 },
  { id: 'ibaraki', label: '茨城県', lineName: '茨城サイエンスライン', stationNames: ['水戸', '土浦', 'つくば', '日立', '鹿島神宮'], defaultTerrain: 'plain', distanceScale: 0.18 },
  { id: 'tochigi', label: '栃木県', lineName: '栃木リンクライン', stationNames: ['宇都宮', '小山', '栃木', '那須塩原', '日光'], defaultTerrain: 'plain', distanceScale: 0.17 },
  { id: 'gunma', label: '群馬県', lineName: '群馬上毛ライン', stationNames: ['高崎', '前橋', '桐生', '伊勢崎', '渋川'], defaultTerrain: 'plain', distanceScale: 0.15 },
  { id: 'saitama', label: '埼玉県', lineName: '埼玉アーバンライン', stationNames: ['大宮', '浦和', '川越', '熊谷', '越谷'], defaultTerrain: 'urban', distanceScale: 0.13 },
  { id: 'chiba', label: '千葉県', lineName: '千葉ベイライン', stationNames: ['千葉', '船橋', '柏', '松戸', '成田'], defaultTerrain: 'urban', distanceScale: 0.16 },
  { id: 'kanagawa', label: '神奈川県', lineName: '神奈川コーストライン', stationNames: ['横浜', '川崎', '藤沢', '小田原', '相模大野'], defaultTerrain: 'urban', distanceScale: 0.14 },
  { id: 'niigata', label: '新潟県', lineName: '新潟日本海ライン', stationNames: ['新潟', '長岡', '上越妙高', '新発田', '越後湯沢'], defaultTerrain: 'coastal', distanceScale: 0.25 },
  { id: 'toyama', label: '富山県', lineName: '富山湾岸ライン', stationNames: ['富山', '高岡', '黒部宇奈月温泉', '砺波', '魚津'], defaultTerrain: 'coastal', distanceScale: 0.14 },
  { id: 'ishikawa', label: '石川県', lineName: '石川百万石ライン', stationNames: ['金沢', '小松', '加賀温泉', '七尾', '羽咋'], defaultTerrain: 'coastal', distanceScale: 0.16 },
  { id: 'fukui', label: '福井県', lineName: '福井越前ライン', stationNames: ['福井', '敦賀', '武生', '鯖江', '小浜'], defaultTerrain: 'coastal', distanceScale: 0.17 },
  { id: 'yamanashi', label: '山梨県', lineName: '山梨富士ライン', stationNames: ['甲府', '大月', '石和温泉', '韮崎', '富士山'], defaultTerrain: 'mountain', distanceScale: 0.14 },
  { id: 'nagano', label: '長野県', lineName: '信州アルプスライン', stationNames: ['長野', '松本', '上田', '佐久平', '飯田'], defaultTerrain: 'mountain', distanceScale: 0.25 },
  { id: 'gifu', label: '岐阜県', lineName: '岐阜清流ライン', stationNames: ['岐阜', '大垣', '高山', '多治見', '中津川'], defaultTerrain: 'mountain', distanceScale: 0.22 },
  { id: 'shizuoka', label: '静岡県', lineName: '静岡東海道ライン', stationNames: ['静岡', '浜松', '沼津', '三島', '熱海'], defaultTerrain: 'coastal', distanceScale: 0.19 },
  { id: 'aichi', label: '愛知県', lineName: '愛知メガループ', stationNames: ['名古屋', '豊橋', '岡崎', '一宮', '豊田市'], defaultTerrain: 'urban', distanceScale: 0.15 },
  { id: 'mie', label: '三重県', lineName: '三重伊勢ライン', stationNames: ['津', '四日市', '松阪', '伊勢市', '桑名'], defaultTerrain: 'coastal', distanceScale: 0.17 },
  { id: 'shiga', label: '滋賀県', lineName: '滋賀びわ湖ライン', stationNames: ['大津', '草津', '彦根', '近江八幡', '長浜'], defaultTerrain: 'plain', distanceScale: 0.13 },
  { id: 'kyoto', label: '京都府', lineName: '京都洛外ライン', stationNames: ['京都', '宇治', '亀岡', '福知山', '舞鶴'], defaultTerrain: 'urban', distanceScale: 0.16 },
  { id: 'osaka', label: '大阪府', lineName: '大阪メトロリンク', stationNames: ['大阪', '新大阪', '天王寺', '堺', '枚方市'], defaultTerrain: 'urban', distanceScale: 0.1 },
  { id: 'hyogo', label: '兵庫県', lineName: '兵庫瀬戸内ライン', stationNames: ['神戸', '姫路', '尼崎', '明石', '豊岡'], defaultTerrain: 'coastal', distanceScale: 0.2 },
  { id: 'nara', label: '奈良県', lineName: '奈良大和ライン', stationNames: ['奈良', '大和西大寺', '橿原神宮前', '王寺', '天理'], defaultTerrain: 'plain', distanceScale: 0.11 },
  { id: 'wakayama', label: '和歌山県', lineName: '和歌山紀州ライン', stationNames: ['和歌山', '橋本', '御坊', '紀伊田辺', '新宮'], defaultTerrain: 'coastal', distanceScale: 0.22 },
  { id: 'tottori', label: '鳥取県', lineName: '鳥取砂丘ライン', stationNames: ['鳥取', '米子', '倉吉', '境港', '智頭'], defaultTerrain: 'coastal', distanceScale: 0.15 },
  { id: 'shimane', label: '島根県', lineName: '島根出雲ライン', stationNames: ['松江', '出雲市', '浜田', '益田', '安来'], defaultTerrain: 'coastal', distanceScale: 0.2 },
  { id: 'okayama', label: '岡山県', lineName: '岡山晴れの国ライン', stationNames: ['岡山', '倉敷', '津山', '新倉敷', '児島'], defaultTerrain: 'plain', distanceScale: 0.15 },
  { id: 'hiroshima', label: '広島県', lineName: '広島瀬戸内ライン', stationNames: ['広島', '福山', '呉', '三原', '尾道'], defaultTerrain: 'coastal', distanceScale: 0.18 },
  { id: 'yamaguchi', label: '山口県', lineName: '山口西京ライン', stationNames: ['山口', '下関', '新山口', '徳山', '岩国'], defaultTerrain: 'coastal', distanceScale: 0.19 },
  { id: 'tokushima', label: '徳島県', lineName: '徳島阿波ライン', stationNames: ['徳島', '鳴門', '阿南', '脇町', '阿波池田'], defaultTerrain: 'coastal', distanceScale: 0.14 },
  { id: 'kagawa', label: '香川県', lineName: '香川讃岐ライン', stationNames: ['高松', '丸亀', '坂出', '琴平', '観音寺'], defaultTerrain: 'coastal', distanceScale: 0.1 },
  { id: 'ehime', label: '愛媛県', lineName: '愛媛伊予ライン', stationNames: ['松山', '今治', '宇和島', '新居浜', '伊予西条'], defaultTerrain: 'coastal', distanceScale: 0.19 },
  { id: 'kochi', label: '高知県', lineName: '高知土佐ライン', stationNames: ['高知', '後免', '須崎', '中村', '安芸'], defaultTerrain: 'coastal', distanceScale: 0.19 },
  { id: 'fukuoka', label: '福岡県', lineName: '福岡メガループ', stationNames: ['博多', '小倉', '久留米', '大牟田', '西鉄福岡'], defaultTerrain: 'urban', distanceScale: 0.16 },
  { id: 'saga', label: '佐賀県', lineName: '佐賀有明ライン', stationNames: ['佐賀', '鳥栖', '唐津', '武雄温泉', '伊万里'], defaultTerrain: 'plain', distanceScale: 0.13 },
  { id: 'nagasaki', label: '長崎県', lineName: '長崎シーサイドライン', stationNames: ['長崎', '諫早', '佐世保', '大村', '島原'], defaultTerrain: 'coastal', distanceScale: 0.16 },
  { id: 'kumamoto', label: '熊本県', lineName: '熊本火の国ライン', stationNames: ['熊本', '八代', '新玉名', '人吉', '阿蘇'], defaultTerrain: 'plain', distanceScale: 0.18 },
  { id: 'oita', label: '大分県', lineName: '大分別府ライン', stationNames: ['大分', '別府', '中津', '佐伯', '日田'], defaultTerrain: 'coastal', distanceScale: 0.17 },
  { id: 'miyazaki', label: '宮崎県', lineName: '宮崎日向ライン', stationNames: ['宮崎', '延岡', '都城', '日南', '小林'], defaultTerrain: 'coastal', distanceScale: 0.2 },
  { id: 'kagoshima', label: '鹿児島県', lineName: '鹿児島さつまライン', stationNames: ['鹿児島中央', '川内', '国分', '指宿', '鹿屋'], defaultTerrain: 'coastal', distanceScale: 0.19 },
  { id: 'okinawa', label: '沖縄県', lineName: '沖縄ゆいレール拡張線', stationNames: ['那覇', '浦添前田', 'てだこ浦西', '首里', 'おもろまち'], defaultTerrain: 'coastal', distanceScale: 0.08 },
];

function buildPrefectureStations(definition: PrefectureDefinition): Station[] {
  return definition.stationNames.map((name, index) => {
    const layout = PREFECTURE_STATION_LAYOUT[index];
    return {
      id: `${definition.id}-${index}`,
      name,
      region: definition.label,
      x: layout.x,
      y: layout.y,
      demand: Math.round((index === 0 ? 170 : 112) * layout.demandFactor),
      terrain: definition.defaultTerrain ?? 'urban',
      labelDx: layout.labelDx,
      labelDy: layout.labelDy,
      scope: 'prefecture',
      prefectureId: definition.id,
    };
  });
}

function buildPrefecturePresets(definition: PrefectureDefinition, stations: Station[]): PresetRoute[] {
  const stationIds = stations.map((station) => station.id);
  return [
    {
      id: `${definition.id}-main`,
      name: '県内幹線',
      lineName: definition.lineName,
      stationIds: [stationIds[4], stationIds[0], stationIds[1], stationIds[2], stationIds[3]],
    },
    {
      id: `${definition.id}-loop`,
      name: '都市環状',
      lineName: `${definition.label}アーバンループ`,
      stationIds: [stationIds[1], stationIds[2], stationIds[3], stationIds[4], stationIds[0]],
    },
  ];
}

function buildPrefectureZoom(definition: PrefectureDefinition): PrefectureZoom {
  const stations = buildPrefectureStations(definition);
  return {
    id: definition.id,
    label: definition.label,
    description: `${definition.label}内の代表駅から開始して、地図上に細かい駅を追加できます。`,
    distanceScale: definition.distanceScale ?? 0.16,
    stations,
    presets: buildPrefecturePresets(definition, stations),
  };
}

const GENERATED_PREFECTURE_ZOOMS = PREFECTURE_DEFINITIONS.map(buildPrefectureZoom);

const PREFECTURE_ZOOMS: PrefectureZoom[] = [
  {
    id: 'tokyo',
    label: '東京都',
    description: '南千住・北千住など、都市内の駅間まで細かく設計できます。',
    distanceScale: 0.085,
    stations: TOKYO_STATIONS.map((station) => ({
      ...station,
      scope: 'prefecture',
      prefectureId: 'tokyo',
    })),
    presets: TOKYO_PRESET_ROUTES,
  },
  ...GENERATED_PREFECTURE_ZOOMS,
];

const PREFECTURE_ZOOM_BY_ID = PREFECTURE_ZOOMS.reduce<Record<string, PrefectureZoom>>((acc, zoom) => {
  acc[zoom.id] = zoom;
  return acc;
}, {});

function getPrefectureZoom(id: string): PrefectureZoom {
  return PREFECTURE_ZOOM_BY_ID[id] ?? PREFECTURE_ZOOMS[0];
}

const DEFAULT_PREFECTURE_ID = 'tokyo';
const initialPreset = NATIONAL_PRESET_ROUTES[0];

const MAP_SCOPE_OPTIONS: Array<{ id: MapScope; label: string; description: string }> = [
  { id: 'national', label: '日本地図', description: '日本地図からそのまま拡大。関東では常磐線・山手線の細かい駅まで表示。' },
  { id: 'prefecture', label: '県別テンプレ', description: '47都道府県ごとの代表駅から県内路線を素早く設計。' },
];

const initialMapScope: MapScope = 'national';
const railwayTheme = {
  '--railway-accent': '#0f766e',
  '--railway-accent-strong': '#0f5f59',
  '--railway-accent-soft': '#f59e0b',
} as CSSProperties;

function getDistance(from: Station, to: Station, distanceScale: number): number {
  const dx = (to.x - from.x) * 1.08;
  const dy = (to.y - from.y) * 1.24;
  return Math.hypot(dx, dy) * distanceScale;
}

function createSegments(routeStations: Station[], distanceScale: number): Segment[] {
  return routeStations.slice(0, -1).map((from, index) => {
    const to = routeStations[index + 1];
    return {
      from,
      to,
      distance: getDistance(from, to, distanceScale),
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

function compactNumber(value: number, locale = 'ja-JP'): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMinutes(minutes: number, translate: RailTranslate): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return translate('values.minutes', { count: 0 });
  if (minutes < 95) return translate('values.minutes', { count: Math.round(minutes) });
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return translate('values.hoursMinutes', { hours, minutes: rest });
}

function formatOku(value: number, translate: RailTranslate, locale: string, useOkuUnit: boolean): string {
  const rounded = Math.round(value);
  if (useOkuUnit) return translate('values.okuYen', { amount: compactNumber(rounded, locale) });
  return translate('values.yen', { amount: compactNumber(Math.round(value * 100000000), locale) });
}

function getStationById(stations: Station[], id: string): Station | undefined {
  return stations.find((station) => station.id === id);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampMapView(view: MapViewBox): MapViewBox {
  const width = clamp(view.width, MIN_MAP_VIEW_WIDTH, MAP_WIDTH);
  const height = width * MAP_ASPECT_RATIO;
  const maxX = Math.max(0, MAP_WIDTH - width);
  const maxY = Math.max(0, MAP_HEIGHT - height);

  return {
    x: clamp(view.x, 0, maxX),
    y: clamp(view.y, 0, maxY),
    width,
    height,
  };
}

function getMapPointFromClient(
  svg: SVGSVGElement,
  view: MapViewBox,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const normalizedX = clamp((clientX - rect.left) / rect.width, 0, 1);
  const normalizedY = clamp((clientY - rect.top) / rect.height, 0, 1);

  return {
    x: clamp(view.x + normalizedX * view.width, 0, MAP_WIDTH),
    y: clamp(view.y + normalizedY * view.height, 0, MAP_HEIGHT),
  };
}

export default function RailwayPlannerPage() {
  const { t, i18n } = useTranslation();
  const lifecycle = useFeatureLifecycle('tool.railway-planner');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<MapDragState | null>(null);
  const suppressNextClickRef = useRef(false);
  const customStationIdRef = useRef(0);
  const isJapanese = i18n.language?.startsWith('ja');
  const numberLocale = isJapanese ? 'ja-JP' : 'en-US';
  const rp: RailTranslate = (key, options) => t(`home.tools.railwayPlanner.page.${key}`, options);
  const defaultStationDraft = rp('defaults.newStation');
  const unnamedLine = rp('defaults.unnamedLine');
  const [mapScope, setMapScope] = useState<MapScope>(initialMapScope);
  const [selectedPrefectureId, setSelectedPrefectureId] = useState(DEFAULT_PREFECTURE_ID);
  const [lineName, setLineName] = useState(initialPreset.lineName);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(initialPreset.id);
  const [routeStationIds, setRouteStationIds] = useState<string[]>(initialPreset.stationIds);
  const [customStations, setCustomStations] = useState<Station[]>([]);
  const [trackType, setTrackType] = useState<TrackType>('double');
  const [serviceType, setServiceType] = useState<ServiceType>('rapid');
  const [frequency, setFrequency] = useState(6);
  const [addMode, setAddMode] = useState(false);
  const [stationDraft, setStationDraft] = useState(defaultStationDraft);
  const [placeSearchResults, setPlaceSearchResults] = useState<RailwayPlaceSearchResult[]>([]);
  const [placeSearchStatus, setPlaceSearchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [placeSearchError, setPlaceSearchError] = useState('');
  const [showDemand, setShowDemand] = useState(true);
  const [mapView, setMapView] = useState<MapViewBox>(DEFAULT_MAP_VIEW);

  const selectedPrefecture = getPrefectureZoom(selectedPrefectureId);
  const baseStations = mapScope === 'prefecture' ? selectedPrefecture.stations : NATIONAL_BASE_STATIONS;
  const activePresetRoutes = mapScope === 'prefecture' ? selectedPrefecture.presets : NATIONAL_PRESET_ROUTES;
  const currentCustomStations = customStations.filter((station) => (
    station.scope === mapScope
    && (mapScope !== 'prefecture' || station.prefectureId === selectedPrefectureId)
  ));
  const zoomLevel = MAP_WIDTH / mapView.width;
  const inverseZoom = 1 / zoomLevel;
  const mapAreaLabelStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${GUIDE_LABEL_FONT_SIZE * inverseZoom}px`,
      strokeWidth: 4 * inverseZoom,
    }),
    [inverseZoom],
  );
  const selectedPrefectureDescription = selectedPrefecture.id === DEFAULT_PREFECTURE_ID
    ? rp('prefectureDescriptions.tokyo')
    : rp('prefectureDescriptions.generic', { prefecture: selectedPrefecture.label });
  const formatDailyDemand = (dailyDemand: number) => (
    isJapanese
      ? rp('values.tenThousandPeoplePerDay', { value: (dailyDemand / 10000).toFixed(1) })
      : rp('values.peoplePerDay', { value: compactNumber(Math.round(dailyDemand), numberLocale) })
  );
  const trimmedStationDraft = stationDraft.trim();
  const canSearchPlaceCandidates = (
    trimmedStationDraft.length >= 2
    && !isDefaultStationSearchDraft(trimmedStationDraft, defaultStationDraft)
  );

  useEffect(() => {
    if (!canSearchPlaceCandidates) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setPlaceSearchStatus('loading');
      setPlaceSearchError('');
      try {
        const params = new URLSearchParams({
          q: trimmedStationDraft,
          limit: '6',
          includeExternal: 'true',
        });
        const response = await fetch(`/api/railway/places?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json() as RailwayPlaceSearchResponse;
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to search places');
        }

        setPlaceSearchResults(data.results ?? []);
        setPlaceSearchStatus('success');
      } catch (error) {
        if (controller.signal.aborted) return;
        setPlaceSearchResults([]);
        setPlaceSearchStatus('error');
        setPlaceSearchError(error instanceof Error ? error.message : 'Failed to search places');
      }
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [canSearchPlaceCandidates, trimmedStationDraft]);

  const allStations = useMemo(
    () => {
      const scopedPrefecture = getPrefectureZoom(selectedPrefectureId);
      return [
        ...(mapScope === 'prefecture' ? scopedPrefecture.stations : NATIONAL_BASE_STATIONS),
        ...customStations.filter((station) => (
          station.scope === mapScope
          && (mapScope !== 'prefecture' || station.prefectureId === selectedPrefectureId)
        )),
      ];
    },
    [customStations, mapScope, selectedPrefectureId],
  );

  const routeStations = useMemo(
    () => routeStationIds
      .map((id) => getStationById(allStations, id))
      .filter((station): station is Station => Boolean(station)),
    [allStations, routeStationIds],
  );

  const routeDistanceScale = useMemo(
    () => {
      const presetRoutes = mapScope === 'prefecture'
        ? getPrefectureZoom(selectedPrefectureId).presets
        : NATIONAL_PRESET_ROUTES;
      const selectedPreset = presetRoutes.find((preset) => preset.id === selectedPresetId);
      return selectedPreset?.distanceScale ?? (mapScope === 'prefecture'
        ? getPrefectureZoom(selectedPrefectureId).distanceScale
        : 1.88);
    },
    [mapScope, selectedPrefectureId, selectedPresetId],
  );

  const routeSegments = useMemo(
    () => createSegments(routeStations, routeDistanceScale),
    [routeDistanceScale, routeStations],
  );

  const mapRouteStations = useMemo(
    () => {
      if (mapScope !== 'national' || zoomLevel >= 2.2) return routeStations;

      return routeStations.filter((station, index) => (
        index === 0
        || index === routeStations.length - 1
        || !station.minZoom
        || station.demand >= 170
      ));
    },
    [mapScope, routeStations, zoomLevel],
  );

  const mapRouteStationIds = useMemo(
    () => new Set(mapRouteStations.map((station) => station.id)),
    [mapRouteStations],
  );

  const visibleStations = useMemo(
    () => allStations.filter((station) => {
      const isVisibleRouteStation = mapRouteStationIds.has(station.id);
      const isReducedNationalOverview = mapScope === 'national' && zoomLevel < NATIONAL_OVERVIEW_ZOOM;
      const isNationalOverviewStation = !station.minZoom && NATIONAL_OVERVIEW_STATION_IDS.has(station.id);
      if (isReducedNationalOverview) {
        return isVisibleRouteStation || isNationalOverviewStation;
      }

      return isVisibleRouteStation || zoomLevel >= (station.minZoom ?? 1);
    }),
    [allStations, mapRouteStationIds, mapScope, zoomLevel],
  );

  const routeMetrics = useMemo(() => {
    if (routeStations.length < 2) {
      return {
        totalDistance: 0,
        weightedTerrain: 1,
        stopCount: 0,
        travelMinutes: 0,
        constructionCostOku: 0,
        dailyDemand: 0,
        capacityDaily: 0,
        congestionRate: 0,
        annualRevenueOku: 0,
        annualOperationOku: 0,
        annualCapitalOku: 0,
        annualBalanceOku: 0,
        score: 0,
      };
    }

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
    setSelectedPresetId(null);
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

  const zoomMapAround = (
    anchor: { x: number; y: number },
    direction: 'in' | 'out',
    anchorRatioX = 0.5,
    anchorRatioY = 0.5,
  ) => {
    setMapView((current) => {
      const nextWidth = clamp(current.width * (direction === 'in' ? 0.72 : 1.28), MIN_MAP_VIEW_WIDTH, MAP_WIDTH);
      const nextHeight = nextWidth * MAP_ASPECT_RATIO;

      return clampMapView({
        x: anchor.x - anchorRatioX * nextWidth,
        y: anchor.y - anchorRatioY * nextHeight,
        width: nextWidth,
        height: nextHeight,
      });
    });
  };

  const zoomMapAt = (clientX: number, clientY: number, direction: 'in' | 'out') => {
    const svg = svgRef.current;
    if (!svg) return;

    setMapView((current) => {
      const anchor = getMapPointFromClient(svg, current, clientX, clientY);
      if (!anchor) return current;

      const anchorRatioX = (anchor.x - current.x) / current.width;
      const anchorRatioY = (anchor.y - current.y) / current.height;
      const nextWidth = clamp(current.width * (direction === 'in' ? 0.72 : 1.28), MIN_MAP_VIEW_WIDTH, MAP_WIDTH);
      const nextHeight = nextWidth * MAP_ASPECT_RATIO;

      return clampMapView({
        x: anchor.x - anchorRatioX * nextWidth,
        y: anchor.y - anchorRatioY * nextHeight,
        width: nextWidth,
        height: nextHeight,
      });
    });
  };

  const getRouteMapCenter = () => {
    if (!routeStations.length) return null;
    const bounds = routeStations.reduce(
      (acc, station) => ({
        minX: Math.min(acc.minX, station.x),
        maxX: Math.max(acc.maxX, station.x),
        minY: Math.min(acc.minY, station.y),
        maxY: Math.max(acc.maxY, station.y),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );

    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
  };

  const resetMapView = () => {
    dragRef.current = null;
    suppressNextClickRef.current = false;
    setMapView(DEFAULT_MAP_VIEW);
  };

  const handleMapWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoomMapAt(event.clientX, event.clientY, event.deltaY < 0 ? 'in' : 'out');
  };

  const handleStationDraftChange = (value: string) => {
    setStationDraft(value);
    setPlaceSearchResults([]);
    setPlaceSearchStatus('idle');
    setPlaceSearchError('');
  };

  const handleMapZoomButton = (direction: 'in' | 'out') => {
    const routeCenter = getRouteMapCenter();
    const viewCenter = {
      x: mapView.x + mapView.width / 2,
      y: mapView.y + mapView.height / 2,
    };
    zoomMapAround(routeCenter ?? viewCenter, direction);
    lifecycle.trackEvent('map_zoom', { direction });
  };

  const handleMapPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;

    dragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMapPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !svg) return;

    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaX = event.clientX - drag.lastClientX;
    const deltaY = event.clientY - drag.lastClientY;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 4) {
      drag.moved = true;
    }

    setMapView((current) => clampMapView({
      x: current.x - (deltaX / rect.width) * current.width,
      y: current.y - (deltaY / rect.height) * current.height,
      width: current.width,
      height: current.height,
    }));
  };

  const finishMapDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.moved) {
      suppressNextClickRef.current = true;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleMapCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (!addMode) return;
    const stationName = stationDraft.trim();
    if (!stationName || !svgRef.current) return;

    const point = getMapPointFromClient(svgRef.current, mapView, event.clientX, event.clientY);
    if (!point) return;

    customStationIdRef.current += 1;

    const nextStation: Station = {
      id: `custom-${customStationIdRef.current}`,
      name: stationName.slice(0, 12),
      region: mapScope === 'prefecture'
        ? rp('defaults.prefecturePlannedStation', { prefecture: selectedPrefecture.label })
        : rp('defaults.plannedStation'),
      x: clamp(point.x, 18, MAP_WIDTH - 18),
      y: clamp(point.y, 18, MAP_HEIGHT - 18),
      demand: 118,
      terrain: 'urban',
      labelDx: 10,
      labelDy: -10,
      custom: true,
      scope: mapScope,
      prefectureId: mapScope === 'prefecture' ? selectedPrefectureId : undefined,
    };

    lifecycle.trackEvent('custom_station_add', { station_name_len: nextStation.name.length });
    setSelectedPresetId(null);
    setCustomStations((current) => [...current, nextStation]);
    setRouteStationIds((current) => [...current, nextStation.id]);
    const nextCustomNumber = currentCustomStations.length + 2;
    setStationDraft(rp('defaults.newStationWithNumber', { number: nextCustomNumber }));
  };

  const handlePlaceSearchResultSelect = (place: RailwayPlaceSearchResult) => {
    const point = projectJapanCoordinate(place.longitude, place.latitude);
    customStationIdRef.current += 1;

    const nextStation: Station = {
      id: `place-${customStationIdRef.current}`,
      name: place.name.slice(0, 24),
      region: formatPlaceRegion(place),
      x: clamp(point.x, 18, MAP_WIDTH - 18),
      y: clamp(point.y, 18, MAP_HEIGHT - 18),
      demand: getDemandForPlaceKind(place.kind),
      terrain: getTerrainForPlaceKind(place.kind),
      labelDx: 10,
      labelDy: -10,
      custom: true,
      scope: 'national',
    };

    lifecycle.trackEvent('place_search_station_add', {
      place_kind: place.kind,
      source_layer: place.sourceLayer,
      source: place.source,
    });
    setMapScope('national');
    setSelectedPresetId(null);
    setCustomStations((current) => [...current, nextStation]);
    setRouteStationIds((current) => [...current, nextStation.id]);
    const nextCustomNumber = customStations.filter((station) => station.scope === 'national').length + 2;
    setStationDraft(rp('defaults.newStationWithNumber', { number: nextCustomNumber }));
    setAddMode(false);
    setMapView(clampMapView({
      x: nextStation.x - MAP_WIDTH / 20,
      y: nextStation.y - MAP_HEIGHT / 20,
      width: MAP_WIDTH / 10,
      height: MAP_HEIGHT / 10,
    }));
  };

  const handlePresetSelect = (preset: PresetRoute) => {
    lifecycle.trackEvent('preset_select', { preset_id: preset.id });
    setSelectedPresetId(preset.id);
    setRouteStationIds(preset.stationIds);
    setLineName(preset.lineName);
    resetMapView();
  };

  const handleScopeChange = (nextScope: MapScope) => {
    if (nextScope === mapScope) return;
    const nextPreset = nextScope === 'prefecture'
      ? selectedPrefecture.presets[0]
      : NATIONAL_PRESET_ROUTES[0];
    lifecycle.trackEvent('scope_change', { map_scope: nextScope });
    setMapScope(nextScope);
    setSelectedPresetId(nextPreset.id);
    setRouteStationIds(nextPreset.stationIds);
    setLineName(nextPreset.lineName);
    setAddMode(false);
    setStationDraft(defaultStationDraft);
    resetMapView();
  };

  const handlePrefectureChange = (prefectureId: string) => {
    const nextPrefecture = getPrefectureZoom(prefectureId);
    lifecycle.trackEvent('prefecture_change', { prefecture_id: prefectureId });
    setSelectedPrefectureId(prefectureId);
    setMapScope('prefecture');
    setSelectedPresetId(nextPrefecture.presets[0].id);
    setRouteStationIds(nextPrefecture.presets[0].stationIds);
    setLineName(nextPrefecture.presets[0].lineName);
    setAddMode(false);
    setStationDraft(defaultStationDraft);
    resetMapView();
  };

  const handleClearRoute = () => {
    lifecycle.trackEvent('route_clear', { station_count: routeStationIds.length });
    setSelectedPresetId(null);
    setRouteStationIds([]);
  };

  const handleReset = () => {
    lifecycle.trackEvent('reset');
    setMapScope(initialMapScope);
    setSelectedPrefectureId(DEFAULT_PREFECTURE_ID);
    setLineName(initialPreset.lineName);
    setSelectedPresetId(initialPreset.id);
    setRouteStationIds(initialPreset.stationIds);
    setCustomStations([]);
    setTrackType('double');
    setServiceType('rapid');
    setFrequency(6);
    setAddMode(false);
    setStationDraft(defaultStationDraft);
    setShowDemand(true);
    resetMapView();
  };

  const handleRemoveCustomStations = () => {
    lifecycle.trackEvent('custom_station_clear', { custom_station_count: currentCustomStations.length });
    const baseStationIds = new Set(baseStations.map((station) => station.id));
    setCustomStations((current) => current.filter((station) => !(
      station.scope === mapScope
      && (mapScope !== 'prefecture' || station.prefectureId === selectedPrefectureId)
    )));
    setSelectedPresetId(null);
    setRouteStationIds((current) => current.filter((id) => baseStationIds.has(id)));
  };

  const selectedTrack = TRACK_OPTIONS[trackType];
  const selectedService = SERVICE_OPTIONS[serviceType];

  return (
    <main className={styles.page} style={railwayTheme}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <Link
              href="/#tools"
              className={styles.backLink}
              aria-label={rp('actions.backToTools')}
              onClick={() => lifecycle.complete()}
            >
              <ArrowLeft size={18} />
            </Link>
            <div className={styles.logoTile}>
              <Train size={28} />
            </div>
            <div>
              <p className={styles.eyebrow}>{rp('eyebrow')}</p>
              <h1 className={styles.title}>{rp('title')}</h1>
              <p className={styles.subtitle}>{rp('subtitle')}</p>
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
              {rp('actions.reset')}
            </Button>
          </div>
        </header>

        <section className={styles.metricsBar} aria-label={rp('metrics.ariaLabel')}>
          <div className={styles.metricTile}>
            <Activity size={18} />
            <span>{rp('metrics.score')}</span>
            <strong>{Math.round(routeMetrics.score)}</strong>
          </div>
          <div className={styles.metricTile}>
            <Clock size={18} />
            <span>{rp('metrics.travelTime')}</span>
            <strong>{formatMinutes(routeMetrics.travelMinutes, rp)}</strong>
          </div>
          <div className={styles.metricTile}>
            <Users size={18} />
            <span>{rp('metrics.demand')}</span>
            <strong>{formatDailyDemand(routeMetrics.dailyDemand)}</strong>
          </div>
          <div className={styles.metricTile}>
            <Wallet size={18} />
            <span>{rp('metrics.annualBalance')}</span>
            <strong className={routeMetrics.annualBalanceOku >= 0 ? styles.positive : styles.negative}>
              {formatOku(routeMetrics.annualBalanceOku, rp, numberLocale, isJapanese)}
            </strong>
          </div>
        </section>

        <section className={styles.workspace}>
          <aside className={styles.controlPanel} aria-label={rp('sections.routeSettings')}>
            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <Train size={17} />
                {rp('sections.routeSettings')}
              </div>
              <div className={styles.controlGroup}>
                <span className={styles.groupLabel}>{rp('fields.scope')}</span>
                <div className={styles.scopeButtons}>
                  {MAP_SCOPE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.segmentButton} ${mapScope === option.id ? styles.segmentButtonActive : ''}`}
                      onClick={() => handleScopeChange(option.id)}
                      aria-pressed={mapScope === option.id}
                    >
                      {rp(`scope.${option.id}.label`)}
                    </button>
                  ))}
                </div>
                <p className={styles.helperText}>{rp(`scope.${mapScope}.description`)}</p>
              </div>
              {mapScope === 'prefecture' && (
                <label className={styles.field}>
                  <span>{rp('fields.prefecture')}</span>
                  <select
                    value={selectedPrefectureId}
                    onChange={(event) => handlePrefectureChange(event.target.value)}
                    className={styles.selectInput}
                  >
                    {PREFECTURE_ZOOMS.map((prefecture) => (
                      <option key={prefecture.id} value={prefecture.id}>
                        {prefecture.label}
                      </option>
                    ))}
                  </select>
                  <span className={styles.fieldHint}>{selectedPrefectureDescription}</span>
                </label>
              )}
              <label className={styles.field}>
                <span>{rp('fields.lineName')}</span>
                <Input
                  value={lineName}
                  onChange={(event) => setLineName(event.target.value)}
                  className={styles.textInput}
                  maxLength={32}
                />
              </label>

              <div className={styles.controlGroup}>
                <span className={styles.groupLabel}>{rp('fields.trackType')}</span>
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
                      {rp(`track.${optionId}.label`)}
                    </button>
                  ))}
                </div>
                <p className={styles.helperText}>{rp(`track.${trackType}.description`)}</p>
              </div>

              <div className={styles.controlGroup}>
                <span className={styles.groupLabel}>{rp('fields.serviceType')}</span>
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
                      {rp(`service.${optionId}.label`)}
                    </button>
                  ))}
                </div>
              </div>

              <label className={styles.rangeField}>
                <span>
                  {rp('fields.frequency')}
                  <strong>{rp('values.trainsPerHour', { count: frequency })}</strong>
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
                {rp('sections.stationsAndRoute')}
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
                  <span>{rp('fields.stationName')}</span>
                  <Input
                    value={stationDraft}
                    onChange={(event) => handleStationDraftChange(event.target.value)}
                    className={styles.textInput}
                    maxLength={40}
                    placeholder={rp('search.placeholder')}
                  />
                </label>
                {canSearchPlaceCandidates && (
                  <div className={styles.placeSearchResults} aria-live="polite">
                    {placeSearchStatus === 'loading' && (
                      <p className={styles.placeSearchStatus}>{rp('search.loading')}</p>
                    )}
                    {placeSearchStatus === 'error' && (
                      <p className={styles.placeSearchError}>
                        {placeSearchError || rp('search.error')}
                      </p>
                    )}
                    {placeSearchStatus === 'success' && placeSearchResults.length === 0 && (
                      <p className={styles.placeSearchStatus}>{rp('search.empty')}</p>
                    )}
                    {placeSearchResults.map((place) => (
                      <button
                        key={`${place.sourceLayer}-${place.id}`}
                        type="button"
                        className={styles.placeSearchResult}
                        onClick={() => handlePlaceSearchResultSelect(place)}
                      >
                        <span>
                          <strong>{place.name}</strong>
                          <small>{place.address || formatPlaceRegion(place)}</small>
                        </span>
                        <em>{rp(`placeKind.${place.kind}`)}</em>
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant={addMode ? 'default' : 'outline'}
                  className={addMode ? styles.primaryButton : styles.secondaryButton}
                  onClick={() => setAddMode((current) => !current)}
                  disabled={!stationDraft.trim()}
                >
                  <Plus size={16} />
                  {rp('actions.placeStation')}
                </Button>
              </div>

              <div className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.toggleButton} ${showDemand ? styles.toggleButtonActive : ''}`}
                  onClick={() => setShowDemand((current) => !current)}
                  aria-pressed={showDemand}
                >
                  {rp('actions.toggleDemand')}
                </button>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={handleClearRoute}
                >
                  <Trash2 size={15} />
                  {rp('actions.clearRoute')}
                </button>
              </div>

              {currentCustomStations.length > 0 && (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={handleRemoveCustomStations}
                >
                  <Trash2 size={15} />
                  {rp('actions.removeCustomStations')}
                </button>
              )}
            </section>

            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <MapPin size={17} />
                {rp('sections.selectedStations')}
              </div>
              {routeStations.length === 0 ? (
                <p className={styles.emptyText}>{rp('empty.selectedStations')}</p>
              ) : (
                <ol className={styles.stationOrder}>
                  {routeStations.map((station, index) => (
                    <li key={`${station.id}-${index}`}>
                      <span className={styles.stationIndex}>{index + 1}</span>
                      <span className={styles.stationOrderName}>{station.name}</span>
                      <button
                        type="button"
                        aria-label={rp('station.remove', { station: station.name })}
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

          <section
            className={styles.mapPanel}
            aria-label={mapScope === 'prefecture'
              ? rp('map.prefecturePanelAria', { prefecture: selectedPrefecture.label })
              : rp('map.nationalPanelAria')}
          >
            <div className={styles.mapHeader}>
              <div>
                <h2>{lineName || unnamedLine}</h2>
                <p>
                  {mapScope === 'prefecture' ? selectedPrefecture.label : rp('scope.national.label')} / {rp(`track.${trackType}.label`)} / {rp(`service.${serviceType}.label`)} / {rp('values.stationCount', { count: routeStations.length })}
                </p>
              </div>
              {addMode && <span className={styles.addModeBadge}>{rp('map.addModeBadge')}</span>}
            </div>

            <div className={styles.mapCanvas}>
              <div className={styles.mapToolbar} role="toolbar" aria-label={rp('map.zoomToolbar')}>
                <button
                  type="button"
                  className={styles.mapToolButton}
                  onClick={() => handleMapZoomButton('in')}
                  aria-label={rp('map.zoomInAria')}
                  title={rp('map.zoomInTitle')}
                  disabled={mapView.width <= MIN_MAP_VIEW_WIDTH + 0.5}
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  className={styles.mapToolButton}
                  onClick={() => handleMapZoomButton('out')}
                  aria-label={rp('map.zoomOutAria')}
                  title={rp('map.zoomOutTitle')}
                  disabled={mapView.width >= MAP_WIDTH - 0.5}
                >
                  <Minus size={15} />
                </button>
                <button
                  type="button"
                  className={styles.mapToolButton}
                  onClick={resetMapView}
                  aria-label={rp('map.resetViewAria')}
                  title={rp('map.resetViewTitle')}
                >
                  <RotateCcw size={14} />
                </button>
                <span className={styles.zoomReadout}>{zoomLevel.toFixed(1)}x</span>
              </div>

              <svg
                ref={svgRef}
                className={`${styles.mapSvg} ${addMode ? styles.mapSvgAddMode : ''}`}
                viewBox={`${mapView.x} ${mapView.y} ${mapView.width} ${mapView.height}`}
                aria-label={mapScope === 'prefecture'
                  ? rp('map.prefectureSvgAria', { prefecture: selectedPrefecture.label })
                  : rp('map.nationalSvgAria')}
                onClick={handleMapCanvasClick}
                onWheel={handleMapWheel}
                onPointerDown={handleMapPointerDown}
                onPointerMove={handleMapPointerMove}
                onPointerUp={finishMapDrag}
                onPointerCancel={finishMapDrag}
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
                  {NATIONAL_LAND_PATHS.map((path) => (
                    <path key={path} d={path} />
                  ))}
                </g>
              ) : selectedPrefecture.id === 'tokyo' ? (
                <>
                  <g className={styles.landLayer}>
                    <path d="M62 72 C141 16 256 34 330 74 C410 118 492 96 566 142 C627 181 621 274 580 340 C548 392 550 461 585 520 C608 560 586 626 532 662 C460 710 358 724 268 696 C187 671 115 626 75 551 C34 474 26 371 46 288 C62 220 18 127 62 72 Z" />
                    <path className={styles.bayShape} d="M346 475 C398 463 453 481 491 519 C452 560 393 592 326 596 C306 554 309 504 346 475 Z" />
                  </g>
                  <g className={styles.tokyoGuideLayer}>
                    <path className={styles.riverLine} d="M190 92 C254 166 323 217 382 220 C432 223 486 195 591 119" />
                    <path className={styles.riverLine} d="M345 266 C365 314 374 374 392 414 C415 463 447 513 491 552" />
                    <path className={styles.wardBoundary} d="M156 382 C239 352 329 356 432 378 C508 396 560 440 595 506" />
                    <text x="392" y="205" className={styles.mapAreaLabel} style={mapAreaLabelStyle}>{rp('map.labels.arakawa')}</text>
                    <text x="410" y="386" className={styles.mapAreaLabel} style={mapAreaLabelStyle}>{rp('map.labels.sumidaRiver')}</text>
                    <text x="412" y="556" className={styles.mapAreaLabel} style={mapAreaLabelStyle}>{rp('map.labels.tokyoBay')}</text>
                  </g>
                </>
              ) : (
                <>
                  <g className={styles.landLayer}>
                    <path d="M62 72 C141 16 256 34 330 74 C410 118 492 96 566 142 C627 181 621 274 580 340 C548 392 550 461 585 520 C608 560 586 626 532 662 C460 710 358 724 268 696 C187 671 115 626 75 551 C34 474 26 371 46 288 C62 220 18 127 62 72 Z" />
                  </g>
                  <g className={styles.tokyoGuideLayer}>
                    <path className={styles.riverLine} d="M142 172 C234 234 322 256 450 216 C512 196 558 226 590 278" />
                    <path className={styles.riverLine} d="M196 570 C250 486 318 424 406 384 C492 344 545 276 579 176" />
                    <path className={styles.wardBoundary} d="M96 398 C184 344 286 332 392 366 C478 394 550 452 594 524" />
                    <text x="84" y="126" className={styles.mapAreaLabel} style={mapAreaLabelStyle}>{rp('map.labels.prefectureZoom', { prefecture: selectedPrefecture.label })}</text>
                    <text x="404" y="246" className={styles.mapAreaLabel} style={mapAreaLabelStyle}>{rp('map.labels.northConnector')}</text>
                    <text x="242" y="590" className={styles.mapAreaLabel} style={mapAreaLabelStyle}>{rp('map.labels.southConnector')}</text>
                  </g>
                </>
              )}

              <g>
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
                      const line = getOffsetSegment(segment.from, segment.to, offset * inverseZoom);
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

              <g>
                {visibleStations.map((station) => {
                  const routeIndex = routeStationIds.indexOf(station.id);
                  const inRoute = routeIndex >= 0;
                  const isVisibleRouteStation = mapRouteStationIds.has(station.id);
                  const isTerminal = routeIndex === 0 || routeIndex === routeStationIds.length - 1;
                  const stopsHere = inRoute && isRouteStop(station, routeIndex, routeStations.length, serviceType);
                  const isDetailedStation = Boolean(station.minZoom);
                  const isNationalDetailedStation = mapScope === 'national' && isDetailedStation;
                  const labelZoom = station.labelMinZoom ?? station.minZoom ?? 1;
                  const showRouteLabel = isVisibleRouteStation && (
                    !isNationalDetailedStation
                    || isTerminal
                    || station.demand >= NATIONAL_MAJOR_ROUTE_LABEL_DEMAND
                    || zoomLevel >= Math.max(labelZoom, NATIONAL_ROUTE_DENSE_LABEL_ZOOM)
                  );
                  const showStationLabel = (
                    showRouteLabel
                    || (
                      !inRoute
                      && (!isNationalDetailedStation || zoomLevel >= NATIONAL_DETAIL_LABEL_ZOOM)
                      && zoomLevel >= labelZoom
                    )
                  );
                  const labelX = station.x + (station.labelDx ?? 10) * inverseZoom;
                  const labelY = station.y + (station.labelDy ?? -10) * inverseZoom;
                  const stationLabelStyle: CSSProperties = {
                    fontSize: `${(isDetailedStation ? DETAIL_STATION_LABEL_FONT_SIZE : STATION_LABEL_FONT_SIZE) * inverseZoom}px`,
                    strokeWidth: 4 * inverseZoom,
                  };
                  const routeIndexStyle: CSSProperties = {
                    fontSize: `${ROUTE_INDEX_FONT_SIZE * inverseZoom}px`,
                  };
                  return (
                    <g
                      key={station.id}
                      role="button"
                      tabIndex={0}
                      className={`${styles.stationButton} ${isDetailedStation ? styles.stationDetail : ''} ${inRoute ? styles.stationSelected : ''}`}
                      aria-label={inRoute
                        ? rp('station.removeFromRoute', { station: station.name })
                        : rp('station.addToRoute', { station: station.name })}
                      aria-pressed={inRoute}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleStationToggle(station.id);
                      }}
                      onKeyDown={(event) => handleStationKeyDown(event, station.id)}
                    >
                      {showDemand && !isDetailedStation && (
                        <circle
                          cx={station.x}
                          cy={station.y}
                          r={Math.max(10, Math.min(24, station.demand / 12)) * inverseZoom}
                          className={styles.demandCircle}
                        />
                      )}
                      <circle
                        cx={station.x}
                        cy={station.y}
                        r={(inRoute ? (isTerminal ? 8.5 : 6.8) : 4.5) * inverseZoom}
                        className={styles.stationDot}
                      />
                      {stopsHere && (
                        <circle
                          cx={station.x}
                          cy={station.y}
                          r={(inRoute ? 12 : 8) * inverseZoom}
                          className={styles.stopRing}
                        />
                      )}
                      <circle
                        cx={station.x}
                        cy={station.y}
                        r={14 * inverseZoom}
                        className={styles.stationHitArea}
                      />
                      {inRoute && (
                        <text
                          x={station.x}
                          y={station.y + 3.5 * inverseZoom}
                          className={styles.routeIndexText}
                          style={routeIndexStyle}
                        >
                          {routeIndex + 1}
                        </text>
                      )}
                      {showStationLabel && (
                        <text x={labelX} y={labelY} className={styles.stationLabel} style={stationLabelStyle}>
                          {station.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
              </svg>
            </div>
          </section>

          <aside className={styles.diagramPanel} aria-label={rp('sections.diagramAndFinance')}>
            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <Train size={17} />
                {rp('sections.diagram')}
              </div>
              <div className={styles.diagramMeta}>
                <span style={{ '--service-color': selectedService.color } as CSSProperties}>
                  {rp(`service.${serviceType}.shortLabel`)}
                </span>
                <strong>{lineName || unnamedLine}</strong>
              </div>
              {routeStations.length < 2 ? (
                <p className={styles.emptyText}>{rp('empty.diagram')}</p>
              ) : (
                <ol className={styles.routeDiagram}>
                  {routeStations.map((station, index) => {
                    const stopsHere = isRouteStop(station, index, routeStations.length, serviceType);
                    return (
                      <li key={`${station.id}-${index}`} className={stopsHere ? undefined : styles.passStation}>
                        <span className={styles.diagramLine} />
                        <span className={styles.diagramMarker}>
                          {stopsHere ? rp(`service.${serviceType}.shortLabel`) : ''}
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
                {rp('sections.simulation')}
              </div>
              <div className={styles.simRows}>
                <div>
                  <span>{rp('simulation.totalDistance')}</span>
                  <strong>{rp('values.kilometers', { value: compactNumber(routeMetrics.totalDistance, numberLocale) })}</strong>
                </div>
                <div>
                  <span>{rp('simulation.stops')}</span>
                  <strong>{rp('values.stopCountRatio', { stops: routeMetrics.stopCount, total: routeStations.length })}</strong>
                </div>
                <div>
                  <span>{rp('simulation.constructionCost')}</span>
                  <strong>{formatOku(routeMetrics.constructionCostOku, rp, numberLocale, isJapanese)}</strong>
                </div>
                <div>
                  <span>{rp('simulation.annualRevenue')}</span>
                  <strong>{formatOku(routeMetrics.annualRevenueOku, rp, numberLocale, isJapanese)}</strong>
                </div>
              </div>

              <div className={styles.progressGroup}>
                <div className={styles.progressHeader}>
                  <span>{rp('simulation.congestion')}</span>
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
                <span>{rp('metrics.annualBalance')}</span>
                <strong className={routeMetrics.annualBalanceOku >= 0 ? styles.positive : styles.negative}>
                  {formatOku(routeMetrics.annualBalanceOku, rp, numberLocale, isJapanese)}
                </strong>
                <p>{rp('simulation.balanceDescription')}</p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
