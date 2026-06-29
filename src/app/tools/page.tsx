import type { Metadata } from 'next';
import ToolsIndexPage from './ToolsIndexPage';

export const metadata: Metadata = {
  title: 'Tools | Yudai Yaguchi',
  description: 'A complete index of practical tools built by Yudai Yaguchi.',
};

export default function ToolsPage() {
  return <ToolsIndexPage />;
}
