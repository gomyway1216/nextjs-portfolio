'use client';

import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { useStudyArticles, useStudyCategories, useStudyProgress } from '@/hooks/useStudy';
import { QuizDifficulty } from '@/types/study';

export default function StudyListPage() {
  const router = useRouter();
  const { categories, loading: categoriesLoading } = useStudyCategories();
  const { progress } = useStudyProgress();

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch articles
  const { articles, loading, hasMore, fetchArticles, loadMore } = useStudyArticles({
    categoryId: selectedCategory || undefined,
  });

  // Refetch when filters change
  useEffect(() => {
    fetchArticles({ categoryId: selectedCategory || undefined });
  }, [selectedCategory, fetchArticles]);

  // Filter articles client-side for search and difficulty
  const filteredArticles = useMemo(() => {
    return articles.filter(article => {
      const matchesSearch = !searchQuery ||
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesDifficulty = !selectedDifficulty || article.difficulty === selectedDifficulty;

      return matchesSearch && matchesDifficulty;
    });
  }, [articles, searchQuery, selectedDifficulty]);

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
      paddingTop: '64px',
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

        {/* Progress Overview */}
        {progress && (
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
                  {Math.round(progress.totalTimeSpentMinutes / 60)}h
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

              {/* Clear Filters */}
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  onClick={() => {
                    setSelectedCategory('');
                    setSelectedDifficulty('');
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

        {/* Category Pills */}
        {!categoriesLoading && categories.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '20px',
            flexWrap: 'wrap',
          }}>
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
        ) : filteredArticles.length === 0 ? (
          <div style={{
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
            padding: '64px 24px',
            textAlign: 'center',
          }}>
            <BookOpen size={48} color="#d1d5db" style={{ marginBottom: '16px' }} />
            <h3 style={{ color: '#374151', fontSize: '18px', marginBottom: '8px' }}>No articles found</h3>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              {searchQuery || selectedCategory || selectedDifficulty
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
              {filteredArticles.map(article => {
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
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
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

      {/* CSS for animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
