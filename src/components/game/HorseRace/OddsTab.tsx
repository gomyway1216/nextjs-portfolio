'use client';

import { useMemo, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FIELD, ODDS_LIMITS, PAIRS, RETURN_LEAST, RETURN_MOST, TICKETS, chanceOf, drawOrder, oddsOf, ticketWins, type RaceCard } from './card';
import { sub, toNumber, ONE, type Fraction } from './fraction';
import { gateMark, getStrings } from './i18n';
import { SAMPLE_CARD, useShownCard } from './shownCard';
import { GATE_COLOURS } from './stable';
import styles from './HorseRace.module.css';

/** How many races the check below runs on the card. */
export const CHECK_RACES = 20_000;

const WORDS = {
  en: {
    title: (race: number) => `Race ${race}: the exact odds`,
    sample: 'A sample race (your next race’s card shows here once your medals are found).',
    winReturn: 'Every win ticket brings back',
    quinellaReturn: 'Every quinella brings back',
    kept: 'The machine keeps',
    keptBoth: (win: string, quinella: string) => `${win} of win tickets, ${quinella} of quinellas`,
    exactly: 'exactly',
    allAlike: 'of the medals on it, on this race: every ticket of a kind alike, the favourite and the outsider. No ticket is a better bet than another.',
    gate: 'Gate',
    horse: 'Horse',
    odds: 'Odds',
    chance: 'Chance',
    back: 'Brings back',
    pair: 'Pair',
    likeliest: (first: string, second: string, chance: string) => `The likeliest first two: ${first} then ${second}, ${chance} of races.`,
    howTitle: 'How the odds are set, and the race drawn',
    how: [
      `The odds go up first, from the horses’ form: whole numbers, as on the classic horse-racing medal machines, from ${ODDS_LIMITS.win.least}× up to ${ODDS_LIMITS.win.most}× for a win and ${ODDS_LIMITS.quinella.most}× for a quinella.`,
      'Each ticket’s chance then follows from its odds: R ÷ the odds, where R is 1 ÷ (the sum of 1 ÷ every odds of its kind). So every ticket of a kind brings back exactly R, and the chances add up to one.',
      `The odds are chosen so that R is at most ${(toNumber(RETURN_MOST) * 100).toFixed(1)}% and at least ${(toNumber(RETURN_LEAST) * 100).toFixed(1)}% on both kinds of ticket, in every race.`,
      'The result is drawn as betting closes: the first two together, from the chance of every pair in order (each pair’s chance shared between its horses so that each wins exactly as often as its win odds say), then third to sixth from the horses left, in proportion to their win chances. Only then is the race run, to that result.',
      'These figures are worked out with exact fractions. The site’s tests add up all 720 ways a race can finish and find every ticket’s return exactly R.',
    ],
    checkTitle: 'Check it',
    checkLead: (n: string) => `Run ${n} races of this card, with one medal on every ticket of each kind, and see what comes back.`,
    checkButton: 'Run the races',
    checkResult: (kind: string, measured: string, exact: string) => `${kind}: ${measured} came back (exactly ${exact} in the long run).`,
    win: 'Win tickets',
    quinella: 'Quinellas',
  },
  ja: {
    title: (race: number) => `第${race}レース：正確な確率`,
    sample: 'サンプルのレースです（持ちメダルが見つかると、次のレースの出馬表がここに出ます）。',
    winReturn: 'どの単勝も',
    quinellaReturn: 'どの連複も',
    kept: 'マシンの取り分',
    keptBoth: (win: string, quinella: string) => `単勝の${win}、連複の${quinella}`,
    exactly: 'ちょうど',
    allAlike: '（置いたメダルに対して）が戻ります。人気馬も人気のない馬も、同じ種類の馬券はすべて同じです。得な馬券はありません。',
    gate: '枠',
    horse: '馬名',
    odds: 'オッズ',
    chance: '確率',
    back: '戻り',
    pair: '組',
    likeliest: (first: string, second: string, chance: string) => `いちばん出やすい1着・2着：${first}→${second}（${chance}）。`,
    howTitle: 'オッズの決め方とレースの抽選',
    how: [
      `まず馬の調子からオッズを決めます。昔ながらの競馬メダルゲームと同じく整数で、単勝は${ODDS_LIMITS.win.least}倍〜${ODDS_LIMITS.win.most}倍、連複は${ODDS_LIMITS.quinella.most}倍までです。`,
      '各馬券の確率はオッズから決まります。確率 ＝ R ÷ オッズ（R ＝ 1 ÷ その種類の全オッズの逆数の和）。そのため同じ種類の馬券はどれもちょうど R が戻り、確率の合計は1になります。',
      `R はどのレースでも、単勝・連複とも${(toNumber(RETURN_LEAST) * 100).toFixed(1)}％以上${(toNumber(RETURN_MOST) * 100).toFixed(1)}％以下になるようにオッズを選んでいます。`,
      '結果は締切の瞬間に抽選します。まず1着と2着を、順番つきの組ごとの確率でまとめて決めます（連複の確率を2頭で分け、各馬の1着の確率が単勝オッズどおりになるようにしてあります）。3着〜6着は残った馬から単勝の確率に比例して決めます。そのあとで、その結果のとおりにレースを走らせます。',
      'この数字はすべて分数で正確に計算しています。サイトのテストでは720通りの着順をすべて足し合わせ、どの馬券の戻りもちょうど R になることを確かめています。',
    ],
    checkTitle: '確かめる',
    checkLead: (n: string) => `この出馬表で${n}レースを走らせ、同じ種類の全馬券に1枚ずつ置いたときに何枚戻るかを見ます。`,
    checkButton: 'レースを走らせる',
    checkResult: (kind: string, measured: string, exact: string) => `${kind}：${measured}が戻りました（長い目で見るとちょうど${exact}）。`,
    win: '単勝',
    quinella: '連複',
  },
} as const;

const percent = (x: number, digits = 2): string => `${(x * 100).toFixed(digits)}%`;
/** An exact return, as a fraction when it is short enough to read, and as a percentage. */
const exact = (f: Fraction): string => (f.d.toString().length <= 8 ? `${f.n}/${f.d} = ${percent(toNumber(f), 3)}` : percent(toNumber(f), 4));

/** What one medal on every ticket of each kind brings back over `races` races of the card, drawn as the machine draws them. */
function check(card: RaceCard, races: number): { win: number; quinella: number } {
  let win = 0;
  let quinella = 0;
  for (let i = 0; i < races; i += 1) {
    const order = drawOrder(card, Math.random);
    for (const ticket of TICKETS) {
      if (!ticketWins(ticket, order)) continue;
      if (ticket.kind === 'win') win += oddsOf(card, ticket);
      else quinella += oddsOf(card, ticket);
    }
  }
  return { win: win / (races * FIELD), quinella: quinella / (races * PAIRS.length) };
}

/** The Odds tab: the exact chance and return of every ticket on the race the machine shows, and how they are set. */
export const OddsTab = () => {
  const shown = useShownCard();
  return <CardOdds card={shown ?? SAMPLE_CARD} sample={!shown} />;
};

/** The exact odds of one race card: what the Odds tab shows of the machine's race (or, `sample`, of a sample race). */
export const CardOdds = ({ card, sample }: { card: RaceCard; sample: boolean }) => {
  const { language } = useGameLanguage();
  const w = WORDS[language];
  const t = getStrings(language);
  const [checked, setChecked] = useState<{ card: RaceCard; win: number; quinella: number } | null>(null);
  const likeliest = useMemo(() => {
    let best = { first: 1, second: 2, chance: 0 };
    for (let i = 0; i < FIELD; i += 1)
      for (let j = 0; j < FIELD; j += 1) {
        if (i === j) continue;
        const chance = toNumber(card.firstSecond[i][j]);
        if (chance > best.chance) best = { first: i + 1, second: j + 1, chance };
      }
    return best;
  }, [card]);
  const name = (gate: number) => `${gateMark(gate)}${card.field[gate - 1].name[language]}`;
  const kept = (r: Fraction) => percent(toNumber(sub(ONE, r)), 3);
  const result = checked && checked.card === card ? checked : null;

  return (
    <div className={styles.oddsPage} data-testid="hr-odds">
      <h2 className={styles.oddsTitle}>{w.title(card.race)}</h2>
      {sample && <p className={styles.muted}>{w.sample}</p>}
      <div className={styles.oddsTiles}>
        <p className={styles.oddsTile} data-testid="hr-odds-win-return">
          <span className={styles.oddsTileLabel}>{w.winReturn}</span>
          <strong>{exact(card.winReturn)}</strong>
        </p>
        <p className={styles.oddsTile} data-testid="hr-odds-quinella-return">
          <span className={styles.oddsTileLabel}>{w.quinellaReturn}</span>
          <strong>{exact(card.quinellaReturn)}</strong>
        </p>
        <p className={styles.oddsTile}>
          <span className={styles.oddsTileLabel}>{w.kept}</span>
          <strong>{w.keptBoth(kept(card.winReturn), kept(card.quinellaReturn))}</strong>
        </p>
      </div>
      <p className={styles.oddsLead}>
        {w.exactly} {percent(toNumber(card.winReturn), 3)} / {percent(toNumber(card.quinellaReturn), 3)} {w.allAlike}
      </p>

      <h3 className={styles.ticketsTitle}>{t.win}</h3>
      <table className={styles.oddsTable} data-testid="hr-odds-win">
        <thead>
          <tr>
            <th>{w.gate}</th>
            <th>{w.horse}</th>
            <th>{w.odds}</th>
            <th>{w.chance}</th>
            <th>{w.back}</th>
          </tr>
        </thead>
        <tbody>
          {card.field.map((horse, i) => {
            const ticket = TICKETS[i];
            return (
              <tr key={horse.id}>
                <td>
                  <span className={styles.gateBadge} style={{ background: GATE_COLOURS[i].cloth, color: GATE_COLOURS[i].number }}>
                    {i + 1}
                  </span>
                </td>
                <td className={styles.oddsName}>{horse.name[language]}</td>
                <td>{t.oddsUnit(oddsOf(card, ticket))}</td>
                <td>{percent(toNumber(chanceOf(card, ticket)))}</td>
                <td>{percent(toNumber(card.winReturn))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className={styles.ticketsTitle}>{t.quinella}</h3>
      <table className={styles.oddsTable} data-testid="hr-odds-quinella">
        <thead>
          <tr>
            <th>{w.pair}</th>
            <th>{w.odds}</th>
            <th>{w.chance}</th>
            <th>{w.back}</th>
          </tr>
        </thead>
        <tbody>
          {PAIRS.map(([a, b], e) => {
            const ticket = TICKETS[FIELD + e];
            return (
              <tr key={`${a}-${b}`}>
                <td>
                  {a + 1}-{b + 1}
                </td>
                <td>{t.oddsUnit(oddsOf(card, ticket))}</td>
                <td>{percent(toNumber(chanceOf(card, ticket)))}</td>
                <td>{percent(toNumber(card.quinellaReturn))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.oddsLead}>{w.likeliest(name(likeliest.first), name(likeliest.second), percent(likeliest.chance))}</p>

      <h3 className={styles.ticketsTitle}>{w.howTitle}</h3>
      {w.how.map((line) => (
        <p key={line} className={styles.oddsLead}>
          {line}
        </p>
      ))}

      <h3 className={styles.ticketsTitle}>{w.checkTitle}</h3>
      <p className={styles.oddsLead}>{w.checkLead(CHECK_RACES.toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US'))}</p>
      <button type="button" className={styles.btn} data-testid="hr-odds-check" onClick={() => setChecked({ card, ...check(card, CHECK_RACES) })}>
        {w.checkButton}
      </button>
      {result && (
        <div data-testid="hr-odds-checked">
          <p className={styles.oddsLead}>{w.checkResult(w.win, percent(result.win), percent(toNumber(card.winReturn), 3))}</p>
          <p className={styles.oddsLead}>{w.checkResult(w.quinella, percent(result.quinella), percent(toNumber(card.quinellaReturn), 3))}</p>
        </div>
      )}
    </div>
  );
};

export default OddsTab;
