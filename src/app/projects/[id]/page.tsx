import type { Metadata } from 'next';
import { PROJECTS_COLLECTION } from '@/app/api/constants';
import { getFirestore } from '@/lib/firebase-admin';
import { createPlainTextExcerpt } from '@/lib/text';
import ProjectPage from '@/page/project/ProjectPage';

interface ProjectMetadataData {
  title: string;
  description: string;
  thumbImage?: string;
}

interface ProjectRouteParams {
  params: Promise<{ id: string }>;
}

const FALLBACK_DESCRIPTION = 'A portfolio project case study with project context, stack, links, and implementation notes.';

async function getProjectMetadataData(id: string): Promise<ProjectMetadataData | null> {
  try {
    const doc = await getFirestore().collection(PROJECTS_COLLECTION).doc(id).get();
    if (!doc.exists) return null;

    const data = doc.data() ?? {};
    const title = typeof data.title === 'string' && data.title.trim()
      ? data.title
      : 'Project Case Study';

    return {
      title,
      description: typeof data.description === 'string' ? data.description : '',
      thumbImage: typeof data.thumbImage === 'string' ? data.thumbImage : undefined,
    };
  } catch (error) {
    console.error('[projects] generateMetadata fetch failed:', error);
    return null;
  }
}

export async function generateMetadata({ params }: ProjectRouteParams): Promise<Metadata> {
  const { id } = await params;
  const project = await getProjectMetadataData(id);

  if (!project) {
    return {
      title: 'Project Case Study',
      description: FALLBACK_DESCRIPTION,
      robots: { index: false },
    };
  }

  const description = createPlainTextExcerpt(project.description, 160) || FALLBACK_DESCRIPTION;
  const canonicalPath = `/projects/${encodeURIComponent(id)}`;

  return {
    title: project.title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: 'article',
      title: project.title,
      description,
      url: canonicalPath,
      ...(project.thumbImage ? { images: [project.thumbImage] } : {}),
    },
    twitter: {
      card: project.thumbImage ? 'summary_large_image' : 'summary',
      title: project.title,
      description,
    },
  };
}

export default async function ProjectRoute({ params }: ProjectRouteParams) {
  const { id } = await params;

  return <ProjectPage key={id} projectId={id} />;
}
