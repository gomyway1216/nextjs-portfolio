/**
 * Todo / Task Service — Frontend API client.
 *
 * Uses Cloud Functions directly for AI-powered extraction endpoints,
 * and the existing voiceTask-style API for basic CRUD.
 */
import { auth } from '@/lib/firebaseConnect';
import { getCloudFunctionUrl } from '@/app/api/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedTask {
  name: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  category?: string;
}

export interface ExtractionResult {
  tasks: ExtractedTask[];
  summary: string;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  priority?: string;
  category?: string;
  completed: boolean;
  starred: boolean;
  created_at: string;
  tags?: string[];
  list_id?: string;
}

export interface TaskList {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

function getUserId(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.uid;
}

// ---------------------------------------------------------------------------
// Cloud Function caller (for AI endpoints that use verifyAuthAndUserId)
// ---------------------------------------------------------------------------

async function cloudFnCall<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const headers = await getAuthHeaders();
  const userId = getUserId();

  const url = getCloudFunctionUrl(functionName);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ ...body, user_id: userId }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || `Cloud function ${functionName} failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// AI extraction endpoints
// ---------------------------------------------------------------------------

/**
 * Upload a screenshot and extract tasks from it via Claude Vision.
 */
export async function extractTasksFromImage(
  file: File,
  options?: { hint?: string; listId?: string; save?: boolean },
): Promise<ExtractionResult> {
  // Convert file to base64
  const buffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
  );

  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  return cloudFnCall<ExtractionResult>('imageTask', {
    image_base64: base64,
    media_type: mediaType,
    hint: options?.hint,
    list_id: options?.listId,
    save: options?.save ?? false,
  });
}

/**
 * Extract tasks from pasted text via Claude.
 */
export async function extractTasksFromText(
  text: string,
  options?: { hint?: string; listId?: string; save?: boolean },
): Promise<ExtractionResult> {
  return cloudFnCall<ExtractionResult>('textTask', {
    text,
    hint: options?.hint,
    list_id: options?.listId,
    save: options?.save ?? false,
  });
}

// ---------------------------------------------------------------------------
// Basic CRUD (wraps existing Cloud Functions with auth)
// ---------------------------------------------------------------------------

export async function getTaskLists(): Promise<TaskList[]> {
  const userId = getUserId();
  return cloudFnCall<TaskList[]>('getAllTaskLists', { user_id: userId });
}

export async function getIncompleteTasks(listId = 'default'): Promise<Task[]> {
  const userId = getUserId();
  return cloudFnCall<Task[]>('getIncompleteTasks', { user_id: userId, list_id: listId });
}

export async function getCompletedTasks(listId = 'default'): Promise<Task[]> {
  const userId = getUserId();
  return cloudFnCall<Task[]>('getCompletedTasks', { user_id: userId, list_id: listId });
}

export async function createTask(task: {
  name: string;
  description?: string;
  priority?: string;
  category?: string;
  list_id?: string;
}): Promise<Task> {
  const userId = getUserId();
  return cloudFnCall<Task>('createTask', { user_id: userId, ...task });
}

export async function markTaskCompleted(taskId: string): Promise<void> {
  const userId = getUserId();
  await cloudFnCall<unknown>('markTaskAsCompleted', { user_id: userId, task_id: taskId });
}

export async function markTaskIncomplete(taskId: string): Promise<void> {
  const userId = getUserId();
  await cloudFnCall<unknown>('markTaskAsIncomplete', { user_id: userId, task_id: taskId });
}

export async function deleteTask(listId: string, taskId: string): Promise<void> {
  const userId = getUserId();
  await cloudFnCall<unknown>('deleteTask', { user_id: userId, list_id: listId, task_id: taskId });
}

export async function starTask(listId: string, taskId: string): Promise<void> {
  const userId = getUserId();
  await cloudFnCall<unknown>('starTask', { user_id: userId, list_id: listId, task_id: taskId });
}

export async function unstarTask(listId: string, taskId: string): Promise<void> {
  const userId = getUserId();
  await cloudFnCall<unknown>('unstarTask', { user_id: userId, list_id: listId, task_id: taskId });
}

export async function createTaskList(name: string): Promise<TaskList> {
  const userId = getUserId();
  return cloudFnCall<TaskList>('createTaskList', { user_id: userId, name });
}
