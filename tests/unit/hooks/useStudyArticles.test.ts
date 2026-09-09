import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyArticle } from '@/types/study';

// This repo has no DOM runtime. Exercise the real hook with stable hook slots,
// dependency-aware callbacks/effects, and manually resolved network promises.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, effects: [] as (() => void)[],
  getArticles: vi.fn(),
}));
vi.mock('@/services/studyService', () => ({ getArticles: hooks.getArticles }));
vi.mock('react', () => {
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    useState: (initial: unknown) => {
      const slot = hooks.cursor++;
      if (!(slot in hooks.values)) hooks.values[slot] = initial;
      return [hooks.values[slot], (next: unknown) => {
        hooks.values[slot] = typeof next === 'function' ? next(hooks.values[slot]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const slot = hooks.cursor++;
      return hooks.values[slot] ??= { current: initial };
    },
    useCallback: (fn: unknown, deps: unknown[]) => {
      const slot = hooks.cursor++;
      const previous = hooks.values[slot] as { deps: unknown[]; fn: unknown } | undefined;
      if (same(previous?.deps, deps)) return previous!.fn;
      hooks.values[slot] = { fn, deps };
      return fn;
    },
    useEffect: (fn: () => (() => void), deps: unknown[]) => {
      const slot = hooks.cursor++;
      const previous = hooks.values[slot] as { deps: unknown[]; cleanup?: () => void } | undefined;
      if (!same(previous?.deps, deps)) {
        hooks.effects.push(() => {
          previous?.cleanup?.();
          hooks.values[slot] = { deps, cleanup: fn() };
        });
      }
    },
  };
});

import { useStudyArticles } from '@/hooks/useStudy';
const render = (options: Parameters<typeof useStudyArticles>[0] = {}) => {
  hooks.cursor = 0;
  const result = useStudyArticles(options);
  hooks.effects.splice(0).forEach(effect => effect());
  return result;
};
type Result = { articles: StudyArticle[]; hasMore: boolean; readArticleIds?: string[] };
const result = (id?: string): Result => ({ articles: id ? [{ id } as StudyArticle] : [], hasMore: !!id });
function pending() {
  let resolve!: (value: Result) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Result>((yes, no) => { resolve = yes; reject = no; });
  hooks.getArticles.mockReturnValueOnce(promise);
  return { resolve, reject };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.getArticles.mockReset();
});

describe('study list auth restoration', () => {
  it('returns stable empty references while disabled', () => {
    const first = render({ enabled: false });
    const second = render({ enabled: false });
    expect(second.articles).toBe(first.articles);
    expect(second.readArticleIds).toBe(first.readArticleIds);
  });

  it('preserves loaded articles after a pagination failure and retries the same cursor', async () => {
    hooks.getArticles.mockResolvedValueOnce(result('first'));
    render(); await flush();
    hooks.getArticles.mockRejectedValueOnce(new Error('Offline'));
    await render().loadMore();
    expect(render()).toMatchObject({ articles: [{ id: 'first' }], loading: false, hasMore: true });
    expect(render().error?.message).toBe('Offline');
    hooks.getArticles.mockResolvedValueOnce(result('second'));
    await render().loadMore();
    expect(hooks.getArticles).toHaveBeenLastCalledWith(expect.objectContaining({ lastId: 'first' }));
    expect(render().articles.map(a => a.id)).toEqual(['first', 'second']);
    expect(render().error).toBeNull();
  });
  it('waits through auth restoration, then fetches exactly once for the resolved viewer', async () => {
    expect(render({ enabled: false }).loading).toBe(true);
    await render({ enabled: false }).fetchArticles();
    expect(hooks.getArticles).not.toHaveBeenCalled();
    const request = pending();
    const options = { enabled: true, userId: 'owner', readStatus: 'all' as const };
    expect(render(options).loading).toBe(true);
    request.resolve(result('private-article')); await flush();
    expect(render(options).articles[0].id).toBe('private-article');
    expect(render(options).loading).toBe(false);
    expect(hooks.getArticles).toHaveBeenCalledTimes(1);
    expect(hooks.getArticles).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', readStatus: 'all' }));
    expect(hooks.getArticles.mock.calls[0][0]).not.toHaveProperty('enabled');
  });

  it('keeps a failed load distinguishable from a successful empty response and supports retry', async () => {
    const request = pending(); render();
    request.reject(new Error('Authentication changed during the request')); await flush();
    expect(render().error?.message).toContain('Authentication changed');
    expect(render().loading).toBe(false);
    const retry = pending(); const retrying = render().fetchArticles();
    expect(render().loading).toBe(true);
    retry.resolve(result()); await retrying;
    expect(render()).toMatchObject({ articles: [], loading: false, error: null });
  });

  it('immediately hides a previous viewer and never reveals their articles after a failed replacement', async () => {
    hooks.getArticles.mockResolvedValueOnce({ ...result('private'), readArticleIds: ['private'] });
    render({ userId: 'owner' }); await flush();
    expect(render({ userId: 'owner' }).isArticleRead('private')).toBe(true);
    const guest = pending();
    expect(render()).toMatchObject({ articles: [], loading: true });
    guest.reject(new Error('Offline')); await flush();
    expect(render()).toMatchObject({ articles: [], loading: false, hasMore: false });
    expect(render().readArticleIds.size).toBe(0);
    const retry = pending(); const retrying = render().fetchArticles();
    expect(render().articles).toEqual([]);
    retry.resolve(result()); await retrying;
    expect(render().articles).toEqual([]);
  });

  it('ignores an earlier response after switching viewers', async () => {
    const old = pending(); render({ userId: 'owner' });
    const next = pending(); render({ userId: 'reader' });
    next.resolve(result('reader-article')); await flush();
    old.resolve(result('private')); await flush();
    expect(render({ userId: 'reader' }).articles.map(a => a.id)).toEqual(['reader-article']);
  });

  it('invalidates an in-flight request when disabled and retains load-more filters', async () => {
    const old = pending(); render({ userId: 'owner' });
    render({ enabled: false, userId: 'owner' });
    old.resolve(result('outdated')); await flush();
    expect(render({ enabled: false, userId: 'owner' })).toMatchObject({ articles: [], loading: true });
    hooks.getArticles.mockResolvedValueOnce(result('first'));
    const options = { userId: 'owner', categoryId: 'networks', orderDir: 'asc' as const };
    render(options); await flush();
    hooks.getArticles.mockResolvedValueOnce(result('second'));
    await render(options).loadMore();
    expect(hooks.getArticles).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 'networks', orderDir: 'asc', userId: 'owner', lastId: 'first' }));
    expect(render(options).articles.map(a => a.id)).toEqual(['first', 'second']);
  });
});
