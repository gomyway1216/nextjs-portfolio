'use client';

import { useState, useEffect } from 'react';
import * as api from '@/services/profileService';

/**
 * Hook to fetch resume link
 */
export function useResumeLink() {
  const [resumeLink, setResumeLink] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchResumeLink = async () => {
      try {
        setLoading(true);
        setError(null);
        const link = await api.getResumeLink();
        setResumeLink(link);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch resume link'));
      } finally {
        setLoading(false);
      }
    };

    fetchResumeLink();
  }, []);

  return { resumeLink, loading, error };
}
