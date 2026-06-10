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
    logActivity({
      action: 'client.route_error',
      result: 'error',
      severity: 'error',
      error_message: error.message,
      error_details: {
        stack: error.stack,
        digest: error.digest,
      },
      params: { url: window.location.href },
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
      {error.digest && (
        <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>Ref: {error.digest}</p>
      )}
      <button type="button" className="px-btn px-btn-theme" onClick={reset}>
        {t('common.retry')}
      </button>
    </div>
  );
}
