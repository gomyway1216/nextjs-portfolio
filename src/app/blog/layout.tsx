import { PostsProvider } from '@/providers/PostsProvider';

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <PostsProvider>{children}</PostsProvider>;
}
