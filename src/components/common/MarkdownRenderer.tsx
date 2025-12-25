'use client';

import React, { useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  defaultCodeLanguage?: string;
}

// Render inline markdown (bold, italic, code, links)
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code
          key={keyCounter++}
          style={{
            backgroundColor: '#e5e7eb',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '13px',
            fontFamily: 'monospace',
          }}
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(
        <strong key={keyCounter++} style={{ fontWeight: '600', color: '#111827' }}>
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<em key={keyCounter++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a
          key={keyCounter++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#10a37f', textDecoration: 'underline' }}
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Regular text - find next special char or end
    const nextSpecial = remaining.search(/[`*\[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Special char at start but no pattern matched, treat as text
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts.length === 1 ? parts[0] : parts;
}

// Render markdown content
function renderMarkdownContent(
  text: string,
  defaultCodeLanguage: string = 'typescript'
): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = keyCounter++;

    // Code block (```)
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3) || defaultCodeLanguage;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre
          key={key}
          style={{
            backgroundColor: '#1f2937',
            color: '#e5e7eb',
            padding: '16px',
            borderRadius: '8px',
            overflow: 'auto',
            margin: '16px 0',
            fontSize: '13px',
          }}
        >
          <code className={lang ? `language-${lang}` : undefined}>
            {codeLines.join('\n')}
          </code>
        </pre>
      );
      i++;
      continue;
    }

    // Headers (check from most specific to least specific)
    if (line.startsWith('#### ')) {
      elements.push(
        <h4
          key={key}
          style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#111827',
            marginTop: '20px',
            marginBottom: '10px',
          }}
        >
          {renderInlineMarkdown(line.slice(5))}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3
          key={key}
          style={{
            fontSize: '17px',
            fontWeight: '600',
            color: '#111827',
            marginTop: '24px',
            marginBottom: '12px',
          }}
        >
          {renderInlineMarkdown(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2
          key={key}
          style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#111827',
            marginTop: '28px',
            marginBottom: '14px',
          }}
        >
          {renderInlineMarkdown(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1
          key={key}
          style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#111827',
            marginTop: '32px',
            marginBottom: '16px',
          }}
        >
          {renderInlineMarkdown(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote
          key={key}
          style={{
            borderLeft: '4px solid #10a37f',
            paddingLeft: '16px',
            margin: '16px 0',
            color: '#6b7280',
            fontStyle: 'italic',
          }}
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx} style={{ margin: '4px 0' }}>
              {renderInlineMarkdown(ql)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      elements.push(
        <hr
          key={key}
          style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }}
        />
      );
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^[\s]*[-*]\s/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*]\s/)) {
        const itemKey = keyCounter++;
        const itemText = lines[i].replace(/^[\s]*[-*]\s/, '');
        listItems.push(
          <li key={itemKey} style={{ marginBottom: '6px' }}>
            {renderInlineMarkdown(itemText)}
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={key} style={{ paddingLeft: '24px', margin: '12px 0' }}>
          {listItems}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (line.match(/^[\s]*\d+\.\s/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*\d+\.\s/)) {
        const itemKey = keyCounter++;
        const itemText = lines[i].replace(/^[\s]*\d+\.\s/, '');
        listItems.push(
          <li key={itemKey} style={{ marginBottom: '6px' }}>
            {renderInlineMarkdown(itemText)}
          </li>
        );
        i++;
      }
      elements.push(
        <ol key={key} style={{ paddingLeft: '24px', margin: '12px 0' }}>
          {listItems}
        </ol>
      );
      continue;
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableRows.push(lines[i]);
        i++;
      }
      if (tableRows.length >= 2) {
        const headerRow = tableRows[0].split('|').filter((cell) => cell.trim());
        const dataRows = tableRows
          .slice(2)
          .map((row) => row.split('|').filter((cell) => cell.trim()));
        elements.push(
          <div key={key} style={{ overflowX: 'auto', margin: '16px 0' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}
            >
              <thead>
                <tr>
                  {headerRow.map((cell, idx) => (
                    <th
                      key={idx}
                      style={{
                        backgroundColor: '#f3f4f6',
                        padding: '10px 14px',
                        border: '1px solid #e5e7eb',
                        textAlign: 'left',
                        fontWeight: '600',
                      }}
                    >
                      {cell.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        style={{ padding: '10px 14px', border: '1px solid #e5e7eb' }}
                      >
                        {renderInlineMarkdown(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key} style={{ margin: '12px 0', lineHeight: 1.7 }}>
        {renderInlineMarkdown(line)}
      </p>
    );
    i++;
  }

  return elements;
}

export function MarkdownRenderer({
  content,
  className,
  defaultCodeLanguage = 'typescript',
}: MarkdownRendererProps) {
  useEffect(() => {
    Prism.highlightAll();
  }, [content]);

  return (
    <div
      className={className}
      style={{ color: '#374151', lineHeight: 1.8, fontSize: '15px' }}
    >
      {renderMarkdownContent(content, defaultCodeLanguage)}
    </div>
  );
}

export default MarkdownRenderer;
