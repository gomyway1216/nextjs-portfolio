/**
 * The cabinet's control panel as an object: what its displays light and what
 * lies in its tray. Pure: the pictures are drawn from these by the panel's
 * components, and nothing here knows of the machine but a count of medals
 * and, for what the tray acts out, what the cabinet says happened to them.
 *
 * A real station shows its numbers on displays, not in type, and the medals
 * a player has won lie in a tray in front of them, where the machine pays
 * them out and from where they are fed back in. The counter here is a row of
 * seven-segment digits; the tray holds a heap that is as many medals as the
 * purse holds, up to what can be drawn.
 */

// ---------- Seven-segment digits ----------

/** The seven segments of a digit, in the order they are always named: a at the top, round clockwise to f, and g across the middle. */
export const SEGMENT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
export type SegmentName = (typeof SEGMENT_NAMES)[number];

/** The segments each digit lights. */
export const SEGMENTS: Readonly<Record<string, string>> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

/**
 * What a display of `places` digits lights to show `value`, the leftmost
 * place first: for each place the segments that are lit, '' for a place left
 * dark. A number is shown with nothing in front of it, as a counter shows
 * it: 42 on five places is three dark places and then 4 and 2. Anything that
 * is not a digit in `value` (the comma in 1,234) is passed over. A number too
 * long for the display shows its last places, as a counter that has gone
 * round does; nothing but a whole number of medals ever comes here, and none
 * that long.
 */
export function segmentsFor(value: number | string, places: number): string[] {
  if (!Number.isInteger(places) || places < 1) throw new Error('a display has a whole number of places, at least one');
  const text = typeof value === 'number' ? (Number.isFinite(value) ? String(Math.max(0, Math.trunc(value))) : '') : value;
  const digits = [...text].filter((char) => char in SEGMENTS).slice(-places);
  const shown: string[] = new Array<string>(places - digits.length).fill('');
  for (const digit of digits) shown.push(SEGMENTS[digit]);
  return shown;
}

/**
 * Where each segment is drawn in a digit's cell, as the points of a polygon.
 * The cell is 12 wide and 20 high; the bars are 2 thick with mitred ends, and
 * the digit leans a little to the right, as the displays in a cabinet do.
 */
export const SEGMENT_SHAPES: Readonly<Record<SegmentName, string>> = {
  a: '2.6,1 9.4,1 8.4,3 3.6,3',
  b: '10,1.6 11,2.6 11,9.2 10,10 9,9 9,3.6',
  c: '10,10 11,10.8 11,17.4 10,18.4 9,16.4 9,11',
  d: '3.6,17 8.4,17 9.4,19 2.6,19',
  e: '2,10 3,11 3,16.4 2,18.4 1,17.4 1,10.8',
  f: '2,1.6 3,3.6 3,9 2,10 1,9.2 1,2.6',
  g: '3,10 3.8,9 8.2,9 9,10 8.2,11 3.8,11',
};
export const SEGMENT_CELL = { width: 12, height: 20, lean: -6 } as const;

// ---------- The tray ----------

/**
 * The rows of the heap, the bottom row first: how many medals lie in each.
 * A full heap is a mound sixty medals high-piled; more than that in the
 * purse is more of the same, and the counter says how many.
 */
export const HEAP_ROWS = [11, 10, 9, 8, 7, 6, 5, 4] as const;
export const HEAP_CAP = HEAP_ROWS.reduce((sum, row) => sum + row, 0);

/** The tray's drawing, in its own units: the dish, the mouth of the chute the machine pays through, and a medal lying in it. */
export const TRAY = {
  width: 120,
  height: 54,
  /** The floor of the dish, where the bottom row lies. */
  floor: 47,
  /** The chute's mouth, at the back of the dish: a medal comes out of it and falls into the heap. */
  chute: { x: 60, y: 6, width: 26 },
  /** A medal as it lies: an ellipse, seen from the player's seat. */
  medal: { rx: 5.1, ry: 3, step: 9.6, rise: 4.6 },
} as const;

/** A medal's place in the heap. */
export interface HeapSpot {
  x: number;
  y: number;
  /** How far it is turned as it lies, in degrees: a few either way. */
  tilt: number;
  /** Which row it lies in, from the bottom. */
  row: number;
}

/** A number between 0 and 1 that is always the same for the same `n`: the heap is not shuffled when a medal is added. */
const scatter = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Where the medals of a full heap lie, in the order they are heaped: the
 * bottom row from the middle outwards, then the row on it, and so on up.
 * Every medal has its own place, so a heap of 20 is the first 20 of these
 * and the 21st medal lands on them without moving any.
 */
export const HEAP_SPOTS: readonly HeapSpot[] = HEAP_ROWS.flatMap((count, row) => {
  const { medal, floor, width } = TRAY;
  const spots: HeapSpot[] = [];
  for (let place = 0; place < count; place++) {
    // From the middle outwards: 0, +1, -1, +2, -2 …, so each row grows as a mound and not from one side.
    const off = place === 0 ? 0 : Math.ceil(place / 2) * (place % 2 === 1 ? 1 : -1);
    const shift = count % 2 === 0 ? 0.5 : 0;
    const n = row * 16 + place;
    spots.push({
      x: width / 2 + (off - shift) * medal.step + (scatter(n) - 0.5) * 1.6,
      y: floor - row * medal.rise + (scatter(n + 0.5) - 0.5) * 1.2,
      tilt: (scatter(n + 0.25) - 0.5) * 16,
      row,
    });
  }
  return spots;
});

/** How many medals are drawn in the tray for a purse of `credits`: every one of them, up to a full heap. */
export const heapCount = (credits: number): number => (Number.isFinite(credits) ? Math.min(HEAP_CAP, Math.max(0, Math.floor(credits))) : 0);

// ---------- What the tray acts out ----------

/** Why medals have come into the purse: over the front of the field, as the day's bonus, or as a refill. */
export type TrayCause = 'won' | 'bonus' | 'refill';

/**
 * How each of them comes into the tray. What the machine pays, it pays out of
 * the chute at the back of the dish: medals that were won a few close
 * together, as they went over the front, and the day's bonus a longer run of
 * them, counted out. A refill is not paid by the machine: it is a cupful
 * tipped in over the rim, and comes down all across the dish at once.
 *
 * `medals` is the most that are drawn on their way (more than that come as
 * these few, each standing for its share), `apart` the milliseconds from one
 * setting off to the next, and `time` how long each is in the air.
 */
export const TRAY_ARRIVAL: Readonly<Record<TrayCause, { from: 'chute' | 'cup'; medals: number; apart: number; time: number }>> = {
  won: { from: 'chute', medals: 6, apart: 70, time: 300 },
  bonus: { from: 'chute', medals: 10, apart: 90, time: 300 },
  refill: { from: 'cup', medals: 12, apart: 45, time: 260 },
};
/** A medal that is fed: how long it takes to leave the heap, and how far it goes towards its button and up out of the dish, in the tray's units. */
export const TRAY_LEAVE = { time: 220, reach: 52, lift: 10 } as const;
/** The medals that may be in the air at once, coming and going. More are still counted, and still heard: they are only not drawn. */
export const TRAY_AIR = { in: 14, out: 4 } as const;

/** A medal on its way: coming down into the tray to its place, or leaving the heap towards the button that fed it. */
export interface TrayFlight {
  id: number;
  way: 'in' | 'out';
  /** For one coming in, what it came out of. */
  from: 'chute' | 'cup' | null;
  /** The place of the heap it lands on, or leaves from, and where that is. */
  place: number;
  x: number;
  y: number;
  /** For one coming in, where it sets off, from where it lands; for one leaving, where it goes, from where it lay. */
  dx: number;
  dy: number;
  /** How long after it was told of it sets off, in milliseconds: several at once come one after another. */
  delay: number;
  /** How long it is in the air, in milliseconds. */
  time: number;
  /** When it has landed, or gone, on the clock of whoever said what happened. */
  lands: number;
  /** The places of the heap that are not seen until it has landed: its own, and those of the medals it stands for. */
  hides: readonly number[];
  /** How many medals it stands for. They are all heard when it lands. */
  medals: number;
}

/** The medals in the air over the tray, in the order they set off, and the name the next one gets. */
export interface TrayAir {
  flights: readonly TrayFlight[];
  next: number;
}

/** A tray with nothing in the air. */
export const STILL_TRAY: TrayAir = { flights: [], next: 1 };

/** What happened to the purse, as the machine tells it. The tray is never left to guess it from how many medals there are. */
export interface TrayNews {
  /** The purse when all of it had happened. */
  purse: number;
  /** The medals that were fed, each towards its button: the left (-1) or the right (1). */
  fed: readonly (-1 | 1)[];
  /** The medals that came in, by what brought them. */
  arrived: readonly { cause: TrayCause; count: number }[];
}

/** The places of the heap whose medals are still on their way: they are not drawn until the medal that hides them has landed. */
export function trayHidden(air: TrayAir): Set<number> {
  const hidden = new Set<number>();
  for (const flight of air.flights) for (const place of flight.hides) hidden.add(place);
  return hidden;
}

/** A flight that can still be changed while the news is gone through. */
type Flying = Omit<TrayFlight, 'hides'> & { hides: number[] };

/**
 * One medal is fed out of a purse that held `before`. It is the top medal
 * lying in the heap that is taken, and it leaves towards its button. Where
 * the heap is one place shorter for it and a medal is still on its way to
 * that place, that medal fills the place the taken one left instead, so
 * there are never more medals in the picture than in the purse, or fewer.
 */
function feedOne(flights: Flying[], side: -1 | 1, before: number, id: number, now: number): void {
  const had = heapCount(before);
  const hidden = new Set(flights.flatMap((flight) => flight.hides));
  let top = had - 1;
  while (top >= 0 && hidden.has(top)) top--;
  // A purse with more medals than the heap shows is still a full heap with one fewer in it.
  if (heapCount(before - 1) < had && top !== had - 1) {
    const carrier = flights.find((flight) => flight.hides.includes(had - 1));
    if (carrier) carrier.hides = carrier.hides.flatMap((place) => (place !== had - 1 ? [place] : top >= 0 ? [top] : []));
  }
  // With no medal lying there yet, none is seen to leave; and no more leave at once than can be followed.
  if (top < 0 || flights.filter((flight) => flight.way === 'out').length >= TRAY_AIR.out) return;
  const spot = HEAP_SPOTS[top];
  flights.push({ id, way: 'out', from: null, place: top, x: spot.x, y: spot.y, dx: side * TRAY_LEAVE.reach, dy: -TRAY_LEAVE.lift, delay: 0, time: TRAY_LEAVE.time, lands: now + TRAY_LEAVE.time, hides: [], medals: 1 });
}

/**
 * `count` medals come into a purse that held `before`, brought by `cause`.
 * The places they add to the heap are shared among the medals drawn on their
 * way, and each is hidden until its own medal has landed. Returns how many
 * flights were made. With the air already full they come down with the last
 * of those on their way instead: its places and theirs are seen together.
 */
function arriveAll(flights: Flying[], cause: TrayCause, count: number, before: number, id: number, now: number): number {
  const how = TRAY_ARRIVAL[cause];
  const had = heapCount(before);
  const fresh = heapCount(before + count) - had;
  const coming = flights.filter((flight) => flight.way === 'in');
  const made = Math.min(how.medals, count, TRAY_AIR.in - coming.length);
  if (made <= 0) {
    const last = coming[coming.length - 1];
    last.medals += count;
    for (let place = had; place < had + fresh; place++) last.hides.push(place);
    return 0;
  }
  for (let n = 0; n < made; n++) {
    const hides: number[] = [];
    for (let place = had + Math.floor((n * fresh) / made); place < had + Math.floor(((n + 1) * fresh) / made); place++) hides.push(place);
    // Each drops to a place of its own: the last of those it brings, or the top of a heap that is already full.
    const place = hides.length > 0 ? hides[hides.length - 1] : Math.max(0, had + fresh - 1 - (n % HEAP_ROWS[HEAP_ROWS.length - 1]));
    const spot = HEAP_SPOTS[place];
    const name = id + n;
    const chute = how.from === 'chute';
    // Out of the chute's mouth, anywhere across it; or over the rim, from above where it lands, give or take.
    const fromX = chute ? TRAY.chute.x + (scatter(name + 0.75) - 0.5) * (TRAY.chute.width - 4 * TRAY.medal.rx) : spot.x + (scatter(name + 0.75) - 0.5) * 3 * TRAY.medal.rx;
    const fromY = chute ? TRAY.chute.y : -2 * TRAY.medal.ry;
    flights.push({
      id: name,
      way: 'in',
      from: how.from,
      place,
      x: spot.x,
      y: spot.y,
      dx: fromX - spot.x,
      dy: fromY - spot.y,
      delay: n * how.apart,
      time: how.time,
      lands: now + n * how.apart + how.time,
      hides,
      medals: Math.floor(((n + 1) * count) / made) - Math.floor((n * count) / made),
    });
  }
  return made;
}

/**
 * The medals in the air once `news` has happened, at `now` on the teller's
 * clock (in milliseconds). The medals that were fed leave first, each from
 * the purse as it then was, and then what came in arrives, in the order it
 * is told: the purse before any of it is worked back from the purse after
 * all of it.
 *
 * Nothing here looks at how much the purse changed to tell why. A machine
 * that is restored, reset or swapped for the account's has no news, and so
 * nothing is acted out for it, whatever the difference between the purses.
 */
export function trayHappen(air: TrayAir, news: TrayNews, now: number): TrayAir {
  const arrived = news.arrived.filter((one) => Number.isInteger(one.count) && one.count > 0);
  const after = Number.isFinite(news.purse) ? Math.max(0, Math.floor(news.purse)) : 0;
  let purse = Math.max(0, after - arrived.reduce((sum, one) => sum + one.count, 0)) + news.fed.length;
  let next = air.next;
  const flights: Flying[] = air.flights.map((flight) => ({ ...flight, hides: [...flight.hides] }));
  for (const side of news.fed) {
    feedOne(flights, side, purse, next++, now);
    purse -= 1;
  }
  for (const { cause, count } of arrived) {
    next += arriveAll(flights, cause, count, purse, next, now);
    purse += count;
  }
  return { flights, next };
}

/** When the next of the medals in the air lands, on the clock they were told on; null with none in the air. */
export const trayDue = (air: TrayAir): number | null => (air.flights.length === 0 ? null : Math.min(...air.flights.map((flight) => flight.lands)));

/** The medals that have landed, or gone, by `now`. */
export const trayLanding = (air: TrayAir, now: number): TrayFlight[] => air.flights.filter((flight) => flight.lands <= now);

/** The air with those taken out of it: the places they hid are seen. */
export const trayLand = (air: TrayAir, now: number): TrayAir => ({ flights: air.flights.filter((flight) => flight.lands > now), next: air.next });

/**
 * The air with nothing in it, and every place seen. For a device that has
 * asked for less motion while medals were on their way (they are no longer
 * drawn, and would never be seen to land), and for a machine that has been
 * put up in place of another: the medals in the air were the old one's.
 */
export const trayStill = (air: TrayAir): TrayAir => (air.flights.length === 0 ? air : { flights: [], next: air.next });

// ---------- The medals' tone ----------

/**
 * A colour with washes laid over it, one after another, as the field's
 * renderer lays them over a medal's face: `base` is `#rrggbb`, each wash an
 * `rgba(r, g, b, a)`. The tray's medals are toned with the field's own
 * washes, so that a medal in the tray is the medal that was on the table.
 */
export function washed(base: string, washes: readonly string[]): string {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(base);
  if (!hex) throw new Error(`not a colour: ${base}`);
  let channels = hex.slice(1).map((pair) => parseInt(pair, 16));
  for (const wash of washes) {
    const parts = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(wash);
    if (!parts) throw new Error(`not a wash: ${wash}`);
    const alpha = Number(parts[4]);
    channels = channels.map((channel, index) => channel * (1 - alpha) + Number(parts[index + 1]) * alpha);
  }
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}
