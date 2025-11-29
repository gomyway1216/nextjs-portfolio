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
import { Button } from '@/components/ui/button';
import { QuizDifficulty, ArticleNote, ChatMessage } from '@/types/study';

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

  const getDifficultyColor = (difficulty: QuizDifficulty) => {
    switch (difficulty) {
      case QuizDifficulty.BEGINNER:
        return 'bg-green-100 text-green-800';
      case QuizDifficulty.INTERMEDIATE:
        return 'bg-yellow-100 text-yellow-800';
      case QuizDifficulty.ADVANCED:
        return 'bg-orange-100 text-orange-800';
      case QuizDifficulty.EXPERT:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (articleLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading article...</p>
        </div>
      </div>
    );
  }

  if (articleError || !article) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Article Not Found</h1>
          <p className="text-gray-600 mb-4">{articleError?.message || 'The article you are looking for does not exist.'}</p>
          <Button onClick={() => router.push('/study')}>Back to Study</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => router.push('/study')}>
                ← Back
              </Button>
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {category && (
                    <>
                      <span className="text-blue-600">{category.name}</span>
                      <span>•</span>
                    </>
                  )}
                  {topic && <span>{topic.name}</span>}
                </div>
                <h1 className="text-xl font-bold text-gray-900 line-clamp-1">{article.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getDifficultyColor(article.difficulty)}`}>
                {article.difficulty}
              </span>
              <span className="text-sm text-gray-500">{article.readingTimeMinutes} min read</span>
              {!hasMarkedRead && (
                <Button size="sm" onClick={handleMarkAsRead}>
                  Mark as Read
                </Button>
              )}
              {hasMarkedRead && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Read
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {/* Tab Navigation */}
            <div className="bg-white rounded-lg shadow-sm mb-6">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px">
                  {(['article', 'chat', 'notes'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      {tab === 'notes' && notes.length > 0 && (
                        <span className="ml-2 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs">
                          {notes.length}
                        </span>
                      )}
                      {tab === 'chat' && chat?.messages && chat.messages.length > 0 && (
                        <span className="ml-2 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs">
                          {chat.messages.length}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'article' && (
                  <article className="prose prose-blue max-w-none">
                    {/* Summary */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                      <h3 className="text-lg font-semibold text-blue-800 mb-2">Summary</h3>
                      <p className="text-blue-900">{article.summary}</p>
                    </div>

                    {/* Introduction */}
                    <section className="mb-8">
                      <h2 className="text-2xl font-bold text-gray-900 mb-4">Introduction</h2>
                      <div className="text-gray-700 whitespace-pre-wrap">{article.introduction}</div>
                    </section>

                    {/* Sections */}
                    {article.sections.map((section, index) => (
                      <section key={section.id} className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">
                          {index + 1}. {section.title}
                        </h2>
                        <div className="text-gray-700 whitespace-pre-wrap mb-4">{section.content}</div>

                        {/* Code Examples */}
                        {section.codeExamples?.map((example) => (
                          <div key={example.id} className="mb-4">
                            <div className="bg-gray-800 rounded-t-lg px-4 py-2 text-gray-300 text-sm flex justify-between items-center">
                              <span>{example.language}</span>
                              <button
                                onClick={() => navigator.clipboard.writeText(example.code)}
                                className="text-gray-400 hover:text-white transition-colors"
                              >
                                Copy
                              </button>
                            </div>
                            <pre className="!mt-0 !rounded-t-none">
                              <code className={`language-${example.language}`}>{example.code}</code>
                            </pre>
                            {example.explanation && (
                              <p className="text-sm text-gray-600 mt-2 italic">{example.explanation}</p>
                            )}
                          </div>
                        ))}

                        {/* External Links */}
                        {section.externalLinks && section.externalLinks.length > 0 && (
                          <div className="bg-gray-50 rounded-lg p-4 mt-4">
                            <h4 className="font-semibold text-gray-700 mb-2">Related Resources</h4>
                            <ul className="space-y-2">
                              {section.externalLinks.map((link, linkIndex) => (
                                <li key={linkIndex}>
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline flex items-center gap-2"
                                  >
                                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                                      {link.type}
                                    </span>
                                    {link.title}
                                  </a>
                                  <p className="text-sm text-gray-500 ml-6">{link.description}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </section>
                    ))}

                    {/* Conclusion */}
                    <section className="mb-8">
                      <h2 className="text-2xl font-bold text-gray-900 mb-4">Conclusion</h2>
                      <div className="text-gray-700 whitespace-pre-wrap">{article.conclusion}</div>
                    </section>

                    {/* Key Takeaways */}
                    <section className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                      <h3 className="text-lg font-semibold text-green-800 mb-3">Key Takeaways</h3>
                      <ul className="space-y-2">
                        {article.keyTakeaways.map((takeaway, index) => (
                          <li key={index} className="flex items-start gap-2 text-green-900">
                            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {takeaway}
                          </li>
                        ))}
                      </ul>
                    </section>

                    {/* Chat Summary (if exists) */}
                    {article.chatSummary && (
                      <section className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                        <h3 className="text-lg font-semibold text-purple-800 mb-2">Discussion Summary</h3>
                        <p className="text-purple-900 whitespace-pre-wrap">{article.chatSummary}</p>
                      </section>
                    )}

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mt-6">
                      {article.tags.map((tag) => (
                        <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </article>
                )}

                {activeTab === 'chat' && (
                  <div className="flex flex-col h-[600px]">
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                      {!chat?.messages || chat.messages.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                          <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <p>No messages yet. Ask a question about this article!</p>
                        </div>
                      ) : (
                        chat.messages.map((message: ChatMessage) => (
                          <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg p-4 ${
                                message.role === 'user'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{message.content}</p>
                              <span className={`text-xs mt-2 block ${
                                message.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                              }`}>
                                {new Date(message.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Chat Summary Button */}
                    {chat?.messages && chat.messages.length >= 4 && !chat.summary && (
                      <div className="mb-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateSummary}
                          disabled={chatLoading}
                        >
                          Generate Discussion Summary
                        </Button>
                      </div>
                    )}

                    {/* Chat Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                        placeholder="Ask a question about this article..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={isSendingChat}
                      />
                      <Button onClick={handleSendChat} disabled={isSendingChat || !chatInput.trim()}>
                        {isSendingChat ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Sending...
                          </span>
                        ) : (
                          'Send'
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="space-y-4">
                    {/* Add Note */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-800 mb-3">Add a Note</h3>
                      <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Write your note here..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                      />
                      <div className="flex justify-end mt-2">
                        <Button onClick={handleCreateNote} disabled={!newNote.trim() || notesLoading}>
                          Add Note
                        </Button>
                      </div>
                    </div>

                    {/* Notes List */}
                    {notes.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">
                        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <p>No notes yet. Start taking notes as you read!</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {notes.map((note: ArticleNote) => (
                          <div key={note.id} className="border border-gray-200 rounded-lg p-4">
                            {editingNoteId === note.id ? (
                              <>
                                <textarea
                                  value={editNoteContent}
                                  onChange={(e) => setEditNoteContent(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                  <Button variant="outline" size="sm" onClick={() => setEditingNoteId(null)}>
                                    Cancel
                                  </Button>
                                  <Button size="sm" onClick={() => handleUpdateNote(note.id)}>
                                    Save
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                {note.highlightedText && (
                                  <div className="bg-yellow-50 border-l-4 border-yellow-400 pl-3 py-1 mb-2 text-sm text-gray-600 italic">
                                    &quot;{note.highlightedText}&quot;
                                  </div>
                                )}
                                <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
                                <div className="flex justify-between items-center mt-3 text-sm text-gray-500">
                                  <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        setEditingNoteId(note.id);
                                        setEditNoteContent(note.content);
                                      }}
                                      className="text-blue-600 hover:text-blue-800"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteNote(note.id)}
                                      className="text-red-600 hover:text-red-800"
                                    >
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
          <aside className="w-80 flex-shrink-0 hidden lg:block">
            <div className="sticky top-24 space-y-6">
              {/* Article Info Card */}
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Article Info</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">AI Provider</dt>
                    <dd className="text-gray-900 capitalize">{article.aiProvider}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Model</dt>
                    <dd className="text-gray-900">{article.aiModel}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Published</dt>
                    <dd className="text-gray-900">
                      {article.publishedAt
                        ? new Date(article.publishedAt).toLocaleDateString()
                        : 'Not published'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Views</dt>
                    <dd className="text-gray-900">{article.viewCount}</dd>
                  </div>
                </dl>
              </div>

              {/* Quiz Card */}
              {quizzes.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">Quizzes</h3>
                  <div className="space-y-3">
                    {quizzes.map((quiz) => (
                      <div key={quiz.id} className="border border-gray-200 rounded-lg p-3">
                        <h4 className="font-medium text-gray-800 mb-1">{quiz.title}</h4>
                        <p className="text-sm text-gray-500 mb-2">
                          {quiz.questions.length} questions • {quiz.difficulty}
                        </p>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => router.push(`/study/quiz/${quiz.id}`)}
                        >
                          Take Quiz
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Table of Contents */}
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Table of Contents</h3>
                <nav className="space-y-1">
                  <a href="#" className="block text-sm text-blue-600 hover:text-blue-800 py-1">
                    Introduction
                  </a>
                  {article.sections.map((section, index) => (
                    <a
                      key={section.id}
                      href={`#section-${section.id}`}
                      className="block text-sm text-gray-600 hover:text-blue-600 py-1 pl-2"
                    >
                      {index + 1}. {section.title}
                    </a>
                  ))}
                  <a href="#" className="block text-sm text-blue-600 hover:text-blue-800 py-1">
                    Conclusion
                  </a>
                  <a href="#" className="block text-sm text-blue-600 hover:text-blue-800 py-1">
                    Key Takeaways
                  </a>
                </nav>
              </div>

              {/* Actions */}
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Actions</h3>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full" onClick={() => setActiveTab('notes')}>
                    Add Note
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setActiveTab('chat')}>
                    Ask Question
                  </Button>
                  {currentUser && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => router.push(`/study/article/${articleId}/edit`)}
                    >
                      Edit Article
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
