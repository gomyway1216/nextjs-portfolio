import { KyokumenImproved } from './KyokumenImproved';
import {
  setRootPolicyRankProvider,
  type RootPolicyMoveRank,
  type RootPolicyRankProvider,
  type RootPolicyRankProviderInput,
} from './rootPolicyRank';
import {
  EMPTY,
  GOTE,
  SENTE,
  type Te,
} from './types';
import { wasmEvaluateNnueCp } from './wasmEngine';

export const ROOT_POLICY_STUDENT_TENSOR_URL =
  '/shogi-root-policy-student-v1.f32.bin';
export const ROOT_POLICY_STUDENT_MANIFEST_URL =
  '/shogi-root-policy-student-v1.manifest.json';

const MANIFEST_SCHEMA = 'shogi-child-board-root-policy-student-manifest-v1';
const MODEL_SCHEMA = 'shogi-child-board-root-policy-student-v1';
const FEATURE_VERSION = 'dense-43-plane-shared-parent-child-livecp-root-v1';
const MODEL_VARIANT = 'shared-child16x2-residual-mlp-root-ordering-v1';
const FORMAT =
  'bytewise-utf8-name-order-contiguous-row-major-little-endian-float32-no-padding';
export const ROOT_POLICY_STUDENT_PARAMETERS = 877_633;
export const ROOT_POLICY_STUDENT_PAYLOAD_BYTES =
  ROOT_POLICY_STUDENT_PARAMETERS * 4;
const PARAMETERS = ROOT_POLICY_STUDENT_PARAMETERS;
const PAYLOAD_BYTES = ROOT_POLICY_STUDENT_PAYLOAD_BYTES;
const LIVE_NNUE_BYTES = 1_185_988;
const LIVE_NNUE_SHA256 =
  'e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc';
const INPUT_PLANES = 43;
const BOARD_CHANNELS = 16;
const BOARD_OUTPUT = 128;
const HIDDEN = 256;
const MLP_EXPANSION = 512;
const CP_SCALE = 600;
const INPUT_CP_SCALE = 3_000;
const EPSILON = 1e-5;
const RANKS = 'abcdefghi';
const HAND_MAXIMA = Object.freeze([
  18, 4, 4, 4, 4, 2, 2,
  18, 4, 4, 4, 4, 2, 2,
]);
const SHA256_HEX = /^[0-9a-f]{64}$/u;

export const ROOT_POLICY_STUDENT_STATE_TENSOR_SHAPES = Object.freeze({
  'board_encoder.stem.weight': [16, 43, 3, 3],
  'board_encoder.stem_norm.weight': [16],
  'board_encoder.stem_norm.bias': [16],
  'board_encoder.blocks.0.conv1.weight': [16, 16, 3, 3],
  'board_encoder.blocks.0.norm1.weight': [16],
  'board_encoder.blocks.0.norm1.bias': [16],
  'board_encoder.blocks.0.conv2.weight': [16, 16, 3, 3],
  'board_encoder.blocks.0.norm2.weight': [16],
  'board_encoder.blocks.0.norm2.bias': [16],
  'board_encoder.blocks.1.conv1.weight': [16, 16, 3, 3],
  'board_encoder.blocks.1.norm1.weight': [16],
  'board_encoder.blocks.1.norm1.bias': [16],
  'board_encoder.blocks.1.conv2.weight': [16, 16, 3, 3],
  'board_encoder.blocks.1.norm2.weight': [16],
  'board_encoder.blocks.1.norm2.bias': [16],
  'board_encoder.projection.weight': [128, 1296],
  'board_encoder.projection.bias': [128],
  'board_encoder.output_norm.weight': [128],
  'board_encoder.output_norm.bias': [128],
  'from_square.weight': [82, 32],
  'to_square.weight': [81, 32],
  'moved_piece.weight': [15, 32],
  'captured_piece.weight': [15, 16],
  'action.weight': [8, 16],
  'delta_file.weight': [17, 16],
  'delta_rank.weight': [17, 16],
  'self_king_relation.weight': [289, 16],
  'enemy_king_relation.weight': [289, 16],
  'ply_bucket.weight': [16, 16],
  'input_projection.weight': [256, 593],
  'input_projection.bias': [256],
  'input_norm.weight': [256],
  'input_norm.bias': [256],
  'mlp_blocks.0.expand.weight': [512, 256],
  'mlp_blocks.0.expand.bias': [512],
  'mlp_blocks.0.contract.weight': [256, 512],
  'mlp_blocks.0.contract.bias': [256],
  'mlp_blocks.0.norm.weight': [256],
  'mlp_blocks.0.norm.bias': [256],
  'mlp_blocks.1.expand.weight': [512, 256],
  'mlp_blocks.1.expand.bias': [512],
  'mlp_blocks.1.contract.weight': [256, 512],
  'mlp_blocks.1.contract.bias': [256],
  'mlp_blocks.1.norm.weight': [256],
  'mlp_blocks.1.norm.bias': [256],
  'output.weight': [1, 256],
  'output.bias': [1],
} satisfies Record<string, readonly number[]>);
const STATE_TENSOR_SHAPES = ROOT_POLICY_STUDENT_STATE_TENSOR_SHAPES;

type TensorName = keyof typeof STATE_TENSOR_SHAPES;

export type RootPolicyStudentFault =
  | 'missing-tensor'
  | 'bad-tensor-sha'
  | 'bad-manifest-sha'
  | 'bad-shape'
  | 'nan-output'
  | 'wrong-feature-schema'
  | 'inference-failed'
  | 'non-root-call';

export interface RootPolicyStudentRuntimeDiagnostics {
  readonly state: 'unloaded' | 'loading' | 'ready' | 'faulted';
  readonly fault: RootPolicyStudentFault | null;
  readonly modelLoads: number;
  readonly tensorReads: number;
  readonly inferenceCalls: number;
  readonly manifest: { readonly bytes: number; readonly sha256: string } | null;
  readonly tensor: { readonly bytes: number; readonly sha256: string } | null;
  readonly liveNnue: {
    readonly bytes: typeof LIVE_NNUE_BYTES;
    readonly sha256: typeof LIVE_NNUE_SHA256;
  };
}

interface TensorDescriptor {
  readonly name: TensorName;
  readonly shape: readonly number[];
  readonly dtype: 'float32-le';
  readonly offset: number;
  readonly length: number;
  readonly sha256: string;
}

interface StudentManifest {
  readonly schema: typeof MANIFEST_SCHEMA;
  readonly model_schema: typeof MODEL_SCHEMA;
  readonly feature_version: typeof FEATURE_VERSION;
  readonly model_variant: typeof MODEL_VARIANT;
  readonly parameters: typeof PARAMETERS;
  readonly format: typeof FORMAT;
  readonly payload: {
    readonly path: string;
    readonly bytes: typeof PAYLOAD_BYTES;
    readonly sha256: string;
  };
  readonly tensors: readonly TensorDescriptor[];
  readonly protocol: Record<string, unknown>;
  readonly teacher_hashes: Record<string, unknown>;
}

interface AssetResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface RootPolicyStudentLoadDependencies {
  readonly fetchAsset?: (url: string) => Promise<AssetResponse>;
  readonly digest?: (bytes: Uint8Array) => Promise<string>;
  readonly expectedManifestSha256?: string;
  readonly evaluateLiveNnue?: (position: KyokumenImproved) => number | null;
}

interface ExplicitMoveFeatures {
  readonly fromSquare: number;
  readonly toSquare: number;
  readonly movedPiece: number;
  readonly capturedPiece: number;
  readonly action: number;
  readonly deltaFile: number;
  readonly deltaRank: number;
  readonly selfKingRelation: number;
  readonly enemyKingRelation: number;
  readonly plyBucket: number;
}

export interface RootPolicyStudentScorer {
  scoreRoot(
    position: KyokumenImproved,
    moves: readonly Te[],
    gamePly: number,
    searchPly: number,
  ): readonly number[];
}

export class RootPolicyStudentRuntimeError extends Error {
  constructor(
    readonly fault: RootPolicyStudentFault,
    message: string,
  ) {
    super(message);
    this.name = 'RootPolicyStudentRuntimeError';
  }
}

function fail(fault: RootPolicyStudentFault, message: string): never {
  throw new RootPolicyStudentRuntimeError(fault, message);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('bad-shape', `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail('bad-shape', `${label} keys mismatch`);
  }
}

/**
 * JSON.parse accepts duplicate object keys. This small recursive parser does
 * not, and also rejects non-JSON constants before any manifest value is used.
 */
export function parseStrictRootPolicyStudentJson(text: string): unknown {
  let cursor = 0;
  const whitespace = (): void => {
    while (cursor < text.length && /\s/u.test(text[cursor])) cursor++;
  };
  const parseString = (): string => {
    const start = cursor;
    if (text[cursor++] !== '"') fail('bad-manifest-sha', 'expected JSON string');
    while (cursor < text.length) {
      const token = text[cursor++];
      if (token === '"') {
        try {
          return JSON.parse(text.slice(start, cursor)) as string;
        } catch {
          fail('bad-manifest-sha', 'invalid JSON string');
        }
      }
      if (token === '\\') {
        if (cursor >= text.length) fail('bad-manifest-sha', 'truncated JSON escape');
        const escape = text[cursor++];
        if (escape === 'u') {
          const digits = text.slice(cursor, cursor + 4);
          if (!/^[0-9a-fA-F]{4}$/u.test(digits)) {
            fail('bad-manifest-sha', 'invalid JSON unicode escape');
          }
          cursor += 4;
        } else if (!'"\\/bfnrt'.includes(escape)) {
          fail('bad-manifest-sha', 'invalid JSON escape');
        }
      } else if (token.charCodeAt(0) < 0x20) {
        fail('bad-manifest-sha', 'control character in JSON string');
      }
    }
    fail('bad-manifest-sha', 'unterminated JSON string');
  };
  const parseValue = (): unknown => {
    whitespace();
    const token = text[cursor];
    if (token === '"') return parseString();
    if (token === '{') {
      cursor++;
      whitespace();
      const result: Record<string, unknown> = {};
      const keys = new Set<string>();
      if (text[cursor] === '}') {
        cursor++;
        return result;
      }
      while (true) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) fail('bad-manifest-sha', `duplicate JSON key: ${key}`);
        keys.add(key);
        whitespace();
        if (text[cursor++] !== ':') fail('bad-manifest-sha', 'expected JSON colon');
        result[key] = parseValue();
        whitespace();
        const separator = text[cursor++];
        if (separator === '}') return result;
        if (separator !== ',') fail('bad-manifest-sha', 'expected JSON object separator');
      }
    }
    if (token === '[') {
      cursor++;
      whitespace();
      const result: unknown[] = [];
      if (text[cursor] === ']') {
        cursor++;
        return result;
      }
      while (true) {
        result.push(parseValue());
        whitespace();
        const separator = text[cursor++];
        if (separator === ']') return result;
        if (separator !== ',') fail('bad-manifest-sha', 'expected JSON array separator');
      }
    }
    const rest = text.slice(cursor);
    for (const [literal, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (rest.startsWith(literal)) {
        cursor += literal.length;
        return value;
      }
    }
    const match = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) fail('bad-manifest-sha', 'invalid JSON token');
    cursor += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail('bad-manifest-sha', 'non-finite JSON number');
    return value;
  };
  const value = parseValue();
  whitespace();
  if (cursor !== text.length) fail('bad-manifest-sha', 'trailing JSON content');
  return value;
}

async function defaultDigest(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail('bad-tensor-sha', 'Web Crypto SHA-256 is unavailable');
  const copy = Uint8Array.from(bytes);
  const digest = new Uint8Array(await subtle.digest('SHA-256', copy.buffer));
  return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
}

function product(shape: readonly number[]): number {
  return shape.reduce((result, value) => result * value, 1);
}

function validateManifest(value: unknown): StudentManifest {
  const manifest = object(value, 'manifest');
  exactKeys(
    manifest,
    [
      'schema',
      'model_schema',
      'feature_version',
      'model_variant',
      'parameters',
      'format',
      'payload',
      'tensors',
      'protocol',
      'teacher_hashes',
    ],
    'manifest',
  );
  if (
    manifest.schema !== MANIFEST_SCHEMA ||
    manifest.model_schema !== MODEL_SCHEMA ||
    manifest.feature_version !== FEATURE_VERSION ||
    manifest.model_variant !== MODEL_VARIANT ||
    manifest.parameters !== PARAMETERS ||
    manifest.format !== FORMAT
  ) {
    fail('wrong-feature-schema', 'student model or feature contract mismatch');
  }
  object(manifest.protocol, 'manifest.protocol');
  object(manifest.teacher_hashes, 'manifest.teacher_hashes');
  const payload = object(manifest.payload, 'manifest.payload');
  exactKeys(payload, ['path', 'bytes', 'sha256'], 'manifest.payload');
  if (
    typeof payload.path !== 'string' ||
    payload.path.length === 0 ||
    payload.bytes !== PAYLOAD_BYTES ||
    typeof payload.sha256 !== 'string' ||
    !SHA256_HEX.test(payload.sha256)
  ) {
    fail('bad-shape', 'manifest payload identity mismatch');
  }
  if (!Array.isArray(manifest.tensors)) fail('bad-shape', 'manifest tensors absent');
  // All current names are ASCII. Code-unit order is therefore the required
  // bytewise UTF-8 order, without locale-dependent collation.
  const expectedNames = Object.keys(STATE_TENSOR_SHAPES).sort();
  if (manifest.tensors.length !== expectedNames.length) {
    fail('bad-shape', 'manifest tensor count mismatch');
  }
  let offset = 0;
  const tensors: TensorDescriptor[] = [];
  manifest.tensors.forEach((raw, index) => {
    const row = object(raw, `manifest.tensors[${index}]`);
    exactKeys(row, ['name', 'shape', 'dtype', 'offset', 'length', 'sha256'], 'tensor');
    const name = expectedNames[index] as TensorName;
    const expectedShape = STATE_TENSOR_SHAPES[name];
    if (
      row.name !== name ||
      !Array.isArray(row.shape) ||
      row.shape.length !== expectedShape.length ||
      row.shape.some((dimension, shapeIndex) => dimension !== expectedShape[shapeIndex]) ||
      row.dtype !== 'float32-le' ||
      row.offset !== offset ||
      row.length !== product(expectedShape) * 4 ||
      typeof row.sha256 !== 'string' ||
      !SHA256_HEX.test(row.sha256)
    ) {
      fail('bad-shape', `manifest tensor layout mismatch: ${name}`);
    }
    tensors.push(row as unknown as TensorDescriptor);
    offset += row.length as number;
  });
  if (offset !== PAYLOAD_BYTES) fail('bad-shape', 'manifest payload is not contiguous');
  return {
    ...(manifest as unknown as StudentManifest),
    payload: payload as unknown as StudentManifest['payload'],
    tensors,
  };
}

function enginePieceToFeature(piece: number): number {
  const kind = piece & 0x0f;
  if (kind >= 1 && kind <= 12) return kind;
  if (kind === 14) return 13;
  if (kind === 15) return 14;
  fail('bad-shape', `unsupported production piece code: ${piece}`);
}

function normalizeSquare(position: number, side: number): number {
  let file = position >> 4;
  let rank = position & 0x0f;
  if (side === GOTE) {
    file = 10 - file;
    rank = 10 - rank;
  }
  if (file < 1 || file > 9 || rank < 1 || rank > 9) {
    fail('bad-shape', 'move square outside 9x9 board');
  }
  return (file - 1) * 9 + (rank - 1);
}

function squareCoordinates(index: number): readonly [number, number] {
  return [Math.floor(index / 9) + 1, (index % 9) + 1];
}

function clipRelation(value: number): number {
  return Math.max(-8, Math.min(8, value)) + 8;
}

function normalizedKing(position: KyokumenImproved, self: boolean): number {
  const king =
    position.teban === SENTE
      ? self ? position.kingS : position.kingG
      : self ? position.kingG : position.kingS;
  return normalizeSquare(king, position.teban);
}

/** Exact TS mirror of listwise_policy_value.encode_explicit_move(). */
export function encodeRootPolicyStudentMove(
  position: KyokumenImproved,
  move: Te,
  gamePly: number,
): ExplicitMoveFeatures {
  if (!Number.isInteger(gamePly) || gamePly < 0) {
    fail('bad-shape', 'game ply is invalid');
  }
  const isDrop = move.from === 0;
  const fromSquare = isDrop ? 81 : normalizeSquare(move.from, position.teban);
  const toSquare = normalizeSquare(move.to, position.teban);
  const movedPiece = enginePieceToFeature(move.koma);
  const destination = position.get(move.to);
  if (isDrop && destination !== EMPTY) fail('bad-shape', 'drop destination occupied');
  const capturedPiece =
    destination === EMPTY ? 0 : enginePieceToFeature(destination);
  const [toFile, toRank] = squareCoordinates(toSquare);
  let dx = 0;
  let dy = 0;
  if (!isDrop) {
    const [fromFile, fromRank] = squareCoordinates(fromSquare);
    dx = toFile - fromFile;
    dy = toRank - fromRank;
  }
  const [selfFile, selfRank] = squareCoordinates(normalizedKing(position, true));
  const [enemyFile, enemyRank] = squareCoordinates(normalizedKing(position, false));
  return Object.freeze({
    fromSquare,
    toSquare,
    movedPiece,
    capturedPiece,
    action:
      Number(isDrop) |
      (Number(move.promote) << 1) |
      (Number(capturedPiece !== 0) << 2),
    deltaFile: clipRelation(dx),
    deltaRank: clipRelation(dy),
    selfKingRelation:
      clipRelation(toFile - selfFile) * 17 + clipRelation(toRank - selfRank),
    enemyKingRelation:
      clipRelation(toFile - enemyFile) * 17 + clipRelation(toRank - enemyRank),
    plyBucket: Math.min(15, Math.floor(gamePly / 16)),
  });
}

/** Exact TS mirror of capacity_policy_value parent/child 43-plane encoding. */
export function encodeRootPolicyStudentBoard(
  position: KyokumenImproved,
  gamePly: number,
): Float32Array {
  if (!Number.isInteger(gamePly) || gamePly < 0) {
    fail('bad-shape', 'game ply is invalid');
  }
  const planes = new Float32Array(INPUT_PLANES * 81);
  for (let file = 1; file <= 9; file++) {
    for (let rank = 1; rank <= 9; rank++) {
      const square = (file << 4) + rank;
      const piece = position.get(square);
      if (piece === EMPTY) continue;
      const featurePiece = enginePieceToFeature(piece);
      const mine =
        position.teban === SENTE
          ? (piece & SENTE) !== 0
          : (piece & GOTE) !== 0;
      const plane = featurePiece - 1 + (mine ? 0 : 14);
      const normalized = normalizeSquare(square, position.teban);
      if (planes[plane * 81 + normalized] !== 0) {
        fail('bad-shape', 'two pieces occupy one feature square');
      }
      planes[plane * 81 + normalized] = 1;
    }
  }
  const pieces = [1, 2, 3, 4, 5, 6, 7];
  const ownFlag = position.teban === SENTE ? SENTE : GOTE;
  const enemyFlag = position.teban === SENTE ? GOTE : SENTE;
  pieces.forEach((piece, index) => {
    for (const [relative, flag] of [[0, ownFlag], [1, enemyFlag]] as const) {
      const count = position.hand[flag | piece] | 0;
      const maximum = HAND_MAXIMA[index + relative * 7];
      if (count < 0 || count > maximum) fail('bad-shape', 'invalid hand count');
      planes.fill(count / maximum, (28 + index + relative * 7) * 81, (29 + index + relative * 7) * 81);
    }
  });
  planes.fill(Math.min(gamePly, 255) / 255, 42 * 81, 43 * 81);
  return planes;
}

function moveToUsi(move: Te): string {
  const square = (value: number): string => {
    const file = value >> 4;
    const rank = value & 0x0f;
    if (file < 1 || file > 9 || rank < 1 || rank > 9) {
      fail('bad-shape', 'cannot serialize move square');
    }
    return `${file}${RANKS[rank - 1]}`;
  };
  if (move.from === 0) {
    const pieces = ['', 'P', 'L', 'N', 'S', 'G', 'B', 'R'];
    const piece = pieces[move.koma & 0x0f];
    if (!piece) fail('bad-shape', 'invalid drop piece');
    return `${piece}*${square(move.to)}`;
  }
  return `${square(move.from)}${square(move.to)}${move.promote ? '+' : ''}`;
}

/**
 * Python stable_student_order parity: combined CP descending, then bytewise
 * ASCII USI ascending. The result contains ranks only, never student CP.
 */
export function stableRootPolicyStudentRanks(
  input: Pick<RootPolicyRankProviderInput, 'moves' | 'moveKeys'>,
  combinedCp: readonly number[],
): readonly RootPolicyMoveRank[] {
  if (
    input.moves.length === 0 ||
    input.moves.length !== input.moveKeys.length ||
    input.moves.length !== combinedCp.length ||
    combinedCp.some((value) => !Number.isFinite(value))
  ) {
    fail('nan-output', 'student score set is malformed');
  }
  const rows = input.moves.map((move, index) => ({
    moveKey: input.moveKeys[index],
    score: combinedCp[index],
    usi: moveToUsi(move),
  }));
  rows.sort((left, right) => {
    const score = right.score - left.score;
    if (score !== 0) return score;
    return left.usi < right.usi ? -1 : left.usi > right.usi ? 1 : 0;
  });
  return Object.freeze(
    rows.map((row, rank) =>
      Object.freeze({ moveKey: row.moveKey | 0, rank }),
    ),
  );
}

function f32(value: number): number {
  return Math.fround(value);
}

function gelu(value: number): number {
  const x = f32(value);
  const cubic = f32(f32(x * x) * x);
  const inner = f32(0.7978845608028654 * f32(x + f32(0.044715 * cubic)));
  return f32(f32(0.5 * x) * f32(1 + Math.tanh(inner)));
}

function linear(
  input: Float32Array,
  weight: Float32Array,
  bias: Float32Array,
  outputSize: number,
): Float32Array {
  const inputSize = input.length;
  const result = new Float32Array(outputSize);
  for (let output = 0; output < outputSize; output++) {
    let value = bias[output];
    const base = output * inputSize;
    for (let index = 0; index < inputSize; index++) {
      value += weight[base + index] * input[index];
    }
    result[output] = f32(value);
  }
  return result;
}

function layerNorm(
  input: Float32Array,
  weight: Float32Array,
  bias: Float32Array,
): Float32Array {
  let mean = 0;
  for (const value of input) mean += value;
  mean = f32(mean / input.length);
  let variance = 0;
  for (const value of input) {
    const delta = f32(value - mean);
    variance += delta * delta;
  }
  variance = f32(variance / input.length);
  const inverse = f32(1 / Math.sqrt(variance + EPSILON));
  const result = new Float32Array(input.length);
  for (let index = 0; index < input.length; index++) {
    result[index] = f32(
      f32(f32(input[index] - mean) * inverse) * weight[index] + bias[index],
    );
  }
  return result;
}

function conv3x3(
  input: Float32Array,
  inputChannels: number,
  weight: Float32Array,
  outputChannels: number,
): Float32Array {
  // Materializing the one-cell zero border once removes bounds branches from
  // the model's dominant kernel (parent plus every legal child).
  const padded = new Float32Array(inputChannels * 11 * 11);
  for (let channel = 0; channel < inputChannels; channel++) {
    const source = channel * 81;
    const target = channel * 121;
    for (let y = 0; y < 9; y++) {
      padded.set(input.subarray(source + y * 9, source + y * 9 + 9), target + (y + 1) * 11 + 1);
    }
  }
  const result = new Float32Array(outputChannels * 81);
  for (let output = 0; output < outputChannels; output++) {
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        let value = 0;
        for (let channel = 0; channel < inputChannels; channel++) {
          const source = channel * 121 + y * 11 + x;
          const kernel = (output * inputChannels + channel) * 9;
          value +=
            padded[source] * weight[kernel] +
            padded[source + 1] * weight[kernel + 1] +
            padded[source + 2] * weight[kernel + 2] +
            padded[source + 11] * weight[kernel + 3] +
            padded[source + 12] * weight[kernel + 4] +
            padded[source + 13] * weight[kernel + 5] +
            padded[source + 22] * weight[kernel + 6] +
            padded[source + 23] * weight[kernel + 7] +
            padded[source + 24] * weight[kernel + 8];
        }
        result[output * 81 + y * 9 + x] = f32(value);
      }
    }
  }
  return result;
}

function groupNorm(
  input: Float32Array,
  weight: Float32Array,
  bias: Float32Array,
): Float32Array {
  const result = new Float32Array(input.length);
  for (let group = 0; group < 4; group++) {
    const firstChannel = group * 4;
    const first = firstChannel * 81;
    const last = (firstChannel + 4) * 81;
    let mean = 0;
    for (let index = first; index < last; index++) mean += input[index];
    mean = f32(mean / (4 * 81));
    let variance = 0;
    for (let index = first; index < last; index++) {
      const delta = f32(input[index] - mean);
      variance += delta * delta;
    }
    variance = f32(variance / (4 * 81));
    const inverse = f32(1 / Math.sqrt(variance + EPSILON));
    for (let channel = firstChannel; channel < firstChannel + 4; channel++) {
      for (let square = 0; square < 81; square++) {
        const index = channel * 81 + square;
        result[index] = f32(
          f32(f32(input[index] - mean) * inverse) * weight[channel] + bias[channel],
        );
      }
    }
  }
  return result;
}

function embedding(
  table: Float32Array,
  row: number,
  width: number,
): Float32Array {
  if (!Number.isInteger(row) || row < 0 || (row + 1) * width > table.length) {
    fail('bad-shape', 'student embedding index outside table');
  }
  return table.slice(row * width, (row + 1) * width);
}

class FrozenRootPolicyStudent implements RootPolicyStudentScorer {
  constructor(
    private readonly tensors: Readonly<Record<TensorName, Float32Array>>,
    private readonly evaluateLiveNnue: (position: KyokumenImproved) => number | null,
    private readonly onInference: () => void,
  ) {}

  private tensor(name: TensorName): Float32Array {
    return this.tensors[name];
  }

  private board(planes: Float32Array): Float32Array {
    let value = conv3x3(
      planes,
      INPUT_PLANES,
      this.tensor('board_encoder.stem.weight'),
      BOARD_CHANNELS,
    );
    value = groupNorm(
      value,
      this.tensor('board_encoder.stem_norm.weight'),
      this.tensor('board_encoder.stem_norm.bias'),
    );
    value = value.map(gelu);
    for (let block = 0; block < 2; block++) {
      const residual = value;
      value = conv3x3(
        value,
        BOARD_CHANNELS,
        this.tensor(`board_encoder.blocks.${block}.conv1.weight` as TensorName),
        BOARD_CHANNELS,
      );
      value = groupNorm(
        value,
        this.tensor(`board_encoder.blocks.${block}.norm1.weight` as TensorName),
        this.tensor(`board_encoder.blocks.${block}.norm1.bias` as TensorName),
      );
      value = value.map(gelu);
      value = conv3x3(
        value,
        BOARD_CHANNELS,
        this.tensor(`board_encoder.blocks.${block}.conv2.weight` as TensorName),
        BOARD_CHANNELS,
      );
      value = groupNorm(
        value,
        this.tensor(`board_encoder.blocks.${block}.norm2.weight` as TensorName),
        this.tensor(`board_encoder.blocks.${block}.norm2.bias` as TensorName),
      );
      for (let index = 0; index < value.length; index++) {
        value[index] = gelu(f32(residual[index] + value[index]));
      }
    }
    return layerNorm(
      linear(
        value,
        this.tensor('board_encoder.projection.weight'),
        this.tensor('board_encoder.projection.bias'),
        BOARD_OUTPUT,
      ),
      this.tensor('board_encoder.output_norm.weight'),
      this.tensor('board_encoder.output_norm.bias'),
    );
  }

  private scoreMove(
    parent: Float32Array,
    child: Float32Array,
    feature: ExplicitMoveFeatures,
    baseCp: number,
  ): number {
    const parts = [
      embedding(this.tensor('from_square.weight'), feature.fromSquare, 32),
      embedding(this.tensor('to_square.weight'), feature.toSquare, 32),
      embedding(this.tensor('moved_piece.weight'), feature.movedPiece, 32),
      embedding(this.tensor('captured_piece.weight'), feature.capturedPiece, 16),
      embedding(this.tensor('action.weight'), feature.action, 16),
      embedding(this.tensor('delta_file.weight'), feature.deltaFile, 16),
      embedding(this.tensor('delta_rank.weight'), feature.deltaRank, 16),
      embedding(this.tensor('self_king_relation.weight'), feature.selfKingRelation, 16),
      embedding(this.tensor('enemy_king_relation.weight'), feature.enemyKingRelation, 16),
      embedding(this.tensor('ply_bucket.weight'), feature.plyBucket, 16),
    ];
    const input = new Float32Array(593);
    input.set(parent, 0);
    input.set(child, 128);
    for (let index = 0; index < BOARD_OUTPUT; index++) {
      input[256 + index] = f32(child[index] - parent[index]);
    }
    let offset = 384;
    for (const part of parts) {
      input.set(part, offset);
      offset += part.length;
    }
    input[offset] = f32(Math.tanh(f32(baseCp / INPUT_CP_SCALE)));
    let value = linear(
      input,
      this.tensor('input_projection.weight'),
      this.tensor('input_projection.bias'),
      HIDDEN,
    );
    value = layerNorm(
      value,
      this.tensor('input_norm.weight'),
      this.tensor('input_norm.bias'),
    ).map(gelu);
    for (let block = 0; block < 2; block++) {
      const residual = value;
      let expanded: Float32Array = linear(
        value,
        this.tensor(`mlp_blocks.${block}.expand.weight` as TensorName),
        this.tensor(`mlp_blocks.${block}.expand.bias` as TensorName),
        MLP_EXPANSION,
      ).map(gelu);
      expanded = linear(
        expanded,
        this.tensor(`mlp_blocks.${block}.contract.weight` as TensorName),
        this.tensor(`mlp_blocks.${block}.contract.bias` as TensorName),
        HIDDEN,
      );
      for (let index = 0; index < HIDDEN; index++) {
        expanded[index] = f32(expanded[index] + residual[index]);
      }
      value = layerNorm(
        expanded,
        this.tensor(`mlp_blocks.${block}.norm.weight` as TensorName),
        this.tensor(`mlp_blocks.${block}.norm.bias` as TensorName),
      ).map(gelu);
    }
    const units = linear(
      value,
      this.tensor('output.weight'),
      this.tensor('output.bias'),
      1,
    )[0];
    return f32(baseCp + f32(units * CP_SCALE));
  }

  scoreRoot(
    position: KyokumenImproved,
    moves: readonly Te[],
    gamePly: number,
    searchPly: number,
  ): readonly number[] {
    if (searchPly !== 0) fail('non-root-call', 'student is callable only at root ply zero');
    if (moves.length === 0 || moves.length > 640) fail('bad-shape', 'root move count invalid');
    this.onInference();
    const parent = this.board(encodeRootPolicyStudentBoard(position, gamePly));
    const scores: number[] = [];
    for (const move of moves) {
      const feature = encodeRootPolicyStudentMove(position, move, gamePly);
      const child = position.clone();
      child.move(move);
      child.toggleTeban();
      const childCp = this.evaluateLiveNnue(child);
      if (childCp === null || !Number.isFinite(childCp)) {
        fail('inference-failed', 'exact live NNUE child CP unavailable');
      }
      const baseCp = f32(-childCp);
      const childBoard = this.board(
        encodeRootPolicyStudentBoard(child, gamePly + 1),
      );
      scores.push(this.scoreMove(parent, childBoard, feature, baseCp));
    }
    if (scores.some((score) => !Number.isFinite(score))) {
      fail('nan-output', 'student produced a non-finite score');
    }
    return Object.freeze(scores);
  }
}

function createProvider(
  scorer: RootPolicyStudentScorer,
  onFault: (fault: RootPolicyStudentFault) => void,
): RootPolicyRankProvider {
  return (input) => {
    const gamePly = input.gamePly;
    if (
      input.searchPly !== 0 ||
      !(input.position instanceof KyokumenImproved) ||
      !Number.isInteger(gamePly) ||
      (gamePly ?? -1) < 0
    ) {
      onFault('non-root-call');
      return null;
    }
    try {
      const combined = scorer.scoreRoot(
        input.position,
        input.moves,
        gamePly as number,
        input.searchPly,
      );
      return stableRootPolicyStudentRanks(input, combined);
    } catch (error) {
      onFault(
        error instanceof RootPolicyStudentRuntimeError
          ? error.fault
          : 'inference-failed',
      );
      return null;
    }
  };
}

export function createRootPolicyStudentRankProviderForTests(
  scorer: RootPolicyStudentScorer,
): RootPolicyRankProvider {
  return createProvider(scorer, () => undefined);
}

let state: RootPolicyStudentRuntimeDiagnostics['state'] = 'unloaded';
let fault: RootPolicyStudentFault | null = null;
let modelLoads = 0;
let tensorReads = 0;
let inferenceCalls = 0;
let manifestIdentity: RootPolicyStudentRuntimeDiagnostics['manifest'] = null;
let tensorIdentity: RootPolicyStudentRuntimeDiagnostics['tensor'] = null;
let loadPromise: Promise<boolean> | null = null;

export function getRootPolicyStudentRuntimeDiagnostics(): RootPolicyStudentRuntimeDiagnostics {
  return Object.freeze({
    state,
    fault,
    modelLoads,
    tensorReads,
    inferenceCalls,
    manifest: manifestIdentity,
    tensor: tensorIdentity,
    liveNnue: Object.freeze({
      bytes: LIVE_NNUE_BYTES,
      sha256: LIVE_NNUE_SHA256,
    }),
  });
}

async function loadFrozenStudent(
  dependencies: RootPolicyStudentLoadDependencies,
): Promise<boolean> {
  const fetchAsset =
    dependencies.fetchAsset ??
    ((url: string) => fetch(url, { cache: 'force-cache' }));
  const digest = dependencies.digest ?? defaultDigest;
  const manifestResponse = await fetchAsset(ROOT_POLICY_STUDENT_MANIFEST_URL);
  if (!manifestResponse.ok) {
    fail('missing-tensor', `student manifest unavailable: HTTP ${manifestResponse.status}`);
  }
  const manifestText = await manifestResponse.text();
  const manifestBytes = new TextEncoder().encode(manifestText);
  const manifestSha256 = await digest(manifestBytes);
  if (
    dependencies.expectedManifestSha256 !== undefined &&
    manifestSha256 !== dependencies.expectedManifestSha256
  ) {
    fail('bad-manifest-sha', 'student manifest SHA-256 mismatch');
  }
  const manifest = validateManifest(parseStrictRootPolicyStudentJson(manifestText));
  const tensorResponse = await fetchAsset(ROOT_POLICY_STUDENT_TENSOR_URL);
  if (!tensorResponse.ok) {
    fail('missing-tensor', `student tensor unavailable: HTTP ${tensorResponse.status}`);
  }
  const buffer = await tensorResponse.arrayBuffer();
  tensorReads++;
  if (buffer.byteLength !== PAYLOAD_BYTES) fail('bad-shape', 'student tensor byte size mismatch');
  const bytes = new Uint8Array(buffer);
  const tensorSha256 = await digest(bytes);
  if (tensorSha256 !== manifest.payload.sha256) {
    fail('bad-tensor-sha', 'student tensor SHA-256 mismatch');
  }
  await Promise.all(
    manifest.tensors.map(async (tensor) => {
      const slice = bytes.subarray(tensor.offset, tensor.offset + tensor.length);
      if ((await digest(slice)) !== tensor.sha256) {
        fail('bad-tensor-sha', `student tensor member SHA-256 mismatch: ${tensor.name}`);
      }
    }),
  );
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const values = littleEndian
    ? new Float32Array(buffer)
    : (() => {
        const result = new Float32Array(PARAMETERS);
        const view = new DataView(buffer);
        for (let index = 0; index < result.length; index++) {
          result[index] = view.getFloat32(index * 4, true);
        }
        return result;
      })();
  for (const value of values) {
    if (!Number.isFinite(value)) fail('bad-shape', 'student tensor contains non-finite value');
  }
  const tensors = {} as Record<TensorName, Float32Array>;
  for (const tensor of manifest.tensors) {
    tensors[tensor.name] = values.subarray(
      tensor.offset / 4,
      (tensor.offset + tensor.length) / 4,
    );
  }
  const scorer = new FrozenRootPolicyStudent(
    tensors,
    dependencies.evaluateLiveNnue ?? wasmEvaluateNnueCp,
    () => {
      inferenceCalls++;
    },
  );
  setRootPolicyRankProvider(
    createProvider(scorer, (runtimeFault) => {
      fault = runtimeFault;
    }),
  );
  modelLoads++;
  manifestIdentity = Object.freeze({
    bytes: manifestBytes.byteLength,
    sha256: manifestSha256,
  });
  tensorIdentity = Object.freeze({
    bytes: buffer.byteLength,
    sha256: tensorSha256,
  });
  return true;
}

/**
 * Lazily load and install the immutable student. Disabled live requests never
 * call this function, fetch assets, read tensor bytes, or run inference.
 */
export function ensureFrozenRootPolicyStudentLoaded(
  dependencies: RootPolicyStudentLoadDependencies = {},
): Promise<boolean> {
  if (state === 'ready') return Promise.resolve(true);
  if (state === 'faulted') return Promise.resolve(false);
  if (loadPromise) return loadPromise;
  state = 'loading';
  loadPromise = loadFrozenStudent(dependencies)
    .then(() => {
      state = 'ready';
      fault = null;
      return true;
    })
    .catch((error: unknown) => {
      setRootPolicyRankProvider(null);
      fault =
        error instanceof RootPolicyStudentRuntimeError
          ? error.fault
          : 'inference-failed';
      state = 'faulted';
      return false;
    });
  return loadPromise;
}

/** Reset module state between isolated fixture tests; never called by production. */
export function resetRootPolicyStudentRuntimeForTests(): void {
  setRootPolicyRankProvider(null);
  state = 'unloaded';
  fault = null;
  modelLoads = 0;
  tensorReads = 0;
  inferenceCalls = 0;
  manifestIdentity = null;
  tensorIdentity = null;
  loadPromise = null;
}
