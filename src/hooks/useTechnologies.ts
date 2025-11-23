'use client';

import { useState, useEffect } from 'react';
import * as api from '@/services/technologiesService';
import type { Technology } from '@/services/technologiesService';

/**
 * Hook to fetch all technologies
 */
export function useTechnologies() {
  const [technologies, setTechnologies] = useState<Technology[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchTechnologies = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getTechnologies();
        setTechnologies(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch technologies'));
      } finally {
        setLoading(false);
      }
    };

    fetchTechnologies();
  }, []);

  return { technologies, loading, error };
}

/**
 * Hook to fetch technology names
 */
export function useTechnologyNames() {
  const [technologyNames, setTechnologyNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchTechnologyNames = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getTechnologyNames();
        setTechnologyNames(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch technology names'));
      } finally {
        setLoading(false);
      }
    };

    fetchTechnologyNames();
  }, []);

  return { technologyNames, loading, error };
}
