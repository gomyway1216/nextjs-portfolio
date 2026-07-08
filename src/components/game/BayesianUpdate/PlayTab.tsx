'use client';

import { useMemo, useState } from 'react';
import type { BayesianStrings } from './i18n';
import { PosteriorChart } from './charts';
import {
  Posterior,
  credibleIntervalExact,
  flip,
  posteriorMean,
  posteriorMode,
  posteriorStd,
} from './engine';
import styles from './BayesianUpdate.module.css';

const DEFAULT_TRUE_P = 0.7;
const HISTORY_DISPLAY_MAX = 120;

interface Preset {
  key: string;
  alpha: number;
  beta: number;
  label: (t: BayesianStrings) => string;
}
const PRESETS: Preset[] = [
  { key: 'uniform', alpha: 1, beta: 1, label: (t) => t.presetUniform },
  { key: 'jeffreys', alpha: 0.5, beta: 0.5, label: (t) => t.presetJeffreys },
  { key: 'strong', alpha: 8, beta: 2, label: (t) => t.presetStrong },
];

export const PlayTab = ({ t }: { t: BayesianStrings }) => {
  const [trueP, setTrueP] = useState(DEFAULT_TRUE_P);
  const [reveal, setReveal] = useState(false);
  const [prior, setPrior] = useState<Posterior>({ alpha: 1, beta: 1 });
  // Observed counts are tracked separately so the prior stays adjustable.
  const [heads, setHeads] = useState(0);
  const [tails, setTails] = useState(0);
  const [history, setHistory] = useState<(0 | 1)[]>([]);
  const [guess, setGuess] = useState(0.5);

  const posterior: Posterior = useMemo(
    () => ({ alpha: prior.alpha + heads, beta: prior.beta + tails }),
    [prior, heads, tails],
  );

  const doFlip = (n: number) => {
    let h = 0;
    let ta = 0;
    const flips: (0 | 1)[] = [];
    for (let i = 0; i < n; i++) {
      const obs = flip(trueP);
      flips.push(obs);
      if (obs === 1) h += 1;
      else ta += 1;
    }
    setHeads((v) => v + h);
    setTails((v) => v + ta);
    setHistory((prev) => [...prev, ...flips].slice(-1000));
  };

  const resetData = () => {
    setHeads(0);
    setTails(0);
    setHistory([]);
  };

  const onTruePChange = (np: number) => {
    setTrueP(np);
    resetData();
  };

  const applyPreset = (p: Preset) => {
    setPrior({ alpha: p.alpha, beta: p.beta });
    resetData();
  };

  const setPriorAlpha = (a: number) => {
    setPrior((p) => ({ ...p, alpha: a }));
    resetData();
  };
  const setPriorBeta = (b: number) => {
    setPrior((p) => ({ ...p, beta: b }));
    resetData();
  };

  const stats = useMemo(() => {
    const mean = posteriorMean(posterior);
    const std = posteriorStd(posterior);
    const mode = posteriorMode(posterior);
    const ci = credibleIntervalExact(posterior, 0.95);
    return { mean, std, mode, ci };
  }, [posterior]);

  const activePreset = PRESETS.find((p) => p.alpha === prior.alpha && p.beta === prior.beta)?.key;
  const guessError = Math.abs(guess - trueP);
  const guessClass = guessError < 0.05 ? styles.guessGood : guessError < 0.15 ? styles.guessOk : styles.guessBad;

  return (
    <div className={styles.grid}>
      {/* Left: controls + chart */}
      <div className={styles.card}>
        <label className={styles.controlLabel}>
          <span className={styles.controlHead}>
            <span>{t.truePLabel}</span>
            <span className={styles.controlValue} style={{ color: reveal ? '#f59e0b' : 'var(--muted-foreground)' }}>
              {reveal ? trueP.toFixed(2) : t.hidden}
            </span>
          </span>
          <input
            className={styles.slider}
            type="range"
            min={0.01}
            max={0.99}
            step={0.01}
            value={trueP}
            aria-label={t.truePLabel}
            onChange={(e) => onTruePChange(Number(e.target.value))}
          />
        </label>

        <div className={styles.buttonRow}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => doFlip(1)}>
            🪙 {t.flipOnce}
          </button>
          {[10, 100, 1000].map((n) => (
            <button key={n} className={`${styles.btn} ${styles.btnFlip}`} onClick={() => doFlip(n)}>
              {t.flipN(n)}
            </button>
          ))}
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>
            {reveal ? `🙈 ${t.hide}` : `👀 ${t.reveal}`}
          </button>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={resetData}>
            {t.reset}
          </button>
        </div>

        <PosteriorChart
          posterior={posterior}
          prior={prior}
          trueP={reveal ? trueP : null}
          credInterval={stats.ci}
          mean={stats.mean}
          ariaLabel={t.chartAriaPosterior(posterior.alpha.toFixed(1), posterior.beta.toFixed(1))}
        />

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: 'var(--primary)' }} />
            {t.legendPosterior}
          </span>
          <span className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: 'repeating-linear-gradient(90deg, var(--muted-foreground) 0 4px, transparent 4px 8px)' }}
            />
            {t.legendPrior}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: 'var(--primary)', opacity: 0.25 }} />
            {t.legendCI}
          </span>
          {reveal && (
            <span className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: '#f59e0b' }} />
              {t.legendTrueP}
            </span>
          )}
        </div>

        <h4 className={styles.panelTitle} style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
          {t.historyHeading}
        </h4>
        {history.length === 0 ? (
          <div className={styles.emptyHistory}>{t.noFlipsYet}</div>
        ) : (
          <>
            <div className={styles.history}>
              {history.slice(-HISTORY_DISPLAY_MAX).map((h, i) => (
                <span key={i} className={`${styles.chip} ${h === 1 ? styles.chipHeads : styles.chipTails}`}>
                  {h === 1 ? 'H' : 'T'}
                </span>
              ))}
            </div>
            {history.length > HISTORY_DISPLAY_MAX && (
              <div className={styles.truncNote}>{t.historyTruncated(HISTORY_DISPLAY_MAX)}</div>
            )}
          </>
        )}
      </div>

      {/* Right: prior control + summary + explanation */}
      <div className={styles.card}>
        <h3 className={styles.panelTitle}>{t.priorLabel}</h3>
        <p className={styles.caption} style={{ marginTop: 0 }}>
          {t.priorHint}
        </p>
        <div className={styles.presetRow}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={`${styles.preset} ${activePreset === p.key ? styles.presetActive : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.label(t)}
            </button>
          ))}
        </div>
        <label className={styles.controlLabel} style={{ marginBottom: '0.6rem' }}>
          <span className={styles.controlHead}>
            <span>{t.priorAlpha}</span>
            <span className={styles.controlValue}>{prior.alpha.toFixed(1)}</span>
          </span>
          <input
            className={styles.slider}
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={prior.alpha}
            aria-label={t.priorAlpha}
            onChange={(e) => setPriorAlpha(Number(e.target.value))}
          />
        </label>
        <label className={styles.controlLabel}>
          <span className={styles.controlHead}>
            <span>{t.priorBeta}</span>
            <span className={styles.controlValue}>{prior.beta.toFixed(1)}</span>
          </span>
          <input
            className={styles.slider}
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={prior.beta}
            aria-label={t.priorBeta}
            onChange={(e) => setPriorBeta(Number(e.target.value))}
          />
        </label>

        <h3 className={styles.panelTitle} style={{ marginTop: '0.4rem' }}>
          {t.summaryHeading}
        </h3>
        <div className={styles.statGrid}>
          <Stat label={t.statObserved} value={`${heads} / ${tails}`} />
          <Stat label={t.statMean} value={stats.mean.toFixed(3)} />
          <Stat label={t.statMode} value={stats.mode === null ? t.statModeNone : stats.mode.toFixed(3)} />
          <Stat label={t.statStd} value={stats.std.toFixed(3)} />
          <Stat label={t.statCI} value={`[${stats.ci[0].toFixed(2)}, ${stats.ci[1].toFixed(2)}]`} />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <span className={styles.controlHead}>
            <span>{t.yourGuess}</span>
          </span>
          <input
            className={styles.slider}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={guess}
            aria-label={t.yourGuess}
            onChange={(e) => setGuess(Number(e.target.value))}
          />
          <div className={styles.guessRow}>
            <span>
              {t.guessValue}: <strong style={{ color: 'var(--primary)' }}>{guess.toFixed(2)}</strong>
            </span>
            {reveal && (
              <span>
                {t.guessDiff}: <strong className={guessClass}>{guessError.toFixed(3)}</strong>
              </span>
            )}
          </div>
        </div>

        <div className={styles.explain}>
          <strong className={styles.explainTitle}>{t.explainHeading}</strong>
          {t.explainBody}
          <span className={styles.formula}>{t.formulaHeading}</span>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className={styles.stat}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue}>{value}</div>
  </div>
);
