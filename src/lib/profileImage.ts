export const ALLOWED_PROFILE_IMAGE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'upload.wikimedia.org',
  'picsum.photos',
  'cdn.myanimelist.net',
]);

export function normalizeProfileImageUrl(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== 'string') {
    throw new Error('Profile image URL must be a string');
  }

  const value = input.trim();
  if (!value) return '';

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Profile image URL must be a valid URL or local path');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Profile image URL must use HTTPS or a local path');
  }

  if (!ALLOWED_PROFILE_IMAGE_HOSTS.has(url.hostname)) {
    throw new Error(`Profile image host is not supported: ${url.hostname}`);
  }

  return value;
}

export function isSupportedProfileImageUrl(input: unknown): input is string {
  try {
    const normalized = normalizeProfileImageUrl(input);
    return typeof normalized === 'string' && normalized.length > 0;
  } catch {
    return false;
  }
}
