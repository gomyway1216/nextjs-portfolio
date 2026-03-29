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
  due_date?: string | null;
  assigned_to?: string | null;
  created_at: string;
  created_by?: string;
  tags?: string[];
  list_id?: string;
}

export interface TaskList {
  id: string;
  name: string;
}

export interface GroupMember {
  id: string;
  name: string;
  userId?: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface TaskGroup {
  id: string;
  name: string;
  description?: string;
  share_code: string;
  created_by: string;
  members: GroupMember[];
  created_at: string;
  updated_at: string;
}

export interface GroupPreview {
  id: string;
  name: string;
  description?: string;
  member_count: number;
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
// Cloud Function caller
// ---------------------------------------------------------------------------

async function cloudFnCall<T>(
  functionName: string,
  body: Record<string, unknown>,
  method: 'POST' | 'GET' = 'POST',
): Promise<T> {
  const headers = await getAuthHeaders();
  const userId = getUserId();
  const url = getCloudFunctionUrl(functionName);

  if (method === 'GET') {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...body, user_id: userId })) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `${functionName} failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ ...body, user_id: userId }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || `${functionName} failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// AI extraction endpoints
// ---------------------------------------------------------------------------

export async function extractTasksFromImage(
  file: File,
  options?: { hint?: string; listId?: string; save?: boolean },
): Promise<ExtractionResult> {
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
// Personal Task CRUD
// ---------------------------------------------------------------------------

export async function getTaskLists(): Promise<TaskList[]> {
  return cloudFnCall<TaskList[]>('getAllTaskLists', {});
}

export async function getIncompleteTasks(listId = 'default'): Promise<Task[]> {
  return cloudFnCall<Task[]>('getIncompleteTasks', { list_id: listId });
}

export async function getCompletedTasks(listId = 'default'): Promise<Task[]> {
  return cloudFnCall<Task[]>('getCompletedTasks', { list_id: listId });
}

export async function createTask(task: {
  name: string;
  description?: string;
  priority?: string;
  category?: string;
  due_date?: string;
  list_id?: string;
}): Promise<Task> {
  return cloudFnCall<Task>('createTask', { ...task, list_id: task.list_id || 'default' });
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
  await cloudFnCall<unknown>('updateTask', { task_id: taskId, ...updates });
}

export async function markTaskCompleted(taskId: string): Promise<void> {
  await cloudFnCall<unknown>('markTaskAsCompleted', { task_id: taskId });
}

export async function markTaskIncomplete(taskId: string): Promise<void> {
  await cloudFnCall<unknown>('markTaskAsIncomplete', { task_id: taskId });
}

export async function deleteTask(listId: string, taskId: string): Promise<void> {
  await cloudFnCall<unknown>('deleteTask', { list_id: listId, task_id: taskId });
}

export async function starTask(listId: string, taskId: string): Promise<void> {
  await cloudFnCall<unknown>('starTask', { list_id: listId, task_id: taskId });
}

export async function unstarTask(listId: string, taskId: string): Promise<void> {
  await cloudFnCall<unknown>('unstarTask', { list_id: listId, task_id: taskId });
}

export async function createTaskList(name: string): Promise<TaskList> {
  return cloudFnCall<TaskList>('createTaskList', { name });
}

// ---------------------------------------------------------------------------
// Task Groups
// ---------------------------------------------------------------------------

export async function createTaskGroup(
  name: string,
  description?: string,
  memberName?: string,
): Promise<TaskGroup> {
  return cloudFnCall<TaskGroup>('createTaskGroup', {
    name,
    description,
    member_name: memberName,
  });
}

export async function getTaskGroups(): Promise<TaskGroup[]> {
  return cloudFnCall<TaskGroup[]>('getTaskGroups', {});
}

export async function getTaskGroup(groupId: string): Promise<TaskGroup> {
  return cloudFnCall<TaskGroup>('getTaskGroup', { group_id: groupId }, 'GET');
}

export async function getGroupPreviewByShareCode(shareCode: string): Promise<GroupPreview> {
  // This endpoint doesn't require auth but we pass it anyway
  const url = getCloudFunctionUrl('getTaskGroupByShareCode');
  const response = await fetch(`${url}?code=${shareCode}`);
  if (!response.ok) throw new Error('Group not found');
  return response.json() as Promise<GroupPreview>;
}

export async function joinTaskGroup(shareCode: string, memberName: string): Promise<{ group_id: string; member: GroupMember }> {
  return cloudFnCall<{ group_id: string; member: GroupMember }>('joinTaskGroup', {
    share_code: shareCode,
    member_name: memberName,
  });
}

export async function leaveTaskGroup(groupId: string): Promise<void> {
  await cloudFnCall<unknown>('leaveTaskGroup', { group_id: groupId });
}

export async function updateTaskGroup(groupId: string, updates: { name?: string; description?: string }): Promise<void> {
  await cloudFnCall<unknown>('updateTaskGroup', { group_id: groupId, ...updates });
}

export async function deleteTaskGroup(groupId: string): Promise<void> {
  await cloudFnCall<unknown>('deleteTaskGroup', { group_id: groupId });
}

// ---------------------------------------------------------------------------
// Group Tasks
// ---------------------------------------------------------------------------

export async function createGroupTask(groupId: string, task: {
  name: string;
  description?: string;
  priority?: string;
  category?: string;
  due_date?: string;
  assigned_to?: string;
}): Promise<{ id: string }> {
  return cloudFnCall<{ id: string }>('createGroupTask', { group_id: groupId, ...task });
}

export async function getGroupTasks(groupId: string, completed?: boolean): Promise<Task[]> {
  return cloudFnCall<Task[]>('getGroupTasks', {
    group_id: groupId,
    ...(completed !== undefined ? { completed: String(completed) } : {}),
  }, 'GET');
}

export async function updateGroupTask(groupId: string, taskId: string, updates: Partial<Task>): Promise<void> {
  await cloudFnCall<unknown>('updateGroupTask', { group_id: groupId, task_id: taskId, ...updates });
}

export async function deleteGroupTask(groupId: string, taskId: string): Promise<void> {
  await cloudFnCall<unknown>('deleteGroupTask', { group_id: groupId, task_id: taskId });
}
