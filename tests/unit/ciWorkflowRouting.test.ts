import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { classifyWebsiteChanges } from '../../scripts/ci-website-routing.mjs';
import { parseStrictWorkflowYaml } from '../../scripts/strict-workflow-yaml.mjs';

const require = createRequire(import.meta.url);
const picomatch = require('picomatch') as (pattern: string) => (path: string) => boolean;
const workflows = Object.fromEntries(
  ['ci', 'website'].map((id) => [
    id,
    parseStrictWorkflowYaml(
      readFileSync(new URL(`../../.github/workflows/${id}.yml`, import.meta.url), 'utf8'),
    ),
  ]),
);
function runs(id: string, event: string, paths: string[]) {
  const events = workflows[id].on;
  if (!Object.hasOwn(events, event)) return false;
  const trigger = events[event] ?? {};
  if (trigger.paths) return paths.some((path) => trigger.paths.some((p: string) => picomatch(p)(path)));
  if (trigger['paths-ignore'])
    return paths.some((path) => !trigger['paths-ignore'].some((p: string) => picomatch(p)(path)));
  return true;
}
const classify = (paths: string[]) => classifyWebsiteChanges(paths,
  workflows.ci.on.pull_request.paths, workflows.website.on.pull_request['paths-ignore']);
const selectedJobs: Record<string, string[]> = {
  none: [],
  party: ['quality', 'build', 'ogiri'],
  'non-party': ['quality', 'build', 'e2e'],
  full: ['quality', 'build', 'e2e', 'ogiri'],
};
const expectedResult = (scope: string, job: string) => selectedJobs[scope]?.includes(job) ? 'success' : 'skipped';
function gate(scope: string, results: Record<string, string> = {}, website = scope !== 'none') {
  const values = {
    'changes.result': 'success', 'changes.outputs.scope': scope,
    'changes.outputs.website': String(website),
    'quality.result': website ? 'success' : 'skipped',
    'build.result': website ? 'success' : 'skipped',
    'e2e.result': expectedResult(scope, 'e2e'),
    'ogiri.result': selectedJobs[scope] ? expectedResult(scope, 'ogiri') : 'success', ...results,
  };
  const script = workflows.website.jobs.website_checks.steps[0].run.replace(
    /\$\{\{ needs\.([^}]+) \}\}/g, (_match: string, key: string) => values[key as keyof typeof values],
  );
  return spawnSync('sh', ['-e', '-c', script], { encoding: 'utf8' }).status;
}
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
// What the party browser suites load: their own files, the shared shell around them, and every import from those.
function partyImportClosure() {
  const { options } = ts.parseJsonConfigFileContent(
    ts.readConfigFile(join(repoRoot, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, repoRoot,
  );
  const entries = [
    'src/components/game/Ogiri', 'src/lib/ogiri', 'src/app/games/ogiri', 'src/app/api/ogiri', 'scripts/ogiri',
    'tests/ogiri', 'playwright.ogiri.config.ts', 'middleware.ts', 'next.config.ts', 'src/app/layout.tsx',
    'src/app/loading.tsx', 'src/app/error.tsx', 'src/app/not-found.tsx', 'src/app/games/layout.tsx',
    'src/app/games/loading.tsx',
  ];
  const pending = entries.map((entry) => join(repoRoot, entry)).flatMap((entry) => statSync(entry).isDirectory()
    ? readdirSync(entry, { recursive: true, encoding: 'utf8' }).map((path) => join(entry, path)) : [entry]);
  const seen = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (seen.has(file) || !statSync(file).isFile()) continue;
    seen.add(file);
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
      const resolved = ts.resolveModuleName(fileName, file, options, ts.sys).resolvedModule;
      // TypeScript resolves no stylesheets, which still have to count.
      const asset = fileName.startsWith('@/') ? join(repoRoot, 'src', fileName.slice(2))
        : fileName.startsWith('.') ? resolve(dirname(file), fileName) : undefined;
      if (resolved && !resolved.isExternalLibraryImport) pending.push(resolved.resolvedFileName);
      else if (!resolved && asset && existsSync(asset)) pending.push(asset);
    }
  }
  return [...seen].map((file) => relative(repoRoot, file));
}

describe('CI change routing', () => {
  it('runs heavy workflows on PRs or explicit dispatch, never directly on push', () => {
    for (const id of ['ci', 'website']) {
      expect(runs(id, 'push', ['package.json'])).toBe(false);
      expect(runs(id, 'workflow_dispatch', ['package.json'])).toBe(true);
    }
  });
  it('keeps exactly one required aggregate and fails if selection fails', () => {
    expect(workflows.website.jobs.website_checks.name).toBe(
      "${{ needs.changes.outputs.gate_name || 'Test and build' }}",
    );
    expect(workflows.website.jobs.website_checks.needs).toEqual(
      ['changes', 'quality', 'build', 'e2e', 'ogiri'],
    );
    expect(workflows.website.jobs.website_checks.steps[0].run).toContain(
      'test "${{ needs.changes.result }}" = "success"',
    );
  });
  it('runs both party browser suites in parallel from one build with separate reports', () => {
    const job = workflows.website.jobs.ogiri;
    expect(job.name).toBe('Ogiri multiplayer (${{ matrix.browser }})');
    expect(job.needs).toBe('[changes, build]');
    expect(job.if).toBe("needs.changes.outputs.scope == 'full' || needs.changes.outputs.scope == 'party'");
    expect(job.strategy).toEqual({ 'fail-fast': false, matrix: { browser: ['chromium', 'webkit'] } });
    expect(job.steps.find((step: { run?: string }) => step.run?.includes('firebase-tools')).run)
      .toContain('--project=${{ matrix.browser }}');
    const download = job.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/download-artifact@'));
    expect(download.with.name).toBe('website-build');
    expect(job.steps.some((step: { run?: string }) => step.run === 'npm run build')).toBe(false);
    const report = job.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(report.with.name).toBe('ogiri-browser-results-${{ matrix.browser }}');
    expect(report.if).toBe('always()');
  });
  it('selects party unit and asset/catalog checks while preserving full fallback checks', () => {
    const quality = workflows.website.jobs.quality;
    expect(quality.if).toBe("needs.changes.outputs.website == 'true'");
    expect(quality.steps.find((step: { run?: string }) => step.run === 'npm run lint')).toBeDefined();
    expect(quality.steps.find((step: { run?: string }) => step.run === 'npm test -- tests/unit/ogiri tests/unit/gameCoverAssets.test.ts tests/unit/ciWorkflowRouting.test.ts').if)
      .toBe("needs.changes.outputs.scope == 'party'");
    expect(quality.steps.find((step: { run?: string }) => step.run === "npm test -- --exclude 'tests/unit/ml/**'").if)
      .toBe("needs.changes.outputs.scope != 'party'");
    expect(quality.steps.find((step: { run?: string }) => step.run === 'npx tsx scripts/ogiri/catalog.ts --check').if)
      .toBeUndefined();
    expect(workflows.website.jobs.build.if).toBe("needs.changes.outputs.website == 'true'");
    expect(workflows.website.jobs.e2e.if).toBe("needs.changes.outputs.scope == 'full' || needs.changes.outputs.scope == 'non-party'");
    expect(workflows.website.jobs.e2e.name).toBe('Website E2E (${{ matrix.shard }}/4)');
    expect(JSON.parse(workflows.website.jobs.e2e.strategy.matrix.shard)).toEqual([1, 2, 3, 4]);
  });
  it.each(Object.keys(selectedJobs))('requires exactly the selected successful/skipped jobs for %s', (scope) => {
    expect(gate(scope)).toBe(0);
    for (const job of ['changes', 'quality', 'build', 'e2e', 'ogiri']) {
      for (const result of ['failure', 'cancelled', '']) expect(gate(scope, { [`${job}.result`]: result })).not.toBe(0);
    }
    for (const job of ['quality', 'build', 'e2e', 'ogiri']) {
      const wrong = expectedResult(scope, job) === 'success' ? 'skipped' : 'success';
      expect(gate(scope, { [`${job}.result`]: wrong })).not.toBe(0);
    }
    expect(gate(scope, {}, scope === 'none')).not.toBe(0);
  });
  it.each(['', 'unknown'])('rejects an invalid selector scope %j', (scope) => {
    expect(gate(scope)).not.toBe(0);
  });
  it('limits the party optimization to known isolated paths, allowing accompanying docs', () => {
    const paths = [
      'src/components/game/Ogiri/Ogiri.tsx', 'src/lib/ogiri/engine.ts',
      'src/app/games/ogiri/page.tsx', 'src/app/api/ogiri/rooms/route.ts',
      'src/data/ogiri/prompts.json', 'scripts/ogiri/catalog.ts', 'scripts/ogiri/render-sounds.ts',
      'tests/unit/ogiri/engine.test.ts', 'tests/ogiri/party.spec.ts', 'playwright.ogiri.config.ts',
      'public/audio/ogiri/cheer.mp3', 'public/img/games/ogiri/characters/cat.webp',
      'public/img/games/covers/ogiri.webp', 'public/fonts/ogiri-display.woff2',
      'public/fonts/ogiri-display-OFL.txt',
    ];
    for (const path of paths) expect(classify([path, 'docs/ogiri-party.md', 'README.md']).scope).toBe('party');
    expect(classify(paths)).toMatchObject({ website: true, legacyCi: false, scope: 'party' });
  });
  it.each([
    'src/components/GlobalToolbar.tsx', 'src/app/layout.tsx', 'src/app/globals.css',
    'src/lib/firebase.ts', 'src/lib/ogiri-shared.ts', 'src/app/games/ogiri-other/page.tsx',
    'src/app/games/page.tsx', 'public/fonts/shared.woff2', 'unknown-file.json', 'next.config.ts', 'tsconfig.json',
    'package.json', 'package-lock.json', '.npmrc', 'vitest.config.mts',
    '.github/workflows/website.yml', '.github/workflows/new.yml',
    'scripts/ci-website-routing.mjs', 'scripts/strict-workflow-yaml.mjs',
    'ml/train.py', 'native/Package.swift',
  ])('keeps full website coverage for party plus %s', (path) => {
    expect(classify(['src/lib/ogiri/engine.ts', path]).scope).toBe('full');
    expect(classify([path]).scope).toBe(runs('website', 'pull_request', [path]) ? 'full' : 'none');
  });
  it('skips the party suites only when every changed path is known to be independent of the party', () => {
    const paths = [
      'src/components/game/Blokus/Blokus.tsx', 'src/components/game/MedalPusher/engine.ts',
      'src/app/games/blokus/page.tsx', 'src/app/api/game/medal-floor/route.ts', 'src/app/api/game/starcat/route.ts',
      'src/lib/medalFloor/draw.ts', 'src/lib/starcatCatalog.ts', 'public/img/games/covers/blokus.webp',
      'public/img/games/starcat-caravan/hero.webp', 'public/audio/starcat-caravan/charge.mp3',
      'tests/e2e/blokus.spec.ts', 'tests/e2e/games.spec.ts', 'tests/unit/components/game/Blokus/engine.test.ts',
    ];
    for (const path of paths) {
      expect(classify([path, 'docs/ogiri-party.md', 'README.md'])).toEqual({
        website: true, legacyCi: false, scope: 'non-party', gateName: 'Test and build',
      });
    }
    expect(classify(paths).scope).toBe('non-party');
  });
  it.each([
    // The party depends on the catalog and the locales: its metadata reads its catalog entry, and its loading and
    // error pages are translated. So a PR that registers a new game still runs the party suites.
    'src/components/game/constants/games.ts', 'src/locales/en/common.json', 'src/locales/ja/common.json',
    'src/components/game/constants/gameNav.ts', 'src/components/game/common/GameTopBar.tsx',
    'src/components/game/contexts/GameLanguageContext.tsx', 'src/components/game/Shared.tsx',
    'src/components/game/newShared/util.ts', 'src/components/GlobalToolbar.tsx', 'src/components/ui/button.tsx',
    'src/app/layout.tsx', 'src/app/globals.css', 'src/app/games/layout.tsx', 'src/app/games/page.tsx',
    'src/app/api/game/room/route.ts', 'src/lib/party/points.ts', 'src/lib/games/gameMetadata.ts',
    'src/assets/scss/main.scss', 'middleware.ts', 'public/fonts/shared.woff2', 'public/audio/new-game/hit.mp3',
    'tests/ogiri/party.spec.ts', 'tests/unit/ogiri/engine.test.ts', 'tests/fixtures/data.json',
    'src/app/games/ogiri-other/page.tsx', 'tests/e2e/ogiri-landing.spec.ts', 'scripts/blokus-ai-match.ts',
  ])('keeps the party suites for a game change plus %s', (path) => {
    expect(classify(['src/components/game/Blokus/Blokus.tsx', path]).scope).toBe('full');
  });
  it('leaves nothing the party suites load on the independent list', () => {
    const closure = partyImportClosure();
    // Proof the trace crosses the shared shell, so an empty result below means something.
    expect(closure).toEqual(expect.arrayContaining([
      'src/components/game/Ogiri/Ogiri.tsx', 'src/components/GlobalToolbar.tsx', 'src/app/globals.css',
      'src/components/game/constants/games.ts', 'src/lib/games/gameMetadata.ts', 'src/locales/ja/common.json',
    ]));
    expect(closure.filter((path) => classify([path]).scope === 'non-party')).toEqual([]);
  });
  it('runs the party checks every night, apart from the validation of main', () => {
    expect(workflows.website.on.schedule).toEqual([{ cron: '0 19 * * *' }]);
    expect(workflows.website.concurrency.group).toBe('website-${{ github.event_name }}-${{ github.ref }}');
  });
  it.each([
    ['workflow_dispatch', 'full'],
    ['schedule', 'party'],
  ])('%s selects the %s scope', (event, scope) => {
    const dir = mkdtempSync(join(tmpdir(), 'website-routing-'));
    try {
      const eventPath = join(dir, 'event.json');
      const outputPath = join(dir, 'output');
      writeFileSync(eventPath, '{}');
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL('../../scripts/ci-website-routing.mjs', import.meta.url)),
      ], { encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: event,
        GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath } });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ website: true, legacyCi: true, scope, gateName: 'Website checks' });
      expect(readFileSync(outputPath, 'utf8')).toBe(`website=true\nscope=${scope}\ngate_name=Website checks\n`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  for (const event of ['pull_request']) {
    it(`${event}: website changes avoid unrelated training/native gates`, () => {
      for (const paths of [
        ['src/components/game/Ogiri/Ogiri.tsx', 'tests/unit/ogiri/engine.test.ts'],
        ['src/components/GlobalToolbar.tsx'],
        ['scripts/ogiri/catalog.ts', 'src/data/ogiri/daily.txt'],
      ]) {
        expect(runs('website', event, paths)).toBe(true);
        expect(runs('ci', event, paths)).toBe(false);
        expect(classifyWebsiteChanges(paths, workflows.ci.on[event].paths,
          workflows.website.on[event]['paths-ignore'])).toEqual({
          website: true, legacyCi: false,
          scope: paths.some((path) => path === 'src/components/GlobalToolbar.tsx') ? 'full' : 'party',
          gateName: 'Test and build',
        });
      }
    });
    it(`${event}: training-only work keeps its contracts without website tests`, () => {
      for (const paths of [
        ['ml/train.py', 'tests/unit/ml/exact24kVitestInventory.test.ts'],
        ['native/floodgate-v7-aws-witness-adapter-contract/Package.swift'],
        ['scripts/shogi-ai-match-output/game.csv'],
        ['docs/blog-shogi-floodgate-v7-runtime-policy-preimages.md'],
      ]) {
        expect(runs('ci', event, paths)).toBe(true);
        expect(runs('website', event, paths)).toBe(false);
        expect(classifyWebsiteChanges(paths, workflows.ci.on[event].paths,
          workflows.website.on[event]['paths-ignore'])).toEqual({
          website: false, legacyCi: true, scope: 'none', gateName: 'Website checks',
        });
      }
    });
    it(`${event}: shared dependencies and mixed changes keep both suites`, () => {
      for (const paths of [
        ['package-lock.json'],
        ['.npmrc'],
        ['vitest.config.ts'],
        ['src/components/game/ShogiImproved/wasmEngine.ts'],
        ['ml/train.py', 'src/app/games/page.tsx'],
      ]) {
        expect(runs('ci', event, paths)).toBe(true);
        expect(runs('website', event, paths)).toBe(true);
        expect(classifyWebsiteChanges(paths, workflows.ci.on[event].paths,
          workflows.website.on[event]['paths-ignore'])).toEqual({
          website: true, legacyCi: true, scope: 'full', gateName: 'Website checks',
        });
      }
    });
    it(`${event}: documentation-only changes retain the required check without expensive jobs`, () => {
      expect(runs('ci', event, ['docs/ogiri-party.md'])).toBe(false);
      expect(runs('website', event, ['docs/ogiri-party.md'])).toBe(true);
      expect(classifyWebsiteChanges(['docs/ogiri-party.md'], workflows.ci.on[event].paths,
        workflows.website.on[event]['paths-ignore'])).toEqual({
        website: false, legacyCi: false, scope: 'none', gateName: 'Test and build',
      });
    });
  }
});
