import type { GameLanguage } from '../constants/gameTranslations';

/**
 * Local, self-contained bilingual strings for the Monty Hall game.
 * Kept out of the shared gameTranslations.ts on purpose (per revamp scope).
 */
export interface MontyHallStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabSim: string;
  howToPlay: string;
  // Play tab
  doors: string;
  doorLabel: (n: number) => string;
  pickPrompt: string;
  hostRevealed: (door: number) => string;
  hostRevealedMulti: (doors: string) => string;
  switchTo: string;
  stay: string;
  switchBtn: string;
  stayBtn: string;
  youWon: string;
  youLost: string;
  youSwitched: string;
  youStayed: string;
  nextRound: string;
  yourRecord: string;
  reset: string;
  theoryNote: string;
  doorCountLabel: string;
  // Sim tab
  trialsLabel: (max: string) => string;
  runSim: string;
  running: (done: string, total: string) => string;
  introTitle: string;
  introBody: string;
  winRateCompare: (trials: string) => string;
  referenceNote: string;
  convergenceTitle: string;
  convergenceNote: string;
  theoreticalLine: string;
  // Info modal
  infoTitle: string;
  infoIntro: string;
  infoWhy: string;
  infoWhyBody: string;
  infoGeneral: string;
  infoGeneralBody: (n: number, stay: string, sw: string) => string;
  // labels
  labelStay: string;
  labelSwitch: string;
  labelRandom: string;
  theoretical: string;
}

const en: MontyHallStrings = {
  title: 'Monty Hall',
  subtitle: 'The famous three-door puzzle. Play it by hand, then prove the counter-intuitive odds with simulation.',
  tabPlay: 'Play',
  tabSim: 'Simulate',
  howToPlay: 'How it works',
  doors: 'Doors',
  doorLabel: (n) => `Door ${n}`,
  pickPrompt: 'One door hides a prize 🎁, the rest hide goats 🐐. Pick a door to begin.',
  hostRevealed: (door) => `The host opened Door ${door} to reveal a 🐐. Switch to the other door, or stay?`,
  hostRevealedMulti: (doors) => `The host opened ${doors} to reveal 🐐. Switch to one of the remaining doors, or stay?`,
  switchTo: 'Switch',
  stay: 'Stay',
  switchBtn: 'Switch',
  stayBtn: 'Stay',
  youWon: '🎉 You won the prize!',
  youLost: '😢 A goat. Better luck next time.',
  youSwitched: 'you switched',
  youStayed: 'you stayed',
  nextRound: 'Next round',
  yourRecord: 'Your record',
  reset: 'Reset record',
  theoryNote:
    'Theory: Stay wins 1/3 of the time, Switch wins 2/3. Small samples wobble — run thousands of trials in the Simulate tab to watch them converge.',
  doorCountLabel: 'Doors',
  trialsLabel: (max) => `Trials (max ${max})`,
  runSim: 'Run simulation',
  running: (done, total) => `Running… ${done} / ${total}`,
  introTitle: 'The Monty Hall problem',
  introBody:
    'After you pick a door, the host opens a goat door and offers you a swap. Intuition says "2 doors left, so 50/50" — but switching actually wins 2/3 of the time. Run the simulation to see Stay, Switch and Random each converge to their true rate.',
  winRateCompare: (trials) => `Win-rate comparison (${trials} trials)`,
  referenceNote: 'The dashed line marks the theoretical value. More trials pin each bar to it.',
  convergenceTitle: 'Convergence of the running win-rate',
  convergenceNote: 'Early on it swings, but as trials pile up each line settles onto its dashed theoretical value.',
  theoreticalLine: 'theory',
  infoTitle: 'How Monty Hall works',
  infoIntro:
    'There are 3 doors. One hides a car, two hide goats. You pick a door. The host — who knows what is behind every door — always opens a different door to reveal a goat, then asks if you want to switch.',
  infoWhy: 'Why switching wins 2/3',
  infoWhyBody:
    'Your first pick is right 1/3 of the time and wrong 2/3 of the time. The host never opens the prize, so whenever your first pick was wrong (2/3), the prize is guaranteed to be behind the one door you can switch to. So switching wins exactly when your first guess was wrong — 2/3 of the time.',
  infoGeneral: 'The N-door generalisation',
  infoGeneralBody: (n, stay, sw) =>
    `With ${n} doors and the host still opening exactly one goat, staying wins ${stay} and switching wins ${sw}. Switching always beats staying.`,
  labelStay: 'Stay',
  labelSwitch: 'Switch',
  labelRandom: 'Random (coin flip)',
  theoretical: 'theory',
};

const ja: MontyHallStrings = {
  title: 'モンティ・ホール',
  subtitle: '有名な「3つのドア」問題。手で遊んで、シミュレーションで直感に反する確率を証明する。',
  tabPlay: '遊ぶ',
  tabSim: 'シミュレーション',
  howToPlay: '仕組み',
  doors: 'ドア',
  doorLabel: (n) => `ドア${n}`,
  pickPrompt: '1つのドアの後ろに🎁、残りに🐐がいます。まずは1つ選んでください。',
  hostRevealed: (door) => `ホストがドア${door}を開けて🐐を見せました。別のドアに変えますか、そのままにしますか？`,
  hostRevealedMulti: (doors) => `ホストが${doors}を開けて🐐を見せました。残りのドアに変えますか、そのままにしますか？`,
  switchTo: '変える',
  stay: 'そのまま',
  switchBtn: '変える',
  stayBtn: 'そのまま',
  youWon: '🎉 当たり！景品ゲット',
  youLost: '😢 はずれ（🐐）。次こそ！',
  youSwitched: 'ドアを変えた',
  youStayed: 'そのままにした',
  nextRound: '次のラウンド',
  yourRecord: 'あなたの戦績',
  reset: '戦績リセット',
  theoryNote:
    '理論値は Stay 1/3、Switch 2/3。サンプルが少ないうちはブレますが、シミュレーションタブで何万回も試すと収束が見えます。',
  doorCountLabel: 'ドアの数',
  trialsLabel: (max) => `試行回数（最大 ${max}）`,
  runSim: 'シミュレーション実行',
  running: (done, total) => `実行中… ${done} / ${total}`,
  introTitle: 'モンティ・ホール問題',
  introBody:
    'プレイヤーがドアを選んだ後、ホストが🐐のドアを1つ開けて「変えますか？」と尋ねます。直感では「残り2択だから50/50」と思えますが、実は変えると2/3で当たります。シミュレーションを実行すれば、Stay / Switch / Random がそれぞれ理論値に収束する様子が見えます。',
  winRateCompare: (trials) => `勝率の比較（${trials} 試行）`,
  referenceNote: '点線が理論値。試行数が多いほどバーがそこに張り付きます。',
  convergenceTitle: '勝率の収束（running win rate）',
  convergenceNote: '序盤は揺れますが、試行が増えるにつれて各線が点線（理論値）に収束していきます。',
  theoreticalLine: '理論値',
  infoTitle: 'モンティ・ホールの仕組み',
  infoIntro:
    '3つのドアがあり、1つに車、2つに🐐がいます。あなたが1つ選ぶと、中身を知っているホストが必ず別のドアを開けて🐐を見せ、「変えますか？」と尋ねます。',
  infoWhy: 'なぜ変えると2/3で勝てるのか',
  infoWhyBody:
    '最初の選択が当たる確率は1/3、外れる確率は2/3。ホストは絶対に景品のドアを開けないので、最初に外していた場合（2/3）は、変えられる残り1つのドアに必ず景品があります。つまり「最初に外していたとき」＝2/3の確率で、変えると勝てるのです。',
  infoGeneral: 'N枚のドアへの一般化',
  infoGeneralBody: (n, stay, sw) =>
    `${n}枚のドアでホストが🐐を1つだけ開ける場合、そのままの勝率は${stay}、変えた場合は${sw}。常に「変える」方が有利です。`,
  labelStay: 'そのまま',
  labelSwitch: '変える',
  labelRandom: 'ランダム（コイン）',
  theoretical: '理論値',
};

export function getStrings(language: GameLanguage): MontyHallStrings {
  return language === 'ja' ? ja : en;
}
