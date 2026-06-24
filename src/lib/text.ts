export function toPlainText(content?: string | null): string {
  if (!content) return '';

  return content
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createPlainTextExcerpt(content?: string | null, maxLength = 160): string {
  const text = toPlainText(content);
  if (text.length <= maxLength) return text;

  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}
