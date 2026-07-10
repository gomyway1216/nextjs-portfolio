import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  verifyPipelineOutputPaths,
  verifyPipelineRevision,
  type GitCommandRunner,
} from '../../../ml/pipeline-revision';

const REVISION = '0123456789abcdef0123456789abcdef01234567';

function fakeGit(head = REVISION, status = ''): GitCommandRunner {
  return vi.fn(async (args: readonly string[]) => {
    if (args[0] === 'rev-parse') return `${head}\n`;
    if (args[0] === 'status') return status;
    throw new Error(`unexpected git command: ${args.join(' ')}`);
  });
}

describe('teacher pipeline revision binding', () => {
  it('accepts only the requested clean tracked commit', async () => {
    const git = fakeGit();
    await expect(verifyPipelineRevision(REVISION, { git })).resolves.toEqual({
      source_revision: REVISION,
      tracked_tree_clean: true,
    });
    expect(git).toHaveBeenNthCalledWith(1, ['rev-parse', 'HEAD']);
    expect(git).toHaveBeenNthCalledWith(2, [
      'status',
      '--porcelain=v1',
      '--untracked-files=normal',
    ]);
  });

  it('rejects malformed, mismatched, and dirty revisions', async () => {
    await expect(verifyPipelineRevision('main', { git: fakeGit() })).rejects.toThrow(
      /lowercase 40-digit/
    );
    await expect(
      verifyPipelineRevision(REVISION, { git: fakeGit('f'.repeat(40)) })
    ).rejects.toThrow(/does not match git HEAD/);
    await expect(
      verifyPipelineRevision(REVISION, { git: fakeGit(REVISION, ' M ml/train.py\n') })
    ).rejects.toThrow(/pipeline worktree is dirty/);
  });

  it('rejects tracked output paths while allowing external and untracked outputs', async () => {
    const root = await fs.promises.realpath(process.cwd());
    const calls: string[][] = [];
    const git = vi.fn(async (args: readonly string[]) => {
      calls.push([...args]);
      if (args[0] === 'rev-parse') return `${root}\n`;
      if (args[0] === 'ls-files') return args.some((arg) => arg.includes('README.md'))
        ? 'README.md\n'
        : '';
      if (args[0] === 'check-ignore') return `${args.at(-1)}\n`;
      throw new Error(`unexpected git command: ${args.join(' ')}`);
    });
    await expect(
      verifyPipelineOutputPaths([path.join(root, 'ml/data/run/work.jsonl'), '/tmp/train.jsonl'], { git })
    ).resolves.toBeUndefined();
    await expect(verifyPipelineOutputPaths([path.join(root, 'README.md')], { git })).rejects.toThrow(
      /Git-tracked/
    );
    expect(calls.some((args) => args.includes(':(literal)ml/data/run/work.jsonl'))).toBe(true);

    const notIgnored = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'rev-parse') return `${root}\n`;
      if (args[0] === 'ls-files') return '';
      if (args[0] === 'check-ignore') throw new Error('not ignored');
      throw new Error(`unexpected git command: ${args.join(' ')}`);
    });
    await expect(
      verifyPipelineOutputPaths([path.join(root, 'output/train.jsonl')], { git: notIgnored })
    ).rejects.toThrow(/must be Git-ignored/);
  });

  it('treats an existing final symlink as the path rename would replace', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pipeline-output-'));
    const target = path.join(root, 'outside-target');
    const outputLink = path.join(root, 'tracked-output');
    await fs.promises.writeFile(target, 'target');
    await fs.promises.symlink(target, outputLink);
    const git = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'rev-parse') return `${root}\n`;
      if (args[0] === 'ls-files') {
        return args.includes(':(literal)tracked-output') ? 'tracked-output\n' : '';
      }
      if (args[0] === 'check-ignore') return `${args.at(-1)}\n`;
      throw new Error(`unexpected git command: ${args.join(' ')}`);
    });
    try {
      await expect(verifyPipelineOutputPaths([outputLink], { git })).rejects.toThrow(/Git-tracked/);
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects symlink-parent aliases and output aliases of protected inputs', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pipeline-alias-'));
    const realDirectory = path.join(root, 'real');
    const aliasDirectory = path.join(root, 'alias');
    const input = path.join(realDirectory, 'engine.bin');
    await fs.promises.mkdir(realDirectory);
    await fs.promises.symlink(realDirectory, aliasDirectory);
    await fs.promises.writeFile(input, 'engine');
    const git = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'rev-parse') return `${root}\n`;
      if (args[0] === 'ls-files') return '';
      if (args[0] === 'check-ignore') return `${args.at(-1)}\n`;
      throw new Error(`unexpected git command: ${args.join(' ')}`);
    });
    try {
      await expect(verifyPipelineOutputPaths([
        path.join(realDirectory, 'train.jsonl'),
        path.join(aliasDirectory, 'train.jsonl'),
      ], { git })).rejects.toThrow(/same file/);
      await expect(verifyPipelineOutputPaths([
        path.join(aliasDirectory, 'engine.bin'),
      ], { git, inputPaths: [input] })).rejects.toThrow(/protected input/);
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });
});
