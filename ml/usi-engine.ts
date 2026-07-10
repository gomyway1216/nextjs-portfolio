import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import {
  UsiMultiPvAccumulator,
  buildGo,
  type UsiMultiPvResult,
  type UsiSearchLimit,
} from './usi-multipv';

export interface UsiTeacherEngineOptions {
  engineBin: string;
  engineArgs?: readonly string[];
  evalDir?: string;
  fvScale?: number;
  hashMb?: number;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

/** Fixed engine settings that are both executed and recorded in manifests. */
export const USI_TEACHER_ENGINE_CONTRACT = {
  threads: 1,
  usi_own_book: false,
  book_file: 'no_book',
  network_delay_ms: 0,
  network_delay2_ms: 0,
  search_state_reset_trigger: 'isready',
} as const;

/** Build the exact fixed option transcript from the recorded contract. */
export function fixedUsiOptionCommands(): string[] {
  return [
    `setoption name Threads value ${USI_TEACHER_ENGINE_CONTRACT.threads}`,
    `setoption name USI_OwnBook value ${USI_TEACHER_ENGINE_CONTRACT.usi_own_book}`,
    `setoption name BookFile value ${USI_TEACHER_ENGINE_CONTRACT.book_file}`,
    `setoption name NetworkDelay value ${USI_TEACHER_ENGINE_CONTRACT.network_delay_ms}`,
    `setoption name NetworkDelay2 value ${USI_TEACHER_ENGINE_CONTRACT.network_delay2_ms}`,
  ];
}

/** One-process, one-search-at-a-time USI wrapper for deterministic labels. */
export class UsiTeacherEngine {
  private readonly options: UsiTeacherEngineOptions;
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private lineHandler: ((line: string) => void) | null = null;
  private abortPending: ((error: Error) => void) | null = null;

  constructor(options: UsiTeacherEngineOptions) {
    this.options = options;
  }

  private spawn(): void {
    const child = spawn(this.options.engineBin, [...(this.options.engineArgs ?? [])], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.options.env ?? process.env,
      cwd: this.options.cwd,
    });
    this.process = child;
    this.buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      if (this.process !== child) return;
      this.buffer += chunk.toString('utf8');
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newline).replace(/\r$/, '');
        this.buffer = this.buffer.slice(newline + 1);
        this.lineHandler?.(line);
      }
    });
    const fail = (message: string) => {
      if (this.process !== child) return;
      const reject = this.abortPending;
      this.abortPending = null;
      this.lineHandler = null;
      reject?.(new Error(message));
    };
    child.on('error', (error) => fail(`USI process error: ${error.message}`));
    child.on('exit', (code, signal) => fail(`USI process exited (code=${code}, signal=${signal})`));
    child.stdin.on('error', (error) => fail(`USI stdin error: ${error.message}`));
  }

  private send(command: string): void {
    const child = this.process;
    if (!child || child.stdin.destroyed || !child.stdin.writable) {
      throw new Error(`USI process is not writable (${command.split(' ')[0]})`);
    }
    child.stdin.write(`${command}\n`);
  }

  private waitFor(predicate: (line: string) => boolean, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineHandler = null;
        this.abortPending = null;
        reject(new Error(`USI timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      this.abortPending = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      this.lineHandler = (line) => {
        if (!predicate(line)) return;
        clearTimeout(timer);
        this.lineHandler = null;
        this.abortPending = null;
        resolve();
      };
    });
  }

  async init(): Promise<void> {
    if (this.process) throw new Error('USI engine is already initialized');
    this.spawn();
    this.send('usi');
    await this.waitFor((line) => line === 'usiok', 15_000);
    if (this.options.evalDir) this.send(`setoption name EvalDir value ${this.options.evalDir}`);
    this.send(`setoption name FV_SCALE value ${this.options.fvScale ?? 20}`);
    this.send(`setoption name USI_Hash value ${this.options.hashMb ?? 128}`);
    for (const command of fixedUsiOptionCommands()) this.send(command);
    this.send('isready');
    await this.waitFor((line) => line === 'readyok', 120_000);
    this.send('usinewgame');
  }

  /**
   * Reset all search state before labeling a parent or one forced candidate.
   *
   * The pinned YaneuraOu revision rebuilds worker/thread state and clears its
   * transposition table and search histories while processing `isready`;
   * `usinewgame` itself is a no-op there. This synchronization makes labels
   * independent of worker scheduling, resume history, and the candidate that
   * was searched immediately before the current one.
   */
  async resetForParent(): Promise<void> {
    if (!this.process) throw new Error('USI engine is not initialized');
    if (this.lineHandler) throw new Error('cannot reset USI engine during a pending operation');
    this.send('isready');
    await this.waitFor((line) => line === 'readyok', 120_000);
    this.send('usinewgame');
  }

  search(
    sfen: string,
    multipv: number,
    limit: UsiSearchLimit,
    searchmoves: readonly string[] = []
  ): Promise<UsiMultiPvResult> {
    if (this.lineHandler) return Promise.reject(new Error('USI engine already has a pending operation'));
    const requiredDepth = limit.depth;
    const accumulator = new UsiMultiPvAccumulator({
      multipv,
      requiredDepth,
      allowTerminalMateBeforeRequiredDepth:
        requiredDepth !== undefined && multipv === 1 && searchmoves.length === 1,
    });
    const timeoutMs = this.options.timeoutMs ?? 120_000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineHandler = null;
        this.abortPending = null;
        reject(new Error(`USI search timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      this.abortPending = (error) => {
        clearTimeout(timer);
        this.lineHandler = null;
        reject(error);
      };
      this.lineHandler = (line) => {
        accumulator.push(`${line}\n`);
        if (!line.startsWith('bestmove')) return;
        clearTimeout(timer);
        this.lineHandler = null;
        this.abortPending = null;
        try {
          resolve(accumulator.finish());
        } catch (error) {
          reject(error);
        }
      };
      try {
        this.send(`setoption name MultiPV value ${multipv}`);
        this.send(`position sfen ${sfen}`);
        this.send(buildGo(limit, searchmoves));
      } catch (error) {
        clearTimeout(timer);
        this.lineHandler = null;
        this.abortPending = null;
        reject(error);
      }
    });
  }

  /** Stop the child and resolve only after the OS has closed the process. */
  async quit(): Promise<void> {
    const child = this.process;
    this.process = null;
    this.lineHandler = null;
    const reject = this.abortPending;
    this.abortPending = null;
    reject?.(new Error('USI engine terminated'));
    if (!child) return;
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      const forceKill = setTimeout(() => child.kill('SIGKILL'), 500);
      child.once('close', () => {
        clearTimeout(forceKill);
        resolve();
      });
      try {
        child.stdin.write('quit\n');
        child.stdin.end();
      } catch {
        child.kill('SIGKILL');
      }
    });
  }
}
