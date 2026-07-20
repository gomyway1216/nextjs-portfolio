import type { Metadata } from 'next';

// The page is a client component and can't export metadata itself.
export const metadata: Metadata = {
  title: 'Markdown Preview',
  description:
    'Free in-browser Markdown editor with live preview — write on the left, see rendered output on the right. No sign-up, nothing leaves your browser.',
  alternates: { canonical: '/tools/markdown-preview' },
  openGraph: {
    title: 'Markdown Preview | Yudai Yaguchi',
    description:
      'Free in-browser Markdown editor with live preview — write on the left, see rendered output on the right.',
    url: '/tools/markdown-preview',
  },
};

export default function MarkdownPreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
