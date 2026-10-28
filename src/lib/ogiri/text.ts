/** Match the stored spelling without removing emoji ZWJ sequences. */
export function normalizePlayerText(value: string): string {
  return value.normalize('NFKC')
    .replace(/[\p{Cc}\u200B\u200E-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, '')
    .trim();
}
