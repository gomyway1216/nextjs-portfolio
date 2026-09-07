'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  STUDY_ARTICLE_FEEDBACK_SIGNALS,
  StudyArticleFeedbackSignal,
} from '@/lib/studyArticleFeedback';
import { getArticleFeedback, saveArticleFeedback } from '@/services/studyService';

interface ArticleFeedbackProps {
  articleId: string;
}

export default function ArticleFeedback({ articleId }: ArticleFeedbackProps) {
  const { t } = useTranslation();
  const [signals, setSignals] = useState<StudyArticleFeedbackSignal[]>([]);
  const [skipped, setSkipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getArticleFeedback(articleId)
      .then((feedback) => {
        if (!active || !feedback) return;
        setSignals(feedback.signals);
        setSkipped(feedback.skipped);
      })
      .catch(() => {
        if (active) setMessage(t('study.articleFeedback.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [articleId, t]);

  const toggleSignal = (signal: StudyArticleFeedbackSignal) => {
    setSkipped(false);
    setMessage('');
    setSignals((current) =>
      current.includes(signal)
        ? current.filter((item) => item !== signal)
        : [...current, signal]
    );
  };

  const persist = async (nextSignals: StudyArticleFeedbackSignal[], nextSkipped: boolean) => {
    setSaving(true);
    setMessage('');
    try {
      const saved = await saveArticleFeedback(articleId, {
        signals: nextSignals,
        skipped: nextSkipped,
      });
      setSignals(saved.signals);
      setSkipped(saved.skipped);
      setMessage(t('study.articleFeedback.saved'));
    } catch {
      setMessage(t('study.articleFeedback.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p style={{ color: '#6b7280', fontSize: '13px' }}>{t('study.articleFeedback.loading')}</p>;
  }

  return (
    <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
      <h3 style={{ fontWeight: 600, color: '#111827', marginBottom: '6px', fontSize: '14px' }}>
        {t('study.articleFeedback.title')}
      </h3>
      <p style={{ color: '#6b7280', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>
        {t('study.articleFeedback.description')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        {STUDY_ARTICLE_FEEDBACK_SIGNALS.map((signal) => {
          const selected = signals.includes(signal) && !skipped;
          return (
            <button
              key={signal}
              type="button"
              aria-pressed={selected}
              disabled={saving}
              onClick={() => toggleSignal(signal)}
              style={{
                border: `1px solid ${selected ? '#10a37f' : '#d1d5db'}`,
                borderRadius: '999px',
                padding: '7px 10px',
                backgroundColor: selected ? '#d1fae5' : '#ffffff',
                color: selected ? '#065f46' : '#374151',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '12px',
              }}
            >
              {t(`study.articleFeedback.signals.${signal}`)}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          disabled={saving}
          onClick={() => persist(signals, false)}
          style={{
            border: 'none',
            borderRadius: '6px',
            padding: '8px 12px',
            backgroundColor: '#10a37f',
            color: '#ffffff',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {saving ? t('study.articleFeedback.saving') : t('study.articleFeedback.save')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => persist([], !skipped)}
          style={{
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            padding: '7px 11px',
            backgroundColor: skipped ? '#fef3c7' : '#ffffff',
            color: '#374151',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '12px',
          }}
        >
          {skipped ? t('study.articleFeedback.undoSkip') : t('study.articleFeedback.skip')}
        </button>
        {message && <span role="status" style={{ color: '#6b7280', fontSize: '12px' }}>{message}</span>}
      </div>
    </div>
  );
}
