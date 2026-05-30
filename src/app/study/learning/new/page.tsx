'use client';

import { useLearningEntries,useStudyCategories } from '@/hooks/useStudy';
import { useAuth } from '@/providers/AuthProvider';
import { LearningSource,LearningSourceType } from '@/types/study';
import {
ArrowLeft,
Book,
BookOpen,
Briefcase,
Code,
FileText,
Globe,
Loader2,
MessageCircle,
Mic,
MoreHorizontal,
Plus,
Save,
Sparkles,
Video,
X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

const SOURCE_TYPES = [
  { value: LearningSourceType.BOOK, label: 'Book', icon: Book },
  { value: LearningSourceType.YOUTUBE, label: 'YouTube', icon: Video },
  { value: LearningSourceType.ARTICLE, label: 'Article', icon: FileText },
  { value: LearningSourceType.COURSE, label: 'Course', icon: BookOpen },
  { value: LearningSourceType.PODCAST, label: 'Podcast', icon: Mic },
  { value: LearningSourceType.WORK, label: 'Work', icon: Briefcase },
  { value: LearningSourceType.CONVERSATION, label: 'Conversation', icon: MessageCircle },
  { value: LearningSourceType.DOCUMENTATION, label: 'Documentation', icon: Code },
  { value: LearningSourceType.CONFERENCE, label: 'Conference', icon: Globe },
  { value: LearningSourceType.OTHER, label: 'Other', icon: MoreHorizontal },
];

export default function NewLearningEntryPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { createEntry } = useLearningEntries();
  const { categories } = useStudyCategories();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceType, setSourceType] = useState<LearningSourceType>(LearningSourceType.BOOK);
  const [sourceDetails, setSourceDetails] = useState<LearningSource>({ type: LearningSourceType.BOOK });
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>([]);
  const [takeawayInput, setTakeawayInput] = useState('');

  const [generateFlashcardsOption, setGenerateFlashcardsOption] = useState(true);
  const [generateSummaryOption, setGenerateSummaryOption] = useState(true);
  const [extractTermsOption, setExtractTermsOption] = useState(true);

  const [saving, setSaving] = useState(false);

  const handleSourceTypeChange = (type: LearningSourceType) => {
    setSourceType(type);
    setSourceDetails({ type });
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleAddTakeaway = () => {
    if (takeawayInput.trim()) {
      setKeyTakeaways([...keyTakeaways, takeawayInput.trim()]);
      setTakeawayInput('');
    }
  };

  const handleRemoveTakeaway = (index: number) => {
    setKeyTakeaways(keyTakeaways.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required');
      return;
    }

    setSaving(true);
    try {
      await createEntry({
        title: title.trim(),
        content: content.trim(),
        sourceType,
        sourceDetails,
        categoryId: categoryId || undefined,
        tags,
        keyTakeaways,
        generateFlashcards: generateFlashcardsOption,
        generateSummary: generateSummaryOption,
        extractTerms: extractTermsOption,
      });

      toast.success('Learning entry created!');
      router.push('/study/learning');
    } catch (err) {
      console.error('Failed to create entry:', err);
      toast.error('Failed to create learning entry');
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser || currentUser.isAnonymous) {
    return (
      <div style={{ minHeight: '100vh', padding: '48px 16px', textAlign: 'center' }}>
        <p>Please sign in to create learning entries.</p>
        <Link href="/login">Sign In</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingTop: '8px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <Link
            href="/study/learning"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: '#6b7280',
              textDecoration: 'none',
              fontSize: '14px',
              marginBottom: '16px',
            }}
          >
            <ArrowLeft size={16} />
            Back to Learning Hub
          </Link>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', margin: 0 }}>
            New Learning Entry
          </h1>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Source Type Selection */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0',
            }}
          >
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
              Source Type
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {SOURCE_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleSourceTypeChange(value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: sourceType === value ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    backgroundColor: sourceType === value ? '#eef2ff' : 'white',
                    color: sourceType === value ? '#6366f1' : '#374151',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Source Details */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0',
            }}
          >
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
              Source Details
            </label>
            {renderSourceFields()}
          </div>

          {/* Title & Content */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What did you learn?"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '15px',
                  outline: 'none',
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Notes / Content * (Markdown supported)
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your notes, key concepts, examples, code snippets..."
                rows={12}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  resize: 'vertical',
                }}
                required
              />
            </div>
          </div>

          {/* Key Takeaways */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0',
            }}
          >
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
              Key Takeaways
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                value={takeawayInput}
                onChange={(e) => setTakeawayInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTakeaway())}
                placeholder="Add a key takeaway..."
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleAddTakeaway}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            {keyTakeaways.length > 0 && (
              <ul style={{ margin: 0, padding: '0 0 0 20px' }}>
                {keyTakeaways.map((takeaway, index) => (
                  <li key={index} style={{ fontSize: '14px', color: '#374151', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {takeaway}
                    <button
                      type="button"
                      onClick={() => handleRemoveTakeaway(index)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Category & Tags */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: 'white',
                }}
              >
                <option value="">Select a category (optional)</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Tags
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add a tag..."
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        backgroundColor: '#eef2ff',
                        color: '#6366f1',
                        borderRadius: '16px',
                        fontSize: '13px',
                      }}
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 0 }}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* AI Features */}
          <div
            style={{
              backgroundColor: '#f0fdf4',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              border: '1px solid #bbf7d0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Sparkles size={18} style={{ color: '#16a34a' }} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#166534' }}>AI-Powered Features</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={generateSummaryOption}
                  onChange={(e) => setGenerateSummaryOption(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>Generate AI summary</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={generateFlashcardsOption}
                  onChange={(e) => setGenerateFlashcardsOption(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>Generate flashcards for spaced repetition</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={extractTermsOption}
                  onChange={(e) => setExtractTermsOption(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>Extract terms for dictionary</span>
              </label>
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Link
              href="/study/learning"
              style={{
                padding: '12px 24px',
                backgroundColor: 'white',
                color: '#374151',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '14px',
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || !title.trim() || !content.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                backgroundColor: saving ? '#9ca3af' : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                fontSize: '14px',
              }}
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  function renderSourceFields() {
    const fieldStyle = {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '14px',
      outline: 'none',
      marginBottom: '12px',
    };

    const labelStyle = {
      display: 'block',
      fontSize: '13px',
      color: '#6b7280',
      marginBottom: '4px',
    };

    switch (sourceType) {
      case LearningSourceType.BOOK:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Book Title</label>
              <input
                type="text"
                placeholder="Book Title"
                value={sourceDetails.bookTitle || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, bookTitle: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Author</label>
              <input
                type="text"
                placeholder="Author"
                value={sourceDetails.bookAuthor || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, bookAuthor: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Chapter</label>
              <input
                type="text"
                placeholder="Chapter"
                value={sourceDetails.chapter || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, chapter: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Page Numbers</label>
              <input
                type="text"
                placeholder="Page Numbers"
                value={sourceDetails.pageNumbers || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, pageNumbers: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </div>
        );

      case LearningSourceType.YOUTUBE:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Video URL</label>
              <input
                type="url"
                placeholder="https://youtube.com/..."
                value={sourceDetails.videoUrl || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, videoUrl: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Video Title</label>
              <input
                type="text"
                placeholder="Video Title"
                value={sourceDetails.videoTitle || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, videoTitle: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Channel Name</label>
              <input
                type="text"
                placeholder="Channel Name"
                value={sourceDetails.channelName || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, channelName: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Timestamp</label>
              <input
                type="text"
                placeholder="e.g., 12:34"
                value={sourceDetails.timestamp || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, timestamp: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </div>
        );

      case LearningSourceType.ARTICLE:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Article URL</label>
              <input
                type="url"
                placeholder="https://..."
                value={sourceDetails.articleUrl || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, articleUrl: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Article Title</label>
              <input
                type="text"
                placeholder="Article Title"
                value={sourceDetails.articleTitle || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, articleTitle: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Author</label>
              <input
                type="text"
                placeholder="Author"
                value={sourceDetails.articleAuthor || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, articleAuthor: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </div>
        );

      case LearningSourceType.COURSE:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Course Name</label>
              <input
                type="text"
                placeholder="Course Name"
                value={sourceDetails.courseName || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, courseName: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Provider (Udemy, Coursera, etc.)</label>
              <input
                type="text"
                placeholder="Provider"
                value={sourceDetails.courseProvider || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, courseProvider: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Lesson Name</label>
              <input
                type="text"
                placeholder="Lesson Name"
                value={sourceDetails.lessonName || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, lessonName: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Course URL</label>
              <input
                type="url"
                placeholder="https://..."
                value={sourceDetails.courseUrl || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, courseUrl: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </div>
        );

      case LearningSourceType.WORK:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Project Name</label>
              <input
                type="text"
                placeholder="Project Name"
                value={sourceDetails.projectName || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, projectName: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Task Description</label>
              <input
                type="text"
                placeholder="Task Description"
                value={sourceDetails.taskDescription || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, taskDescription: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Team Context</label>
              <input
                type="text"
                placeholder="Team Context"
                value={sourceDetails.teamContext || ''}
                onChange={(e) => setSourceDetails({ ...sourceDetails, teamContext: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </div>
        );

      default:
        return (
          <div>
            <label style={labelStyle}>Notes</label>
            <input
              type="text"
              placeholder="Additional source information..."
              value={sourceDetails.notes || ''}
              onChange={(e) => setSourceDetails({ ...sourceDetails, notes: e.target.value })}
              style={fieldStyle}
            />
          </div>
        );
    }
  }
}
