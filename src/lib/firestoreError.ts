const FIRESTORE_INDEX_URL_REGEX = /https:\/\/console\.firebase\.google\.com\/[^\s)]+/;
const TRAILING_URL_PUNCTUATION_REGEX = /[.,;]+$/;

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(TRAILING_URL_PUNCTUATION_REGEX, '');
}

export function getFirestoreIndexUrl(error: unknown): string | null {
  const match = getErrorMessage(error).match(FIRESTORE_INDEX_URL_REGEX);
  return match ? trimTrailingUrlPunctuation(match[0]) : null;
}
