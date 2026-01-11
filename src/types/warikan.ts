// ============================================================================
// ENUMS
// ============================================================================

export enum SplitType {
  EQUAL = 'equal',
  PERCENTAGE = 'percentage',
  AMOUNT = 'amount',
  SHARES = 'shares',
}

export enum PaymentCategory {
  FOOD = 'food',
  DRINK = 'drink',
  TRANSPORT = 'transport',
  ACCOMMODATION = 'accommodation',
  ACTIVITY = 'activity',
  SHOPPING = 'shopping',
  OTHER = 'other',
}

export enum Currency {
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

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  [Currency.JPY]: '¥',
  [Currency.USD]: '$',
  [Currency.EUR]: '€',
  [Currency.GBP]: '£',
  [Currency.CNY]: '¥',
  [Currency.KRW]: '₩',
  [Currency.TWD]: 'NT$',
  [Currency.THB]: '฿',
  [Currency.AUD]: 'A$',
};

export const CURRENCY_NAMES: Record<Currency, string> = {
  [Currency.JPY]: '日本円',
  [Currency.USD]: '米ドル',
  [Currency.EUR]: 'ユーロ',
  [Currency.GBP]: '英ポンド',
  [Currency.CNY]: '人民元',
  [Currency.KRW]: '韓国ウォン',
  [Currency.TWD]: '台湾ドル',
  [Currency.THB]: 'タイバーツ',
  [Currency.AUD]: '豪ドル',
};

export const PAYMENT_CATEGORY_LABELS: Record<PaymentCategory, string> = {
  [PaymentCategory.FOOD]: '食事',
  [PaymentCategory.DRINK]: '飲み物',
  [PaymentCategory.TRANSPORT]: '交通費',
  [PaymentCategory.ACCOMMODATION]: '宿泊',
  [PaymentCategory.ACTIVITY]: 'アクティビティ',
  [PaymentCategory.SHOPPING]: '買い物',
  [PaymentCategory.OTHER]: 'その他',
};

// ============================================================================
// MEMBER TYPES
// ============================================================================

export interface Member {
  id: string;
  name: string;
  userId?: string; // Firebase Auth UID (if logged in)
  email?: string;
  weight: number; // For weighted splits (default: 1.0)
  joinedAt: string;
  isActive: boolean;
}

export interface CreateMemberInput {
  name: string;
  email?: string;
  weight?: number;
}

export interface UpdateMemberInput {
  name?: string;
  email?: string;
  weight?: number;
  isActive?: boolean;
}

// ============================================================================
// GROUP TYPES
// ============================================================================

export interface WarikanGroup {
  id: string;
  name: string;
  description?: string;
  currency: Currency;
  exchangeRates?: Record<string, number>;
  createdBy: string | null; // null for anonymous users
  shareCode: string;
  hasPasscode: boolean; // Whether passcode is set
  members: Member[];
  isSettled: boolean;
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  currency?: Currency;
  passcode?: string; // Optional 4-6 digit passcode
  members?: CreateMemberInput[];
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  currency?: Currency;
  exchangeRates?: Record<string, number>;
  passcode?: string | null; // Set to null to remove passcode
  isSettled?: boolean;
}

export interface VerifyPasscodeInput {
  passcode: string;
}

// ============================================================================
// PAYMENT TYPES
// ============================================================================

export interface Participant {
  memberId: string;
  weight?: number; // Override weight for this payment
  amount?: number; // For fixed amount split
  percentage?: number; // For percentage split
  shares?: number; // For shares split
}

export interface Payment {
  id: string;
  groupId: string;
  payerId: string; // memberId who paid
  amount: number;
  currency: string;
  description: string;
  category?: PaymentCategory;
  date: string;
  splitType: SplitType;
  participants: Participant[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentInput {
  groupId: string;
  payerId: string;
  amount: number;
  currency?: string;
  description: string;
  category?: PaymentCategory;
  date?: string;
  splitType: SplitType;
  participants: Participant[];
}

export interface UpdatePaymentInput {
  payerId?: string;
  amount?: number;
  currency?: string;
  description?: string;
  category?: PaymentCategory;
  date?: string;
  splitType?: SplitType;
  participants?: Participant[];
}

// ============================================================================
// SETTLEMENT TYPES
// ============================================================================

export interface SettlementSummary {
  memberId: string;
  memberName: string;
  totalPaid: number; // Total amount paid by this member
  totalOwed: number; // Total amount this member should pay
  balance: number; // positive = should receive, negative = should pay
}

export interface OptimizedSettlement {
  from: Member;
  to: Member;
  amount: number;
}

export interface SettlementCalculation {
  summaries: SettlementSummary[];
  settlements: OptimizedSettlement[];
  totalAmount: number;
  currency: Currency;
}

// ============================================================================
// USER HISTORY TYPES
// ============================================================================

export interface UserHistory {
  id: string;
  userId: string;
  groupId: string;
  groupName: string;
  role: 'creator' | 'member';
  totalPaid: number;
  totalOwed: number;
  currency: Currency;
  isSettled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface GroupsResponse {
  groups: WarikanGroup[];
  total: number;
}

export interface PaymentsResponse {
  payments: Payment[];
  total: number;
}

export interface HistoryResponse {
  history: UserHistory[];
  total: number;
}

export interface CreateGroupResponse {
  id: string;
  shareCode: string;
}

export interface QRCodeResponse {
  qrCodeDataUrl: string;
  shareUrl: string;
}

// ============================================================================
// BALANCE TYPE (for algorithm)
// ============================================================================

export interface Balance {
  memberId: string;
  memberName: string;
  amount: number; // positive = creditor, negative = debtor
}
