import { createHash } from "node:crypto";

const SHA256_RE = /^[0-9a-f]{64}$/u;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const CANONICAL_USI_RE = /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/u;
const CANDIDATE_DIGEST_DOMAIN =
  "shogi-halfkp81-depth18-v1r11-stage-b-candidate-order-v1\0";
const V1R11_ENGINE_BINARY_SHA256 =
  "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1";
const PS_START_TOKEN_RE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/u;

export const HALFKP81_V1R11_CANDIDATE_ORDER_PARENT_ID =
  "sha256:3912340ccf5a16248d927cb991ccc62bc6bef02583442ab8824d22edfbf38e18" as const;

export const HALFKP81_V1R11_PATHOLOGICAL_PARENT_ID =
  "sha256:622377e74345bfcbe509b903ae89e37dfec48e493db0331780b5423382d926a1" as const;
export const HALFKP81_V1R11_PATHOLOGICAL_MOVE = "G*6a" as const;
export const HALFKP81_V1R11_PATHOLOGICAL_HASH8192_IDENTITY = Object.freeze({
  bestmove: HALFKP81_V1R11_PATHOLOGICAL_MOVE,
  depth: 18 as const,
  moves: Object.freeze([HALFKP81_V1R11_PATHOLOGICAL_MOVE] as const),
  observed_nodes: 433_851_102,
  requested_multipv: 1 as const,
  scores: Object.freeze([
    Object.freeze({
      cp: -35_281,
      move: HALFKP81_V1R11_PATHOLOGICAL_MOVE,
      score_kind: "cp" as const,
    }),
  ] as const),
});

export interface Halfkp81V1R11StageBParent {
  readonly parent_id: string;
  readonly parent_sfen: string;
  readonly played_move: string;
  readonly legal_move_count: number;
}

export interface Halfkp81V1R11StageBSearchScore {
  readonly cp: number;
  readonly move: string;
  readonly score_kind: "cp";
}

export interface Halfkp81V1R11StageBSearchIdentity {
  readonly bestmove: string;
  readonly depth: 18;
  readonly moves: readonly [string];
  readonly observed_nodes: number;
  readonly requested_multipv: 1;
  readonly scores: readonly [Readonly<Halfkp81V1R11StageBSearchScore>];
}

export interface Halfkp81V1R11StageBProposal {
  readonly depth: 16;
  readonly moves: readonly string[];
  readonly requested_multipv: number;
}

export interface Halfkp81V1R11StageBEngineLane {
  readonly hash_mib: 512 | 8192;
  propose(
    parent: Readonly<Halfkp81V1R11StageBParent>,
  ): Promise<Readonly<Halfkp81V1R11StageBProposal>>;
  rescore(
    parent: Readonly<Halfkp81V1R11StageBParent>,
    move: string,
  ): Promise<Readonly<Halfkp81V1R11StageBSearchIdentity>>;
  close(): Promise<void>;
}

export interface Halfkp81V1R11StageBEngineBoundary {
  openLane(hashMib: 512 | 8192): Promise<Halfkp81V1R11StageBEngineLane>;
  runAuthenticatedMixedLoadProbe?(): Promise<
    readonly Readonly<Halfkp81V1R11MixedLoadProcessObservation>[]
  >;
}

export interface Halfkp81V1R11MixedLoadEngineObservation {
  readonly slot_id: string;
  readonly class: "normal" | "fallback";
  readonly hash_mib: 512 | 8192;
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
  readonly start_token: string;
  readonly state: string;
  readonly command: string;
  readonly engine_binary_sha256: string;
}

export interface Halfkp81V1R11MixedLoadProcessObservation {
  readonly schema: "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-mixed-load-process-observation-v1";
  readonly status: "authenticated-live-process-snapshot-no-formal-authority";
  readonly observation_sequence: number;
  readonly observed_at_utc: string;
  readonly runner_pid: number;
  readonly runner_pgid: number;
  readonly runner_start_token: string;
  readonly active_engines: readonly Readonly<Halfkp81V1R11MixedLoadEngineObservation>[];
  readonly normal_active_recomputed: number;
  readonly fallback_active_recomputed: number;
}

export interface Halfkp81V1R11Known10Probe {
  readonly parent_id: string;
  readonly move: string;
  readonly result_identity: Readonly<Halfkp81V1R11StageBSearchIdentity>;
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("Stage-B canonical JSON rejects this number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort(compareBytewise)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(`Stage-B canonical JSON rejects ${typeof value}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  if (
    canonicalJson(Object.keys(value).sort(compareBytewise)) !==
    canonicalJson([...expected].sort(compareBytewise))
  ) {
    throw new Error(`${label} keys differ`);
  }
}

function candidateMoves(
  proposal: Readonly<Halfkp81V1R11StageBProposal>,
  parent: Readonly<Halfkp81V1R11StageBParent>,
): readonly string[] {
  if (
    proposal.depth !== 16 ||
    !Number.isSafeInteger(proposal.requested_multipv) ||
    proposal.requested_multipv !== Math.min(12, parent.legal_move_count) ||
    proposal.moves.length !== proposal.requested_multipv ||
    proposal.moves.some((move) => !CANONICAL_USI_RE.test(move)) ||
    new Set(proposal.moves).size !== proposal.moves.length ||
    !CANONICAL_USI_RE.test(parent.played_move)
  ) {
    throw new Error("candidate-order proposal differs");
  }
  return Object.freeze(
    [...new Set([...proposal.moves, parent.played_move])].sort(compareBytewise),
  );
}

function assertParent(
  parent: Readonly<Halfkp81V1R11StageBParent>,
  expectedId: string,
  label: string,
): void {
  if (
    parent.parent_id !== expectedId ||
    !SEMANTIC_ID_RE.test(parent.parent_id) ||
    typeof parent.parent_sfen !== "string" ||
    parent.parent_sfen.length < 1 ||
    !CANONICAL_USI_RE.test(parent.played_move) ||
    !Number.isSafeInteger(parent.legal_move_count) ||
    parent.legal_move_count < 2 ||
    parent.legal_move_count > 593
  ) {
    throw new Error(`${label} parent differs`);
  }
}

function assertSearchIdentity(
  value: Readonly<Halfkp81V1R11StageBSearchIdentity>,
  parentId: string,
  move: string,
  label: string,
): void {
  const record = value as unknown as Readonly<Record<string, unknown>>;
  exactKeys(
    record,
    [
      "bestmove",
      "depth",
      "moves",
      "observed_nodes",
      "requested_multipv",
      "scores",
    ],
    label,
  );
  if (
    value.bestmove !== move ||
    value.depth !== 18 ||
    canonicalJson(value.moves) !== canonicalJson([move]) ||
    !Number.isSafeInteger(value.observed_nodes) ||
    value.observed_nodes < 1 ||
    value.requested_multipv !== 1 ||
    value.scores.length !== 1
  ) {
    throw new Error(`${label} search identity differs for ${parentId}`);
  }
  const score = value.scores[0];
  exactKeys(
    score as unknown as Readonly<Record<string, unknown>>,
    ["cp", "move", "score_kind"],
    `${label} score`,
  );
  if (
    !Number.isSafeInteger(score.cp) ||
    score.move !== move ||
    score.score_kind !== "cp"
  ) {
    throw new Error(`${label} score differs for ${parentId}`);
  }
}

function candidateOrderDigest(moves: readonly string[]): string {
  return sha256(`${CANDIDATE_DIGEST_DOMAIN}${canonicalJson(moves)}`);
}

async function closeLane(
  lane: Halfkp81V1R11StageBEngineLane | undefined,
  primary: unknown,
): Promise<never> {
  if (lane === undefined) throw primary;
  try {
    await lane.close();
  } catch (cleanup) {
    throw new AggregateError(
      [primary, cleanup],
      "Stage-B gate and engine cleanup both failed",
    );
  }
  throw primary;
}

async function rescoreCanonicalCandidateOrder(
  lane: Halfkp81V1R11StageBEngineLane,
  parent: Readonly<Halfkp81V1R11StageBParent>,
  moves: readonly string[],
  label: string,
): Promise<readonly string[]> {
  const published: string[] = [];
  for (const move of moves) {
    const result = await lane.rescore(parent, move);
    assertSearchIdentity(result, parent.parent_id, move, `${label} ${move}`);
    published.push(move);
  }
  if (canonicalJson(published) !== canonicalJson(moves)) {
    throw new Error(`${label} publication order differs`);
  }
  return Object.freeze(published);
}

/**
 * Engine-facing gate core. The production CLI owns the fixed boundary; tests
 * may supply a fake boundary here without creating any authority artifact.
 */
export async function runHalfkp81V1R11CandidateOrderGateCore(
  boundary: Readonly<Halfkp81V1R11StageBEngineBoundary>,
  parent: Readonly<Halfkp81V1R11StageBParent>,
): Promise<Readonly<Record<string, unknown>>> {
  assertParent(
    parent,
    HALFKP81_V1R11_CANDIDATE_ORDER_PARENT_ID,
    "candidate-order",
  );
  let normal: Halfkp81V1R11StageBEngineLane | undefined;
  let fallback: Halfkp81V1R11StageBEngineLane | undefined;
  try {
    normal = await boundary.openLane(512);
    if (normal.hash_mib !== 512) {
      throw new Error("candidate-order normal Hash differs");
    }
    const fixedCandidates = candidateMoves(
      await normal.propose(parent),
      parent,
    );
    const normalOrder = await rescoreCanonicalCandidateOrder(
      normal,
      parent,
      fixedCandidates,
      "candidate-order normal",
    );
    await normal.close();
    normal = undefined;

    fallback = await boundary.openLane(8192);
    if (fallback.hash_mib !== 8192) {
      throw new Error("candidate-order fallback Hash differs");
    }
    const fallbackOrder = await rescoreCanonicalCandidateOrder(
      fallback,
      parent,
      fixedCandidates,
      "candidate-order fallback",
    );
    await fallback.close();
    fallback = undefined;

    const candidateDigest = candidateOrderDigest(fixedCandidates);
    const normalDigest = candidateOrderDigest(normalOrder);
    const fallbackDigest = candidateOrderDigest(fallbackOrder);
    if (
      !SHA256_RE.test(candidateDigest) ||
      candidateDigest !== normalDigest ||
      candidateDigest !== fallbackDigest
    ) {
      throw new Error("candidate-order digest differs");
    }
    return Object.freeze({
      parents: 1,
      candidate_set: `sha256:${candidateDigest}`,
      normal_candidate_order_digest: normalDigest,
      fallback_candidate_order_digest: fallbackDigest,
      publication_order_digest: candidateDigest,
      mismatches: 0,
      technical_faults: 0,
    });
  } catch (error) {
    if (fallback !== undefined) await closeLane(fallback, error);
    if (normal !== undefined) await closeLane(normal, error);
    throw error;
  }
}

export const HALFKP81_V1R11_KNOWN10_EXPECTED = Object.freeze([
  Object.freeze({
    parent_id:
      "sha256:5a0784bfa36f2961049c1eae3ca13fe041d089abad1228f9d935f48723826dae",
    move: "7c6d",
    result_identity: Object.freeze({
      bestmove: "7c6d",
      depth: 18 as const,
      moves: Object.freeze(["7c6d"] as const),
      observed_nodes: 271_896_277,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: -3035, move: "7c6d", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
  Object.freeze({
    parent_id:
      "sha256:5a0784bfa36f2961049c1eae3ca13fe041d089abad1228f9d935f48723826dae",
    move: "7c8c",
    result_identity: Object.freeze({
      bestmove: "7c8c",
      depth: 18 as const,
      moves: Object.freeze(["7c8c"] as const),
      observed_nodes: 133_484_979,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: -2673, move: "7c8c", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
  Object.freeze({
    parent_id:
      "sha256:8ce4ae0bd8bf7c9f92d3514e61b39034700c278ea41b5ac258b336cc5d37c464",
    move: "2a2b",
    result_identity: Object.freeze({
      bestmove: "2a2b",
      depth: 18 as const,
      moves: Object.freeze(["2a2b"] as const),
      observed_nodes: 209_708_969,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: -2953, move: "2a2b", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
  Object.freeze({
    parent_id:
      "sha256:c8d465ad0ca1b48a9deb79ca69d78ddc3ce0ef798dae926f8983c566e1253548",
    move: "5b6a",
    result_identity: Object.freeze({
      bestmove: "5b6a",
      depth: 18 as const,
      moves: Object.freeze(["5b6a"] as const),
      observed_nodes: 115_883_149,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: -3120, move: "5b6a", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
  Object.freeze({
    parent_id:
      "sha256:b5166b8310d17084f74e91f32abf22d12e1c918a0d03ec00badb484e6816d16b",
    move: "6b7a",
    result_identity: Object.freeze({
      bestmove: "6b7a",
      depth: 18 as const,
      moves: Object.freeze(["6b7a"] as const),
      observed_nodes: 182_646_685,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: -3101, move: "6b7a", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
  Object.freeze({
    parent_id:
      "sha256:1dc09755551f89d26b24b761360d3745c7b0ace0cbfed17f9ccaba9d4c6a93ac",
    move: "P*6f",
    result_identity: Object.freeze({
      bestmove: "P*6f",
      depth: 18 as const,
      moves: Object.freeze(["P*6f"] as const),
      observed_nodes: 126_628_563,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: -1334, move: "P*6f", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
  Object.freeze({
    parent_id:
      "sha256:683f77dc262696d3e637592a47525c51a3c03e2e2e3137c41b87eee8e388e7c6",
    move: "8e8i+",
    result_identity: Object.freeze({
      bestmove: "8e8i+",
      depth: 18 as const,
      moves: Object.freeze(["8e8i+"] as const),
      observed_nodes: 160_771_360,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: 2805, move: "8e8i+", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
  Object.freeze({
    parent_id:
      "sha256:b70979181f66fc8960a5817a271f9422d659f0cac1213c431ef9d76bd8a25726",
    move: "2a1c",
    result_identity: Object.freeze({
      bestmove: "2a1c",
      depth: 18 as const,
      moves: Object.freeze(["2a1c"] as const),
      observed_nodes: 699_096_938,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: -35281, move: "2a1c", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
  Object.freeze({
    parent_id:
      "sha256:64eb0e5a8c045e1145c7951374b00ea6683d8a18c877afc157f0b0a0525f67c5",
    move: "6a7a",
    result_identity: Object.freeze({
      bestmove: "6a7a",
      depth: 18 as const,
      moves: Object.freeze(["6a7a"] as const),
      observed_nodes: 391_910_345,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: -3224, move: "6a7a", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
  Object.freeze({
    parent_id:
      "sha256:64eb0e5a8c045e1145c7951374b00ea6683d8a18c877afc157f0b0a0525f67c5",
    move: "6a7b",
    result_identity: Object.freeze({
      bestmove: "6a7b",
      depth: 18 as const,
      moves: Object.freeze(["6a7b"] as const),
      observed_nodes: 1_513_852_309,
      requested_multipv: 1 as const,
      scores: Object.freeze([
        Object.freeze({ cp: -3453, move: "6a7b", score_kind: "cp" as const }),
      ] as const),
    }),
  }),
] satisfies readonly Readonly<Halfkp81V1R11Known10Probe>[]);

export async function runHalfkp81V1R11Known10ProbeCore(
  boundary: Readonly<Halfkp81V1R11StageBEngineBoundary>,
  parents: ReadonlyMap<string, Readonly<Halfkp81V1R11StageBParent>>,
): Promise<Readonly<Record<string, unknown>>> {
  let lane: Halfkp81V1R11StageBEngineLane | undefined;
  try {
    lane = await boundary.openLane(512);
    if (lane.hash_mib !== 512) {
      throw new Error("known10 normal Hash differs");
    }
    const actual: Halfkp81V1R11Known10Probe[] = [];
    for (const expected of HALFKP81_V1R11_KNOWN10_EXPECTED) {
      const parent = parents.get(expected.parent_id);
      if (parent === undefined) {
        throw new Error(`known10 parent ${expected.parent_id} is missing`);
      }
      assertParent(parent, expected.parent_id, "known10");
      const result = await lane.rescore(parent, expected.move);
      assertSearchIdentity(
        result,
        expected.parent_id,
        expected.move,
        "known10 actual",
      );
      actual.push(
        Object.freeze({
          parent_id: expected.parent_id,
          move: expected.move,
          result_identity: result,
        }),
      );
    }
    await lane.close();
    lane = undefined;
    if (
      canonicalJson(actual) !== canonicalJson(HALFKP81_V1R11_KNOWN10_EXPECTED)
    ) {
      throw new Error("known10 exact depth18 identities differ");
    }
    return Object.freeze({
      parents: new Set(
        HALFKP81_V1R11_KNOWN10_EXPECTED.map((row) => row.parent_id),
      ).size,
      moves: HALFKP81_V1R11_KNOWN10_EXPECTED.length,
      fixed_expected_identities: HALFKP81_V1R11_KNOWN10_EXPECTED,
      actual_exact_depth18_identities: Object.freeze(actual),
      mismatches: 0,
      technical_faults: 0,
    });
  } catch (error) {
    if (lane !== undefined) await closeLane(lane, error);
    throw error;
  }
}

function validateMixedLoadObservation(
  value: Readonly<Halfkp81V1R11MixedLoadProcessObservation>,
  offset: number,
  previousObservedAt: number,
  runnerIdentity: string | null,
): Readonly<{ observedAt: number; runnerIdentity: string }> {
  exactKeys(
    value as unknown as Readonly<Record<string, unknown>>,
    [
      "schema",
      "status",
      "observation_sequence",
      "observed_at_utc",
      "runner_pid",
      "runner_pgid",
      "runner_start_token",
      "active_engines",
      "normal_active_recomputed",
      "fallback_active_recomputed",
    ],
    `mixed-load observation ${offset + 1}`,
  );
  const observedAt = Date.parse(value.observed_at_utc);
  const currentRunner = `${value.runner_pid}\0${value.runner_pgid}\0${value.runner_start_token}`;
  if (
    value.schema !==
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-mixed-load-process-observation-v1" ||
    value.status !==
      "authenticated-live-process-snapshot-no-formal-authority" ||
    value.observation_sequence !== offset + 1 ||
    !Number.isFinite(observedAt) ||
    new Date(observedAt).toISOString() !== value.observed_at_utc ||
    observedAt <= previousObservedAt ||
    !Number.isSafeInteger(value.runner_pid) ||
    value.runner_pid < 1 ||
    value.runner_pgid !== value.runner_pid ||
    !PS_START_TOKEN_RE.test(value.runner_start_token) ||
    (runnerIdentity !== null && runnerIdentity !== currentRunner) ||
    value.active_engines.length !== 10
  ) {
    throw new Error(`mixed-load observation ${offset + 1} differs`);
  }
  const expectedSlots = [
    "fallback-01",
    "fallback-02",
    ...Array.from(
      { length: 8 },
      (_, index) => `normal-${String(index + 1).padStart(2, "0")}`,
    ),
  ];
  let normal = 0;
  let fallback = 0;
  let previousSortKey: string | null = null;
  const slots = new Set<string>();
  const pids = new Set<number>();
  value.active_engines.forEach((engine, index) => {
    exactKeys(
      engine as unknown as Readonly<Record<string, unknown>>,
      [
        "slot_id",
        "class",
        "hash_mib",
        "pid",
        "ppid",
        "pgid",
        "start_token",
        "state",
        "command",
        "engine_binary_sha256",
      ],
      `mixed-load observation ${offset + 1} engine ${index + 1}`,
    );
    const expectedHash = engine.class === "normal" ? 512 : 8192;
    const sortKey = `${engine.class}\0${engine.slot_id}`;
    if (
      (engine.class !== "normal" && engine.class !== "fallback") ||
      engine.hash_mib !== expectedHash ||
      !expectedSlots.includes(engine.slot_id) ||
      slots.has(engine.slot_id) ||
      !Number.isSafeInteger(engine.pid) ||
      engine.pid < 1 ||
      pids.has(engine.pid) ||
      engine.ppid !== value.runner_pid ||
      engine.pgid !== value.runner_pgid ||
      !PS_START_TOKEN_RE.test(engine.start_token) ||
      typeof engine.state !== "string" ||
      !/^[A-Ya-y][A-Za-z+<Nsn]*$/u.test(engine.state) ||
      !engine.command.startsWith("/") ||
      !engine.command.endsWith("/YaneuraOu-authenticated-snapshot") ||
      engine.engine_binary_sha256 !== V1R11_ENGINE_BINARY_SHA256 ||
      (previousSortKey !== null && compareBytewise(previousSortKey, sortKey) >= 0)
    ) {
      throw new Error(
        `mixed-load observation ${offset + 1} engine ${index + 1} differs`,
      );
    }
    slots.add(engine.slot_id);
    pids.add(engine.pid);
    previousSortKey = sortKey;
    if (engine.class === "normal") normal += 1;
    else fallback += 1;
  });
  if (
    canonicalJson([...slots].sort(compareBytewise)) !==
      canonicalJson([...expectedSlots].sort(compareBytewise)) ||
    normal !== 8 ||
    fallback !== 2 ||
    value.normal_active_recomputed !== normal ||
    value.fallback_active_recomputed !== fallback
  ) {
    throw new Error(`mixed-load observation ${offset + 1} counts differ`);
  }
  return Object.freeze({ observedAt, runnerIdentity: currentRunner });
}

export async function runHalfkp81V1R11MixedLoadGateCore(
  boundary: Readonly<Halfkp81V1R11StageBEngineBoundary>,
): Promise<Readonly<Record<string, unknown>>> {
  if (typeof boundary.runAuthenticatedMixedLoadProbe !== "function") {
    throw new Error("mixed-load authenticated concurrent boundary is missing");
  }
  const observations = Object.freeze([
    ...(await boundary.runAuthenticatedMixedLoadProbe()),
  ]);
  if (observations.length < 2) {
    throw new Error("mixed-load requires at least two live observations");
  }
  let previousObservedAt = -1;
  let runnerIdentity: string | null = null;
  let lifecycle: string | null = null;
  for (const [offset, observation] of observations.entries()) {
    const validated = validateMixedLoadObservation(
      observation,
      offset,
      previousObservedAt,
      runnerIdentity,
    );
    const currentLifecycle = canonicalJson(
      observation.active_engines.map((engine) => ({
        slot_id: engine.slot_id,
        pid: engine.pid,
        ppid: engine.ppid,
        pgid: engine.pgid,
        start_token: engine.start_token,
        command: engine.command,
      })),
    );
    if (lifecycle !== null && lifecycle !== currentLifecycle) {
      throw new Error("mixed-load engine lifecycle changed between observations");
    }
    lifecycle = currentLifecycle;
    previousObservedAt = validated.observedAt;
    runnerIdentity = validated.runnerIdentity;
  }
  return Object.freeze({
    normal_engines: 8,
    normal_hash_mib_each: 512,
    fallback_engines: 2,
    fallback_hash_mib_each: 8192,
    maximum_normal_active: 8,
    maximum_fallback_active: 2,
    process_observations: observations,
    technical_faults: 0,
  });
}

export async function runHalfkp81V1R11PathologicalFallbackGateCore(
  boundary: Readonly<Halfkp81V1R11StageBEngineBoundary>,
  parent: Readonly<Halfkp81V1R11StageBParent>,
): Promise<Readonly<Record<string, unknown>>> {
  assertParent(
    parent,
    HALFKP81_V1R11_PATHOLOGICAL_PARENT_ID,
    "pathological-fallback",
  );
  let normal: Halfkp81V1R11StageBEngineLane | undefined;
  let fallback: Halfkp81V1R11StageBEngineLane | undefined;
  try {
    normal = await boundary.openLane(512);
    if (normal.hash_mib !== 512) {
      throw new Error("pathological normal Hash differs");
    }
    // Routing is fixed by the preregistered semantic parent. The normal lane
    // must not execute or publish a partial/capped depth-18 row for it.
    await normal.close();
    normal = undefined;

    fallback = await boundary.openLane(8192);
    if (fallback.hash_mib !== 8192) {
      throw new Error("pathological fallback Hash differs");
    }
    const actual = await fallback.rescore(
      parent,
      HALFKP81_V1R11_PATHOLOGICAL_MOVE,
    );
    assertSearchIdentity(
      actual,
      parent.parent_id,
      HALFKP81_V1R11_PATHOLOGICAL_MOVE,
      "pathological Hash8192",
    );
    await fallback.close();
    fallback = undefined;
    if (
      canonicalJson(actual) !==
      canonicalJson(HALFKP81_V1R11_PATHOLOGICAL_HASH8192_IDENTITY)
    ) {
      throw new Error("pathological Hash8192 exact identity differs");
    }
    return Object.freeze({
      parent_id: HALFKP81_V1R11_PATHOLOGICAL_PARENT_ID,
      normal_partial_rows_published: 0,
      capped_rows_published: 0,
      fallback_exact_depth18_identity: actual,
      fixed_hash8192_identity:
        HALFKP81_V1R11_PATHOLOGICAL_HASH8192_IDENTITY,
      technical_faults: 0,
    });
  } catch (error) {
    if (fallback !== undefined) await closeLane(fallback, error);
    if (normal !== undefined) await closeLane(normal, error);
    throw error;
  }
}
