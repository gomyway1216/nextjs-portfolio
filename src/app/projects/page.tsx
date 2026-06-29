import type { Metadata } from 'next';
import ProjectsIndexPage from '@/page/projects/ProjectsIndexPage';

export const metadata: Metadata = {
  title: 'Selected Projects | Yudai Yaguchi',
  description: 'Personal, community, and engineering projects built by Yudai Yaguchi.',
  alternates: { canonical: '/projects' },
  openGraph: {
    title: 'Selected Projects | Yudai Yaguchi',
    description: 'Personal, community, and engineering projects built by Yudai Yaguchi.',
    url: '/projects',
  },
};

export default function ProjectsPage() {
  return <ProjectsIndexPage />;
}
