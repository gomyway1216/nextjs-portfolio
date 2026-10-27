import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStrictWorkflowYaml } from './strict-workflow-yaml.mjs';

export function classifyWebsiteChanges(paths, legacyPatterns, websiteIgnoredPatterns) {
  const legacyCi = paths.some((path) => legacyPatterns.some((pattern) => matchesGlob(path, pattern)));
  const website = paths.some((path) =>
    !path.endsWith('.md') && !path.startsWith('docs/') &&
    !websiteIgnoredPatterns.some((pattern) => matchesGlob(path, pattern)),
  );
  return { website, legacyCi, gateName: legacyCi ? 'Website checks' : 'Test and build' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const kind = process.env.GITHUB_EVENT_NAME;
  // A manual run tests the whole website, without replacing a PR's required check.
  let selection = { website: true, legacyCi: true, gateName: 'Website checks' };
  if (kind === 'pull_request' || (kind === 'push' && !/^0+$/.test(event.before))) {
    const base = kind === 'pull_request' ? event.pull_request.base.sha : event.before;
    const head = kind === 'pull_request' ? event.pull_request.head.sha : event.after;
    if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Missing commit SHAs');
    const range = `${base}${kind === 'pull_request' ? '...' : '..'}${head}`;
    const paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', range], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8',
    }).split('\0').filter(Boolean);
    const readWorkflow = (name) => parseStrictWorkflowYaml(readFileSync(
      new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8',
    ));
    selection = classifyWebsiteChanges(paths, readWorkflow('ci').on[kind].paths,
      readWorkflow('website').on[kind]['paths-ignore']);
  }
  appendFileSync(process.env.GITHUB_OUTPUT,
    `website=${selection.website}\ngate_name=${selection.gateName}\n`);
  console.log(JSON.stringify(selection));
}
