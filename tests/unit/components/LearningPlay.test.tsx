import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fixture from '../../fixtures/learning-play-session.json';
import { parseLearningPlay, readLearningPlay } from '@/lib/learningPlay';
import LearningPlay from '@/components/study/LearningPlay';

// This repo has no DOM test runtime. Drive the actual component's event handlers
// with a small useState harness, then assert the rendered result (not a browser test).
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!(slot in hooks.values)) hooks.values[slot] = initial;
    return [hooks.values[slot], (value: unknown) => { hooks.values[slot] = value; }];
  },
}));
vi.mock('react-i18next', () => ({useTranslation: () => ({i18n: {language:'ja'}})}));
const play = parseLearningPlay(fixture)!;
function tree() { hooks.cursor = 0; return LearningPlay({play}); }
type NodeProps = {children?: unknown; onClick?: () => void};
function nodes(value: unknown): ReactElement<NodeProps>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<NodeProps>(value)) return [];
  return [value, ...nodes(value.props.children)];
}
function label(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(label).join('');
  return isValidElement<NodeProps>(value) ? label(value.props.children) : '';
}
function click(text: string) {
  const button = nodes(tree()).find(n => n.props.onClick && label(n.props.children).includes(text));
  expect(button, text).toBeDefined(); button!.props.onClick!();
}
const html = () => renderToStaticMarkup(tree());
beforeEach(() => { hooks.values = []; hooks.cursor = 0; vi.restoreAllMocks(); });

it('answers, hints, scenes, reset and optional navigation stay in-page without network calls', () => {
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('unexpected network'); });
  expect(html()).toContain('回答なしでもOK');
  expect(html()).toContain('分からない・ヒント');
  click('タブごとにログインし直す');
  expect(html()).toContain('タブとCookieの保存場所は別');
  click('ログイン状態を引き継ぐ');
  expect(html()).toContain('二つ目のタブからも同じセッションID');
  click('動かす');
  expect(html()).toContain('ログイン直後');
  click('Cookieだけ消す');
  expect(html()).toContain('Cookieだけ削除');
  expect(html()).toContain('以前の記録は残る');
  click('サーバーの記録も失効');
  expect(html()).toContain('どちらも使えない');
  click('最初の状態へ');
  click('サーバー側で失効');
  expect(html()).toContain('Cookie: session=&lt;失効したID&gt;');
  expect(html()).toContain('401：認証を拒否');
  click('今日はここまで');
  expect(html()).toContain('理解済みにはしません');
  click('続きへ戻る');
  expect(html()).toContain('Cookie: session=&lt;失効したID&gt;');
  click('実務で使う');
  expect(html()).toContain('実システムとコードを見る');
  expect(html()).toContain('href="#introduction"');
  expect(network).not.toHaveBeenCalled();
});
it('can skip unanswered quizzes and safely rejects malformed metadata', () => {
  click('次へ');
  expect(html()).toContain('サーバーの記録も消える');
  expect(readLearningPlay({...fixture, version:2})).toBeUndefined();
  const broken = structuredClone(fixture);
  broken.activities[0].choices![0].correct = false;
  expect(readLearningPlay(broken)).toBeUndefined();
});
it('validates every scene target and ignores unknown author fields', () => {
  expect(parseLearningPlay({...fixture, privateEvidence:'x'.repeat(50001)})).toEqual(fixture);
  const broken = structuredClone(fixture);
  broken.activities[2].states![0].actions[0].target = 'missing';
  expect(readLearningPlay(broken)).toBeUndefined();
  const experiment = play.activities[2];
  if(experiment.type !== 'experiment') throw new Error('fixture');
  expect(experiment.states.every(s => s.actions.every(a => experiment.states.some(t => t.id === a.target)))).toBe(true);
});
it('falls back to the initial scene when mounted state is stale', () => {
  const experiment = play.activities[2];
  hooks.values = [2, {}, {[experiment.id]: 'removed-scene'}, false];
  expect(html()).toContain('ログイン直後');
  click('Cookieだけ消す');
  expect(html()).toContain('Cookieだけ削除');
});
it('limits retained author data after normalization', () => {
  const quiz = play.activities[0];
  if (quiz.type !== 'quiz') throw new Error('fixture');
  const large = {...quiz, explanation: 'e'.repeat(2000),
    choices: Array.from({length:5}, (_, n) => ({id:`c${n}`, label:'choice', correct:n === 0, feedback:'f'.repeat(1200)}))};
  expect(readLearningPlay({version:1, activities:Array.from({length:8}, (_, n) => ({...large,id:`q${n}`}))})).toBeUndefined();
});
