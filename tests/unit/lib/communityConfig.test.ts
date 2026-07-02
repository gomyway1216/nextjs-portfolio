import { describe, expect, it } from 'vitest';

import {
  BAY_AREA_AI_PROFILE_URL,
  getBayAreaAiLocalizedUrl,
} from '@/lib/communityConfig';

describe('communityConfig', () => {
  it('points to the canonical Bay Area AI profile URL', () => {
    expect(BAY_AREA_AI_PROFILE_URL).toBe(
      'https://bayarea-ai.com/ja/u/yudai-yaguchi',
    );
  });

  it('builds localized Bay Area AI URLs', () => {
    expect(getBayAreaAiLocalizedUrl('ja-JP')).toBe('https://bayarea-ai.com/ja');
    expect(getBayAreaAiLocalizedUrl('en-US', '/u/yudai-yaguchi')).toBe(
      'https://bayarea-ai.com/en/u/yudai-yaguchi',
    );
  });
});
