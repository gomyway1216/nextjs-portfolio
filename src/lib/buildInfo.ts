/**
 * Build metadata injected at compile time by next.config.ts.
 * Used to attach version + git SHA to outbound logs and Cloud Function calls.
 */

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const APP_BUILD_SHA = process.env.NEXT_PUBLIC_APP_BUILD_SHA ?? 'unknown';
export const APP_ENV: 'dev' | 'prod' =
  process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
