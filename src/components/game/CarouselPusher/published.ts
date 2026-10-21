/**
 * Cherry Blossom Carousel's returns as the machine publishes them: what `scripts/carousel-pusher-tune.ts` measured,
 * playing the machine as it is (engine.ts and lottery.ts) for millions of medals each way, on twelve seeded machines at
 * once (sim.ts says what each way is). A pusher's field is worked out by its physics, not by a formula, so its return
 * is measured, not reckoned: each figure is the medals back over the medals fed, with the half-width of its 95%
 * confidence interval from the spread of 5,000-medal batches.
 *
 * The page shows these, so that opening it never plays a medal. `tests/unit/components/game/CarouselPusher/published.test.tsx`
 * pins the machine they were measured on (every number of the field, the carousel, the holes, the rail, the dish and
 * the counter), so that a change to any of them fails until the measurement is made again and written out here; and it
 * plays a short seeded run of each way, which must come out exactly as it did when these were measured.
 */

export interface WayFigures {
  /** Medals fed, and the batches they were measured in. */
  medals: number;
  batches: number;
  /** Medals back over medals fed, and the half-width of its 95% confidence interval. */
  return: number;
  half: number;
  /** Per medal fed: off the front edge, thrown straight into the tray by a jackpot, and the counter's prizes. */
  front: number;
  thrownIn: number;
  prizes: number;
  /** Per medal fed: into a hole, and of those, the ones that came down in it, and the ones four waiting spins wasted. */
  pockets: number;
  direct: number;
  wasted: number;
  /** Of the medals that left the field, the share that left it into the tray. */
  fieldShare: number;
  /** Jackpots per 1,000 medals fed, and the medals the dish threw out on average. */
  jackpotsPer1000: number;
  thrownPerJackpot: number;
}

export interface CarouselFigures {
  /** How the measurement was made. */
  method: { machines: number; batch: number; warmup: number; script: string };
  ways: Readonly<Record<'timed' | 'steady' | 'held', WayFigures>>;
}

export const PUBLISHED_CAROUSEL: Readonly<CarouselFigures> = {
  method: { machines: 12, batch: 5_000, warmup: 500, script: 'scripts/carousel-pusher-tune.ts' },
  ways: {
    timed: {
      medals: 6_000_000,
      batches: 1_200,
      return: 0.906_040_8,
      half: 0.002_979_3,
      front: 0.464_647_3,
      thrownIn: 0.011_173_8,
      prizes: 0.430_219_7,
      pockets: 0.358_524_5,
      direct: 0.300_034_5,
      wasted: 0,
      fieldShare: 0.575_310_6,
      jackpotsPer1000: 0.875_333,
      thrownPerJackpot: 202.6,
    },
    steady: {
      medals: 4_000_008,
      batches: 804,
      return: 0.803_889_6,
      half: 0.004_807_2,
      front: 0.532_599_7,
      thrownIn: 0.009_889_5,
      prizes: 0.261_400_5,
      pockets: 0.217_752_3,
      direct: 0.184_527_6,
      wasted: 0.000_001_2,
      fieldShare: 0.573_162_3,
      jackpotsPer1000: 0.544_999,
      thrownPerJackpot: 287.8,
    },
    held: {
      medals: 4_000_008,
      batches: 804,
      return: 0.697_747_1,
      half: 0.006_056_5,
      front: 0.526_283_9,
      thrownIn: 0.009_098_7,
      prizes: 0.162_364_4,
      pockets: 0.217_960_6,
      direct: 0.184_948_9,
      wasted: 0.081_969_1,
      fieldShare: 0.573_712_8,
      jackpotsPer1000: 0.338_999,
      thrownPerJackpot: 425.8,
    },
  },
};
