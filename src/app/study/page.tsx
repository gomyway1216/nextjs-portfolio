'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Menu,
} from 'lucide-react';
import { useStudyArticles, useStudyCategories, useStudyProgress } from '@/hooks/useStudy';
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

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all');

  // Debounce search to avoid too many API calls
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch articles with all filters including read status (backend filtering)
  const { articles, loading, hasMore, loadMore, counts, isArticleRead } = useStudyArticles({
    categoryId: selectedCategory || undefined,
    language: selectedLanguage || undefined,
    search: debouncedSearch || undefined,
    difficulty: selectedDifficulty || undefined,
    readStatus: isAuthenticated ? statusFilter : undefined,
    userId: currentUser?.uid,
  });

  // Use counts from backend
  const readCount = counts.read;
  const unreadCount = counts.unread;

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

  // Sidebar content component
  const SidebarContent = () => (
    <>
      {/* Progress Overview */}
      {currentUser && progress && (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px' }}>
            Your Progress
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#ede9fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <BookOpen size={18} color="#7c3aed" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <p style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                    {readCount}
                  </p>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>/ {articles.length}</p>
                </div>
                <p style={{ color: '#6b7280', fontSize: '11px', marginBottom: '6px' }}>Articles Read</p>
                {articles.length > 0 && (
                  <div style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${(readCount / articles.length) * 100}%`,
                      height: '100%',
                      backgroundColor: '#7c3aed',
                      borderRadius: '2px',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <BarChart3 size={18} color="#2563eb" />
              </div>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                  {progress.totalQuizzesCompleted}
                </p>
                <p style={{ color: '#6b7280', fontSize: '11px' }}>Quizzes Done</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#d1fae5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Clock size={18} color="#059669" />
              </div>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                  {progress.totalTimeSpentMinutes < 60
                    ? `${progress.totalTimeSpentMinutes}m`
                    : `${Math.round(progress.totalTimeSpentMinutes / 60)}h`}
                </p>
                <p style={{ color: '#6b7280', fontSize: '11px' }}>Time Spent</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Flame size={18} color="#d97706" />
              </div>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                  {progress.currentStreak}
                </p>
                <p style={{ color: '#6b7280', fontSize: '11px' }}>Day Streak</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Learning Hub Quick Access */}
      {currentUser && (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GraduationCap size={16} style={{ color: '#7c3aed' }} />
            Learning Hub
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link
              href="/study/learning/review"
              onClick={() => setShowMobileSidebar(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                color: '#374151',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '13px',
              }}
            >
              <Brain size={16} />
              Review
            </Link>
            <Link
              href="/study/learning/dictionary"
              onClick={() => setShowMobileSidebar(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                color: '#374151',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '13px',
              }}
            >
              <BookMarked size={16} />
              Dictionary
            </Link>
            <Link
              href="/study/learning"
              onClick={() => setShowMobileSidebar(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#7c3aed',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '13px',
              }}
            >
              Open Hub
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      )}

      {/* Categories Quick Filter */}
      {!categoriesLoading && categories.length > 0 && (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px' }}>
            Categories
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={() => { setSelectedCategory(''); setShowMobileSidebar(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: !selectedCategory ? '#d1fae5' : 'transparent',
                color: !selectedCategory ? '#065f46' : '#374151',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: !selectedCategory ? '500' : '400',
                textAlign: 'left',
              }}
            >
              All Categories
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setShowMobileSidebar(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: selectedCategory === cat.id ? '#d1fae5' : 'transparent',
                  color: selectedCategory === cat.id ? '#065f46' : '#374151',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: selectedCategory === cat.id ? '500' : '400',
                  textAlign: 'left',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      paddingTop: '8px',
    }}>
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
              <h2 style={{ fontWeight: '600', color: '#111827' }}>Menu</h2>
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

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', gap: '32px' }}>
          {/* Main Content Area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 0 }}>
              <h1 style={{
                  fontSize: '28px',
                  fontWeight: '600',
                  color: '#111827',
                }}>
                  Study Articles
                </h1>
              {/* Mobile Menu Button */}
              {currentUser && (
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className="lg-hide"
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
                  <Menu size={20} />
                </button>
              )}
            </div>

        {/* Search and Filters */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
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
              <span className="filter-text">Filters</span>
            </button>
          </div>

          {/* Filter Options */}
          {showFilters && (
            <div style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '16px',
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              flexWrap: 'wrap',
            }}>
              {/* Category Filter */}
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', color: '#6b7280', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>
                  Category
                </label>
                <Select
                  value={selectedCategory || 'all'}
                  onValueChange={(v) => setSelectedCategory(v === 'all' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Difficulty Filter */}
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', color: '#6b7280', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>
                  Difficulty
                </label>
                <Select
                  value={selectedDifficulty || 'all'}
                  onValueChange={(v) => setSelectedDifficulty(v === 'all' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Difficulties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Difficulties</SelectItem>
                    {Object.values(QuizDifficulty).map(diff => (
                      <SelectItem key={diff} value={diff}>{diff}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Language Filter */}
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', color: '#6b7280', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>
                  Language
                </label>
                <Select
                  value={selectedLanguage || 'all'}
                  onValueChange={(v) => setSelectedLanguage(v === 'all' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Languages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Languages</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                    <SelectItem value="ko">Korean</SelectItem>
                  </SelectContent>
                </Select>
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

        {/* Status Filter Pills */}
        {isAuthenticated && (
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
          }}>
            <button
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                backgroundColor: statusFilter === 'all' ? '#10a37f' : '#f3f4f6',
                color: statusFilter === 'all' ? '#ffffff' : '#6b7280',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px',
                transition: 'all 0.2s',
              }}
            >
              All ({counts.total})
            </button>
            <button
              onClick={() => setStatusFilter('unread')}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                backgroundColor: statusFilter === 'unread' ? '#10a37f' : '#f3f4f6',
                color: statusFilter === 'unread' ? '#ffffff' : '#6b7280',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px',
                transition: 'all 0.2s',
              }}
            >
              Unread ({unreadCount})
            </button>
            <button
              onClick={() => setStatusFilter('read')}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                backgroundColor: statusFilter === 'read' ? '#10a37f' : '#f3f4f6',
                color: statusFilter === 'read' ? '#ffffff' : '#6b7280',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px',
                transition: 'all 0.2s',
              }}
            >
              Read ({readCount})
            </button>
          </div>
        )}

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
        {loading && articles.length === 0 ? (
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
            <h3 style={{ color: '#374151', fontSize: '18px', marginBottom: '8px' }}>
              {statusFilter === 'unread' ? 'All caught up!' : statusFilter === 'read' ? 'No read articles yet' : 'No articles found'}
            </h3>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              {statusFilter === 'unread'
                ? "You've read all available articles. Great job!"
                : statusFilter === 'read'
                  ? 'Start reading articles to track your progress'
                  : searchQuery || selectedCategory || selectedDifficulty || selectedLanguage
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
                const articleIsRead = isAuthenticated && isArticleRead(article.id);

                return (
                  <Link
                    key={article.id}
                    href={`/study/article/${article.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      border: articleIsRead ? '1px solid #d1d5db' : '1px solid #e5e7eb',
                      padding: '20px',
                      height: '100%',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                      opacity: articleIsRead ? 0.7 : 1,
                    }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#10a37f';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = articleIsRead ? '#d1d5db' : '#e5e7eb';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.opacity = articleIsRead ? '0.7' : '1';
                      }}
                    >
                      {/* Category & Difficulty */}
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Read Icon - Only for logged in users */}
                        {currentUser && isArticleRead(article.id) && (
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

          {/* Desktop Sidebar */}
          <aside
            className="lg-show"
            style={{
              width: '280px',
              flexShrink: 0,
            }}
          >
            <div style={{ position: 'sticky', top: '24px' }}>
              <SidebarContent />
            </div>
          </aside>
        </div>
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

        /* Responsive sidebar visibility */
        .lg-show {
          display: none;
        }

        .lg-hide {
          display: flex;
        }

        /* Hide filter text on mobile */
        .filter-text {
          display: none;
        }

        @media (min-width: 640px) {
          .filter-text {
            display: inline;
          }
        }

        @media (min-width: 1024px) {
          .lg-show {
            display: block;
          }

          .lg-hide {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
