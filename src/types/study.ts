// Study Tool Types - Comprehensive type definitions for the study system

// ============================================================================
// ENUMS
// ============================================================================

export enum AIProvider {
  CLAUDE = 'claude',
  CHATGPT = 'chatgpt',
}

export enum ArticleStatus {
  DRAFT = 'draft',
  GENERATING = 'generating',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

export enum QuizQuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  MULTIPLE_SELECT = 'multiple_select',
  TRUE_FALSE = 'true_false',
  SHORT_ANSWER = 'short_answer',
  LONG_ANSWER = 'long_answer',
  CODE_COMPLETION = 'code_completion',
  CODE_REVIEW = 'code_review',
  MATCHING = 'matching',
  ORDERING = 'ordering',
}

export enum QuizDifficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export enum ScheduleFrequency {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  CUSTOM = 'custom',
}

export enum ScheduleStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum TopicSuggestionType {
  SIMILAR = 'similar',
  DIFFERENT = 'different',
  PREREQUISITE = 'prerequisite',
  ADVANCED = 'advanced',
}

export enum ProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  NEEDS_REVIEW = 'needs_review',
}

// ============================================================================
// CATEGORY TYPES
// ============================================================================

export interface StudyCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  color?: string;
  parentId?: string; // For subcategories
  order: number;
  createdAt: string;
  updatedAt: string;
}

// Predefined categories
export const DEFAULT_CATEGORIES: Omit<StudyCategory, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // Core Programming Concepts
  { name: 'Programming Paradigms', slug: 'programming-paradigms', description: 'OOP vs FP, design patterns, and coding philosophies explained', order: 1 },
  { name: 'JavaScript Deep Dive', slug: 'javascript-deep-dive', description: 'The tricky parts of JS - this, closures, event loop, prototypes', order: 2 },
  { name: 'TypeScript', slug: 'typescript', description: 'TypeScript tips and advanced patterns for real projects', order: 3 },

  // System & Architecture
  { name: 'System Design', slug: 'system-design', description: 'How to design scalable apps like Uber, Twitter, Instagram', order: 4 },
  { name: 'Architecture', slug: 'architecture', description: 'Monolith vs microservices, clean architecture, and trade-offs', order: 5 },
  { name: 'Databases', slug: 'databases', description: 'SQL vs NoSQL, indexing, and real database decisions', order: 6 },

  // CS Fundamentals
  { name: 'CS Fundamentals', slug: 'cs-fundamentals', description: 'MapReduce, geohashing, distributed systems - the concepts that matter', order: 7 },
  { name: 'Algorithms', slug: 'algorithms', description: 'Data structures and algorithms explained with real use cases', order: 8 },

  // Practical Skills
  { name: 'Frontend', slug: 'frontend', description: 'React, Vue, CSS - building great user interfaces', order: 9 },
  { name: 'Backend', slug: 'backend', description: 'APIs, authentication, and server-side development', order: 10 },
  { name: 'DevOps', slug: 'devops', description: 'Docker, CI/CD, cloud - deploying and running apps', order: 11 },

  // Career Growth
  { name: 'Interview Prep', slug: 'interview-prep', description: 'Common interview questions and how to approach them', order: 12 },
  { name: 'Performance', slug: 'performance', description: 'Making your app faster - profiling, caching, optimization', order: 13 },
  { name: 'Security', slug: 'security', description: 'OWASP, authentication, and keeping your app safe', order: 14 },
  { name: 'Testing', slug: 'testing', description: 'Unit tests, integration tests, TDD - testing strategies that work', order: 15 },
  { name: 'Machine Learning', slug: 'machine-learning', description: 'ML basics for engineers - when and how to use it', order: 16 },
];

// ============================================================================
// TOPIC TYPES
// ============================================================================

export interface StudyTopic {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  tags: string[];
  difficulty: QuizDifficulty;
  prerequisites?: string[]; // Topic IDs
  relatedTopics?: string[]; // Topic IDs
  estimatedReadTime: number; // in minutes
  isActive: boolean;
  timesGenerated: number;
  lastGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TopicSuggestion {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  suggestionType: TopicSuggestionType;
  confidence: number; // 0-1
  reasoning: string;
  tags: string[];
  difficulty: QuizDifficulty;
  basedOnTopicIds: string[]; // Topics that led to this suggestion
}

// ============================================================================
// ARTICLE TYPES
// ============================================================================

export interface ArticleSection {
  id: string;
  title: string;
  content: string;
  order: number;
  codeExamples?: CodeExample[];
  externalLinks?: ExternalLink[];
}

export interface CodeExample {
  id: string;
  language: string;
  code: string;
  explanation: string;
  runnable?: boolean;
}

export interface ExternalLink {
  title: string;
  url: string;
  description: string;
  type: 'documentation' | 'tutorial' | 'article' | 'video' | 'book' | 'tool';
}

export interface ArticleNote {
  id: string;
  articleId: string;
  userId: string;
  content: string;
  sectionId?: string; // Optional section reference
  highlightedText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ArticleChat {
  id: string;
  articleId: string;
  userId: string;
  messages: ChatMessage[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudyArticle {
  id: string;
  topicId: string;
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  introduction: string;
  sections: ArticleSection[];
  conclusion: string;
  keyTakeaways: string[];
  status: ArticleStatus;
  aiProvider: AIProvider;
  aiModel: string;
  generationPrompt?: string;
  difficulty: QuizDifficulty;
  tags: string[];
  readingTimeMinutes: number;
  viewCount: number;
  isPublic: boolean;
  scheduledId?: string; // Reference to schedule that generated this
  quizIds: string[];
  chatSummary?: string; // Appended from chat discussions
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

// ============================================================================
// QUIZ TYPES
// ============================================================================

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  question: string;
  explanation: string;
  difficulty: QuizDifficulty;
  points: number;

  // For multiple choice / multiple select / true-false
  options?: QuizOption[];

  // For short/long answer
  expectedAnswer?: string;
  gradingCriteria?: string[];

  // For code questions
  codeSnippet?: string;
  language?: string;
  expectedCodeAnswer?: string;
  testCases?: { input: string; expectedOutput: string }[];

  // For matching
  matchingPairs?: MatchingPair[];

  // For ordering
  correctOrder?: string[];
  orderItems?: string[];

  // Metadata
  hints?: string[];
  tags: string[];
  createdAt: string;
}

export interface Quiz {
  id: string;
  articleId: string;
  topicId: string;
  categoryId: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  timeLimit?: number; // in minutes, optional
  passingScore: number; // percentage
  difficulty: QuizDifficulty;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuizAnswer {
  questionId: string;
  answer: string | string[] | number | number[]; // Various answer formats
  timeTaken: number; // seconds spent on question
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  answers: QuizAnswer[];
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  feedback: QuestionFeedback[];
  startedAt: string;
  completedAt: string;
  timeSpent: number; // total seconds
}

export interface QuestionFeedback {
  questionId: string;
  isCorrect: boolean;
  pointsEarned: number;
  feedback: string;
  aiAssessment?: string; // For free-form questions
  correctAnswer?: string;
}

// ============================================================================
// SCHEDULE TYPES
// ============================================================================

export interface ArticleSchedule {
  id: string;
  name: string;
  description?: string;
  topicIds: string[]; // List of topic IDs to cycle through
  categoryIds: string[]; // Or categories to pick from
  frequency: ScheduleFrequency;
  cronExpression?: string; // For custom scheduling
  scheduledTimes: string[]; // ISO time strings for daily times
  timezone: string;
  aiProvider: AIProvider;
  aiModel?: string;
  numberOfArticles: number; // How many to generate per run
  topicSelectionMode: 'sequential' | 'random' | 'ai_suggested';
  suggestionType: TopicSuggestionType; // For AI suggestions
  language: string; // Article language (e.g., 'ja', 'en')
  codingLanguage: string; // Programming language for code examples
  status: ScheduleStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  articlesGenerated: number;
  sendEmailNotification: boolean;
  notificationEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  topicIds: string[];
  articleIds: string[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ============================================================================
// PROGRESS & TRACKING TYPES
// ============================================================================

export interface TopicProgress {
  topicId: string;
  status: ProgressStatus;
  articlesRead: number;
  quizzesCompleted: number;
  averageQuizScore: number;
  lastActivityAt: string;
  notes: string[];
  timeSpentMinutes: number;
}

export interface CategoryProgress {
  categoryId: string;
  topicsStarted: number;
  topicsCompleted: number;
  totalTopics: number;
  averageQuizScore: number;
  articlesRead: number;
  timeSpentMinutes: number;
}

export interface UserStudyProgress {
  id: string;
  userId: string;
  topicProgress: { [topicId: string]: TopicProgress };
  categoryProgress: { [categoryId: string]: CategoryProgress };
  totalArticlesRead: number;
  totalQuizzesCompleted: number;
  totalTimeSpentMinutes: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string;
  weakAreas: string[]; // Topic IDs
  strongAreas: string[]; // Topic IDs
  suggestedNextTopics: string[]; // Topic IDs
  achievements: UserAchievement[];
  createdAt: string;
  updatedAt: string;
}

export interface UserAchievement {
  id: string;
  type: string;
  name: string;
  description: string;
  earnedAt: string;
  metadata?: Record<string, unknown>;
}

export interface LearningInsight {
  id: string;
  userId: string;
  type: 'strength' | 'weakness' | 'recommendation' | 'milestone';
  title: string;
  description: string;
  relatedTopicIds: string[];
  relatedCategoryIds: string[];
  actionable: boolean;
  actionText?: string;
  priority: number;
  createdAt: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface AIConfig {
  claudeApiKey?: string; // Stored in secrets
  chatgptApiKey?: string; // Stored in secrets
  defaultProvider: AIProvider;
  claudeModel: string;
  chatgptModel: string;
  maxTokens: number;
  temperature: number;
}

export interface StudyConfig {
  id: string;
  aiConfig: AIConfig;
  emailConfig: {
    enabled: boolean;
    defaultEmail?: string;
  };
  defaultArticleSettings: {
    difficulty: QuizDifficulty;
    numberOfQuestions: number;
    includeCodeExamples: boolean;
    includeExternalLinks: boolean;
  };
  defaultScheduleSettings: {
    timezone: string;
    defaultTime: string; // ISO time
  };
  updatedAt: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface GenerateArticleRequest {
  topicId?: string;
  topicName?: string;
  categoryId: string;
  aiProvider: AIProvider;
  difficulty: QuizDifficulty;
  includeQuiz: boolean;
  numberOfQuestions: number;
  customPrompt?: string;
}

export interface GenerateArticleResponse {
  article: StudyArticle;
  quiz?: Quiz;
  generationTime: number;
}

export interface SuggestTopicsRequest {
  categoryId?: string;
  basedOnTopicIds?: string[];
  suggestionType: TopicSuggestionType;
  count: number;
  excludeTopicIds?: string[];
}

export interface SuggestTopicsResponse {
  suggestions: TopicSuggestion[];
}

export interface AssessAnswerRequest {
  questionId: string;
  questionType: QuizQuestionType;
  question: string;
  expectedAnswer?: string;
  gradingCriteria?: string[];
  userAnswer: string;
}

export interface AssessAnswerResponse {
  isCorrect: boolean;
  score: number; // 0-100
  feedback: string;
  suggestions?: string[];
}

export interface ArticleChatRequest {
  articleId: string;
  message: string;
  conversationHistory?: ChatMessage[];
}

export interface ArticleChatResponse {
  response: string;
  updatedSummary?: string;
}

export interface GetLearningInsightsRequest {
  userId: string;
  includeRecommendations: boolean;
  includeMilestones: boolean;
}

export interface GetLearningInsightsResponse {
  insights: LearningInsight[];
  overallProgress: {
    totalProgress: number;
    trend: 'improving' | 'stable' | 'declining';
    suggestedFocus: string[];
  };
}

// ============================================================================
// LIST/SEARCH TYPES
// ============================================================================

export interface ArticleListFilters {
  categoryId?: string;
  topicId?: string;
  difficulty?: QuizDifficulty;
  status?: ArticleStatus;
  tags?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ArticleListSort {
  field: 'createdAt' | 'updatedAt' | 'publishedAt' | 'viewCount' | 'title';
  direction: 'asc' | 'desc';
}

export interface PaginatedRequest {
  page: number;
  pageSize: number;
  filters?: ArticleListFilters;
  sort?: ArticleListSort;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export type CreateStudyTopic = Omit<StudyTopic, 'id' | 'createdAt' | 'updatedAt' | 'timesGenerated' | 'lastGeneratedAt'>;
export type UpdateStudyTopic = Partial<CreateStudyTopic>;

export type CreateStudyArticle = Omit<StudyArticle, 'id' | 'createdAt' | 'updatedAt' | 'viewCount' | 'quizIds'>;
export type UpdateStudyArticle = Partial<CreateStudyArticle>;

export type CreateQuiz = Omit<Quiz, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateQuiz = Partial<CreateQuiz>;

export type CreateArticleSchedule = Omit<ArticleSchedule, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt' | 'articlesGenerated'>;
export type UpdateArticleSchedule = Partial<CreateArticleSchedule>;

// ============================================================================
// ARTICLE READ HISTORY
// ============================================================================

export interface ArticleReadHistory {
  id: string;
  articleId: string;
  userId: string;
  readAt: string;
  timeSpentSeconds?: number;
}

// Extended article type with read status for admin view
export interface StudyArticleWithReadStatus extends StudyArticle {
  isRead?: boolean;
  readAt?: string;
}

// ============================================================================
// LEARNING ENTRY TYPES - Comprehensive Learning System
// ============================================================================

export enum LearningSourceType {
  BOOK = 'book',
  YOUTUBE = 'youtube',
  ARTICLE = 'article',
  COURSE = 'course',
  PODCAST = 'podcast',
  WORK = 'work',
  CONVERSATION = 'conversation',
  DOCUMENTATION = 'documentation',
  CONFERENCE = 'conference',
  OTHER = 'other',
}

export enum ReviewStatus {
  NEW = 'new',
  LEARNING = 'learning',
  REVIEW = 'review',
  MASTERED = 'mastered',
}

export enum FlashcardDifficulty {
  AGAIN = 'again',    // Show again in < 1 min
  HARD = 'hard',      // Show in 1-10 min
  GOOD = 'good',      // Show in 1-3 days
  EASY = 'easy',      // Show in 4+ days
}

// Main learning entry - captures knowledge from any source
export interface LearningEntry {
  id: string;
  userId: string;
  title: string;
  content: string;                    // Main notes in markdown
  summary?: string;                   // AI-generated or user summary
  sourceType: LearningSourceType;
  sourceDetails: LearningSource;      // Specific source info
  categoryId?: string;                // Link to study category
  topicIds: string[];                 // Link to study topics
  tags: string[];
  keyTakeaways: string[];             // Bullet points of main learnings
  dictionaryTermIds: string[];        // Terms defined from this entry
  flashcardIds: string[];             // Generated flashcards
  linkedArticleIds: string[];         // Related generated articles
  linkedEntryIds: string[];           // Related learning entries
  reviewStatus: ReviewStatus;
  nextReviewDate?: string;
  reviewCount: number;
  lastReviewedAt?: string;
  confidenceLevel: number;            // 0-100, tracks mastery
  createdAt: string;
  updatedAt: string;
}

// Source-specific metadata
export interface LearningSource {
  type: LearningSourceType;
  // Book
  bookTitle?: string;
  bookAuthor?: string;
  isbn?: string;
  chapter?: string;
  pageNumbers?: string;
  // YouTube
  videoUrl?: string;
  videoTitle?: string;
  channelName?: string;
  timestamp?: string;
  // Article/Blog
  articleUrl?: string;
  articleTitle?: string;
  articleAuthor?: string;
  publicationName?: string;
  // Course
  courseName?: string;
  courseProvider?: string;          // Udemy, Coursera, etc.
  courseUrl?: string;
  lessonName?: string;
  // Podcast
  podcastName?: string;
  episodeTitle?: string;
  episodeUrl?: string;
  // Work
  projectName?: string;
  taskDescription?: string;
  teamContext?: string;
  // Conference/Talk
  conferenceName?: string;
  speakerName?: string;
  talkTitle?: string;
  talkUrl?: string;
  // Documentation
  docUrl?: string;
  docTitle?: string;
  technology?: string;
  // General
  notes?: string;
}

// Dictionary/Glossary term
export interface DictionaryTerm {
  id: string;
  userId: string;
  term: string;
  definition: string;
  pronunciation?: string;           // For technical terms
  category?: string;                // Programming, System Design, etc.
  tags: string[];
  examples: TermExample[];
  relatedTermIds: string[];
  sourceEntryId?: string;           // Learning entry that introduced this
  aliases: string[];                // Alternative names/spellings
  difficulty: QuizDifficulty;
  reviewStatus: ReviewStatus;
  nextReviewDate?: string;
  reviewCount: number;
  lastReviewedAt?: string;
  confidenceLevel: number;
  createdAt: string;
  updatedAt: string;
}

export interface TermExample {
  id: string;
  context: string;                  // When/where to use
  codeExample?: string;
  language?: string;
  explanation?: string;
}

// Card content difficulty (how hard the content is to learn)
export type CardContentDifficulty = 'easy' | 'medium' | 'hard';

// Flashcard for spaced repetition
export interface Flashcard {
  id: string;
  userId: string;
  deckId?: string;                  // Optional deck assignment
  front: string;                    // Question/prompt
  back: string;                     // Answer
  frontType: 'text' | 'code' | 'image';
  backType: 'text' | 'code' | 'image';
  codeLanguage?: string;
  hint?: string;
  explanation?: string;
  difficulty: CardContentDifficulty; // How hard the content is
  sourceEntryId?: string;           // Learning entry this came from
  dictionaryTermId?: string;        // If from dictionary
  articleId?: string;               // If from generated article
  tags: string[];
  categoryId?: string;
  // Spaced repetition fields (SM-2 algorithm)
  easeFactor: number;               // Starts at 2.5
  interval: number;                 // Days until next review
  repetitions: number;              // Consecutive correct answers
  nextReviewDate: string;
  lastReviewedAt?: string;
  reviewCount: number;              // Total reviews
  correctCount: number;             // Correct reviews
  masteryLevel: number;             // 0-5 mastery
  reviewHistory: FlashcardReview[];
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardReview {
  date: string;
  difficulty: FlashcardDifficulty;
  timeTaken: number;                // seconds
}

// Deck for organizing flashcards
export interface FlashcardDeck {
  id: string;
  userId: string;
  name: string;
  description?: string;
  flashcardIds: string[];
  categoryId?: string;
  tags: string[];
  isPublic: boolean;
  cardsDue: number;                 // Cached count of due cards
  cardsNew: number;                 // Cached count of new cards
  lastStudiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Learning review session
export interface ReviewSession {
  id: string;
  userId: string;
  sessionType: 'flashcard' | 'dictionary' | 'mixed';
  deckId?: string;
  itemsReviewed: ReviewedItem[];
  totalItems: number;
  correctCount: number;
  accuracy: number;
  duration: number;                 // seconds
  startedAt: string;
  completedAt?: string;
}

export interface ReviewedItem {
  itemId: string;
  itemType: 'flashcard' | 'dictionary_term';
  wasCorrect: boolean;
  difficulty: FlashcardDifficulty;
  timeTaken: number;
}

// Quick capture for on-the-go learning
export interface QuickCapture {
  id: string;
  userId: string;
  content: string;
  sourceType?: LearningSourceType;
  sourceUrl?: string;
  tags: string[];
  status: 'pending' | 'processed' | 'archived';
  processedEntryId?: string;        // Learning entry created from this
  createdAt: string;
  updatedAt: string;
}

// Learning goal tracking
export interface LearningGoal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetType: 'entries' | 'reviews' | 'flashcards' | 'time' | 'articles';
  targetValue: number;
  currentValue: number;
  period: 'daily' | 'weekly' | 'monthly' | 'total';
  categoryId?: string;              // If goal is category-specific
  startDate: string;
  endDate?: string;
  isCompleted: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Comprehensive learning statistics
export interface LearningStats {
  id: string;
  userId: string;
  // Entry stats
  totalEntries: number;
  entriesBySource: { [key in LearningSourceType]?: number };
  entriesByCategory: { [categoryId: string]: number };
  // Dictionary stats
  totalTerms: number;
  termsByCategory: { [category: string]: number };
  masteredTerms: number;
  // Flashcard stats
  totalFlashcards: number;
  flashcardsDueToday: number;
  flashcardsStudiedToday: number;
  averageEaseFactor: number;
  // Review stats
  totalReviews: number;
  reviewsThisWeek: number;
  averageAccuracy: number;
  currentStreak: number;
  longestStreak: number;
  // Time tracking
  totalStudyTimeMinutes: number;
  studyTimeThisWeek: number;
  studyTimeToday: number;
  // Goals
  activeGoals: number;
  completedGoals: number;
  // Last updated
  lastActivityAt: string;
  updatedAt: string;
}

// ============================================================================
// LEARNING API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateLearningEntryRequest {
  title: string;
  content: string;
  sourceType: LearningSourceType;
  sourceDetails: LearningSource;
  categoryId?: string;
  topicIds?: string[];
  tags?: string[];
  keyTakeaways?: string[];
  linkedArticleIds?: string[];
  linkedEntryIds?: string[];
  generateFlashcards?: boolean;
  generateSummary?: boolean;
  extractTerms?: boolean;
}

export interface GenerateFlashcardsRequest {
  entryId?: string;
  articleId?: string;
  dictionaryTermIds?: string[];
  content?: string;
  count?: number;
  difficulty?: QuizDifficulty;
}

export interface GenerateFlashcardsResponse {
  flashcards: Omit<Flashcard, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewHistory' | 'lastReviewedAt'>[];
}

export interface ExtractTermsRequest {
  entryId?: string;
  content?: string;
  existingTerms?: string[];
}

export interface ExtractTermsResponse {
  terms: Omit<DictionaryTerm, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewHistory' | 'lastReviewedAt'>[];
}

export interface GenerateSummaryRequest {
  entryId?: string;
  content?: string;
  maxLength?: number;
}

export interface ReviewDueItemsRequest {
  itemType: 'flashcard' | 'dictionary' | 'mixed';
  deckId?: string;
  categoryId?: string;
  limit?: number;
}

export interface ReviewDueItemsResponse {
  flashcards: Flashcard[];
  dictionaryTerms: DictionaryTerm[];
  totalDue: number;
}

export interface SubmitReviewRequest {
  itemId: string;
  itemType: 'flashcard' | 'dictionary_term';
  difficulty: FlashcardDifficulty;
  timeTaken: number;
}

export interface GenerateQuizFromEntriesRequest {
  entryIds: string[];
  questionCount?: number;
  questionTypes?: QuizQuestionType[];
  difficulty?: QuizDifficulty;
}

export interface LinkEntriesToArticleRequest {
  entryIds: string[];
  generateNewArticle?: boolean;
  existingArticleId?: string;
}

export interface SearchLearningContentRequest {
  query: string;
  types?: ('entry' | 'term' | 'flashcard' | 'article')[];
  categoryId?: string;
  tags?: string[];
  sourceType?: LearningSourceType;
  limit?: number;
}

export interface SearchLearningContentResponse {
  entries: LearningEntry[];
  terms: DictionaryTerm[];
  flashcards: Flashcard[];
  articles: StudyArticle[];
}

// Helper types for creation
export type CreateLearningEntry = Omit<LearningEntry, 'id' | 'createdAt' | 'updatedAt' | 'reviewCount' | 'lastReviewedAt' | 'flashcardIds' | 'dictionaryTermIds' | 'linkedArticleIds'>;
export type UpdateLearningEntry = Partial<CreateLearningEntry>;

export type CreateDictionaryTerm = Omit<DictionaryTerm, 'id' | 'createdAt' | 'updatedAt' | 'reviewCount' | 'lastReviewedAt'>;
export type UpdateDictionaryTerm = Partial<CreateDictionaryTerm>;

export type CreateFlashcard = Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt' | 'reviewHistory' | 'lastReviewedAt'>;
export type UpdateFlashcard = Partial<CreateFlashcard>;

export type CreateFlashcardDeck = Omit<FlashcardDeck, 'id' | 'createdAt' | 'updatedAt' | 'cardsDue' | 'cardsNew'>;
export type UpdateFlashcardDeck = Partial<CreateFlashcardDeck>;

// ============================================================================
// LEARNING PATH TYPES
// ============================================================================

export enum LearningPathStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  PAUSED = 'paused',
}

export enum TopicImportance {
  CRITICAL = 'critical',
  IMPORTANT = 'important',
  NICE_TO_HAVE = 'nice_to_have',
}

export enum PreferredLearningStyle {
  HANDS_ON = 'hands_on',
  READING = 'reading',
  VIDEO = 'video',
  MIXED = 'mixed',
}

// Learning Path Resource
export interface LearningResource {
  id: string;
  type: 'book' | 'course' | 'video' | 'article' | 'documentation' | 'podcast';
  title: string;
  url?: string;
  description?: string;
  estimatedTime?: number; // minutes
}

// Learning Topic within a Phase
export interface LearningPathTopic {
  id: string;
  phaseId: string;
  title: string;
  description: string;
  importance: TopicImportance;
  prerequisites: string[]; // topic IDs
  status: LearningPathStatus;
  entryId?: string; // linked learning entry
  flashcardIds: string[];
  dictionaryTermIds: string[];
  linkedArticleIds: string[];
  resources: LearningResource[];
  estimatedDuration: string;
  completedAt?: string;
  order: number;
}

// Learning Phase within a Path
export interface LearningPhase {
  id: string;
  pathId: string;
  number: number;
  title: string;
  description: string;
  estimatedDuration: string;
  topics: LearningPathTopic[];
  milestones: string[];
  status: LearningPathStatus;
  progress: number; // 0-100
  entryIds: string[];
  flashcardDeckIds: string[];
  startedAt?: string;
  completedAt?: string;
  order: number;
}

// Learning Path Context
export interface LearningPathContext {
  currentLevel?: string;
  yearsOfExperience?: number;
  primaryTechStack?: string[];
  availableHoursPerWeek?: number;
  preferredLearningStyle?: PreferredLearningStyle;
  targetDate?: string;
  additionalNotes?: string;
}

// Main Learning Path
export interface LearningPath {
  id: string;
  userId: string;
  title: string;
  description: string;
  goal: string;
  estimatedDuration: string;
  phases: LearningPhase[];
  status: LearningPathStatus;
  progress: number; // 0-100
  currentPhaseId?: string;
  currentTopicId?: string;
  totalTopics: number;
  completedTopics: number;
  totalFlashcards: number;
  masteredFlashcards: number;
  totalDictionaryTerms: number;
  linkedArticleIds: string[];
  tags: string[];
  aiProvider: AIProvider;
  aiModel: string;
  context?: LearningPathContext;
  startedAt?: string;
  completedAt?: string;
  lastActivityAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Daily Learning Plan Item
export interface DailyLearningItem {
  id: string;
  type: 'read_entry' | 'review_flashcards' | 'review_terms' | 'read_article' | 'practice';
  title: string;
  description?: string;
  estimatedTime: number;
  completed: boolean;
  completedAt?: string;
  linkedId?: string; // entry, article, or deck ID
  order: number;
}

// Daily Learning Plan
export interface DailyLearningPlan {
  id: string;
  userId: string;
  date: string;
  pathId?: string;
  phaseId?: string;
  topicId?: string;
  suggestedStudyTime: number; // minutes
  items: DailyLearningItem[];
  flashcardsDue: number;
  dictionaryTermsDue: number;
  completed: boolean;
  completedItems: number;
  totalItems: number;
  actualStudyTime: number;
  createdAt: string;
  updatedAt: string;
}

// Learning Path Recommendations
export interface LearningPathRecommendations {
  books: string[];
  courses: string[];
  youtubeChannels: string[];
  podcasts: string[];
  websites: string[];
}

// Request types for Learning Path functions
export interface GenerateLearningPathRequest {
  goal: string;
  context?: LearningPathContext;
  options?: {
    generateEntries?: boolean;
    generateFlashcards?: boolean;
    generateDictionary?: boolean;
    linkArticles?: boolean;
    createGoals?: boolean;
  };
}

export interface CreateLearningPathResponse {
  path: LearningPath;
  recommendations: LearningPathRecommendations;
}

export interface StartTopicRequest {
  pathId: string;
  topicId: string;
  generateContent?: boolean;
}

export interface StartTopicResponse {
  message: string;
  entry?: LearningEntry;
}

export interface CompleteTopicRequest {
  pathId: string;
  topicId: string;
}

export interface CompleteTopicResponse {
  message: string;
  progress: number;
  pathCompleted: boolean;
}

export interface GetDailyPlanRequest {
  date?: string; // ISO date string
  pathId?: string;
  regenerate?: boolean;
}

export interface GetDailyPlanResponse {
  plan: DailyLearningPlan;
  motivationalMessage?: string;
}

export interface UpdateDailyPlanItemRequest {
  planId: string;
  itemId: string;
  completed?: boolean;
  actualTime?: number;
}

export interface UpdateDailyPlanItemResponse {
  completedItems: number;
  totalItems: number;
  completed: boolean;
}

// Helper types
export type CreateLearningPath = GenerateLearningPathRequest;
export type UpdateLearningPath = Partial<Pick<LearningPath, 'title' | 'description' | 'status' | 'tags'>>;
