'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/services/tasksService';
import type { Task } from '@/services/tasksService';

/**
 * Hook to fetch tasks for the authenticated user
 */
export function useTasks(enabled: boolean = true) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.getTasks();
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tasks'));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks };
}

/**
 * Hook for task mutations
 */
export function useTaskMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateTaskCompletion = async (taskId: string) => {
    try {
      setLoading(true);
      setError(null);
      await api.updateTaskCompletion(taskId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update task');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    updateTaskCompletion,
    loading,
    error,
  };
}
