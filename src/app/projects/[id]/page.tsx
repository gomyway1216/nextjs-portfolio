import type { Metadata } from 'next';
import ProjectPage from '@/page/project/ProjectPage';

interface ProjectRouteParams {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Project Case Study',
  description: 'A portfolio project case study with project context, stack, links, and implementation notes.',
};

export default async function ProjectRoute({ params }: ProjectRouteParams) {
  const { id } = await params;

  return <ProjectPage key={id} projectId={id} />;
}
