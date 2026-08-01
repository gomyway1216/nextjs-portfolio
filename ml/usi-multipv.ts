/**
 * Pure USI MultiPV parsing helpers used by the strong-game teacher pipeline.
 *
 * The accumulator deliberately keeps every update by (depth, multipv rank)
 * and returns the deepest depth for which all requested ranks are present.
 * It never combines ranks from different depths: a partially emitted final
 * iteration therefore cannot silently become a mixed-depth teacher label.
 */

export interface UsiSearchLimit {
  nodes?: number;
  depth?: number;
  /** Required floor for a dual depth/node search. */
  minimumCompletedDepth?: number;
}

export interface ParsedUsiPv {
  depth: number;
  multipv: number;
  cp: number;
  nodes: number;
  move: string;
  pv: string[];
  scoreKind: "cp" | "mate";
  mate?: number;
  mateSign?: 1 | -1;
}

export interface UsiMultiPvResult {
  depth: number;
  lines: ParsedUsiPv[];
  bestmove: string;
  observedNodes: number;
  dualBound?: UsiDualBoundResultMetadata;
}

export interface UsiDualBoundResultMetadata {
  terminationReason: "depth" | "node-cap" | "terminal-mate";
  requestedDepth: number;
  nodeCap: number;
  minimumCompletedDepth: number;
  deepestCompleteExactDepth: number;
  selectedSnapshotNodes: number;
  maximumObservedNodes: number;
  maximumObservedDepth: number;
  selectedSnapshotBound: "exact";
  discardedAtOrAboveNodeCapUpdates: number;
  observedLowerboundUpdates: number;
  observedUpperboundUpdates: number;
  capWitnessDepth: number | null;
  capWitnessNodes: number | null;
  selectedPrecedesWitness: boolean;
  completedIterationWitnessDepth: number;
}

export interface UsiMultiPvAccumulatorOptions {
  multipv: number;
  /** For a fixed-depth search, require an exact completed snapshot. */
  requiredDepth?: number;
  /** Optional hard node cap paired with requiredDepth. */
  nodeCap?: number;
  /** Lowest completed exact iteration publishable after a node-cap stop. */
  minimumCompletedDepth?: number;
  /** Accept an exact terminal mate that ends a forced one-move search early. */
  allowTerminalMateBeforeRequiredDepth?: boolean;
}

/** Structured fixed-depth failure used by proposal-only quarantine policy. */
export class UsiFixedDepthRanksIncompleteError extends Error {
  readonly requestedRanks: number;
  readonly requiredDepth: number;
  readonly finalExactRanks: number;
  readonly finalCpRanks: number;
  readonly finalMateRanks: number;
  readonly missingOrNonExactRanks: number;

  constructor(
    requestedRanks: number,
    requiredDepth: number,
    finalExactRanks: number,
    finalCpRanks: number,
    finalMateRanks: number,
  ) {
    super(
      `incomplete MultiPV: fixed-depth ranks did not end with exact updates at depth ${requiredDepth}`,
    );
    this.name = "UsiFixedDepthRanksIncompleteError";
    this.requestedRanks = requestedRanks;
    this.requiredDepth = requiredDepth;
    this.finalExactRanks = finalExactRanks;
    this.finalCpRanks = finalCpRanks;
    this.finalMateRanks = finalMateRanks;
    this.missingOrNonExactRanks = requestedRanks - finalExactRanks;
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer (got ${value})`);
  }
  return value;
}

const CANONICAL_USI_MOVE =
  /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/;

function isCanonicalUsiMove(value: string): boolean {
  return CANONICAL_USI_MOVE.test(value);
}

/** Build a deterministic USI go command, including dual depth/node limits. */
export function buildGo(
  limit: UsiSearchLimit,
  searchmoves: readonly string[] = [],
): string {
  const hasNodes = limit.nodes !== undefined;
  const hasDepth = limit.depth !== undefined;
  if (!hasNodes && !hasDepth) {
    throw new Error("at least one of nodes or depth must be specified");
  }
  const depth = hasDepth
    ? positiveInteger(limit.depth as number, "depth")
    : undefined;
  const nodes = hasNodes
    ? positiveInteger(limit.nodes as number, "nodes")
    : undefined;
  if (hasDepth && hasNodes) {
    if (limit.minimumCompletedDepth === undefined) {
      throw new Error("dual depth/node search requires minimumCompletedDepth");
    }
    const minimum = positiveInteger(
      limit.minimumCompletedDepth,
      "minimumCompletedDepth",
    );
    if (minimum > (depth as number)) {
      throw new Error("minimumCompletedDepth must not exceed depth");
    }
  } else if (limit.minimumCompletedDepth !== undefined) {
    throw new Error(
      "minimumCompletedDepth is only valid for a dual depth/node search",
    );
  }

  const command = hasDepth
    ? `go depth ${depth}${hasNodes ? ` nodes ${nodes}` : ""}`
    : `go nodes ${nodes}`;

  if (searchmoves.length === 0) return command;
  for (const move of searchmoves) {
    if (!isCanonicalUsiMove(move)) {
      throw new Error(`invalid USI searchmove: ${JSON.stringify(move)}`);
    }
  }
  return `${command} searchmoves ${searchmoves.join(" ")}`;
}

function integerToken(tokens: readonly string[], name: string): number | null {
  const index = tokens.indexOf(name);
  if (
    index < 0 ||
    index + 1 >= tokens.length ||
    !/^[+-]?\d+$/.test(tokens[index + 1])
  ) {
    return null;
  }
  const value = Number.parseInt(tokens[index + 1], 10);
  return Number.isSafeInteger(value) ? value : null;
}

function tokenCount(tokens: readonly string[], name: string): number {
  return tokens.reduce((count, token) => count + Number(token === name), 0);
}

function multipvToken(tokens: readonly string[]): number | null {
  return tokens.includes("multipv") ? integerToken(tokens, "multipv") : 1;
}

export const MATE_SCORE_CP = 1_000_000;
export const MAX_NON_MATE_CP = 900_000;
const MAX_MATE_DISTANCE = MATE_SCORE_CP - MAX_NON_MATE_CP - 1;

export function mateToCp(mate: number, mateSign: 1 | -1): number {
  const distance = Math.min(Math.abs(mate), MAX_MATE_DISTANCE);
  return mateSign * (MATE_SCORE_CP - distance);
}

/** Parse one exact (non-bound) USI `info ... pv ...` line. */
export function parseUsiInfoLine(line: string): ParsedUsiPv | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("info ")) return null;

  const tokens = trimmed.split(/\s+/);
  if (tokens.includes("lowerbound") || tokens.includes("upperbound"))
    return null;
  if (
    tokenCount(tokens, "depth") !== 1 ||
    tokenCount(tokens, "multipv") > 1 ||
    tokenCount(tokens, "nodes") !== 1 ||
    tokenCount(tokens, "score") !== 1 ||
    tokenCount(tokens, "pv") !== 1
  ) {
    return null;
  }

  const depth = integerToken(tokens, "depth");
  const multipv = multipvToken(tokens);
  const nodes = integerToken(tokens, "nodes");
  const scoreIndex = tokens.indexOf("score");
  const pvIndex = tokens.indexOf("pv");

  if (
    depth === null ||
    depth <= 0 ||
    multipv === null ||
    multipv <= 0 ||
    nodes === null ||
    nodes < 0 ||
    scoreIndex < 0 ||
    scoreIndex + 2 >= tokens.length ||
    pvIndex < 0 ||
    pvIndex + 1 >= tokens.length
  ) {
    return null;
  }

  const scoreKind = tokens[scoreIndex + 1];
  const scoreText = tokens[scoreIndex + 2];
  if (
    (scoreKind !== "cp" && scoreKind !== "mate") ||
    !/^[+-]?\d+$/.test(scoreText) ||
    scoreIndex >= pvIndex
  ) {
    return null;
  }

  const score = Number.parseInt(scoreText, 10);
  const pv = tokens.slice(pvIndex + 1);
  if (
    !Number.isSafeInteger(score) ||
    pv.length === 0 ||
    pv.some((move) => !isCanonicalUsiMove(move))
  ) {
    return null;
  }

  if (scoreKind === "mate") {
    // Number.parseInt('-0') preserves -0, but numeric comparisons do not: -0
    // is >= 0. Keep the protocol sign from the original token explicitly.
    const mateSign: 1 | -1 = scoreText.startsWith("-") ? -1 : 1;
    return {
      depth,
      multipv,
      cp: mateToCp(score, mateSign),
      nodes,
      move: pv[0],
      pv,
      scoreKind,
      mate: score,
      mateSign,
    };
  }

  if (Math.abs(score) > MAX_NON_MATE_CP) return null;

  return {
    depth,
    multipv,
    cp: score,
    nodes,
    move: pv[0],
    pv,
    scoreKind,
  };
}

export class UsiMultiPvAccumulator {
  private readonly expectedMultiPv: number;
  private readonly requiredDepth?: number;
  private readonly nodeCap?: number;
  private readonly minimumCompletedDepth?: number;
  private readonly allowTerminalMateBeforeRequiredDepth: boolean;
  private readonly snapshots = new Map<number, Map<number, ParsedUsiPv>>();
  private readonly snapshotSequences = new Map<string, number>();
  /** Latest stream update by depth/rank, including bound-only tombstones. */
  private readonly latestNodes = new Map<string, number>();
  private readonly boundTombstones = new Set<string>();
  private readonly observedDepths = new Set<number>();
  private readonly lastUpdateByRank = new Map<
    number,
    { depth: number; acceptedExact: boolean }
  >();
  private readonly maxObservedDepthByRank = new Map<number, number>();
  private observedUnexpectedRank = false;
  private observedMalformedMultiPv = false;
  private observedMalformedTeacherEvidence = false;
  private observedMalformedBestmove = false;
  private streamSequence = 0;
  private lastTeacherEvidenceSequence = 0;
  private maximumObservedNodes = 0;
  private maximumObservedDepth = 0;
  private discardedAtOrAboveNodeCapUpdates = 0;
  private observedLowerboundUpdates = 0;
  private observedUpperboundUpdates = 0;
  private readonly capWitnesses: Array<{
    depth: number;
    nodes: number;
    sequence: number;
  }> = [];
  private terminalBestmove: "resign" | "win" | null = null;
  private buffer = "";
  private bestmove: string | null = null;

  constructor(options: UsiMultiPvAccumulatorOptions) {
    this.expectedMultiPv = positiveInteger(options.multipv, "multipv");
    if (options.requiredDepth !== undefined) {
      this.requiredDepth = positiveInteger(
        options.requiredDepth,
        "requiredDepth",
      );
    }
    if (options.nodeCap !== undefined) {
      this.nodeCap = positiveInteger(options.nodeCap, "nodeCap");
      if (this.requiredDepth === undefined)
        throw new Error("nodeCap requires requiredDepth");
      if (options.minimumCompletedDepth === undefined) {
        throw new Error(
          "dual-bound accumulator requires minimumCompletedDepth",
        );
      }
      this.minimumCompletedDepth = positiveInteger(
        options.minimumCompletedDepth,
        "minimumCompletedDepth",
      );
      if (this.minimumCompletedDepth > this.requiredDepth) {
        throw new Error("minimumCompletedDepth must not exceed requiredDepth");
      }
      if (this.expectedMultiPv !== 1) {
        throw new Error(
          "dual-bound search is limited to an independent MultiPV=1 rescore",
        );
      }
    } else if (options.minimumCompletedDepth !== undefined) {
      throw new Error("minimumCompletedDepth requires nodeCap");
    }
    this.allowTerminalMateBeforeRequiredDepth =
      options.allowTerminalMateBeforeRequiredDepth ?? false;
    if (
      this.allowTerminalMateBeforeRequiredDepth &&
      this.requiredDepth === undefined
    ) {
      throw new Error("terminal-mate fallback requires requiredDepth");
    }
    if (
      this.allowTerminalMateBeforeRequiredDepth &&
      this.expectedMultiPv !== 1
    ) {
      throw new Error(
        "terminal-mate fallback is limited to a forced MultiPV=1 search",
      );
    }
  }

  /** Feed an arbitrary stdout chunk. CRLF and lines split across chunks are supported. */
  push(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      this.consumeLine(line);
    }
  }

  private consumeLine(line: string): void {
    const trimmed = line.trim();
    if (/^bestmove(?:\s|$)/.test(trimmed)) {
      const tokens = trimmed.split(/\s+/);
      const move = tokens[1];
      if ((move === "resign" || move === "win") && tokens.length === 2) {
        this.terminalBestmove = move;
      } else if (
        move &&
        isCanonicalUsiMove(move) &&
        (tokens.length === 2 ||
          (tokens.length === 4 &&
            tokens[2] === "ponder" &&
            isCanonicalUsiMove(tokens[3])))
      ) {
        this.bestmove = move;
      } else {
        this.observedMalformedBestmove = true;
      }
      return;
    }
    if (/^info string(?:\s|$)/.test(trimmed)) return;

    // A later lowerbound/upperbound update supersedes an older exact value for
    // the same depth/rank. Merely dropping bound lines would leave that stale
    // exact value in the snapshot and could silently publish a historical
    // score. Keep a tombstone until an equally new or newer exact line arrives.
    if (trimmed.startsWith("info ")) {
      const tokens = trimmed.split(/\s+/);
      const updateDepth = integerToken(tokens, "depth");
      const updateMultiPv = multipvToken(tokens);
      const isBoundUpdate =
        tokens.includes("lowerbound") || tokens.includes("upperbound");
      const updatesTeacherEvidence =
        isBoundUpdate || tokens.includes("score") || tokens.includes("pv");
      if (updatesTeacherEvidence && updateMultiPv === null) {
        this.observedMalformedMultiPv = true;
      }
      if (
        updateDepth !== null &&
        updateDepth > 0 &&
        updateMultiPv !== null &&
        updateMultiPv > 0
      ) {
        this.observedDepths.add(updateDepth);
        if (updatesTeacherEvidence) {
          this.maxObservedDepthByRank.set(
            updateMultiPv,
            Math.max(
              this.maxObservedDepthByRank.get(updateMultiPv) ?? 0,
              updateDepth,
            ),
          );
          if (updateMultiPv > this.expectedMultiPv) {
            this.observedUnexpectedRank = true;
          }
          this.lastUpdateByRank.set(updateMultiPv, {
            depth: updateDepth,
            acceptedExact: false,
          });
        }
      }
      if (isBoundUpdate) {
        const depth = updateDepth;
        const multipv = updateMultiPv;
        const nodes = integerToken(tokens, "nodes");
        const scoreIndex = tokens.indexOf("score");
        const pvIndex = tokens.indexOf("pv");
        const scoreKind = tokens[scoreIndex + 1];
        const scoreText = tokens[scoreIndex + 2];
        const score = /^[+-]?\d+$/.test(scoreText ?? "")
          ? Number.parseInt(scoreText, 10)
          : null;
        const pv = pvIndex >= 0 ? tokens.slice(pvIndex + 1) : [];
        const hasScore = tokens.includes("score");
        const hasPv = tokens.includes("pv");
        const boundTokenCount =
          tokenCount(tokens, "lowerbound") + tokenCount(tokens, "upperbound");
        const hasMalformedBaseField =
          tokenCount(tokens, "depth") !== 1 ||
          tokenCount(tokens, "multipv") > 1 ||
          tokenCount(tokens, "nodes") > 1;
        const hasMalformedBound = boundTokenCount !== 1;
        const hasMalformedScore =
          hasScore &&
          (tokenCount(tokens, "score") !== 1 ||
            (scoreKind !== "cp" && scoreKind !== "mate") ||
            score === null ||
            !Number.isSafeInteger(score) ||
            (scoreKind === "cp" && Math.abs(score) > MAX_NON_MATE_CP));
        const hasMalformedPv =
          hasPv &&
          (tokenCount(tokens, "pv") !== 1 ||
            pv.length === 0 ||
            pv.some((move) => !isCanonicalUsiMove(move)));
        const validStructuredBound =
          hasScore &&
          hasPv &&
          !hasMalformedBaseField &&
          !hasMalformedBound &&
          depth !== null &&
          depth > 0 &&
          multipv !== null &&
          multipv > 0 &&
          nodes !== null &&
          nodes >= 0 &&
          !hasMalformedScore &&
          !hasMalformedPv &&
          scoreIndex < pvIndex;
        if (
          (hasScore || hasPv) &&
          (hasMalformedBaseField ||
            hasMalformedBound ||
            depth === null ||
            depth <= 0 ||
            multipv === null ||
            multipv <= 0 ||
            (tokens.includes("nodes") && (nodes === null || nodes < 0)) ||
            hasMalformedScore ||
            hasMalformedPv ||
            (hasScore && hasPv && scoreIndex >= pvIndex))
        ) {
          this.observedMalformedTeacherEvidence = true;
        }
        if (validStructuredBound) {
          const sequence = ++this.streamSequence;
          this.lastTeacherEvidenceSequence = sequence;
          this.maximumObservedNodes = Math.max(
            this.maximumObservedNodes,
            nodes,
          );
          this.maximumObservedDepth = Math.max(
            this.maximumObservedDepth,
            depth,
          );
          if (tokens.includes("lowerbound"))
            this.observedLowerboundUpdates += 1;
          if (tokens.includes("upperbound"))
            this.observedUpperboundUpdates += 1;
          if (
            this.nodeCap !== undefined &&
            nodes >= this.nodeCap &&
            multipv === 1
          ) {
            this.discardedAtOrAboveNodeCapUpdates += 1;
            this.capWitnesses.push({ depth, nodes, sequence });
          }
        }
        if (depth !== null && depth > 0 && multipv !== null && multipv > 0) {
          this.observedDepths.add(depth);
          const key = `${depth}:${multipv}`;
          const previousNodes = this.latestNodes.get(key);
          if (
            nodes === null ||
            nodes < 0 ||
            previousNodes === undefined ||
            nodes >= previousNodes
          ) {
            if (nodes !== null && nodes >= 0) this.latestNodes.set(key, nodes);
            // A bound line without a usable nodes field still supersedes the
            // snapshot, but it must not erase a known monotonic watermark.
            // Otherwise a later, lower-node exact line could resurrect stale
            // output from an older iteration.
            this.boundTombstones.add(key);
            this.snapshots.get(depth)?.delete(multipv);
          }
        }
        return;
      }
    }

    const parsed = parseUsiInfoLine(trimmed);
    if (!parsed) {
      if (trimmed.startsWith("info ")) {
        const tokens = trimmed.split(/\s+/);
        const depth = integerToken(tokens, "depth");
        const multipv = multipvToken(tokens);
        const isStructuredTeacherEvidence =
          tokens.includes("score") && tokens.includes("pv");
        if (isStructuredTeacherEvidence) {
          // Once an exact score/PV record is malformed, a later valid update
          // must not make the transcript publishable. Otherwise corruption or
          // overflow can be silently hidden by a repeated engine line.
          this.observedMalformedTeacherEvidence = true;
        }
        if (
          depth !== null &&
          depth > 0 &&
          multipv !== null &&
          multipv > 0 &&
          tokens.includes("score")
        ) {
          const key = `${depth}:${multipv}`;
          this.boundTombstones.add(key);
          this.snapshots.get(depth)?.delete(multipv);
        }
      }
      return;
    }

    this.observedDepths.add(parsed.depth);
    const key = `${parsed.depth}:${parsed.multipv}`;
    const previousNodes = this.latestNodes.get(key);
    if (previousNodes !== undefined && parsed.nodes < previousNodes) {
      return;
    }
    const sequence = ++this.streamSequence;
    this.lastTeacherEvidenceSequence = sequence;
    this.maximumObservedNodes = Math.max(
      this.maximumObservedNodes,
      parsed.nodes,
    );
    this.maximumObservedDepth = Math.max(
      this.maximumObservedDepth,
      parsed.depth,
    );
    if (this.nodeCap !== undefined && parsed.nodes >= this.nodeCap) {
      this.discardedAtOrAboveNodeCapUpdates += 1;
      if (parsed.multipv === 1) {
        this.capWitnesses.push({
          depth: parsed.depth,
          nodes: parsed.nodes,
          sequence,
        });
      }
      this.boundTombstones.add(key);
      this.snapshots.get(parsed.depth)?.delete(parsed.multipv);
      this.snapshotSequences.delete(key);
      return;
    }
    this.boundTombstones.delete(key);
    this.latestNodes.set(key, parsed.nodes);
    const byRank =
      this.snapshots.get(parsed.depth) ?? new Map<number, ParsedUsiPv>();
    byRank.set(parsed.multipv, parsed);
    this.snapshots.set(parsed.depth, byRank);
    this.snapshotSequences.set(key, sequence);
    this.lastUpdateByRank.set(parsed.multipv, {
      depth: parsed.depth,
      acceptedExact: true,
    });
  }

  /**
   * Finish parsing and return one complete, single-depth MultiPV snapshot.
   * Throws when the process did not produce bestmove or no depth has every rank.
   */
  finish(): UsiMultiPvResult {
    if (this.buffer.length > 0) {
      this.consumeLine(this.buffer.replace(/\r$/, ""));
      this.buffer = "";
    }
    if (this.observedMalformedBestmove) {
      throw new Error("USI search emitted a malformed bestmove");
    }
    if (this.terminalBestmove) {
      throw new Error(
        `USI search ended with terminal bestmove ${this.terminalBestmove}`,
      );
    }
    if (!this.bestmove) throw new Error("USI search ended without bestmove");
    if (this.observedMalformedMultiPv) {
      throw new Error("USI search emitted a malformed explicit multipv rank");
    }
    if (this.observedUnexpectedRank) {
      throw new Error("USI search emitted an unexpected multipv rank");
    }
    if (this.observedMalformedTeacherEvidence) {
      throw new Error(
        "USI search emitted malformed structured teacher evidence",
      );
    }
    const requiredDepthIsFinal =
      this.requiredDepth === undefined ||
      Array.from(
        { length: this.expectedMultiPv },
        (_, index) => index + 1,
      ).every((rank) => {
        const finalUpdate = this.lastUpdateByRank.get(rank);
        return (
          finalUpdate?.acceptedExact && finalUpdate.depth === this.requiredDepth
        );
      });
    if (
      !requiredDepthIsFinal &&
      !this.allowTerminalMateBeforeRequiredDepth &&
      this.nodeCap === undefined
    ) {
      const requiredDepth = this.requiredDepth as number;
      const finalExactLines = Array.from(
        { length: this.expectedMultiPv },
        (_, index) => {
          const rank = index + 1;
          const finalUpdate = this.lastUpdateByRank.get(rank);
          return finalUpdate?.acceptedExact &&
            finalUpdate.depth === requiredDepth
            ? this.snapshots.get(requiredDepth)?.get(rank)
            : undefined;
        },
      ).filter((line): line is ParsedUsiPv => line !== undefined);
      throw new UsiFixedDepthRanksIncompleteError(
        this.expectedMultiPv,
        requiredDepth,
        finalExactLines.length,
        finalExactLines.filter((line) => line.scoreKind === "cp").length,
        finalExactLines.filter((line) => line.scoreKind === "mate").length,
      );
    }

    const depths =
      this.nodeCap !== undefined
        ? [...this.snapshots.keys()]
            .filter(
              (depth) =>
                depth >= (this.minimumCompletedDepth as number) &&
                depth <= (this.requiredDepth as number),
            )
            .sort((a, b) => b - a)
        : this.requiredDepth !== undefined
          ? [this.requiredDepth]
          : [...this.snapshots.keys()].sort((a, b) => b - a);

    const resultAtDepth = (
      depth: number,
      requireMate: boolean,
    ): UsiMultiPvResult | null => {
      const byRank = this.snapshots.get(depth);
      if (!byRank) return null;
      const lines: ParsedUsiPv[] = [];
      for (let rank = 1; rank <= this.expectedMultiPv; rank++) {
        const line = byRank.get(rank);
        if (!line) break;
        lines.push(line);
      }
      if (lines.length !== this.expectedMultiPv) return null;
      if (requireMate && lines.some((line) => line.scoreKind !== "mate"))
        return null;

      const moves = new Set(lines.map((line) => line.move));
      if (moves.size !== lines.length) {
        throw new Error(`duplicate PV move at completed depth ${depth}`);
      }
      // A published teacher snapshot must be the engine's final choice, not a
      // historical iteration. This is required for fixed-node and fixed-depth
      // searches alike; a mismatch fails closed instead of becoming a label.
      if (lines[0].move !== this.bestmove) {
        throw new Error(
          `bestmove ${this.bestmove} does not match completed PV1 ${lines[0].move} at depth ${depth}`,
        );
      }

      return {
        depth,
        lines,
        bestmove: this.bestmove,
        observedNodes: Math.max(...lines.map((line) => line.nodes)),
      };
    };

    if (this.nodeCap !== undefined) {
      const requestedDepth = this.requiredDepth as number;
      const minimumCompletedDepth = this.minimumCompletedDepth as number;
      if (this.maximumObservedDepth > requestedDepth) {
        throw new Error(
          "dual-bound search emitted teacher evidence beyond its requested depth",
        );
      }
      for (const depth of depths) {
        const selected = resultAtDepth(depth, false);
        if (!selected) continue;
        const selectedSequence = this.snapshotSequences.get(`${depth}:1`);
        if (selectedSequence === undefined) continue;

        let terminationReason:
          UsiDualBoundResultMetadata["terminationReason"] | null = null;
        let capWitness:
          { depth: number; nodes: number; sequence: number } | undefined;
        if (
          depth === requestedDepth &&
          selectedSequence === this.lastTeacherEvidenceSequence
        ) {
          terminationReason = "depth";
        } else if (
          this.allowTerminalMateBeforeRequiredDepth &&
          selected.lines.every((line) => line.scoreKind === "mate") &&
          selectedSequence === this.lastTeacherEvidenceSequence
        ) {
          terminationReason = "terminal-mate";
        } else {
          capWitness = this.capWitnesses.find(
            (witness) =>
              witness.sequence === this.lastTeacherEvidenceSequence &&
              witness.sequence > selectedSequence &&
              witness.depth > depth &&
              witness.depth <= requestedDepth &&
              witness.nodes >= this.nodeCap!,
          );
          if (capWitness) terminationReason = "node-cap";
        }
        if (!terminationReason) continue;

        return {
          ...selected,
          dualBound: {
            terminationReason,
            requestedDepth,
            nodeCap: this.nodeCap,
            minimumCompletedDepth,
            deepestCompleteExactDepth: depth,
            selectedSnapshotNodes: selected.observedNodes,
            maximumObservedNodes: this.maximumObservedNodes,
            maximumObservedDepth: this.maximumObservedDepth,
            selectedSnapshotBound: "exact",
            discardedAtOrAboveNodeCapUpdates:
              this.discardedAtOrAboveNodeCapUpdates,
            observedLowerboundUpdates: this.observedLowerboundUpdates,
            observedUpperboundUpdates: this.observedUpperboundUpdates,
            capWitnessDepth: capWitness?.depth ?? null,
            capWitnessNodes: capWitness?.nodes ?? null,
            selectedPrecedesWitness: capWitness !== undefined,
            completedIterationWitnessDepth: depth,
          },
        };
      }

      const observed =
        [...this.observedDepths].sort((a, b) => a - b).join(", ") || "none";
      throw new Error(
        `incomplete MultiPV: wanted one exact rank between depth ${minimumCompletedDepth} and ${requestedDepth}; observed depths: ${observed}`,
      );
    }

    for (const depth of depths) {
      if (!requiredDepthIsFinal) break;
      const result = resultAtDepth(depth, false);
      if (result) return result;
    }

    if (
      this.allowTerminalMateBeforeRequiredDepth &&
      this.requiredDepth !== undefined &&
      this.observedDepths.size > 0
    ) {
      // Only the deepest/final observed iteration may justify early completion.
      // An intervening cp or bound update keeps the search fail-closed.
      const finalRankOneUpdate = this.lastUpdateByRank.get(1);
      const maxRankOneDepth = this.maxObservedDepthByRank.get(1);
      if (
        !this.observedUnexpectedRank &&
        finalRankOneUpdate?.acceptedExact &&
        finalRankOneUpdate.depth === maxRankOneDepth &&
        finalRankOneUpdate.depth < this.requiredDepth
      ) {
        const terminalMate = resultAtDepth(finalRankOneUpdate.depth, true);
        if (terminalMate) return terminalMate;
      }
    }

    const observed =
      [...this.observedDepths].sort((a, b) => a - b).join(", ") || "none";
    const wanted =
      this.requiredDepth === undefined
        ? `${this.expectedMultiPv} ranks at one depth`
        : `${this.expectedMultiPv} ranks at depth ${this.requiredDepth}`;
    throw new Error(
      `incomplete MultiPV: wanted ${wanted}; observed depths: ${observed}`,
    );
  }
}
