import { auth } from '@/lib/firebaseConnect';
import type { Writing } from '@/lib/writing';

export type { Writing };

export interface WritingInput {
  title: string;
  source: string;
  url: string;
  date?: string;
  summaryEn?: string;
  summaryJa?: string;
  isPublic?: boolean;
  order?: number;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

// Sends the admin token when logged in, so the admin panel receives hidden
// entries too; anonymous callers get the published list.
export async function getWritings(): Promise<Writing[]> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/writing', {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.writings;
}

export async function createWriting(writing: WritingInput): Promise<string> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/writing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(writing),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

export async function updateWriting(id: string, writing: WritingInput): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/writing/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(writing),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}

export async function deleteWriting(id: string): Promise<boolean> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/writing/${id}`, {
    method: 'DELETE',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return true;
}
