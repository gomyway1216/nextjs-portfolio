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
