'use client';

import { useState, useEffect } from 'react';
import * as api from '@/services/resumeService';
import type { Job, Education } from '@/services/resumeService';

/**
 * Hook to fetch jobs
 */
export function useJobs(initialJobs?: Job[]) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs ?? []);
  const [loading, setLoading] = useState(initialJobs === undefined);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (initialJobs !== undefined) return;

    const fetchJobs = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getJobs();
        setJobs(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch jobs'));
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [initialJobs]);

  return { jobs, loading, error };
}

/**
 * Hook to fetch education
 */
export function useEducation(initialEducation?: Education[]) {
  const [education, setEducation] = useState<Education[]>(initialEducation ?? []);
  const [loading, setLoading] = useState(initialEducation === undefined);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (initialEducation !== undefined) return;

    const fetchEducation = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getEducation();
        setEducation(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch education'));
      } finally {
        setLoading(false);
      }
    };

    fetchEducation();
  }, [initialEducation]);

  return { education, loading, error };
}
