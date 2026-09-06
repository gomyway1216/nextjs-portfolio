'use client';

import { Check, Link2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildShareTargets } from '@/lib/blog/shareLinks';
import styles from './post-share-links.module.css';

interface PostShareLinksProps {
  /** Canonical absolute URL of the article (the language-pinned one for /ja). */
  url: string;
  title: string;
}

const COPIED_RESET_MS = 2000;

/**
 * Share row under an article: intent links for X / LinkedIn / Hatena plus
 * a copy-link button. No share SDKs — each network is a plain link, so
 * nothing loads until the reader clicks.
 */
const PostShareLinks = ({ url, title }: PostShareLinksProps) => {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targets = buildShareTargets(url, title);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      // Clipboard API unavailable (insecure context, permissions): tell
      // the reader instead of silently doing nothing.
      setCopyState('failed');
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState('idle'), COPIED_RESET_MS);
  };

  const copyLabel =
    copyState === 'copied'
      ? t('blogPage.post.linkCopied')
      : copyState === 'failed'
        ? t('blogPage.post.copyFailed')
        : t('blogPage.post.copyLink');

  return (
    <div className={styles.share} aria-label={t('blogPage.post.share')}>
      <span className={styles.label}>{t('blogPage.post.share')}</span>
      {targets.map((target) => (
        <a
          key={target.network}
          className={styles.pill}
          href={target.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('blogPage.post.shareOn', { network: target.label })}
        >
          {target.label}
        </a>
      ))}
      <button
        type="button"
        className={`${styles.pill} ${copyState === 'copied' ? styles.copied : ''}`}
        onClick={handleCopy}
        aria-live="polite"
      >
        {copyState === 'copied' ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Link2 size={14} aria-hidden="true" />
        )}
        {copyLabel}
      </button>
    </div>
  );
};

export default PostShareLinks;
