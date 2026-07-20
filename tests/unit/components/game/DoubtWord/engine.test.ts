import { describe, expect, it } from 'vitest';

import {
  aiDoubtProbability,
  aiMakeClaim,
  aiReactToClaim,
  AI_PROFILES,
  claimMatchesWord,
  decideWinner,
  DIFFICULTY_LIVES,
  isBluffClaim,
  makeClaim,
  plausibility,
  resolveRound,
  sampleWords,
  WORD_POOL,
  type Claim,
  type Rng,
} from '@/components/game/DoubtWord/engine';
import type { Difficulty } from '@/components/game/common/types';

/** Deterministic RNG that cycles through a list of values in [0,1). */
const seq = (values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length];
};

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

describe('dictionary integrity', () => {
  it('contains only lowercase alphabetic words', () => {
    for (const w of WORD_POOL) {
      expect(w).toMatch(/^[a-z]+$/);
    }
  });

  it('has no duplicate words', () => {
    expect(new Set(WORD_POOL).size).toBe(WORD_POOL.length);
  });
});

describe('sampleWords', () => {
  it('returns the requested number of distinct words', () => {
    const words = sampleWords(3, seq([0.1, 0.4, 0.7, 0.2]));
    expect(words).toHaveLength(3);
    expect(new Set(words).size).toBe(3);
  });

  it('never exceeds the pool size', () => {
    const words = sampleWords(WORD_POOL.length + 10);
    expect(words.length).toBe(WORD_POOL.length);
  });
});

describe('claimMatchesWord / validation', () => {
  it('accepts a truthful claim', () => {
    expect(claimMatchesWord('galaxy', 'G', 6)).toBe(true);
  });

  it('is case-insensitive on the first letter', () => {
    expect(claimMatchesWord('galaxy', 'g', 6)).toBe(true);
  });

  it('rejects a wrong length', () => {
    expect(claimMatchesWord('galaxy', 'G', 5)).toBe(false);
  });

  it('rejects a wrong first letter', () => {
    expect(claimMatchesWord('galaxy', 'Z', 6)).toBe(false);
  });
});

describe('makeClaim', () => {
  it('produces a truthful claim when bluff=false', () => {
    const claim = makeClaim('player', 'rocket', false);
    expect(claim.claimedFirst).toBe('R');
    expect(claim.claimedLength).toBe(6);
    expect(claim.isBluff).toBe(false);
    expect(isBluffClaim(claim)).toBe(false);
  });

  it('ALWAYS yields a genuine bluff when bluff=true (regression: no accidental truths)', () => {
    // Exhaustively try every word across a fine grid of rng values.
    for (const word of WORD_POOL) {
      for (let r = 0; r < 40; r += 1) {
        const rng = seq([r / 40, (r * 7) % 40 / 40, (r * 13) % 40 / 40]);
        const claim = makeClaim('ai', word, true, rng);
        expect(claim.isBluff).toBe(true);
        // isBluff flag must agree with a from-scratch recomputation.
        expect(isBluffClaim(claim)).toBe(true);
        expect(
          claim.claimedFirst !== word[0].toUpperCase() ||
            claim.claimedLength !== word.length,
        ).toBe(true);
      }
    }
  });

  it('regression: a minimum-length word forced down the -1 path still bluffs', () => {
    // The original bug: for a length-3 word, distorting length by -1 clamped
    // back to 3 (Math.max(3, ...)), yielding an "unchanged" claim with
    // isBluff=false. Drive rng to select the length path with a downward delta
    // and the same first letter, then verify makeClaim never returns a truthful
    // claim. Uses a literal 3-letter word (the pool's shortest are 4 letters).
    const claim = makeClaim('player', 'sun', true, seq([0.0, 0.0, 0.0]));
    expect(claim.isBluff).toBe(true);
  });

  it('keeps claimedLength within sane bounds', () => {
    for (const word of WORD_POOL) {
      for (let r = 0; r < 20; r += 1) {
        const claim = makeClaim('ai', word, true, seq([r / 20, (r + 5) / 25]));
        expect(claim.claimedLength).toBeGreaterThanOrEqual(3);
        expect(claim.claimedLength).toBeLessThanOrEqual(9);
      }
    }
  });
});

describe('resolveRound', () => {
  const aiTruth: Claim = { speaker: 'ai', actualWord: 'galaxy', claimedFirst: 'G', claimedLength: 6, isBluff: false };
  const aiBluff: Claim = { speaker: 'ai', actualWord: 'galaxy', claimedFirst: 'Z', claimedLength: 6, isBluff: true };
  const playerTruth: Claim = { speaker: 'player', actualWord: 'rocket', claimedFirst: 'R', claimedLength: 6, isBluff: false };
  const playerBluff: Claim = { speaker: 'player', actualWord: 'rocket', claimedFirst: 'X', claimedLength: 6, isBluff: true };

  it('player doubts an AI bluff -> AI loses a life, player scores', () => {
    const d = resolveRound(aiBluff, 'doubt');
    expect(d.aiLivesDelta).toBe(-1);
    expect(d.playerLivesDelta).toBe(0);
    expect(d.playerScoreDelta).toBe(1);
    expect(d.outcome).toBe('doubtCorrect');
  });

  it('player doubts an AI truth -> player loses a life, AI scores', () => {
    const d = resolveRound(aiTruth, 'doubt');
    expect(d.playerLivesDelta).toBe(-1);
    expect(d.aiScoreDelta).toBe(1);
    expect(d.outcome).toBe('doubtWrong');
  });

  it('player believes an AI bluff -> player loses a life (fooled)', () => {
    const d = resolveRound(aiBluff, 'believe');
    expect(d.playerLivesDelta).toBe(-1);
    expect(d.aiScoreDelta).toBe(1);
    expect(d.outcome).toBe('believedBluff');
  });

  it('player believes an AI truth -> safe pass, nobody loses', () => {
    const d = resolveRound(aiTruth, 'believe');
    expect(d.playerLivesDelta).toBe(0);
    expect(d.aiLivesDelta).toBe(0);
    expect(d.playerScoreDelta).toBe(0);
    expect(d.aiScoreDelta).toBe(0);
    expect(d.outcome).toBe('safePass');
  });

  it('is symmetric when the player is the claimant', () => {
    // AI doubts a player bluff -> player (claimant) loses.
    const caught = resolveRound(playerBluff, 'doubt');
    expect(caught.playerLivesDelta).toBe(-1);
    expect(caught.aiScoreDelta).toBe(1);
    expect(caught.outcome).toBe('doubtCorrect');

    // AI believes a player bluff -> AI (challenger) loses; player scores.
    const fooled = resolveRound(playerBluff, 'believe');
    expect(fooled.aiLivesDelta).toBe(-1);
    expect(fooled.playerScoreDelta).toBe(1);
    expect(fooled.outcome).toBe('believedBluff');

    // AI doubts a player truth -> AI (challenger) loses.
    const wrong = resolveRound(playerTruth, 'doubt');
    expect(wrong.aiLivesDelta).toBe(-1);
    expect(wrong.playerScoreDelta).toBe(1);
    expect(wrong.outcome).toBe('doubtWrong');
  });

  it('recomputes bluff status from the word, ignoring a stale isBluff flag', () => {
    // Flag lies (says truth) but the letter clearly does not match the word.
    const lying: Claim = { speaker: 'ai', actualWord: 'galaxy', claimedFirst: 'Q', claimedLength: 6, isBluff: false };
    const d = resolveRound(lying, 'doubt');
    expect(d.outcome).toBe('doubtCorrect'); // treated as a bluff correctly
    expect(d.aiLivesDelta).toBe(-1);
  });
});

describe('decideWinner', () => {
  it('returns null while both sides have lives', () => {
    expect(decideWinner(2, 3)).toBeNull();
  });
  it('player wins when AI hits zero', () => {
    expect(decideWinner(1, 0)).toBe('player');
  });
  it('AI wins when player hits zero', () => {
    expect(decideWinner(0, 2)).toBe('ai');
  });
  it('draw when both are zero', () => {
    expect(decideWinner(0, 0)).toBe('draw');
  });
});

describe('difficulty scaling', () => {
  it('assigns lives per difficulty', () => {
    expect(DIFFICULTY_LIVES.easy).toBeGreaterThanOrEqual(DIFFICULTY_LIVES.master);
    for (const d of ALL_DIFFICULTIES) {
      expect(DIFFICULTY_LIVES[d]).toBeGreaterThan(0);
    }
  });

  it('read skill increases monotonically with tier', () => {
    const skills = ALL_DIFFICULTIES.map((d) => AI_PROFILES[d].readSkill);
    for (let i = 1; i < skills.length; i += 1) {
      expect(skills[i]).toBeGreaterThanOrEqual(skills[i - 1]);
    }
  });
});

describe('plausibility & AI reading', () => {
  it('rates a real (letter,length) signature higher than an impossible one', () => {
    // 'galaxy' exists (G,6). No word is (Q, 9) in the pool.
    expect(plausibility('G', 6)).toBeGreaterThan(plausibility('Q', 9));
  });

  it('a stronger AI doubts an implausible claim more often than a weaker one', () => {
    const implausible = { claimedFirst: 'Q', claimedLength: 9 };
    const easyP = aiDoubtProbability(implausible, AI_PROFILES.easy);
    const masterP = aiDoubtProbability(implausible, AI_PROFILES.master);
    expect(masterP).toBeGreaterThan(easyP);
  });

  it('master AI reliably doubts a blatantly impossible claim', () => {
    // With zero-ish noise and high read skill, doubt probability should be high.
    let doubts = 0;
    const trials = 200;
    for (let i = 0; i < trials; i += 1) {
      const rng = seq([i / trials, ((i * 37) % 100) / 100, ((i * 53) % 100) / 100]);
      if (aiReactToClaim({ claimedFirst: 'Q', claimedLength: 9 }, 'master', rng) === 'doubt') {
        doubts += 1;
      }
    }
    expect(doubts / trials).toBeGreaterThan(0.6);
  });

  it('AI believes a highly plausible truthful claim most of the time', () => {
    let believes = 0;
    const trials = 200;
    // (S,6) is common (signal, shadow, socket, summit, stream, silver, ...).
    for (let i = 0; i < trials; i += 1) {
      const rng = seq([((i * 29) % 100) / 100, ((i * 71) % 100) / 100, i / trials]);
      if (aiReactToClaim({ claimedFirst: 'S', claimedLength: 6 }, 'master', rng) === 'believe') {
        believes += 1;
      }
    }
    expect(believes / trials).toBeGreaterThan(0.6);
  });
});

describe('suspicion calibration (regression: truth-telling must not farm high tiers)', () => {
  const truthful = (w: string) => ({
    claimedFirst: w[0].toUpperCase(),
    claimedLength: w.length,
  });

  it('keeps master doubt probability well below a coin flip for EVERY truthful signature', () => {
    // Doubting the truth costs the challenger a life, so a master that doubts
    // typical truths lets "always tell the truth" trivially win the match.
    for (const w of WORD_POOL) {
      expect(aiDoubtProbability(truthful(w), AI_PROFILES.master)).toBeLessThan(0.4);
    }
  });

  it('master doubts truthful claims less than easy, and impossible claims more', () => {
    for (const w of WORD_POOL) {
      const m = aiDoubtProbability(truthful(w), AI_PROFILES.master);
      const e = aiDoubtProbability(truthful(w), AI_PROFILES.easy);
      expect(m).toBeLessThan(e);
    }
    const impossible = { claimedFirst: 'Q', claimedLength: 9 };
    expect(aiDoubtProbability(impossible, AI_PROFILES.master))
      .toBeGreaterThan(aiDoubtProbability(impossible, AI_PROFILES.easy));
  });

  it('master mostly believes even the rarest truthful signature', () => {
    // (G,6) matches only 'galaxy' — the least-plausible kind of honest claim.
    let believes = 0;
    const trials = 200;
    for (let i = 0; i < trials; i += 1) {
      const rng = seq([((i * 29) % 100) / 100, ((i * 71) % 100) / 100, i / trials]);
      if (aiReactToClaim({ claimedFirst: 'G', claimedLength: 6 }, 'master', rng) === 'believe') {
        believes += 1;
      }
    }
    expect(believes / trials).toBeGreaterThan(0.6);
  });
});

describe('aiMakeClaim', () => {
  it('produces a valid claim about the given word', () => {
    for (const word of WORD_POOL.slice(0, 12)) {
      for (const d of ALL_DIFFICULTIES) {
        const claim = aiMakeClaim(word, d, seq([0.9, 0.1, 0.5, 0.3, 0.8]));
        expect(claim.actualWord).toBe(word);
        // isBluff flag is internally consistent with the word.
        expect(claim.isBluff).toBe(isBluffClaim(claim));
      }
    }
  });

  it('does not bluff when the bluff roll fails', () => {
    // First rng value >= bluffRate => truthful.
    const claim = aiMakeClaim('galaxy', 'medium', seq([0.99]));
    expect(claim.isBluff).toBe(false);
  });

  it('stronger AI bluffs are at least as plausible as raw random bluffs on average', () => {
    const word = 'galaxy';
    let masterSum = 0;
    let easySum = 0;
    const trials = 60;
    for (let i = 0; i < trials; i += 1) {
      const base = [((i * 17) % 100) / 100, ((i * 31) % 100) / 100, ((i * 43) % 100) / 100, ((i * 59) % 100) / 100];
      const m = aiMakeClaim(word, 'master', seq([0.0, ...base]));
      const e = aiMakeClaim(word, 'easy', seq([0.0, ...base]));
      masterSum += plausibility(m.claimedFirst, m.claimedLength);
      easySum += plausibility(e.claimedFirst, e.claimedLength);
    }
    expect(masterSum).toBeGreaterThanOrEqual(easySum);
  });
});
