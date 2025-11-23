'use client';

import { useState, useEffect } from 'react';
import * as api from '@/services/resumeService';
import type { Job, Education } from '@/services/resumeService';

/**
 * Hook to fetch jobs
 */
export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
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
  }, []);

  return { jobs, loading, error };
}

/**
 * Hook to fetch education
 */
export function useEducation() {
  const [education, setEducation] = useState<Education[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
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
  }, []);

  return { education, loading, error };
}
