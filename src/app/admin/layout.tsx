import AdminViewLogger from '@/components/AdminViewLogger';
import { PostsProvider } from '@/providers/PostsProvider';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PostsProvider>
      <AdminViewLogger />
      {children}
    </PostsProvider>
  );
}
