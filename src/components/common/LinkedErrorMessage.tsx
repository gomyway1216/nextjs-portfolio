import type { CSSProperties, ReactNode } from 'react';
import { trimTrailingUrlPunctuation } from '@/lib/firestoreError';

const URL_REGEX = /(https?:\/\/[^\s)]+)/g;

const defaultStyle: CSSProperties = {
  marginTop: '12px',
  padding: '12px 14px',
  border: '1px solid rgba(239, 68, 68, 0.35)',
  borderRadius: '8px',
  backgroundColor: 'rgba(239, 68, 68, 0.08)',
  color: '#fecaca',
  fontSize: '12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const defaultLinkStyle: CSSProperties = {
  color: '#a855f7',
  textDecoration: 'underline',
  wordBreak: 'break-all',
};

interface LinkedErrorMessageProps {
  message: string;
  className?: string;
}

export default function LinkedErrorMessage({ message, className }: LinkedErrorMessageProps) {
  const segments: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of message.matchAll(URL_REGEX)) {
    const rawUrl = match[0];
    const url = trimTrailingUrlPunctuation(rawUrl);
    const trailingText = rawUrl.slice(url.length);
    const start = match.index ?? 0;

    if (start > lastIndex) {
      segments.push(message.slice(lastIndex, start));
    }

    segments.push(
      <a
        key={start}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={className ? undefined : defaultLinkStyle}
      >
        {url}
      </a>,
    );

    if (trailingText) {
      segments.push(trailingText);
    }

    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < message.length) {
    segments.push(message.slice(lastIndex));
  }

  return (
    <div role="alert" className={className} style={className ? undefined : defaultStyle}>
      {segments}
    </div>
  );
}
