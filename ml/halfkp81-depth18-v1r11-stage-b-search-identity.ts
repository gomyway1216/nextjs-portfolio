import type { UsiMultiPvResult } from "./usi-multipv";

export interface Halfkp81V1R11Depth18SearchIdentity {
  readonly bestmove: string;
  readonly depth: 18;
  readonly moves: readonly [string];
  readonly observed_nodes: number;
  readonly requested_multipv: 1;
  readonly scores: readonly Readonly<{
    cp: number;
    move: string;
    score_kind: "cp";
  }>[];
}

/** Parse the exact completed depth-18 USI result used by Stage B. */
export function parseHalfkp81V1R11Depth18SearchIdentity(
  result: Readonly<UsiMultiPvResult>,
  move: string,
): Readonly<Halfkp81V1R11Depth18SearchIdentity> {
  const line = result.lines[0];
  if (
    result.depth !== 18 ||
    result.bestmove !== move ||
    result.lines.length !== 1 ||
    line === undefined ||
    line.multipv !== 1 ||
    line.move !== move ||
    line.scoreKind !== "cp" ||
    !Number.isSafeInteger(line.cp) ||
    !Number.isSafeInteger(result.observedNodes) ||
    result.observedNodes < 1
  ) {
    throw new Error(`fixed Stage-B exact depth18 search differs for ${move}`);
  }
  return Object.freeze({
    bestmove: move,
    depth: 18 as const,
    moves: Object.freeze([move] as const),
    observed_nodes: result.observedNodes,
    requested_multipv: 1 as const,
    scores: Object.freeze([
      Object.freeze({ cp: line.cp, move, score_kind: "cp" as const }),
    ] as const),
  });
}
