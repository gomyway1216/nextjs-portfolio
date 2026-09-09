/** Generation-time data only. Mirrored in the other repository; never execute author code. */
export interface LearningQuiz {
  id: string; type: 'quiz'; title: string; prompt: string; hint: string; explanation: string;
  choices: { id: string; label: string; correct: boolean; feedback: string }[];
}
export interface LearningExperiment {
  id: string; type: 'experiment'; title: string; prompt: string; initialStateId: string;
  states: { id: string; label: string; explanation: string;
    panels: { label: string; value: string }[];
    actions: { label: string; target: string }[];
  }[];
}
export interface LearningPlay { version: 1; activities: (LearningQuiz | LearningExperiment)[] }
const fail = (): never => { throw new Error('learningPlay is invalid'); };
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
const text = (v: unknown, max = 1200): string =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : fail();
const id = (v: unknown): string => {
  const s = text(v, 64); return /^[a-zA-Z0-9_-]+$/.test(s) ? s : fail();
};
const array = (v: unknown, min: number, max: number): unknown[] =>
  Array.isArray(v) && v.length >= min && v.length <= max ? v : fail();
const unique = (ids: string[]) => { if (new Set(ids).size !== ids.length) fail(); };
export function parseLearningPlay(value: unknown): LearningPlay | undefined {
  if (value === undefined) return;
  const v = object(value);
  if (v.version !== 1 || JSON.stringify(v).length > 50000) fail();
  const activities = array(v.activities, 1, 8).map((raw): LearningQuiz | LearningExperiment => {
    const a = object(raw);
    const base = { id: id(a.id), title: text(a.title, 200), prompt: text(a.prompt, 600) };
    if (a.type === 'quiz') {
      const choices = array(a.choices, 2, 5).map(rawChoice => {
        const c = object(rawChoice);
        if (typeof c.correct !== 'boolean') fail();
        return { id: id(c.id), label: text(c.label, 200), correct: c.correct as boolean, feedback: text(c.feedback) };
      });
      unique(choices.map(c => c.id));
      if (choices.filter(c => c.correct).length !== 1) fail();
      return { ...base, type: 'quiz', hint: text(a.hint, 600), explanation: text(a.explanation, 2000), choices };
    }
    if (a.type !== 'experiment') return fail();
    const states = array(a.states, 2, 12).map(rawState => {
      const s = object(rawState);
      return { id: id(s.id), label: text(s.label, 200), explanation: text(s.explanation),
        panels: array(s.panels, 1, 4).map(rawPanel => {
          const p = object(rawPanel); return { label: text(p.label, 120), value: text(p.value, 300) };
        }),
        actions: array(s.actions, 0, 6).map(rawAction => {
          const t = object(rawAction); return { label: text(t.label, 120), target: id(t.target) };
        }),
      };
    });
    unique(states.map(s => s.id));
    const initialStateId = id(a.initialStateId);
    const ids = new Set(states.map(s => s.id));
    if (!ids.has(initialStateId) || states.some(s => s.actions.some(t => !ids.has(t.target)))) fail();
    // Every prepared scene must actually be reachable.
    const visited = new Set<string>();
    const visit = (key: string) => {
      if (visited.has(key)) return;
      visited.add(key); states.find(s => s.id === key)!.actions.forEach(t => visit(t.target));
    };
    visit(initialStateId);
    if (visited.size !== states.length) fail();
    return { ...base, type: 'experiment', initialStateId, states };
  });
  unique(activities.map(a => a.id));
  return { version: 1, activities };
}
export function readLearningPlay(value: unknown): LearningPlay | undefined {
  try { return parseLearningPlay(value); } catch { return undefined; }
}

