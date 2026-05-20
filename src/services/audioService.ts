// Audio Service - Frontend API client for study article audio generation
import { auth } from '@/lib/firebaseConnect';
import { ArticleAudio, AudioTemplate } from '@/types/study';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function apiCall<T>(url: string, options: RequestInit = {}): Promise<T> {
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
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Audio API request failed');
  }
  return data;
}

export interface GenerateAudioResult {
  audio: ArticleAudio;
  skipped?: boolean;
  reason?: string;
}

export async function generateArticleAudio(
  articleId: string,
  options: { template?: AudioTemplate; force?: boolean } = {},
): Promise<GenerateAudioResult> {
  const data = await apiCall<{
    success: boolean;
    audio: ArticleAudio;
    skipped?: boolean;
    reason?: string;
  }>(`/api/study/articles/${articleId}/audio`, {
    method: 'POST',
    body: JSON.stringify({
      template: options.template ?? 'tech',
      force: options.force ?? false,
    }),
  });
  return { audio: data.audio, skipped: data.skipped, reason: data.reason };
}

export async function deleteArticleAudio(articleId: string): Promise<void> {
  await apiCall(`/api/study/articles/${articleId}/audio`, { method: 'DELETE' });
}
