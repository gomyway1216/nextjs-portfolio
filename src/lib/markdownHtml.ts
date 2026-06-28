import type { PostTranslations } from '@/lib/blog/postTranslations';

const HTML_START_PATTERN = /^\s*<\/?(p|div|h[1-6]|ul|ol|li|strong|em|a|img|blockquote|pre|code|table|thead|tbody|tr|td|th|br|iframe)\b/i;
const MARKDOWN_BLOCK_PATTERN = /^(#{1,6}\s+\S|[-*+]\s+\S|\d+\.\s+\S|>\s+\S|```|!\[[^\]]*]\([^)]+\)\s*$)/;
type SerializeContext = {
  inListItem?: boolean;
  listDepth?: number;
};

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
  return Array.from(doc.body.querySelectorAll('p, div, li')).some((node) => {
    const text = (node.textContent || '').trim();
    return MARKDOWN_BLOCK_PATTERN.test(text);
  });
}

function serializeNodesToMarkdown(nodes: Node[], context: SerializeContext = {}): string {
  return nodes.map((node) => serializeNodeToMarkdown(node, context)).join('').replace(/\n{3,}/g, '\n\n');
}

function serializeNodeToMarkdown(node: Node, context: SerializeContext = {}): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof HTMLElement)) return '';

  const children = (nextContext: SerializeContext = context) => serializeNodesToMarkdown(Array.from(node.childNodes), nextContext);
  const text = () => children().trim();
  const tag = node.tagName.toLowerCase();

  switch (tag) {
    case 'br':
      return '\n';
    case 'p':
    case 'div':
      if (context.inListItem) return text();
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
    case 'pre': {
      const codeElement = node.querySelector('code');
      const language = /language-([\w-]+)/.exec(codeElement?.className || '')?.[1] || '';
      const code = (codeElement?.textContent || node.textContent || '').replace(/\n$/, '');
      return `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    }
    case 'blockquote':
      return `${text().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
    case 'ul':
      return serializeList(node, false, context.listDepth || 0);
    case 'ol':
      return serializeList(node, true, context.listDepth || 0);
    case 'li':
      return serializeListItem(node, '-', context.listDepth || 0);
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

function serializeList(list: HTMLElement, ordered: boolean, depth: number): string {
  const items = Array.from(list.children)
    .filter((child) => child.tagName.toLowerCase() === 'li')
    .map((child, index) => serializeListItem(child, ordered ? `${index + 1}.` : '-', depth));

  return `${items.join('\n')}\n\n`;
}

function serializeListItem(item: Element, marker: string, depth: number): string {
  const indent = '  '.repeat(depth);
  const nestedBlocks: string[] = [];
  const inlineParts: string[] = [];

  Array.from(item.childNodes).forEach((child) => {
    if (child instanceof HTMLElement && ['ul', 'ol'].includes(child.tagName.toLowerCase())) {
      nestedBlocks.push(serializeList(child, child.tagName.toLowerCase() === 'ol', depth + 1).trimEnd());
      return;
    }

    inlineParts.push(serializeNodeToMarkdown(child, {
      inListItem: true,
      listDepth: depth,
    }));
  });

  const inlineText = inlineParts.join('').replace(/\s+/g, ' ').trim();
  const nestedText = nestedBlocks.length > 0 ? `\n${nestedBlocks.join('\n')}` : '';
  return `${indent}${marker} ${inlineText}${nestedText}`;
}

function serializeTableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr'))
    .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => escapeTableCell(cell.textContent || '')))
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

function escapeTableCell(value: string): string {
  return value.trim().replace(/\|/g, '\\|');
}
