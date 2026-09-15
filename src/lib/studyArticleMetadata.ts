/** Accept the JSON timestamp shape returned by Firebase as well as legacy ISO dates. */
export function formatArticleMetadataDate(value: unknown): string {
  try {
    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'object' && value !== null) {
      const timestamp = value as { _seconds?: number; seconds?: number; toDate?: () => Date };
      const seconds = timestamp._seconds ?? timestamp.seconds;
      date = typeof timestamp.toDate === 'function'
        ? timestamp.toDate()
        : typeof seconds === 'number' ? new Date(seconds * 1000) : new Date(Number.NaN);
    } else if (typeof value === 'string' || typeof value === 'number') {
      date = new Date(value);
    } else {
      return 'Unavailable';
    }
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return 'Unavailable';
    return date.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return 'Unavailable';
  }
}

export function getArticleGenerationDetail(aiModel: unknown): { label: 'Model' | 'Source'; value: string } {
  if (typeof aiModel !== 'string' || !aiModel.trim()) return { label: 'Model', value: 'Unavailable' };
  return aiModel.startsWith('personal-memory-mcp:')
    ? { label: 'Source', value: 'Personal Memory MCP' }
    : { label: 'Model', value: aiModel };
}
