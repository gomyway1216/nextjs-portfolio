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
  expect(html()).toContain('demo-A の記録は残る');
  click('サーバーの記録も失効');
  expect(html()).toContain('どちらも使えない');
  click('最初の状態へ');
  click('サーバー側で失効');
  expect(html()).toContain('Cookieは残る');
  expect(html()).toContain('アクセス拒否');
  click('今日はここまで');
  expect(html()).toContain('理解済みにはしません');
  click('続きへ戻る');
  expect(html()).toContain('Cookieは残る');
  click('実務で使う');
  expect(html()).toContain('実システムとコードを見る');
  expect(html()).toContain('href="#introduction"');
  expect(network).not.toHaveBeenCalled();
});
it('can skip unanswered quizzes and safely rejects malformed metadata', () => {
  click('次へ');
  expect(html()).toContain('サーバー側のセッション記録も消える');
  expect(readLearningPlay({...fixture, version:2})).toBeUndefined();
  const broken = structuredClone(fixture);
  broken.activities[0].choices![0].correct = false;
  expect(readLearningPlay(broken)).toBeUndefined();
});
it('validates every scene target and ignores unknown author fields', () => {
  expect(parseLearningPlay({...fixture, privateEvidence:'not shown'})).toEqual(fixture);
  const broken = structuredClone(fixture);
  broken.activities[2].states![0].actions[0].target = 'missing';
  expect(readLearningPlay(broken)).toBeUndefined();
  const experiment = play.activities[2];
  if(experiment.type !== 'experiment') throw new Error('fixture');
  expect(experiment.states.every(s => s.actions.every(a => experiment.states.some(t => t.id === a.target)))).toBe(true);
});
