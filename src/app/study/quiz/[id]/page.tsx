'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStudyQuiz, useStudyCategories, useStudyTopics } from '@/hooks/useStudy';
import { submitQuiz } from '@/services/studyService';
import { Button } from '@/components/ui/button';
import {
  Quiz,
  QuizQuestion,
  QuizQuestionType,
  QuizDifficulty,
  QuizAnswer,
  QuizAttempt,
  QuestionFeedback,
} from '@/types/study';

export default function StudyQuizPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = Array.isArray(params.id) ? params.id[0] : params.id || '';

  // State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number[]>>({});
  const [startTime] = useState(new Date().toISOString());
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [timeTaken, setTimeTaken] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Data hooks
  const { quiz, loading, error } = useStudyQuiz(quizId);
  const { categories } = useStudyCategories();
  const { topics } = useStudyTopics();

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
    } catch (error) {
      console.error('Failed to submit quiz:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDifficultyColor = (difficulty: QuizDifficulty) => {
    switch (difficulty) {
      case QuizDifficulty.BEGINNER:
        return 'bg-green-100 text-green-800';
      case QuizDifficulty.INTERMEDIATE:
        return 'bg-yellow-100 text-yellow-800';
      case QuizDifficulty.ADVANCED:
        return 'bg-orange-100 text-orange-800';
      case QuizDifficulty.EXPERT:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Quiz Not Found</h1>
          <p className="text-gray-600 mb-4">{error?.message || 'The quiz you are looking for does not exist.'}</p>
          <Button onClick={() => router.push('/study')}>Back to Study</Button>
        </div>
      </div>
    );
  }

  if (showResults && attempt) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Results Header */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Quiz Results</h1>
            <p className="text-gray-600 mb-4">{quiz.title}</p>

            <div
              className={`inline-flex items-center justify-center w-32 h-32 rounded-full text-4xl font-bold mb-4 ${
                attempt.passed ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
              }`}
            >
              {Math.round(attempt.percentage)}%
            </div>

            <p className={`text-lg font-semibold ${attempt.passed ? 'text-green-600' : 'text-red-600'}`}>
              {attempt.passed ? 'Passed!' : 'Not Passed'}
            </p>

            <div className="flex justify-center gap-8 mt-4 text-sm text-gray-600">
              <div>
                <span className="block text-2xl font-bold text-gray-800">
                  {attempt.score}/{attempt.totalPoints}
                </span>
                Points
              </div>
              <div>
                <span className="block text-2xl font-bold text-gray-800">
                  {Math.round(attempt.timeSpent / 60)}:{String(attempt.timeSpent % 60).padStart(2, '0')}
                </span>
                Time
              </div>
              <div>
                <span className="block text-2xl font-bold text-gray-800">
                  {attempt.feedback.filter((f) => f.isCorrect).length}/{quiz.questions.length}
                </span>
                Correct
              </div>
            </div>
          </div>

          {/* Question Review */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Question Review</h2>
            {quiz.questions.map((question, index) => {
              const feedback = attempt.feedback.find((f) => f.questionId === question.id);
              return (
                <div
                  key={question.id}
                  className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${
                    feedback?.isCorrect ? 'border-green-500' : 'border-red-500'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-800">
                      Q{index + 1}: {question.question}
                    </h3>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        feedback?.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {feedback?.pointsEarned}/{question.points} pts
                    </span>
                  </div>

                  {/* Your Answer */}
                  <div className="text-sm mb-2">
                    <span className="text-gray-500">Your answer: </span>
                    <span className={feedback?.isCorrect ? 'text-green-600' : 'text-red-600'}>
                      {Array.isArray(answers[question.id])
                        ? (answers[question.id] as string[]).join(', ')
                        : answers[question.id]?.toString() || 'No answer'}
                    </span>
                  </div>

                  {/* Correct Answer */}
                  {!feedback?.isCorrect && feedback?.correctAnswer && (
                    <div className="text-sm mb-2">
                      <span className="text-gray-500">Correct answer: </span>
                      <span className="text-green-600">{feedback.correctAnswer}</span>
                    </div>
                  )}

                  {/* Feedback */}
                  {feedback?.feedback && (
                    <div className="bg-gray-50 rounded p-3 text-sm text-gray-700">
                      <strong>Feedback:</strong> {feedback.feedback}
                    </div>
                  )}

                  {/* AI Assessment for free-form */}
                  {feedback?.aiAssessment && (
                    <div className="bg-blue-50 rounded p-3 text-sm text-blue-800 mt-2">
                      <strong>AI Assessment:</strong> {feedback.aiAssessment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-4 mt-6">
            <Button variant="outline" onClick={() => router.push(`/study/article/${quiz.articleId}`)}>
              Back to Article
            </Button>
            <Button onClick={() => router.push('/study')}>Back to Study</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                {category && (
                  <>
                    <span className="text-blue-600">{category.name}</span>
                    <span>•</span>
                  </>
                )}
                {topic && <span>{topic.name}</span>}
              </div>
              <h1 className="text-lg font-bold text-gray-900">{quiz.title}</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getDifficultyColor(quiz.difficulty)}`}>
                {quiz.difficulty}
              </span>
              <span className="text-sm text-gray-500">
                {answeredCount}/{quiz.questions.length} answered
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Progress Bar */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span>
              Question {currentQuestionIndex + 1} of {quiz.questions.length}
            </span>
            <span>{Math.round(((currentQuestionIndex + 1) / quiz.questions.length) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question */}
        {currentQuestion && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getDifficultyColor(currentQuestion.difficulty)}`}>
                {currentQuestion.difficulty}
              </span>
              <span className="text-sm text-gray-500">{currentQuestion.points} points</span>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-6">{currentQuestion.question}</h2>

            {/* Code Snippet */}
            {currentQuestion.codeSnippet && (
              <div className="mb-6">
                <div className="bg-gray-800 rounded-lg px-4 py-2 text-gray-300 text-sm mb-2">
                  {currentQuestion.language || 'code'}
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
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
              <details className="mt-4">
                <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">
                  Show Hints ({currentQuestion.hints.length})
                </summary>
                <ul className="mt-2 text-sm text-gray-600 list-disc list-inside space-y-1">
                  {currentQuestion.hints.map((hint, index) => (
                    <li key={index}>{hint}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Button variant="outline" onClick={handlePrevQuestion} disabled={currentQuestionIndex === 0}>
            ← Previous
          </Button>

          <div className="flex gap-2">
            {quiz.questions.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  if (currentQuestion) saveTimeForQuestion(currentQuestion.id);
                  setCurrentQuestionIndex(index);
                }}
                className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  index === currentQuestionIndex
                    ? 'bg-blue-600 text-white'
                    : answers[quiz.questions[index].id]
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          {currentQuestionIndex === quiz.questions.length - 1 ? (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
            </Button>
          ) : (
            <Button onClick={handleNextQuestion}>Next →</Button>
          )}
        </div>
      </div>
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
  switch (question.type) {
    case QuizQuestionType.MULTIPLE_CHOICE:
    case QuizQuestionType.TRUE_FALSE:
      return (
        <div className="space-y-3">
          {question.options?.map((option) => (
            <label
              key={option.id}
              className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                answer === option.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name={question.id}
                value={option.id}
                checked={answer === option.id}
                onChange={() => onChange(option.id)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-gray-800">{option.text}</span>
            </label>
          ))}
        </div>
      );

    case QuizQuestionType.MULTIPLE_SELECT:
      return (
        <div className="space-y-3">
          {question.options?.map((option) => {
            const selectedAnswers = (answer as string[]) || [];
            const isSelected = selectedAnswers.includes(option.id);
            return (
              <label
                key={option.id}
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
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
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-gray-800">{option.text}</span>
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
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      );

    case QuizQuestionType.LONG_ANSWER:
    case QuizQuestionType.CODE_COMPLETION:
    case QuizQuestionType.CODE_REVIEW:
      return (
        <textarea
          value={(answer as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            question.type === QuizQuestionType.CODE_COMPLETION
              ? 'Write your code here...'
              : question.type === QuizQuestionType.CODE_REVIEW
              ? 'Write your code review feedback...'
              : 'Type your answer...'
          }
          className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[150px] ${
            question.type === QuizQuestionType.CODE_COMPLETION ||
            question.type === QuizQuestionType.CODE_REVIEW
              ? 'font-mono text-sm'
              : ''
          }`}
        />
      );

    case QuizQuestionType.MATCHING:
      return (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 mb-2">Match the items on the left with the correct items on the right.</p>
          {question.matchingPairs?.map((pair) => (
            <div key={pair.id} className="flex items-center gap-4">
              <div className="flex-1 p-3 bg-gray-100 rounded-lg text-gray-800">{pair.left}</div>
              <span className="text-gray-400">→</span>
              <select
                value={((answer as string[]) || [])[question.matchingPairs?.indexOf(pair) || 0] || ''}
                onChange={(e) => {
                  const currentAnswers = (answer as string[]) || Array(question.matchingPairs?.length).fill('');
                  const newAnswers = [...currentAnswers];
                  newAnswers[question.matchingPairs?.indexOf(pair) || 0] = e.target.value;
                  onChange(newAnswers);
                }}
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
        <div className="space-y-2">
          <p className="text-sm text-gray-500 mb-2">Drag and drop to arrange in the correct order.</p>
          {items.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg"
            >
              <span className="text-gray-400 font-medium">{index + 1}.</span>
              <span className="flex-1 text-gray-800">{item}</span>
              <div className="flex gap-1">
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
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
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
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
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
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      );
  }
}
