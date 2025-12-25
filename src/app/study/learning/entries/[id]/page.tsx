'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { LearningEntry, ReviewStatus, LearningSourceType } from '@/types/study';
import * as studyService from '@/services/studyService';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { useStudyConfig } from '@/hooks/useStudy';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LearningEntryDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [entry, setEntry] = useState<LearningEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { config } = useStudyConfig();

  const defaultCodeLanguage = config?.defaultArticleSettings?.defaultCodeLanguage || 'typescript';

  useEffect(() => {
    async function fetchEntry() {
      try {
        setLoading(true);
        const data = await studyService.getLearningEntry(id);
        setEntry(data);
      } catch (err) {
        console.error('Failed to fetch entry:', err);
        setError(err instanceof Error ? err.message : 'Failed to load entry');
      } finally {
        setLoading(false);
      }
    }
    fetchEntry();
  }, [id]);

  const getSourceIcon = (type: LearningSourceType) => {
    const icons: Record<LearningSourceType, string> = {
      [LearningSourceType.BOOK]: '📚',
      [LearningSourceType.YOUTUBE]: '🎥',
      [LearningSourceType.ARTICLE]: '📰',
      [LearningSourceType.COURSE]: '🎓',
      [LearningSourceType.PODCAST]: '🎙️',
      [LearningSourceType.WORK]: '💼',
      [LearningSourceType.CONVERSATION]: '💬',
      [LearningSourceType.DOCUMENTATION]: '📖',
      [LearningSourceType.CONFERENCE]: '🎤',
      [LearningSourceType.OTHER]: '📝',
    };
    return icons[type] || '📝';
  };

  const getReviewStatusBadge = (status: ReviewStatus) => {
    const styles: Record<ReviewStatus, string> = {
      [ReviewStatus.NEW]: 'bg-blue-100 text-blue-800',
      [ReviewStatus.LEARNING]: 'bg-yellow-100 text-yellow-800',
      [ReviewStatus.REVIEW]: 'bg-orange-100 text-orange-800',
      [ReviewStatus.MASTERED]: 'bg-green-100 text-green-800',
    };
    const labels: Record<ReviewStatus, string> = {
      [ReviewStatus.NEW]: 'New',
      [ReviewStatus.LEARNING]: 'Learning',
      [ReviewStatus.REVIEW]: 'Review',
      [ReviewStatus.MASTERED]: 'Mastered',
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
            <div className="h-4 bg-gray-200 rounded w-2/3" />
            <div className="h-64 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error || 'Learning entry not found'}
          </div>
          <Link
            href="/study/learning"
            className="text-blue-600 hover:text-blue-800 mt-4 block"
          >
            Back to Learning Hub
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/study/learning"
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
          >
            Back to Learning Hub
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{getSourceIcon(entry.sourceType)}</span>
                <h1 className="text-3xl font-bold text-gray-900">{entry.title}</h1>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                {getReviewStatusBadge(entry.reviewStatus)}
                <span>Created {new Date(entry.createdAt).toLocaleDateString()}</span>
                {entry.confidenceLevel > 0 && (
                  <span>Confidence: {entry.confidenceLevel}%</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        {entry.summary && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">Summary</h2>
            <p className="text-blue-800">{entry.summary}</p>
          </div>
        )}

        {/* Key Takeaways */}
        {entry.keyTakeaways && entry.keyTakeaways.length > 0 && (
          <div className="bg-green-50 border border-green-100 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-green-900 mb-3">Key Takeaways</h2>
            <ul className="space-y-2">
              {entry.keyTakeaways.map((takeaway, i) => (
                <li key={i} className="flex items-start gap-2 text-green-800">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>{takeaway}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Main Content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Content</h2>
          <MarkdownRenderer
            content={entry.content}
            defaultCodeLanguage={defaultCodeLanguage}
            className="prose prose-gray max-w-none"
          />
        </div>

        {/* Tags */}
        {entry.tags && entry.tags.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {entry.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Related Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {entry.flashcardIds && entry.flashcardIds.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🃏</span>
                <h3 className="font-medium">Flashcards</h3>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {entry.flashcardIds.length}
              </p>
              <p className="text-sm text-gray-500">cards created</p>
            </div>
          )}
          {entry.dictionaryTermIds && entry.dictionaryTermIds.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">📚</span>
                <h3 className="font-medium">Dictionary Terms</h3>
              </div>
              <p className="text-2xl font-bold text-purple-600">
                {entry.dictionaryTermIds.length}
              </p>
              <p className="text-sm text-gray-500">terms defined</p>
            </div>
          )}
          {entry.linkedArticleIds && entry.linkedArticleIds.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">📰</span>
                <h3 className="font-medium">Linked Articles</h3>
              </div>
              <p className="text-2xl font-bold text-green-600">
                {entry.linkedArticleIds.length}
              </p>
              <p className="text-sm text-gray-500">articles</p>
            </div>
          )}
        </div>

        {/* Source Details */}
        {entry.sourceDetails && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Source Details</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="font-medium">Type:</span>{' '}
                {entry.sourceType.replace('_', ' ')}
              </p>
              {entry.sourceDetails.bookTitle && (
                <p>
                  <span className="font-medium">Book:</span> {entry.sourceDetails.bookTitle}
                  {entry.sourceDetails.bookAuthor && ` by ${entry.sourceDetails.bookAuthor}`}
                </p>
              )}
              {entry.sourceDetails.videoTitle && (
                <p>
                  <span className="font-medium">Video:</span> {entry.sourceDetails.videoTitle}
                </p>
              )}
              {entry.sourceDetails.articleTitle && (
                <p>
                  <span className="font-medium">Article:</span>{' '}
                  {entry.sourceDetails.articleTitle}
                </p>
              )}
              {entry.sourceDetails.courseName && (
                <p>
                  <span className="font-medium">Course:</span> {entry.sourceDetails.courseName}
                </p>
              )}
              {entry.sourceDetails.notes && (
                <p>
                  <span className="font-medium">Notes:</span> {entry.sourceDetails.notes}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
