/**
 * Video Keno's exact odds as the machine publishes them: what `analyze()` (engine.ts) works out for every ticket of 1 to
 * 10 spots (each catch's hypergeometric chance and what it adds to the return, the last ball's ×5 included), written
 * out here once.
 *
 * The page shows these, so that opening it never works them out again: the reckoning multiplies BigInt binomials for
 * every catch of every ticket as the page wakes up (the Odds tab is drawn, hidden, as the page opens, and the machine's
 * panel and How to play show returns too), and it always comes to the same fractions.
 * `tests/unit/components/game/Keno/published.test.tsx` works them out afresh and checks that every figure here is
 * exactly what the reckoning gives; a change to a pay or to the last ball's ×5 fails it until this is written out again
 * (the test prints what to write).
 */

import type { Fraction, KenoOdds } from './engine';

/** A fraction in lowest terms, written as its two whole numbers (the site's TypeScript targets a version before BigInt literals). */
const q = (num: string, den: string): Fraction => ({ num: BigInt(num), den: BigInt(den) });

/** The machine's exact odds (`analyze()`). */
export const PUBLISHED_KENO_ODDS: Readonly<KenoOdds> = {
  tickets: [
    {
      spots: 1,
      lines: [
        { caught: 0, pay: 0, chance: q('3', '4'), back: q('0', '1') },
        { caught: 1, pay: 3, chance: q('1', '4'), back: q('9', '10') },
      ],
      back: q('9', '10'),
      table: q('3', '4'),
      hit: q('1', '4'),
      lastBall: q('1', '80'),
      all: q('1', '4'),
    },
    {
      spots: 2,
      lines: [
        { caught: 0, pay: 1, chance: q('177', '316'), back: q('177', '316') },
        { caught: 1, pay: 0, chance: q('30', '79'), back: q('0', '1') },
        { caught: 2, pay: 4, chance: q('19', '316'), back: q('133', '395') },
      ],
      back: q('1417', '1580'),
      table: q('253', '316'),
      hit: q('49', '79'),
      lastBall: q('1', '40'),
      all: q('19', '316'),
    },
    {
      spots: 3,
      lines: [
        { caught: 0, pay: 0, chance: q('1711', '4108'), back: q('0', '1') },
        { caught: 1, pay: 0, chance: q('885', '2054'), back: q('0', '1') },
        { caught: 2, pay: 2, chance: q('285', '2054'), back: q('399', '1027') },
        { caught: 3, pay: 23, chance: q('57', '4108'), back: q('2622', '5135') },
      ],
      back: q('4617', '5135'),
      table: q('2451', '4108'),
      hit: q('627', '4108'),
      lastBall: q('3', '80'),
      all: q('57', '4108'),
    },
    {
      spots: 4,
      lines: [
        { caught: 0, pay: 0, chance: q('97527', '316316'), back: q('0', '1') },
        { caught: 1, pay: 0, chance: q('34220', '79079'), back: q('0', '1') },
        { caught: 2, pay: 1, chance: q('16815', '79079'), back: q('3363', '11297') },
        { caught: 3, pay: 4, chance: q('3420', '79079'), back: q('21888', '79079') },
        { caught: 4, pay: 59, chance: q('969', '316316'), back: q('514539', '1581580') },
      ],
      back: q('1423119', '1581580'),
      table: q('25593', '45188'),
      hit: q('81909', '316316'),
      lastBall: q('1', '20'),
      all: q('969', '316316'),
    },
    {
      spots: 5,
      lines: [
        { caught: 0, pay: 0, chance: q('5133', '22594'), back: q('0', '1') },
        { caught: 1, pay: 0, chance: q('128325', '316316'), back: q('0', '1') },
        { caught: 2, pay: 0, chance: q('42775', '158158'), back: q('0', '1') },
        { caught: 3, pay: 3, chance: q('13275', '158158'), back: q('31860', '79079') },
        { caught: 4, pay: 8, chance: q('3825', '316316'), back: q('13770', '79079') },
        { caught: 5, pay: 250, chance: q('51', '79079'), back: q('25500', '79079') },
      ],
      back: q('71130', '79079'),
      table: q('80625', '158158'),
      hit: q('30579', '316316'),
      lastBall: q('1', '16'),
      all: q('51', '79079'),
    },
    {
      spots: 6,
      lines: [
        { caught: 0, pay: 0, chance: q('1711', '10270'), back: q('0', '1') },
        { caught: 1, pay: 0, chance: q('20532', '56485'), back: q('0', '1') },
        { caught: 2, pay: 0, chance: q('97527', '316316'), back: q('0', '1') },
        { caught: 3, pay: 2, chance: q('10266', '79079'), back: q('164256', '395395') },
        { caught: 4, pay: 3, chance: q('9027', '316316'), back: q('243729', '1581580') },
        { caught: 5, pay: 35, chance: q('1224', '395395'), back: q('2448', '11297') },
        { caught: 6, pay: 400, chance: q('51', '395395'), back: q('816', '7189') },
      ],
      back: q('9951', '11060'),
      table: q('159801', '316316'),
      hit: q('51111', '316316'),
      lastBall: q('3', '40'),
      all: q('51', '395395'),
    },
    {
      spots: 7,
      lines: [
        { caught: 0, pay: 0, chance: q('46197', '379990'), back: q('0', '1') },
        { caught: 1, pay: 0, chance: q('11977', '37999'), back: q('0', '1') },
        { caught: 2, pay: 0, chance: q('682689', '2089945'), back: q('0', '1') },
        { caught: 3, pay: 1, chance: q('292581', '1671956'), back: q('585162', '2089945') },
        { caught: 4, pay: 2, chance: q('87261', '1671956'), back: q('785349', '4179890') },
        { caught: 5, pay: 11, chance: q('18054', '2089945'), back: q('36108', '189995') },
        { caught: 6, pay: 121, chance: q('306', '417989'), back: q('37026', '189995') },
        { caught: 7, pay: 800, chance: q('51', '2089945'), back: q('19584', '417989') },
      ],
      back: q('3760461', '4179890'),
      table: q('4033611', '8359780'),
      hit: q('197775', '835978'),
      lastBall: q('7', '80'),
      all: q('51', '2089945'),
    },
    {
      spots: 8,
      lines: [
        { caught: 0, pay: 0, chance: q('2448441', '27739270'), back: q('0', '1') },
        { caught: 1, pay: 0, chance: q('739152', '2773927'), back: q('0', '1') },
        { caught: 2, pay: 0, chance: q('910252', '2773927'), back: q('0', '1') },
        { caught: 3, pay: 0, chance: q('32769072', '152565985'), back: q('0', '1') },
        { caught: 4, pay: 1, chance: q('4973877', '61026394'), back: q('44764893', '305131970') },
        { caught: 5, pay: 6, chance: q('2792352', '152565985'), back: q('33508224', '152565985') },
        { caught: 6, pay: 50, chance: q('72216', '30513197'), back: q('722160', '2773927') },
        { caught: 7, pay: 680, chance: q('4896', '30513197'), back: q('7990272', '30513197') },
        { caught: 8, pay: 1000, chance: q('51', '11735845'), back: q('26520', '2347169') },
      ],
      back: q('274569261', '305131970'),
      table: q('129104409', '305131970'),
      hit: q('6245307', '61026394'),
      lastBall: q('1', '10'),
      all: q('51', '11735845'),
    },
    {
      spots: 9,
      lines: [
        { caught: 0, pay: 0, chance: q('272049', '4267580'), back: q('0', '1') },
        { caught: 1, pay: 0, chance: q('2448441', '11095708'), back: q('0', '1') },
        { caught: 2, pay: 0, chance: q('877743', '2773927'), back: q('0', '1') },
        { caught: 3, pay: 0, chance: q('682689', '2773927'), back: q('0', '1') },
        { caught: 4, pay: 1, chance: q('34817139', '305131970'), back: q('313354251', '1525659850') },
        { caught: 5, pay: 3, chance: q('4973877', '152565985'), back: q('29843262', '152565985') },
        { caught: 6, pay: 19, chance: q('174522', '30513197'), back: q('3315918', '13869635') },
        { caught: 7, pay: 133, chance: q('18054', '30513197'), back: q('28814184', '152565985') },
        { caught: 8, pay: 800, chance: q('153', '4694338'), back: q('159120', '2347169') },
        { caught: 9, pay: 1500, chance: q('17', '23471690'), back: q('7140', '2347169') },
      ],
      back: q('1372748691', '1525659850'),
      table: q('11828991', '27739270'),
      hit: q('4245529', '27739270'),
      lastBall: q('9', '80'),
      all: q('17', '23471690'),
    },
    {
      spots: 10,
      lines: [
        { caught: 0, pay: 0, chance: q('13874499', '302998180'), back: q('0', '1') },
        { caught: 1, pay: 0, chance: q('2720490', '15149909'), back: q('0', '1') },
        { caught: 2, pay: 0, chance: q('232601895', '787795268'), back: q('0', '1') },
        { caught: 3, pay: 0, chance: q('52664580', '196948817'), back: q('0', '1') },
        { caught: 4, pay: 0, chance: q('58028565', '393897634'), back: q('0', '1') },
        { caught: 5, pay: 3, chance: q('557074224', '10832184935'), back: q('3342445344', '10832184935') },
        { caught: 6, pay: 9, chance: q('24869385', '2166436987'), back: q('44764893', '196948817') },
        { caught: 7, pay: 54, chance: q('3490440', '2166436987'), back: q('452361024', '2166436987') },
        { caught: 8, pay: 390, chance: q('45135', '333297998'), back: q('22883445', '166648999') },
        { caught: 9, pay: 1000, chance: q('1020', '166648999'), back: q('2856000', '166648999') },
        { caught: 10, pay: 2000, chance: q('17', '151499090'), back: q('10200', '15149909') },
      ],
      back: q('9746676504', '10832184935'),
      table: q('4373580922', '10832184935'),
      hit: q('63673432', '984744085'),
      lastBall: q('1', '8'),
      all: q('17', '151499090'),
    },
  ],
  best: q('9', '10'),
  bestSpots: 1,
  worst: q('1417', '1580'),
};
