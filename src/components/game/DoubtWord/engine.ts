/**
 * Doubt Word — pure game engine.
 *
 * Rules:
 *  - Every round one side is the "claimant". They privately hold a real word and
 *    announce a claim: its first letter and its length.
 *  - A claim is a BLUFF when the announced first-letter or length does NOT match
 *    the real word.
 *  - The other side reacts with Believe or Doubt.
 *      - Doubt a bluff  -> claimant loses a life (challenger scores).
 *      - Doubt the truth -> challenger loses a life (claimant scores).
 *      - Believe a bluff -> challenger loses a life (claimant scores).
 *      - Believe the truth -> nobody loses a life (a safe/peaceful pass).
 *  - First side to lose all lives loses the match.
 *
 * The AI plays both as challenger (reacting to the player's claim) and as
 * claimant (announcing its own claim). Difficulty tiers control how well the AI
 * estimates the plausibility of a claim and how it balances risk.
 */

import type { Difficulty } from '../common/types';

export type Speaker = 'ai' | 'player';
export type Reaction = 'believe' | 'doubt';

export interface Claim {
  speaker: Speaker;
  /** The real word the claimant actually holds. */
  actualWord: string;
  /** Announced first letter (uppercase). May differ from the real word. */
  claimedFirst: string;
  /** Announced length. May differ from the real word. */
  claimedLength: number;
  /** True when the claim does not match the real word. */
  isBluff: boolean;
}

/**
 * Curated dictionary. Every entry is a valid lowercase English word of length
 * 4-8 with no duplicates. Used both as the word pool and as the reference for
 * plausibility checks / validation.
 */
export const WORD_POOL: readonly string[] = [
  'galaxy', 'forest', 'signal', 'rocket', 'shadow', 'ember', 'comet', 'mirror',
  'rhythm', 'spiral', 'harbor', 'planet', 'blossom', 'prism', 'binary', 'aurora',
  'matrix', 'safari', 'cipher', 'legend', 'trance', 'breeze', 'vertex', 'canvas',
  'socket', 'delta', 'fusion', 'tempo', 'summit', 'magnet', 'jungle', 'stream',
  'impact', 'zenith', 'pixel', 'thunder', 'violet', 'whisper', 'riddle', 'syntax',
  'vector', 'mocha', 'horizon', 'tunnel', 'orbit', 'quartz', 'dynamic', 'silver',
  'anchor', 'beacon', 'cobalt', 'dragon', 'echo', 'falcon', 'gravity', 'hollow',
  'igloo', 'jasper', 'kernel', 'lantern', 'meadow', 'nebula', 'oyster', 'puzzle',
];

/** A dependency-injectable RNG so tests can be deterministic. */
export type Rng = () => number;
const defaultRng: Rng = Math.random;

export const randomFrom = <T,>(arr: readonly T[], rng: Rng = defaultRng): T =>
  arr[Math.floor(rng() * arr.length)];

/**
 * Deal `count` distinct words from the pool.
 */
export const sampleWords = (count: number, rng: Rng = defaultRng): string[] => {
  const copied = [...WORD_POOL];
  const picked: string[] = [];
  while (picked.length < count && copied.length > 0) {
    const index = Math.floor(rng() * copied.length);
    picked.push(copied[index]);
    copied.splice(index, 1);
  }
  return picked;
};

const MIN_LEN = 3;
const MAX_LEN = 9;

const wrongLetter = (current: string, rng: Rng = defaultRng): string => {
  const target = current.toLowerCase();
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .filter((char) => char !== target);
  return randomFrom(alphabet, rng).toUpperCase();
};

/**
 * Build a claim about `word`. When `bluff` is true the returned claim is
 * GUARANTEED to actually differ from the real word (fixing the original bug
 * where a "bluff" could accidentally be truthful, e.g. length 3 - 1 clamped
 * back to 3). It randomly distorts the length, the first letter, or both.
 */
export const makeClaim = (
  speaker: Speaker,
  word: string,
  bluff: boolean,
  rng: Rng = defaultRng,
): Claim => {
  const first = word[0].toUpperCase();
  const length = word.length;

  if (!bluff) {
    return { speaker, actualWord: word, claimedFirst: first, claimedLength: length, isBluff: false };
  }

  // Decide which dimensions to distort. At least one must genuinely change.
  const roll = rng();
  const distortLength = roll < 0.66; // length or both
  const distortFirst = roll >= 0.33; // first or both

  let claimedLength = length;
  if (distortLength) {
    // Pick a different length within a plausible band.
    const delta = rng() < 0.5 ? -1 : 1;
    let candidate = length + delta;
    if (candidate < MIN_LEN) candidate = length + 1;
    if (candidate > MAX_LEN) candidate = length - 1;
    // Guarantee a real change even at the clamp boundaries.
    claimedLength = candidate === length ? Math.min(MAX_LEN, length + 1) : candidate;
    if (claimedLength === length) claimedLength = Math.max(MIN_LEN, length - 1);
  }

  let claimedFirst = first;
  if (distortFirst) {
    claimedFirst = wrongLetter(first, rng);
  }

  // Safety net: if by construction nothing changed, force the first letter.
  if (claimedFirst === first && claimedLength === length) {
    claimedFirst = wrongLetter(first, rng);
  }

  return {
    speaker,
    actualWord: word,
    claimedFirst,
    claimedLength,
    isBluff: claimedLength !== length || claimedFirst !== first,
  };
};

/**
 * Validation: does a claim faithfully describe the given word?
 * Returns true when the claim is truthful (not a bluff) for `word`.
 */
export const claimMatchesWord = (
  word: string,
  claimedFirst: string,
  claimedLength: number,
): boolean =>
  word.length === claimedLength &&
  word[0].toLowerCase() === claimedFirst.toLowerCase();

/**
 * Recompute whether a claim is a bluff from first principles (used to keep the
 * `isBluff` flag honest and to make the engine non-exploitable).
 */
export const isBluffClaim = (claim: Claim): boolean =>
  !claimMatchesWord(claim.actualWord, claim.claimedFirst, claim.claimedLength);

// ---------------------------------------------------------------------------
// Plausibility model — how believable is a first-letter + length combination?
// ---------------------------------------------------------------------------

/**
 * Fraction of the dictionary matching a (first-letter, length) signature.
 * A high fraction means the claim is common/plausible; a near-zero fraction
 * means almost no real word fits it, so it is likely a bluff.
 */
export const plausibility = (claimedFirst: string, claimedLength: number): number => {
  const first = claimedFirst.toLowerCase();
  const matches = WORD_POOL.filter(
    (w) => w[0] === first && w.length === claimedLength,
  ).length;
  // Smooth so a plausible-but-rare combo isn't treated as impossible.
  return (matches + 0.25) / (WORD_POOL.length * 0.06 + 1);
};

// ---------------------------------------------------------------------------
// Difficulty tiers
// ---------------------------------------------------------------------------

export interface AiProfile {
  /** How strongly the AI trusts its plausibility read (0 = ignores, 1 = fully). */
  readSkill: number;
  /** Base rate the AI decides to bluff on its own turn. */
  bluffRate: number;
  /** Random noise added to challenge decisions (higher = sloppier). */
  noise: number;
  /** Multiplier on doubting when a claim looks implausible. */
  aggression: number;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: { readSkill: 0.15, bluffRate: 0.25, noise: 0.35, aggression: 0.8 },
  medium: { readSkill: 0.45, bluffRate: 0.35, noise: 0.2, aggression: 1.0 },
  hard: { readSkill: 0.7, bluffRate: 0.42, noise: 0.1, aggression: 1.15 },
  expert: { readSkill: 0.88, bluffRate: 0.48, noise: 0.05, aggression: 1.3 },
  master: { readSkill: 1.0, bluffRate: 0.52, noise: 0.02, aggression: 1.45 },
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Probability the AI *should* doubt a given claim, before noise. Combines the
 * plausibility read (implausible => doubt) with the AI's read skill: a low-skill
 * AI barely reacts to plausibility and hovers near a coin flip.
 */
export const aiDoubtProbability = (
  claim: Pick<Claim, 'claimedFirst' | 'claimedLength'>,
  profile: AiProfile,
): number => {
  const p = plausibility(claim.claimedFirst, claim.claimedLength);
  // Map plausibility (~0..~4) to a suspicion score in [0,1]: rare => suspicious.
  const suspicion = clamp01(1 - p / 1.6);
  // Blend toward 0.5 based on how much the AI trusts its read.
  const informed = 0.5 + (suspicion - 0.5) * profile.aggression;
  return clamp01(0.5 + (informed - 0.5) * profile.readSkill);
};

/**
 * The AI reacts (as challenger) to a claim made by the player.
 */
export const aiReactToClaim = (
  claim: Pick<Claim, 'claimedFirst' | 'claimedLength'>,
  difficulty: Difficulty,
  rng: Rng = defaultRng,
): Reaction => {
  const profile = AI_PROFILES[difficulty];
  const base = aiDoubtProbability(claim, profile);
  const noisy = base + (rng() - 0.5) * 2 * profile.noise;
  return rng() < clamp01(noisy) ? 'doubt' : 'believe';
};

/**
 * The AI, as claimant, decides whether to bluff and produces its claim.
 * Higher tiers bluff more, and — critically — bluff *plausibly*: they only
 * commit to a bluff whose announced signature still looks believable, so a
 * skilled human can't win by always doubting.
 */
export const aiMakeClaim = (
  word: string,
  difficulty: Difficulty,
  rng: Rng = defaultRng,
): Claim => {
  const profile = AI_PROFILES[difficulty];
  const wantsBluff = rng() < profile.bluffRate;
  if (!wantsBluff) {
    return makeClaim('ai', word, false, rng);
  }

  // Try a few candidate bluffs and keep the most plausible one for stronger AIs.
  const candidates = Math.max(1, Math.round(1 + profile.readSkill * 3));
  let best: Claim | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates; i += 1) {
    const candidate = makeClaim('ai', word, true, rng);
    const score = plausibility(candidate.claimedFirst, candidate.claimedLength);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best ?? makeClaim('ai', word, true, rng);
};

// ---------------------------------------------------------------------------
// Round resolution — shared, pure, and symmetric.
// ---------------------------------------------------------------------------

export interface RoundDelta {
  playerLivesDelta: number;
  aiLivesDelta: number;
  playerScoreDelta: number;
  aiScoreDelta: number;
  /** Outcome key for i18n; the UI maps it to a localized message. */
  outcome:
    | 'doubtCorrect'   // challenger doubted a bluff — correct
    | 'doubtWrong'     // challenger doubted the truth — wrong
    | 'believedBluff'  // challenger believed a bluff — fooled
    | 'safePass';      // challenger believed the truth — safe
}

/**
 * Resolve a claim + reaction into life/score deltas. `challenger` is whoever
 * is reacting to `claim` (the opposite side from the claimant).
 */
export const resolveRound = (claim: Claim, reaction: Reaction): RoundDelta => {
  const bluff = isBluffClaim(claim);
  const claimant = claim.speaker;
  const challenger: Speaker = claimant === 'ai' ? 'player' : 'ai';

  const loseLife = (side: Speaker): Pick<RoundDelta, 'playerLivesDelta' | 'aiLivesDelta'> =>
    side === 'player'
      ? { playerLivesDelta: -1, aiLivesDelta: 0 }
      : { playerLivesDelta: 0, aiLivesDelta: -1 };

  const scoreFor = (side: Speaker): Pick<RoundDelta, 'playerScoreDelta' | 'aiScoreDelta'> =>
    side === 'player'
      ? { playerScoreDelta: 1, aiScoreDelta: 0 }
      : { playerScoreDelta: 0, aiScoreDelta: 1 };

  if (reaction === 'doubt') {
    if (bluff) {
      // Challenger correctly caught the claimant. Claimant loses a life.
      return { ...loseLife(claimant), ...scoreFor(challenger), outcome: 'doubtCorrect' };
    }
    // Challenger wrongly doubted the truth. Challenger loses a life.
    return { ...loseLife(challenger), ...scoreFor(claimant), outcome: 'doubtWrong' };
  }

  // reaction === 'believe'
  if (bluff) {
    // Challenger was fooled. Challenger loses a life.
    return { ...loseLife(challenger), ...scoreFor(claimant), outcome: 'believedBluff' };
  }
  // Believed the truth — peaceful pass, no life lost, no score.
  return {
    playerLivesDelta: 0,
    aiLivesDelta: 0,
    playerScoreDelta: 0,
    aiScoreDelta: 0,
    outcome: 'safePass',
  };
};

// ---------------------------------------------------------------------------
// Match / winner helpers
// ---------------------------------------------------------------------------

export type Winner = 'player' | 'ai' | 'draw' | null;

export const decideWinner = (
  playerLives: number,
  aiLives: number,
): Winner => {
  if (playerLives <= 0 && aiLives <= 0) return 'draw';
  if (playerLives <= 0) return 'ai';
  if (aiLives <= 0) return 'player';
  return null;
};

export const DIFFICULTY_LIVES: Record<Difficulty, number> = {
  easy: 4,
  medium: 3,
  hard: 3,
  expert: 3,
  master: 2,
};
