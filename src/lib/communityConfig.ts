export const BAY_AREA_AI_URL = 'https://bayarea-ai.com';
export const BAY_AREA_AI_PROFILE_SLUG = 'yudai-yaguchi';
export const BAY_AREA_AI_PROFILE_URL = `${BAY_AREA_AI_URL}/ja/u/${BAY_AREA_AI_PROFILE_SLUG}`;

export function getBayAreaAiLocalizedUrl(locale: string, path = ''): string {
  const lang = locale.startsWith('ja') ? 'ja' : 'en';
  const normalizedPath = path
    ? path.startsWith('/')
      ? path
      : `/${path}`
    : '';
  return `${BAY_AREA_AI_URL}/${lang}${normalizedPath}`;
}
