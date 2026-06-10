import { differenceInMonths, format, isValid, parse } from 'date-fns';

export type ResumeLanguage = 'en' | 'ja';

type Translate = (key: string) => string;

interface ParsedResumeDate {
  date: Date;
  precision: 'month' | 'year' | 'present';
}

const PRESENT_VALUES = new Set(['present', 'current', 'now']);

const JOB_TYPE_TRANSLATION_KEYS: Record<string, string> = {
  'full-time': 'home.resume.jobType.fullTime',
  fulltime: 'home.resume.jobType.fullTime',
  'part-time': 'home.resume.jobType.partTime',
  parttime: 'home.resume.jobType.partTime',
  contract: 'home.resume.jobType.contract',
  internship: 'home.resume.jobType.internship',
  intern: 'home.resume.jobType.internship',
  freelance: 'home.resume.jobType.freelance',
  remote: 'home.resume.jobType.remote',
};

const getNestedValue = (obj: Record<string, unknown>, path: string) => {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

export const getLocalizedJobValue = (
  job: Record<string, unknown>,
  baseField: string,
  language: ResumeLanguage
) => {
  if (language === 'ja') {
    const jaPaths = [
      `${baseField}Ja`,
      `${baseField}JA`,
      `${baseField}Japanese`,
      `${baseField}_ja`,
      `${baseField}_jp`,
      `ja.${baseField}`,
      `jp.${baseField}`,
      `japanese.${baseField}`,
      `translations.ja.${baseField}`,
      `translations.jp.${baseField}`,
      `localized.ja.${baseField}`,
      `locale.ja.${baseField}`,
    ];

    for (const path of jaPaths) {
      const value = getNestedValue(job, path);
      if (typeof value === 'string' && value.trim()) return value;
    }
  }

  const enPaths = [
    `${baseField}En`,
    `${baseField}EN`,
    `${baseField}_en`,
    `en.${baseField}`,
    `translations.en.${baseField}`,
    `localized.en.${baseField}`,
    `locale.en.${baseField}`,
    baseField,
  ];

  for (const path of enPaths) {
    const value = getNestedValue(job, path);
    if (typeof value === 'string' && value.trim()) return value;
  }

  return '';
};

const normalizeJobType = (value: string) => value.trim().toLowerCase();

export const getLocalizedJobType = (
  job: Record<string, unknown>,
  language: ResumeLanguage,
  t: Translate
) => {
  const englishType = getLocalizedJobValue(job, 'jobType', 'en');
  const localizedType = getLocalizedJobValue(job, 'jobType', language);
  const canonicalType = englishType || localizedType;
  const translationKey = JOB_TYPE_TRANSLATION_KEYS[normalizeJobType(canonicalType)];

  if (translationKey) return t(translationKey);

  if (language === 'ja' && localizedType && localizedType !== englishType) {
    return localizedType;
  }

  return canonicalType;
};

const parseResumeDatePart = (value: string, now = new Date()): ParsedResumeDate | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (PRESENT_VALUES.has(trimmed.toLowerCase())) {
    return { date: now, precision: 'present' };
  }

  if (/^\d{4}$/.test(trimmed)) {
    return { date: new Date(Number(trimmed), 0, 1), precision: 'year' };
  }

  for (const pattern of ['MMM yyyy', 'MMMM yyyy']) {
    const parsed = parse(trimmed, pattern, now);
    if (isValid(parsed)) {
      return { date: parsed, precision: 'month' };
    }
  }

  return null;
};

const formatResumeDatePart = (
  value: string,
  language: ResumeLanguage,
  now = new Date()
) => {
  const parsed = parseResumeDatePart(value, now);
  if (!parsed) return value.trim();

  if (parsed.precision === 'present') {
    return language === 'ja' ? '現在' : 'Present';
  }

  if (language === 'ja') {
    return parsed.precision === 'year'
      ? `${format(parsed.date, 'yyyy')}年`
      : `${format(parsed.date, 'yyyy')}年${format(parsed.date, 'M')}月`;
  }

  return parsed.precision === 'year'
    ? format(parsed.date, 'yyyy')
    : format(parsed.date, 'MMM yyyy');
};

export const formatJobDurationRange = (
  jobDuration: string,
  language: ResumeLanguage,
  now = new Date()
) => {
  const [start, end] = jobDuration.split(/\s+-\s+/);
  if (!start || !end) return jobDuration;

  return `${formatResumeDatePart(start, language, now)} - ${formatResumeDatePart(end, language, now)}`;
};

const formatDurationUnit = (
  value: number,
  singular: string,
  plural: string
) => `${value} ${value === 1 ? singular : plural}`;

export const calculateJobDuration = (
  jobDuration: string,
  language: ResumeLanguage,
  now = new Date()
) => {
  const [start, end] = jobDuration.split(/\s+-\s+/);
  if (!start || !end) return '';

  const startDate = parseResumeDatePart(start, now);
  const endDate = parseResumeDatePart(end, now);
  if (!startDate || !endDate) return '';

  const months = differenceInMonths(endDate.date, startDate.date);
  if (!Number.isFinite(months) || months < 0) return '';

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (language === 'ja') {
    return `${years > 0 ? `${years}年 ` : ''}${remainingMonths}ヶ月`;
  }

  return `${years > 0 ? `${formatDurationUnit(years, 'yr', 'yrs')} ` : ''}${formatDurationUnit(remainingMonths, 'mo', 'mos')}`;
};
