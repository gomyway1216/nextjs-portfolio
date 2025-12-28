'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStudyQuiz, useStudyCategories, useStudyTopics, useQuizAttempts } from '@/hooks/useStudy';
import { submitQuiz } from '@/services/studyService';
import { useAuth } from '@/providers/AuthProvider';
import {
  QuizQuestion,
  QuizQuestionType,
  QuizDifficulty,
  QuizAnswer,
  QuizAttempt,
} from '@/types/study';
import { ArrowLeft, ChevronLeft, ChevronRight, Check, Loader2, History, RotateCcw } from 'lucide-react';

// Simple markdown renderer for feedback text
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = keyCounter++;

    // Code block (```)
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={key} style={{ backgroundColor: '#1f2937', color: '#e5e7eb', padding: '12px', borderRadius: '8px', overflow: 'auto', margin: '12px 0', fontSize: '13px' }}>
          <code className={lang ? `language-${lang}` : undefined}>{codeLines.join('\n')}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Headers
    if (line.startsWith('#### ')) {
      elements.push(<h4 key={key} style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginTop: '12px', marginBottom: '6px' }}>{renderInlineMarkdown(line.slice(5))}</h4>);
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={key} style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginTop: '16px', marginBottom: '8px' }}>{renderInlineMarkdown(line.slice(4))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={key} style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginTop: '20px', marginBottom: '12px' }}>{renderInlineMarkdown(line.slice(3))}</h2>);
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={key} style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginTop: '24px', marginBottom: '12px' }}>{renderInlineMarkdown(line.slice(2))}</h1>);
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^[\s]*[-*]\s/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*]\s/)) {
        const itemKey = keyCounter++;
        const itemText = lines[i].replace(/^[\s]*[-*]\s/, '');
        listItems.push(<li key={itemKey} style={{ marginBottom: '4px', fontSize: '14px' }}>{renderInlineMarkdown(itemText)}</li>);
        i++;
      }
      elements.push(<ul key={key} style={{ paddingLeft: '20px', margin: '8px 0' }}>{listItems}</ul>);
      continue;
    }

    // Ordered list
    if (line.match(/^[\s]*\d+\.\s/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*\d+\.\s/)) {
        const itemKey = keyCounter++;
        const itemText = lines[i].replace(/^[\s]*\d+\.\s/, '');
        listItems.push(<li key={itemKey} style={{ marginBottom: '4px', fontSize: '14px' }}>{renderInlineMarkdown(itemText)}</li>);
        i++;
      }
      elements.push(<ol key={key} style={{ paddingLeft: '20px', margin: '8px 0' }}>{listItems}</ol>);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(<p key={key} style={{ lineHeight: 1.7, margin: '8px 0', fontSize: '14px' }}>{renderInlineMarkdown(line)}</p>);
    i++;
  }

  return elements;
}

// Render inline markdown (bold, italic, code, links)
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(<code key={keyCounter++} style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace' }}>{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={keyCounter++} style={{ fontWeight: '600', color: '#111827' }}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<em key={keyCounter++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(<a key={keyCounter++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#10a37f', textDecoration: 'underline' }}>{linkMatch[1]}</a>);
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Regular text - find next special char or end
    const nextSpecial = remaining.search(/[`*\[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts.length === 1 ? parts[0] : parts;
}

export default function StudyQuizPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = Array.isArray(params.id) ? params.id[0] : params.id || '';

  // Auth
  const { currentUser } = useAuth();
  const isLoggedIn = !!currentUser;

  // State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number[]>>({});
  const [startTime, setStartTime] = useState(new Date().toISOString());
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [timeTaken, setTimeTaken] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingPastAttempt, setViewingPastAttempt] = useState<QuizAttempt | null>(null);

  // Data hooks
  const { quiz, loading, error } = useStudyQuiz(quizId);
  const { categories } = useStudyCategories();
  const { topics } = useStudyTopics();
  const { attempts: pastAttempts, loading: attemptsLoading, fetchAttempts } = useQuizAttempts(isLoggedIn ? quizId : undefined);

  // Get category and topic info
  const category = categories.find((c) => c.id === quiz?.categoryId);
  const topic = topics.find((t) => t.id === quiz?.topicId);

  const currentQuestion = quiz?.questions[currentQuestionIndex];

  // Track time on question change
  useEffect(() => {
    if (currentQuestion) {
      setQuestionStartTime(Date.now());
    }
  }, [currentQuestionIndex]);

  const saveTimeForQuestion = (questionId: string) => {
    const timeSpent = Math.round((Date.now() - questionStartTime) / 1000);
    setTimeTaken((prev) => ({
      ...prev,
      [questionId]: (prev[questionId] || 0) + timeSpent,
    }));
  };

  const handleAnswer = (questionId: string, answer: string | string[] | number[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleNextQuestion = () => {
    if (currentQuestion) {
      saveTimeForQuestion(currentQuestion.id);
    }
    if (quiz && currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestion) {
      saveTimeForQuestion(currentQuestion.id);
    }
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!quiz) return;

    // Save time for current question
    if (currentQuestion) {
      saveTimeForQuestion(currentQuestion.id);
    }

    setIsSubmitting(true);
    try {
      // Format answers
      const formattedAnswers: QuizAnswer[] = quiz.questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] || '',
        timeTaken: timeTaken[q.id] || 0,
      }));

      const result = await submitQuiz(quizId, formattedAnswers, startTime);
      setAttempt(result);
      setShowResults(true);
      // Refetch attempts if logged in
      if (isLoggedIn) {
        fetchAttempts();
      }
    } catch (error) {
      console.error('Failed to submit quiz:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retry quiz - reset all state
  const handleRetry = () => {
    setCurrentQuestionIndex(0);
    setAnswers({});
    setStartTime(new Date().toISOString());
    setQuestionStartTime(Date.now());
    setTimeTaken({});
    setAttempt(null);
    setShowResults(false);
    setViewingPastAttempt(null);
  };

  // View a past attempt
  const handleViewPastAttempt = (pastAttempt: QuizAttempt) => {
    setViewingPastAttempt(pastAttempt);
    setShowHistory(false);
  };

  const getDifficultyStyle = (difficulty: QuizDifficulty) => {
    switch (difficulty) {
      case QuizDifficulty.BEGINNER:
        return { backgroundColor: '#dcfce7', color: '#166534' };
      case QuizDifficulty.INTERMEDIATE:
        return { backgroundColor: '#fef9c3', color: '#854d0e' };
      case QuizDifficulty.ADVANCED:
        return { backgroundColor: '#ffedd5', color: '#9a3412' };
      case QuizDifficulty.EXPERT:
        return { backgroundColor: '#fee2e2', color: '#991b1b' };
      default:
        return { backgroundColor: '#f3f4f6', color: '#374151' };
    }
  };

  const answeredCount = useMemo(() => {
    return Object.keys(answers).filter((key) => {
      const answer = answers[key];
      if (Array.isArray(answer)) return answer.length > 0;
      return answer !== '' && answer !== undefined;
    }).length;
  }, [answers]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={48} color="#10a37f" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Loading quiz...</p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '0 20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>Quiz Not Found</h1>
          <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '14px' }}>{error?.message || 'The quiz you are looking for does not exist.'}</p>
          <button
            onClick={() => router.push('/study')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#10a37f',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Back to Study
          </button>
        </div>
      </div>
    );
  }

  if (showResults && attempt) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 20px' }}>
          {/* Results Header */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', padding: '32px', marginBottom: '24px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>Quiz Results</h1>
            <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '14px' }}>{quiz.title}</p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '128px',
                height: '128px',
                borderRadius: '50%',
                fontSize: '36px',
                fontWeight: '700',
                marginBottom: '16px',
                backgroundColor: attempt.passed ? '#dcfce7' : '#fee2e2',
                color: attempt.passed ? '#166534' : '#991b1b',
              }}
            >
              {Math.round(attempt.percentage)}%
            </div>

            <p style={{ fontSize: '18px', fontWeight: '600', color: attempt.passed ? '#166534' : '#991b1b' }}>
              {attempt.passed ? 'Passed!' : 'Not Passed'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', marginTop: '24px' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                  {attempt.score}/{attempt.totalPoints}
                </span>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Points</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                  {Math.round(attempt.timeSpent / 60)}:{String(attempt.timeSpent % 60).padStart(2, '0')}
                </span>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Time</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                  {attempt.feedback.filter((f) => f.isCorrect).length}/{quiz.questions.length}
                </span>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Correct</span>
              </div>
            </div>
          </div>

          {/* Question Review */}
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>Question Review</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {quiz.questions.map((question, index) => {
              const feedback = attempt.feedback.find((f) => f.questionId === question.id);

              // Helper to get display text for an answer (converts option IDs to text)
              const getAnswerDisplayText = (answerValue: string | string[] | number[] | undefined): string => {
                if (!answerValue) return 'No answer';

                // For multiple choice/true-false, find the option text
                if (question.type === QuizQuestionType.MULTIPLE_CHOICE ||
                    question.type === QuizQuestionType.TRUE_FALSE) {
                  const option = question.options?.find((o) => o.id === answerValue);
                  return option?.text || String(answerValue);
                }

                // For multiple select
                if (question.type === QuizQuestionType.MULTIPLE_SELECT && Array.isArray(answerValue)) {
                  return (answerValue as string[])
                    .map((id) => question.options?.find((o) => o.id === id)?.text || id)
                    .join(', ');
                }

                // For other types, return as-is
                if (Array.isArray(answerValue)) {
                  return (answerValue as string[]).join(', ');
                }
                return String(answerValue);
              };

              // Get the correct answer text for display
              const getCorrectAnswerText = (): string | null => {
                // For multiple choice/true-false, find the correct option
                if (question.type === QuizQuestionType.MULTIPLE_CHOICE ||
                    question.type === QuizQuestionType.TRUE_FALSE) {
                  const correctOption = question.options?.find((o) => o.isCorrect);
                  return correctOption?.text || null;
                }

                // For multiple select, find all correct options
                if (question.type === QuizQuestionType.MULTIPLE_SELECT) {
                  const correctOptions = question.options?.filter((o) => o.isCorrect);
                  if (correctOptions && correctOptions.length > 0) {
                    return correctOptions.map((o) => o.text).join(', ');
                  }
                  return null;
                }

                // For other types, use the feedback's correctAnswer or expectedAnswer
                return feedback?.correctAnswer || question.expectedAnswer || null;
              };

              const userAnswerText = getAnswerDisplayText(answers[question.id]);
              const correctAnswerText = getCorrectAnswerText();

              return (
                <div
                  key={question.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '1px solid #e5e7eb',
                    borderLeft: `4px solid ${feedback?.isCorrect ? '#22c55e' : '#ef4444'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h3 style={{ fontWeight: '600', color: '#111827', fontSize: '15px', flex: 1, paddingRight: '12px' }}>
                      Q{index + 1}: {question.question}
                    </h3>
                    <span
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        borderRadius: '20px',
                        fontWeight: '500',
                        backgroundColor: feedback?.isCorrect ? '#dcfce7' : '#fee2e2',
                        color: feedback?.isCorrect ? '#166534' : '#991b1b',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {feedback?.pointsEarned}/{question.points} pts
                    </span>
                  </div>

                  {/* Your Answer */}
                  <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                    <span style={{ color: '#6b7280' }}>Your answer: </span>
                    <span style={{ color: feedback?.isCorrect ? '#166534' : '#991b1b', fontWeight: '500' }}>
                      {userAnswerText}
                    </span>
                  </div>

                  {/* Correct Answer - show for incorrect answers */}
                  {!feedback?.isCorrect && correctAnswerText && (
                    <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                      <span style={{ color: '#6b7280' }}>Correct answer: </span>
                      <span style={{ color: '#166534', fontWeight: '500' }}>{correctAnswerText}</span>
                    </div>
                  )}

                  {/* Feedback */}
                  {feedback?.feedback && (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px', marginTop: '12px', border: '1px solid #e5e7eb' }}>
                      <strong style={{ fontSize: '13px', color: '#374151' }}>Feedback:</strong>
                      <div style={{ marginTop: '4px', color: '#374151' }}>{renderMarkdown(feedback.feedback)}</div>
                    </div>
                  )}

                  {/* AI Assessment for free-form */}
                  {feedback?.aiAssessment && (
                    <div style={{ backgroundColor: '#ecfdf5', borderRadius: '8px', padding: '12px', marginTop: '12px', border: '1px solid #a7f3d0' }}>
                      <strong style={{ fontSize: '13px', color: '#065f46' }}>AI Assessment:</strong>
                      <div style={{ marginTop: '4px', color: '#065f46' }}>{renderMarkdown(feedback.aiAssessment)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap' }}>
            <button
              onClick={handleRetry}
              style={{
                flex: 1,
                minWidth: '140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 20px',
                backgroundColor: '#10a37f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={16} /> Try Again
            </button>
            {isLoggedIn && pastAttempts && pastAttempts.length > 1 && (
              <button
                onClick={() => setShowHistory(true)}
                style={{
                  flex: 1,
                  minWidth: '140px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                <History size={16} /> Past Attempts ({pastAttempts.length})
              </button>
            )}
            <button
              onClick={() => router.push(`/study/articles/${quiz.articleId}`)}
              style={{
                flex: 1,
                minWidth: '140px',
                padding: '12px 20px',
                backgroundColor: '#ffffff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Back to Article
            </button>
          </div>
        </div>
      </div>
    );
  }

  // View past attempt results
  if (viewingPastAttempt && quiz) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 20px' }}>
          {/* Past Attempt Header */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', padding: '32px', marginBottom: '24px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
              <History size={20} color="#6b7280" />
              <span style={{ fontSize: '13px', color: '#6b7280' }}>Past Attempt</span>
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>Quiz Results</h1>
            <p style={{ color: '#6b7280', marginBottom: '8px', fontSize: '14px' }}>{quiz.title}</p>
            <p style={{ color: '#9ca3af', fontSize: '12px' }}>
              {new Date(viewingPastAttempt.completedAt).toLocaleDateString()} at {new Date(viewingPastAttempt.completedAt).toLocaleTimeString()}
            </p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '128px',
                height: '128px',
                borderRadius: '50%',
                fontSize: '36px',
                fontWeight: '700',
                marginTop: '16px',
                marginBottom: '16px',
                backgroundColor: viewingPastAttempt.passed ? '#dcfce7' : '#fee2e2',
                color: viewingPastAttempt.passed ? '#166534' : '#991b1b',
              }}
            >
              {Math.round(viewingPastAttempt.percentage)}%
            </div>

            <p style={{ fontSize: '18px', fontWeight: '600', color: viewingPastAttempt.passed ? '#166534' : '#991b1b' }}>
              {viewingPastAttempt.passed ? 'Passed!' : 'Not Passed'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', marginTop: '24px' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                  {viewingPastAttempt.score}/{viewingPastAttempt.totalPoints}
                </span>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Points</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                  {Math.round(viewingPastAttempt.timeSpent / 60)}:{String(viewingPastAttempt.timeSpent % 60).padStart(2, '0')}
                </span>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Time</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                  {viewingPastAttempt.feedback.filter((f) => f.isCorrect).length}/{quiz.questions.length}
                </span>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Correct</span>
              </div>
            </div>
          </div>

          {/* Question Review for past attempt */}
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>Question Review</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {quiz.questions.map((question, index) => {
              const feedback = viewingPastAttempt.feedback.find((f) => f.questionId === question.id);
              const pastAnswer = viewingPastAttempt.answers.find((a) => a.questionId === question.id);

              // Helper to get display text for an answer
              const getAnswerDisplayText = (answerValue: string | string[] | number | number[] | undefined): string => {
                if (!answerValue) return 'No answer';
                if (question.type === QuizQuestionType.MULTIPLE_CHOICE || question.type === QuizQuestionType.TRUE_FALSE) {
                  const option = question.options?.find((o) => o.id === answerValue);
                  return option?.text || String(answerValue);
                }
                if (question.type === QuizQuestionType.MULTIPLE_SELECT && Array.isArray(answerValue)) {
                  return (answerValue as string[]).map((id) => question.options?.find((o) => o.id === id)?.text || id).join(', ');
                }
                if (Array.isArray(answerValue)) return (answerValue as string[]).join(', ');
                return String(answerValue);
              };

              const getCorrectAnswerText = (): string | null => {
                if (question.type === QuizQuestionType.MULTIPLE_CHOICE || question.type === QuizQuestionType.TRUE_FALSE) {
                  return question.options?.find((o) => o.isCorrect)?.text || null;
                }
                if (question.type === QuizQuestionType.MULTIPLE_SELECT) {
                  const correct = question.options?.filter((o) => o.isCorrect);
                  return correct && correct.length > 0 ? correct.map((o) => o.text).join(', ') : null;
                }
                return feedback?.correctAnswer || question.expectedAnswer || null;
              };

              return (
                <div
                  key={question.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '1px solid #e5e7eb',
                    borderLeft: `4px solid ${feedback?.isCorrect ? '#22c55e' : '#ef4444'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h3 style={{ fontWeight: '600', color: '#111827', fontSize: '15px', flex: 1, paddingRight: '12px' }}>
                      Q{index + 1}: {question.question}
                    </h3>
                    <span style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '20px', fontWeight: '500', backgroundColor: feedback?.isCorrect ? '#dcfce7' : '#fee2e2', color: feedback?.isCorrect ? '#166534' : '#991b1b', whiteSpace: 'nowrap' }}>
                      {feedback?.pointsEarned}/{question.points} pts
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                    <span style={{ color: '#6b7280' }}>Your answer: </span>
                    <span style={{ color: feedback?.isCorrect ? '#166534' : '#991b1b', fontWeight: '500' }}>
                      {getAnswerDisplayText(pastAnswer?.answer)}
                    </span>
                  </div>
                  {!feedback?.isCorrect && getCorrectAnswerText() && (
                    <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                      <span style={{ color: '#6b7280' }}>Correct answer: </span>
                      <span style={{ color: '#166534', fontWeight: '500' }}>{getCorrectAnswerText()}</span>
                    </div>
                  )}
                  {feedback?.feedback && (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px', marginTop: '12px', border: '1px solid #e5e7eb' }}>
                      <strong style={{ fontSize: '13px', color: '#374151' }}>Feedback:</strong>
                      <div style={{ marginTop: '4px', color: '#374151' }}>{renderMarkdown(feedback.feedback)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
            <button
              onClick={handleRetry}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 20px',
                backgroundColor: '#10a37f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={16} /> Take Quiz Again
            </button>
            <button
              onClick={() => setShowHistory(true)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 20px',
                backgroundColor: '#ffffff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              <History size={16} /> All Attempts
            </button>
          </div>
        </div>
      </div>
    );
  }

  // History modal
  if (showHistory && pastAttempts) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <button
              onClick={() => {
                setShowHistory(false);
                if (!showResults && !viewingPastAttempt) {
                  // Go back to quiz taking
                } else if (showResults) {
                  // Stay on results
                  setShowHistory(false);
                } else {
                  setViewingPastAttempt(null);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={18} color="#374151" />
            </button>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>Past Attempts</h1>
              <p style={{ fontSize: '13px', color: '#6b7280' }}>{quiz?.title}</p>
            </div>
          </div>

          {attemptsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader2 size={32} color="#10a37f" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : pastAttempts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <p>No past attempts found.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pastAttempts
                .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                .map((pastAttempt, index) => (
                  <button
                    key={pastAttempt.id}
                    onClick={() => handleViewPastAttempt(pastAttempt)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>
                          Attempt #{pastAttempts.length - index}
                        </span>
                        <span
                          style={{
                            padding: '2px 8px',
                            fontSize: '11px',
                            borderRadius: '12px',
                            fontWeight: '500',
                            backgroundColor: pastAttempt.passed ? '#dcfce7' : '#fee2e2',
                            color: pastAttempt.passed ? '#166534' : '#991b1b',
                          }}
                        >
                          {pastAttempt.passed ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {new Date(pastAttempt.completedAt).toLocaleDateString()} at {new Date(pastAttempt.completedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: '20px', fontWeight: '700', color: pastAttempt.passed ? '#166534' : '#991b1b' }}>
                        {Math.round(pastAttempt.percentage)}%
                      </span>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {pastAttempt.score}/{pastAttempt.totalPoints} pts
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          )}

          <div style={{ marginTop: '24px' }}>
            <button
              onClick={handleRetry}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 20px',
                backgroundColor: '#10a37f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={16} /> Take Quiz Again
            </button>
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff' }}>
      {/* Header */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => router.push('/study')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={18} color="#374151" />
              </button>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#6b7280' }}>
                  {category && (
                    <>
                      <span style={{ color: '#10a37f' }}>{category.name}</span>
                      <span>•</span>
                    </>
                  )}
                  {topic && <span>{topic.name}</span>}
                </div>
                <h1 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginTop: '2px' }}>{quiz.title}</h1>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: '500',
                  borderRadius: '20px',
                  ...getDifficultyStyle(quiz.difficulty),
                }}
              >
                {quiz.difficulty}
              </span>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>
                {answeredCount}/{quiz.questions.length}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 20px' }}>
        {/* Progress Bar */}
        <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', padding: '16px', marginBottom: '24px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
            <span>Question {currentQuestionIndex + 1} of {quiz.questions.length}</span>
            <span>{Math.round(((currentQuestionIndex + 1) / quiz.questions.length) * 100)}%</span>
          </div>
          <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: '10px', height: '8px' }}>
            <div
              style={{
                backgroundColor: '#10a37f',
                height: '8px',
                borderRadius: '10px',
                transition: 'width 0.3s ease',
                width: `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Question */}
        {currentQuestion && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <span
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: '500',
                  borderRadius: '20px',
                  ...getDifficultyStyle(currentQuestion.difficulty),
                }}
              >
                {currentQuestion.difficulty}
              </span>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>{currentQuestion.points} points</span>
            </div>

            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '24px', lineHeight: 1.5 }}>
              {currentQuestion.question}
            </h2>

            {/* Code Snippet */}
            {currentQuestion.codeSnippet && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ backgroundColor: '#374151', borderRadius: '8px 8px 0 0', padding: '8px 16px', fontSize: '13px', color: '#9ca3af' }}>
                  {currentQuestion.language || 'code'}
                </div>
                <pre style={{ backgroundColor: '#1f2937', color: '#e5e7eb', padding: '16px', borderRadius: '0 0 8px 8px', overflow: 'auto', margin: 0, fontSize: '13px' }}>
                  <code>{currentQuestion.codeSnippet}</code>
                </pre>
              </div>
            )}

            {/* Answer Input based on type */}
            <QuestionInput
              question={currentQuestion}
              answer={answers[currentQuestion.id]}
              onChange={(answer) => handleAnswer(currentQuestion.id, answer)}
            />

            {/* Hints */}
            {currentQuestion.hints && currentQuestion.hints.length > 0 && (
              <details style={{ marginTop: '20px' }}>
                <summary style={{ fontSize: '14px', color: '#10a37f', cursor: 'pointer' }}>
                  Show Hints ({currentQuestion.hints.length})
                </summary>
                <ul style={{ marginTop: '12px', fontSize: '14px', color: '#6b7280', paddingLeft: '20px' }}>
                  {currentQuestion.hints.map((hint, index) => (
                    <li key={index} style={{ marginBottom: '4px' }}>{hint}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handlePrevQuestion}
            disabled={currentQuestionIndex === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              backgroundColor: currentQuestionIndex === 0 ? '#f3f4f6' : '#ffffff',
              color: currentQuestionIndex === 0 ? '#9ca3af' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: currentQuestionIndex === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={18} /> Previous
          </button>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {quiz.questions.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  if (currentQuestion) saveTimeForQuestion(currentQuestion.id);
                  setCurrentQuestionIndex(index);
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  fontSize: '13px',
                  fontWeight: '500',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor:
                    index === currentQuestionIndex
                      ? '#10a37f'
                      : answers[quiz.questions[index].id]
                      ? '#dcfce7'
                      : '#f3f4f6',
                  color:
                    index === currentQuestionIndex
                      ? '#ffffff'
                      : answers[quiz.questions[index].id]
                      ? '#166534'
                      : '#6b7280',
                }}
              >
                {index + 1}
              </button>
            ))}
          </div>

          {currentQuestionIndex === quiz.questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 20px',
                backgroundColor: isSubmitting ? '#86efac' : '#10a37f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Submitting...
                </>
              ) : (
                <>
                  <Check size={18} /> Submit Quiz
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                backgroundColor: '#10a37f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Next <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Question Input Component
function QuestionInput({
  question,
  answer,
  onChange,
}: {
  question: QuizQuestion;
  answer: string | string[] | number[] | undefined;
  onChange: (answer: string | string[] | number[]) => void;
}) {
  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const focusStyle = {
    borderColor: '#10a37f',
    boxShadow: '0 0 0 3px rgba(16, 163, 127, 0.1)',
  };

  // Default True/False options if none provided
  const trueFalseOptions = [
    { id: 'true', text: 'True' },
    { id: 'false', text: 'False' },
  ];

  switch (question.type) {
    case QuizQuestionType.TRUE_FALSE: {
      const options = question.options && question.options.length > 0 ? question.options : trueFalseOptions;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {options.map((option) => (
            <label
              key={option.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                borderRadius: '8px',
                border: answer === option.id ? '2px solid #10a37f' : '1px solid #e5e7eb',
                backgroundColor: answer === option.id ? '#ecfdf5' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <input
                type="radio"
                name={question.id}
                value={option.id}
                checked={answer === option.id}
                onChange={() => onChange(option.id)}
                style={{ width: '18px', height: '18px', accentColor: '#10a37f' }}
              />
              <span style={{ color: '#374151', fontSize: '14px' }}>{option.text}</span>
            </label>
          ))}
        </div>
      );
    }

    case QuizQuestionType.MULTIPLE_CHOICE:
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {question.options?.map((option) => (
            <label
              key={option.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                borderRadius: '8px',
                border: answer === option.id ? '2px solid #10a37f' : '1px solid #e5e7eb',
                backgroundColor: answer === option.id ? '#ecfdf5' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <input
                type="radio"
                name={question.id}
                value={option.id}
                checked={answer === option.id}
                onChange={() => onChange(option.id)}
                style={{ width: '18px', height: '18px', accentColor: '#10a37f' }}
              />
              <span style={{ color: '#374151', fontSize: '14px' }}>{option.text}</span>
            </label>
          ))}
        </div>
      );

    case QuizQuestionType.MULTIPLE_SELECT:
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {question.options?.map((option) => {
            const selectedAnswers = (answer as string[]) || [];
            const isSelected = selectedAnswers.includes(option.id);
            return (
              <label
                key={option.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid #10a37f' : '1px solid #e5e7eb',
                  backgroundColor: isSelected ? '#ecfdf5' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {
                    if (isSelected) {
                      onChange(selectedAnswers.filter((id) => id !== option.id));
                    } else {
                      onChange([...selectedAnswers, option.id]);
                    }
                  }}
                  style={{ width: '18px', height: '18px', accentColor: '#10a37f', borderRadius: '4px' }}
                />
                <span style={{ color: '#374151', fontSize: '14px' }}>{option.text}</span>
              </label>
            );
          })}
        </div>
      );

    case QuizQuestionType.SHORT_ANSWER:
      return (
        <input
          type="text"
          value={(answer as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your answer..."
          style={inputStyle}
          onFocus={(e) => Object.assign(e.target.style, focusStyle)}
          onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
        />
      );

    case QuizQuestionType.CODE_COMPLETION:
      // Fill-in-the-blank style - simple text input for one word/method
      return (
        <div>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
            Fill in the blank (___) in the code above:
          </p>
          <input
            type="text"
            value={(answer as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter the missing word or method..."
            style={{
              ...inputStyle,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              maxWidth: '300px',
            }}
            onFocus={(e) => Object.assign(e.target.style, focusStyle)}
            onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
      );

    case QuizQuestionType.LONG_ANSWER:
    case QuizQuestionType.CODE_REVIEW:
      return (
        <textarea
          value={(answer as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            question.type === QuizQuestionType.CODE_REVIEW
              ? 'Write your code review feedback...'
              : 'Type your answer...'
          }
          style={{
            ...inputStyle,
            minHeight: '150px',
            resize: 'vertical',
            fontFamily: question.type === QuizQuestionType.CODE_REVIEW
              ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
              : 'inherit',
          }}
          onFocus={(e) => Object.assign(e.target.style, focusStyle)}
          onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
        />
      );

    case QuizQuestionType.MATCHING:
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
            Match the items on the left with the correct items on the right.
          </p>
          {question.matchingPairs?.map((pair, pairIndex) => (
            <div key={pair.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1, padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', color: '#374151', fontSize: '14px', border: '1px solid #e5e7eb' }}>
                {pair.left}
              </div>
              <span style={{ color: '#9ca3af', fontSize: '18px' }}>→</span>
              <select
                value={((answer as string[]) || [])[pairIndex] || ''}
                onChange={(e) => {
                  const currentAnswers = (answer as string[]) || Array(question.matchingPairs?.length).fill('');
                  const newAnswers = [...currentAnswers];
                  newAnswers[pairIndex] = e.target.value;
                  onChange(newAnswers);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <option value="">Select match...</option>
                {question.matchingPairs?.map((p) => (
                  <option key={p.id} value={p.right}>
                    {p.right}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );

    case QuizQuestionType.ORDERING:
      const items = (answer as string[]) || question.orderItems || [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
            Use the arrows to arrange in the correct order.
          </p>
          {items.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            >
              <span style={{ color: '#9ca3af', fontWeight: '600', minWidth: '24px' }}>{index + 1}.</span>
              <span style={{ flex: 1, color: '#374151', fontSize: '14px' }}>{item}</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (index > 0) {
                      const newItems = [...items];
                      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
                      onChange(newItems);
                    }
                  }}
                  disabled={index === 0}
                  style={{
                    padding: '4px 8px',
                    fontSize: '16px',
                    color: index === 0 ? '#d1d5db' : '#6b7280',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (index < items.length - 1) {
                      const newItems = [...items];
                      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
                      onChange(newItems);
                    }
                  }}
                  disabled={index === items.length - 1}
                  style={{
                    padding: '4px 8px',
                    fontSize: '16px',
                    color: index === items.length - 1 ? '#d1d5db' : '#6b7280',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: index === items.length - 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>
      );

    default:
      return (
        <input
          type="text"
          value={(answer as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your answer..."
          style={inputStyle}
          onFocus={(e) => Object.assign(e.target.style, focusStyle)}
          onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
        />
      );
  }
}
