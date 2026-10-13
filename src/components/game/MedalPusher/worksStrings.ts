/**
 * What the game says about the payout works, in English and Japanese: what
 * is read out when the hopper has poured a prize and when towers stand
 * built, and the lines the instructions give them. They are kept here, apart
 * from the game's other texts in i18n.ts, so that the works bring their own.
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface WorksStrings {
  /** Read out when the hopper's doors begin to shut, the last of a prize poured. */
  sayPoured: (medals: number) => string;
  /** Read out when towers are built and their guards go down. */
  sayTowers: (towers: number) => string;
  /** How the machine pays, for the instructions: the slot, the hopper and the lifts. */
  howItPays: (threshold: number) => string[];
}

const en: WorksStrings = {
  sayPoured: (medals) => `The hopper poured ${medals} medals onto the pusher.`,
  sayTowers: (towers) => (towers === 1 ? 'A medal tower stands built on the pusher.' : `${towers} medal towers stand built on the pusher.`),
  howItPays: (threshold) => [
    'A small win drops out of the slot under the hood, a medal at a time.',
    `A prize of ${threshold} medals or more is poured: the two doors in the hood drop open and the medals come down six channels, across the whole pusher.`,
    'A tower comes up through a hatch in the pusher, inside a clear guard. While the guard is up nothing can push it; when the tower is built the guard sinks and it is pushed like anything else.',
  ],
};

const ja: WorksStrings = {
  sayPoured: (medals) => `ホッパーから${medals}枚のメダルがプッシャーに流れ落ちました。`,
  sayTowers: (towers) => `メダルタワーが${towers}本、プッシャーの上に組み上がりました。`,
  howItPays: (threshold) => [
    '小さな当たりは、フードの下の払い出し口から1枚ずつ落ちてきます。',
    `${threshold}枚以上の当たりは流し込みです。フードの2枚の扉が下に開き、6本のレーンからプッシャー全体にメダルが流れ落ちます。`,
    'メダルタワーは、プッシャーのハッチから透明なガードの中をせり上がります。ガードが上がっている間は押されません。組み上がるとガードが下がり、ほかのメダルと同じように押されます。',
  ],
};

export const getWorksStrings = (language: GameLanguage): WorksStrings => (language === 'ja' ? ja : en);
