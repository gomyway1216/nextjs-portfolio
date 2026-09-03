import type { Metadata } from 'next';
import ProjectsIndexPage from '@/page/projects/ProjectsIndexPage';
import { getProjectsCached } from '@/lib/projects/getProjectsCached';
import type { Project } from '@/services/projectsService';

// Bare page title: the root layout's title template appends
// "| Yudai Yaguchi", so including it here rendered the name twice.
export const metadata: Metadata = {
  title: 'Selected Projects',
  description: 'Personal, community, and engineering projects built by Yudai Yaguchi.',
  alternates: { canonical: '/projects' },
  openGraph: {
    title: 'Selected Projects | Yudai Yaguchi',
    description: 'Personal, community, and engineering projects built by Yudai Yaguchi.',
    url: '/projects',
  },
};

export default async function ProjectsPage() {
  let initialProjects: Project[] | undefined;
  try {
    initialProjects = await getProjectsCached();
  } catch (error) {
    console.error('[projects] server-side fetch failed, falling back to client', error);
  }

  return <ProjectsIndexPage initialProjects={initialProjects} />;
}
