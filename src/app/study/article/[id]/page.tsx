'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
  ChevronRight,
  Edit3,
  Trash2,
  Copy,
  CheckCircle,
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

  if (articleLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #581c87 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: '80px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={48} color="#a855f7" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
          <p style={{ color: '#94a3b8' }}>Loading article...</p>
        </div>
      </div>
    );
  }

  if (articleError || !article) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #581c87 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: '80px',
      }}>
        <div style={{
          textAlign: 'center',
          backgroundColor: 'rgba(30, 41, 59, 0.5)',
          backdropFilter: 'blur(8px)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '48px',
        }}>
          <BookOpen size={48} color="#64748b" style={{ marginBottom: '16px' }} />
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
            Article Not Found
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '24px' }}>
            {articleError?.message || 'The article you are looking for does not exist.'}
          </p>
          <button
            onClick={() => router.push('/study')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            <ArrowLeft size={18} />
            Back to Study
          </button>
        </div>
      </div>
    );
  }

  const diffColors = getDifficultyColor(article.difficulty);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #581c87 50%, #0f172a 100%)',
      paddingTop: '80px',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'sticky',
        top: '64px',
        zIndex: 40,
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={() => router.push('/study')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={18} />
                Back
              </button>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  {category && (
                    <span style={{
                      padding: '2px 10px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: '500',
                      backgroundColor: 'rgba(168, 85, 247, 0.2)',
                      color: '#c084fc',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                    }}>
                      {category.name}
                    </span>
                  )}
                  {topic && (
                    <span style={{ color: '#94a3b8', fontSize: '14px' }}>{topic.name}</span>
                  )}
                </div>
                <h1 style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: '#ffffff',
                  maxWidth: '600px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {article.title}
                </h1>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '14px' }}>
                <Clock size={16} />
                {article.readingTimeMinutes} min read
              </div>
              {!hasMarkedRead ? (
                <button
                  onClick={handleMarkAsRead}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                  }}
                >
                  <Check size={16} />
                  Mark as Read
                </button>
              ) : (
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#6ee7b7',
                  fontSize: '14px',
                }}>
                  <CheckCircle size={16} />
                  Read
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', gap: '32px' }}>
          {/* Main Content Area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Tab Navigation */}
            <div style={{
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              backdropFilter: 'blur(8px)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
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
                      gap: '8px',
                      padding: '16px 24px',
                      backgroundColor: activeTab === tab.id ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === tab.id ? '2px solid #a855f7' : '2px solid transparent',
                      color: activeTab === tab.id ? '#c084fc' : '#94a3b8',
                      cursor: 'pointer',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                    }}
                  >
                    <tab.icon size={18} />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        backgroundColor: 'rgba(168, 85, 247, 0.3)',
                        color: '#c084fc',
                      }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ padding: '32px' }}>
                {activeTab === 'article' && (
                  <article>
                    {/* Summary */}
                    <div style={{
                      backgroundColor: 'rgba(168, 85, 247, 0.1)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      borderRadius: '12px',
                      padding: '20px',
                      marginBottom: '32px',
                    }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#c084fc', marginBottom: '8px' }}>
                        Summary
                      </h3>
                      <p style={{ color: '#e2e8f0', lineHeight: 1.7 }}>{article.summary}</p>
                    </div>

                    {/* Introduction */}
                    <section style={{ marginBottom: '40px' }}>
                      <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '16px' }}>
                        Introduction
                      </h2>
                      <div style={{ color: '#cbd5e1', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                        {article.introduction}
                      </div>
                    </section>

                    {/* Sections */}
                    {article.sections.map((section, index) => (
                      <section key={section.id} id={`section-${section.id}`} style={{ marginBottom: '40px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '16px' }}>
                          {index + 1}. {section.title}
                        </h2>
                        <div style={{ color: '#cbd5e1', lineHeight: 1.8, whiteSpace: 'pre-wrap', marginBottom: '20px' }}>
                          {section.content}
                        </div>

                        {/* Code Examples */}
                        {section.codeExamples?.map((example) => (
                          <div key={example.id} style={{ marginBottom: '20px' }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              backgroundColor: '#1e293b',
                              borderRadius: '8px 8px 0 0',
                              padding: '8px 16px',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            }}>
                              <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '500' }}>
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
                                  color: copiedCode === example.id ? '#6ee7b7' : '#94a3b8',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                }}
                              >
                                {copiedCode === example.id ? (
                                  <>
                                    <Check size={14} />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy size={14} />
                                    Copy
                                  </>
                                )}
                              </button>
                            </div>
                            <pre style={{
                              margin: 0,
                              borderRadius: '0 0 8px 8px',
                              backgroundColor: '#0f172a',
                              padding: '16px',
                              overflow: 'auto',
                            }}>
                              <code className={`language-${example.language}`}>{example.code}</code>
                            </pre>
                            {example.explanation && (
                              <p style={{
                                color: '#94a3b8',
                                fontSize: '14px',
                                marginTop: '12px',
                                fontStyle: 'italic',
                                paddingLeft: '16px',
                                borderLeft: '2px solid rgba(168, 85, 247, 0.5)',
                              }}>
                                {example.explanation}
                              </p>
                            )}
                          </div>
                        ))}

                        {/* External Links */}
                        {section.externalLinks && section.externalLinks.length > 0 && (
                          <div style={{
                            backgroundColor: 'rgba(30, 41, 59, 0.5)',
                            borderRadius: '12px',
                            padding: '20px',
                            marginTop: '20px',
                          }}>
                            <h4 style={{ fontWeight: '600', color: '#e2e8f0', marginBottom: '12px' }}>
                              Related Resources
                            </h4>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                              {section.externalLinks.map((link, linkIndex) => (
                                <li key={linkIndex} style={{ marginBottom: '12px' }}>
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      color: '#a855f7',
                                      textDecoration: 'none',
                                    }}
                                  >
                                    <span style={{
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      backgroundColor: 'rgba(168, 85, 247, 0.2)',
                                      color: '#c084fc',
                                      textTransform: 'uppercase',
                                    }}>
                                      {link.type}
                                    </span>
                                    {link.title}
                                    <ExternalLink size={14} />
                                  </a>
                                  <p style={{ color: '#94a3b8', fontSize: '13px', marginLeft: '40px', marginTop: '4px' }}>
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
                    <section style={{ marginBottom: '40px' }}>
                      <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '16px' }}>
                        Conclusion
                      </h2>
                      <div style={{ color: '#cbd5e1', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                        {article.conclusion}
                      </div>
                    </section>

                    {/* Key Takeaways */}
                    <section style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '12px',
                      padding: '24px',
                      marginBottom: '32px',
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#6ee7b7', marginBottom: '16px' }}>
                        Key Takeaways
                      </h3>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {article.keyTakeaways.map((takeaway, index) => (
                          <li key={index} style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            color: '#d1fae5',
                            marginBottom: '12px',
                          }}>
                            <CheckCircle size={20} color="#6ee7b7" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span style={{ lineHeight: 1.6 }}>{takeaway}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    {/* Chat Summary (if exists) */}
                    {article.chatSummary && (
                      <section style={{
                        backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        borderRadius: '12px',
                        padding: '24px',
                        marginBottom: '32px',
                      }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#c084fc', marginBottom: '12px' }}>
                          Discussion Summary
                        </h3>
                        <p style={{ color: '#e2e8f0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {article.chatSummary}
                        </p>
                      </section>
                    )}

                    {/* Tags */}
                    {article.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '24px' }}>
                        {article.tags.map((tag) => (
                          <span key={tag} style={{
                            padding: '6px 14px',
                            borderRadius: '9999px',
                            fontSize: '13px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            color: '#94a3b8',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                )}

                {activeTab === 'chat' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '600px' }}>
                    {/* Chat Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
                      {!chat?.messages || chat.messages.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '64px 0' }}>
                          <MessageSquare size={48} color="#64748b" style={{ marginBottom: '16px' }} />
                          <p style={{ color: '#94a3b8' }}>No messages yet. Ask a question about this article!</p>
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
                                maxWidth: '80%',
                                borderRadius: '12px',
                                padding: '16px',
                                backgroundColor: message.role === 'user'
                                  ? 'rgba(168, 85, 247, 0.3)'
                                  : 'rgba(30, 41, 59, 0.8)',
                                border: message.role === 'user'
                                  ? '1px solid rgba(168, 85, 247, 0.5)'
                                  : '1px solid rgba(255, 255, 255, 0.1)',
                              }}>
                                <p style={{
                                  color: '#e2e8f0',
                                  whiteSpace: 'pre-wrap',
                                  lineHeight: 1.6,
                                  margin: 0,
                                }}>
                                  {message.content}
                                </p>
                                <span style={{
                                  display: 'block',
                                  fontSize: '11px',
                                  color: '#64748b',
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

                    {/* Chat Summary Button */}
                    {chat?.messages && chat.messages.length >= 4 && !chat.summary && (
                      <div style={{ marginBottom: '16px' }}>
                        <button
                          onClick={handleGenerateSummary}
                          disabled={chatLoading}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            backgroundColor: 'transparent',
                            color: '#ffffff',
                            cursor: chatLoading ? 'not-allowed' : 'pointer',
                            opacity: chatLoading ? 0.5 : 1,
                          }}
                        >
                          Generate Discussion Summary
                        </button>
                      </div>
                    )}

                    {/* Chat Input */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                        placeholder="Ask a question about this article..."
                        disabled={isSendingChat}
                        style={{
                          flex: 1,
                          padding: '14px 18px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          backgroundColor: 'rgba(15, 23, 42, 0.5)',
                          color: '#ffffff',
                          fontSize: '15px',
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={handleSendChat}
                        disabled={isSendingChat || !chatInput.trim()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '14px 24px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                          color: '#ffffff',
                          border: 'none',
                          cursor: isSendingChat || !chatInput.trim() ? 'not-allowed' : 'pointer',
                          opacity: isSendingChat || !chatInput.trim() ? 0.5 : 1,
                          fontWeight: '500',
                        }}
                      >
                        {isSendingChat ? (
                          <>
                            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send size={18} />
                            Send
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div>
                    {/* Add Note */}
                    <div style={{
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '12px',
                      padding: '20px',
                      marginBottom: '24px',
                    }}>
                      <h3 style={{ fontWeight: '600', color: '#ffffff', marginBottom: '12px' }}>Add a Note</h3>
                      <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Write your note here..."
                        style={{
                          width: '100%',
                          minHeight: '100px',
                          padding: '14px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          backgroundColor: 'rgba(15, 23, 42, 0.5)',
                          color: '#ffffff',
                          fontSize: '15px',
                          outline: 'none',
                          resize: 'vertical',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button
                          onClick={handleCreateNote}
                          disabled={!newNote.trim() || notesLoading}
                          style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                            color: '#ffffff',
                            border: 'none',
                            cursor: !newNote.trim() || notesLoading ? 'not-allowed' : 'pointer',
                            opacity: !newNote.trim() || notesLoading ? 0.5 : 1,
                            fontWeight: '500',
                          }}
                        >
                          Add Note
                        </button>
                      </div>
                    </div>

                    {/* Notes List */}
                    {notes.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '64px 0' }}>
                        <StickyNote size={48} color="#64748b" style={{ marginBottom: '16px' }} />
                        <p style={{ color: '#94a3b8' }}>No notes yet. Start taking notes as you read!</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {notes.map((note: ArticleNote) => (
                          <div key={note.id} style={{
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            padding: '20px',
                          }}>
                            {editingNoteId === note.id ? (
                              <>
                                <textarea
                                  value={editNoteContent}
                                  onChange={(e) => setEditNoteContent(e.target.value)}
                                  style={{
                                    width: '100%',
                                    minHeight: '100px',
                                    padding: '14px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                    color: '#ffffff',
                                    fontSize: '15px',
                                    outline: 'none',
                                    resize: 'vertical',
                                  }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                                  <button
                                    onClick={() => setEditingNoteId(null)}
                                    style={{
                                      padding: '8px 16px',
                                      borderRadius: '8px',
                                      border: '1px solid rgba(255, 255, 255, 0.2)',
                                      backgroundColor: 'transparent',
                                      color: '#ffffff',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleUpdateNote(note.id)}
                                    style={{
                                      padding: '8px 16px',
                                      borderRadius: '8px',
                                      background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                                      color: '#ffffff',
                                      border: 'none',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                {note.highlightedText && (
                                  <div style={{
                                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                    borderLeft: '3px solid #f59e0b',
                                    padding: '8px 12px',
                                    marginBottom: '12px',
                                    fontSize: '14px',
                                    color: '#fbbf24',
                                    fontStyle: 'italic',
                                  }}>
                                    &quot;{note.highlightedText}&quot;
                                  </div>
                                )}
                                <p style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                  {note.content}
                                </p>
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginTop: '16px',
                                  paddingTop: '12px',
                                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                                }}>
                                  <span style={{ color: '#64748b', fontSize: '13px' }}>
                                    {new Date(note.createdAt).toLocaleDateString()}
                                  </span>
                                  <div style={{ display: 'flex', gap: '12px' }}>
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
                                        color: '#a855f7',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                      }}
                                    >
                                      <Edit3 size={14} />
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
                                        fontSize: '13px',
                                      }}
                                    >
                                      <Trash2 size={14} />
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

          {/* Sidebar */}
          <aside style={{ width: '320px', flexShrink: 0, display: 'none' }} className="lg:block">
            <div style={{ position: 'sticky', top: '140px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Article Info Card */}
              <div style={{
                backgroundColor: 'rgba(30, 41, 59, 0.5)',
                backdropFilter: 'blur(8px)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '20px',
              }}>
                <h3 style={{ fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Article Info</h3>
                <dl style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[
                    { label: 'AI Provider', value: article.aiProvider },
                    { label: 'Model', value: article.aiModel },
                    { label: 'Published', value: article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Not published' },
                    { label: 'Views', value: article.viewCount.toString() },
                  ].map((item) => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <dt style={{ color: '#94a3b8', fontSize: '14px' }}>{item.label}</dt>
                      <dd style={{ color: '#e2e8f0', fontSize: '14px', textTransform: 'capitalize' }}>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Quiz Card */}
              {quizzes.length > 0 && (
                <div style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.5)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '20px',
                }}>
                  <h3 style={{ fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Quizzes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {quizzes.map((quiz) => (
                      <div key={quiz.id} style={{
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '16px',
                      }}>
                        <h4 style={{ fontWeight: '500', color: '#e2e8f0', marginBottom: '8px', fontSize: '14px' }}>
                          {quiz.title}
                        </h4>
                        <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>
                          {quiz.questions.length} questions • {quiz.difficulty}
                        </p>
                        <button
                          onClick={() => router.push(`/study/quiz/${quiz.id}`)}
                          style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: '500',
                            fontSize: '14px',
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
                backgroundColor: 'rgba(30, 41, 59, 0.5)',
                backdropFilter: 'blur(8px)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '20px',
              }}>
                <h3 style={{ fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Table of Contents</h3>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <a href="#" style={{ color: '#a855f7', fontSize: '14px', padding: '6px 0', textDecoration: 'none' }}>
                    Introduction
                  </a>
                  {article.sections.map((section, index) => (
                    <a
                      key={section.id}
                      href={`#section-${section.id}`}
                      style={{
                        color: '#94a3b8',
                        fontSize: '14px',
                        padding: '6px 0 6px 12px',
                        textDecoration: 'none',
                        borderLeft: '2px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {index + 1}. {section.title}
                    </a>
                  ))}
                  <a href="#" style={{ color: '#a855f7', fontSize: '14px', padding: '6px 0', textDecoration: 'none' }}>
                    Conclusion
                  </a>
                  <a href="#" style={{ color: '#a855f7', fontSize: '14px', padding: '6px 0', textDecoration: 'none' }}>
                    Key Takeaways
                  </a>
                </nav>
              </div>

              {/* Actions */}
              <div style={{
                backgroundColor: 'rgba(30, 41, 59, 0.5)',
                backdropFilter: 'blur(8px)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '20px',
              }}>
                <h3 style={{ fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Actions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => setActiveTab('notes')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      backgroundColor: 'transparent',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    <StickyNote size={16} />
                    Add Note
                  </button>
                  <button
                    onClick={() => setActiveTab('chat')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      backgroundColor: 'transparent',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '14px',
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
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        backgroundColor: 'transparent',
                        color: '#ffffff',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      <Edit3 size={16} />
                      Edit Article
                    </button>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .lg\\:block {
          display: none;
        }
        @media (min-width: 1024px) {
          .lg\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
