import SiteFooter from '@/components/common/SiteFooter';
import { PostsProvider } from '@/providers/PostsProvider';

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <PostsProvider>
      {children}
      <SiteFooter />
    </PostsProvider>
  );
}
