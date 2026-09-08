'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidDiagram from '@/components/common/MermaidDiagram';
import { safeLearningUrl } from '@/lib/learningLibrary';

export default function LearningContent({ content }: { content: string }) {
  return <div className="prose dark:prose-invert max-w-none break-words [&_table]:block [&_table]:overflow-x-auto">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      code: ({ className, children }) => className === 'language-mermaid' ? <MermaidDiagram chart={String(children).trim()} /> : <code className={className}>{children}</code>,
      img: ({ src, alt }) => <a href={safeLearningUrl(typeof src === 'string' ? src : undefined)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{alt || 'Open original figure'}</a>,
      a: ({ href, children }) => <a href={safeLearningUrl(href)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a>,
      pre: ({ children }) => <div className="my-4 overflow-x-auto rounded-lg bg-muted p-4 [&_code]:whitespace-pre">{children}</div>,
    }}>{content}</ReactMarkdown>
  </div>;
}
