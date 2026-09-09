/** Optional educational metadata. Older articles keep their original title/summary. */
export interface LearningExperience {
  question: string;
  whyItMatters: string;
  quickInsight: string;
  prediction?: { prompt: string; outcome: string };
  experiment?: { steps: string; observation: string };
  nextQuestions: string[];
}

export function learningExperience(value: unknown): LearningExperience | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
  if (!text(v.question) || !text(v.whyItMatters) || !text(v.quickInsight)) return;
  const p = v.prediction as LearningExperience['prediction'];
  const e = v.experiment as LearningExperience['experiment'];
  return {
    question: v.question, whyItMatters: v.whyItMatters, quickInsight: v.quickInsight,
    ...(p && text(p.prompt) && text(p.outcome) ? { prediction: p } : {}),
    ...(e && text(e.steps) && text(e.observation) ? { experiment: e } : {}),
    nextQuestions: Array.isArray(v.nextQuestions) ? v.nextQuestions.filter(text).slice(0, 3) : [],
  };
}
