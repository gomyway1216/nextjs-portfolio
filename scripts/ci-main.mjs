import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStrictWorkflowYaml } from './strict-workflow-yaml.mjs';

const workflows = ['ci.yml', 'website.yml', 'security.yml'];
const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const readDefinitions = () => Object.fromEntries(workflows.map((name) => [name,
  parseStrictWorkflowYaml(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n').split('\njobs:\n')[0])]));

export function workflowsForChanges(paths, definitions) {
  return workflows.filter((name) => {
    const trigger = definitions[name].on.pull_request;
    if (trigger.paths) return paths.some((p) => trigger.paths.some((g) => matchesGlob(p, g)));
    if (trigger['paths-ignore'])
      return paths.some((p) => !trigger['paths-ignore'].some((g) => matchesGlob(p, g)));
    return true;
  });
}

export function workflowsForPush(eventPath, sha, definitions, runGit = git) {
  try {
    const { before } = JSON.parse(readFileSync(eventPath, 'utf8'));
    if (![before, sha].every((rev) => /^[a-f0-9]{40}$/.test(rev ?? '') && !/^0{40}$/.test(rev)))
      throw new Error('Missing push range');
    for (const rev of [before, sha]) runGit('cat-file', '-e', `${rev}^{commit}`);
    runGit('merge-base', '--is-ancestor', before, sha);
    const paths = runGit('diff', '--name-only', '--no-renames', '-z', `${before}..${sha}`)
      .split('\0').filter(Boolean);
    return workflowsForChanges(paths, definitions);
  } catch {
    // Missing event/object/range evidence must retain every validation workflow.
    return [...workflows];
  }
}

export function canReusePrChecks({ sha, parents, tree, headTree, baseInHead, pull, runs, required }) {
  if (!pull?.merged_at || pull.merge_commit_sha !== sha || pull.base.ref !== 'main' ||
      parents.length !== 2 || parents[0] !== pull.base.sha || parents[1] !== pull.head.sha ||
      !baseInHead || tree !== headTree || !required.length) return false;
  if (!Array.isArray(runs)) return false;
  return required.every((name) => {
    const latest = runs.filter((run) => run.event === 'pull_request' &&
      run.head_sha === pull.head.sha && run.path === `.github/workflows/${name}`)
      .sort((a, b) => b.id - a.id)[0];
    return latest?.status === 'completed' && latest.conclusion === 'success';
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? ''))
    throw new Error('Missing repository or push revision');
  if (!token) throw new Error('Missing GH_TOKEN or GITHUB_TOKEN');
  async function api(path, body) {
    const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repo}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}`);
    return response.status === 204 ? null : response.json();
  }
  let reuse = false;
  try {
    const pulls = await api(`commits/${sha}/pulls?per_page=100`);
    const pull = pulls.find((p) => p.merged_at && p.merge_commit_sha === sha && p.base.ref === 'main');
    if (pull) {
      const parents = git('show', '-s', '--format=%P', sha).trim().split(' ');
      let baseInHead = false;
      try { git('merge-base', '--is-ancestor', pull.base.sha, pull.head.sha); baseInHead = true; } catch { /* Revalidate an integrated tree. */ }
      const paths = git('diff', '--name-only', '--no-renames', '-z', `${pull.base.sha}...${pull.head.sha}`).split('\0').filter(Boolean);
      const definitions = readDefinitions();
      const { workflow_runs: runs } = await api(`actions/runs?event=pull_request&head_sha=${pull.head.sha}&per_page=100`);
      reuse = canReusePrChecks({ sha, parents, pull, runs, baseInHead,
        tree: git('rev-parse', `${sha}^{tree}`).trim(), headTree: git('rev-parse', `${pull.head.sha}^{tree}`).trim(),
        required: workflowsForChanges(paths, definitions) });
    }
  } catch (error) {
    console.log(`Could not confirm a tested PR; validating main: ${error.message}`);
  }
  let selected = workflows;
  if (!reuse) {
    try { selected = workflowsForPush(process.env.GITHUB_EVENT_PATH, sha, readDefinitions()); }
    catch { /* Unreadable workflow filters retain the conservative full fallback. */ }
  }
  const message = reuse
    ? 'Main contains the identical content of a successful PR. No duplicate CI was started.'
    : `Main is not proven identical to a successful PR. Dispatching: ${selected.join(', ')}.`;
  console.log(message);
  if (!reuse) for (const name of selected) await api(`actions/workflows/${name}/dispatches`, { ref: 'main' });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}
