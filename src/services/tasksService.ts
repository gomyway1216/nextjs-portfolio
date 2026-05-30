import { auth } from '@/lib/firebaseConnect';

export interface Task {
  id: string;
  [key: string]: unknown;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function getTasks(): Promise<Task[]> {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/tasks`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.tasks;
}

export async function updateTaskCompletion(taskId: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/tasks/${taskId}`, {
    method: 'PUT',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}
