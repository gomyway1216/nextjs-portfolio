'use client';

import { useGameLanguage } from '../contexts/GameLanguageContext';
import { REELS, VIRTUAL_STOPS, analyzeMachine, analyzeNearMisses, symbolAt } from './engine';
import { getStrings } from './i18n';
import { SlotSymbol } from './Symbols';
import styles from './SlotMachine.module.css';

const ODDS = analyzeMachine();
const NEAR = analyzeNearMisses();
const MAX_WEIGHT = Math.max(...REELS.flat().map((stop) => stop.weight));

export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;
  // Tiny probabilities (the jackpot is 0.00038%) keep two significant digits.
  const probPct = (v: number) => (v > 0 && v < 1e-3 ? `${(v * 100).toPrecision(2)}%` : pct(v, 3));
  const oneIn = (p: number) => (p > 0 ? `${t.oneIn} ${fmt(1 / p, 1 / p < 100 ? 1 : 0)}` : '—');
  const maxShare = Math.max(...ODDS.rules.map((r) => r.rtpContribution));

  return (
    <div className={styles.oddsLayout}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.rtp}</span>
          <span className={styles.statValue} data-testid="slot-rtp">
            {pct(ODDS.rtp, 3)}
          </span>
          <span className={styles.statNote}>{t.exactFraction(fmt(ODDS.totalReturn), fmt(ODDS.totalWays))}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.houseEdge}</span>
          <span className={styles.statValue}>{pct(ODDS.houseEdge, 3)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.hitFrequency}</span>
          <span className={styles.statValue}>{pct(ODDS.hitFrequency)}</span>
          <span className={styles.statNote}>{oneIn(ODDS.hitFrequency)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.volatility}</span>
          <span className={styles.statValue}>{ODDS.stdDev.toFixed(2)}</span>
          <span className={styles.statNote}>{t.volatilityNote}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.jackpotOdds}</span>
          <span className={styles.statValue}>{oneIn(NEAR.jackpot)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.spinsForOnePercent}</span>
          <span className={styles.statValue}>≈ {fmt(ODDS.spinsForOnePercent)}</span>
          <span className={styles.statNote}>{t.spinsForOnePercentNote}</span>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.oddsTable}>
          <thead>
            <tr>
              <th>{t.combination}</th>
              <th className={styles.num}>{t.pays}</th>
              <th className={styles.num}>{t.ways}</th>
              <th className={styles.num}>{t.probability}</th>
              <th className={styles.num}>{t.oneIn}</th>
              <th>{t.rtpShare}</th>
            </tr>
          </thead>
          <tbody>
            {ODDS.rules.map(({ rule, ways, probability, rtpContribution }) => (
              <tr key={rule.id} data-rule={rule.id}>
                <td>
                  <span className={styles.paytableSymbols}>
                    {rule.pattern.map((p, i) =>
                      p === 'any' ? (
                        <span key={i} className={styles.anySymbol}>
                          –
                        </span>
                      ) : (
                        <SlotSymbol key={i} id={p} className={styles.miniSymbol} />
                      ),
                    )}
                  </span>
                  <span className={styles.ruleName}>{t.ruleName[rule.id]}</span>
                </td>
                <td className={styles.num}>{rule.pays}</td>
                <td className={styles.num}>{fmt(ways)}</td>
                <td className={styles.num}>{probPct(probability)}</td>
                <td className={styles.num}>{fmt(1 / probability, 1 / probability < 100 ? 1 : 0)}</td>
                <td>
                  <span className={styles.shareCell}>
                    <span className={styles.shareBar} style={{ width: `${(rtpContribution / maxShare) * 100}%` }} />
                    <span>{pct(rtpContribution)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{t.total}</td>
              <td />
              <td className={styles.num}>{fmt(ODDS.winningWays)}</td>
              <td className={styles.num}>{pct(ODDS.hitFrequency, 3)}</td>
              <td className={styles.num}>{fmt(1 / ODDS.hitFrequency, 2)}</td>
              <td>
                <b>{pct(ODDS.rtp, 3)}</b>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section aria-labelledby="slot-virtual-title">
        <h3 id="slot-virtual-title" className={styles.blockTitle}>
          {t.virtualReelTitle}
        </h3>
        <div className={styles.intro}>
          {t.virtualReelIntro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <div className={styles.reelStrips}>
          {REELS.map((reel, r) => (
            <figure key={r} className={styles.reelStrip}>
              <figcaption>{t.reelLabel(r + 1)}</figcaption>
              <ol>
                {reel.map((stop, i) => {
                  const nearSeven = stop.symbol === 'blank' && (symbolAt(reel, i, -1) === 'seven' || symbolAt(reel, i, 1) === 'seven');
                  return (
                    <li
                      key={i}
                      className={stop.symbol === 'seven' ? styles.stopSeven : nearSeven ? styles.stopNear : undefined}
                      title={t.stopWeight(stop.weight)}
                    >
                      <span className={styles.stopSymbol}>
                        {stop.symbol === 'blank' ? <span className={styles.blankDot} /> : <SlotSymbol id={stop.symbol} className={styles.miniSymbol} />}
                      </span>
                      <span className={styles.stopBarTrack}>
                        <span className={styles.stopBar} style={{ width: `${(stop.weight / MAX_WEIGHT) * 100}%` }} />
                      </span>
                      <span className={styles.stopWeight}>{stop.weight}</span>
                      <span className={styles.srOnly}>
                        {t.symbolName[stop.symbol]}: {t.stopWeight(stop.weight)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </figure>
          ))}
        </div>

        <dl className={styles.nearMissList}>
          <div>
            <dt>{t.sevenOnLine}</dt>
            <dd>
              {fmt(NEAR.sevenOnLine[2] * VIRTUAL_STOPS)} / {VIRTUAL_STOPS} = {pct(NEAR.sevenOnLine[2])}
            </dd>
          </div>
          <div>
            <dt>{t.sevenBesideLine}</dt>
            <dd>
              {fmt(NEAR.sevenBesideLine[2] * VIRTUAL_STOPS)} / {VIRTUAL_STOPS} = {pct(NEAR.sevenBesideLine[2])}
            </dd>
          </div>
          <div>
            <dt>{t.jackpotOdds}</dt>
            <dd>{oneIn(NEAR.jackpot)}</dd>
          </div>
          <div>
            <dt>{t.jackpotNearMiss}</dt>
            <dd>
              {oneIn(NEAR.jackpotNearMiss)} — {t.nearMissRatio(fmt(NEAR.jackpotNearMiss / NEAR.jackpot, 1))}
            </dd>
          </div>
        </dl>
        <p className={styles.note}>
          {t.uniformComparison(fmt(1 / NEAR.uniformJackpot), fmt(NEAR.uniformJackpotNearMiss / NEAR.uniformJackpot, 1))}
        </p>
      </section>
    </div>
  );
};
