'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  getLocalizedSortingAlgorithm,
  getLocalizedSortingAlgorithms,
  normalizeSortInput,
  shuffleSortArray,
  type SortStep,
  type SortingAlgorithm,
} from '@/lib/cs-learning/sorting';
import {
  formatCsLearningCopy,
  getCsLearningCopy,
  normalizeCsLearningLanguage,
} from '@/lib/cs-learning/localization';
import styles from './cs-learning-lab.module.css';

type SortLabProps = {
  algorithm: SortingAlgorithm;
};

export default function SortLab({ algorithm }: SortLabProps) {
  const { i18n } = useTranslation();
  const language = normalizeCsLearningLanguage(i18n.language);
  const copy = getCsLearningCopy(language);
  const [array, setArray] = useState(DEFAULT_SORT_ARRAY);
  const [draftArray, setDraftArray] = useState(DEFAULT_SORT_ARRAY.join(', '));
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(520);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  const localizedAlgorithm = getLocalizedSortingAlgorithm(algorithm.id, language) ?? algorithm;
  const sortingAlgorithms = getLocalizedSortingAlgorithms(language);
  const steps = generateSortSteps(localizedAlgorithm.id, array, language);
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
            {copy.common.sortingLab}
          </Link>

          <div className={styles.sectionHeader} style={{ marginTop: 18 }}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>{copy.sortLab.algorithmVisualizer}</p>
              <h1 className={styles.title}>{localizedAlgorithm.name}</h1>
              <p className={styles.subtitle}>{localizedAlgorithm.summary}</p>
            </div>
            <Link href="/study/cs/algorithms/big-o" className={styles.secondaryLink}>
              {copy.common.complexity}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section
          className={styles.labLayout}
          aria-label={formatCsLearningCopy(copy.sortLab.labAria, { name: localizedAlgorithm.name })}
        >
          <div className={styles.mainColumn}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>{copy.common.run}</p>
                  <h2 className={styles.toolTitle}>{copy.sortLab.stepThrough}</h2>
                  <p className={styles.toolText}>{localizedAlgorithm.intuition}</p>
                </div>
                <span className={styles.phaseBadge}>
                  {copy.sortLab.phases[currentStep?.phase ?? 'setup']}
                </span>
              </div>

              {currentStep && (
                <SortBars currentStep={currentStep} maxValue={maxValue} copy={copy.sortLab} />
              )}

              <div className={styles.stepPanel}>
                <div className={styles.stepHeader}>
                  <p className={styles.stepText}>
                    {formatCsLearningCopy(copy.sortLab.step, {
                      current: stepIndex + 1,
                      total: steps.length,
                      note: currentStep?.note ?? '',
                    })}
                  </p>
                  <span className={styles.smallBadge}>{Math.round(progress)}%</span>
                </div>
                <div className={styles.timelineTrack} aria-hidden="true">
                  <div className={styles.timelineFill} style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className={styles.controlBar} aria-label={copy.sortLab.playbackControls}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setStepIndex(0)}
                  disabled={stepIndex === 0}
                  title={copy.sortLab.firstStep}
                  aria-label={copy.sortLab.firstStep}
                >
                  <SkipBack size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                  disabled={stepIndex === 0}
                  title={copy.sortLab.previousStep}
                  aria-label={copy.sortLab.previousStep}
                >
                  <StepBack size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setIsPlaying((playing) => !playing)}
                  title={isPlaying ? copy.sortLab.pause : copy.sortLab.play}
                  aria-label={isPlaying ? copy.sortLab.pause : copy.sortLab.play}
                >
                  {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}
                  disabled={stepIndex >= steps.length - 1}
                  title={copy.sortLab.nextStep}
                  aria-label={copy.sortLab.nextStep}
                >
                  <StepForward size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setStepIndex(steps.length - 1)}
                  disabled={stepIndex >= steps.length - 1}
                  title={copy.sortLab.lastStep}
                  aria-label={copy.sortLab.lastStep}
                >
                  <SkipForward size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={resetPlayback}
                  title={copy.sortLab.reset}
                  aria-label={copy.sortLab.reset}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={shuffleArray}
                  title={copy.sortLab.shuffleInput}
                  aria-label={copy.sortLab.shuffleInput}
                >
                  <Shuffle size={17} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.inputGrid}>
                <label className={`${styles.inputGroup} ${styles.inputGroupWide}`}>
                  <span className={styles.label}>{copy.sortLab.arrayValues}</span>
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
                  <span className={styles.label}>{copy.sortLab.speed}</span>
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
                  <p className={styles.eyebrow}>{copy.common.pick}</p>
                  <h2 className={styles.toolTitle}>{copy.sortLab.algorithms}</h2>
                </div>
              </div>
              <div className={styles.tagList}>
                {sortingAlgorithms.map((item) => (
                  <Link
                    key={item.id}
                    href={item.route}
                    className={`${styles.pillButton} ${item.id === localizedAlgorithm.id ? styles.activePill : ''}`}
                  >
                    {item.shortName}
                  </Link>
                ))}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.metricsGrid}>
                <Metric label={copy.common.best} value={localizedAlgorithm.best} />
                <Metric label={copy.common.average} value={localizedAlgorithm.average} />
                <Metric label={copy.common.worst} value={localizedAlgorithm.worst} />
                <Metric label={copy.common.space} value={localizedAlgorithm.space} />
                <Metric label={copy.common.comparisons} value={comparisonCount} />
                <Metric label={copy.common.writesSwaps} value={mutationCount} />
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>{copy.common.check}</p>
                  <h2 className={styles.toolTitle}>{copy.common.quickQuiz}</h2>
                </div>
              </div>
              <div className={styles.quizBox}>
                <p className={styles.quizQuestion}>{localizedAlgorithm.quiz.question}</p>
                {localizedAlgorithm.quiz.options.map((option, index) => {
                  const isAnswered = selectedAnswer !== null;
                  const isCorrect = index === localizedAlgorithm.quiz.answerIndex;
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
                  <p className={styles.quizFeedback}>{localizedAlgorithm.quiz.explanation}</p>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

type SortBarsCopy = {
  arrayVisualization: string;
  barLabel: string;
};

function SortBars({
  currentStep,
  maxValue,
  copy,
}: {
  currentStep: SortStep;
  maxValue: number;
  copy: SortBarsCopy;
}) {
  return (
    <div
      className={styles.bars}
      style={{ '--bar-count': currentStep.array.length } as CSSProperties}
      aria-label={copy.arrayVisualization}
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
              aria-label={formatCsLearningCopy(copy.barLabel, { index: index + 1, value })}
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
