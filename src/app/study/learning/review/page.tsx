'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Brain,
  Check,
  X,
  RotateCcw,
  ChevronRight,
  Loader2,
  Trophy,
  Clock,
  Flame,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { useSpacedRepetition } from '@/hooks/useStudy';
import { FlashcardDifficulty, Flashcard, DictionaryTerm } from '@/types/study';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';

type ReviewItem = (Flashcard | DictionaryTerm) & { type: 'flashcard' | 'dictionary_term' };

export default function ReviewSessionPage() {
  const { currentUser } = useAuth();
  const {
    dueFlashcards,
    dueTerms,
    totalDue,
    loading,
    error,
    reviewing,
    isComplete,
    submitReview,
    getCurrentItem,
    fetchDueItems,
  } = useSpacedRepetition();

  const [showAnswer, setShowAnswer] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 });
  const [currentItemKey, setCurrentItemKey] = useState(0);

  const currentItem = getCurrentItem();

  useEffect(() => {
    if (currentItem) {
      setShowAnswer(false);
      setStartTime(Date.now());
      setCurrentItemKey((k) => k + 1);
    }
  }, [currentItem?.id]);

  useEffect(() => {
    if (showAnswer) {
      Prism.highlightAll();
    }
  }, [showAnswer]);

  const handleReveal = () => {
    setShowAnswer(true);
  };

  const handleDifficulty = async (difficulty: FlashcardDifficulty) => {
    if (!currentItem) return;

    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    await submitReview(
      currentItem.id,
      currentItem.type,
      difficulty,
      timeTaken
    );

    setSessionStats((prev) => ({
      reviewed: prev.reviewed + 1,
      correct: prev.correct + (difficulty !== FlashcardDifficulty.AGAIN ? 1 : 0),
    }));
  };

  if (!currentUser || currentUser.isAnonymous) {
    return (
      <div style={{ minHeight: '100vh', padding: '48px 16px', textAlign: 'center' }}>
        <p>Please sign in to start a review session.</p>
        <Link href="/login">Sign In</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: '#6366f1' }} />
      </div>
    );
  }

  if (totalDue === 0 && !isComplete) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingTop: '8px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
          <Trophy size={64} style={{ color: '#10b981', marginBottom: '16px' }} />
          <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>All Caught Up!</h1>
          <p style={{ color: '#6b7280', marginBottom: '24px' }}>
            You have no items due for review right now. Keep learning!
          </p>
          <Link
            href="/study/learning"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: '#6366f1',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '500',
            }}
          >
            Back to Learning Hub
          </Link>
        </div>
      </div>
    );
  }

  if (isComplete) {
    const accuracy = sessionStats.reviewed > 0
      ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100)
      : 0;

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingTop: '8px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
          <Trophy size={64} style={{ color: '#f59e0b', marginBottom: '16px' }} />
          <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>Session Complete!</h1>
          <p style={{ color: '#6b7280', marginBottom: '32px' }}>Great job reviewing your learning materials!</p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
              marginBottom: '32px',
            }}
          >
            <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#6366f1' }}>{sessionStats.reviewed}</div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>Items Reviewed</div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>{sessionStats.correct}</div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>Correct</div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>{accuracy}%</div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>Accuracy</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                fetchDueItems();
                setSessionStats({ reviewed: 0, correct: 0 });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                backgroundColor: 'white',
                color: '#374151',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              <RotateCcw size={18} />
              Review More
            </button>
            <Link
              href="/study/learning"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                backgroundColor: '#6366f1',
                color: 'white',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '500',
              }}
            >
              Done
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingTop: '8px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <Link
            href="/study/learning"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: '#6b7280',
              textDecoration: 'none',
              fontSize: '14px',
            }}
          >
            <ArrowLeft size={16} />
            Exit
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {sessionStats.reviewed} / {totalDue} reviewed
            </span>
            <div
              style={{
                width: '120px',
                height: '6px',
                backgroundColor: '#e2e8f0',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(sessionStats.reviewed / totalDue) * 100}%`,
                  height: '100%',
                  backgroundColor: '#6366f1',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        </div>

        {/* Card */}
        {currentItem && (
          <div
            key={currentItemKey}
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              minHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
            }}
          >
            {/* Card type indicator */}
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
              <span
                style={{
                  padding: '4px 12px',
                  backgroundColor: currentItem.type === 'flashcard' ? '#eef2ff' : '#f0fdf4',
                  color: currentItem.type === 'flashcard' ? '#6366f1' : '#16a34a',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                {currentItem.type === 'flashcard' ? 'Flashcard' : 'Dictionary Term'}
              </span>
            </div>

            {/* Question / Front */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              {currentItem.type === 'flashcard' ? (
                <div style={{ textAlign: 'center' }}>
                  {(currentItem as Flashcard).frontType === 'code' ? (
                    <pre
                      style={{
                        backgroundColor: '#1e1e1e',
                        padding: '16px',
                        borderRadius: '8px',
                        overflow: 'auto',
                        textAlign: 'left',
                        fontSize: '14px',
                      }}
                    >
                      <code className={`language-${(currentItem as Flashcard).codeLanguage || 'typescript'}`}>
                        {(currentItem as Flashcard).front}
                      </code>
                    </pre>
                  ) : (
                    <p style={{ fontSize: '20px', color: '#111827', lineHeight: 1.6 }}>
                      {(currentItem as Flashcard).front}
                    </p>
                  )}
                  {(currentItem as Flashcard).hint && !showAnswer && (
                    <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '16px', fontStyle: 'italic' }}>
                      Hint: {(currentItem as Flashcard).hint}
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                    {(currentItem as DictionaryTerm).term}
                  </p>
                  {(currentItem as DictionaryTerm).pronunciation && (
                    <p style={{ fontSize: '14px', color: '#9ca3af' }}>
                      /{(currentItem as DictionaryTerm).pronunciation}/
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Reveal / Answer */}
            {!showAnswer ? (
              <div style={{ textAlign: 'center', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  onClick={handleReveal}
                  style={{
                    padding: '14px 48px',
                    backgroundColor: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '15px',
                  }}
                >
                  Show Answer
                </button>
              </div>
            ) : (
              <>
                {/* Answer / Back */}
                <div
                  style={{
                    padding: '24px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '12px',
                    marginBottom: '24px',
                  }}
                >
                  {currentItem.type === 'flashcard' ? (
                    <div>
                      {(currentItem as Flashcard).backType === 'code' ? (
                        <pre
                          style={{
                            backgroundColor: '#1e1e1e',
                            padding: '16px',
                            borderRadius: '8px',
                            overflow: 'auto',
                            fontSize: '14px',
                            margin: 0,
                          }}
                        >
                          <code className={`language-${(currentItem as Flashcard).codeLanguage || 'typescript'}`}>
                            {(currentItem as Flashcard).back}
                          </code>
                        </pre>
                      ) : (
                        <p style={{ fontSize: '16px', color: '#374151', lineHeight: 1.6, margin: 0 }}>
                          {(currentItem as Flashcard).back}
                        </p>
                      )}
                      {(currentItem as Flashcard).explanation && (
                        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '12px', marginBottom: 0 }}>
                          {(currentItem as Flashcard).explanation}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: '16px', color: '#374151', lineHeight: 1.6, margin: 0 }}>
                        {(currentItem as DictionaryTerm).definition}
                      </p>
                      {(currentItem as DictionaryTerm).examples.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                          <p style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>
                            Examples:
                          </p>
                          {(currentItem as DictionaryTerm).examples.slice(0, 2).map((example, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: '14px',
                                color: '#4b5563',
                                backgroundColor: 'white',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                marginBottom: '8px',
                              }}
                            >
                              {example.context}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Difficulty Buttons */}
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                    How well did you know this?
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <DifficultyButton
                      difficulty={FlashcardDifficulty.AGAIN}
                      label="Again"
                      sublabel="< 1 min"
                      color="#ef4444"
                      onClick={() => handleDifficulty(FlashcardDifficulty.AGAIN)}
                      disabled={reviewing}
                    />
                    <DifficultyButton
                      difficulty={FlashcardDifficulty.HARD}
                      label="Hard"
                      sublabel="~10 min"
                      color="#f59e0b"
                      onClick={() => handleDifficulty(FlashcardDifficulty.HARD)}
                      disabled={reviewing}
                    />
                    <DifficultyButton
                      difficulty={FlashcardDifficulty.GOOD}
                      label="Good"
                      sublabel="~1 day"
                      color="#10b981"
                      onClick={() => handleDifficulty(FlashcardDifficulty.GOOD)}
                      disabled={reviewing}
                    />
                    <DifficultyButton
                      difficulty={FlashcardDifficulty.EASY}
                      label="Easy"
                      sublabel="4+ days"
                      color="#6366f1"
                      onClick={() => handleDifficulty(FlashcardDifficulty.EASY)}
                      disabled={reviewing}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DifficultyButton({
  difficulty,
  label,
  sublabel,
  color,
  onClick,
  disabled,
}: {
  difficulty: FlashcardDifficulty;
  label: string;
  sublabel: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 20px',
        backgroundColor: 'white',
        border: `2px solid ${color}`,
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = color;
          e.currentTarget.style.color = 'white';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'white';
        e.currentTarget.style.color = '#374151';
      }}
    >
      <div style={{ fontWeight: '600', fontSize: '14px' }}>{label}</div>
      <div style={{ fontSize: '11px', color: '#9ca3af' }}>{sublabel}</div>
    </button>
  );
}
