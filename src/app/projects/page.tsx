import type { Metadata } from 'next';
import ProjectsIndexPage from '@/page/projects/ProjectsIndexPage';

export const metadata: Metadata = {
  title: 'Project Case Studies | Yudai Yaguchi',
  description: 'A complete index of product and engineering case studies by Yudai Yaguchi.',
};

export default function ProjectsPage() {
  return <ProjectsIndexPage />;
}
