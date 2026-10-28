import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStrictWorkflowYaml } from './strict-workflow-yaml.mjs';

const partyPatterns = [
  'src/components/game/Ogiri/**', 'src/lib/ogiri/**', 'src/app/games/ogiri/**',
  'src/app/api/ogiri/**', 'src/data/ogiri/**', 'scripts/ogiri/**',
  'tests/unit/ogiri/**', 'tests/ogiri/**', 'playwright.ogiri.config.ts',
  'public/audio/ogiri/**', 'public/img/games/ogiri/**', 'public/img/games/covers/ogiri.webp',
  'public/fonts/ogiri-display.woff2', 'public/fonts/ogiri-display-OFL.txt',
];
const isDocumentation = (path) => path.endsWith('.md') || path.startsWith('docs/');

export function classifyWebsiteChanges(paths, legacyPatterns, websiteIgnoredPatterns) {
  const legacyCi = paths.some((path) => legacyPatterns.some((pattern) => matchesGlob(path, pattern)));
  const website = paths.some((path) =>
    !isDocumentation(path) &&
    !websiteIgnoredPatterns.some((pattern) => matchesGlob(path, pattern)),
  );
  // Only known isolated party paths may skip unrelated website unit/E2E suites.
  // Check every changed path, so mixed ML/shared/unknown changes keep full coverage.
  const partyOnly = website && !legacyCi && paths.every((path) =>
    isDocumentation(path) || partyPatterns.some((pattern) => matchesGlob(path, pattern)),
  );
  return { website, legacyCi, scope: website ? (partyOnly ? 'party' : 'full') : 'none',
    gateName: legacyCi ? 'Website checks' : 'Test and build' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const kind = process.env.GITHUB_EVENT_NAME;
  // A manual run tests the whole website, without replacing a PR's required check.
  let selection = { website: true, legacyCi: true, scope: 'full', gateName: 'Website checks' };
  if (kind === 'pull_request') {
    const base = event.pull_request.base.sha;
    const head = event.pull_request.head.sha;
    if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Missing commit SHAs');
    const range = `${base}...${head}`;
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
    `website=${selection.website}\nscope=${selection.scope}\ngate_name=${selection.gateName}\n`);
  console.log(JSON.stringify(selection));
}
