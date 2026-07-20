import path from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  USI_TEACHER_ENGINE_CONTRACT,
  UsiSearchTimeoutError,
  UsiTeacherEngine,
  fixedUsiOptionCommands,
} from '../../../ml/usi-engine';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ENGINE = path.resolve(HERE, '../../fixtures/ml/fake-usi-engine.mjs');

describe('USI teacher engine subprocess contract', () => {
  it('derives the executed fixed options from the exported manifest contract', () => {
    expect(fixedUsiOptionCommands()).toEqual([
      `setoption name Threads value ${USI_TEACHER_ENGINE_CONTRACT.threads}`,
      `setoption name USI_OwnBook value ${USI_TEACHER_ENGINE_CONTRACT.usi_own_book}`,
      `setoption name BookFile value ${USI_TEACHER_ENGINE_CONTRACT.book_file}`,
      `setoption name NetworkDelay value ${USI_TEACHER_ENGINE_CONTRACT.network_delay_ms}`,
      `setoption name NetworkDelay2 value ${USI_TEACHER_ENGINE_CONTRACT.network_delay2_ms}`,
    ]);
  });

  it('initializes and returns an exact fixed-depth candidate snapshot', async () => {
    const engine = new UsiTeacherEngine({
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE],
      timeoutMs: 5_000,
    });
    try {
      await engine.init();
      await engine.resetForParent();
      const result = await engine.search(
        'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        2,
        { depth: 8 },
        ['7g7f', '2g2f']
      );
      expect(result.depth).toBe(8);
      expect(result.bestmove).toBe('7g7f');
      expect(result.lines.map((line) => [line.multipv, line.move, line.cp])).toEqual([
        [1, '7g7f', 260],
        [2, '2g2f', 220],
      ]);
    } finally {
      await engine.quit();
    }
  });

  it('drains large engine stderr output instead of allowing the child pipe to block', async () => {
    const engine = new UsiTeacherEngine({
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--stderr-bytes', String(2 * 1024 * 1024)],
      timeoutMs: 5_000,
    });
    try {
      await engine.init();
      const result = await engine.search(
        'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        1,
        { depth: 8 },
        ['7g7f']
      );
      expect(result.bestmove).toBe('7g7f');
    } finally {
      await engine.quit();
    }
  });

  it('rejects the configured search deadline with a typed timeout signal', async () => {
    const engine = new UsiTeacherEngine({
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--hang-go'],
      timeoutMs: 25,
    });
    try {
      await engine.init();
      const failure = await engine
        .search(
          'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
          1,
          { depth: 8 },
          ['7g7f']
        )
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(UsiSearchTimeoutError);
      expect(failure).toMatchObject({
        name: 'UsiSearchTimeoutError',
        timeoutMs: 25,
        message: 'USI search timeout after 25ms',
      });
    } finally {
      await engine.quit();
    }
  });

  it('closes a live child when the initial USI handshake times out', async () => {
    const engine = new UsiTeacherEngine({
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--hang-usi'],
      timeoutMs: 5_000,
      testOnlyInitializationTimeoutMs: 25,
    });
    const initialization = engine.init();
    const child = (
      engine as unknown as {
        process: ChildProcessWithoutNullStreams | null;
      }
    ).process;
    expect(child).not.toBeNull();
    await expect(initialization).rejects.toThrow('USI timeout after 25ms');
    expect(
      (
        engine as unknown as {
          process: ChildProcessWithoutNullStreams | null;
        }
      ).process
    ).toBeNull();
    expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
  });

  it('preserves the initialization failure when best-effort cleanup also fails', async () => {
    const engine = new UsiTeacherEngine({
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--hang-usi'],
      timeoutMs: 5_000,
      testOnlyInitializationTimeoutMs: 25,
    });
    const realQuit = engine.quit.bind(engine);
    vi.spyOn(engine, 'quit').mockImplementationOnce(async () => {
      await realQuit();
      throw new Error('synthetic cleanup failure');
    });

    await expect(engine.init()).rejects.toThrow('USI timeout after 25ms');
    expect(
      (
        engine as unknown as {
          process: ChildProcessWithoutNullStreams | null;
        }
      ).process
    ).toBeNull();
  });

  it('clears failed child state, reports stderr, and permits initialization retry', async () => {
    const engine = new UsiTeacherEngine({
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--exit-before-usi'],
      timeoutMs: 5_000,
    });
    try {
      await expect(engine.init()).rejects.toThrow(
        /USI process exited \(code=7, signal=null\); stderr tail: intentional startup failure/
      );
      await expect(engine.init()).rejects.toThrow(
        /USI process exited \(code=7, signal=null\); stderr tail: intentional startup failure/
      );
    } finally {
      await engine.quit();
    }
  });

  it('kills and closes a live child whose stdin pipe fails', async () => {
    const engine = new UsiTeacherEngine({
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE],
      timeoutMs: 5_000,
    });
    const initialization = engine.init();
    const child = (
      engine as unknown as {
        process: ChildProcessWithoutNullStreams | null;
      }
    ).process;
    try {
      expect(child).not.toBeNull();
      child?.stdin.emit('error', new Error('synthetic EPIPE'));
      await expect(initialization).rejects.toThrow(/USI stdin error: synthetic EPIPE/);
      expect(child?.exitCode).toBeNull();
      expect(child?.signalCode).toBe('SIGKILL');
    } finally {
      await engine.quit();
    }
  });
});
