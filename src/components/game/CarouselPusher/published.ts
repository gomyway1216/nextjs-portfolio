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

/** One way of choosing the moment, as the scan names it (scripts/carousel-pusher-lead-scan.ts), and what it brought back. */
export interface ScanFigures {
  /** `lead -3`, `phase@120+1`, `phase@60+60`, `dish@150`: sim.ts says what each is. */
  play: string;
  medals: number;
  return: number;
  half: number;
}

/** The families of plays the scan goes through. */
export const SCAN_FAMILIES = ['leads', 'angles', 'swings', 'dishes'] as const;
export type ScanFamilyId = (typeof SCAN_FAMILIES)[number];

/** Which family a play belongs to, by its name: early or late, one angle a turn, held through a swing, by the dish. */
export function familyOf(play: string): ScanFamilyId {
  if (play.startsWith('lead ')) return 'leads';
  if (play.startsWith('dish@')) return 'dishes';
  return play.endsWith('+1') ? 'angles' : 'swings';
}

/** Each family's play that came back highest on the first machines. */
export const familyTops = (plays: readonly ScanFigures[]): { id: ScanFamilyId; plays: number; top: ScanFigures }[] =>
  SCAN_FAMILIES.map((id) => {
    const mine = plays.filter((p) => familyOf(p.play) === id);
    return { id, plays: mine.length, top: mine.reduce((a, b) => (b.return > a.return ? b : a)) };
  });

export interface CarouselFigures {
  /** How the measurement was made. */
  method: { machines: number; batch: number; warmup: number; script: string };
  ways: Readonly<Record<'timed' | 'steady' | 'held', WayFigures>>;
  /**
   * Every other moment a player might drop at, measured to show that none beats best play. First every play, on
   * twelve machines from `firstSeed` (`plays`); then the ones that came out highest, again, on twelve other machines
   * (from `againSeed`) for many more medals (`again`): measured on fresh machines, those are not lifted by having been
   * picked for coming out high.
   */
  scan: {
    script: string;
    machines: number;
    firstSeed: number;
    againSeed: number;
    plays: readonly ScanFigures[];
    again: readonly ScanFigures[];
  };
  /** The best there is: the highest of best play and every play measured again. The floor is given this, rounded up. */
  best: ScanFigures;
}

export const PUBLISHED_CAROUSEL: Readonly<CarouselFigures> = {
  method: { machines: 12, batch: 5_000, warmup: 500, script: 'scripts/carousel-pusher-tune.ts' },
  ways: {
    timed: {
      medals: 6_000_000,
      batches: 1_200,
      return: 0.907_248_3,
      half: 0.002_634_8,
      front: 0.466_095_7,
      thrownIn: 0.010_902_0,
      prizes: 0.430_250_7,
      pockets: 0.358_333_0,
      direct: 0.299_833_2,
      wasted: 0,
      fieldShare: 0.575_452_2,
      jackpotsPer1000: 0.906_167,
      thrownPerJackpot: 197.8,
    },
    steady: {
      medals: 4_000_008,
      batches: 804,
      return: 0.801_003_9,
      half: 0.003_897_7,
      front: 0.529_485_4,
      thrownIn: 0.009_632_2,
      prizes: 0.261_886_2,
      pockets: 0.217_519_6,
      direct: 0.184_401_4,
      wasted: 0.000_001_5,
      fieldShare: 0.568_824_9,
      jackpotsPer1000: 0.562_999,
      thrownPerJackpot: 280.6,
    },
    held: {
      medals: 4_000_008,
      batches: 804,
      return: 0.691_479_9,
      half: 0.004_945_4,
      front: 0.519_656_0,
      thrownIn: 0.008_864_7,
      prizes: 0.162_959_2,
      pockets: 0.217_757_6,
      direct: 0.184_645_9,
      wasted: 0.081_805_8,
      fieldShare: 0.565_643_1,
      jackpotsPer1000: 0.347_249,
      thrownPerJackpot: 418.4,
    },
  },
  scan: {
    script: 'scripts/carousel-pusher-lead-scan.ts',
    machines: 12,
    firstSeed: 20_001,
    againSeed: 20_101,
    plays: [
      { play: 'lead -40', medals: 480_000, return: 0.742_314_6, half: 0.014_654_4 },
      { play: 'lead -37', medals: 480_000, return: 0.763_645_8, half: 0.013_208_8 },
      { play: 'lead -34', medals: 480_000, return: 0.787_389_6, half: 0.012_040_6 },
      { play: 'lead -31', medals: 480_000, return: 0.811_170_8, half: 0.011_258_2 },
      { play: 'lead -28', medals: 480_000, return: 0.838_868_8, half: 0.009_743_0 },
      { play: 'lead -25', medals: 480_000, return: 0.862_881_3, half: 0.009_986_2 },
      { play: 'lead -22', medals: 480_000, return: 0.882_914_6, half: 0.009_552_6 },
      { play: 'lead -19', medals: 480_000, return: 0.897_431_3, half: 0.009_855_6 },
      { play: 'lead -16', medals: 480_000, return: 0.901_206_2, half: 0.009_348_2 },
      { play: 'lead -13', medals: 480_000, return: 0.901_787_5, half: 0.009_511_8 },
      { play: 'lead -10', medals: 480_000, return: 0.899_318_7, half: 0.010_174_1 },
      { play: 'lead -7', medals: 480_000, return: 0.901_218_7, half: 0.009_326_1 },
      { play: 'lead -4', medals: 480_000, return: 0.901_056_3, half: 0.009_816_3 },
      { play: 'lead -1', medals: 480_000, return: 0.902_060_4, half: 0.010_450_5 },
      { play: 'lead 2', medals: 480_000, return: 0.902_239_6, half: 0.010_831_0 },
      { play: 'lead 5', medals: 480_000, return: 0.900_737_5, half: 0.009_849_0 },
      { play: 'lead 8', medals: 480_000, return: 0.900_054_2, half: 0.010_148_4 },
      { play: 'lead 11', medals: 480_000, return: 0.899_575_0, half: 0.009_592_7 },
      { play: 'lead 14', medals: 480_000, return: 0.899_189_6, half: 0.008_463_8 },
      { play: 'lead 17', medals: 480_000, return: 0.898_139_6, half: 0.009_451_1 },
      { play: 'lead 20', medals: 480_000, return: 0.886_904_2, half: 0.008_860_6 },
      { play: 'lead -6', medals: 480_000, return: 0.902_225_0, half: 0.009_704_4 },
      { play: 'lead -5', medals: 480_000, return: 0.902_520_8, half: 0.009_479_4 },
      { play: 'lead -3', medals: 480_000, return: 0.900_331_3, half: 0.010_318_0 },
      { play: 'lead -2', medals: 480_000, return: 0.903_616_7, half: 0.010_785_0 },
      { play: 'lead 0', medals: 480_000, return: 0.901_956_3, half: 0.010_776_3 },
      { play: 'lead 1', medals: 480_000, return: 0.902_537_5, half: 0.010_777_6 },
      { play: 'lead 3', medals: 480_000, return: 0.900_797_9, half: 0.010_712_8 },
      { play: 'lead 4', medals: 480_000, return: 0.901_891_7, half: 0.009_780_9 },
      { play: 'lead 6', medals: 480_000, return: 0.899_875_0, half: 0.009_433_6 },
      { play: 'phase@0+60', medals: 480_000, return: 0.835_970_8, half: 0.010_124_5 },
      { play: 'phase@60+60', medals: 480_000, return: 0.779_497_9, half: 0.010_744_6 },
      { play: 'phase@120+60', medals: 480_000, return: 0.837_668_7, half: 0.010_051_8 },
      { play: 'phase@180+60', medals: 480_000, return: 0.764_272_9, half: 0.010_809_4 },
      { play: 'phase@240+60', medals: 480_000, return: 0.836_108_3, half: 0.010_348_0 },
      { play: 'phase@300+60', medals: 480_000, return: 0.765_322_9, half: 0.010_727_0 },
      { play: 'phase@0+120', medals: 480_000, return: 0.808_881_2, half: 0.011_659_0 },
      { play: 'phase@120+120', medals: 480_000, return: 0.787_554_2, half: 0.012_214_8 },
      { play: 'phase@240+120', medals: 480_000, return: 0.790_114_6, half: 0.012_145_5 },
      { play: 'dish@100', medals: 480_000, return: 0.852_631_2, half: 0.008_534_5 },
      { play: 'dish@150', medals: 480_000, return: 0.811_968_8, half: 0.008_503_5 },
      { play: 'dish@250', medals: 480_000, return: 0.763_075_0, half: 0.009_951_8 },
      { play: 'phase@0+1', medals: 120_000, return: 0.892_583_3, half: 0.020_528_4 },
      { play: 'phase@12+1', medals: 120_000, return: 0.885_983_3, half: 0.017_307_0 },
      { play: 'phase@24+1', medals: 120_000, return: 0.854_225_0, half: 0.020_235_5 },
      { play: 'phase@36+1', medals: 120_000, return: 0.750_900_0, half: 0.024_272_9 },
      { play: 'phase@48+1', medals: 120_000, return: 0.652_866_7, half: 0.025_023_9 },
      { play: 'phase@60+1', medals: 120_000, return: 0.565_825_0, half: 0.002_196_5 },
      { play: 'phase@72+1', medals: 120_000, return: 0.670_708_3, half: 0.022_137_0 },
      { play: 'phase@84+1', medals: 120_000, return: 0.767_233_3, half: 0.016_820_3 },
      { play: 'phase@96+1', medals: 120_000, return: 0.871_166_7, half: 0.014_699_0 },
      { play: 'phase@108+1', medals: 120_000, return: 0.894_341_7, half: 0.019_985_4 },
      { play: 'phase@120+1', medals: 120_000, return: 0.900_275_0, half: 0.020_424_7 },
      { play: 'phase@132+1', medals: 120_000, return: 0.893_233_3, half: 0.017_082_0 },
      { play: 'phase@144+1', medals: 120_000, return: 0.860_191_7, half: 0.019_763_8 },
      { play: 'phase@156+1', medals: 120_000, return: 0.757_200_0, half: 0.025_005_5 },
      { play: 'phase@168+1', medals: 120_000, return: 0.657_966_7, half: 0.025_171_9 },
      { play: 'phase@180+1', medals: 120_000, return: 0.564_333_3, half: 0.001_564_7 },
      { play: 'phase@192+1', medals: 120_000, return: 0.661_033_3, half: 0.021_713_2 },
      { play: 'phase@204+1', medals: 120_000, return: 0.758_375_0, half: 0.016_041_3 },
      { play: 'phase@216+1', medals: 120_000, return: 0.865_750_0, half: 0.014_381_2 },
      { play: 'phase@228+1', medals: 120_000, return: 0.891_541_7, half: 0.020_215_3 },
      { play: 'phase@240+1', medals: 120_000, return: 0.899_300_0, half: 0.020_087_7 },
      { play: 'phase@252+1', medals: 120_000, return: 0.893_275_0, half: 0.017_706_0 },
      { play: 'phase@264+1', medals: 120_000, return: 0.860_633_3, half: 0.020_299_1 },
      { play: 'phase@276+1', medals: 120_000, return: 0.758_291_7, half: 0.024_539_8 },
      { play: 'phase@288+1', medals: 120_000, return: 0.658_333_3, half: 0.025_801_1 },
      { play: 'phase@300+1', medals: 120_000, return: 0.565_000_0, half: 0.001_962_6 },
      { play: 'phase@312+1', medals: 120_000, return: 0.661_458_3, half: 0.022_183_8 },
      { play: 'phase@324+1', medals: 120_000, return: 0.757_450_0, half: 0.015_896_3 },
      { play: 'phase@336+1', medals: 120_000, return: 0.864_891_7, half: 0.015_222_6 },
      { play: 'phase@348+1', medals: 120_000, return: 0.888_166_7, half: 0.020_014_8 },
    ],
    again: [
      { play: 'lead -2', medals: 1_200_000, return: 0.903_184_2, half: 0.005_776_1 },
      { play: 'lead 1', medals: 1_200_000, return: 0.904_728_3, half: 0.005_766_1 },
      { play: 'lead -5', medals: 1_200_000, return: 0.903_980_8, half: 0.005_695_4 },
      { play: 'phase@0+1', medals: 1_200_000, return: 0.901_414_2, half: 0.005_679_1 },
      { play: 'phase@120+1', medals: 1_200_000, return: 0.908_447_5, half: 0.005_654_6 },
      { play: 'phase@240+1', medals: 1_200_000, return: 0.907_450_0, half: 0.005_698_5 },
    ],
  },
  best: { play: 'phase@120+1', medals: 1_200_000, return: 0.908_447_5, half: 0.005_654_6 },
};
