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
  hobbyId: string;
}

// ============================================================================
// PREDEFINED TEMPLATES
// ============================================================================

export const FISH_CATALOG_FIELDS: Omit<CustomField, 'id'>[] = [
  { name: 'scientificName', label: '学名', type: CustomFieldType.TEXT, required: false, order: 1 },
  { name: 'habitat', label: '生息地', type: CustomFieldType.TEXT, required: false, order: 2 },
  { name: 'size', label: 'サイズ', type: CustomFieldType.TEXT, required: false, placeholder: '例: 30cm', order: 3 },
  { name: 'caughtDate', label: '捕獲日', type: CustomFieldType.DATE, required: false, order: 4 },
  { name: 'caughtLocation', label: '捕獲場所', type: CustomFieldType.LOCATION, required: false, order: 5 },
  { name: 'difficulty', label: '捕獲難易度', type: CustomFieldType.RATING, required: false, order: 6 },
];

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
