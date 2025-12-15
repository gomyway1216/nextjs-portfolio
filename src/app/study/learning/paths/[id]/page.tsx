'use client';

import { use } from 'react';
import Link from 'next/link';
import { useLearningPath } from '@/hooks/useStudy';
import {
  LearningPathStatus,
  TopicImportance,
  LearningPhase,
  LearningPathTopic,
} from '@/types/study';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LearningPathDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { path, loading, error, updating, startTopic, completeTopic } = useLearningPath(id);

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

  const handleStartTopic = async (topicId: string) => {
    try {
      await startTopic(topicId, true);
    } catch (err) {
      console.error('Failed to start topic:', err);
    }
  };

  const handleCompleteTopic = async (topicId: string) => {
    try {
      await completeTopic(topicId);
    } catch (err) {
      console.error('Failed to complete topic:', err);
    }
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
              onStartTopic={handleStartTopic}
              onCompleteTopic={handleCompleteTopic}
              getStatusIcon={getStatusIcon}
              getImportanceBadge={getImportanceBadge}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface PhaseCardProps {
  phase: LearningPhase;
  phaseIndex: number;
  isLocked: boolean;
  currentTopicId?: string;
  updating: boolean;
  onStartTopic: (topicId: string) => void;
  onCompleteTopic: (topicId: string) => void;
  getStatusIcon: (status: LearningPathStatus) => string;
  getImportanceBadge: (importance: TopicImportance) => React.ReactNode;
}

function PhaseCard({
  phase,
  phaseIndex,
  isLocked,
  currentTopicId,
  updating,
  onStartTopic,
  onCompleteTopic,
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
          {phase.topics.map((topic, topicIndex) => (
            <TopicRow
              key={topic.id}
              topic={topic}
              isCurrent={topic.id === currentTopicId}
              updating={updating}
              onStart={() => onStartTopic(topic.id)}
              onComplete={() => onCompleteTopic(topic.id)}
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
  onStart: () => void;
  onComplete: () => void;
  getStatusIcon: (status: LearningPathStatus) => string;
  getImportanceBadge: (importance: TopicImportance) => React.ReactNode;
}

function TopicRow({
  topic,
  isCurrent,
  updating,
  onStart,
  onComplete,
  getStatusIcon,
  getImportanceBadge,
}: TopicRowProps) {
  const isCompleted = topic.status === LearningPathStatus.COMPLETED;
  const isInProgress = topic.status === LearningPathStatus.IN_PROGRESS;
  const isNotStarted = topic.status === LearningPathStatus.NOT_STARTED;

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
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span>⏱️ {topic.estimatedDuration}</span>
              {topic.entryId && <span>📝 Entry linked</span>}
              {topic.flashcardIds.length > 0 && (
                <span>🃏 {topic.flashcardIds.length} cards</span>
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
        <div className="ml-4">
          {isNotStarted && (
            <button
              onClick={onStart}
              disabled={updating}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
            >
              {updating ? '...' : 'Start'}
            </button>
          )}
          {isInProgress && (
            <button
              onClick={onComplete}
              disabled={updating}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300"
            >
              {updating ? '...' : 'Complete'}
            </button>
          )}
          {isCompleted && (
            <span className="text-green-600 text-sm">Done ✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
