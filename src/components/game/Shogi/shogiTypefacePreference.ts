/**
 * Shared definition of the piece-typeface preference.
 *
 * Split out of the (client-only) selector so the storage key, the default face
 * and the value guard have one home that a Server Component or a test can
 * import without pulling in the component.
 */

export type ShogiTypeface = 'kiyoyasu' | 'ryoko' | 'classic';

export const SHOGI_TYPEFACE_STORAGE_KEY = 'shogi-koma-typeface';
export const SHOGI_TYPEFACE_DEFAULT: ShogiTypeface = 'kiyoyasu';
/**
 * `<html>` dataset property ShogiPiece.module.css keys off. Only non-default
 * faces set it; the default is represented by the attribute being absent, so
 * server markup and client DOM agree before the preference is known.
 */
export const SHOGI_TYPEFACE_DATASET_KEY = 'shogiTypeface';

export function isShogiTypeface(value: string | null | undefined): value is ShogiTypeface {
  return value === 'kiyoyasu' || value === 'ryoko' || value === 'classic';
}
