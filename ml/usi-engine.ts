import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import {
  UsiMultiPvAccumulator,
  buildGo,
  type UsiMultiPvResult,
  type UsiSearchLimit,
} from "./usi-multipv";

export interface UsiTeacherEngineOptions {
  engineBin: string;
  engineArgs?: readonly string[];
  evalDir?: string;
  fvScale?: number;
  hashMb?: number;
  timeoutMs?: number;
  /** Focused-test override; production callers must use the fixed defaults. */
  testOnlyInitializationTimeoutMs?: number;
  /** Focused-test override; production resetForParent always uses 120 seconds. */
  testOnlyResetForParentTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Synchronous spawn registration used by fail-closed process supervisors. */
  onSpawn?: (identity: Readonly<{ pid: number }>) => void;
}

/** Fixed engine settings that are both executed and recorded in manifests. */
export const USI_TEACHER_ENGINE_CONTRACT = {
  threads: 1,
  usi_own_book: false,
  book_file: "no_book",
  network_delay_ms: 0,
  network_delay2_ms: 0,
  search_state_reset_trigger: "isready",
} as const;

export const USI_RESET_FOR_PARENT_TIMEOUT_MS = 120_000 as const;

/** Exact, machine-readable signal for the configured wall-clock search bound. */
export class UsiSearchTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`USI search timeout after ${timeoutMs}ms`);
    this.name = "UsiSearchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Exact signal for an `isready` timeout while resetting one parent search. */
export class UsiResetForParentTimeoutError extends Error {
  readonly phase = "reset-for-parent" as const;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`USI resetForParent timeout after ${timeoutMs}ms`);
    this.name = "UsiResetForParentTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

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
  private static readonly STDERR_TAIL_LIMIT = 8_192;
  private readonly options: UsiTeacherEngineOptions;
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private stderrTail = "";
  private lineHandler: ((line: string) => void) | null = null;
  private abortPending: ((error: Error) => void) | null = null;

  constructor(options: UsiTeacherEngineOptions) {
    this.options = options;
  }

  private spawn(): void {
    const child = spawn(
      this.options.engineBin,
      [...(this.options.engineArgs ?? [])],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: this.options.env ?? process.env,
        cwd: this.options.cwd,
      },
    );
    this.process = child;
    this.buffer = "";
    this.stderrTail = "";
    if (child.pid === undefined || !Number.isSafeInteger(child.pid)) {
      child.kill("SIGKILL");
      throw new Error("USI process PID is unavailable at spawn");
    }
    try {
      this.options.onSpawn?.(Object.freeze({ pid: child.pid }));
    } catch (error) {
      child.kill("SIGKILL");
      throw error;
    }
    // Always consume stderr so a verbose engine cannot fill the pipe and block.
    // Retain only a bounded tail for actionable initialization/search failures.
    child.stderr.on("data", (chunk: Buffer) => {
      if (this.process !== child) return;
      this.stderrTail = `${this.stderrTail}${chunk.toString("utf8")}`.slice(
        -UsiTeacherEngine.STDERR_TAIL_LIMIT,
      );
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (this.process !== child) return;
      this.buffer += chunk.toString("utf8");
      let newline: number;
      while ((newline = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, newline).replace(/\r$/, "");
        this.buffer = this.buffer.slice(newline + 1);
        this.lineHandler?.(line);
      }
    });
    let failurePending = false;
    const fail = (message: string, terminateChild = false) => {
      if (this.process !== child || failurePending) return;
      failurePending = true;
      const reject = this.abortPending;
      this.abortPending = null;
      this.lineHandler = null;
      let finalized = false;
      const finalize = () => {
        if (finalized) return;
        finalized = true;
        const stderr = this.stderrTail.trim();
        if (this.process === child) this.process = null;
        this.buffer = "";
        reject?.(
          new Error(stderr ? `${message}; stderr tail: ${stderr}` : message),
        );
      };

      // A stdin/process error does not prove that the OS process exited. Kill
      // a still-live child and wait for close so retries cannot orphan an
      // engine and the complete bounded stderr tail remains available.
      if (
        terminateChild &&
        child.pid !== undefined &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        child.once("close", finalize);
        try {
          if (!child.kill("SIGKILL")) finalize();
        } catch {
          finalize();
        }
        return;
      }
      finalize();
    };
    child.on("error", (error) =>
      fail(`USI process error: ${error.message}`, true),
    );
    // `close` follows `exit` only after stdio closes, so diagnostics include
    // all stderr bytes emitted before process termination.
    child.on("close", (code, signal) =>
      fail(`USI process exited (code=${code}, signal=${signal})`),
    );
    child.stdin.on("error", (error) =>
      fail(`USI stdin error: ${error.message}`, true),
    );
  }

  private send(command: string): void {
    const child = this.process;
    if (!child || child.stdin.destroyed || !child.stdin.writable) {
      throw new Error(`USI process is not writable (${command.split(" ")[0]})`);
    }
    child.stdin.write(`${command}\n`);
  }

  private waitFor(
    predicate: (line: string) => boolean,
    timeoutMs: number,
    timeoutError: () => Error = () =>
      new Error(`USI timeout after ${timeoutMs}ms`),
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineHandler = null;
        this.abortPending = null;
        reject(timeoutError());
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
    if (this.process) throw new Error("USI engine is already initialized");
    const testTimeout = this.options.testOnlyInitializationTimeoutMs;
    if (
      testTimeout !== undefined &&
      (!Number.isSafeInteger(testTimeout) || testTimeout <= 0)
    ) {
      throw new Error(
        "testOnlyInitializationTimeoutMs must be a positive safe integer",
      );
    }
    try {
      this.spawn();
      this.send("usi");
      await this.waitFor((line) => line === "usiok", testTimeout ?? 15_000);
      if (this.options.evalDir)
        this.send(`setoption name EvalDir value ${this.options.evalDir}`);
      this.send(`setoption name FV_SCALE value ${this.options.fvScale ?? 20}`);
      this.send(`setoption name USI_Hash value ${this.options.hashMb ?? 128}`);
      for (const command of fixedUsiOptionCommands()) this.send(command);
      this.send("isready");
      await this.waitFor((line) => line === "readyok", testTimeout ?? 120_000);
      this.send("usinewgame");
    } catch (error) {
      try {
        await this.quit();
      } catch {
        // Cleanup is best-effort here: preserve the initialization failure
        // that explains why this engine could not be used.
      }
      throw error;
    }
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
    if (!this.process) throw new Error("USI engine is not initialized");
    if (this.lineHandler)
      throw new Error("cannot reset USI engine during a pending operation");
    const timeoutMs =
      this.options.testOnlyResetForParentTimeoutMs ??
      USI_RESET_FOR_PARENT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        "testOnlyResetForParentTimeoutMs must be a positive safe integer",
      );
    }
    this.send("isready");
    await this.waitFor(
      (line) => line === "readyok",
      timeoutMs,
      () => new UsiResetForParentTimeoutError(timeoutMs),
    );
    this.send("usinewgame");
  }

  search(
    sfen: string,
    multipv: number,
    limit: UsiSearchLimit,
    searchmoves: readonly string[] = [],
  ): Promise<UsiMultiPvResult> {
    if (this.lineHandler)
      return Promise.reject(
        new Error("USI engine already has a pending operation"),
      );
    const dualBound = limit.depth !== undefined && limit.nodes !== undefined;
    if (limit.minimumCompletedDepth !== undefined && !dualBound) {
      return Promise.reject(
        new Error(
          "minimumCompletedDepth requires both depth and nodes for a dual-bound search",
        ),
      );
    }
    if (
      dualBound &&
      (multipv !== 1 ||
        searchmoves.length !== 1 ||
        limit.minimumCompletedDepth === undefined)
    ) {
      return Promise.reject(
        new Error(
          "dual depth/node search is restricted to one forced MultiPV=1 rescore with minimumCompletedDepth",
        ),
      );
    }
    const requiredDepth = limit.depth;
    let accumulator: UsiMultiPvAccumulator;
    try {
      accumulator = new UsiMultiPvAccumulator({
        multipv,
        requiredDepth,
        nodeCap: dualBound ? limit.nodes : undefined,
        minimumCompletedDepth: limit.minimumCompletedDepth,
        allowTerminalMateBeforeRequiredDepth:
          requiredDepth !== undefined &&
          multipv === 1 &&
          searchmoves.length === 1,
      });
    } catch (error) {
      return Promise.reject(error);
    }
    const timeoutMs = this.options.timeoutMs ?? 120_000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineHandler = null;
        this.abortPending = null;
        reject(new UsiSearchTimeoutError(timeoutMs));
      }, timeoutMs);
      this.abortPending = (error) => {
        clearTimeout(timer);
        this.lineHandler = null;
        reject(error);
      };
      this.lineHandler = (line) => {
        accumulator.push(`${line}\n`);
        if (!line.startsWith("bestmove")) return;
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
    reject?.(new Error("USI engine terminated"));
    if (!child) return;
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      const forceKill = setTimeout(() => child.kill("SIGKILL"), 500);
      child.once("close", () => {
        clearTimeout(forceKill);
        resolve();
      });
      try {
        child.stdin.write("quit\n");
        child.stdin.end();
      } catch {
        child.kill("SIGKILL");
      }
    });
  }
}
