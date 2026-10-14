/**
 * What the game says about the payout works, in English and Japanese: what
 * is read out when the hopper has poured a prize and when a tower is pushed
 * out of its tube, and the lines the instructions give them. They are kept
 * here, apart from the game's other texts in i18n.ts, so that the works bring
 * their own.
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface WorksStrings {
  /** Read out when the hopper's doors begin to shut, the last of a prize poured. */
  sayPoured: (medals: number) => string;
  /** Read out when an arm begins to push a tower of `medals` out of the left (0) or the right (1) tube. */
  sayTowerOut: (medals: number, tube: 0 | 1) => string;
  /** How the machine pays, for the instructions: the slot, the hopper and the tower tubes. */
  howItPays: (threshold: number) => string[];
}

const en: WorksStrings = {
  sayPoured: (medals) => `The hopper poured ${medals} medals onto the pusher.`,
  sayTowerOut: (medals, tube) => `A tower of ${medals} ${medals === 1 ? 'medal' : 'medals'} is pushed out of the ${tube === 0 ? 'left' : 'right'} window onto the pusher.`,
  howItPays: (threshold) => [
    'A small win drops out of the slot under the hood, a medal at a time.',
    `A prize of ${threshold} medals or more is poured: the two doors in the hood drop open and the medals come down six channels, across the whole pusher.`,
    "A tower is stacked in a glass tube in a window at one of the screen's lower corners, a medal at a time, with its count over the window. Built, it is let down to the pusher, the shutter at the foot of the window opens, and an arm pushes the whole tower out across the pusher to near the lip. A roulette's numbers are stacked on one tower, which comes out when the run is over. What the tubes have no room for is poured.",
  ],
};

const ja: WorksStrings = {
  sayPoured: (medals) => `ホッパーから${medals}枚のメダルがプッシャーに流れ落ちました。`,
  sayTowerOut: (medals, tube) => `${medals}枚のメダルタワーが${tube === 0 ? '左' : '右'}の窓からプッシャーに押し出されます。`,
  howItPays: (threshold) => [
    '小さな当たりは、フードの下の払い出し口から1枚ずつ落ちてきます。',
    `${threshold}枚以上の当たりは流し込みです。フードの2枚の扉が下に開き、6本のレーンからプッシャー全体にメダルが流れ落ちます。`,
    'メダルタワーは、画面の下の左右の隅をくり抜いた窓の中の透明な筒で、1枚ずつ積み上げられます。窓の上に枚数が出ます。積み上がるとプッシャーの高さまで下り、窓の下のシャッターが開いて、アームがタワーをまるごとリップの近くまで押し出します。ルーレットの当たりは1本のタワーに積み重なり、ルーレットが終わると出てきます。筒に入りきらない分は流し込みになります。',
  ],
};

export const getWorksStrings = (language: GameLanguage): WorksStrings => (language === 'ja' ? ja : en);
