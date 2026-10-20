/**
 * The machine's stable: the twelve horses that run on its miniature track, six
 * at a time. Every name, colour and set of silks is the machine's own,
 * invented for it; none is a real horse's (the names were looked up in the
 * horse-racing databases before they were chosen, and no horse runs or ran
 * under any of them).
 *
 * A horse's `rating` is how strong it is; each race adds the day's form to it
 * (card.ts), and the odds on the board come from that. Its `style` is how it
 * likes to run, which the race's animation follows (race.ts): a front-runner
 * goes for the lead, a closer comes from behind. The style changes nothing
 * about who wins: the result is drawn from the odds before the gates open.
 */

export type RunningStyle = 'front' | 'stalker' | 'closer' | 'deep';

/** The pattern of a jockey's silks. */
export type SilksPattern = 'plain' | 'hoops' | 'sash' | 'halves' | 'stripes' | 'diamond';

export interface Horse {
  /** Its name in the records: letters and hyphens. */
  id: string;
  name: { en: string; ja: string };
  rating: number;
  style: RunningStyle;
  /** Its coat. */
  coat: string;
  silks: { body: string; trim: string; pattern: SilksPattern };
}

export const STABLE: readonly Horse[] = [
  { id: 'calico-light', name: { en: 'Calico Light', ja: 'ミケノヒカリ' }, rating: 12, style: 'stalker', coat: '#8a5a32', silks: { body: '#f2f2f2', trim: '#e07a1f', pattern: 'halves' } },
  { id: 'velvet-comet', name: { en: 'Velvet Comet', ja: 'ベルベットコメット' }, rating: 10, style: 'closer', coat: '#3b2a22', silks: { body: '#5b2a86', trim: '#f2c94c', pattern: 'sash' } },
  { id: 'blossom-march', name: { en: 'Blossom March', ja: 'ハナサキマーチ' }, rating: 8.5, style: 'front', coat: '#a0522d', silks: { body: '#f4a6c0', trim: '#ffffff', pattern: 'hoops' } },
  { id: 'sky-pocket', name: { en: 'Sky Pocket', ja: 'アオゾラポッケ' }, rating: 7, style: 'stalker', coat: '#6b4226', silks: { body: '#5ab0e6', trim: '#ffffff', pattern: 'stripes' } },
  { id: 'acorn-dash', name: { en: 'Acorn Dash', ja: 'ドングリダッシュ' }, rating: 6, style: 'front', coat: '#7a4b24', silks: { body: '#8b5a2b', trim: '#f2d16b', pattern: 'diamond' } },
  { id: 'milk-tea-run', name: { en: 'Milk Tea Run', ja: 'ミルクティーラン' }, rating: 5, style: 'deep', coat: '#c49a6c', silks: { body: '#d9b48f', trim: '#6b3e1e', pattern: 'plain' } },
  { id: 'sunset-train', name: { en: 'Sunset Train', ja: 'ユウヤケトレイン' }, rating: 4.2, style: 'closer', coat: '#4a2e1f', silks: { body: '#ef6c3a', trim: '#5a1f6b', pattern: 'hoops' } },
  { id: 'windup-boy', name: { en: 'Windup Boy', ja: 'ネジマキボーイ' }, rating: 3.5, style: 'front', coat: '#9c6b3f', silks: { body: '#9aa3ad', trim: '#c0392b', pattern: 'halves' } },
  { id: 'ramune-splash', name: { en: 'Ramune Splash', ja: 'ラムネスプラッシュ' }, rating: 3, style: 'stalker', coat: '#5c3b28', silks: { body: '#7fd6d0', trim: '#1f4e8c', pattern: 'diamond' } },
  { id: 'custard-crown', name: { en: 'Custard Crown', ja: 'カスタードクラウン' }, rating: 2.5, style: 'deep', coat: '#b07a45', silks: { body: '#f6d55c', trim: '#2b2b2b', pattern: 'sash' } },
  { id: 'popcorn-hop', name: { en: 'Popcorn Hop', ja: 'ポップコーンホップ' }, rating: 2, style: 'closer', coat: '#d1b07c', silks: { body: '#ffffff', trim: '#d63031', pattern: 'stripes' } },
  { id: 'leaping-parade', name: { en: 'Leaping Parade', ja: 'ハネウマパレード' }, rating: 1.5, style: 'front', coat: '#2f2019', silks: { body: '#2e8b57', trim: '#ffffff', pattern: 'plain' } },
];

export const horseById = (id: string): Horse | undefined => STABLE.find((horse) => horse.id === id);

/**
 * The colour of each gate (枠), as on a Japanese racecourse's number cloths
 * and caps: 1 white, 2 black, 3 red, 4 blue, 5 yellow, 6 green, each with the
 * colour its number is printed in. The green is a shade darker than the
 * course's, so that its white number is at least 4.5:1 (#1f8f4e was 4.1:1).
 */
export const GATE_COLOURS: readonly { cloth: string; number: string }[] = [
  { cloth: '#f5f5f5', number: '#1b1b1b' },
  { cloth: '#1b1b1b', number: '#ffffff' },
  { cloth: '#d6262e', number: '#ffffff' },
  { cloth: '#1f5fbf', number: '#ffffff' },
  { cloth: '#f2d21b', number: '#1b1b1b' },
  { cloth: '#1a7f45', number: '#ffffff' },
];
