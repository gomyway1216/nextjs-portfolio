import { auth } from '@/lib/firebaseConnect';

export interface Task {
  id: string;
  [key: string]: any;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function getTasks(userId: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/task?userId=${userId}`, {
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

export async function updateTaskCompletion(userId: string, taskId: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/task/${taskId}?userId=${userId}`, {
    method: 'PUT',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}
