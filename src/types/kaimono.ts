// ============================================================================
// ENUMS
// ============================================================================

export enum ItemCategory {
  FOOD = 'food',
  DAIRY = 'dairy',
  MEAT = 'meat',
  FISH = 'fish',
  VEGETABLE = 'vegetable',
  FRUIT = 'fruit',
  SNACK = 'snack',
  DRINK = 'drink',
  DAILY = 'daily',
  CLEANING = 'cleaning',
  MEDICINE = 'medicine',
  CLOTHING = 'clothing',
  ELECTRONICS = 'electronics',
  OTHER = 'other',
}

export enum ItemPriority {
  MUST_BUY = 'must_buy',
  NICE_TO_HAVE = 'nice_to_have',
}

export enum StoreType {
  SUPERMARKET = 'supermarket',
  CONVENIENCE = 'convenience',
  DRUGSTORE = 'drugstore',
  DEPARTMENT = 'department',
  ELECTRONICS_STORE = 'electronics_store',
  ONLINE = 'online',
  OTHER = 'other',
}

export enum RecurringInterval {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

export enum KaimonoCurrency {
  JPY = 'JPY',
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  CNY = 'CNY',
  KRW = 'KRW',
  TWD = 'TWD',
  THB = 'THB',
  AUD = 'AUD',
}

// ============================================================================
// LABEL MAPS
// ============================================================================

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  [ItemCategory.FOOD]: '食品',
  [ItemCategory.DAIRY]: '乳製品',
  [ItemCategory.MEAT]: '肉類',
  [ItemCategory.FISH]: '魚介類',
  [ItemCategory.VEGETABLE]: '野菜',
  [ItemCategory.FRUIT]: '果物',
  [ItemCategory.SNACK]: 'お菓子',
  [ItemCategory.DRINK]: '飲み物',
  [ItemCategory.DAILY]: '日用品',
  [ItemCategory.CLEANING]: '掃除用品',
  [ItemCategory.MEDICINE]: '薬',
  [ItemCategory.CLOTHING]: '衣類',
  [ItemCategory.ELECTRONICS]: '電子機器',
  [ItemCategory.OTHER]: 'その他',
};

export const ITEM_CATEGORY_EMOJI: Record<ItemCategory, string> = {
  [ItemCategory.FOOD]: '🍚',
  [ItemCategory.DAIRY]: '🥛',
  [ItemCategory.MEAT]: '🥩',
  [ItemCategory.FISH]: '🐟',
  [ItemCategory.VEGETABLE]: '🥬',
  [ItemCategory.FRUIT]: '🍎',
  [ItemCategory.SNACK]: '🍪',
  [ItemCategory.DRINK]: '🥤',
  [ItemCategory.DAILY]: '🧴',
  [ItemCategory.CLEANING]: '🧹',
  [ItemCategory.MEDICINE]: '💊',
  [ItemCategory.CLOTHING]: '👕',
  [ItemCategory.ELECTRONICS]: '📱',
  [ItemCategory.OTHER]: '📦',
};

export const ITEM_PRIORITY_LABELS: Record<ItemPriority, string> = {
  [ItemPriority.MUST_BUY]: '必須',
  [ItemPriority.NICE_TO_HAVE]: 'あれば',
};

export const STORE_TYPE_LABELS: Record<StoreType, string> = {
  [StoreType.SUPERMARKET]: 'スーパー',
  [StoreType.CONVENIENCE]: 'コンビニ',
  [StoreType.DRUGSTORE]: 'ドラッグストア',
  [StoreType.DEPARTMENT]: 'デパート',
  [StoreType.ELECTRONICS_STORE]: '家電量販店',
  [StoreType.ONLINE]: 'オンライン',
  [StoreType.OTHER]: 'その他',
};

export const RECURRING_INTERVAL_LABELS: Record<RecurringInterval, string> = {
  [RecurringInterval.DAILY]: '毎日',
  [RecurringInterval.WEEKLY]: '毎週',
  [RecurringInterval.BIWEEKLY]: '隔週',
  [RecurringInterval.MONTHLY]: '毎月',
};

export const KAIMONO_CURRENCY_SYMBOLS: Record<KaimonoCurrency, string> = {
  [KaimonoCurrency.JPY]: '¥',
  [KaimonoCurrency.USD]: '$',
  [KaimonoCurrency.EUR]: '€',
  [KaimonoCurrency.GBP]: '£',
  [KaimonoCurrency.CNY]: '¥',
  [KaimonoCurrency.KRW]: '₩',
  [KaimonoCurrency.TWD]: 'NT$',
  [KaimonoCurrency.THB]: '฿',
  [KaimonoCurrency.AUD]: 'A$',
};

export const KAIMONO_CURRENCY_NAMES: Record<KaimonoCurrency, string> = {
  [KaimonoCurrency.JPY]: '日本円',
  [KaimonoCurrency.USD]: '米ドル',
  [KaimonoCurrency.EUR]: 'ユーロ',
  [KaimonoCurrency.GBP]: '英ポンド',
  [KaimonoCurrency.CNY]: '人民元',
  [KaimonoCurrency.KRW]: '韓国ウォン',
  [KaimonoCurrency.TWD]: '台湾ドル',
  [KaimonoCurrency.THB]: 'タイバーツ',
  [KaimonoCurrency.AUD]: '豪ドル',
};

// ============================================================================
// SHOPPING ITEM TYPES
// ============================================================================

export interface ShoppingItem {
  id: string;
  name: string;
  category: ItemCategory;
  priority: ItemPriority;
  quantity: number;
  unit?: string;
  price?: number;
  isPurchased: boolean;
  purchasedAt?: string;
  note?: string;
  store?: string;
  recurringId?: string;
  order: number;
}

export interface CreateShoppingItemInput {
  name: string;
  category?: ItemCategory;
  priority?: ItemPriority;
  quantity?: number;
  unit?: string;
  price?: number;
  note?: string;
  store?: string;
  recurringId?: string;
}

export interface UpdateShoppingItemInput {
  name?: string;
  category?: ItemCategory;
  priority?: ItemPriority;
  quantity?: number;
  unit?: string;
  price?: number;
  isPurchased?: boolean;
  note?: string;
  store?: string;
  order?: number;
}

// ============================================================================
// STORE TYPES
// ============================================================================

export interface Store {
  id: string;
  name: string;
  type: StoreType;
  order: number;
}

export interface CreateStoreInput {
  name: string;
  type?: StoreType;
}

// ============================================================================
// LIST MEMBER TYPES
// ============================================================================

export interface ListMember {
  id: string;
  name: string;
  userId?: string;
  email?: string;
  joinedAt: string;
  isActive: boolean;
}

// ============================================================================
// SHOPPING LIST TYPES
// ============================================================================

export interface ShoppingList {
  id: string;
  name: string;
  date: string;
  budget?: number;
  currency: string;
  createdBy: string | null;
  shareCode: string;
  hasPasscode: boolean;
  members: ListMember[];
  items: ShoppingItem[];
  stores: Store[];
  isCompleted: boolean;
  completedAt?: string;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShoppingListInput {
  name: string;
  date?: string;
  budget?: number;
  currency?: string;
  passcode?: string;
  stores?: CreateStoreInput[];
  items?: CreateShoppingItemInput[];
}

export interface UpdateShoppingListInput {
  name?: string;
  date?: string;
  budget?: number;
  currency?: string;
  passcode?: string | null;
  isCompleted?: boolean;
  stores?: Store[];
}

export interface VerifyPasscodeInput {
  passcode: string;
}

// ============================================================================
// RECURRING ITEM TYPES
// ============================================================================

export interface RecurringItem {
  id: string;
  userId: string;
  name: string;
  category: ItemCategory;
  interval: RecurringInterval;
  quantity: number;
  unit?: string;
  price?: number;
  store?: string;
  note?: string;
  lastAddedDate?: string;
  nextDueDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringItemInput {
  name: string;
  category?: ItemCategory;
  interval: RecurringInterval;
  quantity?: number;
  unit?: string;
  price?: number;
  store?: string;
  note?: string;
  nextDueDate?: string;
}

export interface UpdateRecurringItemInput {
  name?: string;
  category?: ItemCategory;
  interval?: RecurringInterval;
  quantity?: number;
  unit?: string;
  price?: number;
  store?: string;
  note?: string;
  nextDueDate?: string;
  isActive?: boolean;
}

// ============================================================================
// FREQUENT ITEM TYPES
// ============================================================================

export interface FrequentItem {
  id: string;
  userId: string;
  name: string;
  category: ItemCategory;
  purchaseCount: number;
  lastPurchasedAt: string;
  averagePrice?: number;
  preferredStore?: string;
  unit?: string;
}

// ============================================================================
// USER HISTORY TYPES
// ============================================================================

export interface KaimonoUserHistory {
  id: string;
  userId: string;
  listId: string;
  listName: string;
  date: string;
  totalSpent: number;
  itemCount: number;
  currency: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ShoppingListsResponse {
  lists: ShoppingList[];
  total: number;
}

export interface HistoryResponse {
  history: KaimonoUserHistory[];
  total: number;
}

export interface FrequentItemsResponse {
  items: FrequentItem[];
  total: number;
}

export interface RecurringItemsResponse {
  items: RecurringItem[];
  total: number;
}

export interface CreateShoppingListResponse {
  id: string;
  shareCode: string;
}

export interface QRCodeResponse {
  qrCodeDataUrl: string;
  shareUrl: string;
}
