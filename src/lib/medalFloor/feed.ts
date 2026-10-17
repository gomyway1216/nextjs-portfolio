/**
 * The floor's feed as the Realtime Database holds it (a ring of slots under
 * `medalFloor/feed`), read into moments. Shared by the server, which reads it
 * with the Admin SDK, and by the browser, which listens to it.
 */

import { isFloorGame } from './games';
import { isTag } from './names';
import type { FloorFeedEntry } from './types';

/** Where the moments on show are kept in the Realtime Database: the one part of the floor anybody may read directly. */
export const FLOOR_FEED_PATH = 'medalFloor/feed';

const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {});

/** The moments on show, newest first, from the ring as the database holds it. Anything malformed is left out. */
export function feedFrom(value: unknown): FloorFeedEntry[] {
  const entries: FloorFeedEntry[] = [];
  for (const raw of Object.values(asRecord(value))) {
    const entry = asRecord(raw);
    if (!Number.isSafeInteger(entry.id) || !isFloorGame(entry.game) || !isTag(entry.tag) || !Number.isSafeInteger(entry.medals) || !Number.isFinite(entry.at)) continue;
    entries.push({
      id: entry.id as number,
      name: typeof entry.name === 'string' ? entry.name : null,
      tag: entry.tag,
      game: entry.game,
      label: typeof entry.label === 'string' ? entry.label : null,
      medals: entry.medals as number,
      at: entry.at as number,
    });
  }
  return entries.sort((a, b) => b.id - a.id);
}
