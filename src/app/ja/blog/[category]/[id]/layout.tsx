interface BlogPostJaLayoutProps {
  children: React.ReactNode;
}

// Middleware owns legacy-id redirects. Avoid blocking the article loading
// boundary with a slug-index lookup on every normal navigation.
export default function BlogPostJaLayout({ children }: BlogPostJaLayoutProps) {
  return children;
}
