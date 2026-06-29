import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createPlainTextExcerpt } from '@/lib/text';
import { COMMUNITY_PROJECT_ID, getProjectPath } from '@/lib/projectRoutes';
import { getProjectServer } from '@/lib/projects/getProjectsServer';
import { SITE_URL } from '@/lib/siteConfig';
import ProjectPage from '@/page/project/ProjectPage';

interface ProjectRouteParams {
  params: Promise<{ id: string }>;
}

const FALLBACK_DESCRIPTION = 'A portfolio project with project context, stack, links, and implementation notes.';

export async function generateMetadata({ params }: ProjectRouteParams): Promise<Metadata> {
  const { id } = await params;
  const project = await getProjectServer(id);

  if (!project) {
    return {
      title: 'Project Case Study',
      description: FALLBACK_DESCRIPTION,
      robots: { index: false },
    };
  }

  const description = createPlainTextExcerpt(project.description, 160) || FALLBACK_DESCRIPTION;
  const canonicalPath = getProjectPath(project.id);
  const title = project.title || 'Project';

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: 'article',
      title,
      description,
      url: canonicalPath,
      ...(project.thumbImage ? { images: [project.thumbImage] } : {}),
    },
    twitter: {
      card: project.thumbImage ? 'summary_large_image' : 'summary',
      title,
      description,
    },
  };
}

export default async function ProjectRoute({ params }: ProjectRouteParams) {
  const { id } = await params;
  const project = await getProjectServer(id);

  if (!project) notFound();

  const canonicalPath = getProjectPath(project.id);
  const description = createPlainTextExcerpt(project.description, 220) || FALLBACK_DESCRIPTION;
  const projectUrl = `${SITE_URL}${canonicalPath}`;
  const keywords = [
    ...project.categories,
    ...project.technologies.map((technology) =>
      typeof technology === 'string' ? technology : technology.name,
    ),
  ].filter(Boolean);
  const projectJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': `${projectUrl}#creativework`,
    name: project.title,
    description,
    url: projectUrl,
    ...(project.thumbImage ? { image: project.thumbImage } : {}),
    ...(project.date ? { dateCreated: project.date } : {}),
    ...(project.client ? { sourceOrganization: { '@type': 'Organization', name: project.client } } : {}),
    author: { '@id': `${SITE_URL}/#person` },
    isPartOf: { '@type': 'WebSite', name: 'Yudai Yaguchi Portfolio', url: SITE_URL },
    ...(project.id === COMMUNITY_PROJECT_ID
      ? {
          about: [
            { '@type': 'Organization', name: 'Bay Area AI Study Group', url: 'https://bayarea-ai.com' },
            { '@type': 'Organization', name: 'JTPA', url: 'https://jtpa.org' },
          ],
        }
      : {}),
    ...(keywords.length > 0 ? { keywords: keywords.join(', ') } : {}),
  };

  return (
    <>
      <ProjectPage key={id} projectId={id} initialProject={project} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(projectJsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
