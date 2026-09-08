export const STUDY_ARTICLE_FEEDBACK_SIGNALS = [
  'useful',
  'not_useful',
  'too_niche',
  'not_relevant',
  'interesting',
  'already_knew',
  'too_difficult',
  'want_more',
] as const;

export type StudyArticleFeedbackSignal = (typeof STUDY_ARTICLE_FEEDBACK_SIGNALS)[number];

const NEGATIVE_REASONS: StudyArticleFeedbackSignal[] = ['too_niche', 'not_relevant'];

export function toggleStudyFeedbackSignal(
  current: StudyArticleFeedbackSignal[],
  signal: StudyArticleFeedbackSignal
): StudyArticleFeedbackSignal[] {
  if (current.includes(signal)) {
    return current.filter((item) => item !== signal &&
      !(signal === 'not_useful' && NEGATIVE_REASONS.includes(item)));
  }
  if (NEGATIVE_REASONS.includes(signal)) {
    return [...new Set([...current.filter((item) => item !== 'useful'), 'not_useful' as const, signal])];
  }
  const opposite = signal === 'useful' ? 'not_useful' : signal === 'not_useful' ? 'useful' : undefined;
  return [...current.filter((item) => item !== opposite &&
    !(signal === 'useful' && NEGATIVE_REASONS.includes(item))), signal];
}

export interface StudyArticleFeedbackInput {
  signals: StudyArticleFeedbackSignal[];
  skipped: boolean;
}

export interface StudyArticleFeedback extends StudyArticleFeedbackInput {
  articleId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type StudyArticleFeedbackParseResult =
  | { ok: true; value: StudyArticleFeedbackInput }
  | { ok: false; error: string };

export function parseStudyArticleFeedback(input: unknown): StudyArticleFeedbackParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Feedback must be an object' };
  }

  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.signals) || typeof raw.skipped !== 'boolean') {
    return { ok: false, error: 'signals and skipped are required' };
  }

  const allowed = new Set<string>(STUDY_ARTICLE_FEEDBACK_SIGNALS);
  if (!raw.signals.every((signal) => typeof signal === 'string' && allowed.has(signal))) {
    return { ok: false, error: 'Feedback contains an unsupported signal' };
  }

  const signals = [...new Set(raw.signals)] as StudyArticleFeedbackSignal[];
  if (signals.includes('useful') && signals.includes('not_useful')) {
    return { ok: false, error: 'Usefulness reactions are mutually exclusive' };
  }
  if (signals.some((signal) => NEGATIVE_REASONS.includes(signal)) && !signals.includes('not_useful')) {
    return { ok: false, error: 'Negative reasons require a not_useful vote' };
  }
  if (raw.skipped && signals.length > 0) {
    return { ok: false, error: 'Skipped feedback cannot include reaction signals' };
  }

  return { ok: true, value: { signals, skipped: raw.skipped } };
}
