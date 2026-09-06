import type { Metadata } from 'next';
import ToolsIndexPage from './ToolsIndexPage';

// Bare title: the root layout's template appends "| Yudai Yaguchi"; the
// previous value rendered the name twice in the tab and in search results.
const description =
  'Free browser tools built by Yudai Yaguchi — bill splitting, shopping lists, quizzes, a score tracker, Markdown preview, a Japan railway planner, and an AI todo list.';

export const metadata: Metadata = {
  title: 'Tools',
  description,
  alternates: { canonical: '/tools' },
  openGraph: {
    type: 'website',
    siteName: 'Yudai Yaguchi',
    title: 'Tools | Yudai Yaguchi',
    description,
    url: '/tools',
  },
  twitter: {
    card: 'summary',
    title: 'Tools | Yudai Yaguchi',
    description,
  },
};

export default function ToolsPage() {
  return <ToolsIndexPage />;
}
