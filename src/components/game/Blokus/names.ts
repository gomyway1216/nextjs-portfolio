/**
 * What seats and colours are called on screen: by the game, the results and the game record alike.
 */

import { SHARED, ownerOf, type Seating } from './seating';
import type { BlokusStrings } from './i18n';

export const humanCount = (seating: Seating): number => seating.seats.filter(({ controller }) => controller.kind === 'human').length;

export const listNames = (t: BlokusStrings, names: readonly string[]): string => names.reduce((first, second) => t.and(first, second));

export const seatName = (t: BlokusStrings, seating: Seating, seat: number): string => {
  const { controller, colors } = seating.seats[seat];
  if (controller.kind === 'ai') return t.ai(listNames(t, colors.map((color) => t.colors[seating.mode][color])));
  if (controller.name) return controller.name;
  return humanCount(seating) === 1 ? t.you : t.player(seat + 1);
};

/** What a colour's row is called. A person's colours are told apart by name once there is more than one to tell. */
export const colorName = (t: BlokusStrings, seating: Seating, color: number): string => {
  const name = t.colors[seating.mode][color];
  const owner = ownerOf(seating, color);
  if (owner === SHARED) return t.sharedColor(name);
  const seat = seating.seats[owner];
  if (seat.controller.kind === 'ai') return t.ai(name);
  return seat.colors.length > 1 || humanCount(seating) > 1 ? t.withColor(seatName(t, seating, owner), name) : seatName(t, seating, owner);
};
