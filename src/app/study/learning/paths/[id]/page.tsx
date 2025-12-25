'use client';

import { use, useState, useCallback } from 'react';
import Link from 'next/link';
import { useLearningPath } from '@/hooks/useStudy';
import {
  LearningPathStatus,
  TopicImportance,
  LearningPhase,
  LearningPathTopic,
  StartTopicResponse,
} from '@/types/study';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface GenerationResult {
  topicTitle: string;
  flashcardsCount: number;
  termsCount: number;
  quizId?: string;
  quizTitle?: string;
  quizQuestionCount?: number;
  entryId?: string;
}

export default function LearningPathDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { path, loading, error, updating, startTopic, completeTopic, resetTopic } = useLearningPath(id);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [showGenerationModal, setShowGenerationModal] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [generationStatus, setGenerationStatus] = useState<'generating' | 'success' | 'error'>('generating');
  const [generationError, setGenerationError] = useState<string | null>(null);

  const getStatusIcon = (status: LearningPathStatus) => {
    const icons: Record<LearningPathStatus, string> = {
      [LearningPathStatus.NOT_STARTED]: '⭕',
      [LearningPathStatus.IN_PROGRESS]: '🔵',
      [LearningPathStatus.COMPLETED]: '✅',
      [LearningPathStatus.PAUSED]: '⏸️',
    };
    return icons[status];
  };

  const getImportanceBadge = (importance: TopicImportance) => {
    const styles: Record<TopicImportance, string> = {
      [TopicImportance.CRITICAL]: 'bg-red-100 text-red-800',
      [TopicImportance.IMPORTANT]: 'bg-yellow-100 text-yellow-800',
      [TopicImportance.NICE_TO_HAVE]: 'bg-gray-100 text-gray-600',
    };
    const labels: Record<TopicImportance, string> = {
      [TopicImportance.CRITICAL]: 'Critical',
      [TopicImportance.IMPORTANT]: 'Important',
      [TopicImportance.NICE_TO_HAVE]: 'Nice to Have',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs ${styles[importance]}`}>
        {labels[importance]}
      </span>
    );
  };

  const handleStartTopic = useCallback(async (topicId: string, topicTitle: string) => {
    setActiveTopicId(topicId);
    setShowGenerationModal(true);
    setGenerationStatus('generating');
    setGenerationError(null);
    setGenerationResult(null);

    try {
      const result = await startTopic(topicId, true);

      // Set the generation result
      setGenerationResult({
        topicTitle,
        flashcardsCount: result?.flashcards?.count || 0,
        termsCount: result?.dictionaryTerms?.count || 0,
        quizId: result?.quiz?.id,
        quizTitle: result?.quiz?.title,
        quizQuestionCount: result?.quiz?.questionCount,
        entryId: result?.entry?.id,
      });
      setGenerationStatus('success');
    } catch (err) {
      console.error('Failed to start topic:', err);
      setGenerationError(err instanceof Error ? err.message : 'Failed to start topic');
      setGenerationStatus('error');
    } finally {
      setActiveTopicId(null);
    }
  }, [startTopic]);

  const handleCompleteTopic = async (topicId: string) => {
    setActiveTopicId(topicId);
    try {
      await completeTopic(topicId);
    } catch (err) {
      console.error('Failed to complete topic:', err);
    } finally {
      setActiveTopicId(null);
    }
  };

  const handleResetTopic = async (topicId: string) => {
    setActiveTopicId(topicId);
    try {
      await resetTopic(topicId);
    } catch (err) {
      console.error('Failed to reset topic:', err);
    } finally {
      setActiveTopicId(null);
    }
  };

  const closeModal = () => {
    setShowGenerationModal(false);
    setGenerationResult(null);
    setGenerationStatus('generating');
    setGenerationError(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
            <div className="h-64 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !path) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error?.message || 'Learning path not found'}
          </div>
          <Link href="/study/learning/paths" className="text-blue-600 hover:text-blue-800 mt-4 block">
            ← Back to Learning Paths
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/study/learning/paths"
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
          >
            ← Back to Learning Paths
          </Link>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">{path.title}</h1>
          <p className="text-gray-600 mb-4">{path.description}</p>

          {/* Progress Overview */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-sm text-gray-500">Overall Progress</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold">{path.progress}%</span>
                  <span className="text-gray-500 text-sm">
                    ({path.completedTopics}/{path.totalTopics} topics)
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-500">Estimated Duration</span>
                <div className="text-lg font-semibold">{path.estimatedDuration}</div>
              </div>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                style={{ width: `${path.progress}%` }}
              />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mt-6 pt-4 border-t border-gray-100">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{path.phases.length}</div>
                <div className="text-xs text-gray-500">Phases</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{path.completedTopics}</div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{path.totalFlashcards}</div>
                <div className="text-xs text-gray-500">Flashcards</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{path.totalDictionaryTerms}</div>
                <div className="text-xs text-gray-500">Terms</div>
              </div>
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="space-y-6">
          {path.phases.map((phase, phaseIndex) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              phaseIndex={phaseIndex}
              isLocked={phaseIndex > 0 && path.phases[phaseIndex - 1].status !== LearningPathStatus.COMPLETED}
              currentTopicId={path.currentTopicId}
              updating={updating}
              activeTopicId={activeTopicId}
              onStartTopic={handleStartTopic}
              onCompleteTopic={handleCompleteTopic}
              onResetTopic={handleResetTopic}
              getStatusIcon={getStatusIcon}
              getImportanceBadge={getImportanceBadge}
            />
          ))}
        </div>
      </div>

      {/* Generation Modal */}
      {showGenerationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {generationStatus === 'generating' && 'Generating Learning Content...'}
                {generationStatus === 'success' && 'Learning Content Ready!'}
                {generationStatus === 'error' && 'Generation Failed'}
              </h3>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {generationStatus === 'generating' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  </div>
                  <p className="text-center text-gray-600">
                    Creating comprehensive learning materials for your topic...
                  </p>
                  <div className="space-y-2 text-sm text-gray-500">
                    <p className="flex items-center gap-2">
                      <span className="animate-pulse">📝</span> Generating learning entry...
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="animate-pulse">🃏</span> Creating flashcards...
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="animate-pulse">📚</span> Extracting key terms...
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="animate-pulse">✍️</span> Generating quiz...
                    </p>
                  </div>
                </div>
              )}

              {generationStatus === 'success' && generationResult && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center text-green-500 mb-4">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h4 className="text-center font-medium text-gray-900">
                    {generationResult.topicTitle}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {generationResult.flashcardsCount}
                      </div>
                      <div className="text-xs text-blue-800">Flashcards Created</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {generationResult.termsCount}
                      </div>
                      <div className="text-xs text-purple-800">Terms Added</div>
                    </div>
                  </div>
                  {generationResult.quizId && (
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-green-800">Quiz Created</div>
                          <div className="text-sm text-green-600">
                            {generationResult.quizQuestionCount} questions
                          </div>
                        </div>
                        <Link
                          href={`/study/quizzes/${generationResult.quizId}`}
                          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                        >
                          Take Quiz
                        </Link>
                      </div>
                    </div>
                  )}
                  {generationResult.entryId && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-800">Learning Entry</div>
                          <div className="text-sm text-gray-600">
                            View generated content
                          </div>
                        </div>
                        <Link
                          href={`/study/learning/entries/${generationResult.entryId}`}
                          className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700"
                        >
                          View Entry
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {generationStatus === 'error' && (
                <div className="text-center">
                  <div className="flex items-center justify-center text-red-500 mb-4">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-red-600">{generationError || 'An error occurred'}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {(generationStatus === 'success' || generationStatus === 'error') && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                <button
                  onClick={closeModal}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  {generationStatus === 'success' ? 'Continue Learning' : 'Close'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface PhaseCardProps {
  phase: LearningPhase;
  phaseIndex: number;
  isLocked: boolean;
  currentTopicId?: string;
  updating: boolean;
  activeTopicId: string | null;
  onStartTopic: (topicId: string, topicTitle: string) => void;
  onCompleteTopic: (topicId: string) => void;
  onResetTopic: (topicId: string) => void;
  getStatusIcon: (status: LearningPathStatus) => string;
  getImportanceBadge: (importance: TopicImportance) => React.ReactNode;
}

function PhaseCard({
  phase,
  phaseIndex,
  isLocked,
  currentTopicId,
  updating,
  activeTopicId,
  onStartTopic,
  onCompleteTopic,
  onResetTopic,
  getStatusIcon,
  getImportanceBadge,
}: PhaseCardProps) {
  const isCompleted = phase.status === LearningPathStatus.COMPLETED;
  const isInProgress = phase.status === LearningPathStatus.IN_PROGRESS;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border ${
        isLocked ? 'border-gray-200 opacity-60' : 'border-gray-200'
      }`}
    >
      {/* Phase Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {isCompleted ? '✅' : isInProgress ? '🔵' : isLocked ? '🔒' : '⭕'}
            </span>
            <div>
              <h3 className="text-lg font-semibold">
                Phase {phase.number}: {phase.title}
              </h3>
              <p className="text-sm text-gray-600">{phase.description}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{phase.progress}%</div>
            <div className="text-xs text-gray-500">{phase.estimatedDuration}</div>
          </div>
        </div>

        {/* Phase Progress Bar */}
        <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${phase.progress}%` }}
          />
        </div>
      </div>

      {/* Topics */}
      {!isLocked && (
        <div className="divide-y divide-gray-100">
          {phase.topics.map((topic) => (
            <TopicRow
              key={topic.id}
              topic={topic}
              isCurrent={topic.id === currentTopicId}
              updating={updating}
              activeTopicId={activeTopicId}
              onStart={() => onStartTopic(topic.id, topic.title)}
              onComplete={() => onCompleteTopic(topic.id)}
              onReset={() => onResetTopic(topic.id)}
              getStatusIcon={getStatusIcon}
              getImportanceBadge={getImportanceBadge}
            />
          ))}
        </div>
      )}

      {/* Milestones */}
      {phase.milestones.length > 0 && !isLocked && (
        <div className="p-4 bg-gray-50 rounded-b-xl">
          <h4 className="text-sm font-medium text-gray-700 mb-2">🎯 Milestones</h4>
          <ul className="space-y-1">
            {phase.milestones.map((milestone, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                <span className={isCompleted ? 'text-green-500' : 'text-gray-400'}>
                  {isCompleted ? '✓' : '○'}
                </span>
                {milestone}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface TopicRowProps {
  topic: LearningPathTopic;
  isCurrent: boolean;
  updating: boolean;
  activeTopicId: string | null;
  onStart: () => void;
  onComplete: () => void;
  onReset: () => void;
  getStatusIcon: (status: LearningPathStatus) => string;
  getImportanceBadge: (importance: TopicImportance) => React.ReactNode;
}

function TopicRow({
  topic,
  isCurrent,
  updating,
  activeTopicId,
  onStart,
  onComplete,
  onReset,
  getStatusIcon,
  getImportanceBadge,
}: TopicRowProps) {
  const isCompleted = topic.status === LearningPathStatus.COMPLETED;
  const isInProgress = topic.status === LearningPathStatus.IN_PROGRESS;
  const isNotStarted = topic.status === LearningPathStatus.NOT_STARTED;
  const isActive = activeTopicId === topic.id;

  return (
    <div
      className={`p-4 ${isCurrent ? 'bg-blue-50' : ''} hover:bg-gray-50 transition-colors`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <span className="text-lg mt-0.5">{getStatusIcon(topic.status)}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className={`font-medium ${isCompleted ? 'text-gray-500 line-through' : ''}`}>
                {topic.title}
              </h4>
              {getImportanceBadge(topic.importance)}
              {isCurrent && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                  Current
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">{topic.description}</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
              <span>⏱️ {topic.estimatedDuration}</span>
              {topic.entryId && <span>📝 Entry linked</span>}
              {topic.flashcardIds.length > 0 && (
                <span>🃏 {topic.flashcardIds.length} cards</span>
              )}
              {topic.dictionaryTermIds && topic.dictionaryTermIds.length > 0 && (
                <span>📚 {topic.dictionaryTermIds.length} terms</span>
              )}
            </div>

            {/* Resources */}
            {topic.resources.length > 0 && (
              <div className="mt-2">
                <details className="text-sm">
                  <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                    📚 {topic.resources.length} resources
                  </summary>
                  <ul className="mt-2 space-y-1 pl-4">
                    {topic.resources.map((resource) => (
                      <li key={resource.id} className="text-gray-600">
                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {resource.title}
                          </a>
                        ) : (
                          resource.title
                        )}
                        <span className="text-gray-400 ml-1">({resource.type})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="ml-4 flex flex-col gap-2 items-end">
          {isNotStarted && (
            <button
              onClick={onStart}
              disabled={updating}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
            >
              {isActive ? 'Starting...' : 'Start'}
            </button>
          )}
          {isInProgress && (
            <div className="flex flex-col gap-2 items-end">
              {topic.entryId && (
                <Link
                  href={`/study/learning/entries/${topic.entryId}`}
                  className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700"
                >
                  View Entry
                </Link>
              )}
              {!topic.entryId && (
                <button
                  onClick={onReset}
                  disabled={updating}
                  className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:bg-gray-300"
                >
                  {isActive ? 'Resetting...' : 'Reset'}
                </button>
              )}
              <button
                onClick={onComplete}
                disabled={updating}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300"
              >
                {isActive ? 'Completing...' : 'Complete'}
              </button>
            </div>
          )}
          {isCompleted && (
            <div className="flex flex-col gap-2 items-end">
              {topic.entryId && (
                <Link
                  href={`/study/learning/entries/${topic.entryId}`}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
                >
                  View Entry
                </Link>
              )}
              {!topic.entryId && (
                <button
                  onClick={onReset}
                  disabled={updating}
                  className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:bg-gray-300"
                >
                  {isActive ? 'Resetting...' : 'Reset'}
                </button>
              )}
              <span className="text-green-600 text-sm">Done ✓</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
