import { describe, expect, it } from 'vitest';
import {
  SHOGI_TYPEFACE_DATASET_KEY,
  SHOGI_TYPEFACE_DEFAULT,
  SHOGI_TYPEFACE_STORAGE_KEY,
  isShogiTypeface,
} from '@/components/game/Shogi/shogiTypefacePreference';

describe('shogi typeface preference', () => {
  it('accepts only the three shipped faces', () => {
    expect(isShogiTypeface('kiyoyasu')).toBe(true);
    expect(isShogiTypeface('ryoko')).toBe(true);
    expect(isShogiTypeface('classic')).toBe(true);
  });

  it('rejects anything else, so a corrupt stored value falls back to the default', () => {
    expect(isShogiTypeface('mincho')).toBe(false);
    expect(isShogiTypeface('"><script>')).toBe(false);
    expect(isShogiTypeface('')).toBe(false);
    expect(isShogiTypeface(null)).toBe(false);
    expect(isShogiTypeface(undefined)).toBe(false);
  });

  it('pins the persisted key and the default face', () => {
    // Changing either silently resets every player's saved choice.
    expect(SHOGI_TYPEFACE_STORAGE_KEY).toBe('shogi-koma-typeface');
    expect(SHOGI_TYPEFACE_DEFAULT).toBe('kiyoyasu');
    expect(isShogiTypeface(SHOGI_TYPEFACE_DEFAULT)).toBe(true);
  });

  it('names the dataset key the piece CSS selects on', () => {
    // ShogiPiece.module.css: html[data-shogi-typeface='ryoko'] .glyph { … }
    expect(SHOGI_TYPEFACE_DATASET_KEY).toBe('shogiTypeface');
  });
});
