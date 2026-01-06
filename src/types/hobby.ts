// Hobby Types - Type definitions for the hobby/interests system

// ============================================================================
// ENUMS
// ============================================================================

export enum HobbyTemplateType {
  GALLERY = 'gallery',     // Image-focused display (e.g., photography)
  CATALOG = 'catalog',     // Detailed item catalog (e.g., fish, ski resorts)
  LOG = 'log',             // Time-based entries (e.g., travel log)
  CUSTOM = 'custom',       // Custom layout
}

export enum CustomFieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  DATE = 'date',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  URL = 'url',
  LOCATION = 'location',
  RATING = 'rating',
  BOOLEAN = 'boolean',
  RELATION = 'relation',  // Reference to another hobby item
}

// Configuration for RELATION type fields
export interface RelationConfig {
  hobbySlug: string;      // Slug of the hobby category to reference
  multiple: boolean;      // Allow multiple references
}

// ============================================================================
// CUSTOM FIELD TYPES
// ============================================================================

export interface CustomField {
  id: string;
  name: string;           // Field key (e.g., 'scientificName')
  label: string;          // Display label (e.g., '学名')
  type: CustomFieldType;
  required: boolean;
  options?: string[];     // For select/multiselect
  placeholder?: string;
  order: number;
  relationConfig?: RelationConfig;  // For RELATION type fields
}

// ============================================================================
// HOBBY CATEGORY TYPES
// ============================================================================

export interface HobbyCategory {
  id: string;
  name: string;
  slug: string;           // URL-friendly identifier
  description: string;
  icon?: string;          // Lucide icon name
  coverImage?: string;
  templateType: HobbyTemplateType;
  isPublic: boolean;
  order: number;
  fields: CustomField[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateHobbyCategoryInput {
  name: string;
  slug: string;
  description: string;
  icon?: string;
  coverImage?: string;
  templateType: HobbyTemplateType;
  isPublic?: boolean;
  order?: number;
  fields?: Omit<CustomField, 'id'>[];
}

export interface UpdateHobbyCategoryInput {
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
  coverImage?: string;
  templateType?: HobbyTemplateType;
  isPublic?: boolean;
  order?: number;
  fields?: CustomField[];
}

// ============================================================================
// HOBBY ITEM TYPES
// ============================================================================

export interface HobbyItem {
  id: string;
  hobbyId: string;
  title: string;
  description: string;
  images: string[];
  thumbImage: string;
  isPublic: boolean;
  order: number;
  customFields: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateHobbyItemInput {
  hobbyId: string;
  title: string;
  description: string;
  images?: string[];
  thumbImage?: string;
  isPublic?: boolean;
  order?: number;
  customFields?: Record<string, unknown>;
  tags?: string[];
}

export interface UpdateHobbyItemInput {
  title?: string;
  description?: string;
  images?: string[];
  thumbImage?: string;
  isPublic?: boolean;
  order?: number;
  customFields?: Record<string, unknown>;
  tags?: string[];
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface HobbyCategoriesResponse {
  categories: HobbyCategory[];
  total: number;
}

export interface HobbyItemsResponse {
  items: HobbyItem[];
  total: number;
  hasMore: boolean;
  hobbyId: string;
}

// ============================================================================
// PREDEFINED TEMPLATES
// ============================================================================

// Fish catalog - for tracking fish you've eaten
export const FISH_CATALOG_FIELDS: Omit<CustomField, 'id'>[] = [
  { name: 'nameKanji', label: '名前（漢字）', type: CustomFieldType.TEXT, required: false, placeholder: '例: 鮪', order: 1 },
  { name: 'nameKana', label: '名前（かな）', type: CustomFieldType.TEXT, required: false, placeholder: '例: まぐろ', order: 2 },
  { name: 'nameEnglish', label: 'English Name', type: CustomFieldType.TEXT, required: false, placeholder: 'e.g., Tuna', order: 3 },
  { name: 'hasEaten', label: '食べたことある', type: CustomFieldType.BOOLEAN, required: false, order: 4 },
  { name: 'taste', label: '味の感想', type: CustomFieldType.TEXTAREA, required: false, placeholder: '味、食感などの感想', order: 5 },
  { name: 'favoritePreparation', label: 'おすすめの食べ方', type: CustomFieldType.SELECT, required: false, options: ['刺身', '寿司', '焼き', '煮付け', 'フライ', '天ぷら', 'その他'], order: 6 },
  { name: 'rating', label: '評価', type: CustomFieldType.RATING, required: false, order: 7 },
  { name: 'season', label: '旬の季節', type: CustomFieldType.SELECT, required: false, options: ['春', '夏', '秋', '冬', '通年'], order: 8 },
];

// Ski resort catalog
export const SKI_RESORT_FIELDS: Omit<CustomField, 'id'>[] = [
  { name: 'resortName', label: 'スキー場名', type: CustomFieldType.TEXT, required: true, order: 1 },
  { name: 'visitDate', label: '訪問日', type: CustomFieldType.DATE, required: false, order: 2 },
  { name: 'conditions', label: 'コンディション', type: CustomFieldType.SELECT, required: false, options: ['パウダー', '圧雪', 'アイシー', 'スラッシュ', 'ウェット'], order: 3 },
  { name: 'rating', label: '評価', type: CustomFieldType.RATING, required: false, order: 4 },
  { name: 'verticalFeet', label: '標高差 (m)', type: CustomFieldType.NUMBER, required: false, order: 5 },
  { name: 'skiableAcres', label: 'スキーエリア (エーカー)', type: CustomFieldType.NUMBER, required: false, order: 6 },
  { name: 'location', label: '所在地', type: CustomFieldType.TEXT, required: false, order: 7 },
  { name: 'website', label: 'ウェブサイト', type: CustomFieldType.URL, required: false, order: 8 },
];

// Japanese train catalog - for tracking trains you've ridden
export const TRAIN_CATALOG_FIELDS: Omit<CustomField, 'id'>[] = [
  { name: 'nameKanji', label: '列車名（漢字）', type: CustomFieldType.TEXT, required: false, placeholder: '例: 新幹線', order: 1 },
  { name: 'nameKana', label: '列車名（かな）', type: CustomFieldType.TEXT, required: false, placeholder: '例: しんかんせん', order: 2 },
  { name: 'nameEnglish', label: 'English Name', type: CustomFieldType.TEXT, required: false, placeholder: 'e.g., Shinkansen', order: 3 },
  { name: 'hasRidden', label: '乗ったことある', type: CustomFieldType.BOOLEAN, required: false, order: 4 },
  { name: 'trainType', label: '種別', type: CustomFieldType.SELECT, required: false, options: ['新幹線', '特急', '急行', '快速', '普通', '地下鉄', '私鉄', 'その他'], order: 5 },
  { name: 'railwayCompany', label: '鉄道会社', type: CustomFieldType.TEXT, required: false, placeholder: '例: JR東日本', order: 6 },
  { name: 'route', label: '路線', type: CustomFieldType.TEXT, required: false, placeholder: '例: 東海道新幹線', order: 7 },
  { name: 'rating', label: '評価', type: CustomFieldType.RATING, required: false, order: 8 },
  { name: 'impression', label: '感想', type: CustomFieldType.TEXTAREA, required: false, placeholder: '乗った感想など', order: 9 },
  { name: 'rideDate', label: '乗車日', type: CustomFieldType.DATE, required: false, order: 10 },
];

// Anime catalog - for tracking anime/manga rankings
export const ANIME_CATALOG_FIELDS: Omit<CustomField, 'id'>[] = [
  { name: 'nameKanji', label: '名前（漢字）', type: CustomFieldType.TEXT, required: false, placeholder: '例: 進撃の巨人', order: 1 },
  { name: 'nameKana', label: '名前（かな）', type: CustomFieldType.TEXT, required: false, placeholder: '例: しんげきのきょじん', order: 2 },
  { name: 'nameEnglish', label: 'English Name', type: CustomFieldType.TEXT, required: false, placeholder: 'e.g., Attack on Titan', order: 3 },
  { name: 'score', label: 'スコア (0-10)', type: CustomFieldType.NUMBER, required: false, placeholder: '0-10', order: 4 },
  { name: 'animeDescription', label: '説明', type: CustomFieldType.TEXTAREA, required: false, placeholder: 'あらすじや感想', order: 5 },
];

// Voice actor catalog
export const VOICE_ACTOR_FIELDS: Omit<CustomField, 'id'>[] = [
  { name: 'nameKanji', label: '名前（漢字）', type: CustomFieldType.TEXT, required: false, placeholder: '例: 花澤香菜', order: 1 },
  { name: 'nameKana', label: '名前（かな）', type: CustomFieldType.TEXT, required: false, placeholder: '例: はなざわかな', order: 2 },
  { name: 'nameEnglish', label: 'English Name', type: CustomFieldType.TEXT, required: false, placeholder: 'e.g., Kana Hanazawa', order: 3 },
];

// Anime character catalog
export const ANIME_CHARACTER_FIELDS: Omit<CustomField, 'id'>[] = [
  { name: 'nameKanji', label: '名前（漢字）', type: CustomFieldType.TEXT, required: false, placeholder: '例: 御坂美琴', order: 1 },
  { name: 'nameKana', label: '名前（かな）', type: CustomFieldType.TEXT, required: false, placeholder: '例: みさかみこと', order: 2 },
  { name: 'nameEnglish', label: 'English Name', type: CustomFieldType.TEXT, required: false, placeholder: 'e.g., Mikoto Misaka', order: 3 },
  { name: 'animeId', label: 'アニメ', type: CustomFieldType.RELATION, required: false, order: 4, relationConfig: { hobbySlug: 'anime', multiple: false } },
  { name: 'voiceActorId', label: '声優', type: CustomFieldType.RELATION, required: false, order: 5, relationConfig: { hobbySlug: 'voice-actors', multiple: false } },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getDefaultFieldsForTemplate(templateType: HobbyTemplateType): Omit<CustomField, 'id'>[] {
  switch (templateType) {
    case HobbyTemplateType.CATALOG:
      return [];
    case HobbyTemplateType.GALLERY:
      return [];
    case HobbyTemplateType.LOG:
      return [
        { name: 'date', label: '日付', type: CustomFieldType.DATE, required: true, order: 1 },
        { name: 'notes', label: 'メモ', type: CustomFieldType.TEXTAREA, required: false, order: 2 },
      ];
    default:
      return [];
  }
}
