const GENERATED_POST_COVERS: Record<string, string> = {
  'i-built-my-own-bill-splitting-app-payments-is-my-day-job-and-i-wanted-one-withou':
    '/img/blog/personalized/settli-why-i-built.webp',
  'spaced-repetition-flashcards-and-auto-generated-quizzes-turning-learning-science':
    '/img/blog/personalized/srs-flashcards-engineering.webp',
  'i-built-my-own-notebooklm-style-article-to-podcast-pipeline':
    '/img/blog/personalized/article-to-podcast.webp',
  'i-built-a-personal-learning-pipeline-where-ai-writes-me-a-study-article-every-da':
    '/img/blog/personalized/ai-daily-article-pipeline.webp',
  'adding-a-japanese-voice-chat-ai-to-my-portfolio-with-voicevox-next-js':
    '/img/blog/personalized/voicevox-nextjs-voice-chat.webp',
};

/**
 * Prefer an image selected in the admin UI, then fall back to a bundled
 * cover for the handful of published posts that launched without one.
 */
export function resolvePostCover(
  image: string | undefined,
  slugOrId: string | undefined,
): string | undefined {
  const selectedImage = image?.trim();
  if (selectedImage) return selectedImage;
  if (!slugOrId) return undefined;
  return GENERATED_POST_COVERS[slugOrId];
}
