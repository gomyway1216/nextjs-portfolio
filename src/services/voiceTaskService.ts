// Voice Task API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface VoiceTaskList {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface VoiceTask {
  id: string;
  name: string;
  list_id?: string;
  listId?: string;
  description?: string;
  created_at: string;
  completed: boolean;
  starred?: boolean;
  [key: string]: unknown;
}

export interface CreateVoiceTaskInput {
  name: string;
  list_id: string;
  description: string;
  created_at: string;
}

export interface CreateVoiceTaskResponse {
  task_id: string;
  [key: string]: unknown;
}

export interface VoiceSubTask {
  id?: string;
  name: string;
  completed: boolean;
  [key: string]: unknown;
}

export const getResponse = async (formData: FormData): Promise<Response> => {
  try {
    const response = await fetch(`${API_BASE_URL}/voice-task`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error('Error in getResponse:', error);
    throw error;
  }
};

export const getAllTaskLists = async (userId: string): Promise<VoiceTaskList[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/task-lists`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in getAllTaskLists:', error);
    throw error;
  }
};

export const getIncompleteTasks = async (userId: string, listId: string): Promise<VoiceTask[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/task-lists/${listId}/tasks?completed=false`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in getIncompleteTasks:', error);
    throw error;
  }
};

export const getCompletedTasks = async (userId: string, listId: string): Promise<VoiceTask[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/task-lists/${listId}/tasks?completed=true`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in getCompletedTasks:', error);
    throw error;
  }
};

export const getStarredTasks = async (userId: string): Promise<VoiceTask[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/tasks?starred=true`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in getStarredTasks:', error);
    throw error;
  }
};

export const createTask = async (
  userId: string,
  taskData: CreateVoiceTaskInput
): Promise<CreateVoiceTaskResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in createTask:', error);
    throw error;
  }
};

export const createTaskList = async (userId: string, listName: string): Promise<VoiceTaskList> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/task-lists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: listName }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in createTaskList:', error);
    throw error;
  }
};

export const markTaskAsCompleted = async (userId: string, taskId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/tasks/${taskId}/complete`, {
      method: 'PUT',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error in markTaskAsCompleted:', error);
    throw error;
  }
};

export const markTaskAsIncomplete = async (userId: string, taskId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/tasks/${taskId}/incomplete`, {
      method: 'PUT',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error in markTaskAsIncomplete:', error);
    throw error;
  }
};

export const starTask = async (userId: string, listId: string, taskId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/task-lists/${listId}/tasks/${taskId}/star`, {
      method: 'PUT',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error in starTask:', error);
    throw error;
  }
};

export const unstarTask = async (userId: string, listId: string, taskId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/task-lists/${listId}/tasks/${taskId}/unstar`, {
      method: 'PUT',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error in unstarTask:', error);
    throw error;
  }
};

export const deleteTask = async (userId: string, listId: string, taskId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/task-lists/${listId}/tasks/${taskId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error in deleteTask:', error);
    throw error;
  }
};

export const createSubTask = async (
  userId: string,
  taskId: string,
  subtaskData: VoiceSubTask
): Promise<VoiceSubTask> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/tasks/${taskId}/subtasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subtaskData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in createSubTask:', error);
    throw error;
  }
};
