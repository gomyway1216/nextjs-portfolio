'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  KeyRound,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  DEFAULT_CRYPTO_INPUTS,
  computeCryptoDemo,
  cryptoTechniques,
  type CryptoInputs,
  type CryptoTechnique,
} from '@/lib/cs-learning/crypto';
import styles from './cs-learning-lab.module.css';

type CryptoLabProps = {
  technique: CryptoTechnique;
};

export default function CryptoLab({ technique }: CryptoLabProps) {
  const [inputs, setInputs] = useState<CryptoInputs>(DEFAULT_CRYPTO_INPUTS);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const demo = useMemo(() => computeCryptoDemo(technique.id, inputs), [technique.id, inputs]);

  const updateInput = <K extends keyof CryptoInputs>(key: K, value: CryptoInputs[K]) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.section}>
          <Link href="/study/cs/cryptography" className={styles.textLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            Crypto Lab
          </Link>

          <div className={styles.sectionHeader} style={{ marginTop: 18 }}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>{technique.family}</p>
              <h1 className={styles.title}>{technique.name}</h1>
              <p className={styles.subtitle}>{technique.summary}</p>
            </div>
            <span className={styles.badge}>{technique.family}</span>
          </div>
        </section>

        <section className={styles.labLayout} aria-label={`${technique.name} playground`}>
          <div className={styles.mainColumn}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Playground</p>
                  <h2 className={styles.toolTitle}>Change inputs and inspect the transformation</h2>
                  <p className={styles.toolText}>{technique.concept}</p>
                </div>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setInputs(DEFAULT_CRYPTO_INPUTS)}
                  title="Reset inputs"
                  aria-label="Reset inputs"
                >
                  <RotateCcw size={17} aria-hidden="true" />
                </button>
              </div>

              <CryptoInputsPanel technique={technique} inputs={inputs} updateInput={updateInput} />
            </div>

            <div className={styles.panel}>
              <div className={styles.resultBlock}>
                <div className={styles.resultHeader}>
                  <div>
                    <p className={styles.eyebrow}>Output</p>
                    <h2 className={styles.toolTitle}>{demo.outputLabel}</h2>
                  </div>
                  <KeyRound size={22} color="#2563eb" aria-hidden="true" />
                </div>
                <p className={styles.resultValue}>{demo.output || 'No output'}</p>
                {demo.secondaryOutput && (
                  <>
                    <p className={styles.metricLabel}>{demo.secondaryLabel}</p>
                    <p className={styles.resultValue}>{demo.secondaryOutput}</p>
                  </>
                )}
                {demo.warning && (
                  <div className={styles.warning}>
                    <ShieldAlert size={16} aria-hidden="true" /> {demo.warning}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Steps</p>
                  <h2 className={styles.toolTitle}>Transformation trace</h2>
                </div>
              </div>
              <ol className={styles.stepList}>
                {demo.steps.map((step) => (
                  <li key={`${step.label}-${step.result}`} className={styles.cryptoStep}>
                    <p className={styles.cryptoStepTitle}>{step.label}</p>
                    <p className={styles.cryptoExpression}>
                      {step.expression} =&gt; {step.result}
                    </p>
                    <p className={styles.cryptoNote}>{step.note}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <aside className={styles.sideColumn}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Pick</p>
                  <h2 className={styles.toolTitle}>Techniques</h2>
                </div>
              </div>
              <div className={styles.tagList}>
                {cryptoTechniques.map((item) => (
                  <Link
                    key={item.id}
                    href={item.route}
                    className={`${styles.pillButton} ${item.id === technique.id ? styles.activePill : ''}`}
                  >
                    {item.shortName}
                  </Link>
                ))}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Boundary</p>
                  <h2 className={styles.toolTitle}>Security note</h2>
                </div>
                <ShieldCheck size={21} color="#0f766e" aria-hidden="true" />
              </div>
              <p className={styles.toolText}>{technique.securityNote}</p>
            </div>

            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Check</p>
                  <h2 className={styles.toolTitle}>Quick quiz</h2>
                </div>
              </div>
              <div className={styles.quizBox}>
                <p className={styles.quizQuestion}>{technique.quiz.question}</p>
                {technique.quiz.options.map((option, index) => {
                  const isAnswered = selectedAnswer !== null;
                  const isCorrect = index === technique.quiz.answerIndex;
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
                  <p className={styles.quizFeedback}>{technique.quiz.explanation}</p>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

type CryptoInputsPanelProps = {
  technique: CryptoTechnique;
  inputs: CryptoInputs;
  updateInput: <K extends keyof CryptoInputs>(key: K, value: CryptoInputs[K]) => void;
};

function CryptoInputsPanel({ technique, inputs, updateInput }: CryptoInputsPanelProps) {
  const textBased = [
    'caesar-cipher',
    'vigenere-cipher',
    'substitution-cipher',
    'rail-fence-cipher',
    'xor-cipher',
    'hash-functions',
  ].includes(technique.id);

  return (
    <div className={styles.inputGrid}>
      {textBased && (
        <label className={`${styles.inputGroup} ${styles.inputGroupWide}`}>
          <span className={styles.label}>Message</span>
          <input
            className={styles.textInput}
            value={inputs.text}
            onChange={(event) => updateInput('text', event.target.value)}
          />
        </label>
      )}

      {technique.id === 'caesar-cipher' && (
        <NumberField
          label="Shift"
          value={inputs.shift}
          min={0}
          max={25}
          onChange={(value) => updateInput('shift', value)}
        />
      )}

      {technique.id === 'vigenere-cipher' && (
        <label className={styles.inputGroup}>
          <span className={styles.label}>Keyword</span>
          <input
            className={styles.textInput}
            value={inputs.key}
            onChange={(event) => updateInput('key', event.target.value)}
          />
        </label>
      )}

      {technique.id === 'substitution-cipher' && (
        <label className={styles.inputGroup}>
          <span className={styles.label}>Keyword alphabet seed</span>
          <input
            className={styles.textInput}
            value={inputs.substitutionKeyword}
            onChange={(event) => updateInput('substitutionKeyword', event.target.value)}
          />
        </label>
      )}

      {technique.id === 'rail-fence-cipher' && (
        <NumberField
          label="Rails"
          value={inputs.rails}
          min={2}
          max={6}
          onChange={(value) => updateInput('rails', value)}
        />
      )}

      {technique.id === 'xor-cipher' && (
        <label className={styles.inputGroup}>
          <span className={styles.label}>XOR key</span>
          <input
            className={styles.textInput}
            value={inputs.xorKey}
            onChange={(event) => updateInput('xorKey', event.target.value)}
          />
        </label>
      )}

      {technique.id === 'rsa' && (
        <>
          <NumberField label="p" value={inputs.rsaP} min={2} max={97} onChange={(value) => updateInput('rsaP', value)} />
          <NumberField label="q" value={inputs.rsaQ} min={2} max={97} onChange={(value) => updateInput('rsaQ', value)} />
          <NumberField label="e" value={inputs.rsaE} min={2} max={97} onChange={(value) => updateInput('rsaE', value)} />
          <NumberField
            label="Message number"
            value={inputs.rsaMessage}
            min={1}
            max={999}
            onChange={(value) => updateInput('rsaMessage', value)}
          />
        </>
      )}

      {technique.id === 'diffie-hellman' && (
        <>
          <NumberField label="Prime p" value={inputs.dhPrime} min={3} max={101} onChange={(value) => updateInput('dhPrime', value)} />
          <NumberField
            label="Generator g"
            value={inputs.dhGenerator}
            min={2}
            max={30}
            onChange={(value) => updateInput('dhGenerator', value)}
          />
          <NumberField
            label="Alice private"
            value={inputs.alicePrivate}
            min={1}
            max={40}
            onChange={(value) => updateInput('alicePrivate', value)}
          />
          <NumberField
            label="Bob private"
            value={inputs.bobPrivate}
            min={1}
            max={40}
            onChange={(value) => updateInput('bobPrivate', value)}
          />
        </>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.inputGroup}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.numberInput}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
