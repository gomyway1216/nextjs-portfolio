'use client';

import {
useLearningEntries,
useLearningStats,
useQuickCapture,
useSpacedRepetition,
} from '@/hooks/useStudy';
import { useAuth } from '@/providers/AuthProvider';
import { LearningSourceType } from '@/types/study';
import {
Book,
BookMarked,
BookOpen,
Brain,
Briefcase,
ChevronRight,
Clock,
Code,
FileText,
Flame,
Globe,
Layers,
MessageCircle,
Mic,
MoreHorizontal,
Plus,
Search,
Target,
Video,
Zap
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const SOURCE_TYPE_ICONS: Record<LearningSourceType, React.ReactNode> = {
  [LearningSourceType.BOOK]: <Book size={16} />,
  [LearningSourceType.YOUTUBE]: <Video size={16} />,
  [LearningSourceType.ARTICLE]: <FileText size={16} />,
  [LearningSourceType.COURSE]: <BookOpen size={16} />,
  [LearningSourceType.PODCAST]: <Mic size={16} />,
  [LearningSourceType.WORK]: <Briefcase size={16} />,
  [LearningSourceType.CONVERSATION]: <MessageCircle size={16} />,
  [LearningSourceType.DOCUMENTATION]: <Code size={16} />,
  [LearningSourceType.CONFERENCE]: <Globe size={16} />,
  [LearningSourceType.OTHER]: <MoreHorizontal size={16} />,
};

const SOURCE_TYPE_LABELS: Record<LearningSourceType, string> = {
  [LearningSourceType.BOOK]: 'Book',
  [LearningSourceType.YOUTUBE]: 'YouTube',
  [LearningSourceType.ARTICLE]: 'Article',
  [LearningSourceType.COURSE]: 'Course',
  [LearningSourceType.PODCAST]: 'Podcast',
  [LearningSourceType.WORK]: 'Work',
  [LearningSourceType.CONVERSATION]: 'Conversation',
  [LearningSourceType.DOCUMENTATION]: 'Documentation',
  [LearningSourceType.CONFERENCE]: 'Conference',
  [LearningSourceType.OTHER]: 'Other',
};

export default function LearningHubPage() {
  const { currentUser } = useAuth();
  const { entries, loading: entriesLoading } = useLearningEntries();
  const { stats } = useLearningStats();
  const { totalDue } = useSpacedRepetition();
  const { captures, createCapture } = useQuickCapture();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<LearningSourceType | ''>('');
  const [quickCaptureText, setQuickCaptureText] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);

  const handleQuickCapture = async () => {
    if (!quickCaptureText.trim()) return;
    setIsCapturing(true);
    try {
      await createCapture({ content: quickCaptureText });
      setQuickCaptureText('');
    } catch (err) {
      console.error('Failed to create quick capture:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      !searchQuery ||
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSource = !selectedSource || entry.sourceType === selectedSource;
    return matchesSearch && matchesSource;
  });

  if (!currentUser || currentUser.isAnonymous) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', padding: '48px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <Brain size={64} style={{ color: '#0f766e', marginBottom: '16px' }} />
          <h1 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '8px' }}>Learning Hub</h1>
          <p style={{ color: 'var(--muted-foreground)', marginBottom: '24px' }}>
            Sign in to access your personal learning hub, create notes, build your dictionary, and
            track your progress.
          </p>
          <Link
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: '#0f766e',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '500',
            }}
          >
            Sign In to Continue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', paddingTop: '8px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '600', color: 'var(--foreground)', marginBottom: '4px' }}>
              Learning Hub
            </h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '15px' }}>
              Capture, organize, and master knowledge from any source
            </p>
          </div>
          <Link
            href="/study/learning/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              backgroundColor: '#0f766e',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '500',
              fontSize: '14px',
            }}
          >
            <Plus size={18} />
            New Entry
          </Link>
        </div>

        {/* Quick Capture */}
        <div
          style={{
            backgroundColor: 'var(--muted)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              placeholder="Quick capture: jot down an idea, link, or note..."
              value={quickCaptureText}
              onChange={(e) => setQuickCaptureText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuickCapture()}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)',
              }}
            />
            <button
              onClick={handleQuickCapture}
              disabled={isCapturing || !quickCaptureText.trim()}
              style={{
                padding: '12px 20px',
                backgroundColor: quickCaptureText.trim() ? '#0f766e' : 'var(--border)',
                color: quickCaptureText.trim() ? 'white' : 'var(--muted-foreground)',
                border: 'none',
                borderRadius: '8px',
                cursor: quickCaptureText.trim() ? 'pointer' : 'not-allowed',
                fontWeight: '500',
                fontSize: '14px',
              }}
            >
              <Zap size={16} />
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <StatCard
            icon={<FileText size={20} />}
            label="Learning Entries"
            value={stats?.totalEntries || 0}
            color="#0f766e"
          />
          <StatCard
            icon={<BookMarked size={20} />}
            label="Dictionary Terms"
            value={stats?.totalTerms || 0}
            color="#10b981"
          />
          <StatCard
            icon={<Layers size={20} />}
            label="Flashcards"
            value={stats?.totalFlashcards || 0}
            color="#f59e0b"
          />
          <Link href="/study/learning/review" style={{ textDecoration: 'none' }}>
            <StatCard
              icon={<Brain size={20} />}
              label="Due for Review"
              value={totalDue || 0}
              color="#ef4444"
              clickable
            />
          </Link>
          <StatCard
            icon={<Flame size={20} />}
            label="Current Streak"
            value={`${stats?.currentStreak || 0} days`}
            color="#8b5cf6"
          />
        </div>

        {/* Quick Actions */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <QuickActionCard
            href="/study/learning/daily"
            icon={<Clock size={24} />}
            title="Today's Plan"
            description="AI-generated daily learning"
            color="#06b6d4"
          />
          <QuickActionCard
            href="/study/learning/review"
            icon={<Brain size={24} />}
            title="Start Review Session"
            description={`${totalDue || 0} items due for review`}
            color="#0f766e"
          />
          <QuickActionCard
            href="/study/learning/dictionary"
            icon={<BookMarked size={24} />}
            title="Browse Dictionary"
            description={`${stats?.totalTerms || 0} terms defined`}
            color="#10b981"
          />
          <QuickActionCard
            href="/study/learning/flashcards"
            icon={<Layers size={24} />}
            title="Flashcard Decks"
            description="Study with spaced repetition"
            color="#f59e0b"
          />
          <QuickActionCard
            href="/study/learning/paths"
            icon={<Target size={24} />}
            title="Learning Paths"
            description="AI-generated goal-based learning"
            color="#ec4899"
          />
          <QuickActionCard
            href="/study"
            icon={<BookOpen size={24} />}
            title="Study Articles"
            description="AI-generated learning content"
            color="#8b5cf6"
          />
        </div>

        {/* Search and Filter */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search
              size={18}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }}
            />
            <input
              type="text"
              placeholder="Search entries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)',
              }}
            />
          </div>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value as LearningSourceType | '')}
            style={{
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              minWidth: '150px',
            }}
          >
            <option value="">All Sources</option>
            {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Learning Entries List */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: 'var(--foreground)' }}>
            Recent Learning Entries
          </h2>

          {entriesLoading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading...</div>
          ) : filteredEntries.length === 0 ? (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                backgroundColor: 'var(--muted)',
                borderRadius: '8px',
                border: '1px dashed var(--border)',
              }}
            >
              <FileText size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
              <p style={{ color: 'var(--muted-foreground)', marginBottom: '16px' }}>No learning entries yet</p>
              <Link
                href="/study/learning/new"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#0f766e',
                  color: 'white',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: '500',
                  fontSize: '14px',
                }}
              >
                <Plus size={18} />
                Create Your First Entry
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredEntries.slice(0, 10).map((entry) => (
                <Link
                  key={entry.id}
                  href={`/study/learning/entries/${entry.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    style={{
                      padding: '16px',
                      backgroundColor: 'var(--card)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#0f766e';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 118, 110, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: 'color-mix(in srgb, var(--background) 82%, #0f766e 18%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#0f766e',
                          flexShrink: 0,
                        }}
                      >
                        {SOURCE_TYPE_ICONS[entry.sourceType]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <h3
                            style={{
                              fontSize: '15px',
                              fontWeight: '600',
                              color: 'var(--foreground)',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {entry.title}
                          </h3>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              backgroundColor: 'var(--muted)',
                              borderRadius: '4px',
                              color: 'var(--muted-foreground)',
                            }}
                          >
                            {SOURCE_TYPE_LABELS[entry.sourceType]}
                          </span>
                        </div>
                        {entry.summary && (
                          <p
                            style={{
                              fontSize: '13px',
                              color: 'var(--muted-foreground)',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {entry.summary}
                          </p>
                        )}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            marginTop: '8px',
                            fontSize: '12px',
                            color: 'var(--muted-foreground)',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} />
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </span>
                          {entry.tags.length > 0 && (
                            <span>
                              {entry.tags.slice(0, 3).join(', ')}
                              {entry.tags.length > 3 && ` +${entry.tags.length - 3}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={20} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {filteredEntries.length > 10 && (
            <Link
              href="/study/learning/entries"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '12px',
                marginTop: '16px',
                color: '#0f766e',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '14px',
              }}
            >
              View All Entries ({filteredEntries.length})
            </Link>
          )}
        </div>

        {/* Pending Quick Captures */}
        {captures.length > 0 && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: 'var(--foreground)' }}>
              Pending Quick Captures ({captures.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {captures.slice(0, 5).map((capture) => (
                <div
                  key={capture.id}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: 'color-mix(in srgb, var(--background) 84%, #f59e0b 16%)',
                    borderRadius: '8px',
                    border: '1px solid color-mix(in srgb, var(--border) 70%, #f59e0b 30%)',
                    fontSize: '14px',
                    color: 'var(--foreground)',
                  }}
                >
                  {capture.content}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  clickable,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  clickable?: boolean;
}) {
  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: 'var(--card)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (clickable) {
          e.currentTarget.style.borderColor = color;
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.transform = 'none';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ color }}>{icon}</div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--foreground)' }}>{value}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  href,
  icon,
  title,
  description,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          padding: '20px',
          backgroundColor: 'var(--card)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = color;
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div style={{ color, marginBottom: '12px' }}>{icon}</div>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--foreground)', margin: '0 0 4px 0' }}>
          {title}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>{description}</p>
      </div>
    </Link>
  );
}
