// Firestore collection names
export const POSTS_COLLECTION = 'post';
export const PROJECTS_COLLECTION = 'project';
export const TECHNOLOGIES_COLLECTION = 'technology';
export const PROFILE_COLLECTION = 'profile';
export const TASKS_COLLECTION = 'task';
export const CONTACT_COLLECTION = 'contact';
export const USERS_COLLECTION = 'users';

// Study Tool collection names
export const STUDY_CATEGORIES_COLLECTION = 'study_categories';
export const STUDY_TOPICS_COLLECTION = 'study_topics';
export const STUDY_ARTICLES_COLLECTION = 'study_articles';
export const STUDY_QUIZZES_COLLECTION = 'study_quizzes';
export const STUDY_QUIZ_ATTEMPTS_COLLECTION = 'study_quiz_attempts';
export const STUDY_SCHEDULES_COLLECTION = 'study_schedules';
export const STUDY_SCHEDULE_RUNS_COLLECTION = 'study_schedule_runs';
export const STUDY_NOTES_COLLECTION = 'study_notes';
export const STUDY_CHATS_COLLECTION = 'study_chats';
export const STUDY_PROGRESS_COLLECTION = 'study_progress';
export const STUDY_INSIGHTS_COLLECTION = 'study_insights';
export const STUDY_CONFIG_COLLECTION = 'study_config';
export const STUDY_READ_HISTORY_COLLECTION = 'study_read_history';

// Learning System collection names
export const LEARNING_ENTRIES_COLLECTION = 'learning_entries';
export const DICTIONARY_TERMS_COLLECTION = 'dictionary_terms';
export const FLASHCARDS_COLLECTION = 'flashcards';
export const FLASHCARD_DECKS_COLLECTION = 'flashcard_decks';
export const REVIEW_SESSIONS_COLLECTION = 'review_sessions';
export const QUICK_CAPTURES_COLLECTION = 'quick_captures';
export const LEARNING_GOALS_COLLECTION = 'learning_goals';
export const LEARNING_STATS_COLLECTION = 'learning_stats';

// Hobby System collection names
export const HOBBIES_COLLECTION = 'hobbies';
export const HOBBY_ITEMS_COLLECTION = 'hobby_items';

// Game System collection names
export const GAME_SCORES_COLLECTION = 'game_scores';

// Railway Planner collection names
export const RAILWAY_PLANNER_DRAFTS_COLLECTION = 'railway_planner_drafts';

// Settli System collection names
export const SETTLI_GROUPS_COLLECTION = 'settli_groups';
export const SETTLI_PAYMENTS_COLLECTION = 'settli_payments';
export const SETTLI_USER_HISTORY_COLLECTION = 'settli_user_history';

// Kaimono System collection names
export const KAIMONO_LISTS_COLLECTION = 'kaimono_lists';
export const KAIMONO_USER_HISTORY_COLLECTION = 'kaimono_user_history';
export const KAIMONO_RECURRING_ITEMS_COLLECTION = 'kaimono_recurring_items';
export const KAIMONO_FREQUENT_ITEMS_COLLECTION = 'kaimono_frequent_items';

// Score Tracker System collection names
export const SCORE_TRACKER_GROUPS_COLLECTION = 'score_tracker_groups';
export const SCORE_TRACKER_SESSIONS_SUBCOLLECTION = 'sessions';
export const SCORE_TRACKER_USER_HISTORY_COLLECTION = 'score_tracker_user_history';

// Kuizu System collection names
export const KUIZU_QUESTIONS_COLLECTION = 'kuizu_questions';
export const KUIZU_CUSTOM_QUIZZES_COLLECTION = 'kuizu_custom_quizzes';
export const KUIZU_DAILY_CHALLENGES_COLLECTION = 'kuizu_daily_challenges';
export const KUIZU_DAILY_LEADERBOARD_COLLECTION = 'kuizu_daily_leaderboard';
export const KUIZU_USER_STATS_COLLECTION = 'kuizu_user_stats';
export const KUIZU_USER_HISTORY_COLLECTION = 'kuizu_user_history';
export const KUIZU_SOLO_RESULTS_COLLECTION = 'kuizu_solo_results';

// Firebase Cloud Functions base URL (v2 uses individual URLs per function)
// Format: https://{functionname-lowercase}-{project-hash}-uc.a.run.app
export const FIREBASE_FUNCTIONS_URL = process.env.FIREBASE_FUNCTIONS_URL || 'https://us-central1-yudai-portfolio.cloudfunctions.net';

// Firebase Cloud Functions v2 URL builder
// v2 functions have individual URLs like: https://createstudycategory-qtveh4ivsq-uc.a.run.app
const CLOUD_RUN_PROJECT_HASH = 'qtveh4ivsq';
const CLOUD_RUN_REGION = 'uc';

export function getCloudFunctionUrl(functionName: string): string {
  // Convert camelCase to lowercase (e.g., createStudyCategory -> createstudycategory)
  const lowercaseName = functionName.toLowerCase();
  return `https://${lowercaseName}-${CLOUD_RUN_PROJECT_HASH}-${CLOUD_RUN_REGION}.a.run.app`;
}
