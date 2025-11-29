'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Filter,
  BookOpen,
  Clock,
  Tag,
  ChevronRight,
  Loader2,
  X,
  BarChart3,
} from 'lucide-react';
import { useStudyArticles, useStudyCategories, useStudyProgress } from '@/hooks/useStudy';
import { QuizDifficulty, ArticleStatus } from '@/types/study';

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

  const getDifficultyColor = (difficulty: QuizDifficulty) => {
    switch (difficulty) {
      case QuizDifficulty.BEGINNER:
        return { bg: 'rgba(16, 185, 129, 0.2)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.3)' };
      case QuizDifficulty.INTERMEDIATE:
        return { bg: 'rgba(59, 130, 246, 0.2)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.3)' };
      case QuizDifficulty.ADVANCED:
        return { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
      case QuizDifficulty.EXPERT:
        return { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.2)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #581c87 50%, #0f172a 100%)',
      paddingTop: '80px',
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '36px',
            fontWeight: 'bold',
            color: '#ffffff',
            marginBottom: '8px',
          }}>
            Study Articles
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '18px' }}>
            Deep-dive into software engineering concepts
          </p>
        </div>

        {/* Progress Overview */}
        {progress && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            marginBottom: '32px',
          }}>
            <div style={{
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              backdropFilter: 'blur(8px)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '20px',
            }}>
              <BookOpen size={24} color="#a855f7" style={{ marginBottom: '8px' }} />
              <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff' }}>
                {progress.totalArticlesRead}
              </p>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Articles Read</p>
            </div>
            <div style={{
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              backdropFilter: 'blur(8px)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '20px',
            }}>
              <BarChart3 size={24} color="#3b82f6" style={{ marginBottom: '8px' }} />
              <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff' }}>
                {progress.totalQuizzesCompleted}
              </p>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Quizzes Completed</p>
            </div>
            <div style={{
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              backdropFilter: 'blur(8px)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '20px',
            }}>
              <Clock size={24} color="#10b981" style={{ marginBottom: '8px' }} />
              <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff' }}>
                {Math.round(progress.totalTimeSpentMinutes / 60)}h
              </p>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Time Spent</p>
            </div>
            <div style={{
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              backdropFilter: 'blur(8px)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '20px',
            }}>
              <span style={{ fontSize: '24px' }}>🔥</span>
              <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginTop: '8px' }}>
                {progress.currentStreak}
              </p>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Day Streak</p>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div style={{
          backgroundColor: 'rgba(30, 41, 59, 0.5)',
          backdropFilter: 'blur(8px)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '20px',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ flex: 1, position: 'relative' }}>
              <Search
                size={18}
                color="#64748b"
                style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 44px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'rgba(15, 23, 42, 0.5)',
                  color: '#ffffff',
                  fontSize: '15px',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
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
                gap: '8px',
                padding: '12px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                backgroundColor: showFilters ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                color: showFilters ? '#c084fc' : '#ffffff',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              <Filter size={18} />
              Filters
            </button>
          </div>

          {/* Filter Options */}
          {showFilters && (
            <div style={{
              display: 'flex',
              gap: '16px',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            }}>
              {/* Category Filter */}
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    color: '#ffffff',
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
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
                  Difficulty
                </label>
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    color: '#ffffff',
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
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'transparent',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '14px',
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
            marginBottom: '24px',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={() => setSelectedCategory('')}
              style={{
                padding: '8px 16px',
                borderRadius: '9999px',
                border: `1px solid ${!selectedCategory ? 'rgba(168, 85, 247, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
                backgroundColor: !selectedCategory ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                color: !selectedCategory ? '#c084fc' : '#94a3b8',
                cursor: 'pointer',
                fontSize: '14px',
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
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  border: `1px solid ${selectedCategory === cat.id ? 'rgba(168, 85, 247, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
                  backgroundColor: selectedCategory === cat.id ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                  color: selectedCategory === cat.id ? '#c084fc' : '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '14px',
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
            <Loader2 size={32} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : filteredArticles.length === 0 ? (
          <div style={{
            backgroundColor: 'rgba(30, 41, 59, 0.5)',
            backdropFilter: 'blur(8px)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '64px',
            textAlign: 'center',
          }}>
            <BookOpen size={48} color="#64748b" style={{ marginBottom: '16px' }} />
            <h3 style={{ color: '#ffffff', fontSize: '20px', marginBottom: '8px' }}>No articles found</h3>
            <p style={{ color: '#94a3b8' }}>
              {searchQuery || selectedCategory || selectedDifficulty
                ? 'Try adjusting your filters'
                : 'Articles will appear here once generated'}
            </p>
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '24px',
            }}>
              {filteredArticles.map(article => {
                const diffColors = getDifficultyColor(article.difficulty);

                return (
                  <Link
                    key={article.id}
                    href={`/study/article/${article.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      backgroundColor: 'rgba(30, 41, 59, 0.5)',
                      backdropFilter: 'blur(8px)',
                      borderRadius: '16px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      padding: '24px',
                      height: '100%',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* Category & Difficulty */}
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: 'rgba(168, 85, 247, 0.2)',
                          color: '#c084fc',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                        }}>
                          {getCategoryName(article.categoryId)}
                        </span>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: diffColors.bg,
                          color: diffColors.text,
                          border: `1px solid ${diffColors.border}`,
                        }}>
                          {article.difficulty}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 style={{
                        color: '#ffffff',
                        fontSize: '18px',
                        fontWeight: '600',
                        marginBottom: '8px',
                        lineHeight: 1.4,
                      }}>
                        {article.title}
                      </h3>

                      {/* Summary */}
                      <p style={{
                        color: '#94a3b8',
                        fontSize: '14px',
                        lineHeight: 1.6,
                        marginBottom: '16px',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {article.summary}
                      </p>

                      {/* Tags */}
                      {article.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                          {article.tags.slice(0, 4).map((tag, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                color: '#64748b',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '13px' }}>
                          <Clock size={14} />
                          {article.readingTimeMinutes} min read
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#a855f7', fontSize: '13px' }}>
                          Read Article
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
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
                <button
                  onClick={loadMore}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 32px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'transparent',
                    color: '#ffffff',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    fontSize: '15px',
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
