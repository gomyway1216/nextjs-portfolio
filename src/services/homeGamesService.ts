import { auth } from '@/lib/firebaseConnect';
import type { HomeGamesConfig } from '@/lib/homeGames';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function parseError(response: Response): Promise<string> {
  const data = await response.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : `HTTP error! status: ${response.status}`;
}

export async function getHomeGamesConfig(): Promise<HomeGamesConfig> {
  const response = await fetch('/api/home-games', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

export async function updateHomeGamesConfig(gameIds: string[]): Promise<HomeGamesConfig> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/home-games', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ gameIds }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}
