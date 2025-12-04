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
