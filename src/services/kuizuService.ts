import { auth } from '@/lib/firebaseConnect';
import type {
  Quiz,
  QuizCategory,
  QuizDifficulty,
  CreateQuizInput,
  CreateCustomQuizInput,
  UpdateCustomQuizInput,
  SoloResult,
  DailyChallengeEntry,
  QuizzesResponse,
  QuestionsResponse,
  HistoryResponse,
  StatsResponse,
  DailyChallengeResponse,
  CreateQuizResponse,
  QRCodeResponse,
  GenerateQuizResponse,
  QuestionType,
  QuestionTemplate,
  CreateQuestionInput,
} from '@/types/kuizu';

const BASE_URL = '/api/kuizu';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function apiCall<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }
  return data;
}

// ============================================================================
// QUESTIONS
// ============================================================================

export async function getQuestions(
  category?: QuizCategory,
  difficulty?: QuizDifficulty
): Promise<QuestionsResponse> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (difficulty) params.set('difficulty', difficulty);
  const query = params.toString();
  const url = query ? `${BASE_URL}/questions?${query}` : `${BASE_URL}/questions`;
  return apiCall<QuestionsResponse>(url);
}

export async function createQuestion(
  input: CreateQuestionInput
): Promise<{ id: string }> {
  return apiCall<{ id: string }>(`${BASE_URL}/questions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ============================================================================
// QUIZ GENERATION
// ============================================================================

export async function generateQuiz(
  input: CreateQuizInput
): Promise<GenerateQuizResponse> {
  return apiCall<GenerateQuizResponse>(`${BASE_URL}/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ============================================================================
// CUSTOM QUIZZES
// ============================================================================

export async function getCustomQuizzes(): Promise<QuizzesResponse> {
  return apiCall<QuizzesResponse>(`${BASE_URL}/custom`);
}

export async function getCustomQuiz(
  quizId: string,
  verified = false
): Promise<Quiz> {
  const url = verified
    ? `${BASE_URL}/custom/${quizId}?verified=true`
    : `${BASE_URL}/custom/${quizId}`;
  return apiCall<Quiz>(url);
}

export async function getCustomQuizByShareCode(
  shareCode: string
): Promise<Quiz> {
  return apiCall<Quiz>(`${BASE_URL}/share/${shareCode}`);
}

export async function createCustomQuiz(
  input: CreateCustomQuizInput
): Promise<CreateQuizResponse> {
  return apiCall<CreateQuizResponse>(`${BASE_URL}/custom`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCustomQuiz(
  quizId: string,
  input: UpdateCustomQuizInput
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`${BASE_URL}/custom/${quizId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteCustomQuiz(
  quizId: string
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`${BASE_URL}/custom/${quizId}`, {
    method: 'DELETE',
  });
}

export async function verifyQuizPasscode(
  quizId: string,
  passcode: string
): Promise<{ verified: boolean }> {
  return apiCall<{ verified: boolean }>(`${BASE_URL}/custom/${quizId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ passcode }),
  });
}

// ============================================================================
// SOLO RESULTS
// ============================================================================

export async function submitSoloResult(
  result: Omit<SoloResult, 'id' | 'createdAt'>
): Promise<{ id: string }> {
  return apiCall<{ id: string }>(`${BASE_URL}/results`, {
    method: 'POST',
    body: JSON.stringify(result),
  });
}

export async function getSoloResult(resultId: string): Promise<SoloResult> {
  return apiCall<SoloResult>(`${BASE_URL}/results/${resultId}`);
}

// ============================================================================
// DAILY CHALLENGE
// ============================================================================

export async function getDailyChallenge(): Promise<DailyChallengeResponse> {
  return apiCall<DailyChallengeResponse>(`${BASE_URL}/daily`);
}

export async function submitDailyResult(
  entry: Omit<DailyChallengeEntry, 'id' | 'completedAt'>
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`${BASE_URL}/daily/submit`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export async function getDailyLeaderboard(
  date?: string
): Promise<{ entries: DailyChallengeEntry[] }> {
  const url = date
    ? `${BASE_URL}/daily/leaderboard?date=${date}`
    : `${BASE_URL}/daily/leaderboard`;
  return apiCall<{ entries: DailyChallengeEntry[] }>(url);
}

// ============================================================================
// USER STATS & HISTORY
// ============================================================================

export async function getUserStats(): Promise<StatsResponse> {
  return apiCall<StatsResponse>(`${BASE_URL}/stats`);
}

export async function getHistory(): Promise<HistoryResponse> {
  return apiCall<HistoryResponse>(`${BASE_URL}/history`);
}

// ============================================================================
// QR CODE
// ============================================================================

export async function generateQRCode(quizId: string): Promise<QRCodeResponse> {
  return apiCall<QRCodeResponse>(`${BASE_URL}/qrcode`, {
    method: 'POST',
    body: JSON.stringify({ quizId }),
  });
}
