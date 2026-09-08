'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

import {
  STUDY_ARTICLE_FEEDBACK_SIGNALS,
  StudyArticleFeedbackSignal,
  toggleStudyFeedbackSignal,
} from '@/lib/studyArticleFeedback';
import { getArticleFeedback, saveArticleFeedback } from '@/services/studyService';

interface ArticleFeedbackProps {
  articleId: string;
}

export default function ArticleFeedback({ articleId }: ArticleFeedbackProps) {
  // Reset state when navigating between articles, including any in-flight save.
  return <ArticleFeedbackForm key={articleId} articleId={articleId} />;
}

function ArticleFeedbackForm({ articleId }: ArticleFeedbackProps) {
  const { t } = useTranslation('common', { keyPrefix: 'study.hub.articleFeedback' });
  const [signals, setSignals] = useState<StudyArticleFeedbackSignal[]>([]);
  const [skipped, setSkipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getArticleFeedback(articleId)
      .then((feedback) => {
        if (!active) return;
        setSignals(feedback?.signals ?? []);
        setSkipped(feedback?.skipped ?? false);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [articleId, attempt]);

  const persist = async (nextSignals: StudyArticleFeedbackSignal[], nextSkipped: boolean) => {
    if (loading || loadError || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage('');
    try {
      const saved = await saveArticleFeedback(articleId, {
        signals: nextSignals,
        skipped: nextSkipped,
      });
      setSignals(saved.signals);
      setSkipped(saved.skipped);
      setMessage('saved');
    } catch {
      // Keep the last confirmed state visible; do not claim an unsaved vote succeeded.
      setMessage('saveError');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const disabled = loading || loadError || saving;
  const renderSignal = (signal: StudyArticleFeedbackSignal, primary = false) => {
    const selected = signals.includes(signal) && !skipped;
    return (
      <button
        key={signal}
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => void persist(toggleStudyFeedbackSignal(signals, signal), false)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          selected
            ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
            : 'border-gray-300 bg-white text-gray-700 hover:border-emerald-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200'
        } ${primary ? 'font-semibold' : ''}`}
      >
        {signal === 'useful' && <ThumbsUp size={17} aria-hidden="true" />}
        {signal === 'not_useful' && <ThumbsDown size={17} aria-hidden="true" />}
        {t(`signals.${signal}`)}
      </button>
    );
  };

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800" aria-label={t('title')}>
      <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100">{t('title')}</h3>
      <p className="mb-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{t('description')}</p>
      <div className="flex flex-wrap gap-2">
        {renderSignal('useful', true)}
        {renderSignal('not_useful', true)}
      </div>
      <details className="mt-3 text-sm text-gray-700 dark:text-gray-200">
        <summary className="cursor-pointer">{t('details')}</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {STUDY_ARTICLE_FEEDBACK_SIGNALS.filter((signal) => signal !== 'useful' && signal !== 'not_useful').map((signal) => renderSignal(signal))}
        </div>
      </details>
      <button type="button" disabled={disabled} onClick={() => void persist([], !skipped)}
        className="mt-3 text-xs text-gray-600 underline disabled:opacity-50 dark:text-gray-300">
        {skipped ? t('undoSkip') : t('skip')}
      </button>
      <p role="status" className="mt-2 text-xs text-gray-600 dark:text-gray-300">
        {loading ? t('loading') : saving ? t('saving') : loadError ? t('loadError') : message ? t(message) : skipped ? t('skipped') : ''}
      </p>
      {loadError && <button type="button" onClick={() => {
        setLoading(true);
        setLoadError(false);
        setAttempt((value) => value + 1);
      }} className="mt-1 text-sm text-blue-600 underline">{t('retry')}</button>}
    </section>
  );
}
