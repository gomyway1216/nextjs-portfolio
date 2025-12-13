'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getHobbyCategories, getHobbyItems } from '@/services/hobbyService';
import type { HobbyCategory, HobbyItem } from '@/types/hobby';
import { ArrowLeft, CheckCircle, XCircle, RefreshCw, Trophy, HelpCircle } from 'lucide-react';

type QuizMode = 'image-to-name' | 'japanese-to-english' | 'english-to-japanese';

interface QuizQuestion {
  item: HobbyItem;
  correctAnswer: string;
  options: string[];
  questionText: string;
  showImage: boolean;
}

export default function HobbyQuizPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [hobby, setHobby] = useState<HobbyCategory | null>(null);
  const [items, setItems] = useState<HobbyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quiz state
  const [quizMode, setQuizMode] = useState<QuizMode>('image-to-name');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);

  // Fetch hobby and items
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const { categories } = await getHobbyCategories();
        const foundHobby = categories.find((c) => c.slug === slug);

        if (!foundHobby) {
          setError('Hobby not found');
          return;
        }

        setHobby(foundHobby);

        const { items: fetchedItems } = await getHobbyItems(foundHobby.id);
        // Filter items that have required fields for quiz
        const quizItems = fetchedItems.filter(item => {
          const hasImage = item.thumbImage || item.images.length > 0;
          const hasNames = item.customFields?.nameKanji || item.customFields?.nameEnglish || item.title;
          return hasImage && hasNames;
        });
        setItems(quizItems);
      } catch (err) {
        setError('Failed to load hobby data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [slug]);

  // Generate quiz questions
  const generateQuestions = (mode: QuizMode, numQuestions: number = 10) => {
    if (items.length < 4) return [];

    const shuffledItems = [...items].sort(() => Math.random() - 0.5);
    const questionCount = Math.min(numQuestions, items.length);
    const generatedQuestions: QuizQuestion[] = [];

    for (let i = 0; i < questionCount; i++) {
      const item = shuffledItems[i];
      let correctAnswer: string;
      let questionText: string;
      let showImage = false;

      // Get name fields
      const nameJapanese = (item.customFields?.nameKanji as string) || (item.customFields?.nameKana as string) || item.title;
      const nameEnglish = (item.customFields?.nameEnglish as string) || item.title;

      switch (mode) {
        case 'image-to-name':
          correctAnswer = nameJapanese;
          questionText = 'この画像は何ですか？';
          showImage = true;
          break;
        case 'japanese-to-english':
          correctAnswer = nameEnglish;
          questionText = `「${nameJapanese}」は英語で何と言いますか？`;
          break;
        case 'english-to-japanese':
          correctAnswer = nameJapanese;
          questionText = `"${nameEnglish}" は日本語で何と言いますか？`;
          break;
      }

      // Generate wrong options from other items
      const otherItems = items.filter((_, idx) => idx !== items.indexOf(item));
      const wrongOptions = otherItems
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((otherItem) => {
          if (mode === 'japanese-to-english') {
            return (otherItem.customFields?.nameEnglish as string) || otherItem.title;
          }
          return (otherItem.customFields?.nameKanji as string) || (otherItem.customFields?.nameKana as string) || otherItem.title;
        });

      // Shuffle options
      const options = [...wrongOptions, correctAnswer].sort(() => Math.random() - 0.5);

      generatedQuestions.push({
        item,
        correctAnswer,
        options,
        questionText,
        showImage,
      });
    }

    return generatedQuestions;
  };

  const startQuiz = () => {
    const newQuestions = generateQuestions(quizMode);
    if (newQuestions.length === 0) {
      setError('Not enough items to create a quiz. Please add more items first.');
      return;
    }
    setQuestions(newQuestions);
    setCurrentQuestionIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setQuizStarted(true);
    setQuizFinished(false);
  };

  const handleAnswerSelect = (answer: string) => {
    if (showResult) return;
    setSelectedAnswer(answer);
    setShowResult(true);

    if (answer === questions[currentQuestionIndex].correctAnswer) {
      setScore((prev) => prev + 1);
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setQuizFinished(true);
    }
  };

  const resetQuiz = () => {
    setQuizStarted(false);
    setQuizFinished(false);
    setCurrentQuestionIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setShowResult(false);
  };

  if (loading) {
    return (
      <div className="hobby-quiz-page">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (error || !hobby) {
    return (
      <div className="hobby-quiz-page">
        <div className="error-state">
          <p>{error || 'Hobby not found'}</p>
          <Link href="/hobbies" className="back-link">
            <ArrowLeft size={20} /> Back to Hobbies
          </Link>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="hobby-quiz-page">
      <div className="quiz-container">
        {/* Header */}
        <div className="quiz-header">
          <Link href={`/hobbies/${slug}`} className="back-link">
            <ArrowLeft size={20} /> {hobby.name}
          </Link>
          {quizStarted && !quizFinished && (
            <div className="quiz-progress">
              <span className="score">Score: {score}/{currentQuestionIndex + (showResult ? 1 : 0)}</span>
              <span className="question-count">
                {currentQuestionIndex + 1} / {questions.length}
              </span>
            </div>
          )}
        </div>

        {/* Quiz Start Screen */}
        {!quizStarted && (
          <div className="quiz-start">
            <h1>{hobby.name} クイズ</h1>
            <p className="quiz-description">
              {items.length} items available for quiz
            </p>

            <div className="mode-selection">
              <h3>Select Quiz Mode:</h3>
              <div className="mode-options">
                <button
                  className={`mode-btn ${quizMode === 'image-to-name' ? 'active' : ''}`}
                  onClick={() => setQuizMode('image-to-name')}
                >
                  <HelpCircle size={24} />
                  <span>画像から名前</span>
                  <small>Image → Name</small>
                </button>
                <button
                  className={`mode-btn ${quizMode === 'japanese-to-english' ? 'active' : ''}`}
                  onClick={() => setQuizMode('japanese-to-english')}
                >
                  <span style={{ fontSize: '24px' }}>日→英</span>
                  <span>日本語から英語</span>
                  <small>Japanese → English</small>
                </button>
                <button
                  className={`mode-btn ${quizMode === 'english-to-japanese' ? 'active' : ''}`}
                  onClick={() => setQuizMode('english-to-japanese')}
                >
                  <span style={{ fontSize: '24px' }}>英→日</span>
                  <span>英語から日本語</span>
                  <small>English → Japanese</small>
                </button>
              </div>
            </div>

            <button className="start-btn" onClick={startQuiz} disabled={items.length < 4}>
              {items.length < 4 ? 'Need at least 4 items' : 'Start Quiz'}
            </button>
          </div>
        )}

        {/* Quiz Question */}
        {quizStarted && !quizFinished && currentQuestion && (
          <div className="quiz-question">
            <div className="question-content">
              {currentQuestion.showImage && (
                <div className="question-image">
                  <img
                    src={currentQuestion.item.thumbImage || currentQuestion.item.images[0]}
                    alt="Quiz question"
                  />
                </div>
              )}
              <h2 className="question-text">{currentQuestion.questionText}</h2>
            </div>

            <div className="answer-options">
              {currentQuestion.options.map((option, index) => {
                const isCorrect = option === currentQuestion.correctAnswer;
                const isSelected = option === selectedAnswer;
                let className = 'answer-btn';

                if (showResult) {
                  if (isCorrect) className += ' correct';
                  else if (isSelected) className += ' incorrect';
                }

                return (
                  <button
                    key={index}
                    className={className}
                    onClick={() => handleAnswerSelect(option)}
                    disabled={showResult}
                  >
                    <span className="option-text">{option}</span>
                    {showResult && isCorrect && <CheckCircle size={20} className="icon-correct" />}
                    {showResult && isSelected && !isCorrect && <XCircle size={20} className="icon-incorrect" />}
                  </button>
                );
              })}
            </div>

            {showResult && (
              <div className="result-feedback">
                {selectedAnswer === currentQuestion.correctAnswer ? (
                  <p className="feedback correct">正解！ Correct!</p>
                ) : (
                  <p className="feedback incorrect">
                    不正解。正解は「{currentQuestion.correctAnswer}」です。
                  </p>
                )}
                <button className="next-btn" onClick={nextQuestion}>
                  {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'See Results'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quiz Results */}
        {quizFinished && (
          <div className="quiz-results">
            <Trophy size={64} className="trophy-icon" />
            <h2>Quiz Complete!</h2>
            <div className="final-score">
              <span className="score-number">{score}</span>
              <span className="score-total">/ {questions.length}</span>
            </div>
            <p className="score-percentage">
              {Math.round((score / questions.length) * 100)}% correct
            </p>
            <div className="result-actions">
              <button className="retry-btn" onClick={startQuiz}>
                <RefreshCw size={20} /> Try Again
              </button>
              <button className="back-btn" onClick={resetQuiz}>
                Change Mode
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .hobby-quiz-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          padding: 24px;
        }

        .quiz-container {
          max-width: 800px;
          margin: 0 auto;
        }

        .quiz-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #94a3b8;
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
        }

        .back-link:hover {
          color: #ffffff;
        }

        .quiz-progress {
          display: flex;
          gap: 24px;
          color: #94a3b8;
          font-size: 14px;
        }

        .score {
          color: #a855f7;
          font-weight: 600;
        }

        .loading-state,
        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #94a3b8;
          gap: 16px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(168, 85, 247, 0.2);
          border-top-color: #a855f7;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Start Screen */
        .quiz-start {
          text-align: center;
          padding: 48px 24px;
          background: rgba(30, 41, 59, 0.5);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .quiz-start h1 {
          font-size: 32px;
          color: #ffffff;
          margin-bottom: 16px;
        }

        .quiz-description {
          color: #94a3b8;
          margin-bottom: 32px;
        }

        .mode-selection {
          margin-bottom: 32px;
        }

        .mode-selection h3 {
          color: #cbd5e1;
          margin-bottom: 16px;
          font-size: 16px;
        }

        .mode-options {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .mode-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px 24px;
          background: rgba(15, 23, 42, 0.5);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          color: #cbd5e1;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 140px;
        }

        .mode-btn:hover {
          border-color: rgba(168, 85, 247, 0.5);
        }

        .mode-btn.active {
          border-color: #a855f7;
          background: rgba(168, 85, 247, 0.1);
        }

        .mode-btn small {
          font-size: 11px;
          color: #64748b;
        }

        .start-btn {
          padding: 16px 48px;
          background: linear-gradient(to right, #a855f7, #ec4899);
          border: none;
          border-radius: 12px;
          color: #ffffff;
          font-size: 18px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, opacity 0.2s;
        }

        .start-btn:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .start-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Question */
        .quiz-question {
          background: rgba(30, 41, 59, 0.5);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 32px;
        }

        .question-content {
          text-align: center;
          margin-bottom: 32px;
        }

        .question-image {
          margin-bottom: 24px;
        }

        .question-image img {
          max-width: 300px;
          max-height: 250px;
          border-radius: 16px;
          object-fit: cover;
        }

        .question-text {
          font-size: 24px;
          color: #ffffff;
        }

        .answer-options {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        @media (max-width: 600px) {
          .answer-options {
            grid-template-columns: 1fr;
          }
        }

        .answer-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: rgba(15, 23, 42, 0.5);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #ffffff;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .answer-btn:hover:not(:disabled) {
          border-color: rgba(168, 85, 247, 0.5);
          background: rgba(168, 85, 247, 0.1);
        }

        .answer-btn:disabled {
          cursor: default;
        }

        .answer-btn.correct {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.2);
        }

        .answer-btn.incorrect {
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.2);
        }

        .icon-correct {
          color: #10b981;
        }

        .icon-incorrect {
          color: #ef4444;
        }

        .result-feedback {
          text-align: center;
        }

        .feedback {
          font-size: 18px;
          margin-bottom: 16px;
        }

        .feedback.correct {
          color: #10b981;
        }

        .feedback.incorrect {
          color: #f87171;
        }

        .next-btn {
          padding: 12px 32px;
          background: linear-gradient(to right, #a855f7, #ec4899);
          border: none;
          border-radius: 8px;
          color: #ffffff;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
        }

        /* Results */
        .quiz-results {
          text-align: center;
          padding: 48px 24px;
          background: rgba(30, 41, 59, 0.5);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .trophy-icon {
          color: #fbbf24;
          margin-bottom: 24px;
        }

        .quiz-results h2 {
          font-size: 28px;
          color: #ffffff;
          margin-bottom: 24px;
        }

        .final-score {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 4px;
          margin-bottom: 8px;
        }

        .score-number {
          font-size: 64px;
          font-weight: 700;
          color: #a855f7;
        }

        .score-total {
          font-size: 32px;
          color: #94a3b8;
        }

        .score-percentage {
          color: #94a3b8;
          margin-bottom: 32px;
        }

        .result-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
        }

        .retry-btn,
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .retry-btn {
          background: linear-gradient(to right, #a855f7, #ec4899);
          border: none;
          color: #ffffff;
        }

        .back-btn {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
        }

        .back-btn:hover {
          border-color: rgba(255, 255, 255, 0.4);
        }
      `}</style>
    </div>
  );
}
