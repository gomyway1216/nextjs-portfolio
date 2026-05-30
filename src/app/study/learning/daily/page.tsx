'use client';

import { useDailyLearningPlan,useLearningPaths,useSpacedRepetition } from '@/hooks/useStudy';
import { DailyLearningItem,LearningPathStatus } from '@/types/study';
import {
BookOpen,
Brain,
Calendar,
CheckCircle2,
ChevronRight,
Circle,
Clock,
Code,
FileText,
Layers,
RefreshCw,
Sparkles,
Target,
Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const ITEM_TYPE_ICONS: Record<string, React.ReactNode> = {
  read_entry: <FileText size={18} />,
  review_flashcards: <Layers size={18} />,
  review_terms: <BookOpen size={18} />,
  read_article: <FileText size={18} />,
  practice: <Code size={18} />,
};

const ITEM_TYPE_COLORS: Record<string, string> = {
  read_entry: '#6366f1',
  review_flashcards: '#f59e0b',
  review_terms: '#10b981',
  read_article: '#8b5cf6',
  practice: '#ec4899',
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  read_entry: 'Learning Entry',
  review_flashcards: 'Flashcard Review',
  review_terms: 'Dictionary Review',
  read_article: 'Article',
  practice: 'Practice',
};

export default function DailyLearningDashboardPage() {
  const { plan, motivationalMessage, loading, error, updating, completeItem, regeneratePlan } =
    useDailyLearningPlan();
  const { paths, loading: pathsLoading } = useLearningPaths();
  const { totalDue, loading: _reviewLoading } = useSpacedRepetition();
  const [isRegenerating, setIsRegenerating] = useState(false);

  const activePath = paths.find((p) => p.status === LearningPathStatus.IN_PROGRESS);

  const handleCompleteItem = async (itemId: string) => {
    try {
      await completeItem(itemId);
    } catch (err) {
      console.error('Failed to complete item:', err);
    }
  };

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true);
      await regeneratePlan();
    } catch (err) {
      console.error('Failed to regenerate plan:', err);
    } finally {
      setIsRegenerating(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  };

  const today = new Date().toISOString().split('T')[0];

  if (loading || pathsLoading) {
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/study/learning"
              className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-2 text-sm"
            >
              ← Back to Learning Hub
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Calendar size={32} className="text-blue-600" />
              Today&apos;s Learning Plan
            </h1>
            <p className="text-gray-600 mt-1">{formatDate(today)}</p>
          </div>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating || updating}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={18} className={isRegenerating ? 'animate-spin' : ''} />
            Regenerate
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error.message}
          </div>
        )}

        {/* Motivational Message */}
        {motivationalMessage && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 mb-6 text-white">
            <div className="flex items-start gap-4">
              <Sparkles size={24} className="flex-shrink-0 mt-1" />
              <div>
                <h2 className="font-semibold text-lg mb-2">Today&apos;s Motivation</h2>
                <p className="text-blue-100">{motivationalMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Active Learning Path */}
        {activePath && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center">
                  <Target size={24} className="text-pink-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{activePath.title}</h3>
                  <p className="text-sm text-gray-500">
                    Phase {activePath.phases.findIndex((p) => p.id === activePath.currentPhaseId) + 1}
                    of {activePath.phases.length}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{activePath.progress}%</div>
                <div className="text-xs text-gray-500">
                  {activePath.completedTopics}/{activePath.totalTopics} topics
                </div>
              </div>
            </div>
            <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all"
                style={{ width: `${activePath.progress}%` }}
              />
            </div>
            <Link
              href={`/study/learning/paths/${activePath.id}`}
              className="mt-4 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              View Path Details <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {/* Overview Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Target size={20} />}
            label="Total Items"
            value={plan?.totalItems || 0}
            color="#6366f1"
          />
          <StatCard
            icon={<CheckCircle2 size={20} />}
            label="Completed"
            value={plan?.completedItems || 0}
            color="#10b981"
          />
          <StatCard
            icon={<Clock size={20} />}
            label="Est. Time"
            value={`${plan?.suggestedStudyTime || 0}m`}
            color="#f59e0b"
          />
          <StatCard
            icon={<Brain size={20} />}
            label="Due Reviews"
            value={totalDue || 0}
            color="#ef4444"
          />
        </div>

        {/* Plan Progress */}
        {plan && plan.totalItems > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Progress</h2>
              <span className="text-sm text-gray-500">
                {plan.completedItems}/{plan.totalItems} items
              </span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
                style={{ width: `${(plan.completedItems / plan.totalItems) * 100}%` }}
              />
            </div>
            {plan.completed && (
              <div className="mt-4 flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <Trophy size={24} className="text-green-600" />
                <div>
                  <div className="font-semibold text-green-800">Plan Completed!</div>
                  <div className="text-sm text-green-600">
                    Great job! You&apos;ve completed all items for today.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Learning Items */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Learning Items</h2>
            <p className="text-sm text-gray-500 mt-1">
              Complete these items to build your knowledge and maintain your streak
            </p>
          </div>

          {!plan || plan.items.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 mb-4">No learning plan generated yet</p>
              <div className="flex flex-col gap-3 items-center">
                <Link
                  href="/study/learning/paths"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
                >
                  <Target size={18} />
                  Create a Learning Path
                </Link>
                <p className="text-sm text-gray-400">
                  Or wait for the AI to generate your daily plan based on your activity
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {plan.items
                .sort((a, b) => a.order - b.order)
                .map((item) => (
                  <LearningItemRow
                    key={item.id}
                    item={item}
                    updating={updating}
                    onComplete={() => handleCompleteItem(item.id)}
                  />
                ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <Link
            href="/study/learning/review"
            className="p-4 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Brain size={20} className="text-orange-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">Start Review Session</div>
              <div className="text-sm text-gray-500">{totalDue || 0} items due</div>
            </div>
          </Link>
          <Link
            href="/study/learning/paths"
            className="p-4 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-pink-100 flex items-center justify-center">
              <Target size={20} className="text-pink-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">Learning Paths</div>
              <div className="text-sm text-gray-500">
                {paths.filter((p) => p.status === LearningPathStatus.IN_PROGRESS).length} active
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div style={{ color }}>{icon}</div>
        <div>
          <div className="text-xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

interface LearningItemRowProps {
  item: DailyLearningItem;
  updating: boolean;
  onComplete: () => void;
}

function LearningItemRow({ item, updating, onComplete }: LearningItemRowProps) {
  const color = ITEM_TYPE_COLORS[item.type] || '#6366f1';

  const getLinkHref = () => {
    if (!item.linkedId) return undefined;
    switch (item.type) {
      case 'read_entry':
        return `/study/learning/entries/${item.linkedId}`;
      case 'review_flashcards':
        return `/study/learning/review?deckId=${item.linkedId}`;
      case 'review_terms':
        return `/study/learning/review?type=dictionary`;
      case 'read_article':
        return `/study/${item.linkedId}`;
      default:
        return undefined;
    }
  };

  const linkHref = getLinkHref();

  return (
    <div
      className={`p-4 ${item.completed ? 'bg-gray-50' : ''} hover:bg-gray-50 transition-colors`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <button
          onClick={!item.completed ? onComplete : undefined}
          disabled={updating || item.completed}
          className={`mt-0.5 flex-shrink-0 ${
            item.completed
              ? 'text-green-600 cursor-default'
              : 'text-gray-300 hover:text-gray-400 cursor-pointer'
          }`}
        >
          {item.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
        </button>

        {/* Icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <span style={{ color }}>{ITEM_TYPE_ICONS[item.type]}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={`font-medium ${
                item.completed ? 'text-gray-400 line-through' : 'text-gray-900'
              }`}
            >
              {item.title}
            </h3>
            <span
              className="px-2 py-0.5 rounded text-xs"
              style={{ backgroundColor: `${color}15`, color }}
            >
              {ITEM_TYPE_LABELS[item.type]}
            </span>
          </div>
          {item.description && (
            <p className={`text-sm mt-1 ${item.completed ? 'text-gray-400' : 'text-gray-600'}`}>
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {item.estimatedTime} min
            </span>
            {item.completedAt && (
              <span>Completed at {new Date(item.completedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </div>

        {/* Action */}
        {linkHref && !item.completed && (
          <Link
            href={linkHref}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1"
          >
            Start <ChevronRight size={14} />
          </Link>
        )}
        {item.completed && <span className="text-green-600 text-sm font-medium">Done</span>}
      </div>
    </div>
  );
}
