'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { logActivity } from '@/lib/activityLog';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    // Root error boundary: must never throw itself, so access the error
    // object defensively.
    logActivity({
      action: 'client.route_error',
      result: 'error',
      severity: 'error',
      error_message: error?.message || 'Unknown error',
      error_details: {
        stack: error?.stack,
        digest: error?.digest,
      },
      params: { url: typeof window !== 'undefined' ? window.location.href : '' },
    });
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h2>{t('common.error')}</h2>
      <p>{t('common.errorDescription')}</p>
      {error?.digest && (
        <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
          {t('common.errorReference')}: {error.digest}
        </p>
      )}
      <button type="button" className="px-btn px-btn-theme" onClick={reset}>
        {t('common.retry')}
      </button>
    </div>
  );
}
