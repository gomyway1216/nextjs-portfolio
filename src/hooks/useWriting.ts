'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/services/writingService';
import type { WritingInput } from '@/services/writingService';
import type { Writing } from '@/lib/writing';

/** Fetch writing entries (admin token => includes hidden). */
export function useWritings() {
  const [writings, setWritings] = useState<Writing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWritings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getWritings();
      setWritings(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch writing'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWritings();
  }, [fetchWritings]);

  return { writings, loading, error, refetch: fetchWritings };
}

/** Create / update / delete writing entries. */
export function useWritingMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createWriting = async (writing: WritingInput) => {
    try {
      setLoading(true);
      setError(null);
      return await api.createWriting(writing);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to create writing');
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const updateWriting = async (id: string, writing: WritingInput) => {
    try {
      setLoading(true);
      setError(null);
      await api.updateWriting(id, writing);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update writing');
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const deleteWriting = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await api.deleteWriting(id);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to delete writing');
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { createWriting, updateWriting, deleteWriting, loading, error };
}
