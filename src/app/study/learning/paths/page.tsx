'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLearningPaths } from '@/hooks/useStudy';
import {
  LearningPath,
  LearningPathStatus,
  PreferredLearningStyle,
  LearningPathContext,
  LearningPathRecommendations,
} from '@/types/study';

// Example goals for inspiration
const EXAMPLE_GOALS = [
  'Senior Software Engineerになるために必要なスキルを身につけたい',
  'Kubernetesを本番環境で使えるレベルまで学びたい',
  'AWS Solutions Architect Professional試験に合格したい',
  'フロントエンドからフルスタックエンジニアに移行したい',
  'システム設計の基礎を固めたい',
  'React/Next.jsのベストプラクティスを習得したい',
];

export default function LearningPathsPage() {
  const router = useRouter();
  const { paths, loading, error, creating, createPath, deletePath } = useLearningPaths();
  const [showGenerator, setShowGenerator] = useState(false);
  const [goal, setGoal] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [context, setContext] = useState<LearningPathContext>({});
  const [recommendations, setRecommendations] = useState<LearningPathRecommendations | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!goal.trim()) return;

    try {
      setGenerateError(null);
      const result = await createPath({
        goal: goal.trim(),
        context: showContext ? context : undefined,
      });
      setRecommendations(result.recommendations);
      setGoal('');
      setContext({});
      setShowContext(false);
      // Navigate to the new path
      router.push(`/study/learning/paths/${result.path.id}`);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate learning path');
    }
  };

  const handleDelete = async (pathId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this learning path?')) {
      await deletePath(pathId);
    }
  };

  const getStatusBadge = (status: LearningPathStatus) => {
    const styles: Record<LearningPathStatus, string> = {
      [LearningPathStatus.NOT_STARTED]: 'bg-gray-100 text-gray-800',
      [LearningPathStatus.IN_PROGRESS]: 'bg-blue-100 text-blue-800',
      [LearningPathStatus.COMPLETED]: 'bg-green-100 text-green-800',
      [LearningPathStatus.PAUSED]: 'bg-yellow-100 text-yellow-800',
    };
    const labels: Record<LearningPathStatus, string> = {
      [LearningPathStatus.NOT_STARTED]: 'Not Started',
      [LearningPathStatus.IN_PROGRESS]: 'In Progress',
      [LearningPathStatus.COMPLETED]: 'Completed',
      [LearningPathStatus.PAUSED]: 'Paused',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-64 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Learning Paths</h1>
            <p className="text-gray-600 mt-2">
              AIに目標を伝えて、パーソナライズされた学習パスを自動生成
            </p>
          </div>
          <Link
            href="/study/learning"
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            ← Back to Learning Hub
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error.message}
          </div>
        )}

        {/* Generator Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🎯</span>
            <h2 className="text-xl font-semibold">Learning Path Generator</h2>
          </div>

          {!showGenerator ? (
            <button
              onClick={() => setShowGenerator(true)}
              className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Create New Learning Path
            </button>
          ) : (
            <div className="space-y-4">
              {/* Goal Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  学習目標を教えてください
                </label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="例：Senior Software Engineerになるために必要なスキルを身につけたい"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                />
              </div>

              {/* Example Goals */}
              <div>
                <p className="text-sm text-gray-600 mb-2">Examples:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_GOALS.slice(0, 3).map((example, i) => (
                    <button
                      key={i}
                      onClick={() => setGoal(example)}
                      className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                    >
                      {example.substring(0, 40)}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Context Toggle */}
              <button
                onClick={() => setShowContext(!showContext)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {showContext ? '▼' : '▶'} Add more context (optional)
              </button>

              {/* Context Form */}
              {showContext && (
                <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Level
                      </label>
                      <input
                        type="text"
                        value={context.currentLevel || ''}
                        onChange={(e) =>
                          setContext({ ...context, currentLevel: e.target.value })
                        }
                        placeholder="e.g., Mid-level Engineer"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Years of Experience
                      </label>
                      <input
                        type="number"
                        value={context.yearsOfExperience || ''}
                        onChange={(e) =>
                          setContext({
                            ...context,
                            yearsOfExperience: parseInt(e.target.value) || undefined,
                          })
                        }
                        placeholder="e.g., 3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Available Hours/Week
                      </label>
                      <input
                        type="number"
                        value={context.availableHoursPerWeek || ''}
                        onChange={(e) =>
                          setContext({
                            ...context,
                            availableHoursPerWeek: parseInt(e.target.value) || undefined,
                          })
                        }
                        placeholder="e.g., 10"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Learning Style
                      </label>
                      <select
                        value={context.preferredLearningStyle || ''}
                        onChange={(e) =>
                          setContext({
                            ...context,
                            preferredLearningStyle: e.target.value as PreferredLearningStyle,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Select...</option>
                        <option value={PreferredLearningStyle.HANDS_ON}>
                          Hands-on (building projects)
                        </option>
                        <option value={PreferredLearningStyle.READING}>
                          Reading (books, articles)
                        </option>
                        <option value={PreferredLearningStyle.VIDEO}>
                          Video (courses, tutorials)
                        </option>
                        <option value={PreferredLearningStyle.MIXED}>Mixed</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tech Stack
                    </label>
                    <input
                      type="text"
                      value={context.primaryTechStack?.join(', ') || ''}
                      onChange={(e) =>
                        setContext({
                          ...context,
                          primaryTechStack: e.target.value.split(',').map((s) => s.trim()),
                        })
                      }
                      placeholder="e.g., TypeScript, React, Node.js"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              {generateError && (
                <div className="text-red-600 text-sm">{generateError}</div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={!goal.trim() || creating}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Generating...
                    </>
                  ) : (
                    <>
                      🔮 Generate Learning Path
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowGenerator(false);
                    setGoal('');
                    setContext({});
                    setShowContext(false);
                    setGenerateError(null);
                  }}
                  className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Existing Paths */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Your Learning Paths</h2>
          {paths.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-500">No learning paths yet. Create one above!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paths.map((path) => (
                <Link
                  key={path.id}
                  href={`/study/learning/paths/${path.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{path.title}</h3>
                        {getStatusBadge(path.status)}
                      </div>
                      <p className="text-gray-600 text-sm mb-4">{path.description}</p>
                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        <span>📊 {path.progress}% complete</span>
                        <span>📚 {path.completedTopics}/{path.totalTopics} topics</span>
                        <span>⏱️ {path.estimatedDuration}</span>
                      </div>
                      {/* Progress Bar */}
                      <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all"
                          style={{ width: `${path.progress}%` }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(path.id, e)}
                      className="ml-4 p-2 text-gray-400 hover:text-red-600"
                    >
                      🗑️
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
