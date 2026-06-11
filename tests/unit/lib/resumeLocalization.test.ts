import { describe, expect, it } from 'vitest';
import {
  calculateJobDuration,
  formatJobDurationRange,
  getLocalizedJobType,
  getLocalizedJobValue,
} from '@/lib/resumeLocalization';

const translations: Record<string, string> = {
  'home.resume.jobType.fullTime': '正社員',
  'home.resume.jobType.partTime': 'パート・アルバイト',
  'home.resume.jobType.contract': '契約社員',
  'home.resume.jobType.internship': 'インターン',
  'home.resume.jobType.freelance': '業務委託',
  'home.resume.jobType.remote': 'リモート',
};

const t = (key: string) => translations[key] || key;

describe('resumeLocalization', () => {
  it('prefers Japanese job fields and falls back to English fields', () => {
    expect(getLocalizedJobValue({ jobPosition: 'Engineer', jobPositionJa: 'エンジニア' }, 'jobPosition', 'ja')).toBe('エンジニア');
    expect(getLocalizedJobValue({ jobPosition: 'Engineer' }, 'jobPosition', 'ja')).toBe('Engineer');
  });

  it('does not resolve prototype keys in localized field paths', () => {
    expect(getLocalizedJobValue({ constructor: { jobPosition: 'polluted' } }, 'constructor.jobPosition', 'en')).toBe('');
    expect(getLocalizedJobValue({ prototype: { jobPosition: 'polluted' } }, 'prototype.jobPosition', 'en')).toBe('');
    expect(getLocalizedJobValue({ __proto__: { jobPosition: 'polluted' } }, '__proto__.jobPosition', 'en')).toBe('');
  });

  it('uses the canonical English job type before custom Japanese labels', () => {
    const job = {
      jobType: 'Part-time',
      jobTypeJa: '学生',
    };

    expect(getLocalizedJobType(job, 'ja', t)).toBe('パート・アルバイト');
  });

  it('formats month-year resume date ranges in Japanese', () => {
    expect(formatJobDurationRange('Apr 2019 - May 2020', 'ja')).toBe('2019年4月 - 2020年5月');
    expect(calculateJobDuration('Apr 2019 - May 2020', 'ja')).toBe('1年 1ヶ月');
  });

  it('handles year-only and present resume date ranges', () => {
    const now = new Date(2026, 5, 10);

    expect(formatJobDurationRange('2025 - Present', 'ja', now)).toBe('2025年 - 現在');
    expect(calculateJobDuration('2025 - Present', 'ja', now)).toBe('1年 5ヶ月');
    expect(calculateJobDuration('2023 - 2025', 'en', now)).toBe('2 yrs 0 mos');
  });

  it('keeps month-year parsing stable when the current day overflows the parsed month', () => {
    const endOfMonth = new Date(2026, 0, 31);

    expect(formatJobDurationRange('Feb 2019 - Mar 2019', 'ja', endOfMonth)).toBe('2019年2月 - 2019年3月');
    expect(calculateJobDuration('Feb 2019 - Present', 'en', endOfMonth)).toBe('6 yrs 11 mos');
  });
});
