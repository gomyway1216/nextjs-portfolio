'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Filter,
  BookOpen,
  Clock,
  ChevronRight,
  Loader2,
  X,
  BarChart3,
  Flame,
  CheckCircle,
  GraduationCap,
  Brain,
  BookMarked,
} from 'lucide-react';
import { useStudyArticles, useStudyCategories, useStudyProgress, useArticleReadHistory } from '@/hooks/useStudy';
import { useAuth } from '@/providers/AuthProvider';
import { QuizDifficulty } from '@/types/study';

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function StudyListPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const isAuthenticated = !!currentUser;
  const { categories, loading: categoriesLoading } = useStudyCategories();
  const { progress } = useStudyProgress(isAuthenticated);
  const { isRead, loading: readHistoryLoading } = useArticleReadHistory(isAuthenticated);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search to avoid too many API calls
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch articles with all filters
  // The hook will automatically refetch when any of these options change
  const { articles, loading, hasMore, loadMore } = useStudyArticles({
    categoryId: selectedCategory || undefined,
    language: selectedLanguage || undefined,
    search: debouncedSearch || undefined,
    difficulty: selectedDifficulty || undefined,
  });

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || 'General';
  };

  const getDifficultyStyle = (difficulty: QuizDifficulty) => {
    switch (difficulty) {
      case QuizDifficulty.BEGINNER:
        return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
      case QuizDifficulty.INTERMEDIATE:
        return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
      case QuizDifficulty.ADVANCED:
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
      case QuizDifficulty.EXPERT:
        return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
      default:
        return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      paddingTop: '8px',
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '4px',
          }}>
            Study Articles
          </h1>
          <p style={{ color: '#6b7280', fontSize: '15px' }}>
            Deep-dive into software engineering concepts
          </p>
        </div>

        {/* Progress Overview - Only show when logged in */}
        {currentUser && progress && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginBottom: '24px',
          }}>
            <div style={{
              backgroundColor: '#f9fafb',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#ede9fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <BookOpen size={20} color="#7c3aed" />
              </div>
              <div>
                <p style={{ fontSize: '20px', fontWeight: '600', color: '#111827' }}>
                  {progress.totalArticlesRead}
                </p>
                <p style={{ color: '#6b7280', fontSize: '12px' }}>Articles Read</p>
              </div>
            </div>
            <div style={{
              backgroundColor: '#f9fafb',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <BarChart3 size={20} color="#2563eb" />
              </div>
              <div>
                <p style={{ fontSize: '20px', fontWeight: '600', color: '#111827' }}>
                  {progress.totalQuizzesCompleted}
                </p>
                <p style={{ color: '#6b7280', fontSize: '12px' }}>Quizzes Done</p>
              </div>
            </div>
            <div style={{
              backgroundColor: '#f9fafb',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#d1fae5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Clock size={20} color="#059669" />
              </div>
              <div>
                <p style={{ fontSize: '20px', fontWeight: '600', color: '#111827' }}>
                  {progress.totalTimeSpentMinutes < 60
                    ? `${progress.totalTimeSpentMinutes}m`
                    : `${Math.round(progress.totalTimeSpentMinutes / 60)}h`}
                </p>
                <p style={{ color: '#6b7280', fontSize: '12px' }}>Time Spent</p>
              </div>
            </div>
            <div style={{
              backgroundColor: '#f9fafb',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Flame size={20} color="#d97706" />
              </div>
              <div>
                <p style={{ fontSize: '20px', fontWeight: '600', color: '#111827' }}>
                  {progress.currentStreak}
                </p>
                <p style={{ color: '#6b7280', fontSize: '12px' }}>Day Streak</p>
              </div>
            </div>
          </div>
        )}

        {/* Learning Hub Quick Access */}
        {currentUser && (
          <div style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <GraduationCap size={24} color="#ffffff" />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>
                  Learning Hub
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px' }}>
                  Track learning from books, videos, work & more
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link
                href="/study/learning/review"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontWeight: '500',
                  fontSize: '14px',
                  transition: 'background-color 0.2s',
                }}
              >
                <Brain size={16} />
                Review
              </Link>
              <Link
                href="/study/learning/dictionary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontWeight: '500',
                  fontSize: '14px',
                  transition: 'background-color 0.2s',
                }}
              >
                <BookMarked size={16} />
                Dictionary
              </Link>
              <Link
                href="/study/learning"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  color: '#7c3aed',
                  textDecoration: 'none',
                  fontWeight: '500',
                  fontSize: '14px',
                  transition: 'background-color 0.2s',
                }}
              >
                Open Hub
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          padding: '16px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
              <Search
                size={18}
                color="#9ca3af"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 40px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  color: '#111827',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: showFilters ? '#f3f4f6' : '#ffffff',
                color: '#374151',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
              }}
            >
              <Filter size={16} />
              Filters
            </button>
          </div>

          {/* Filter Options */}
          {showFilters && (
            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #f3f4f6',
              flexWrap: 'wrap',
            }}>
              {/* Category Filter */}
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', color: '#6b7280', fontSize: '12px', marginBottom: '6px' }}>
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    color: '#111827',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Difficulty Filter */}
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', color: '#6b7280', fontSize: '12px', marginBottom: '6px' }}>
                  Difficulty
                </label>
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    color: '#111827',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All Difficulties</option>
                  {Object.values(QuizDifficulty).map(diff => (
                    <option key={diff} value={diff}>{diff}</option>
                  ))}
                </select>
              </div>

              {/* Language Filter */}
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', color: '#6b7280', fontSize: '12px', marginBottom: '6px' }}>
                  Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    color: '#111827',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All Languages</option>
                  <option value="en">English</option>
                  <option value="ja">Japanese</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="zh">Chinese</option>
                  <option value="ko">Korean</option>
                </select>
              </div>

              {/* Clear Filters */}
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  onClick={() => {
                    setSelectedCategory('');
                    setSelectedDifficulty('');
                    setSelectedLanguage('');
                    setSearchQuery('');
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    color: '#6b7280',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Category Pills - Horizontal Scroll */}
        {!categoriesLoading && categories.length > 0 && (
          <div
            className="category-scroll-container"
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '20px',
              overflowX: 'auto',
              paddingBottom: '8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <button
              onClick={() => setSelectedCategory('')}
              style={{
                padding: '6px 14px',
                borderRadius: '9999px',
                border: `1px solid ${!selectedCategory ? '#10a37f' : '#e5e7eb'}`,
                backgroundColor: !selectedCategory ? '#d1fae5' : '#ffffff',
                color: !selectedCategory ? '#065f46' : '#6b7280',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  border: `1px solid ${selectedCategory === cat.id ? '#10a37f' : '#e5e7eb'}`,
                  backgroundColor: selectedCategory === cat.id ? '#d1fae5' : '#ffffff',
                  color: selectedCategory === cat.id ? '#065f46' : '#6b7280',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Articles Grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
            <Loader2 size={32} color="#10a37f" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : articles.length === 0 ? (
          <div style={{
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
            padding: '64px 24px',
            textAlign: 'center',
          }}>
            <BookOpen size={48} color="#d1d5db" style={{ marginBottom: '16px' }} />
            <h3 style={{ color: '#374151', fontSize: '18px', marginBottom: '8px' }}>No articles found</h3>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              {searchQuery || selectedCategory || selectedDifficulty || selectedLanguage
                ? 'Try adjusting your filters'
                : 'Articles will appear here once generated'}
            </p>
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}>
              {articles.map(article => {
                const diffStyle = getDifficultyStyle(article.difficulty);

                return (
                  <Link
                    key={article.id}
                    href={`/study/article/${article.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      padding: '20px',
                      height: '100%',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#10a37f';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      {/* Category & Difficulty */}
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Read Icon - Only for logged in users */}
                        {currentUser && isRead(article.id) && (
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '500',
                              backgroundColor: '#d1fae5',
                              color: '#065f46',
                            }}
                            title="You have read this article"
                          >
                            <CheckCircle size={12} />
                            Read
                          </span>
                        )}
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '500',
                          backgroundColor: '#f3f4f6',
                          color: '#6b7280',
                        }}>
                          {getCategoryName(article.categoryId)}
                        </span>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '500',
                          backgroundColor: diffStyle.bg,
                          color: diffStyle.text,
                        }}>
                          {article.difficulty}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 style={{
                        color: '#111827',
                        fontSize: '16px',
                        fontWeight: '600',
                        marginBottom: '8px',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {article.title}
                      </h3>

                      {/* Summary */}
                      <p style={{
                        color: '#6b7280',
                        fontSize: '13px',
                        lineHeight: 1.6,
                        marginBottom: '12px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {article.summary}
                      </p>

                      {/* Tags */}
                      {article.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
                          {article.tags.slice(0, 3).map((tag, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                backgroundColor: '#f9fafb',
                                color: '#9ca3af',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                          {article.tags.length > 3 && (
                            <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                              +{article.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '12px',
                        borderTop: '1px solid #f3f4f6',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#9ca3af', fontSize: '12px' }}>
                          <Clock size={14} />
                          {article.readingTimeMinutes} min read
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10a37f', fontSize: '12px', fontWeight: '500' }}>
                          Read
                          <ChevronRight size={14} />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Load More */}
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
                <button
                  onClick={loadMore}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                  }}
                >
                  {loading ? (
                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    'Load More Articles'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* CSS for animations and scrollbar */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .category-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: #e5e7eb transparent;
        }

        .category-scroll-container::-webkit-scrollbar {
          height: 6px;
        }

        .category-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }

        .category-scroll-container::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 3px;
        }

        .category-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
      `}</style>
    </div>
  );
}
