'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  XCircle,
} from 'lucide-react';
import {
  DEFAULT_SORT_ARRAY,
  generateSortSteps,
  normalizeSortInput,
  shuffleSortArray,
  sortingAlgorithms,
  type SortStep,
  type SortingAlgorithm,
} from '@/lib/cs-learning/sorting';
import styles from './cs-learning-lab.module.css';

type SortLabProps = {
  algorithm: SortingAlgorithm;
};

export default function SortLab({ algorithm }: SortLabProps) {
  const [array, setArray] = useState(DEFAULT_SORT_ARRAY);
  const [draftArray, setDraftArray] = useState(DEFAULT_SORT_ARRAY.join(', '));
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(520);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  const steps = useMemo(() => generateSortSteps(algorithm.id, array), [algorithm.id, array]);
  const currentStep = steps[stepIndex] ?? steps[0];
  const maxValue = Math.max(...array, 1);
  const comparisonCount = steps.filter((step) => step.phase === 'compare').length;
  const mutationCount = steps.filter((step) => step.phase === 'swap' || step.phase === 'write').length;
  const progress = steps.length <= 1 ? 100 : (stepIndex / (steps.length - 1)) * 100;

  useEffect(() => {
    if (!isPlaying) return;
    if (stepIndex >= steps.length - 1) {
      const timer = window.setTimeout(() => setIsPlaying(false), 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }, speed);

    return () => window.clearTimeout(timer);
  }, [isPlaying, speed, stepIndex, steps.length]);

  const resetPlayback = () => {
    setStepIndex(0);
    setIsPlaying(false);
    setSelectedAnswer(null);
  };

  const applyArray = () => {
    const nextArray = normalizeSortInput(draftArray);
    if (nextArray.length >= 2) {
      setArray(nextArray);
      setDraftArray(nextArray.join(', '));
      resetPlayback();
    }
  };

  const shuffleArray = () => {
    const nextArray = shuffleSortArray(array);
    setArray(nextArray);
    setDraftArray(nextArray.join(', '));
    resetPlayback();
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.section}>
          <Link href="/study/cs/algorithms/sorting" className={styles.textLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            Sorting Lab
          </Link>

          <div className={styles.sectionHeader} style={{ marginTop: 18 }}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>Algorithm visualizer</p>
              <h1 className={styles.title}>{algorithm.name}</h1>
              <p className={styles.subtitle}>{algorithm.summary}</p>
            </div>
            <Link href="/study/cs/algorithms/big-o" className={styles.secondaryLink}>
              Complexity
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className={styles.labLayout} aria-label={`${algorithm.name} interactive lab`}>
          <div className={styles.mainColumn}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Run</p>
                  <h2 className={styles.toolTitle}>Step through the array</h2>
                  <p className={styles.toolText}>{algorithm.intuition}</p>
                </div>
                <span className={styles.phaseBadge}>{currentStep?.phase ?? 'setup'}</span>
              </div>

              {currentStep && (
                <SortBars currentStep={currentStep} maxValue={maxValue} />
              )}

              <div className={styles.stepPanel}>
                <div className={styles.stepHeader}>
                  <p className={styles.stepText}>
                    Step {stepIndex + 1} / {steps.length}: {currentStep?.note}
                  </p>
                  <span className={styles.smallBadge}>{Math.round(progress)}%</span>
                </div>
                <div className={styles.timelineTrack} aria-hidden="true">
                  <div className={styles.timelineFill} style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className={styles.controlBar} aria-label="Playback controls">
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setStepIndex(0)}
                  disabled={stepIndex === 0}
                  title="First step"
                  aria-label="First step"
                >
                  <SkipBack size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                  disabled={stepIndex === 0}
                  title="Previous step"
                  aria-label="Previous step"
                >
                  <StepBack size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setIsPlaying((playing) => !playing)}
                  title={isPlaying ? 'Pause' : 'Play'}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}
                  disabled={stepIndex >= steps.length - 1}
                  title="Next step"
                  aria-label="Next step"
                >
                  <StepForward size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setStepIndex(steps.length - 1)}
                  disabled={stepIndex >= steps.length - 1}
                  title="Last step"
                  aria-label="Last step"
                >
                  <SkipForward size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={resetPlayback}
                  title="Reset"
                  aria-label="Reset"
                >
                  <RotateCcw size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={shuffleArray}
                  title="Shuffle input"
                  aria-label="Shuffle input"
                >
                  <Shuffle size={17} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.inputGrid}>
                <label className={`${styles.inputGroup} ${styles.inputGroupWide}`}>
                  <span className={styles.label}>Array values</span>
                  <input
                    className={styles.textInput}
                    value={draftArray}
                    onChange={(event) => setDraftArray(event.target.value)}
                    onBlur={applyArray}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyArray();
                    }}
                    placeholder="9, 4, 7, 2, 8, 1"
                  />
                </label>
                <label className={styles.inputGroup}>
                  <span className={styles.label}>Speed</span>
                  <input
                    className={styles.rangeInput}
                    type="range"
                    min={180}
                    max={1000}
                    step={20}
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
          </div>

          <aside className={styles.sideColumn}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Pick</p>
                  <h2 className={styles.toolTitle}>Algorithms</h2>
                </div>
              </div>
              <div className={styles.tagList}>
                {sortingAlgorithms.map((item) => (
                  <Link
                    key={item.id}
                    href={item.route}
                    className={`${styles.pillButton} ${item.id === algorithm.id ? styles.activePill : ''}`}
                  >
                    {item.shortName}
                  </Link>
                ))}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.metricsGrid}>
                <Metric label="Best" value={algorithm.best} />
                <Metric label="Average" value={algorithm.average} />
                <Metric label="Worst" value={algorithm.worst} />
                <Metric label="Space" value={algorithm.space} />
                <Metric label="Comparisons" value={comparisonCount} />
                <Metric label="Writes/Swaps" value={mutationCount} />
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Check</p>
                  <h2 className={styles.toolTitle}>Quick quiz</h2>
                </div>
              </div>
              <div className={styles.quizBox}>
                <p className={styles.quizQuestion}>{algorithm.quiz.question}</p>
                {algorithm.quiz.options.map((option, index) => {
                  const isAnswered = selectedAnswer !== null;
                  const isCorrect = index === algorithm.quiz.answerIndex;
                  const isWrongSelection = selectedAnswer === index && !isCorrect;

                  return (
                    <button
                      key={option}
                      type="button"
                      className={[
                        styles.choiceButton,
                        isAnswered && isCorrect ? styles.choiceCorrect : '',
                        isWrongSelection ? styles.choiceWrong : '',
                      ].join(' ')}
                      onClick={() => setSelectedAnswer(index)}
                    >
                      {isAnswered && isCorrect && <CheckCircle size={16} aria-hidden="true" />}
                      {isWrongSelection && <XCircle size={16} aria-hidden="true" />}
                      {option}
                    </button>
                  );
                })}
                {selectedAnswer !== null && (
                  <p className={styles.quizFeedback}>{algorithm.quiz.explanation}</p>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function SortBars({ currentStep, maxValue }: { currentStep: SortStep; maxValue: number }) {
  return (
    <div
      className={styles.bars}
      style={{ '--bar-count': currentStep.array.length } as CSSProperties}
      aria-label="Array visualization"
    >
      {currentStep.array.map((value, index) => {
        const barClasses = [styles.bar];

        if (currentStep.sorted?.includes(index)) barClasses.push(styles.barSorted);
        if (currentStep.range?.includes(index)) barClasses.push(styles.barRange);
        if (currentStep.pivot === index) barClasses.push(styles.barPivot);
        if (currentStep.comparing?.includes(index)) barClasses.push(styles.barCompare);
        if (currentStep.writing?.includes(index)) barClasses.push(styles.barWrite);
        if (currentStep.swapping?.includes(index)) barClasses.push(styles.barSwap);

        return (
          <div key={`${index}-${value}`} className={styles.barCell}>
            <div
              className={barClasses.join(' ')}
              style={{ height: `${Math.max(12, (value / maxValue) * 100)}%` }}
              aria-label={`Index ${index + 1}, value ${value}`}
            />
            <span className={styles.barLabel}>{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.metric}>
      <p className={styles.metricLabel}>{label}</p>
      <p className={styles.metricValue}>{value}</p>
    </div>
  );
}
