'use client';

import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue,
} from '@/components/ui/select';
import { useArticleCounts, useStudyArticles, useStudyCategories, useStudyProgress } from '@/hooks/useStudy';
import { useAuth } from '@/providers/AuthProvider';
import { QuizDifficulty } from '@/types/study';
import {
BarChart3,
BookMarked,
BookOpen,
Brain,
CheckCircle,
ChevronRight,
Clock,
Code2,
Filter,
Flame,
GraduationCap,
KeyRound,
Loader2,
Menu,
Search,
X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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
  const { articles, loading, hasMore, loadMore, isArticleRead } = useStudyArticles({
    categoryId: selectedCategory || undefined,
    language: selectedLanguage || undefined,
    search: debouncedSearch || undefined,
    difficulty: selectedDifficulty || undefined,
    readStatus: isAuthenticated ? statusFilter : undefined,
    userId: currentUser?.uid,
  });

  // Fetch counts from separate efficient endpoint
  const { counts } = useArticleCounts(currentUser?.uid);

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || 'General';
  };

  const getDifficultyStyle = (difficulty: QuizDifficulty) => {
    switch (difficulty) {
      case QuizDifficulty.BEGINNER:
        return {
          bg: 'color-mix(in srgb, var(--background) 82%, #16a34a 18%)',
          text: '#15803d',
          border: 'color-mix(in srgb, var(--border) 72%, #16a34a 28%)',
        };
      case QuizDifficulty.INTERMEDIATE:
        return {
          bg: 'color-mix(in srgb, var(--background) 82%, #2563eb 18%)',
          text: '#2563eb',
          border: 'color-mix(in srgb, var(--border) 72%, #2563eb 28%)',
        };
      case QuizDifficulty.ADVANCED:
        return {
          bg: 'color-mix(in srgb, var(--background) 82%, #f59e0b 18%)',
          text: '#d97706',
          border: 'color-mix(in srgb, var(--border) 72%, #f59e0b 28%)',
        };
      case QuizDifficulty.EXPERT:
        return {
          bg: 'color-mix(in srgb, var(--background) 82%, #ef4444 18%)',
          text: '#dc2626',
          border: 'color-mix(in srgb, var(--border) 72%, #ef4444 28%)',
        };
      default:
        return { bg: 'var(--muted)', text: 'var(--foreground)', border: 'var(--border)' };
    }
  };

  // Sidebar content component
  const SidebarContent = () => (
    <>
      {/* Progress Overview */}
      {currentUser && progress && (
        <div style={{
          backgroundColor: 'var(--muted)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: 'var(--foreground)', marginBottom: '12px', fontSize: '14px' }}>
            Your Progress
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'color-mix(in srgb, var(--background) 80%, #0f766e 20%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <BookOpen size={18} color="#0f766e" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--foreground)' }}>
                    {counts.read}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>/ {counts.total}</p>
                </div>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '11px', marginBottom: '6px' }}>Articles Read</p>
                {counts.total > 0 && (
                  <div style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: 'var(--border)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${(counts.read / counts.total) * 100}%`,
                      height: '100%',
                      backgroundColor: '#0f766e',
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
                backgroundColor: 'color-mix(in srgb, var(--background) 80%, #2563eb 20%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <BarChart3 size={18} color="#2563eb" />
              </div>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--foreground)' }}>
                  {progress.totalQuizzesCompleted}
                </p>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>Quizzes Done</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'color-mix(in srgb, var(--background) 80%, #0f766e 20%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Clock size={18} color="#0f766e" />
              </div>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--foreground)' }}>
                  {progress.totalTimeSpentMinutes < 60
                    ? `${progress.totalTimeSpentMinutes}m`
                    : `${Math.round(progress.totalTimeSpentMinutes / 60)}h`}
                </p>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>Time Spent</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'color-mix(in srgb, var(--background) 80%, #f59e0b 20%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Flame size={18} color="#d97706" />
              </div>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--foreground)' }}>
                  {progress.currentStreak}
                </p>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>Day Streak</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Learning Hub Quick Access */}
      {currentUser && (
        <div style={{
          backgroundColor: 'var(--muted)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: 'var(--foreground)', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GraduationCap size={16} style={{ color: '#0f766e' }} />
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
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
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
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '13px',
              }}
            >
              <BookMarked size={16} />
              Dictionary
            </Link>
            <Link
              href="/study/cs"
              onClick={() => setShowMobileSidebar(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '13px',
              }}
            >
              <Code2 size={16} />
              CS Learning Lab
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
                backgroundColor: '#0f766e',
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
          backgroundColor: 'var(--muted)',
          borderRadius: '8px',
          padding: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: 'var(--foreground)', marginBottom: '12px', fontSize: '14px' }}>
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
                backgroundColor: !selectedCategory ? 'color-mix(in srgb, var(--background) 80%, #0f766e 20%)' : 'transparent',
                color: !selectedCategory ? '#0f766e' : 'var(--foreground)',
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
                  backgroundColor: selectedCategory === cat.id ? 'color-mix(in srgb, var(--background) 80%, #0f766e 20%)' : 'transparent',
                  color: selectedCategory === cat.id ? '#0f766e' : 'var(--foreground)',
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
      backgroundColor: 'var(--background)',
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
              backgroundColor: 'var(--background)',
              padding: '16px',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontWeight: '600', color: 'var(--foreground)' }}>Menu</h2>
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
                <X size={20} color="var(--muted-foreground)" />
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
                  color: 'var(--foreground)',
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
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--background)',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                  }}
                >
                  <Menu size={20} />
                </button>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: '16px',
                alignItems: 'center',
                margin: '16px 0 18px',
                padding: '18px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                backgroundColor: 'color-mix(in srgb, var(--card) 92%, #dbeafe 8%)',
              }}
            >
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', minWidth: 0, flex: '1 1 320px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '8px',
                    backgroundColor: 'color-mix(in srgb, var(--background) 76%, #2563eb 24%)',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Code2 size={22} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, color: 'var(--foreground)', fontSize: '18px', fontWeight: 500 }}>
                    CS Learning Lab
                  </h2>
                  <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: '14px', lineHeight: 1.55 }}>
                    Interactive sorting visualizers, Big-O comparison, cryptography playgrounds,
                    and quick checks.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 220px' }}>
                <Link
                  href="/study/cs/algorithms/sorting"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    minHeight: '38px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    textDecoration: 'none',
                    fontWeight: 500,
                    fontSize: '13px',
                  }}
                >
                  <Code2 size={15} />
                  Algorithms
                </Link>
                <Link
                  href="/study/cs/cryptography"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    minHeight: '38px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--background)',
                    color: 'var(--foreground)',
                    textDecoration: 'none',
                    fontWeight: 500,
                    fontSize: '13px',
                  }}
                >
                  <KeyRound size={15} />
                  Cryptography
                </Link>
              </div>
            </div>

        {/* Search and Filters */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
            {/* Search */}
            <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
              <Search
                size={18}
                color="var(--muted-foreground)"
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
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
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
                    color: 'var(--muted-foreground)',
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
                border: '1px solid var(--border)',
                backgroundColor: showFilters ? 'var(--muted)' : 'var(--card)',
                color: 'var(--foreground)',
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
              backgroundColor: 'var(--muted)',
              borderRadius: '8px',
              flexWrap: 'wrap',
            }}>
              {/* Category Filter */}
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>
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
                <label style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>
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
                <label style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>
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
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--background)',
                    color: 'var(--muted-foreground)',
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
                borderRadius: '999px',
                border: 'none',
                backgroundColor: statusFilter === 'all' ? '#0f766e' : 'var(--muted)',
                color: statusFilter === 'all' ? '#ffffff' : 'var(--muted-foreground)',
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
                borderRadius: '999px',
                border: 'none',
                backgroundColor: statusFilter === 'unread' ? '#0f766e' : 'var(--muted)',
                color: statusFilter === 'unread' ? '#ffffff' : 'var(--muted-foreground)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px',
                transition: 'all 0.2s',
              }}
            >
              Unread ({counts.unread})
            </button>
            <button
              onClick={() => setStatusFilter('read')}
              style={{
                padding: '8px 16px',
                borderRadius: '999px',
                border: 'none',
                backgroundColor: statusFilter === 'read' ? '#0f766e' : 'var(--muted)',
                color: statusFilter === 'read' ? '#ffffff' : 'var(--muted-foreground)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px',
                transition: 'all 0.2s',
              }}
            >
              Read ({counts.read})
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
                border: `1px solid ${!selectedCategory ? '#0f766e' : 'var(--border)'}`,
                backgroundColor: !selectedCategory ? 'color-mix(in srgb, var(--background) 80%, #0f766e 20%)' : 'var(--card)',
                color: !selectedCategory ? '#0f766e' : 'var(--muted-foreground)',
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
                  border: `1px solid ${selectedCategory === cat.id ? '#0f766e' : 'var(--border)'}`,
                  backgroundColor: selectedCategory === cat.id ? 'color-mix(in srgb, var(--background) 80%, #0f766e 20%)' : 'var(--card)',
                  color: selectedCategory === cat.id ? '#0f766e' : 'var(--muted-foreground)',
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
            <Loader2 size={32} color="#0f766e" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : articles.length === 0 ? (
          <div style={{
            backgroundColor: 'var(--muted)',
            borderRadius: '8px',
            padding: '64px 24px',
            textAlign: 'center',
          }}>
            <BookOpen size={48} color="#d1d5db" style={{ marginBottom: '16px' }} />
            <h3 style={{ color: 'var(--foreground)', fontSize: '18px', marginBottom: '8px' }}>
              {statusFilter === 'unread' ? 'All caught up!' : statusFilter === 'read' ? 'No read articles yet' : 'No articles found'}
            </h3>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '14px' }}>
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
                    href={`/study/articles/${article.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      backgroundColor: 'var(--background)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      padding: '20px',
                      height: '100%',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                      opacity: articleIsRead ? 0.7 : 1,
                    }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#0f766e';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
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
                              backgroundColor: 'color-mix(in srgb, var(--background) 80%, #0f766e 20%)',
                              color: '#0f766e',
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
                          backgroundColor: 'var(--muted)',
                          color: 'var(--muted-foreground)',
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
                        color: 'var(--foreground)',
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
                        color: 'var(--muted-foreground)',
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
                                backgroundColor: 'var(--muted)',
                                color: 'var(--muted-foreground)',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                          {article.tags.length > 3 && (
                            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
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
                        borderTop: '1px solid var(--muted)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                          <Clock size={14} />
                          {article.readingTimeMinutes} min read
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0f766e', fontSize: '12px', fontWeight: '500' }}>
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
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--background)',
                    color: 'var(--foreground)',
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
          scrollbar-color: var(--border) transparent;
        }

        .category-scroll-container::-webkit-scrollbar {
          height: 6px;
        }

        .category-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }

        .category-scroll-container::-webkit-scrollbar-thumb {
          background: var(--border);
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
