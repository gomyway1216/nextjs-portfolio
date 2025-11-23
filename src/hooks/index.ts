/**
 * Custom React Hooks for Data Fetching
 *
 * Usage:
 * ```typescript
 * import { usePosts, usePostMutations } from '@/hooks';
 *
 * function MyComponent() {
 *   const { posts, loading, error } = usePosts({ category: 'technology' });
 *   const { createPost } = usePostMutations();
 *
 *   // ...
 * }
 * ```
 */

export * from './usePosts';
export * from './useProjects';
export * from './useTechnologies';
export * from './useContact';
export * from './useProfile';
export * from './useTasks';
export * from './useImageUpload';
export * from './useResume';
