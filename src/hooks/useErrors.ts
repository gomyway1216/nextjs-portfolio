// Application-wide Error Tracking Hook
import { useState, useCallback, useEffect } from 'react';
import * as errorService from '@/services/errorService';
import { AppError, ErrorSource, ErrorSeverity } from '@/types/errors';

export function useAppErrors(initialOptions?: {
  resolved?: boolean;
  source?: ErrorSource;
  severity?: ErrorSeverity;
}) {
  const [errors, setErrors] = useState<AppError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchErrors = useCallback(
    async (
      options: {
        resolved?: boolean;
        source?: ErrorSource;
        severity?: ErrorSeverity;
        limit?: number;
      } = {}
    ) => {
      try {
        setLoading(true);
        setError(null);
        const data = await errorService.getAppErrors({
          resolved: options.resolved ?? initialOptions?.resolved,
          source: options.source || initialOptions?.source,
          severity: options.severity || initialOptions?.severity,
          limit: options.limit,
        });
        setErrors(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch errors'));
      } finally {
        setLoading(false);
      }
    },
    [initialOptions?.resolved, initialOptions?.source, initialOptions?.severity]
  );

  const resolveError = useCallback(async (id: string) => {
    await errorService.resolveAppError(id);
    setErrors((prev) =>
      prev.map((e) => (e.id === id ? { ...e, resolved: true, resolvedAt: new Date().toISOString() } : e))
    );
  }, []);

  const unresolveError = useCallback(async (id: string) => {
    await errorService.unresolveAppError(id);
    setErrors((prev) =>
      prev.map((e) => (e.id === id ? { ...e, resolved: false, resolvedAt: undefined } : e))
    );
  }, []);

  const deleteError = useCallback(async (id: string) => {
    await errorService.deleteAppError(id);
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  return {
    errors,
    loading,
    error,
    fetchErrors,
    resolveError,
    unresolveError,
    deleteError,
  };
}
