interface BlogPostLayoutProps {
  children: React.ReactNode;
}

// Legacy Firestore-id redirects are handled in middleware. Keeping that
// lookup here delayed loading.tsx for every canonical article navigation.
export default function BlogPostLayout({ children }: BlogPostLayoutProps) {
  return children;
}
