import type { PostTranslations } from '@/lib/blog/postTranslations';

const HTML_START_PATTERN = /^\s*<\/?(p|div|h[1-6]|ul|ol|li|strong|em|a|img|blockquote|pre|code|table|thead|tbody|tr|td|th|br|iframe)\b/i;
const MARKDOWN_BLOCK_PATTERN = /^(#{1,6}\s+\S|[-*+]\s+\S|\d+\.\s+\S|>\s+\S|```)/;
const MARKDOWN_INLINE_PATTERN = /!\[[^\]]*]\([^)]+\)|\[[^\]]+]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__/;

export function isHtmlContent(content: string): boolean {
  return HTML_START_PATTERN.test(content);
}

export function normalizeTranslationsForMarkdownEditing(translations: PostTranslations): PostTranslations {
  return Object.fromEntries(
    Object.entries(translations).map(([lang, translation]) => [
      lang,
      {
        ...translation,
        body: normalizeBodyForMarkdownEditing(translation?.body || ''),
      },
    ]),
  ) as PostTranslations;
}

export function normalizeBodyForMarkdownEditing(body: string): string {
  if (!isHtmlContent(body) || typeof DOMParser === 'undefined') return body;

  const doc = new DOMParser().parseFromString(body, 'text/html');
  return serializeNodesToMarkdown(Array.from(doc.body.childNodes)).trim();
}

export function htmlWrappedMarkdownToMarkdown(body: string): string | null {
  if (!isHtmlContent(body) || typeof DOMParser === 'undefined') return null;

  const doc = new DOMParser().parseFromString(body, 'text/html');
  if (!hasEmbeddedMarkdownSyntax(doc)) return null;

  return serializeNodesToMarkdown(Array.from(doc.body.childNodes)).trim();
}

function hasEmbeddedMarkdownSyntax(doc: Document): boolean {
  return Array.from(doc.body.querySelectorAll('p, div, li, pre, code')).some((node) => {
    const text = (node.textContent || '').trim();
    return MARKDOWN_BLOCK_PATTERN.test(text) || MARKDOWN_INLINE_PATTERN.test(text);
  });
}

function serializeNodesToMarkdown(nodes: Node[]): string {
  return nodes.map(serializeNodeToMarkdown).join('').replace(/\n{3,}/g, '\n\n');
}

function serializeNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof HTMLElement)) return '';

  const children = () => serializeNodesToMarkdown(Array.from(node.childNodes));
  const text = () => children().trim();
  const tag = node.tagName.toLowerCase();

  switch (tag) {
    case 'br':
      return '\n';
    case 'p':
    case 'div':
      return `${text()}\n\n`;
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `${'#'.repeat(Number(tag[1]))} ${text()}\n\n`;
    case 'strong':
    case 'b':
      return `**${text()}**`;
    case 'em':
    case 'i':
      return `*${text()}*`;
    case 'code':
      if (node.parentElement?.tagName.toLowerCase() === 'pre') return node.textContent || '';
      return `\`${node.textContent || ''}\``;
    case 'pre':
      return `\`\`\`\n${node.textContent?.replace(/\n$/, '') || ''}\n\`\`\`\n\n`;
    case 'blockquote':
      return `${text().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
    case 'ul':
      return `${Array.from(node.children).map((child) => `- ${serializeNodeToMarkdown(child).trim()}`).join('\n')}\n\n`;
    case 'ol':
      return `${Array.from(node.children).map((child, index) => `${index + 1}. ${serializeNodeToMarkdown(child).trim()}`).join('\n')}\n\n`;
    case 'li':
      return text();
    case 'a': {
      const href = node.getAttribute('href');
      return href ? `[${text() || href}](${href})` : text();
    }
    case 'img': {
      const src = node.getAttribute('src');
      const alt = node.getAttribute('alt') || 'Image';
      return src ? `![${alt}](${src})\n\n` : '';
    }
    case 'table':
      return serializeTableToMarkdown(node);
    default:
      return children();
  }
}

function serializeTableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr'))
    .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent?.trim() || ''))
    .filter((row) => row.length > 0);

  if (rows.length === 0) return '';

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizeRow = (row: string[]) => Array.from({ length: columnCount }, (_, index) => row[index] || '');
  const [header, ...bodyRows] = rows.map(normalizeRow);
  const separator = header.map(() => '---');

  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.join(' | ')} |`),
    '',
    '',
  ].join('\n');
}
