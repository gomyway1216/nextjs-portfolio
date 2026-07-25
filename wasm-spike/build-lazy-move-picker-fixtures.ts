/**
 * Build the formal v2 fixed-depth fixture without reusing any v1 tuning
 * position or source game.
 *
 * The three source paths are intentionally mandatory. Their bytes and SHA-256
 * identities are pinned below, so a similarly named replacement cannot
 * silently change the formal fixture.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/build-lazy-move-picker-fixtures.ts \
 *     --opening-holdout /path/to/opening-holdout-4k.jsonl \
 *     --browser-train /path/to/browser-confusion/train.jsonl \
 *     --browser-val /path/to/browser-confusion/val.jsonl
 */

import { createHash } from "node:crypto";
import {
  createReadStream,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";

import { positionFromSfen, rulesCompleteLegalMoves } from "../ml/shogi-sfen";
import { toSfen } from "../ml/shogi-sfen-codec";
import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";

type Category = "opening" | "middlegame" | "dropHeavy" | "checkEvasion";
type SourceRole = "openingHoldout" | "browserTrain" | "browserValidation";

interface Identity {
  readonly bytes: number;
  readonly sha256: string;
}

interface ExpectedInput extends Identity {
  readonly cliFlag: string;
  readonly source: string;
}

interface RawCandidate {
  readonly sfen: string;
  readonly tesu: number;
  readonly sourceRole: SourceRole;
  readonly source: string;
  readonly sourceGame: string | null;
}

interface Candidate extends RawCandidate {
  readonly handCount: number;
  readonly legalMoves: number;
  readonly legalDrops: number;
  readonly inCheck: boolean;
}

interface SelectedCase extends Candidate {
  readonly id: string;
  readonly category: Category;
  readonly selectionSha256: string;
}

interface V1Fixture {
  readonly cases: readonly {
    readonly sfen: string;
    readonly sourceGame?: string | null;
  }[];
}

const EXPECTED_INPUTS: Readonly<Record<SourceRole, ExpectedInput>> = {
  openingHoldout: {
    cliFlag: "--opening-holdout",
    source: "opening-holdout-4k",
    bytes: 538_870,
    sha256: "1f8d91f286eec160eb1141ba5adfd36b842af12ceec37aa4f959038a60969ce6",
  },
  browserTrain: {
    cliFlag: "--browser-train",
    source: "browser-confusion-depth12-batch3-v2-train",
    bytes: 97_820_193,
    sha256: "a592f7ece38172a0e2a8ee865359349555d8a3dc31eb6f6697411974d2dd3d1e",
  },
  browserValidation: {
    cliFlag: "--browser-val",
    source: "browser-confusion-depth12-batch3-v2-validation",
    bytes: 50_255_278,
    sha256: "0d3973ea7df7c44a5e863947b358b15dcf0e249dd26bbf0e7ef26dfff8bef3ca",
  },
};

const EXPECTED_V1: Identity = {
  bytes: 29_380,
  sha256: "59c1a68bb5515447211ad57ec9cf1a27c8933b95656d78c8e7e8f213a130bdfc",
};

const CATEGORY_ORDER: readonly Category[] = [
  "opening",
  "middlegame",
  "dropHeavy",
  "checkEvasion",
];
const CASES_PER_CATEGORY = 16;
const DROP_HEAVY_MIN_HAND = 6;
const DROP_HEAVY_MIN_LEGAL_DROPS = 46;
const SELECTION_DOMAIN = "lazy-move-picker-formal-fixture-v2";
const SELECTION_FORMULA =
  "sha256(utf8(domain + NUL + category + NUL + canonicalSfen + NUL + (sourceGame ?? '-')))";

function requiredValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} is required and must name the pinned input file`);
  }
  return resolve(value);
}

function optionalValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} requires a value`);
  return resolve(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  row: Record<string, unknown>,
  field: string,
  context: string,
): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context}.${field} must be a non-empty string`);
  }
  return value;
}

function requiredInteger(
  row: Record<string, unknown>,
  field: string,
  context: string,
): number {
  const value = row[field];
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${context}.${field} must be a non-negative integer`);
  }
  return value as number;
}

async function identityOfFile(path: string): Promise<Identity> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = chunk as Buffer;
    bytes += buffer.byteLength;
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function identityOfBytes(bytes: Uint8Array): Identity {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function requireIdentity(
  label: string,
  actual: Identity,
  expected: Identity,
): void {
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(
      `${label} identity mismatch: expected ${expected.bytes}/${expected.sha256}, ` +
        `got ${actual.bytes}/${actual.sha256}`,
    );
  }
}

async function* jsonLines(
  path: string,
): AsyncGenerator<{ row: Record<string, unknown>; lineNumber: number }> {
  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (line.trim().length === 0) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `${path}:${lineNumber} is not JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (!isRecord(value)) {
      throw new Error(`${path}:${lineNumber} must contain a JSON object`);
    }
    yield { row: value, lineNumber };
  }
}

function canonicalMetadata(raw: RawCandidate): Candidate {
  const parsed = positionFromSfen(raw.sfen);
  const canonicalSfen = toSfen(parsed.position, parsed.moveNumber);
  if (canonicalSfen !== raw.sfen) {
    throw new Error(`non-canonical SFEN from ${raw.source}: ${raw.sfen}`);
  }
  const tesu = parsed.moveNumber - 1;
  if (raw.tesu !== tesu) {
    throw new Error(
      `SFEN move number disagrees with tesu for ${raw.sfen}: ${raw.tesu} != ${tesu}`,
    );
  }
  const legal = rulesCompleteLegalMoves(parsed.position);
  let handCount = 0;
  for (const count of parsed.position.hand) handCount += count;
  return {
    ...raw,
    handCount,
    legalMoves: legal.length,
    legalDrops: legal.filter((entry) => entry.move.from === 0).length,
    inCheck: GenerateMovesImproved.isKingInCheck(
      parsed.position,
      parsed.position.teban,
    ),
  };
}

async function loadOpeningCandidates(
  path: string,
  excludedSfens: ReadonlySet<string>,
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for await (const { row, lineNumber } of jsonLines(path)) {
    const context = `opening:${lineNumber}`;
    const sfen = requiredString(row, "sfen", context);
    if (excludedSfens.has(sfen)) continue;
    const ply = requiredInteger(row, "ply", context);
    candidates.push(
      canonicalMetadata({
        sfen,
        tesu: ply,
        sourceRole: "openingHoldout",
        source: EXPECTED_INPUTS.openingHoldout.source,
        sourceGame: null,
      }),
    );
  }
  return candidates;
}

async function loadBrowserCandidates(
  path: string,
  role: "browserTrain" | "browserValidation",
  expectedSplit: "train" | "val",
  excludedSfens: ReadonlySet<string>,
  excludedGames: ReadonlySet<string>,
): Promise<Candidate[]> {
  const uniqueParents = new Map<string, RawCandidate>();
  for await (const { row, lineNumber } of jsonLines(path)) {
    const context = `${role}:${lineNumber}`;
    const split = requiredString(row, "split", context);
    if (split !== expectedSplit) {
      throw new Error(
        `${context}.split must be ${expectedSplit}, got ${split}`,
      );
    }
    const sfen = requiredString(row, "parent_sfen", context);
    const sourceGame = requiredString(row, "game_id", context);
    if (!/^sha256:[0-9a-f]{64}$/.test(sourceGame)) {
      throw new Error(`${context}.game_id is not a canonical sha256 identity`);
    }
    if (excludedSfens.has(sfen) || excludedGames.has(sourceGame)) continue;
    const tesu = requiredInteger(row, "parent_ply", context);
    const existing = uniqueParents.get(sfen);
    if (existing) {
      if (existing.tesu !== tesu || existing.sourceGame !== sourceGame) {
        throw new Error(
          `${context} conflicts with an earlier row for parent SFEN`,
        );
      }
      continue;
    }
    uniqueParents.set(sfen, {
      sfen,
      tesu,
      sourceRole: role,
      source: EXPECTED_INPUTS[role].source,
      sourceGame,
    });
  }
  return [...uniqueParents.values()].map(canonicalMetadata);
}

function isDropHeavy(candidate: Candidate): boolean {
  return (
    !candidate.inCheck &&
    candidate.handCount >= DROP_HEAVY_MIN_HAND &&
    candidate.legalDrops >= DROP_HEAVY_MIN_LEGAL_DROPS
  );
}

function eligible(category: Category, candidate: Candidate): boolean {
  switch (category) {
    case "opening":
      return (
        candidate.sourceRole === "openingHoldout" &&
        !candidate.inCheck &&
        !isDropHeavy(candidate) &&
        candidate.tesu <= 20
      );
    case "middlegame":
      return (
        candidate.sourceRole === "openingHoldout" &&
        !candidate.inCheck &&
        !isDropHeavy(candidate) &&
        candidate.tesu >= 21
      );
    case "dropHeavy":
      // Deliberately sourced from the union of all three pinned inputs.
      return isDropHeavy(candidate);
    case "checkEvasion":
      return (
        candidate.sourceRole !== "openingHoldout" &&
        candidate.sourceGame !== null &&
        candidate.inCheck
      );
  }
}

function selectionSha256(category: Category, candidate: Candidate): string {
  return createHash("sha256")
    .update(
      `${SELECTION_DOMAIN}\0${category}\0${candidate.sfen}\0${
        candidate.sourceGame ?? "-"
      }`,
      "utf8",
    )
    .digest("hex");
}

function selectCategory(
  category: Category,
  candidates: readonly Candidate[],
): SelectedCase[] {
  const ranked = candidates
    .filter((candidate) => eligible(category, candidate))
    .map((candidate) => ({
      candidate,
      digest: selectionSha256(category, candidate),
    }))
    .sort(
      (left, right) =>
        left.digest.localeCompare(right.digest) ||
        left.candidate.sfen.localeCompare(right.candidate.sfen) ||
        left.candidate.sourceRole.localeCompare(right.candidate.sourceRole),
    );

  const selected: SelectedCase[] = [];
  const selectedSfens = new Set<string>();
  const selectedCheckGames = new Set<string>();
  for (const entry of ranked) {
    if (selectedSfens.has(entry.candidate.sfen)) continue;
    if (category === "checkEvasion") {
      const game = entry.candidate.sourceGame;
      if (game === null || selectedCheckGames.has(game)) continue;
      selectedCheckGames.add(game);
    }
    selectedSfens.add(entry.candidate.sfen);
    selected.push({
      id: `${category}-${String(selected.length + 1).padStart(2, "0")}`,
      category,
      ...entry.candidate,
      selectionSha256: entry.digest,
    });
    if (selected.length === CASES_PER_CATEGORY) break;
  }
  if (selected.length !== CASES_PER_CATEGORY) {
    throw new Error(
      `${category} has only ${selected.length} eligible disjoint cases; ` +
        `${CASES_PER_CATEGORY} are required`,
    );
  }
  return selected;
}

async function main(): Promise<void> {
  const root = resolve(__dirname, "..");
  const paths: Readonly<Record<SourceRole, string>> = {
    openingHoldout: requiredValue("--opening-holdout"),
    browserTrain: requiredValue("--browser-train"),
    browserValidation: requiredValue("--browser-val"),
  };
  const output = optionalValue(
    "--output",
    resolve(root, "wasm-spike", "lazy-move-picker-fixture-v2.json"),
  );
  const v1Path = resolve(
    root,
    "wasm-spike",
    "lazy-move-picker-fixture-v1.json",
  );

  const inputIdentities = {} as Record<SourceRole, Identity>;
  for (const role of Object.keys(paths) as SourceRole[]) {
    const actual = await identityOfFile(paths[role]);
    requireIdentity(role, actual, EXPECTED_INPUTS[role]);
    inputIdentities[role] = actual;
  }

  const v1Bytes = readFileSync(v1Path);
  const v1Identity = identityOfBytes(v1Bytes);
  requireIdentity("v1 fixture", v1Identity, EXPECTED_V1);
  const v1 = JSON.parse(v1Bytes.toString("utf8")) as V1Fixture;
  if (!Array.isArray(v1.cases) || v1.cases.length !== 64) {
    throw new Error("v1 fixture must contain exactly 64 cases");
  }
  const excludedSfens = new Set(v1.cases.map((entry) => entry.sfen));
  const excludedGames = new Set(
    v1.cases
      .map((entry) => entry.sourceGame)
      .filter((value): value is string => typeof value === "string"),
  );

  const [opening, browserTrain, browserValidation] = await Promise.all([
    loadOpeningCandidates(paths.openingHoldout, excludedSfens),
    loadBrowserCandidates(
      paths.browserTrain,
      "browserTrain",
      "train",
      excludedSfens,
      excludedGames,
    ),
    loadBrowserCandidates(
      paths.browserValidation,
      "browserValidation",
      "val",
      excludedSfens,
      excludedGames,
    ),
  ]);
  const union = [...opening, ...browserTrain, ...browserValidation];
  const cases = CATEGORY_ORDER.flatMap((category) =>
    selectCategory(category, union),
  );
  if (new Set(cases.map((entry) => entry.sfen)).size !== cases.length) {
    throw new Error("formal v2 categories are not SFEN-disjoint");
  }
  if (cases.some((entry) => excludedSfens.has(entry.sfen))) {
    throw new Error("formal v2 reused a v1 SFEN");
  }
  if (
    cases.some(
      (entry) =>
        entry.sourceGame !== null && excludedGames.has(entry.sourceGame),
    )
  ) {
    throw new Error("formal v2 reused a v1 source game");
  }

  const result = {
    schemaVersion: 2,
    name: "lazy-move-picker-fixed-depth-formal-v2",
    status: "formal-holdout-not-for-tuning",
    generatedBy: "wasm-spike/build-lazy-move-picker-fixtures.ts",
    caseCount: cases.length,
    counts: Object.fromEntries(
      CATEGORY_ORDER.map((category) => [
        category,
        cases.filter((entry) => entry.category === category).length,
      ]),
    ),
    inputs: Object.fromEntries(
      (Object.keys(EXPECTED_INPUTS) as SourceRole[]).map((role) => [
        role,
        {
          requiredCliFlag: EXPECTED_INPUTS[role].cliFlag,
          source: EXPECTED_INPUTS[role].source,
          ...inputIdentities[role],
        },
      ]),
    ),
    v1Exclusion: {
      fixture: "wasm-spike/lazy-move-picker-fixture-v1.json",
      ...v1Identity,
      excludedSfens: excludedSfens.size,
      excludedSourceGames: excludedGames.size,
      policy: "reject-candidate-on-exact-canonical-sfen-or-source-game-match",
    },
    selection: {
      domain: SELECTION_DOMAIN,
      formula: SELECTION_FORMULA,
      delimiter: "NUL U+0000",
      order: "selectionSha256 ascending, then canonical SFEN, then source role",
      casesPerCategory: CASES_PER_CATEGORY,
      sourcePolicy: {
        opening: ["openingHoldout"],
        middlegame: ["openingHoldout"],
        dropHeavy: ["openingHoldout", "browserTrain", "browserValidation"],
        checkEvasion: ["browserTrain", "browserValidation"],
      },
      eligibility: {
        opening:
          "source=openingHoldout; not in check; not drop-heavy; tesu <= 20",
        middlegame:
          "source=openingHoldout; not in check; not drop-heavy; tesu >= 21",
        dropHeavy: `union source; not in check; handCount >= ${DROP_HEAVY_MIN_HAND}; legalDrops >= ${DROP_HEAVY_MIN_LEGAL_DROPS}`,
        checkEvasion:
          "browser train/validation union; in check; one selected case per source game",
      },
    },
    cases: cases.map(({ sourceRole, ...entry }) => ({
      ...entry,
      sourceRole,
    })),
  };

  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, {
      flag: "wx",
    });
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
  const outputIdentity = identityOfBytes(readFileSync(output));
  console.log(
    `[lazy-move-picker-fixture-v2] wrote ${cases.length} cases to ${output}\n` +
      `[lazy-move-picker-fixture-v2] bytes=${outputIdentity.bytes} sha256=${outputIdentity.sha256}\n` +
      `[lazy-move-picker-fixture-v2] excluded v1: ${excludedSfens.size} SFEN / ${excludedGames.size} games`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
