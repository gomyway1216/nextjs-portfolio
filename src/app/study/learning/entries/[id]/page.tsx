'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LearningEntry, ReviewStatus, LearningSourceType } from '@/types/study';
import * as studyService from '@/services/studyService';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { useStudyConfig } from '@/hooks/useStudy';
import {
  ArrowLeft,
  Menu,
  X,
  BookOpen,
  Clock,
  Loader2,
  CheckCircle,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LearningEntryDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [entry, setEntry] = useState<LearningEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showDesktopSidebar, setShowDesktopSidebar] = useState(true);
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

  const getReviewStatusStyle = (status: ReviewStatus) => {
    switch (status) {
      case ReviewStatus.NEW:
        return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
      case ReviewStatus.LEARNING:
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
      case ReviewStatus.REVIEW:
        return { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' };
      case ReviewStatus.MASTERED:
        return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
      default:
        return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };
    }
  };

  const getReviewStatusLabel = (status: ReviewStatus) => {
    const labels: Record<ReviewStatus, string> = {
      [ReviewStatus.NEW]: 'New',
      [ReviewStatus.LEARNING]: 'Learning',
      [ReviewStatus.REVIEW]: 'Review',
      [ReviewStatus.MASTERED]: 'Mastered',
    };
    return labels[status] || status;
  };

  // Sidebar content component
  const SidebarContent = () => (
    <>
      {/* Entry Info */}
      <div style={{
        backgroundColor: '#f9fafb',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px' }}>Entry Info</h3>
        <dl style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <dt style={{ color: '#6b7280', fontSize: '13px' }}>Source</dt>
            <dd style={{ color: '#374151', fontSize: '13px', textTransform: 'capitalize' }}>
              {entry?.sourceType.replace('_', ' ')}
            </dd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <dt style={{ color: '#6b7280', fontSize: '13px' }}>Created</dt>
            <dd style={{ color: '#374151', fontSize: '13px' }}>
              {entry?.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-'}
            </dd>
          </div>
          {entry?.confidenceLevel !== undefined && entry.confidenceLevel > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt style={{ color: '#6b7280', fontSize: '13px' }}>Confidence</dt>
              <dd style={{ color: '#374151', fontSize: '13px' }}>{entry.confidenceLevel}%</dd>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <dt style={{ color: '#6b7280', fontSize: '13px' }}>Reviews</dt>
            <dd style={{ color: '#374151', fontSize: '13px' }}>{entry?.reviewCount || 0}</dd>
          </div>
        </dl>
      </div>

      {/* Tags */}
      {entry?.tags && entry.tags.length > 0 && (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px' }}>Tags</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {entry.tags.map((tag, i) => (
              <span
                key={i}
                style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Flashcards */}
      {entry?.flashcardIds && entry.flashcardIds.length > 0 && (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🃏</span> Flashcards
          </h3>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#2563eb', marginBottom: '4px' }}>
            {entry.flashcardIds.length}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280' }}>cards created</p>
          <button
            onClick={() => router.push('/study/learning/flashcards')}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '8px',
              borderRadius: '6px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '13px',
            }}
          >
            Review Flashcards
          </button>
        </div>
      )}

      {/* Dictionary Terms */}
      {entry?.dictionaryTermIds && entry.dictionaryTermIds.length > 0 && (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📚</span> Dictionary Terms
          </h3>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#9333ea', marginBottom: '4px' }}>
            {entry.dictionaryTermIds.length}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280' }}>terms defined</p>
          <button
            onClick={() => router.push('/study/learning/dictionary')}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '8px',
              borderRadius: '6px',
              backgroundColor: '#9333ea',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '13px',
            }}
          >
            View Dictionary
          </button>
        </div>
      )}

      {/* Linked Articles */}
      {entry?.linkedArticleIds && entry.linkedArticleIds.length > 0 && (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📰</span> Linked Articles
          </h3>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#059669', marginBottom: '4px' }}>
            {entry.linkedArticleIds.length}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280' }}>related articles</p>
        </div>
      )}

      {/* Source Details */}
      {entry?.sourceDetails && (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px' }}>Source Details</h3>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            {entry.sourceDetails.bookTitle && (
              <p style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: '500', color: '#374151' }}>Book:</span> {entry.sourceDetails.bookTitle}
                {entry.sourceDetails.bookAuthor && ` by ${entry.sourceDetails.bookAuthor}`}
              </p>
            )}
            {entry.sourceDetails.videoTitle && (
              <p style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: '500', color: '#374151' }}>Video:</span> {entry.sourceDetails.videoTitle}
              </p>
            )}
            {entry.sourceDetails.articleTitle && (
              <p style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: '500', color: '#374151' }}>Article:</span> {entry.sourceDetails.articleTitle}
              </p>
            )}
            {entry.sourceDetails.courseName && (
              <p style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: '500', color: '#374151' }}>Course:</span> {entry.sourceDetails.courseName}
              </p>
            )}
            {entry.sourceDetails.notes && (
              <p style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: '500', color: '#374151' }}>Notes:</span> {entry.sourceDetails.notes}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: '64px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={40} color="#10a37f" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
          <p style={{ color: '#6b7280', fontSize: '15px' }}>Loading entry...</p>
        </div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: '64px',
      }}>
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          maxWidth: '400px',
        }}>
          <BookOpen size={48} color="#9ca3af" style={{ marginBottom: '16px' }} />
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
            Entry Not Found
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '24px', lineHeight: 1.6 }}>
            {error || 'The learning entry you are looking for does not exist.'}
          </p>
          <button
            onClick={() => router.push('/study/learning')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '6px',
              backgroundColor: '#10a37f',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px',
            }}
          >
            <ArrowLeft size={16} />
            Back to Learning Hub
          </button>
        </div>
      </div>
    );
  }

  const statusStyle = getReviewStatusStyle(entry.reviewStatus);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      paddingTop: '8px',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ maxWidth: '100%', padding: '6px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
              <button
                onClick={() => router.push('/study/learning')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <ArrowLeft size={18} />
              </button>
              <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px', flexShrink: 0 }}>{getSourceIcon(entry.sourceType)}</span>
                <h1 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#111827',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  margin: 0,
                }}>
                  {entry.title}
                </h1>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '500',
                backgroundColor: statusStyle.bg,
                color: statusStyle.text,
                border: `1px solid ${statusStyle.border}`,
              }} className="sm-show">
                {getReviewStatusLabel(entry.reviewStatus)}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280', fontSize: '12px' }} className="sm-show">
                <Clock size={14} />
                {new Date(entry.createdAt).toLocaleDateString()}
              </div>
              <button
                onClick={() => {
                  const isDesktop = window.innerWidth >= 1024;
                  if (isDesktop) {
                    setShowDesktopSidebar(!showDesktopSidebar);
                  } else {
                    setShowMobileSidebar(true);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                <Menu size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 50,
          }}
          onClick={() => setShowMobileSidebar(false)}
        >
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '300px',
              maxWidth: '85vw',
              backgroundColor: '#ffffff',
              padding: '16px',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontWeight: '600', color: '#111827' }}>Details</h2>
              <button
                onClick={() => setShowMobileSidebar(false)}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <X size={20} color="#6b7280" />
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{ maxWidth: '100%', padding: '16px 24px 24px' }}>
        <div style={{ display: 'flex', gap: '32px' }}>
          {/* Article Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Summary */}
            {entry.summary && (
              <div style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px',
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '8px' }}>
                  Summary
                </h3>
                <p style={{ color: '#15803d', lineHeight: 1.7, fontSize: '14px' }}>{entry.summary}</p>
              </div>
            )}

            {/* Key Takeaways */}
            {entry.keyTakeaways && entry.keyTakeaways.length > 0 && (
              <div style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px',
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af', marginBottom: '12px' }}>
                  Key Takeaways
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {entry.keyTakeaways.map((takeaway, index) => (
                    <li key={index} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      color: '#1e3a8a',
                      marginBottom: '8px',
                      fontSize: '14px',
                    }}>
                      <CheckCircle size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span style={{ lineHeight: 1.6 }}>{takeaway}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Main Content */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              padding: '24px',
            }}>
              <MarkdownRenderer
                content={entry.content}
                defaultCodeLanguage={defaultCodeLanguage}
                className="prose prose-gray max-w-none"
              />
            </div>
          </div>

          {/* Desktop Sidebar */}
          {showDesktopSidebar && (
            <aside style={{ width: '280px', flexShrink: 0 }} className="lg-show">
              <div style={{
                position: 'sticky',
                top: '60px',
                maxHeight: 'calc(100vh - 70px)',
                overflowY: 'auto',
              }}>
                <SidebarContent />
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* CSS */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .sm-show { display: none; }
        .lg-show { display: none; }
        @media (min-width: 640px) {
          .sm-show { display: flex; }
        }
        @media (min-width: 1024px) {
          .lg-show { display: block; }
        }
        @media (max-width: 639px) {
          .main-container {
            padding: 8px !important;
          }
        }
      `}</style>
    </div>
  );
}
