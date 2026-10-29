import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canReusePrChecks, workflowsForChanges, workflowsForPush } from '../../scripts/ci-main.mjs';
import { parseStrictWorkflowYaml } from '../../scripts/strict-workflow-yaml.mjs';

const names = ['ci.yml', 'website.yml', 'security.yml'];
const definitions = Object.fromEntries(names.map((name) => [name, parseStrictWorkflowYaml(
  readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8').split('\njobs:\n')[0],
)]));
const success = () => ({ sha: 'merge', parents: ['base', 'head'], tree: 'same', headTree: 'same',
  baseInHead: true, required: names,
  pull: { merged_at: '2026-10-27', merge_commit_sha: 'merge', base: { ref: 'main', sha: 'base' }, head: { sha: 'head' } },
  runs: names.map((name, index) => ({ id: index + 1, path: `.github/workflows/${name}`,
    event: 'pull_request', head_sha: 'head', status: 'completed', conclusion: 'success' })),
});

function withPush(commits: string[][], check: (fixture: {
  before: string; sha: string; eventPath: string; repo: string;
  git: (...args: string[]) => string;
}) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'main-ci-push-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  try {
    git('init', '-q', '--initial-branch=main');
    git('config', 'user.name', 'CI test');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    git('commit', '-q', '--allow-empty', '-m', 'before push');
    const before = git('rev-parse', 'HEAD').trim();
    for (const paths of commits) {
      for (const path of paths) {
        const file = join(repo, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, `${path}\n`);
      }
      git('add', '.');
      git('commit', '-q', '-m', 'pushed changes');
    }
    const sha = git('rev-parse', 'HEAD').trim();
    const eventPath = join(dir, 'event.json');
    writeFileSync(eventPath, JSON.stringify({ before, after: sha }));
    check({ before, sha, eventPath, repo, git });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('main CI deduplication', () => {
  it('reuses only the identical tree of a successfully checked normal PR merge', () => {
    expect(canReusePrChecks(success())).toBe(true);
  });
  it.each(['failure', 'cancelled', 'skipped', null])('revalidates if a latest check is %s', (conclusion) => {
    const evidence = success();
    evidence.runs[0].conclusion = conclusion as string;
    expect(canReusePrChecks(evidence)).toBe(false);
  });
  it('does not reuse an older success or an unrelated/manual check', () => {
    const evidence = success();
    evidence.runs.push({ ...evidence.runs[0], id: 99, status: 'in_progress', conclusion: '' });
    expect(canReusePrChecks(evidence)).toBe(false);
    evidence.runs = success().runs.map((r) => ({ ...r, event: 'workflow_dispatch' }));
    expect(canReusePrChecks(evidence)).toBe(false);
    evidence.runs = success().runs.map((r) => ({ ...r, head_sha: 'older-head' }));
    expect(canReusePrChecks(evidence)).toBe(false);
  });
  it('revalidates direct pushes, changed merge contents, and an advanced base', () => {
    const evidence = success();
    expect(canReusePrChecks({ ...evidence, pull: null })).toBe(false);
    expect(canReusePrChecks({ ...evidence, tree: 'integrated' })).toBe(false);
    expect(canReusePrChecks({ ...evidence, baseInHead: false })).toBe(false);
    expect(canReusePrChecks({ ...evidence, parents: ['base'] })).toBe(false);
    expect(canReusePrChecks({ ...evidence, parents: ['other-base', 'head'] })).toBe(false);
    expect(canReusePrChecks({ ...evidence, runs: [] })).toBe(false);
    expect(canReusePrChecks({ ...evidence, runs: undefined })).toBe(false);
  });
  it('requires only the PR workflows selected by their actual file filters', () => {
    expect(workflowsForChanges(['src/lib/ogiri/polling.ts'], definitions)).toEqual(['website.yml', 'security.yml']);
    expect(workflowsForChanges(['ml/train.py'], definitions)).toEqual(['ci.yml', 'security.yml']);
    expect(workflowsForChanges(['package-lock.json'], definitions)).toEqual(names);
    expect(workflowsForChanges(['README.md'], definitions)).toEqual(['website.yml', 'security.yml']);
    const evidence = success();
    expect(canReusePrChecks({ ...evidence, required: ['website.yml', 'security.yml'], runs: evidence.runs.slice(1) })).toBe(true);
  });
  it.each([
    { paths: ['src/lib/ogiri/engine.ts'], expected: ['website.yml', 'security.yml'] },
    { paths: ['src/app/layout.tsx'], expected: ['website.yml', 'security.yml'] },
    { paths: ['unknown-file.json'], expected: ['website.yml', 'security.yml'] },
    { paths: ['ml/train.py'], expected: ['ci.yml', 'security.yml'] },
    { paths: ['native/Package.swift'], expected: ['ci.yml', 'security.yml'] },
    { paths: ['.github/ci/contract.json'], expected: ['ci.yml', 'security.yml'] },
    { paths: ['ml/train.py', 'src/lib/ogiri/engine.ts'], expected: names },
    { paths: ['package-lock.json'], expected: names },
    { paths: ['README.md', 'docs/party.md'], expected: ['website.yml', 'security.yml'] },
    { paths: ['docs/blog-shogi-policy.md'], expected: ['ci.yml', 'security.yml'] },
  ])('main fallback follows current path filters for $paths', ({ paths, expected }) => {
    withPush([paths], ({ eventPath, sha, git }) => {
      expect(workflowsForPush(eventPath, sha, definitions, git)).toEqual(expected);
    });
  });
  it('includes earlier commits in a multi-commit push instead of only the final commit', () => {
    withPush([['ml/train.py'], ['src/lib/ogiri/engine.ts']], ({ eventPath, sha, git }) => {
      expect(workflowsForPush(eventPath, sha, definitions, git)).toEqual(names);
    });
    withPush([['src/app/layout.tsx'], ['src/lib/ogiri/engine.ts']], ({ eventPath, sha, git }) => {
      expect(workflowsForPush(eventPath, sha, definitions, git)).toEqual(['website.yml', 'security.yml']);
    });
  });
  it('selects both successive ML and website push events using their own complete ranges', () => {
    withPush([['ml/train.py'], ['src/lib/ogiri/engine.ts']], ({ before, eventPath, sha, git }) => {
      const middle = git('rev-parse', `${sha}^`).trim();
      writeFileSync(eventPath, JSON.stringify({ before }));
      expect(workflowsForPush(eventPath, middle, definitions, git)).toEqual(['ci.yml', 'security.yml']);
      writeFileSync(eventPath, JSON.stringify({ before: middle }));
      expect(workflowsForPush(eventPath, sha, definitions, git)).toEqual(['website.yml', 'security.yml']);
    });
  });
  it('keeps all workflows for missing, invalid, zero, or unavailable push revisions', () => {
    withPush([['src/lib/ogiri/engine.ts']], ({ eventPath, sha, git }) => {
      for (const before of [undefined, '', 'invalid', '0'.repeat(40), 'a'.repeat(40)]) {
        writeFileSync(eventPath, JSON.stringify({ before }));
        expect(workflowsForPush(eventPath, sha, definitions, git)).toEqual(names);
      }
      writeFileSync(eventPath, JSON.stringify({ before: git('rev-parse', 'HEAD^').trim() }));
      for (const head of ['', 'invalid', '0'.repeat(40), 'b'.repeat(40)])
        expect(workflowsForPush(eventPath, head, definitions, git)).toEqual(names);
    });
  });
  it('keeps all workflows for missing or unreadable event/range evidence', () => {
    withPush([['src/lib/ogiri/engine.ts']], ({ eventPath, sha, repo, git }) => {
      expect(workflowsForPush(`${eventPath}.missing`, sha, definitions, git)).toEqual(names);
      expect(workflowsForPush(repo, sha, definitions, git)).toEqual(names);
      const unreadableDiff = (...args: string[]) => {
        if (args[0] === 'diff') throw new Error('unreadable diff');
        return git(...args);
      };
      expect(workflowsForPush(eventPath, sha, definitions, unreadableDiff)).toEqual(names);
      for (const event of ['{', 'null']) {
        writeFileSync(eventPath, event);
        expect(workflowsForPush(eventPath, sha, definitions, git)).toEqual(names);
      }
    });
  });
  it('keeps all workflows when the before revision is not an ancestor of the pushed head', () => {
    withPush([['ml/train.py']], ({ before, sha, eventPath, git }) => {
      git('checkout', '-q', '--detach', before);
      git('commit', '-q', '--allow-empty', '-m', 'divergent push');
      const divergent = git('rev-parse', 'HEAD').trim();
      writeFileSync(eventPath, JSON.stringify({ before: sha }));
      expect(workflowsForPush(eventPath, divergent, definitions, git)).toEqual(names);
    });
  });
  it.each([
    { revision: 'valid', expected: ['website.yml', 'security.yml'] },
    { revision: '', expected: names },
    { revision: 'invalid', expected: names },
  ])('CLI dispatches the selected fallback for push revision $revision', ({ revision, expected }) => {
    withPush([['src/lib/ogiri/engine.ts']], ({ eventPath, sha, repo }) => {
      mkdirSync(join(repo, 'scripts'), { recursive: true });
      mkdirSync(join(repo, '.github/workflows'), { recursive: true });
      for (const name of ['ci-main.mjs', 'strict-workflow-yaml.mjs'])
        writeFileSync(join(repo, 'scripts', name), readFileSync(new URL(`../../scripts/${name}`, import.meta.url)));
      for (const name of names)
        writeFileSync(join(repo, '.github/workflows', name), readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url)));
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import { pathToFileURL } from 'node:url';
        import { realpathSync } from 'node:fs';
        const dispatched = [];
        globalThis.fetch = async (url, options) => {
          if (options.method === 'POST') {
            dispatched.push(new URL(url).pathname.split('/').at(-2));
            return new Response(null, { status: 204 });
          }
          return Response.json([]);
        };
        process.argv[1] = realpathSync(process.env.MAIN_CI_TEST_SCRIPT);
        await import(pathToFileURL(process.argv[1]));
        console.log('DISPATCHED=' + JSON.stringify(dispatched));
      `], { encoding: 'utf8', env: { ...process.env,
        GITHUB_REPOSITORY: 'test/repo', GITHUB_SHA: revision === 'valid' ? sha : revision,
        GITHUB_EVENT_PATH: eventPath, GITHUB_STEP_SUMMARY: '', GH_TOKEN: 'test-token',
        GITHUB_API_URL: 'https://api.example.invalid', MAIN_CI_TEST_SCRIPT: join(repo, 'scripts/ci-main.mjs'),
      } });
      expect(result.status, result.stderr).toBe(0);
      const dispatched = result.stdout.split('\n').find((line) => line.startsWith('DISPATCHED='));
      expect(JSON.parse(dispatched!.slice('DISPATCHED='.length))).toEqual(expected);
    });
  });
  it('keeps PR and manual entry points, with one lightweight main push entry point', () => {
    for (const definition of Object.values(definitions)) {
      expect(definition.on).not.toHaveProperty('push');
      expect(definition.on).toHaveProperty('pull_request');
      expect(definition.on).toHaveProperty('workflow_dispatch');
    }
    const main = parseStrictWorkflowYaml(readFileSync(new URL('../../.github/workflows/main-ci.yml', import.meta.url), 'utf8'));
    expect(main.on).toHaveProperty('push');
    expect(main.on).not.toHaveProperty('pull_request');
    // Every push range must be selected, even when another selector is running or pending.
    expect(main).not.toHaveProperty('concurrency');
    for (const definition of Object.values(definitions))
      expect(definition.concurrency['cancel-in-progress']).toBe(true);
    expect(Object.keys(main.jobs)).toEqual(['select']);
  });
});
