'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidDiagram from '@/components/common/MermaidDiagram';
import { safeLearningUrl } from '@/lib/learningLibrary';

export default function LearningContent({ content }: { content: string }) {
  return <div className="prose dark:prose-invert max-w-none break-words [&_table]:block [&_table]:overflow-x-auto">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      code: ({ className, children }) => className === 'language-mermaid' ? <MermaidDiagram chart={String(children).trim()} /> : <code className={className}>{children}</code>,
      img: ({ src, alt }) => {
        const url = safeLearningUrl(typeof src === 'string' ? src : undefined);
        return url ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{alt || 'Open original figure'}</a> : <span>{alt || 'Figure reference unavailable'}</span>;
      },
      a: ({ href, children }) => {
        const url = safeLearningUrl(href);
        return url ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a> : <span>{children}</span>;
      },
      pre: ({ children }) => <div className="my-4 overflow-x-auto rounded-lg bg-muted p-4 [&_code]:whitespace-pre">{children}</div>,
    }}>{content}</ReactMarkdown>
  </div>;
}
