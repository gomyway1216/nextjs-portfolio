'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useStudyArticle,
  useArticleNotes,
  useArticleChat,
  useStudyCategories,
  useStudyTopics,
  useStudyQuizzes,
} from '@/hooks/useStudy';
import { markArticleAsRead } from '@/services/studyService';
import { useAuth } from '@/providers/AuthProvider';
import { QuizDifficulty, ArticleNote, ChatMessage } from '@/types/study';
import {
  ArrowLeft,
  Clock,
  BookOpen,
  MessageSquare,
  StickyNote,
  Check,
  Send,
  Loader2,
  ExternalLink,
  Edit3,
  Trash2,
  Copy,
  CheckCircle,
  Menu,
  X,
} from 'lucide-react';
// Prism.js for code highlighting
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';

// Simple markdown renderer for chat messages
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = keyCounter++;

    // Code block (```)
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={key} style={{ backgroundColor: '#1f2937', color: '#e5e7eb', padding: '12px', borderRadius: '8px', overflow: 'auto', margin: '12px 0', fontSize: '13px' }}>
          <code className={lang ? `language-${lang}` : undefined}>{codeLines.join('\n')}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={key} style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginTop: '16px', marginBottom: '8px' }}>{renderInlineMarkdown(line.slice(4))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={key} style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginTop: '20px', marginBottom: '12px' }}>{renderInlineMarkdown(line.slice(3))}</h2>);
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={key} style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginTop: '24px', marginBottom: '14px' }}>{renderInlineMarkdown(line.slice(2))}</h1>);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={key} style={{ borderLeft: '3px solid #10a37f', paddingLeft: '12px', margin: '12px 0', color: '#6b7280', fontStyle: 'italic' }}>
          {renderInlineMarkdown(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^[\s]*[-*]\s/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*]\s/)) {
        const itemKey = keyCounter++;
        const itemText = lines[i].replace(/^[\s]*[-*]\s/, '');
        listItems.push(<li key={itemKey} style={{ marginBottom: '4px', fontSize: '14px' }}>{renderInlineMarkdown(itemText)}</li>);
        i++;
      }
      elements.push(<ul key={key} style={{ paddingLeft: '20px', margin: '8px 0' }}>{listItems}</ul>);
      continue;
    }

    // Ordered list
    if (line.match(/^[\s]*\d+\.\s/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*\d+\.\s/)) {
        const itemKey = keyCounter++;
        const itemText = lines[i].replace(/^[\s]*\d+\.\s/, '');
        listItems.push(<li key={itemKey} style={{ marginBottom: '4px', fontSize: '14px' }}>{renderInlineMarkdown(itemText)}</li>);
        i++;
      }
      elements.push(<ol key={key} style={{ paddingLeft: '20px', margin: '8px 0' }}>{listItems}</ol>);
      continue;
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableRows.push(lines[i]);
        i++;
      }
      if (tableRows.length >= 2) {
        const headerRow = tableRows[0].split('|').filter(cell => cell.trim());
        const dataRows = tableRows.slice(2).map(row => row.split('|').filter(cell => cell.trim()));
        elements.push(
          <div key={key} style={{ overflowX: 'auto', margin: '12px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {headerRow.map((cell, idx) => (
                    <th key={idx} style={{ backgroundColor: '#f3f4f6', padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'left', fontWeight: '600' }}>{cell.trim()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} style={{ padding: '8px 12px', border: '1px solid #e5e7eb' }}>{cell.trim()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(<p key={key} style={{ lineHeight: 1.7, margin: '8px 0', fontSize: '14px' }}>{renderInlineMarkdown(line)}</p>);
    i++;
  }

  return elements;
}

// Render inline markdown (bold, italic, code, links)
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(<code key={keyCounter++} style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace' }}>{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={keyCounter++} style={{ fontWeight: '600', color: '#111827' }}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<em key={keyCounter++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(<a key={keyCounter++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#10a37f', textDecoration: 'underline' }}>{linkMatch[1]}</a>);
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Regular text - find next special char or end
    const nextSpecial = remaining.search(/[`*\[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Special char at start but no pattern matched, treat as text
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts.length === 1 ? parts[0] : parts;
}

export default function StudyArticlePage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useAuth();
  const articleId = Array.isArray(params.id) ? params.id[0] : params.id || '';

  // State
  const [activeTab, setActiveTab] = useState<'article' | 'chat' | 'notes'>('article');
  const [chatInput, setChatInput] = useState('');
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [hasMarkedRead, setHasMarkedRead] = useState(false);
  const [readStartTime] = useState(Date.now());
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Data hooks
  const { article, loading: articleLoading, error: articleError } = useStudyArticle(articleId);
  const { notes, createNote, updateNote, deleteNote, loading: notesLoading } = useArticleNotes(articleId);
  const { chat, sendMessage, generateSummary, loading: chatLoading } = useArticleChat(articleId);
  const { categories } = useStudyCategories();
  const { topics } = useStudyTopics();
  const { quizzes } = useStudyQuizzes({ articleId });

  // Get category and topic info
  const category = categories.find((c) => c.id === article?.categoryId);
  const topic = topics.find((t) => t.id === article?.topicId);

  // Syntax highlighting
  useEffect(() => {
    if (article) {
      Prism.highlightAll();
    }
  }, [article, activeTab]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat?.messages]);

  // Mark as read when leaving page
  useEffect(() => {
    return () => {
      if (articleId && !hasMarkedRead) {
        const timeSpent = Math.round((Date.now() - readStartTime) / 1000);
        if (timeSpent > 30) {
          markArticleAsRead(articleId, timeSpent).catch(console.error);
        }
      }
    };
  }, [articleId, hasMarkedRead, readStartTime]);

  const handleMarkAsRead = async () => {
    if (!articleId || hasMarkedRead) return;
    const timeSpent = Math.round((Date.now() - readStartTime) / 1000);
    try {
      await markArticleAsRead(articleId, timeSpent);
      setHasMarkedRead(true);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || isSendingChat) return;
    setIsSendingChat(true);
    try {
      await sendMessage(chatInput);
      setChatInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleGenerateSummary = async () => {
    try {
      await generateSummary();
    } catch (error) {
      console.error('Failed to generate summary:', error);
    }
  };

  const handleCreateNote = async () => {
    if (!newNote.trim()) return;
    try {
      await createNote({ content: newNote });
      setNewNote('');
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editNoteContent.trim()) return;
    try {
      await updateNote(noteId, editNoteContent);
      setEditingNoteId(null);
      setEditNoteContent('');
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      await deleteNote(noteId);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const handleCopyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
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

  if (articleLoading) {
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
          <p style={{ color: '#6b7280', fontSize: '15px' }}>Loading article...</p>
        </div>
      </div>
    );
  }

  if (articleError || !article) {
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
            Article Not Found
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '24px', lineHeight: 1.6 }}>
            {articleError?.message || 'The article you are looking for does not exist.'}
          </p>
          <button
            onClick={() => router.push('/study')}
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
            Back to Study
          </button>
        </div>
      </div>
    );
  }

  const diffStyle = getDifficultyStyle(article.difficulty);

  const SidebarContent = () => (
    <>
      {/* Article Info Card */}
      <div style={{
        backgroundColor: '#f9fafb',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px' }}>Article Info</h3>
        <dl style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { label: 'AI Provider', value: article.aiProvider },
            { label: 'Model', value: article.aiModel },
            { label: 'Published', value: article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Not published' },
            { label: 'Views', value: article.viewCount.toString() },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt style={{ color: '#6b7280', fontSize: '13px' }}>{item.label}</dt>
              <dd style={{ color: '#374151', fontSize: '13px', textTransform: 'capitalize' }}>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Quiz Card */}
      {quizzes.length > 0 && (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px' }}>Quizzes</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {quizzes.map((quiz) => (
              <div key={quiz.id} style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px',
              }}>
                <h4 style={{ fontWeight: '500', color: '#374151', marginBottom: '4px', fontSize: '13px' }}>
                  {quiz.title}
                </h4>
                <p style={{ color: '#6b7280', fontSize: '12px', marginBottom: '10px' }}>
                  {quiz.questions.length} questions • {quiz.difficulty}
                </p>
                <button
                  onClick={() => router.push(`/study/quiz/${quiz.id}`)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    backgroundColor: '#10a37f',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '13px',
                  }}
                >
                  Take Quiz
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table of Contents */}
      <div style={{
        backgroundColor: '#f9fafb',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px' }}>Table of Contents</h3>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <a href="#introduction" style={{ color: '#10a37f', fontSize: '13px', padding: '6px 0', textDecoration: 'none' }}>
            Introduction
          </a>
          {article.sections.map((section, index) => (
            <a
              key={section.id}
              href={`#section-${section.id}`}
              style={{
                color: '#6b7280',
                fontSize: '13px',
                padding: '6px 0 6px 12px',
                textDecoration: 'none',
                borderLeft: '2px solid #e5e7eb',
              }}
            >
              {index + 1}. {section.title}
            </a>
          ))}
          <a href="#conclusion" style={{ color: '#10a37f', fontSize: '13px', padding: '6px 0', textDecoration: 'none' }}>
            Conclusion
          </a>
          <a href="#takeaways" style={{ color: '#10a37f', fontSize: '13px', padding: '6px 0', textDecoration: 'none' }}>
            Key Takeaways
          </a>
        </nav>
      </div>

      {/* Actions */}
      <div style={{
        backgroundColor: '#f9fafb',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '12px', fontSize: '14px' }}>Actions</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => { setActiveTab('notes'); setShowMobileSidebar(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            <StickyNote size={16} />
            Add Note
          </button>
          <button
            onClick={() => { setActiveTab('chat'); setShowMobileSidebar(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            <MessageSquare size={16} />
            Ask Question
          </button>
          {currentUser && (
            <button
              onClick={() => router.push(`/study/article/${articleId}/edit`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              <Edit3 size={16} />
              Edit Article
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      paddingTop: '64px',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: '64px',
        zIndex: 40,
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
              <button
                onClick={() => router.push('/study')}
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
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                  {category && (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '500',
                      backgroundColor: '#f3f4f6',
                      color: '#6b7280',
                    }}>
                      {category.name}
                    </span>
                  )}
                  {topic && (
                    <span style={{ color: '#9ca3af', fontSize: '12px', display: 'none' }} className="sm-show">{topic.name}</span>
                  )}
                </div>
                <h1 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#111827',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {article.title}
                </h1>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '500',
                backgroundColor: diffStyle.bg,
                color: diffStyle.text,
                border: `1px solid ${diffStyle.border}`,
                display: 'none',
              }} className="sm-show">
                {article.difficulty}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280', fontSize: '12px' }} className="sm-show">
                <Clock size={14} />
                {article.readingTimeMinutes} min
              </div>
              {!hasMarkedRead ? (
                <button
                  onClick={handleMarkAsRead}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#10a37f',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '12px',
                  }}
                >
                  <Check size={14} />
                  <span className="sm-show">Mark Read</span>
                </button>
              ) : (
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#10a37f',
                  fontSize: '12px',
                  fontWeight: '500',
                }}>
                  <CheckCircle size={14} />
                  <span className="sm-show">Read</span>
                </span>
              )}
              <button
                onClick={() => setShowMobileSidebar(true)}
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
                className="lg-hide"
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

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', gap: '32px' }}>
          {/* Main Content Area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Tab Navigation */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex',
                borderBottom: '1px solid #e5e7eb',
                overflowX: 'auto',
              }}>
                {[
                  { id: 'article', label: 'Article', icon: BookOpen },
                  { id: 'chat', label: 'Chat', icon: MessageSquare, count: chat?.messages?.length },
                  { id: 'notes', label: 'Notes', icon: StickyNote, count: notes.length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as 'article' | 'chat' | 'notes')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '14px 20px',
                      backgroundColor: activeTab === tab.id ? '#f9fafb' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === tab.id ? '2px solid #10a37f' : '2px solid transparent',
                      color: activeTab === tab.id ? '#10a37f' : '#6b7280',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '14px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        backgroundColor: activeTab === tab.id ? '#d1fae5' : '#f3f4f6',
                        color: activeTab === tab.id ? '#065f46' : '#6b7280',
                      }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ padding: '24px' }}>
                {activeTab === 'article' && (
                  <article style={{ maxWidth: '720px', margin: '0 auto' }}>
                    {/* Summary */}
                    <div style={{
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '8px',
                      padding: '16px',
                      marginBottom: '32px',
                    }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '8px' }}>
                        Summary
                      </h3>
                      <p style={{ color: '#15803d', lineHeight: 1.7, fontSize: '14px' }}>{article.summary}</p>
                    </div>

                    {/* Introduction */}
                    <section id="introduction" style={{ marginBottom: '40px' }}>
                      <h2 style={{ fontSize: '22px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
                        Introduction
                      </h2>
                      <div style={{ color: '#374151', lineHeight: 1.8, fontSize: '15px', whiteSpace: 'pre-wrap' }}>
                        {article.introduction}
                      </div>
                    </section>

                    {/* Sections */}
                    {article.sections.map((section, index) => (
                      <section key={section.id} id={`section-${section.id}`} style={{ marginBottom: '40px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
                          {index + 1}. {section.title}
                        </h2>
                        <div style={{ color: '#374151', lineHeight: 1.8, fontSize: '15px', whiteSpace: 'pre-wrap', marginBottom: '20px' }}>
                          {section.content}
                        </div>

                        {/* Code Examples */}
                        {section.codeExamples?.map((example) => (
                          <div key={example.id} style={{ marginBottom: '20px' }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              backgroundColor: '#1f2937',
                              borderRadius: '8px 8px 0 0',
                              padding: '8px 12px',
                            }}>
                              <span style={{ color: '#9ca3af', fontSize: '12px', fontWeight: '500' }}>
                                {example.language}
                              </span>
                              <button
                                onClick={() => handleCopyCode(example.code, example.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  backgroundColor: 'transparent',
                                  color: copiedCode === example.id ? '#10b981' : '#9ca3af',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                }}
                              >
                                {copiedCode === example.id ? (
                                  <>
                                    <Check size={12} />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} />
                                    Copy
                                  </>
                                )}
                              </button>
                            </div>
                            <pre style={{
                              margin: 0,
                              borderRadius: '0 0 8px 8px',
                              backgroundColor: '#111827',
                              padding: '16px',
                              overflow: 'auto',
                              fontSize: '13px',
                            }}>
                              <code className={`language-${example.language}`}>{example.code}</code>
                            </pre>
                            {example.explanation && (
                              <p style={{
                                color: '#6b7280',
                                fontSize: '13px',
                                marginTop: '12px',
                                fontStyle: 'italic',
                                paddingLeft: '12px',
                                borderLeft: '3px solid #e5e7eb',
                              }}>
                                {example.explanation}
                              </p>
                            )}
                          </div>
                        ))}

                        {/* External Links */}
                        {section.externalLinks && section.externalLinks.length > 0 && (
                          <div style={{
                            backgroundColor: '#f9fafb',
                            borderRadius: '8px',
                            padding: '16px',
                            marginTop: '20px',
                          }}>
                            <h4 style={{ fontWeight: '600', color: '#374151', marginBottom: '12px', fontSize: '14px' }}>
                              Related Resources
                            </h4>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                              {section.externalLinks.map((link, linkIndex) => (
                                <li key={linkIndex} style={{ marginBottom: '10px' }}>
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      color: '#10a37f',
                                      textDecoration: 'none',
                                      fontSize: '14px',
                                    }}
                                  >
                                    <span style={{
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      backgroundColor: '#e5e7eb',
                                      color: '#6b7280',
                                      textTransform: 'uppercase',
                                    }}>
                                      {link.type}
                                    </span>
                                    {link.title}
                                    <ExternalLink size={12} />
                                  </a>
                                  <p style={{ color: '#6b7280', fontSize: '12px', marginLeft: '0', marginTop: '4px' }}>
                                    {link.description}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </section>
                    ))}

                    {/* Conclusion */}
                    <section id="conclusion" style={{ marginBottom: '40px' }}>
                      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
                        Conclusion
                      </h2>
                      <div style={{ color: '#374151', lineHeight: 1.8, fontSize: '15px', whiteSpace: 'pre-wrap' }}>
                        {article.conclusion}
                      </div>
                    </section>

                    {/* Key Takeaways */}
                    <section id="takeaways" style={{
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '8px',
                      padding: '20px',
                      marginBottom: '32px',
                    }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e40af', marginBottom: '16px' }}>
                        Key Takeaways
                      </h3>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {article.keyTakeaways.map((takeaway, index) => (
                          <li key={index} style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            color: '#1e3a8a',
                            marginBottom: '10px',
                            fontSize: '14px',
                          }}>
                            <CheckCircle size={18} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span style={{ lineHeight: 1.6 }}>{takeaway}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    {/* Tags */}
                    {article.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '24px' }}>
                        {article.tags.map((tag) => (
                          <span key={tag} style={{
                            padding: '4px 12px',
                            borderRadius: '16px',
                            fontSize: '12px',
                            backgroundColor: '#f3f4f6',
                            color: '#6b7280',
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                )}

                {activeTab === 'chat' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '500px', maxWidth: '720px', margin: '0 auto' }}>
                    {/* Chat Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
                      {!chat?.messages || chat.messages.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                          <MessageSquare size={40} color="#d1d5db" style={{ marginBottom: '12px' }} />
                          <p style={{ color: '#6b7280', fontSize: '14px' }}>No messages yet. Ask a question about this article!</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {chat.messages.map((message: ChatMessage) => (
                            <div
                              key={message.id}
                              style={{
                                display: 'flex',
                                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                              }}
                            >
                              <div style={{
                                maxWidth: message.role === 'user' ? '85%' : '100%',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                backgroundColor: message.role === 'user' ? '#10a37f' : '#f9fafb',
                                color: message.role === 'user' ? '#ffffff' : '#374151',
                                border: message.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                              }}>
                                {message.role === 'user' ? (
                                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0, fontSize: '14px' }}>
                                    {message.content}
                                  </p>
                                ) : (
                                  <div className="chat-markdown">
                                    {renderMarkdown(message.content)}
                                  </div>
                                )}
                                <span style={{
                                  display: 'block',
                                  fontSize: '10px',
                                  color: message.role === 'user' ? 'rgba(255,255,255,0.7)' : '#9ca3af',
                                  marginTop: '8px',
                                }}>
                                  {new Date(message.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          ))}
                          <div ref={chatEndRef} />
                        </div>
                      )}
                    </div>

                    {/* Chat Input */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                        placeholder="Ask a question..."
                        disabled={isSendingChat}
                        style={{
                          flex: 1,
                          padding: '12px 16px',
                          borderRadius: '8px',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#ffffff',
                          color: '#111827',
                          fontSize: '14px',
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={handleSendChat}
                        disabled={isSendingChat || !chatInput.trim()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          backgroundColor: '#10a37f',
                          color: '#ffffff',
                          border: 'none',
                          cursor: isSendingChat || !chatInput.trim() ? 'not-allowed' : 'pointer',
                          opacity: isSendingChat || !chatInput.trim() ? 0.5 : 1,
                        }}
                      >
                        {isSendingChat ? (
                          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <Send size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                    {/* Add Note */}
                    <div style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '16px',
                      marginBottom: '20px',
                    }}>
                      <h3 style={{ fontWeight: '500', color: '#374151', marginBottom: '10px', fontSize: '14px' }}>Add a Note</h3>
                      <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Write your note here..."
                        style={{
                          width: '100%',
                          minHeight: '80px',
                          padding: '12px',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#ffffff',
                          color: '#111827',
                          fontSize: '14px',
                          outline: 'none',
                          resize: 'vertical',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button
                          onClick={handleCreateNote}
                          disabled={!newNote.trim() || notesLoading}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            backgroundColor: '#10a37f',
                            color: '#ffffff',
                            border: 'none',
                            cursor: !newNote.trim() || notesLoading ? 'not-allowed' : 'pointer',
                            opacity: !newNote.trim() || notesLoading ? 0.5 : 1,
                            fontWeight: '500',
                            fontSize: '13px',
                          }}
                        >
                          Add Note
                        </button>
                      </div>
                    </div>

                    {/* Notes List */}
                    {notes.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                        <StickyNote size={40} color="#d1d5db" style={{ marginBottom: '12px' }} />
                        <p style={{ color: '#6b7280', fontSize: '14px' }}>No notes yet. Start taking notes as you read!</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {notes.map((note: ArticleNote) => (
                          <div key={note.id} style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '16px',
                          }}>
                            {editingNoteId === note.id ? (
                              <>
                                <textarea
                                  value={editNoteContent}
                                  onChange={(e) => setEditNoteContent(e.target.value)}
                                  style={{
                                    width: '100%',
                                    minHeight: '80px',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: '#ffffff',
                                    color: '#111827',
                                    fontSize: '14px',
                                    outline: 'none',
                                    resize: 'vertical',
                                  }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                                  <button
                                    onClick={() => setEditingNoteId(null)}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: '6px',
                                      border: '1px solid #d1d5db',
                                      backgroundColor: '#ffffff',
                                      color: '#374151',
                                      cursor: 'pointer',
                                      fontSize: '13px',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleUpdateNote(note.id)}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: '6px',
                                      backgroundColor: '#10a37f',
                                      color: '#ffffff',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontSize: '13px',
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p style={{ color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '14px' }}>
                                  {note.content}
                                </p>
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginTop: '12px',
                                  paddingTop: '10px',
                                  borderTop: '1px solid #f3f4f6',
                                }}>
                                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                                    {new Date(note.createdAt).toLocaleDateString()}
                                  </span>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                      onClick={() => {
                                        setEditingNoteId(note.id);
                                        setEditNoteContent(note.content);
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#10a37f',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                      }}
                                    >
                                      <Edit3 size={12} />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteNote(note.id)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                      }}
                                    >
                                      <Trash2 size={12} />
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Sidebar */}
          <aside style={{ width: '280px', flexShrink: 0 }} className="lg-show">
            <div style={{ position: 'sticky', top: '140px' }}>
              <SidebarContent />
            </div>
          </aside>
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
        .lg-hide { display: flex; }
        @media (min-width: 640px) {
          .sm-show { display: flex; }
        }
        @media (min-width: 1024px) {
          .lg-show { display: block; }
          .lg-hide { display: none; }
        }
      `}</style>
    </div>
  );
}
