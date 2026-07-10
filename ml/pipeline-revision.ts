import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PipelineProvenance {
  source_revision: string;
  tracked_tree_clean: true;
}

export type GitCommandRunner = (args: readonly string[]) => Promise<string>;

function runGit(repositoryDirectory: string): GitCommandRunner {
  return (args) => new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', repositoryDirectory, ...args],
      { encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`git ${args.join(' ')} failed: ${stderr.trim() || error.message}`));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

/**
 * Bind an accepted teacher run to one committed implementation.
 *
 * Ignored datasets do not affect the code tree. Any staged, unstaged, or
 * non-ignored untracked file fails closed, so an uncommitted module cannot
 * participate in the run and the revision identifies the implementation.
 */
export async function verifyPipelineRevision(
  expectedRevision: string,
  options: {
    repositoryDirectory?: string;
    git?: GitCommandRunner;
  } = {}
): Promise<PipelineProvenance> {
  if (!/^[0-9a-f]{40}$/.test(expectedRevision)) {
    throw new Error('pipeline revision must be a lowercase 40-digit Git commit');
  }
  const git = options.git ?? runGit(options.repositoryDirectory ?? process.cwd());
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  if (!/^[0-9a-f]{40}$/.test(head)) {
    throw new Error(`git HEAD is not a full lowercase commit: ${JSON.stringify(head)}`);
  }
  if (head !== expectedRevision) {
    throw new Error(`pipeline revision ${expectedRevision} does not match git HEAD ${head}`);
  }
  const worktreeStatus = (await git([
    'status',
    '--porcelain=v1',
    '--untracked-files=normal',
  ])).trim();
  if (worktreeStatus !== '') {
    throw new Error('pipeline worktree is dirty; commit non-ignored changes before generating labels');
  }
  return { source_revision: head, tracked_tree_clean: true };
}

async function resolvePotentialPath(filePath: string): Promise<string> {
  const absolute = path.resolve(filePath);
  // `rename(temp, output)` replaces a final symlink; it does not follow it.
  // Resolve only parent directories so a tracked symlink remains identified
  // by its own repository path while symlinked parents are still normalized.
  let current = path.dirname(absolute);
  const missing: string[] = [];
  while (true) {
    try {
      const resolved = await fs.promises.realpath(current);
      return path.join(resolved, ...missing, path.basename(absolute));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) return absolute;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

interface FileIdentity {
  path: string;
  device?: number;
  inode?: number;
}

async function outputIdentity(filePath: string): Promise<FileIdentity> {
  const resolved = await resolvePotentialPath(filePath);
  try {
    const stat = await fs.promises.lstat(resolved);
    return { path: resolved, device: stat.dev, inode: stat.ino };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { path: resolved };
  }
}

async function inputIdentity(filePath: string): Promise<FileIdentity> {
  const resolved = await fs.promises.realpath(path.resolve(filePath));
  const stat = await fs.promises.stat(resolved);
  return { path: resolved, device: stat.dev, inode: stat.ino };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.path === right.path || (
    left.device !== undefined &&
    right.device !== undefined &&
    left.device === right.device &&
    left.inode === right.inode
  );
}

/** Refuse tracked or non-ignored in-repository mutable output paths. */
export async function verifyPipelineOutputPaths(
  outputPaths: readonly string[],
  options: {
    repositoryDirectory?: string;
    git?: GitCommandRunner;
    inputPaths?: readonly string[];
  } = {}
): Promise<void> {
  const git = options.git ?? runGit(options.repositoryDirectory ?? process.cwd());
  const reportedRepositoryRoot = (await git(['rev-parse', '--show-toplevel'])).trim();
  if (!path.isAbsolute(reportedRepositoryRoot)) {
    throw new Error(
      `git returned an invalid repository root: ${JSON.stringify(reportedRepositoryRoot)}`
    );
  }
  const repositoryRoot = await fs.promises.realpath(reportedRepositoryRoot);
  const outputIdentities = await Promise.all(outputPaths.map(outputIdentity));
  for (let left = 0; left < outputIdentities.length; left++) {
    for (let right = left + 1; right < outputIdentities.length; right++) {
      if (sameIdentity(outputIdentities[left], outputIdentities[right])) {
        throw new Error('generator output paths resolve to the same file');
      }
    }
  }
  const inputIdentities = await Promise.all((options.inputPaths ?? []).map(inputIdentity));
  if (outputIdentities.some((output) => inputIdentities.some((input) => sameIdentity(output, input)))) {
    throw new Error('generator output path aliases a protected input file');
  }
  const relativePaths = outputIdentities
    .map((output) => path.relative(repositoryRoot, output.path))
    .filter((relative) => relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  if (relativePaths.length === 0) return;
  const tracked = (await git([
    'ls-files',
    '--',
    ...relativePaths.map((relative) => `:(literal)${relative.split(path.sep).join('/')}`),
  ])).trim();
  if (tracked !== '') {
    throw new Error(`generator output path is Git-tracked: ${tracked.split(/\r?\n/, 1)[0]}`);
  }
  for (const relative of relativePaths) {
    try {
      const ignored = (await git(['check-ignore', '--no-index', '--', relative])).trim();
      if (ignored === '') throw new Error('no matching ignore rule');
    } catch {
      throw new Error(
        `in-repository generator output must be Git-ignored: ${relative.split(path.sep).join('/')}`
      );
    }
  }
}
